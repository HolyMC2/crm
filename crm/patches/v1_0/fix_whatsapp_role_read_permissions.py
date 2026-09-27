"""Repair only the exact Message defaults emitted by the old CRM installer.

The native patch ledger makes this an upgrade once. Subsequent explicit role
changes remain untouched by add_roles() and later migrations.
"""

import frappe
from frappe.core.doctype.custom_docperm.custom_docperm import update_custom_docperm

LEGACY_RIGHTS = {
	"read": 0,
	"write": 1,
	"create": 1,
	"delete": 1,
	"share": 1,
	"email": 1,
	"print": 1,
	"report": 1,
	"export": 1,
	"select": 0,
	"submit": 0,
	"cancel": 0,
	"amend": 0,
	"mask": 0,
}


def execute():
	if "frappe_whatsapp" not in frappe.get_installed_apps():
		return
	for row in frappe.get_all(
		"Custom DocPerm",
		filters={
			"parent": "WhatsApp Message",
			"role": ["in", ["Sales Manager", "Sales User"]],
			"permlevel": 0,
			"if_owner": 0,
		},
		fields=["name", *LEGACY_RIGHTS],
	):
		if all(int(row.get(right) or 0) == value for right, value in LEGACY_RIGHTS.items()):
			# The convenience permission updater does not include if_owner in its
			# row lookup. Save the exact matched row, preserving any owner-only rule.
			update_custom_docperm(row.name, {"read": 1})
