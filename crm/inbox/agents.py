"""Who receives automatically assigned conversations, and whether they are in.

A person turns their own availability on and off from the inbox; a manager does it
for anyone and sets the team and the open limit. Rows are standalone documents, so
one person's toggle never races another's or the inbox settings."""

import frappe
from frappe import _

from crm.inbox.assignment import AGENT, open_counts
from crm.inbox.report import MANAGER_ROLES

FIELDS = ("user", "receives_new", "department", "max_open")


def is_manager(user=None):
	return bool(MANAGER_ROLES & set(frappe.get_roles(user or frappe.session.user)))


def _require_manager():
	if not is_manager():
		frappe.throw(_("Only managers can change who receives conversations."), frappe.PermissionError)


def _row(user):
	return frappe.db.get_value(AGENT, {"user": user}, FIELDS, as_dict=True)


def availability():
	"""The viewer's own state, for the inbox header."""
	user = frappe.session.user
	row = _row(user)
	return {
		"listed": bool(row),
		"receives_new": bool(row and row.receives_new),
		"open": open_counts([user]).get(user, 0),
	}


def set_availability(receives_new, user=None):
	"""Turn new conversations on or off for yourself (or, as a manager, for anyone).
	A person who is not listed yet adds themselves by turning it on."""
	actor = frappe.session.user
	user = user or actor
	if user != actor:
		_require_manager()
	if not frappe.db.get_value("User", user, "enabled"):
		frappe.throw(_("This person's account is disabled."))
	value = 1 if str(receives_new).strip().lower() in {"1", "true"} else 0
	name = frappe.db.get_value(AGENT, {"user": user})
	if name:
		doc = frappe.get_doc(AGENT, name)
		doc.receives_new = value
		doc.save(ignore_permissions=True)
	elif value:
		frappe.get_doc({"doctype": AGENT, "user": user, "receives_new": 1}).insert(ignore_permissions=True)
	return availability() if user == actor else list_agents()


def list_agents():
	_require_manager()
	rows = frappe.get_all(AGENT, fields=list(FIELDS), order_by="user asc")
	names = dict(
		frappe.get_all(
			"User",
			filters={"name": ["in", [r.user for r in rows] or [""]]},
			fields=["name", "full_name"],
			as_list=True,
		)
	)
	counts = open_counts([r.user for r in rows])
	return [
		{
			"user": r.user,
			"full_name": names.get(r.user) or r.user,
			"receives_new": bool(r.receives_new),
			"department": r.department or "",
			"max_open": r.max_open or 0,
			"open": counts.get(r.user, 0),
		}
		for r in rows
	]


def save_agent(user, receives_new=1, department=None, max_open=0):
	_require_manager()
	teams = frappe.get_meta(AGENT).get_field("department").options.split("\n")
	if department and department not in teams:
		frappe.throw(_("Choose one of the teams."))
	name = frappe.db.get_value(AGENT, {"user": user})
	doc = frappe.get_doc(AGENT, name) if name else frappe.new_doc(AGENT)
	doc.update(
		{
			"user": user,
			"receives_new": 1 if str(receives_new).strip().lower() in {"1", "true"} else 0,
			"department": department or "",
			"max_open": max(int(max_open or 0), 0),
		}
	)
	if name:
		doc.save(ignore_permissions=True)
	else:
		doc.insert(ignore_permissions=True)
	return list_agents()


def remove_agent(user):
	_require_manager()
	name = frappe.db.get_value(AGENT, {"user": user})
	if name:
		frappe.delete_doc(AGENT, name, ignore_permissions=True)
	return list_agents()
