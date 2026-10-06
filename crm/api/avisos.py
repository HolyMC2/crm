"""Avisos entry gate and endpoints. Every call is scoped to the signed-in user's own rows."""

import json

import frappe
from frappe import _

from crm.avisos import stream as avisos


def check_avisos_permission() -> bool:
	return avisos.is_enabled()


def _require():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to see your avisos."), frappe.AuthenticationError)
	if not avisos.is_enabled():
		frappe.throw(
			_("Avisos is available to staff accounts only. Ask your manager to check your user."),
			frappe.PermissionError,
		)


def _list(value) -> list:
	if isinstance(value, str):
		value = json.loads(value or "[]")
	return value if isinstance(value, list) else []


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Avisos capability and badge for the shell; each endpoint re-checks."""
	if not avisos.is_enabled():
		return {
			"enabled": False,
			"reason": _("Avisos is available to staff accounts only. Ask your manager to check your user."),
		}
	return {"enabled": True, "badge": avisos.badge()}


@frappe.whitelist()
def get_stream(
	view: str = "inbox", category: str = "all", q: str = "", start: int = 0, limit: int = 50
) -> dict:
	_require()
	return avisos.stream(view=view, category=category, q=q, start=start, limit=limit)


@frappe.whitelist()
def get_badge() -> dict:
	_require()
	return avisos.badge()


@frappe.whitelist(methods=["POST"])
def mark_read(keys: str | list | None = None, category: str | None = None, view: str = "inbox") -> dict:
	_require()
	return avisos.mark_read(keys=_list(keys), category=category, view=view)


@frappe.whitelist(methods=["POST"])
def mark_unread(native: str | list | None = None, crm: str | list | None = None) -> dict:
	_require()
	return avisos.mark_unread(native=_list(native), crm=_list(crm))


@frappe.whitelist(methods=["POST"])
def save_preferences(categories: str | dict) -> dict:
	_require()
	if isinstance(categories, str):
		categories = json.loads(categories or "{}")
	return avisos.save_categories(categories)


@frappe.whitelist(methods=["POST"])
def set_muted(kind: str, muted: int | bool = 1) -> dict:
	_require()
	return avisos.set_muted(str(kind), bool(int(muted)))
