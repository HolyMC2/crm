"""Permissioned navigation into the existing automation workspace; no effects."""

from urllib.parse import unquote, urlencode, urlsplit

import frappe
from frappe import _

REFERENCES = {"CRM Lead", "CRM Deal", "CRM Offer", "CRM Conversation"}


def _return_path(value):
	value = value or "/crm/automations"
	if not isinstance(value, str) or len(value) > 2048 or "\\" in value:
		frappe.throw(_("Choose a valid CRM return page."))
	try:
		parsed = urlsplit(value)
	except ValueError:
		frappe.throw(_("Choose a valid CRM return page."))
	decoded = unquote(parsed.path)
	if (
		parsed.scheme
		or parsed.netloc
		or not decoded.startswith("/crm/")
		or ".." in decoded.split("/")
		or "\\" in decoded
		or any(ord(c) < 32 or ord(c) == 127 for c in unquote(value))
	):
		frappe.throw(_("Choose a valid CRM return page."))
	return value


def _reference(doctype, name):
	if not doctype and not name:
		return None
	if (
		not isinstance(doctype, str)
		or doctype not in REFERENCES
		or not isinstance(name, str)
		or not name
		or len(name) > 140
		or any(ord(c) < 32 or ord(c) == 127 for c in name)
	):
		frappe.throw(_("Choose a CRM source record."))
	if doctype == "CRM Conversation":
		# Includes account/peer and staff-private conversation boundaries.
		from crm.api.automation import get_context

		get_context(name)
	else:
		doc = frappe.get_doc(doctype, name)
		doc.check_permission("read")
		if doctype == "CRM Offer":
			frappe.get_doc("CRM Deal", doc.deal).check_permission("read")
	return {"doctype": doctype, "name": name}


@frappe.whitelist()
def get_context(reference_doctype=None, reference_name=None, return_to=None):
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open automations."), frappe.PermissionError)
	return_to = _return_path(return_to)
	reference = _reference(reference_doctype, reference_name)
	result = {"available": False, "reason": "not_installed", "return_to": return_to, "reference": reference}
	if "doco" not in frappe.get_installed_apps():
		return result
	from doco.docoutils.assistant.automation import permissions, store

	actor = permissions.current_user()
	if not permissions.can_manage("sales", actor):
		frappe.throw(_("A sales manager must configure sales automations."), frappe.PermissionError)
	if not store.available():
		return {**result, "reason": "migration_required"}
	params = {"view": "automatizaciones", "dept": "sales", "crm_return": return_to}
	if reference:
		params.update(crm_doctype=reference["doctype"], crm_name=reference["name"])
	return {
		**result,
		"available": True,
		"reason": None,
		"workspace_url": "/desk/automatizaciones?" + urlencode(params),
		"customer_flows_available": "doco_marketing" in frappe.get_installed_apps(),
	}
