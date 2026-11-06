"""Signed, durable webhook events for optional automation services (n8n and others).

Contract (CRM EXT-01/02): an event row is written in the producer's transaction and
sent after commit. Its payload is built as the connection's user right before the
first attempt, using the same read policy as that user's API, then frozen so every
retry sends identical bytes. Signatures follow Standard Webhooks
(webhook-id / webhook-timestamp / webhook-signature: v1,<base64 HMAC-SHA256>).
Delivery is at-least-once; receivers deduplicate on webhook-id. A connection that
is disabled, deleted or unreachable never blocks the CRM work that produced the event.

Cost: what enabled connections listen to is kept in each process (client cache) until a
connection changes, so a save nobody listens to costs a dict lookup. Event rows are one
multi-row INSERT; after commit, one worker job per connection sends its rows in order
over one kept-alive connection to the receiver, and writes the connection's health once.
"""

import base64
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
import socket
import time
from collections import namedtuple
from contextlib import contextmanager
from datetime import timedelta, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import frappe
import requests
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils import add_to_date, get_datetime, get_system_timezone, now_datetime

INTEGRATION = "CRM Integration"
DELIVERY = "CRM Integration Delivery"
SUBSCRIPTION = "CRM Integration Subscription"
API_VERSION = 1
TIMEOUT_SECONDS = 10
LEASE_SECONDS = 60
# Seconds to wait after attempt N fails (N = index + 1); the last failure is final.
BACKOFF = (30, 120, 600, 1800, 7200, 21600, 43200)
MAX_ATTEMPTS = len(BACKOFF) + 1
MAX_PAYLOAD_BYTES = 256 * 1024
MAX_ANSWER_BYTES = 1024
# After a rotation the old secret also signs for this long, so receivers can switch without losing events.
ROTATION_GRACE_HOURS = 24
KEEP_DELIVERED_DAYS = 30
KEEP_FAILED_DAYS = 90
# A delivered body is only needed while someone may look into it; the row stays for its history.
KEEP_DELIVERED_BODY_DAYS = 3
# One worker job sends at most this many deliveries of one connection, for at most this long.
BATCH_SIZE = 50
BATCH_SECONDS = 120
JOB_TIMEOUT = 300
_CACHE_KEY = "crm_integration_routes"
_INSERT_COLUMNS = (
	"name",
	"creation",
	"modified",
	"owner",
	"modified_by",
	"integration",
	"event",
	"event_key",
	"reference_doctype",
	"reference_name",
	"status",
	"next_attempt_at",
	"context_json",
)

