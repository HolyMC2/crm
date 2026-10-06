"""Pendientes entry gate. Task capability never grants sales access."""

import frappe


def check_pendientes_permission():
	"""Whether the shell's Pendientes provider enables the module; doco re-checks every request."""
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	from crm.api.shell import _pendientes

	return bool(_pendientes().get("enabled"))
