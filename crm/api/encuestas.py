"""Encuestas entry gate. Reading customer answers never grants sales access."""

import frappe
from frappe import _


def _bootstrap():
	try:
		# Doco owns the answers; an older doco leaves the module off, not the shell down.
		from doco.encuestas.service import bootstrap
	except ImportError:
		return None
	return bootstrap


def check_encuestas_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	bootstrap = _bootstrap()
	return bool(bootstrap and bootstrap().get("enabled"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Encuestas capability for the shell; the doco service re-checks every request."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {
			"enabled": False,
			"reason": _("Encuestas is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}
	return bootstrap()