# Event → (record type it describes, short description shown in docs and whoami).
EVENTS = {
	"conversation.created": ("CRM Conversation", "A customer conversation was opened."),
	"conversation.status_changed": (
		"CRM Conversation",
		"Control or owner changed: Human, Bot, Paused or Closed, or a new owner (take, transfer, release, pause, close, reopen, hand off).",
	),
	"conversation.updated": (
		"CRM Conversation",
		"Team, labels, snooze, linked records or automation state changed, or someone asked the owner for the conversation.",
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
# document.* events (crm.integrations.documents): any record type, chosen on the subscription row.
DOCUMENT_EVENTS = {
	"document.created": "A record of the chosen type was created.",
	"document.updated": "A record of the chosen type was changed.",
	"document.submitted": "A record of the chosen type was submitted (invoices, orders, payments…).",
	"document.cancelled": "A submitted record of the chosen type was cancelled.",
	"document.deleted": "A record of the chosen type was deleted.",
}
TEST_EVENT = "ping"
ANY_RECORD = "Any record type"


def known(event):
	return event in EVENTS or event in DOCUMENT_EVENTS


# Update events whose sender diffs the record, so a subscription can wait for chosen fields.
WATCHABLE = frozenset({"contact.updated", "lead.updated", "deal.updated", "document.updated"})


def watches_fields(event):
	"""The event can wait for chosen fields («Only when these fields change»)."""
	return event in WATCHABLE


def field_list(value):
	"""The field names a subscription row waits for, from «a, b» or one per line; None: any change."""
	return frozenset(part for part in re.split(r"[\s,]+", value or "") if part) or None


class Skip(Exception):
	"""The connection's user may not see this record now; nothing is sent."""


def catalog():
	"""Every event; document.* rows also need the record type they are about.
	`description` stays English for clients; `label` is in the caller's language."""
	rows = [
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
		for event, text in DOCUMENT_EVENTS.items()
	]
	for row in rows:
		if row["event"] in WATCHABLE:
			row["watches_fields"] = True
	return rows


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
		raise DeliveryError(_("The host {0} could not be found.").format(host)) from None
	ips = [info[4][0] for info in infos]
	if not ips:
		raise DeliveryError(_("The host {0} could not be found.").format(host))
	if host not in _allowed_hosts():
		for ip in ips:
			if not ipaddress.ip_address(ip).is_global:
				raise DeliveryError(
					_("{0} points to a private address. Ask support to allow it.").format(host)
				)
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
	frappe.client_cache.delete_value(_CACHE_KEY)


def _key(event, doctype=None):
	return f"{event}|{doctype}" if event in DOCUMENT_EVENTS else event


def _routes():
	"""What enabled connections with a webhook URL listen to, kept in each process until a
	connection changes (its form clears it):

	- routes: {event (document.*: "event|record type"): ((connection, watched fields or None), …)}
	- connections: {connection: (acts-as user, skips its own changes)}
	- types: record types some connection wants document.* events for
	"""
	return frappe.client_cache.get_value(_CACHE_KEY, generator=_load_routes)


def _load_routes():
	routes, connections = {}, {}
	if frappe.db.table_exists(INTEGRATION) and frappe.db.table_exists(SUBSCRIPTION):
		# columns added after the first release: a process may run new code before the migrate
		optional = ", ".join(
			f"s.{column}" if frappe.db.has_column(SUBSCRIPTION, column) else f"NULL AS {column}"
			for column in ("document_type", "only_fields")
		)
		rows = frappe.db.sql(
			f"""SELECT i.name, i.integration_user, i.skip_own_changes, s.event, {optional}
            FROM `tabCRM Integration` i
            LEFT JOIN `tabCRM Integration Subscription` s ON s.parent=i.name AND s.parenttype='CRM Integration'
            WHERE i.enabled=1 AND COALESCE(i.webhook_url,'')<>''""",
			as_dict=True,
		)
		for row in rows:
			connections[row.name] = (row.integration_user, bool(row.skip_own_changes))
			if row.event:
				watched = field_list(row.only_fields) if watches_fields(row.event) else None
				routes.setdefault(_key(row.event, row.document_type), []).append((row.name, watched))
	return {
		"routes": {key: tuple(rows) for key, rows in routes.items()},
		"connections": connections,
		"types": frozenset(key.split("|", 1)[1] for key in routes if "|" in key),
	}


def wants(event, doctype=None):
	"""Whether some enabled connection listens to this event (on this record type). Producers
	ask first, so a change nobody listens to costs no diff, no query and no row."""
	return not _quiet() and _key(event, doctype) in _routes()["routes"]


def watched(event, doctype=None):
	"""The fields worth comparing for an update event: None while some connection hears every
	change, else the fields its connections wait for."""
	fields = set()
	for _connection, only in _routes()["routes"].get(_key(event, doctype)) or ():
		if not only:
			return None
		fields |= only
	return frozenset(fields)


def document_types():
	"""Record types some enabled connection wants document.* events for (none while
	installing or migrating, when every record save passes through here)."""
	if _quiet():
		return frozenset()
	return _routes()["types"]


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
	changed=None,
):
	"""Queue `event` about (doctype, name) for every subscribed connection.

	`to` names connections that receive it whether or not they subscribed (an inbox
	channel always receives its own replies); they must still be enabled with a URL.
	`user` keeps only connections acting as that user (a private assistant chat).
	`actor` is who made the change: a connection acting as that user that skips its
	own changes does not hear of it. `readable_doc` keeps only connections whose user
	may read that record now (a deletion, whose payload cannot be checked later).
	`changed` lists the fields an update changed: a subscription that waits for chosen
	fields hears it only when one of them is among them. `version` deduplicates repeats
	of the same change (a hook firing twice). Never raises into the producer: an
	automation outage must not stop CRM work.
	"""
	if not known(event) or _quiet():
		return []
	try:
		routes = _routes()
		connections = routes["connections"]
		changed = set(changed) if changed is not None else None
		targets = [
			connection
			for connection, only in routes["routes"].get(_key(event, doctype)) or ()
			if not (only and changed is not None and not only & changed)
		]
		targets += [t for t in dict.fromkeys(to or ()) if t in connections and t not in targets]
		if user:
			targets = [t for t in targets if connections[t][0] == user]
		if actor:
			targets = [t for t in targets if not (connections[t][1] and connections[t][0] == actor)]
		if readable_doc is not None:
			targets = [
				t
				for t in targets
				if connections[t][0]
				and frappe.has_permission(
					readable_doc.doctype, "read", doc=readable_doc, user=connections[t][0]
				)
			]
		if not targets:
			return []
		keys = {
			integration: hashlib.sha256(
				json.dumps([integration, event, doctype, name, str(version or "")], default=str).encode()
			).hexdigest()
			for integration in targets
		}
		if version is not None:
			seen = set(
				frappe.get_all(
					DELIVERY, filters={"event_key": ["in", list(keys.values())]}, pluck="event_key"
				)
			)
			keys = {integration: key for integration, key in keys.items() if key not in seen}
		else:
			keys = {
				integration: hashlib.sha256((key + frappe.generate_hash(length=16)).encode()).hexdigest()
				for integration, key in keys.items()
			}
		if not keys:
			return []
		now, by = now_datetime(), frappe.session.user
		context_json = json.dumps(context or {}, default=str)

		def rows():
			return [
				(
					make_autoname("hash"),
					now,
					now,
					by,
					by,
					integration,
					event,
					key,
					doctype,
					name,
					"Pending",
					now,
					context_json,
				)
				for integration, key in keys.items()
			]

		# the engine is the only writer of this log: one INSERT, no document hooks or realtime
		values = rows()
		try:
			frappe.db.bulk_insert(DELIVERY, _INSERT_COLUMNS, values)
		except Exception as e:
			if not frappe.db.is_primary_key_violation(e):
				raise
			values = rows()  # a random name collided: draw new ones once, as Document.insert does
			frappe.db.bulk_insert(DELIVERY, _INSERT_COLUMNS, values)
		for row in values:
			_send_after_commit(row[5], row[0])
		return [row[0] for row in values]
	except Exception:
		frappe.log_error(title=f"CRM integration event {event} not queued", message=frappe.get_traceback())
		return []


def _send_after_commit(integration, delivery):
	"""Collect this transaction's deliveries, so its commit starts one job per connection."""
	pending = getattr(frappe.local, "crm_integration_pending", None)
	if pending is None:
		pending = frappe.local.crm_integration_pending = {}
		frappe.db.after_commit.add(_flush_pending)
		frappe.db.after_rollback.add(_drop_pending)
	pending.setdefault(integration, []).append(delivery)


def _flush_pending():
	pending = getattr(frappe.local, "crm_integration_pending", None) or {}
	frappe.local.crm_integration_pending = None
	_enqueue(pending)


def _drop_pending():
	frappe.local.crm_integration_pending = None


def _enqueue(batches, *, sweep=False):
	"""One worker job per connection and BATCH_SIZE deliveries ({connection: [delivery, …]}).

	A sweep names its jobs by connection and position, so while one is still queued or
	running the next minute's sweep does not queue the same work again."""
	for integration, names in batches.items():
		for start in range(0, len(names), BATCH_SIZE):
			chunk = list(names[start : start + BATCH_SIZE])
			if sweep:
				job = f"sweep-{hashlib.sha256(integration.encode()).hexdigest()[:16]}-{start // BATCH_SIZE}"
			else:
				job = hashlib.sha256("|".join(chunk).encode()).hexdigest()[:32]
			try:
				frappe.enqueue(
					"crm.integrations.webhooks.deliver_batch",
					deliveries=chunk,
					queue="short",
					timeout=JOB_TIMEOUT,
					job_id="crm-integration-" + job,
					deduplicate=True,
				)
			except Exception:
				# The committed rows are the queue; the sweep picks them up.
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


def utc_iso(value):
	"""A stored (site-local, naive) datetime as ISO 8601 UTC, e.g. 2026-11-03T20:00:00Z."""
	local = get_datetime(value).replace(tzinfo=ZoneInfo(get_system_timezone()))
	return local.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def build_payload(delivery, integration):
	"""The exact body for this delivery, built as the connection's user."""
	context = json.loads(delivery.context_json or "{}")
	if delivery.event == TEST_EVENT:
		data = {"message": context.get("message") or "Test event from CRM.", "connection": integration.name}
	else:
		builder = _builder(delivery.event)
		if not builder:
			raise Skip(_("This event cannot be sent yet."))
		with as_user(integration.integration_user):
			data = builder(delivery.event, delivery.reference_doctype, delivery.reference_name, context)
	body = {
		"id": delivery.name,
		"type": delivery.event,
		"api_version": API_VERSION,
		"timestamp": utc_iso(delivery.creation),
		"site": frappe.local.site,
		"connection": integration.name,
		"data": data,
	}
	raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"), default=str)
	if len(raw.encode()) > MAX_PAYLOAD_BYTES:
		raise Skip(_("The event is larger than 256 KiB."))
	return raw


def sign(secret, msg_id, timestamp, body):
	key = base64.b64decode(secret.removeprefix("whsec_"))
	content = f"{msg_id}.{timestamp}.{body}".encode()
	return "v1," + base64.b64encode(hmac.new(key, content, hashlib.sha256).digest()).decode()


def signatures(integration, msg_id, timestamp, body, secrets=None):
	"""The webhook-signature header: the current secret's, plus the previous one's while a
	rotation's grace window is open (Standard Webhooks allows several, space-separated)."""
	return " ".join(
		sign(secret, msg_id, timestamp, body) for secret in secrets or signing_secrets(integration)
	)


def signing_secrets(integration):
	out = [integration.get_password("signing_secret")]
	until = integration.get("previous_secret_until")
	if until and get_datetime(until) > now_datetime():
		previous = integration.get_password("previous_signing_secret", raise_exception=False)
		if previous:
			out.append(previous)
	return out


# ---------------------------------------------------------------- delivery


class DeliveryError(Exception):
	pass


Answer = namedtuple("Answer", "status_code text")


class _Sessions:
	"""One HTTP session per receiver for the life of a worker job, pinned to the address that
	was checked when it opened, so consecutive deliveries reuse one TLS connection."""

	def __init__(self):
		self._open = {}

	def get(self, parsed):
		port = parsed.port or (443 if parsed.scheme == "https" else 80)
		key = (parsed.scheme, parsed.hostname.lower(), port)
		if key not in self._open:
			from crm.integrations.api import _PinnedIPAdapter

			ip = _resolve(key[1], port)
			session = requests.Session()
			session.mount(f"{parsed.scheme}://", _PinnedIPAdapter(ip, parsed.hostname))
			self._open[key] = session
		return self._open[key]

	def close(self):
		for session in self._open.values():
			session.close()
		self._open.clear()


def _post(url, body, headers, *, sessions=None):
	parsed = validate_url(url)
	own = sessions is None
	sessions = sessions or _Sessions()
	try:
		session = sessions.get(parsed)
		# stream, then read only the start: the answer is shown as an error snippet, and a receiver
		# that answers with an endless body must not fill the worker's memory
		with session.post(
			url,
			data=body.encode(),
			headers=headers,
			timeout=TIMEOUT_SECONDS,
			allow_redirects=False,
			stream=True,
		) as response:
			head = next(response.iter_content(MAX_ANSWER_BYTES), b"")
			if getattr(response.raw, "closed", False) and hasattr(response.raw, "release_conn"):
				# the whole answer was read: the connection stays open for the next delivery
				response.raw.release_conn()
			return Answer(response.status_code, head.decode("utf-8", "replace"))
	except requests.Timeout:
		raise DeliveryError(_("No answer within {0} seconds.").format(TIMEOUT_SECONDS)) from None
	except requests.RequestException as e:
		raise DeliveryError(_("Could not connect: {0}.").format(type(e).__name__)) from None
	finally:
		if own:
			sessions.close()


def _set(name, **values):
	frappe.db.set_value(DELIVERY, name, values, update_modified=True)


class _Courier:
	"""What the deliveries of one worker job share: each connection with its signing secrets and
	its user's state, read once; one HTTP session per receiver; and the connections' health,
	written once at the end instead of after every delivery."""

	def __init__(self):
		self.sessions = _Sessions()
		self.stopped = False  # the receiver cannot take more now: the minute sweep sends the rest
		self._connections, self._secrets, self._users, self._health = {}, {}, {}, {}

	def connection(self, name):
		if name not in self._connections:
			self._connections[name] = (
				frappe.get_doc(INTEGRATION, name) if frappe.db.exists(INTEGRATION, name) else None
			)
		return self._connections[name]

	def secrets(self, integration):
		if integration.name not in self._secrets:
			self._secrets[integration.name] = signing_secrets(integration)
		return self._secrets[integration.name]

	def user_enabled(self, user):
		if user not in self._users:
			self._users[user] = bool(user and frappe.db.get_value("User", user, "enabled"))
		return self._users[user]

	def note(self, integration, status, error="", failed=False):
		self._health.setdefault(integration, []).append((status, error, failed))

	def write_health(self):
		"""Last outcome per connection, and how many failures followed its last success."""
		for integration, outcomes in self._health.items():
			status, error, _failed = outcomes[-1]
			streak = 0
			for *_rest, failed in reversed(outcomes):
				if not failed:
					break
				streak += 1
			if streak == len(outcomes):  # nothing got through in this job: the stored streak goes on
				streak += frappe.db.get_value(INTEGRATION, integration, "consecutive_failures") or 0
			frappe.db.set_value(
				INTEGRATION,
				integration,
				{
					"last_delivery_at": now_datetime(),
					"last_delivery_status": status,
					"last_error": (error or "")[:500],
					"consecutive_failures": streak,
				},
				update_modified=False,
			)
		if self._health:
			self._health = {}
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- connection health, after the deliveries' own commits


def deliver(delivery, *, force=False):
	"""Send one delivery now. Returns its final projection (used by «Send test event»)."""
	courier = _Courier()
	try:
		_send(delivery, courier, force=force)
		courier.write_health()
	finally:
		courier.sessions.close()
	return _projection(delivery)


def deliver_batch(deliveries):
	"""Worker entry: send deliveries of one connection in order over one kept-alive connection.
	A receiver that does not answer, or answers 429 or 5xx, ends the job; the minute sweep sends
	the rest, so a down receiver costs one attempt per sweep instead of one per event."""
	courier = _Courier()
	started = time.monotonic()
	try:
		for name in deliveries:
			if courier.stopped or time.monotonic() - started > BATCH_SECONDS:
				break
			_send(name, courier)
		courier.write_health()
	finally:
		courier.sessions.close()


_CLAIM = """SELECT name, integration, event, status, next_attempt_at, lease_until, attempts, payload,
    context_json, reference_doctype, reference_name, creation
    FROM `tabCRM Integration Delivery` WHERE name=%s FOR UPDATE"""


def _due(row, now):
	if row.status == "Sending" and row.lease_until and get_datetime(row.lease_until) > now:
		return False  # another worker holds it
	if row.status not in ("Pending", "Failed", "Sending"):
		return False
	return row.status == "Sending" or not row.next_attempt_at or get_datetime(row.next_attempt_at) <= now


def _send(name, courier, *, force=False):
	"""Claim, prepare, sign and post one delivery. The claim (with the frozen body) is committed
	before the HTTP call and the outcome after it: two commits per delivery."""
	rows = frappe.db.sql(_CLAIM, (name,), as_dict=True)
	if not rows:
		return
	doc, now = rows[0], now_datetime()
	if not force and not _due(doc, now):
		return
	integration = courier.connection(doc.integration)
	if not integration or (not integration.enabled and doc.event != TEST_EVENT):
		_set(
			name,
			status="Skipped",
			last_error=_("The connection is disabled or was removed."),
			lease_until=None,
		)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
		return
	if not courier.user_enabled(integration.integration_user):
		reason = _("The connection's user is disabled.")
		_set(name, status="Skipped", last_error=reason, lease_until=None)
		courier.note(integration.name, _("Skipped"), reason, failed=True)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
		return
	claim = {"status": "Sending", "lease_until": add_to_date(now, seconds=LEASE_SECONDS)}
	body = doc.payload
	if not body:
		try:
			body = claim["payload"] = build_payload(doc, integration)
		except Skip as e:
			_set(name, status="Skipped", last_error=str(e)[:500], lease_until=None)
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
			return
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"CRM integration payload {name}", message=frappe.get_traceback())
			# the rollback let go of the row: take it again before recording the failure
			rows = frappe.db.sql(_CLAIM, (name,), as_dict=True)
			if rows and (force or _due(rows[0], now_datetime())):
				_fail(
					rows[0],
					integration,
					courier,
					_("The event could not be prepared; support has the error log."),
				)
			return
	_set(name, **claim)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
	timestamp = str(int(time.time()))
	headers = {
		"Content-Type": "application/json",
		"User-Agent": "Muelle-CRM-Webhooks/1",
		"webhook-id": doc.name,
		"webhook-timestamp": timestamp,
		"webhook-signature": signatures(integration, doc.name, timestamp, body, courier.secrets(integration)),
		"X-Muelle-Event": doc.event,
	}
	started = time.monotonic()
	try:
		response = _post(integration.webhook_url, body, headers, sessions=courier.sessions)
	except DeliveryError as e:
		courier.stopped = True
		_fail(doc, integration, courier, str(e))
		return
	except frappe.ValidationError as e:
		courier.stopped = True
		_fail(doc, integration, courier, str(e), final=True)
		return
	elapsed = int((time.monotonic() - started) * 1000)
	if 200 <= response.status_code < 300:
		_set(
			name,
			status="Delivered",
			attempts=(doc.attempts or 0) + 1,
			delivered_at=now_datetime(),
			response_code=response.status_code,
			last_error="",
			lease_until=None,
		)
		courier.note(integration.name, _("Delivered ({0}, {1} ms)").format(response.status_code, elapsed))
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call
		return
	if response.status_code == 429 or response.status_code >= 500:
		courier.stopped = True
	snippet = (response.text or "")[:200].replace("\n", " ")
	final = response.status_code == 410  # Standard Webhooks: the receiver no longer wants these
	_fail(
		doc,
		integration,
		courier,
		f"HTTP {response.status_code} {snippet}".strip(),
		code=response.status_code,
		final=final,
	)


