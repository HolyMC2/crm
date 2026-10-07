"""Gastos entry gate. Supplier-bill capability never grants sales access."""

import frappe
from frappe import _


def _bootstrap():
	try:
		# Doco owns supplier bills and payments; an older doco has no Gastos.
		from doco.workspaces.payables import bootstrap
	except ImportError:
		return None
	return bootstrap


def check_gastos_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	bootstrap = _bootstrap()
	return bool(bootstrap and bootstrap().get("enabled"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Gastos capability for the shell; the doco service re-checks every request."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {"enabled": False, "reason": _("Gastos is not installed. Ask your manager to check the app.")}
	return bootstrap()
