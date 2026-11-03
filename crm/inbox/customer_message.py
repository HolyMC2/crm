"""After a customer writes: note the time for the queue, wake a snoozed conversation,
answer outside office hours and assign an unowned conversation. Runs in a short job
after the message commits, so channel ingest never waits on it and a failure here
never loses the message.
"""

from datetime import timedelta

import frappe
from frappe.utils import get_datetime, now_datetime

from crm import inbox
from crm.inbox import assignment, office_hours, snooze

INBOUND = {
	"WhatsApp Message": ("type", "Incoming"),
	"Messenger Message": ("direction", "Incoming"),
	"CRM Webchat Message": ("direction", "Incoming"),
	"CRM Channel Message": ("direction", "Incoming"),
}


def _quiet():
	flags = frappe.flags
	return bool(flags.in_install or flags.in_migrate or flags.in_patch or flags.in_import)


def on_message_insert(doc, method=None):
	field, value = INBOUND.get(doc.doctype, (None, None))
	if not field or doc.get(field) != value or _quiet():
		return
	if doc.doctype == "Messenger Message" and (doc.get("event_type") or "message") != "message":
		return
	try:
		frappe.enqueue(
			"crm.inbox.customer_message.handle",
			queue="short",
			timeout=120,
			enqueue_after_commit=True,
			job_id=f"crm-inbox-{doc.doctype}-{doc.name}",
			deduplicate=True,
			doctype=doc.doctype,
			name=doc.name,
		)
	except Exception:
		# Never block a channel's ingest; the message is already stored.
		frappe.log_error(title="CRM inbox follow-up not queued", message=frappe.get_traceback())


def _conversation(provider, account_id, peer_id, create):
	from crm.api import conversations as control
	from crm.integrations.events import _existing_conversation

	name = _existing_conversation(provider, account_id, peer_id)
	if name or not create:
		return name
	try:
		return control.get_or_create(provider, account_id, peer_id).name
	except (frappe.PermissionError, frappe.ValidationError):
		return None


def handle(doctype, name):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control
	from crm.integrations.events import message_identity

	identity = message_identity(doctype, name)
	if not identity:
		return
	provider, account_id, peer_id = identity
	if threads._private_peer(provider, peer_id):
		return
	settings = inbox.settings()
	away = office_hours.configured(settings) and not office_hours.is_open(settings, now_datetime())
	assign = bool(settings.get("auto_assign_enabled"))
	conversation = _conversation(provider, account_id, peer_id, create=away or assign)
	if not conversation:
		return
	if frappe.db.has_column(control.DOCTYPE, "last_customer_message_at"):
		frappe.db.set_value(
			control.DOCTYPE, conversation, "last_customer_message_at", now_datetime(), update_modified=False
		)
	snooze.wake(conversation, "customer_message")
	if away:
		send_away(conversation, settings, f"{doctype}:{name}")
	if assign:
		assignment.assign(conversation, settings, f"{doctype}:{name}")
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- background job boundary


def send_away(conversation, settings, message_key):
	from crm.api import conversations as control
	from crm.inbox.notices import queue_notice, render

	with control.conversation_fence(conversation):
		doc = control._load(conversation)
		if doc.control_state == "Bot":
			return None  # the published bot answers this customer
		last = doc.get("away_notice_at")
		repeat = timedelta(hours=max(int(settings.get("away_repeat_hours") or 0), 1))
		if last and now_datetime() - get_datetime(last) < repeat:
			return None
		text = render(settings.get("away_message"), doc)
		if not text:
			return None
		intent, refused = queue_notice(conversation, kind="away", key=message_key, text=text)
		if intent:
			frappe.db.set_value(
				control.DOCTYPE, conversation, "away_notice_at", now_datetime(), update_modified=False
			)
		return intent or refused
