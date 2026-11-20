"""The Prospectos settings over HTTP; the rules live in crm.lead.settings."""

import json

import frappe
from frappe import _

from crm.lead import settings as prospect_settings


def _require_member():
	from crm.api import check_app_permission

	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if not check_app_permission():
		frappe.throw(_("Ventas is not available for your role."), frappe.PermissionError)


def _state():
	return {
		"settings": prospect_settings.get(),
		"sources": prospect_settings.sources(),
		"can_change": prospect_settings.can_change(),
	}


@frappe.whitelist(methods=["GET", "POST"])
def get_settings():
	_require_member()
	return _state()


@frappe.whitelist(methods=["POST"])
def save_settings(changes: dict | str):
	_require_member()
	if isinstance(changes, str):
		try:
			changes = json.loads(changes)
		except ValueError:
			frappe.throw(_("Choose a setting to change."))
	prospect_settings.save(changes)
	return _state()


@frappe.whitelist(methods=["POST"])
def add_source(name: str):
	_require_member()
	prospect_settings.add_source(name)
	return _state()


@frappe.whitelist(methods=["POST"])
def set_source_offered(name: str, offered: int | str | bool):
	_require_member()
	prospect_settings.set_source_offered(name, offered)
	return _state()
