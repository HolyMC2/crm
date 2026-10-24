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


def can_create_bill() -> bool:
	"""Whether this user may start a supplier bill; the engine form re-checks on save."""
	return bool(frappe.has_permission("Purchase Invoice", "create"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Gastos capability for the shell; the doco service re-checks every request."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {"enabled": False, "reason": _("Gastos is not installed. Ask your manager to check the app.")}
	answer = bootstrap() or {}
	if answer.get("enabled"):
		# «Nueva factura» on Por registrar: only for bill readers who may create one.
		capabilities = answer.setdefault("capabilities", {})
		capabilities["create"] = bool(capabilities.get("read") and can_create_bill())
	return answer
