"""Agenda entry gate for the Muelle shell. The doco.agenda sources re-check every call."""

import frappe
from frappe import _


def check_agenda_permission() -> bool:
	"""Work accounts with Event read reach the Agenda page; sources decide the rest."""
	if frappe.session.user == "Guest":
		return False
	if frappe.get_cached_value("User", frappe.session.user, "user_type") != "System User":
		return False
	return bool(frappe.has_permission("Event", "read"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Agenda capability for the shell: which calendars this user may open, with reasons."""
	from crm.api import check_app_permission

	sales = bool(check_app_permission())
	if not check_agenda_permission():
		return {
			"enabled": False,
			"sales_access": sales,
			"reason": _("Your account cannot open the Agenda. Ask your manager for access."),
			"sources": [],
		}
	if "doco" not in frappe.get_installed_apps():
		return {
			"enabled": False,
			"sales_access": sales,
			"reason": _("Agenda is not installed. Ask your manager to check the app."),
			"sources": [],
		}
	try:
		# A doco older than the Agenda (crm updated first) leaves the module off, not the shell down.
		from doco.agenda.api import sources
	except ImportError:
		return {
			"enabled": False,
			"sales_access": sales,
			"reason": _("Agenda is not installed. Ask your manager to check the app."),
			"sources": [],
		}

	rows = sources()["sources"]
	for row in rows:
		if row.get("reason"):
			row["reason"] = _(row["reason"])
	return {
		"enabled": any(row["enabled"] for row in rows),
		"sales_access": sales,
		"user": frappe.session.user,
		"user_time_zone": frappe.db.get_value("User", frappe.session.user, "time_zone") or "",
		"sources": rows,
	}


@frappe.whitelist()
def search_people(q: str = "") -> dict:
	"""Attendee picker: coworkers (enabled work accounts) and permitted Contacts."""
	if not check_agenda_permission():
		frappe.throw(
			_("Your account cannot open the Agenda. Ask your manager for access."), frappe.PermissionError
		)
	text = str(q or "").strip()[:80]
	like = f"%{text}%"
	users = frappe.get_all(
		"User",
		filters={"enabled": 1, "user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]},
		or_filters={"full_name": ["like", like], "name": ["like", like]} if text else None,
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
		limit_page_length=8,
	)
	contacts = _contacts(text, like)
	return {
		"people": [
			{"doctype": "User", "name": row.name, "label": row.full_name or row.name, "detail": row.name}
			for row in users
		]
		+ [
			{
				"doctype": "Contact",
				"name": row.name,
				"label": row.full_name or row.name,
				"detail": row.email_id or row.mobile_no or "",
			}
			for row in contacts
		]
	}


def _contacts(text: str, like: str) -> list:
	"""Contactos' select-only lookup when installed; otherwise a permission-filtered list.
	Without Contact read the picker still offers coworkers: no Contacts, never a refusal."""
	if not frappe.has_permission("Contact", "read"):
		return []
	fields = ["name", "full_name", "email_id", "mobile_no"]
	try:
		from doco.contactos.api import lookup
	except ImportError:
		lookup = None
	if lookup and text:
		names = [row["name"] for row in lookup("contact", text).get("rows", [])][:8]
		if not names:
			return []
		rows = {
			row.name: row
			for row in frappe.get_list("Contact", filters={"name": ["in", names]}, fields=fields)
		}
		return [rows[name] for name in names if name in rows]
	return frappe.get_list(
		"Contact",
		or_filters={"full_name": ["like", like], "email_id": ["like", like], "mobile_no": ["like", like]}
		if text
		else None,
		fields=fields,
		order_by="modified desc",
		limit_page_length=8,
	)
