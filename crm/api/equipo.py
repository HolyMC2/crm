"""Equipo entry gate. Team access never grants sales access."""

import frappe
from frappe import _


def _bootstrap():
	try:
		# Doco owns the team (Employee, puestos, Ausencias); an older doco leaves the module off.
		from doco.erp_experience.equipo_team import shell_module
	except ImportError:
		return None
	return shell_module


def check_equipo_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	bootstrap = _bootstrap()
	return bool(bootstrap and bootstrap().get("enabled"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Equipo capability for the shell; the doco services re-check every request."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {
			"enabled": False,
			"reason": _("Equipo is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}
	return bootstrap()
