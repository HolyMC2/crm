# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Who sees whose prospects and deals, for the organigrama and the Settings tab.

The team tree is the organization chart by default (org_hierarchy.follows_org_chart):
turning the hierarchy on from the organigrama makes every boss see their team's
prospects and deals. Only a system administrator changes it (FCRM Settings guards
the same fields for every other path).
"""

import frappe
from frappe import _
from frappe.utils import sbool

from crm.permissions.org_hierarchy import (
	EMPLOYEE,
	employee_tree_available,
	follows_org_chart,
	hierarchy_enabled,
	scope_of,
)

MAX_PEOPLE = 500


def _can_change() -> bool:
	return "System Manager" in frappe.get_roles()


@frappe.whitelist()
def get_state() -> dict:
	"""{enabled, org_chart_available, follows_org_chart, can_change}."""
	return {
		"enabled": hierarchy_enabled(),
		"org_chart_available": employee_tree_available(),
		"follows_org_chart": follows_org_chart(),
		"can_change": _can_change(),
	}


@frappe.whitelist()
def people_scope(users: list | str | None = None) -> dict:
	"""The state, and what each of `users` sees of prospects and deals.

	Only people whose employee record the reader may open are described: the
	organigrama lists exactly those."""
	users = frappe.parse_json(users) if isinstance(users, str) else users
	if not isinstance(users, list):
		users = []
	users = list(dict.fromkeys(u for u in users if isinstance(u, str) and u))[:MAX_PEOPLE]
	readable = set()
	if users and employee_tree_available():
		try:
			readable = set(frappe.get_list(EMPLOYEE, filters={"user_id": ["in", users]}, pluck="user_id"))
		except frappe.PermissionError:
			readable = set()
	people = {}
	for user in users:
		if user in readable:
			scope = scope_of(user)
			if scope:
				people[user] = scope
	return {"state": get_state(), "people": people}


@frappe.whitelist(methods=["POST"])
def follow_org_chart(on: bool | int | str | None = None) -> dict:
	"""Turn on (or off) «bosses see their team's prospects and deals», the team
	being the organization chart."""
	if not _can_change():
		frappe.throw(
			_("Only a system administrator can change who sees whose prospects and deals."),
			frappe.PermissionError,
		)
	on = sbool(on)
	if on and not employee_tree_available():
		frappe.throw(_("This site has no organization chart: add employees first."))
	settings = frappe.get_single("FCRM Settings")
	settings.enable_sales_hierarchy = 1 if on else 0
	if on:
		settings.sales_hierarchy_own_tree = 0
	settings.save()
	message = (
		_("Done: each boss sees the prospects and deals of whoever reports to them.")
		if on
		else _("Done: prospects and deals no longer follow the organization chart.")
	)
	return {"state": get_state(), "message": message}