def _fail(doc, integration, courier, error, *, code=None, final=False):
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
	courier.note(integration.name, _("Gave up") if dead else _("Retrying"), error, failed=True)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- delivery state is durable before and after the HTTP call


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
		"""SELECT name, integration FROM `tabCRM Integration Delivery`
        WHERE (status='Pending' AND creation<=%s)
           OR (status='Failed' AND next_attempt_at<=%s)
           OR (status='Sending' AND lease_until<=%s)
        ORDER BY creation LIMIT 500""",
		(now - timedelta(seconds=30), now, now),
	)
	batches = {}
	for name, integration in rows:
		batches.setdefault(integration, []).append(name)
	_enqueue(batches, sweep=True)


def purge():
	"""Daily: keep delivered history 30 days (its bodies 3) and failures 90 days."""
	if not frappe.db.table_exists(DELIVERY):
		return
	now = now_datetime()
	frappe.db.sql(
		"UPDATE `tabCRM Integration Delivery` SET payload=NULL WHERE status='Delivered' AND payload IS NOT NULL AND modified<%s",
		(now - timedelta(days=KEEP_DELIVERED_BODY_DAYS),),
	)
	frappe.db.sql(
		"DELETE FROM `tabCRM Integration Delivery` WHERE status IN ('Delivered','Skipped') AND modified<%s",
		(now - timedelta(days=KEEP_DELIVERED_DAYS),),
	)
	frappe.db.sql(
		"DELETE FROM `tabCRM Integration Delivery` WHERE status='Dead' AND modified<%s",
		(now - timedelta(days=KEEP_FAILED_DAYS),),
	)
