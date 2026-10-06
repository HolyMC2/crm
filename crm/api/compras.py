"""Compras entry gate. Purchasing capability never grants sales access."""

import frappe
from frappe import _


def check_compras_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	from doco.workspaces.purchasing import bootstrap

	return bool(bootstrap().get("enabled"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Compras capability for the shell; the doco service re-checks every request."""
	if "doco" not in frappe.get_installed_apps():
		return {"enabled": False, "reason": _("Compras is not installed. Ask your manager to check the app.")}
	from doco.workspaces.purchasing import bootstrap

	return bootstrap()
