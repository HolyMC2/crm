"""Archivos entry gate. Evidence capability never grants sales access."""

import frappe


def check_archivos_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	try:
		from doco.docoutils.documents.bandeja import boot
	except ImportError:
		return False
	return bool(boot().get("enabled"))
