"""Update only the original display labels; retain the existing Workspace identity."""

import frappe


def execute():
	workspace = frappe.db.get_value("Workspace", "Frappe CRM", ["label", "title"], as_dict=True)
	if not workspace:
		return
	# The label must stay unique: ERPNext's own CRM Workspace owns "CRM".
	defaults = {"label": "Sales CRM", "title": "CRM"}
	# "CRM · Muelle" was an interim label from an unreleased revision.
	originals = {"label": {"Frappe CRM", "CRM · Muelle"}, "title": {"Frappe CRM"}}
	updates = {field: value for field, value in defaults.items() if workspace.get(field) in originals[field]}
	if not updates:
		return
	frappe.db.set_value("Workspace", "Frappe CRM", updates, update_modified=False)
	frappe.clear_document_cache("Workspace", "Frappe CRM")
	frappe.cache.delete_key("bootinfo")
