"""Signed, durable webhook events for optional automation services (n8n and others).

Contract (CRM EXT-01/02): an event row is written in the producer's transaction and
sent after commit. Its payload is built as the connection's user right before the
first attempt, using the same read policy as that user's API, then frozen so every
retry sends identical bytes. Signatures follow Standard Webhooks
(webhook-id / webhook-timestamp / webhook-signature: v1,<base64 HMAC-SHA256>).
Delivery is at-least-once; receivers deduplicate on webhook-id. A connection that
is disabled, deleted or unreachable never blocks the CRM work that produced the event.
"""

import base64
import hashlib
import hmac
import ipaddress
import json
import secrets
import socket
import time
from contextlib import contextmanager
from datetime import timedelta
from urllib.parse import urlparse

import frappe
import requests
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime

INTEGRATION = "CRM Integration"
DELIVERY = "CRM Integration Delivery"
API_VERSION = 1
TIMEOUT_SECONDS = 10
LEASE_SECONDS = 60
# Seconds to wait after attempt N fails (N = index + 1); the last failure is final.
BACKOFF = (30, 120, 600, 1800, 7200, 21600, 43200)
MAX_ATTEMPTS = len(BACKOFF) + 1
MAX_PAYLOAD_BYTES = 256 * 1024
KEEP_DELIVERED_DAYS = 30
KEEP_FAILED_DAYS = 90
_CACHE_KEY = "crm_integration_subscribers"

# Event → (record type it describes, short description shown in docs and whoami).
EVENTS = {
	"conversation.created": ("CRM Conversation", "A customer conversation was opened."),
	"conversation.status_changed": (
		"CRM Conversation",
		"Control changed: Human, Bot, Paused or Closed (take, release, close, reopen, hand off).",
	),
	"conversation.updated": (
		"CRM Conversation",
		"Owner, team, linked records or automation state changed without a control change.",
	),
	"conversation.note_created": (
		"CRM Conversation Note",
		"A teammate wrote a private note on a conversation (never shown to the customer).",
	),
	"conversation.rated": ("CRM Conversation Rating", "The customer rated a closed conversation."),
	"conversation.reply_overdue": (
		"CRM Conversation",
		"A customer has waited longer than the inbox reply goal (once per wait).",
	),
	"message.created": ("Message", "A customer message arrived or a reply was recorded."),
	"message.updated": ("Message", "A message's delivery status changed (sent, delivered, read, failed)."),
	"outbound.updated": ("CRM Outbound Intent", "A queued reply moved state (accepted, failed, unknown)."),
	"contact.created": ("Contact", "A contact was created."),
	"contact.updated": ("Contact", "A contact was changed."),
	"lead.created": ("CRM Lead", "A lead was created."),
	"lead.updated": ("CRM Lead", "A lead was changed."),
	"lead.status_changed": ("CRM Lead", "A lead's status changed."),
	"deal.created": ("CRM Deal", "A deal was created."),
	"deal.updated": ("CRM Deal", "A deal was changed."),
	"deal.status_changed": ("CRM Deal", "A deal's stage changed."),
	"inquiry.created": ("CRM Inquiry", "A new inquiry was captured."),
	"assistant.message_created": (
		"Books Chat Log",
		"The business assistant wrote in the connection user's own assistant chat.",
	),
	"assistant.decision_pending": (
		"Books Chat Log",
		"The business assistant is waiting for the connection user's decision (buttons).",
	),
}
TEST_EVENT = "ping"
ANY_RECORD = "Any record type"


def _document_events():
	from crm.integrations.documents import EVENTS as DOCUMENT_EVENTS

	return DOCUMENT_EVENTS


def known(event):
	return event in EVENTS or event in _document_events()


class Skip(Exception):
	"""The connection's user may not see this record now; nothing is sent."""


def catalog():
	"""Every event; document.* rows also need the record type they are about.
	`description` stays English for clients; `label` is in the caller's language."""
	return [
		{"event": event, "record": record, "description": text, "label": _(text)}
		for event, (record, text) in EVENTS.items()
	] + [
		{
			"event": event,
			"record": ANY_RECORD,
			"description": text,
			"label": _(text),
			"needs_document_type": True,
		}
		for event, text in _document_events().items()
	]


