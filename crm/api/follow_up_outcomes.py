# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""The follow-up outcome sheet (Hoy, Pendientes). Thin wrappers over
crm.pipeline.services.outcomes, which holds the rules."""

import frappe
from frappe import _

from crm.pipeline.services import outcomes as service


def _require_user():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)


@frappe.whitelist(methods=["GET", "POST"])
def options(task: str) -> dict:
	_require_user()
	return service.options(task)


@frappe.whitelist(methods=["POST"])
def record(
	task: str,
	action: str,
	modified: str | None = None,
	when: str | None = None,
	reason: str | None = None,
	note: str | None = None,
) -> dict:
	_require_user()
	return service.record(task, action, modified=modified, when=when, reason=reason, note=note)
