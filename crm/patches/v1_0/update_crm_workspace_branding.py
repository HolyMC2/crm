"""Update only the original display labels; retain the existing Workspace identity."""

import frappe


def execute():
	workspace = frappe.db.get_value(
		"Workspace", "Frappe CRM", ["label", "title"], as_dict=True
	)
	if not workspace:
		return
	defaults = {"label": "CRM · Muelle", "title": "CRM"}
	updates = {field: value for field, value in defaults.items() if workspace.get(field) == "Frappe CRM"}
	if not updates:
		return
	frappe.db.set_value("Workspace", "Frappe CRM", updates, update_modified=False)
	frappe.clear_document_cache("Workspace", "Frappe CRM")
	frappe.cache.delete_key("bootinfo")