# ---------------------------------------------------------------- configuration


def new_secret():
	return "whsec_" + base64.b64encode(secrets.token_bytes(32)).decode()


def _allowed_hosts():
	hosts = frappe.conf.get("crm_integration_allowed_hosts") or []
	if isinstance(hosts, str):
		hosts = [hosts]
	return {str(h).strip().lower() for h in hosts if str(h).strip()}


def validate_url(url):
	"""Reject anything but https to a public host, unless the site lists the host explicitly."""
	parsed = urlparse(url or "")
	host = (parsed.hostname or "").lower()
	if parsed.scheme not in ("http", "https") or not host or parsed.username or parsed.password:
		frappe.throw(_("Enter the full webhook URL, for example https://n8n.example.com/webhook/…"))
	allowed = host in _allowed_hosts()
	if parsed.scheme != "https" and not allowed:
		frappe.throw(
			_(
				"Use an https:// webhook URL. For an n8n on your own network, ask support to allow its address."
			)
		)
	return parsed


def _resolve(host, port):
	"""One validated IP to connect to (pinned, so DNS cannot be rebound between check and connect)."""
	try:
		infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
	except socket.gaierror:
		raise DeliveryError(f"The host {host} could not be found.") from None
	ips = [info[4][0] for info in infos]
	if not ips:
		raise DeliveryError(f"The host {host} could not be found.")
	if host not in _allowed_hosts():
		for ip in ips:
			if not ipaddress.ip_address(ip).is_global:
				raise DeliveryError(f"{host} points to a private address. Ask support to allow it.")
	return ips[0]


def enable_blocker(doc):
	"""Why this connection cannot be enabled, in words an admin can act on; None when it can."""
	if not doc.webhook_url and not doc.api_channel:
		return _("Add the webhook URL from your n8n Webhook node first.")
	if doc.webhook_url and not doc.subscriptions and not doc.api_channel:
		return _("Choose at least one event to send.")
	if not doc.integration_user or not frappe.db.get_value("User", doc.integration_user, "enabled"):
		return _("Choose an enabled user for «Acts as user».")
	if doc.integration_user in ("Administrator", "Guest"):
		return _("Create a dedicated user for this connection instead of {0}.").format(doc.integration_user)
	return None


def clear_subscriber_cache():
	frappe.cache.delete_value(_CACHE_KEY)


def _key(event, doctype=None):
	return f"{event}|{doctype}" if event in _document_events() else event


def _subscribers():
	"""{event (document.*: "event|record type"): [connection names]} for enabled
	connections, cached until a connection changes."""
	cached = frappe.cache.get_value(_CACHE_KEY)
	if cached is not None:
		return cached
	out = {}
	if frappe.db.table_exists(INTEGRATION) and frappe.db.table_exists("CRM Integration Subscription"):
		typed = frappe.db.has_column("CRM Integration Subscription", "document_type")
		rows = frappe.db.sql(
			"""SELECT i.name, s.event, s.document_type FROM `tabCRM Integration` i
            JOIN `tabCRM Integration Subscription` s ON s.parent=i.name AND s.parenttype='CRM Integration'
            WHERE i.enabled=1 AND COALESCE(i.webhook_url,'')<>''"""
			if typed
			else """SELECT i.name, s.event, NULL AS document_type FROM `tabCRM Integration` i
            JOIN `tabCRM Integration Subscription` s ON s.parent=i.name AND s.parenttype='CRM Integration'
            WHERE i.enabled=1 AND COALESCE(i.webhook_url,'')<>''""",
			as_dict=True,
		)
		for row in rows:
			out.setdefault(_key(row.event, row.document_type), []).append(row.name)
	frappe.cache.set_value(_CACHE_KEY, out)
	return out


def document_types():
	"""Record types some enabled connection wants document.* events for (none while
	installing or migrating, when every record save passes through here)."""
	if _quiet():
		return set()
	return {key.split("|", 1)[1] for key in _subscribers() if "|" in key}


# ---------------------------------------------------------------- emission


