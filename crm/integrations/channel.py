"""API inbox channel: a CRM Integration that brings another channel into the CRM inbox.

Inbound: the connection's user posts customer messages (crm.api.integration.channel_message);
each becomes an immutable CRM Channel Message in an exact ("API", channel account, contact id)
conversation, so ownership, take/release/close and history work as for WhatsApp or Webchat.

Outbound: replies written in the inbox go through the CRM outbox like every channel. This
module is the transport adapter (hooks `crm_channel_adapters`): dispatch stores the reply and
queues a signed `message.created` (direction «out») to the channel's own webhook, where n8n
delivers it. «Accepted» means handed to the connection; n8n may report delivered/read/failed
back through crm.api.integration.channel_status.
"""

import hashlib
import json

import frappe
from frappe import _

from crm.integrations import webhooks

PROVIDER = "API"
DOCTYPE = "CRM Channel Message"
WRITE_TOKEN = object()
MAX_TEXT = 4096
STATUSES = ("sent", "delivered", "read", "failed")


def _key(*parts):
	return hashlib.sha256(json.dumps([1, *parts], separators=(",", ":")).encode()).hexdigest()


def _connection_for_account(account_id, *, lock=False):
	rows = frappe.db.get_values(
		webhooks.INTEGRATION,
		{"channel_account_id": account_id, "api_channel": 1},
		["name", "enabled", "webhook_url", "channel_account_id", "integration_user"],
		as_dict=True,
		for_update=lock,
	)
	return rows[0] if len(rows) == 1 else None


def revision(connection):
	values = [connection.name, connection.channel_account_id, connection.webhook_url or ""]
	return "api_channel:" + hashlib.sha256(json.dumps(values, separators=(",", ":")).encode()).hexdigest()


def _insert(values):
	doc = frappe.get_doc({"doctype": DOCTYPE, **values})
	doc.flags.crm_channel_service = WRITE_TOKEN
	doc.insert(ignore_permissions=True)
	return doc


# ---------------------------------------------------------------- inbound


def receive(connection_name, peer_id, text, external_id, sender_name=None):
	"""Store one inbound customer message exactly once per (connection, external id)."""
	from crm.api import conversations as control

	connection = frappe.db.get_value(
		webhooks.INTEGRATION,
		connection_name,
		["name", "enabled", "api_channel", "channel_account_id"],
		as_dict=True,
	)
	if not connection or not connection.api_channel or not connection.channel_account_id:
		frappe.throw(_("This connection is not an inbox channel. Turn on «Use as an inbox channel» first."))
	if not connection.enabled:
		frappe.throw(_("This connection is disabled. Enable it in CRM Integration to receive messages."))
	if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
		frappe.throw(_("Send the message text (1 to {0} characters).").format(MAX_TEXT))
	if not isinstance(external_id, str) or not external_id.strip() or len(external_id) > 140:
		frappe.throw(_("Send message_id: your channel's own id for this message (up to 140 characters)."))
	sender_name = (sender_name or "").strip()[:140] or None
	name = control.conversation_key(PROVIDER, connection.channel_account_id, peer_id)
	key = _key(connection.name, "Incoming", external_id.strip())
	existing = frappe.db.get_value(
		DOCTYPE, {"message_key": key}, ["name", "text", "conversation"], as_dict=True
	)
	if existing:
		if existing.text != text:
			frappe.throw(_("message_id {0} was already used for a different text.").format(external_id))
		return {"conversation": existing.conversation, "message": existing.name, "replayed": True}
	with control.conversation_fence(name):
		message = _insert(
			{
				"integration": connection.name,
				"peer_id": peer_id,
				"conversation": name,
				"direction": "Incoming",
				"message_key": key,
				"external_id": external_id.strip(),
				"sender_name": sender_name,
				"text": text,
				"status": "received",
			}
		)
		control.internal_channel_message(connection.name, peer_id, message.name)
	from crm.api.webchat import _notify_message

	_notify_message(name, None)
	return {"conversation": name, "message": message.name, "replayed": False}


def report_status(connection_name, message, status):
	"""n8n reports what happened to a reply it was handed."""
	if status not in STATUSES:
		frappe.throw(_("status must be one of: {0}.").format(", ".join(STATUSES)))
	row = frappe.db.get_value(
		DOCTYPE,
		{"name": message, "integration": connection_name, "direction": "Outgoing"},
		["name", "status"],
		as_dict=True,
		for_update=True,
	)
	if not row:
		frappe.throw(
			_("No reply {0} was sent through this connection.").format(message), frappe.DoesNotExistError
		)
	if row.status != status:
		frappe.db.set_value(DOCTYPE, row.name, "status", status)
		webhooks.emit(
			"message.updated", DOCTYPE, row.name, version="status:" + status, context={"status": status}
		)
	return {"message": row.name, "status": status}


# ---------------------------------------------------------------- outbox adapter


def send_ready(provider):
	return provider == PROVIDER and bool(frappe.db.exists("DocType", DOCTYPE))


def automation_ready(provider):
	return False  # no customer bot on this channel; n8n itself is the automation


def freeze_text(body, *, provider, account_id, peer_id):
	from crm.api.outbox import _canonical

	if provider != PROVIDER or not isinstance(body, str) or not body.strip() or len(body) > MAX_TEXT:
		raise ValueError("invalid api channel text")
	return _canonical({"type": "text", "text": body})


def account_source(conversation):
	connection = _connection_for_account(conversation.account_id, lock=True)
	if not connection or connection.name != conversation.account_record:
		return None
	return (webhooks.INTEGRATION, connection.name, revision(connection))


def reply_reason(intent):
	connection = _connection_for_account(intent.account_id, lock=True)
	if not connection:
		return "account_unavailable"
	if not connection.enabled:
		return "channel_disabled"
	if not connection.webhook_url:
		return "channel_not_ready"
	if (
		intent.source_doctype != webhooks.INTEGRATION
		or intent.source_name != connection.name
		or intent.source_action != revision(connection)
	):
		return "account_configuration_changed"
	return None


def send_frozen(intent, payload):
	"""Store the reply once and queue it to the channel's webhook; the worker commits."""
	from crm.api.outbox import require_dispatch

	require_dispatch(intent.name, intent.provider, intent.account_id, intent.peer_id, payload=payload)
	connection = _connection_for_account(intent.account_id, lock=True)
	if not connection or not connection.enabled:
		return {"state": "Blocked", "reason_code": "channel_disabled"}
	key = _key(connection.name, "Outgoing", intent.name)
	name = frappe.db.get_value(DOCTYPE, {"message_key": key}, "name")
	if not name:
		name = _insert(
			{
				"integration": connection.name,
				"peer_id": intent.peer_id,
				"conversation": intent.conversation,
				"direction": "Outgoing",
				"message_key": key,
				"intent": intent.name,
				"sender_name": frappe.db.get_value("User", intent.actor_user, "full_name")
				if intent.actor_user
				else None,
				"text": payload["text"],
				"status": "sent",
			}
		).name
		from crm.api.webchat import _notify_message

		_notify_message(intent.conversation, intent.get("actor_user"))
	# The channel's own connection always receives its replies, subscribed or not.
	webhooks.emit("message.created", DOCTYPE, name, version="created", to=[connection.name])
	return {"state": "Accepted", "provider_message_id": "api." + key}
