"""Contactos entry gate. Native source authority never grants sales access."""

import frappe
from frappe import _

from crm.contactos_legacy import translate_view
from crm.contactos_routes import is_contactos_path


def check_contactos_permission():
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	from doco.contactos.api import bootstrap

	return bool(bootstrap().get("capabilities", {}).get("directory"))


@frappe.whitelist()
def get_capabilities():
	from crm.api import check_app_permission

	sales = bool(check_app_permission())
	if "doco" not in frappe.get_installed_apps():
		if sales:
			return {"sales_access": True, "capabilities": {"directory": False}}
		frappe.throw(
			_("Contactos is not installed. Ask your manager to check the app."), frappe.PermissionError
		)
	from doco.contactos.api import bootstrap

	data = bootstrap()
	if not data.get("capabilities", {}).get("directory") and not sales:
		frappe.throw(
			_("You do not have permission to see Contactos. Ask your manager for access and try again."),
			frappe.PermissionError,
		)
	data["sales_access"] = sales
	return data


@frappe.whitelist()
def get_legacy_view(source: str, view: str):
	"""Read compatibility only; saving creates a private native Contactos segment."""
	if not check_contactos_permission():
		frappe.throw(_("Ask for access to Contactos to recover this view."), frappe.PermissionError)
	from doco.contactos import access

	doc = frappe.get_doc("CRM View Settings", str(view))
	doc.check_permission("read")
	if doc.user not in (None, "", frappe.session.user) and not doc.public:
		frappe.throw(_("This view is private. Ask its owner to share it."), frappe.PermissionError)
	fields = set(doc.meta.get_permitted_fieldnames(user=frappe.session.user))
	if not {"dt", "type", "filters", "label"}.issubset(fields):
		frappe.throw(_("You do not have permission to recover this view's filters."), frappe.PermissionError)
	result = translate_view(source, doc.as_dict(), access.allowed_fields(access.doctype(source)))
	if result.get("reason"):
		result["reason"] = _(result["reason"])
	return result