def _quiet():
	flags = frappe.flags
	return bool(
		flags.in_install
		or flags.in_migrate
		or flags.in_patch
		or flags.in_import
		or flags.in_uninstall
		or flags.get("crm_integration_quiet")
	)


def emit(
	event,
	doctype,
	name,
	*,
	version=None,
	context=None,
	to=None,
	user=None,
	actor=None,
	readable_doc=None,
):
	"""Queue `event` about (doctype, name) for every subscribed connection.

	`to` names connections that receive it whether or not they subscribed (an inbox
	channel always receives its own replies); they must still be enabled with a URL.
	`user` keeps only connections acting as that user (a private assistant chat).
	`actor` is who made the change: a connection acting as that user that skips its
	own changes does not hear of it. `readable_doc` keeps only connections whose user
	may read that record now (a deletion, whose payload cannot be checked later).
	`version` deduplicates repeats of the same change (a hook firing twice). Never
	raises into the producer: an automation outage must not stop CRM work.
	"""
	if not known(event) or _quiet():
		return []
	try:
		targets = list(_subscribers().get(_key(event, doctype)) or [])
		for name_ in to or []:
			if name_ not in targets and frappe.db.get_value(
				INTEGRATION, {"name": name_, "enabled": 1, "webhook_url": ["is", "set"]}, "name"
			):
				targets.append(name_)
		if user:
			targets = [t for t in targets if frappe.db.get_value(INTEGRATION, t, "integration_user") == user]
		if actor or readable_doc is not None:
			targets = [t for t in targets if _hears(t, actor, readable_doc)]
		created = []
		for integration in targets:
			key = hashlib.sha256(
				json.dumps([integration, event, doctype, name, str(version or "")], default=str).encode()
			).hexdigest()
			if version is not None and frappe.db.exists(DELIVERY, {"event_key": key}):
				continue
			if version is None:
				key = hashlib.sha256((key + frappe.generate_hash(length=16)).encode()).hexdigest()
			doc = frappe.get_doc(
				{
					"doctype": DELIVERY,
					"integration": integration,
					"event": event,
					"event_key": key,
					"reference_doctype": doctype,
					"reference_name": name,
					"status": "Pending",
					"next_attempt_at": now_datetime(),
					"context_json": json.dumps(context or {}, default=str),
				}
			)
			doc.flags.crm_integration_engine = True
			doc.flags.ignore_links = True
			doc.insert(ignore_permissions=True)
			created.append(doc.name)
		if created:
			frappe.db.after_commit.add(lambda: _enqueue(created))
		return created
	except Exception:
		frappe.log_error(title=f"CRM integration event {event} not queued", message=frappe.get_traceback())
		return []


def _hears(integration, actor, readable_doc):
	row = (
		frappe.db.get_value(INTEGRATION, integration, ["integration_user", "skip_own_changes"], as_dict=True)
		or frappe._dict()
	)
	if actor and row.skip_own_changes and row.integration_user == actor:
		return False
	if readable_doc is not None:
		return bool(
			row.integration_user
			and frappe.has_permission(
				readable_doc.doctype, "read", doc=readable_doc, user=row.integration_user
			)
		)
	return True


def _enqueue(names):
	for name in names:
		try:
			frappe.enqueue(
				"crm.integrations.webhooks.deliver",
				delivery=name,
				queue="short",
				timeout=60,
				job_id="crm-integration-" + name,
				deduplicate=True,
			)
		except Exception:
			# The committed row is the queue; the sweep picks it up.
			pass


# ---------------------------------------------------------------- payloads


@contextmanager
def as_user(user):
	previous = frappe.session.user
	frappe.set_user(user)  # nosemgrep: frappe-setuser -- payload built as the connection user
	try:
		yield
	finally:
		frappe.set_user(previous)  # nosemgrep: frappe-setuser -- restore the worker's user


def _builder(event):
	from crm.integrations import events

	return events.BUILDERS.get(event.split(".", 1)[0])


