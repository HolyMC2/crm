"""Automatic assignment: an unassigned conversation goes to the listed person with the
fewest open conversations (ties: the one assigned longest ago), within the per-person
limit. Only people who can already work this conversation are candidates.
"""

import frappe
from frappe.utils import get_datetime

from crm.inbox import system_event

EPOCH = get_datetime("2000-01-01")


def candidates(doc, settings):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	department = doc.get("department") or None
	users = []
	for row in settings.get("assignment_agents") or []:
		if not row.active or not row.user or row.user in users:
			continue
		if row.department and row.department != department:
			continue
		if not frappe.db.get_value("User", row.user, "enabled"):
			continue
		if threads._permitted(lambda user=row.user: control._authorize(doc, user, write=True)):
			users.append(row.user)
	return users


def choose(doc, settings):
	users = candidates(doc, settings)
	if not users:
		return None
	open_counts = dict(
		frappe.db.sql(
			"""SELECT human_owner, COUNT(*) FROM `tabCRM Conversation`
			WHERE control_state='Human' AND human_owner IN %s GROUP BY human_owner""",
			(tuple(users),),
		)
	)
	limit = int(settings.get("auto_assign_max_open") or 0)
	if limit:
		users = [u for u in users if open_counts.get(u, 0) < limit]
	if not users:
		return None
	last = dict(
		frappe.db.sql(
			"""SELECT actor_user, MAX(creation) FROM `tabCRM Conversation Control Event`
			WHERE action='auto_assign' AND actor_user IN %s GROUP BY actor_user""",
			(tuple(users),),
		)
	)
	return min(users, key=lambda u: (open_counts.get(u, 0), get_datetime(last.get(u) or EPOCH), u))


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
