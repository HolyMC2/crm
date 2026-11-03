"""Automatic assignment: an unassigned conversation goes to the available person with
the fewest open conversations (ties: the one assigned longest ago), within their limit.
Only people who can already work this conversation are candidates.
"""

import frappe
from frappe.utils import get_datetime

from crm.inbox import system_event

AGENT = "CRM Inbox Agent"
EPOCH = get_datetime("2000-01-01")


def candidates(doc, settings):
	"""{user: open limit} of the available people who may work this conversation."""
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	department = doc.get("department") or None
	rows = frappe.get_all(
		AGENT,
		filters={"receives_new": 1},
		fields=["user", "department", "max_open"],
		order_by="user asc",
	)
	enabled = set(
		frappe.get_all(
			"User", filters={"name": ["in", [r.user for r in rows] or [""]], "enabled": 1}, pluck="name"
		)
	)
	default = int(settings.get("auto_assign_max_open") or 0)
	users = {}
	for row in rows:
		if row.user not in enabled or (row.department and row.department != department):
			continue
		if threads._permitted(lambda user=row.user: control._authorize(doc, user, write=True)):
			users[row.user] = int(row.max_open or 0) or default
	return users


def open_counts(users):
	if not users:
		return {}
	return dict(
		frappe.db.sql(
			"""SELECT human_owner, COUNT(*) FROM `tabCRM Conversation`
			WHERE control_state='Human' AND human_owner IN %s GROUP BY human_owner""",
			(tuple(users),),
		)
	)


def choose(doc, settings):
	limits = candidates(doc, settings)
	counts = open_counts(list(limits))
	users = [u for u, limit in limits.items() if not limit or counts.get(u, 0) < limit]
	if not users:
		return None
	last = dict(
		frappe.db.sql(
			"""SELECT actor_user, MAX(creation) FROM `tabCRM Conversation Control Event`
			WHERE action='auto_assign' AND actor_user IN %s GROUP BY actor_user""",
			(tuple(users),),
		)
	)
	return min(users, key=lambda u: (counts.get(u, 0), get_datetime(last.get(u) or EPOCH), u))


def assign(name, settings, message_key):
	"""Give an unowned human conversation to the next person; returns the user or None."""
	from crm.api import conversations as control

	with control.conversation_fence(name):
		doc = control._load(name)
		if doc.control_state != "Human" or doc.human_owner:
			return None
		user = choose(doc, settings)
		if not user:
			return None
		before = control._snapshot(doc)
		doc.human_owner, doc.bot_enabled = user, 0
		system_event(
			doc, before, "auto_assign:" + message_key, "auto_assign", actor=user, reason="auto_assign"
		)
	if frappe.db.exists("DocType", "CRM Notification"):
		frappe.get_doc(
			{
				"doctype": "CRM Notification",
				"from_user": "Administrator",
				"to_user": user,
				"type": "Assignment",
				"notification_text": frappe._("A customer conversation was assigned to you"),
				"reference_doctype": "CRM Conversation",
				"reference_name": name,
			}
		).insert(ignore_permissions=True)
	return user