def build_payload(delivery, integration):
	"""The exact body for this delivery, built as the connection's user."""
	context = json.loads(delivery.context_json or "{}")
	if delivery.event == TEST_EVENT:
		data = {"message": context.get("message") or "Test event from CRM.", "connection": integration.name}
	else:
		builder = _builder(delivery.event)
		if not builder:
			raise Skip("No payload builder for this event.")
		with as_user(integration.integration_user):
			data = builder(delivery.event, delivery.reference_doctype, delivery.reference_name, context)
	body = {
		"id": delivery.name,
		"type": delivery.event,
		"api_version": API_VERSION,
		"timestamp": str(delivery.creation),
		"site": frappe.local.site,
		"connection": integration.name,
		"data": data,
	}
	raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"), default=str)
	if len(raw.encode()) > MAX_PAYLOAD_BYTES:
		raise Skip("Payload is larger than 256 KiB.")
	return raw


def sign(secret, msg_id, timestamp, body):
	key = base64.b64decode(secret.removeprefix("whsec_"))
	content = f"{msg_id}.{timestamp}.{body}".encode()
	return "v1," + base64.b64encode(hmac.new(key, content, hashlib.sha256).digest()).decode()


# ---------------------------------------------------------------- delivery


class DeliveryError(Exception):
	pass


def _post(url, body, headers):
	parsed = validate_url(url)
	port = parsed.port or (443 if parsed.scheme == "https" else 80)
	ip = _resolve(parsed.hostname.lower(), port)
	from crm.integrations.api import _PinnedIPAdapter

	session = requests.Session()
	session.mount(f"{parsed.scheme}://", _PinnedIPAdapter(ip, parsed.hostname))
	try:
		return session.post(
			url, data=body.encode(), headers=headers, timeout=TIMEOUT_SECONDS, allow_redirects=False
		)
	except requests.Timeout:
		raise DeliveryError(f"No answer from the webhook within {TIMEOUT_SECONDS} seconds.") from None
	except requests.RequestException as e:
		raise DeliveryError(f"Could not reach the webhook: {type(e).__name__}.") from None
	finally:
		session.close()


def _set(name, **values):
	frappe.db.set_value(DELIVERY, name, values, update_modified=True)


def _health(integration, status, error="", failed=False):
	values = {
		"last_delivery_at": now_datetime(),
		"last_delivery_status": status,
		"last_error": (error or "")[:500],
	}
	failures = frappe.db.get_value(INTEGRATION, integration, "consecutive_failures") or 0
	values["consecutive_failures"] = failures + 1 if failed else 0
	frappe.db.set_value(INTEGRATION, integration, values, update_modified=False)


def _claim(name):
	"""Lease one due delivery; False when another worker holds it or it is not due."""
	row = frappe.db.sql(
		"""SELECT name,status,next_attempt_at,lease_until FROM `tabCRM Integration Delivery` WHERE name=%s FOR UPDATE""",
		(name,),
		as_dict=True,
	)
	if not row:
		return False
	row, now = row[0], now_datetime()
	if row.status == "Sending" and row.lease_until and get_datetime(row.lease_until) > now:
		return False
	if row.status not in ("Pending", "Failed", "Sending"):
		return False
	if row.status != "Sending" and row.next_attempt_at and get_datetime(row.next_attempt_at) > now:
		return False
	_set(name, status="Sending", lease_until=add_to_date(now, seconds=LEASE_SECONDS))
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
	return True


