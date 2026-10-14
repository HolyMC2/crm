"""Manual de la tienda entry gate. Reading the shop manual never grants sales access."""

import frappe
from frappe import _


def _bootstrap():
	try:
		# Doco owns the articles; an older doco leaves the module off, not the shell down.
		from doco.manual.service import bootstrap
	except ImportError:
		return None
	return bootstrap


def check_manual_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	bootstrap = _bootstrap()
	return bool(bootstrap and bootstrap(full=False).get("enabled"))


@frappe.whitelist()
def get_capabilities(full: bool = True) -> dict:
	"""Manual de la tienda capability for the shell; the doco service re-checks every request.

	The shell boot asks without the editor's setup data (`full=False`); the module asks with it."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {
			"enabled": False,
			"reason": _("The shop manual is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}
	return bootstrap(full=bool(full))
