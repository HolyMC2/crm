"""Customer inbox API: queue views, labels, private notes, snooze, macros, help articles,
team performance and the customer's satisfaction rating. Logic lives in crm.inbox."""

import frappe
from frappe.rate_limiter import rate_limit

from crm.inbox import agents, csat, macros, notes, queue, report, snooze
from crm.inbox import help as help_articles
from crm.inbox import labels as conversation_labels


@frappe.whitelist()
def list_queue(
	view: str = "mine",
	state: str = "open",
	label: str | None = None,
	department: str | None = None,
	start: int | str = 0,
	limit: int | str = 30,
	sort: str = "recent",
):
	return queue.list_queue(view, state, label or None, department or None, start, limit, sort or "recent")


@frappe.whitelist()
def get_settings():
	"""What the inbox screens need to know; never the away or rating text itself."""
	from crm import inbox

	settings = inbox.settings()
	return {
		"labels": conversation_labels.list_labels(),
		"office_hours": bool(settings.get("office_hours_enabled")),
		"csat": bool(settings.get("csat_enabled")),
		"auto_assign": bool(settings.get("auto_assign_enabled")),
		"first_response_minutes": settings.get("first_response_minutes") or 0,
		"sla_alerts": bool(settings.get("sla_alerts_enabled")),
		"resolution_hours": settings.get("resolution_hours") or 0,
		"can_manage": bool(report.MANAGER_ROLES & set(frappe.get_roles())),
		"availability": agents.availability(),
	}


@frappe.whitelist(methods=["POST"])
def set_availability(receives_new: bool | int | str, user: str | None = None):
	return agents.set_availability(receives_new, user or None)


@frappe.whitelist()
def list_agents():
	return agents.list_agents()


@frappe.whitelist(methods=["POST"])
def save_agent(
	user: str,
	receives_new: bool | int | str = 1,
	department: str | None = None,
	max_open: int | str = 0,
):
	return agents.save_agent(user, receives_new, department or None, max_open)


@frappe.whitelist(methods=["POST"])
def remove_agent(user: str):
	return agents.remove_agent(user)


@frappe.whitelist()
def list_labels():
	return conversation_labels.list_labels()


@frappe.whitelist(methods=["POST"])
def set_labels(name: str, labels: str | list, command_id: str):
	return conversation_labels.set_labels(name, labels, command_id)


@frappe.whitelist()
def list_notes(name: str):
	return notes.list_notes(name)


@frappe.whitelist(methods=["POST"])
def add_note(name: str, content: str, command_id: str, mentions: str | list | None = None):
	return notes.add_note(name, content, command_id, mentions)


@frappe.whitelist()
def record_notes(name: str):
	return notes.record_notes(name)


@frappe.whitelist(methods=["POST"])
def add_record_note(name: str, doctype: str, docname: str, content: str):
	return notes.add_record_note(name, doctype, docname, content)


@frappe.whitelist()
def mentionable(name: str, query: str | None = ""):
	return notes.mentionable(name, query or "")


@frappe.whitelist(methods=["POST"])
def snooze_conversation(name: str, command_id: str, until: str | None = None, preset: str | None = None):
	"""`preset` (1h, 3h, tomorrow, next_week) is resolved in site time; `until` is a site-time datetime."""
	return snooze.snooze(name, snooze.preset_until(preset) if preset else until, command_id)


@frappe.whitelist(methods=["POST"])
def unsnooze_conversation(name: str, command_id: str):
	return snooze.unsnooze(name, command_id)


@frappe.whitelist()
def list_macros():
	return macros.list_macros()


@frappe.whitelist(methods=["POST"])
def run_macro(name: str, macro: str, expected_generation: int | str, command_id: str):
	return macros.run_macro(name, macro, expected_generation, command_id)


@frappe.whitelist()
def search_help(query: str | None = "", limit: int | str = 10):
	return help_articles.search_help(query or "", limit)


@frappe.whitelist()
def performance(from_date: str | None = None, to_date: str | None = None, department: str | None = None):
	return report.performance(from_date, to_date, department or None)


# Customer rating page action: the token in the link is the only capability.
@frappe.whitelist(allow_guest=True, methods=["POST"])  # nosemgrep: guest-whitelisted-method
@rate_limit(limit=10, seconds=600)
def submit_rating(token: str, rating: int | str, comment: str | None = ""):
	return csat.submit(token, rating, comment or "")