def deliver(delivery, *, force=False):
	"""Worker entry: send one delivery. Returns its final projection (used by «Send test event»)."""
	if not frappe.db.exists(DELIVERY, delivery):
		return None
	if not force and not _claim(delivery):
		return _projection(delivery)
	doc = frappe.get_doc(DELIVERY, delivery)
	integration = (
		frappe.get_doc(INTEGRATION, doc.integration)
		if frappe.db.exists(INTEGRATION, doc.integration)
		else None
	)
	if not integration or (not integration.enabled and doc.event != TEST_EVENT):
		_set(
			delivery,
			status="Skipped",
			last_error="The connection is disabled or was removed.",
			lease_until=None,
		)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
		return _projection(delivery)
	if not frappe.db.get_value("User", integration.integration_user, "enabled"):
		_set(delivery, status="Skipped", last_error="The connection's user is disabled.", lease_until=None)
		_health(integration.name, "Skipped", "The connection's user is disabled.", failed=True)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
		return _projection(delivery)
	body = doc.payload
	if not body:
		try:
			body = build_payload(doc, integration)
		except Skip as e:
			_set(delivery, status="Skipped", last_error=str(e)[:500], lease_until=None)
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
			return _projection(delivery)
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"CRM integration payload {delivery}", message=frappe.get_traceback())
			return _fail(doc, integration, "The event could not be prepared; support has the error log.")
		_set(delivery, payload=body)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
	timestamp = str(int(time.time()))
	headers = {
		"Content-Type": "application/json",
		"User-Agent": "Muelle-CRM-Webhooks/1",
		"webhook-id": doc.name,
		"webhook-timestamp": timestamp,
		"webhook-signature": sign(integration.get_password("signing_secret"), doc.name, timestamp, body),
		"X-Muelle-Event": doc.event,
	}
	started = time.monotonic()
	try:
		response = _post(integration.webhook_url, body, headers)
	except DeliveryError as e:
		return _fail(doc, integration, str(e))
	except frappe.ValidationError as e:
		return _fail(doc, integration, str(e), final=True)
	elapsed = int((time.monotonic() - started) * 1000)
	if 200 <= response.status_code < 300:
		_set(
			delivery,
			status="Delivered",
			attempts=(doc.attempts or 0) + 1,
			delivered_at=now_datetime(),
			response_code=response.status_code,
			last_error="",
			lease_until=None,
		)
		_health(integration.name, f"Delivered ({response.status_code}, {elapsed} ms)")
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
		return _projection(delivery)
	snippet = (response.text or "")[:200].replace("\n", " ")
	final = response.status_code == 410  # Standard Webhooks: the receiver no longer wants these
	return _fail(
		doc,
		integration,
		f"HTTP {response.status_code} {snippet}".strip(),
		code=response.status_code,
		final=final,
	)


def _fail(doc, integration, error, *, code=None, final=False):
	attempts = (doc.attempts or 0) + 1
	dead = final or attempts >= MAX_ATTEMPTS or doc.event == TEST_EVENT
	# response_code is an Int column (NOT NULL): 0 records that no HTTP answer came back.
	values = {
		"attempts": attempts,
		"last_error": error[:500],
		"response_code": code or 0,
		"lease_until": None,
	}
	if dead:
		values["status"] = "Dead"
	else:
		values.update(
			status="Failed", next_attempt_at=add_to_date(now_datetime(), seconds=BACKOFF[attempts - 1])
		)
	_set(doc.name, **values)
	_health(integration.name, "Dead" if dead else "Retrying", error, failed=True)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
	return _projection(doc.name)


def _projection(name):
	row = frappe.db.get_value(
		DELIVERY,
		name,
		[
			"name",
			"integration",
			"event",
			"status",
			"attempts",
			"response_code",
			"last_error",
			"next_attempt_at",
			"delivered_at",
		],
		as_dict=True,
	)
	return row


# ---------------------------------------------------------------- scheduler


def recover():
	"""Every minute: deliver due retries, lost enqueues and expired leases."""
	if not frappe.db.table_exists(DELIVERY) or frappe.conf.get("maintenance_mode"):
		return
	now = now_datetime()
	rows = frappe.db.sql(
		"""SELECT name FROM `tabCRM Integration Delivery`
        WHERE (status='Pending' AND creation<=%s)
           OR (status='Failed' AND next_attempt_at<=%s)
           OR (status='Sending' AND lease_until<=%s)
        ORDER BY creation LIMIT 200""",
		(now - timedelta(seconds=30), now, now),
	)
	_enqueue([r[0] for r in rows])


def purge():
	"""Daily: keep delivered history 30 days and failures 90 days."""
	if not frappe.db.table_exists(DELIVERY):
		return
	now = now_datetime()
	frappe.db.sql(
		"DELETE FROM `tabCRM Integration Delivery` WHERE status IN ('Delivered','Skipped') AND modified<%s",
		(now - timedelta(days=KEEP_DELIVERED_DAYS),),
	)
	frappe.db.sql(
		"DELETE FROM `tabCRM Integration Delivery` WHERE status='Dead' AND modified<%s",
		(now - timedelta(days=KEEP_FAILED_DAYS),),
	)
