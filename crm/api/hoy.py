"""Hoy (`/crm/hoy`): the shell's landing page and its one batched read.

Doco answers the worker's day (pendientes, agenda, work in other apps); this
adds the avisos that ask for action. Every section is guarded on its own, so a
missing app or permission turns that section off with a reason, never the page.
"""

import frappe
from frappe import _

from crm.avisos import stream as avisos

LANDING_DEFAULT = "muelle_landing"
AVISOS_LIMIT = 3


def check_hoy_permission() -> bool:
	"""Hoy is every staff account's home; each section re-checks its own source."""
	return avisos.is_enabled()


def _require():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if not check_hoy_permission():
		frappe.throw(
			_("Hoy is available to staff accounts only. Ask your manager to check your user."),
			frappe.PermissionError,
		)


def _avisos():
	try:
		answer = avisos.stream(view="inbox", limit=AVISOS_LIMIT)
	except frappe.PermissionError:
		frappe.clear_last_message()
		return {"available": False, "reason": None}
	except Exception:
		frappe.logger("crm.hoy").exception("Hoy avisos failed")
		frappe.clear_last_message()
		return {"available": False, "failed": True}
	return {
		"available": True,
		"groups": answer["groups"],
		"total": answer["total"],
		"more": answer["more"],
		"badge": answer["badge"],
	}


def _doco_day():
	try:
		# A doco older than Hoy (crm updated first) leaves those sections off, not the page.
		from doco.workspaces.hoy import today
	except ImportError:
		today = None
	if "doco" not in frappe.get_installed_apps() or today is None:
		off = {"available": False, "reason": None}
		return {"pendientes": off, "agenda": off, "continuar": off}
	return today()


@frappe.whitelist()
def page() -> dict:
	"""Everything Hoy shows, in one round trip, scoped to the signed-in user."""
	_require()
	day = _doco_day()
	day["avisos"] = _avisos()
	day["landing"] = frappe.defaults.get_user_default(LANDING_DEFAULT) or ""
	return day


def dedicated_app():
	"""The SPA this worker's puesto works in (POS, Taller), or None."""
	if "doco" not in frappe.get_installed_apps():
		return None
	try:
		from doco.workspaces.hoy import dedicated_app as resolve
	except ImportError:
		return None
	try:
		return resolve()
	except Exception:
		frappe.logger("crm.hoy").exception("Hoy landing lookup failed")
		frappe.clear_last_message()
		return None


def landing_choices():
	"""Where Muelle may open for this worker: Hoy, or another module they have."""
	from crm.api.shell import MODULE_KEYS, _hosted, _ventas

	providers = {**_hosted(), "ventas": _ventas}
	keys = []
	for key in MODULE_KEYS:
		provider = providers.get(key)
		if key == "hoy" or key == "avisos" or not provider:
			continue
		try:
			if provider().get("enabled"):
				keys.append(key)
		except frappe.PermissionError:
			continue
	return keys


def saved_landing():
	"""The worker's own choice of where Muelle opens, while they still have that module."""
	key = frappe.defaults.get_user_default(LANDING_DEFAULT) or ""
	if key == "hoy":
		return key
	return key if key and key in landing_choices() else ""


@frappe.whitelist(methods=["POST"])
def save_landing(key: str = "") -> dict:
	"""Remember where Muelle opens for me: Hoy, another module I have, or the default."""
	_require()
	key = (key or "").strip()
	if key and key != "hoy" and key not in landing_choices():
		frappe.throw(_("Choose a section you can open."))
	if key:
		frappe.defaults.set_user_default(LANDING_DEFAULT, key)
	else:
		frappe.defaults.clear_user_default(LANDING_DEFAULT)
	return {"landing": key}


def root_landing():
	"""Where `/crm` (and the installed app's start) opens, or None for the Ventas root.

	Order: the worker's own choice, the app their puesto works in (cashier →
	POS, technician → Taller), then Hoy.
	"""
	chosen = saved_landing()
	if chosen == "ventas":
		return None
	if chosen:
		return f"/crm/{chosen}"
	spa = dedicated_app()
	if spa:
		return spa
	return "/crm/hoy" if check_hoy_permission() else None
