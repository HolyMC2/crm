"""Productos entry gate. Item read never grants sales access."""

import frappe


def check_productos_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	try:
		from doco.workspaces.products import bootstrap
	except ImportError:
		return False
	return bool(bootstrap().get("enabled"))
