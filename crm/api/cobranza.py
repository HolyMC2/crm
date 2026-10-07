"""Cobranza entry gate. Receivables capability never grants sales access."""

import frappe
from frappe import _


def _bootstrap():
	try:
		# Doco owns receivables; an older doco leaves the module off.
		from doco.workspaces.receivables import bootstrap
	except ImportError:
		return None
	return bootstrap


def check_cobranza_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	bootstrap = _bootstrap()
	return bool(bootstrap and bootstrap().get("enabled"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Cobranza capability for the shell; the doco service re-checks every request."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {
			"enabled": False,
			"reason": _("Cobranza is not installed. Ask your manager to check the app."),
		}
	return bootstrap()
