"""CRM assignment configuration uses native Frappe document permissions."""

import frappe
from frappe import _

CRM_TYPES = ("CRM Lead", "CRM Deal")


def _require_manager():
	frappe.only_for(["System Manager", "Sales Manager"])
	frappe.has_permission("Assignment Rule", "read", throw=True)


def _target_permission(doctype, permission):
	return doctype in CRM_TYPES and frappe.has_permission(doctype, permission)


@frappe.whitelist()
def get_assignment_rule_access():
	_require_manager()
	return {
		"can_create": bool(frappe.has_permission("Assignment Rule", "create")),
		"document_types": [dt for dt in CRM_TYPES if _target_permission(dt, "write")],
	}


@frappe.whitelist()
def get_assignment_rules_list():
	_require_manager()
	allowed = [dt for dt in CRM_TYPES if _target_permission(dt, "read")]
	if not allowed:
		return []
	rows = frappe.get_list(
		"Assignment Rule",
		filters={"document_type": ["in", allowed]},
		fields=["name", "description", "disabled", "priority", "document_type"],
		order_by="priority desc, name asc",
		limit_page_length=0,
	)
	can_create = frappe.has_permission("Assignment Rule", "create")
	result = []
	for row in rows:
		doc = frappe.get_doc("Assignment Rule", row.name)
		# get_list applies list scope; check the actual document too (including hooks).
		if not frappe.has_permission("Assignment Rule", "read", doc=doc):
			continue
		can_configure = _target_permission(doc.document_type, "write")
		result.append(
			{
				**row,
				"users_exists": bool(doc.users),
				"can_write": bool(can_configure and doc.has_permission("write")),
				"can_delete": bool(can_configure and doc.has_permission("delete")),
				"can_duplicate": bool(can_configure and can_create),
			}
		)
	return result


@frappe.whitelist(methods=["POST"])
def duplicate_assignment_rule(docname: str, new_name: str):
	_require_manager()
	source = frappe.get_doc("Assignment Rule", docname)
	source.check_permission("read")
	if not _target_permission(source.document_type, "write"):
		frappe.throw(_("You cannot configure assignment for this document type."), frappe.PermissionError)
	frappe.has_permission("Assignment Rule", "create", throw=True)
	if not isinstance(new_name, str) or not new_name.strip():
		frappe.throw(_("An assignment rule name is required."))
	doc = frappe.copy_doc(source)
	doc.name = None
	# Copying a rule must not carry the previous routing cursor into its first run.
	doc.last_user = None
	doc.insert(set_name=new_name.strip())
	return doc
