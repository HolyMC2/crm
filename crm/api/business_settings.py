# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""«Ajustes del negocio» (/crm/negocio). Thin wrappers over crm.business_settings."""

import frappe
from frappe import _

from crm import business_settings as service


def _require():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)


@frappe.whitelist(methods=["GET", "POST"])
def page() -> dict:
	_require()
	return service.page()


@frappe.whitelist(methods=["POST"])
def set_switch(key: str, value: int | str) -> dict:
	_require()
	return service.set_switch(key, value)
