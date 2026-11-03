"""How long a customer has waited for a person, and one alert per wait past the goal.

A wait starts with the customer's first message after the last reply a person sent
(an accepted reply from the inbox, or one sent from the phone app) and ends with the
next such reply. Only the customer job writes the wait (awaiting_since); replies are
read from the outbox, so sending a reply never writes the conversation row.
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

from crm import inbox
from crm.inbox import office_hours

CONVERSATION = "CRM Conversation"
SENT = ("Accepted", "Delivered", "Read")
OPEN = ("Human", "Paused")
SCAN = 200


def ready():
	return frappe.db.has_column(CONVERSATION, "awaiting_since")


def last_replies(names):
	"""{conversation: when a person last sent a reply that left}."""
	names = [n for n in dict.fromkeys(names) if n]
	if not names:
		return {}
	out = {
		name: get_datetime(at)
		for name, at in frappe.db.sql(
			"""SELECT conversation, MAX(accepted_at) FROM `tabCRM Outbound Intent`
			WHERE conversation IN %s AND origin='Human' AND state IN %s AND accepted_at IS NOT NULL
			GROUP BY conversation""",
			(tuple(names), SENT),
		)
	}
	for name, at in frappe.get_all(
		CONVERSATION,
		filters={"name": ["in", names], "last_reply_at": ["is", "set"]},
		fields=["name", "last_reply_at"],
		as_list=True,
	):
		at = get_datetime(at)
		out[name] = max(out.get(name) or at, at)
	return out


def waiting_since(doc, replies):
	"""When this customer started waiting for a person, or None."""
	since = doc.get("awaiting_since")
	if not since or doc.get("control_state") not in OPEN:
		return None
	reply = replies.get(doc.get("name"))
	return None if reply and reply >= get_datetime(since) else since


def customer_wrote(conversation, at):
	values = {"last_customer_message_at": at}
	if ready():
		since = frappe.db.get_value(CONVERSATION, conversation, "awaiting_since")
		reply = last_replies([conversation]).get(conversation)
		if not since or (reply and reply >= get_datetime(since)):
			values.update(awaiting_since=at, sla_alerted_at=None)
	frappe.db.set_value(CONVERSATION, conversation, values, update_modified=False)


def _managers(doc):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control
	from crm.inbox.report import MANAGER_ROLES

	roles = set(MANAGER_ROLES)
	department = doc.get("department")
	if department:
		from crm.api import automation_departments as departments

		roles.update(departments.DEPARTMENTS.get(department, {}).get("managers") or ())
	users = frappe.get_all(
		"Has Role",
		filters={
			"role": ["in", sorted(roles)],
			"parenttype": "User",
			"parent": ["not in", ["Administrator"]],
		},
		pluck="parent",
		distinct=True,
	)
	enabled = frappe.get_all(
		"User",
		filters={"name": ["in", users or [""]], "enabled": 1, "user_type": "System User"},
		pluck="name",
	)
	return [u for u in sorted(enabled) if threads._permitted(lambda u=u: control._authorize(doc, u))]


def alert_overdue():
	"""Cron: tell someone about each customer waiting past the reply goal, once per wait."""
	from crm.api import conversations as control
	from crm.integrations.webhooks import emit

	settings = inbox.settings()
	minutes = int(settings.get("first_response_minutes") or 0)
	if not ready() or not settings.get("sla_alerts_enabled") or not minutes:
		return
	now = now_datetime()
	if office_hours.configured(settings) and not office_hours.is_open(settings, now):
		return
	filters = {"control_state": ["in", list(OPEN)], "awaiting_since": ["<", now - timedelta(minutes=minutes)]}
	if frappe.db.has_column(CONVERSATION, "snoozed_until"):
		filters["snoozed_until"] = ["is", "not set"]
	rows = [
		row
		for row in frappe.get_all(
			CONVERSATION,
			filters=filters,
			fields=["name", "awaiting_since", "sla_alerted_at", "control_state"],
			order_by="awaiting_since asc",
			limit=SCAN,
		)
		if not row.sla_alerted_at or get_datetime(row.sla_alerted_at) < get_datetime(row.awaiting_since)
	]
	replies = last_replies([row.name for row in rows])
	for row in rows:
		if not waiting_since(row, replies):
			continue
		try:
			doc = control._load(row.name)
			people = [doc.human_owner] if doc.human_owner else _managers(doc)
			waited = int((now - get_datetime(row.awaiting_since)).total_seconds() // 60)
			for user in people:
				_tell(user, doc, waited)
			frappe.db.set_value(CONVERSATION, row.name, "sla_alerted_at", now, update_modified=False)
			emit(
				"conversation.reply_overdue",
				CONVERSATION,
				row.name,
				version=str(row.awaiting_since),
				context={"waiting_since": str(row.awaiting_since), "goal_minutes": minutes},
			)
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- one conversation per commit in a cron sweep
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title="CRM late reply alert failed", message=frappe.get_traceback())


def _tell(user, doc, waited):
	from crm.api import conversation_threads as threads

	who = threads._display_names(doc.provider, [doc.peer_id]).get(doc.peer_id, doc.peer_id)
	if frappe.db.exists("DocType", "CRM Notification"):
		frappe.get_doc(
			{
				"doctype": "CRM Notification",
				"from_user": "Administrator",
				"to_user": user,
				"type": "Assignment",
				"notification_text": _("{0} has been waiting {1} minutes for a reply").format(who, waited),
				"reference_doctype": CONVERSATION,
				"reference_name": doc.name,
			}
		).insert(ignore_permissions=True)
	frappe.publish_realtime(
		"crm_conversation_updated", {"name": doc.name, "overdue": True}, user=user, after_commit=True
	)
