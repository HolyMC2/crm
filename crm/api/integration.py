"""Integration surface for n8n and other automation services.

Calls authenticate with the connection user's Frappe API key
(`Authorization: token <api_key>:<api_secret>`) and reach the same whitelisted,
idempotent methods the CRM uses (outbox.queue_message with a request_id,
conversations.apply_control with a command_id, …), so every ownership, window,
consent and permission check still applies. This module adds what those methods
lack for an automation client: a credential test, the event catalog, and the
admin actions behind the CRM Integration form. See docs/integrations/N8N.md.
"""

import json

import frappe
from frappe import _

from crm.integrations import webhooks

INTEGRATION = webhooks.INTEGRATION
DELIVERY = webhooks.DELIVERY


@frappe.whitelist()
def whoami():
	"""Credential test for n8n: who the key acts as, and what this site offers."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Sign in or send an API key."), frappe.AuthenticationError)
	connections = frappe.get_all(
		INTEGRATION,
		filters={"integration_user": user},
		fields=["name", "title", "enabled", "api_channel", "channel_account_id"],
		ignore_permissions=True,
	)
	return {
		"user": user,
		"full_name": frappe.db.get_value("User", user, "full_name"),
		"roles": sorted(set(frappe.get_roles(user)) - {"All", "Guest"}),
		"site": frappe.local.site,
		"api_version": webhooks.API_VERSION,
		"connections": connections,
		"events": [e["event"] for e in webhooks.catalog()],
	}


@frappe.whitelist()
def events():
	"""Every event a connection can subscribe to, with the record it describes."""
	return webhooks.catalog()


def _manager():
	frappe.only_for("System Manager")


def _connection(name):
	_manager()
	if not frappe.db.exists(INTEGRATION, name):
		frappe.throw(_("This connection no longer exists."), frappe.DoesNotExistError)
	return frappe.get_doc(INTEGRATION, name)


@frappe.whitelist(methods=["POST"])
def send_test(name: str):
	"""Send a signed `ping` now and report exactly what the receiver answered."""
	doc = _connection(name)
	if not doc.webhook_url:
		frappe.throw(_("Add the webhook URL from your n8n Webhook node first."))
	if not frappe.db.get_value("User", doc.integration_user, "enabled"):
		frappe.throw(_("Choose an enabled user for «Acts as user» first."))
	delivery = frappe.get_doc(
		{
			"doctype": DELIVERY,
			"integration": doc.name,
			"event": webhooks.TEST_EVENT,
			"event_key": frappe.generate_hash(length=64),
			"status": "Sending",
			"context_json": json.dumps({"message": "Test event from CRM.", "by": frappe.session.user}),
		}
	)
	delivery.flags.crm_integration_engine = True
	delivery.insert(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- the test delivery row must exist before the synchronous send
	return webhooks.deliver(delivery.name, force=True)


@frappe.whitelist()
def show_secret(name: str):
	"""The signing secret, for pasting into n8n's signature check."""
	return {"secret": _connection(name).get_password("signing_secret")}


@frappe.whitelist(methods=["POST"])
def rotate_secret(name: str):
	"""New secret from now on; deliveries already sent keep the old signature."""
	doc = _connection(name)
	doc.signing_secret = webhooks.new_secret()
	doc.save()
	return {"secret": doc.get_password("signing_secret")}


@frappe.whitelist(methods=["POST"])
def redeliver(delivery: str):
	"""Queue a failed, dead or skipped delivery again with the same id and body."""
	_manager()
	row = frappe.db.get_value(DELIVERY, delivery, ["name", "status", "integration"], as_dict=True)
	if not row:
		frappe.throw(_("This delivery no longer exists."), frappe.DoesNotExistError)
	if row.status in ("Pending", "Sending"):
		return webhooks._projection(delivery)
	if not frappe.db.get_value(INTEGRATION, row.integration, "enabled"):
		frappe.throw(_("Enable the connection before sending its events again."))
	values = {"status": "Pending", "next_attempt_at": frappe.utils.now_datetime(), "lease_until": None}
	if row.status == "Skipped":
		values["payload"] = None  # rebuild: the user's access may have been fixed since
	frappe.db.set_value(DELIVERY, delivery, values)
	frappe.db.after_commit.add(lambda: webhooks._enqueue([delivery]))
	return webhooks._projection(delivery)


@frappe.whitelist()
def summary(name: str):
	"""Delivery counts and the latest problems, for the connection form."""
	doc = _connection(name)
	counts = dict(
		frappe.db.sql(
			"SELECT status, COUNT(*) FROM `tabCRM Integration Delivery` WHERE integration=%s GROUP BY status", (doc.name,)
		)
	)
	problems = frappe.get_all(
		DELIVERY,
		filters={"integration": doc.name, "status": ["in", ["Failed", "Dead", "Skipped"]]},
		fields=["name", "event", "status", "attempts", "last_error", "modified"],
		order_by="modified desc",
		limit=5,
	)
	return {
		"counts": counts,
		"problems": problems,
		"blocker": webhooks.enable_blocker(doc),
		"api_key_ready": bool(frappe.db.get_value("User", doc.integration_user, "api_key")),
	}


def _own_channel(connection=None):
	"""The caller's inbox-channel connection; the API key's user must be its «Acts as user»."""
	user = frappe.session.user
	filters = {"integration_user": user, "api_channel": 1}
	if connection:
		filters["name"] = connection
	names = frappe.get_all(INTEGRATION, filters=filters, pluck="name", ignore_permissions=True)
	if not names:
		frappe.throw(
			_(
				"No inbox-channel connection acts as {0}. In CRM Integration, set «Acts as user» to this "
				"user and turn on «Use as an inbox channel»."
			).format(user),
			frappe.PermissionError,
		)
	if len(names) > 1:
		frappe.throw(
			_("{0} acts for several inbox channels; send connection with one of: {1}.").format(
				user, ", ".join(names)
			)
		)
	return names[0]


@frappe.whitelist(methods=["POST"])
def channel_message(
	contact_id: str,
	text: str,
	message_id: str,
	sender_name: str | None = None,
	connection: str | None = None,
):
	"""Bring one customer message from another channel into the CRM inbox.

	`contact_id` is the customer's stable id on that channel (email, phone, chat id);
	`message_id` is that channel's id for this message and makes retries safe.
	"""
	from crm.integrations import channel

	return channel.receive(_own_channel(connection), contact_id, text, message_id, sender_name)


@frappe.whitelist(methods=["POST"])
def channel_status(message: str, status: str, connection: str | None = None):
	"""Report what happened to a reply this channel was handed: sent, delivered, read or failed."""
	from crm.integrations import channel

	return channel.report_status(_own_channel(connection), message, status)
