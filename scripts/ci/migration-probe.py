"""Persist synthetic CRM records on the base, verify them after native migration.

Each function runs through bench execute, which commits only after it succeeds.
"""

import json
from pathlib import Path

import frappe
from frappe.cache_manager import clear_controller_cache
from frappe.model.base_document import get_controller


def _snapshot_path():
	return Path(frappe.get_site_path("private", "crm-ci-migration.json"))


def seed():
	organization = frappe.get_doc(
		{
			"doctype": "CRM Organization",
			"organization_name": "CI Migration Organization",
			"currency": "USD",
			"annual_revenue": 1234.50,
		}
	).insert()
	lead = frappe.get_doc(
		{
			"doctype": "CRM Lead",
			"first_name": "Migration",
			"last_name": "Record",
			"email": "migration@example.invalid",
			"organization": organization.name,
		}
	).insert()
	comment = lead.add_comment("Comment", "Preserve this pre-upgrade activity")
	_snapshot_path().write_text(
		json.dumps(
			{
				"apps": frappe.get_installed_apps(),
				"doctypes": frappe.get_all("DocType", filters={"custom": 0}, pluck="name"),
				"organization": organization.name,
				"lead": lead.name,
				"lead_status": lead.status,
				"comment": comment.name,
				"deleted_documents": frappe.get_all("Deleted Document", pluck="name"),
			},
			indent=2,
		)
	)
	print("Persisted base organization, lead and linked activity for migration verification")


def guard():
	"""Check native orphan detection without deleting any DocType, before migration."""
	for rebuild in (False, True):
		if rebuild:
			frappe.clear_cache()
		clear_controller_cache()
		for app in frappe.get_installed_apps():
			if frappe.get_module_list(app) and not frappe.local.app_modules.get(app):
				raise AssertionError(f"Installed app has no mapped modules: {app}")
		overrides = frappe.get_hooks("override_doctype_class", {})
		for doctype in frappe.get_all("DocType", filters={"custom": 0}, pluck="name"):
			if doctype not in overrides:
				get_controller(doctype)  # Import/lookup failures abort before native orphan deletion.
	print("Migration guard passed with both cached and rebuilt module maps")


def verify():
	snapshot = json.loads(_snapshot_path().read_text())
	assert set(snapshot["apps"]) == set(
		frappe.get_installed_apps()
	), "Installed apps changed during migration"
	missing = set(snapshot["doctypes"]) - set(frappe.get_all("DocType", pluck="name"))
	assert not missing, f"Migration removed DocTypes: {sorted(missing)}"
	deletions = frappe.get_all(
		"Deleted Document",
		filters={"name": ["not in", snapshot["deleted_documents"] or [""]]},
		fields=["name", "deleted_doctype", "deleted_name"],
		order_by="creation asc",
	)
	print("Migration deletion audit: " + json.dumps(deletions, default=str), flush=True)
	Path("/results/migration-deletions.json").write_text(json.dumps(deletions, indent=2, default=str))
	assert not deletions, "Migration deleted records; inspect migration-deletions.json"
	organization = frappe.get_doc("CRM Organization", snapshot["organization"])
	assert organization.currency == "USD" and float(organization.annual_revenue) == 1234.50
	lead = frappe.get_doc("CRM Lead", snapshot["lead"])
	assert lead.email == "migration@example.invalid"
	assert lead.organization == organization.name and lead.status == snapshot["lead_status"]
	comment = frappe.get_doc("Comment", snapshot["comment"])
	assert (comment.reference_doctype, comment.reference_name) == ("CRM Lead", lead.name)
	assert comment.content == "Preserve this pre-upgrade activity"
	# Exercise a real write through the new controller, not only a database read.
	lead.last_name = "Upgraded"
	lead.save()
	assert frappe.get_doc("CRM Lead", lead.name).last_name == "Upgraded"
	print(f"Migration preserved {len(snapshot['doctypes'])} DocTypes, apps, records and activity links")
