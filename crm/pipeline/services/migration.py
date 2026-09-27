"""Additive compatibility mapping; preview never writes or renames business records."""

import frappe
from frappe import _
from frappe.utils import cint, flt

from crm.permissions.framework import warn_if_missing
from crm.pipeline.services.configuration import LEGACY_PIPELINE

KNOWN_STATUS = "status IN (SELECT name FROM `tabCRM Deal Status`)"


def preview():
	stages = frappe.get_all(
		"CRM Deal Status",
		fields=["name", "type", "probability", "position", "hidden"],
		order_by="position asc, name asc",
	)
	counts = {}
	missing_values = {}
	for doctype in ("CRM Lead", "CRM Deal"):
		if frappe.db.has_column(doctype, "pipeline"):
			missing_values[doctype] = frappe.db.sql(
				f"SELECT SUM(pipeline IS NULL) AS null_values, SUM(pipeline = '') AS blank_values FROM `tab{doctype}`",
				as_dict=True,
			)[0]
			counts[doctype] = frappe.db.sql(
				f"SELECT COUNT(*) FROM `tab{doctype}` WHERE pipeline IS NULL OR pipeline = ''"
			)[0][0]
		else:
			counts[doctype] = frappe.db.count(doctype)
	unmapped = frappe.db.sql(
		"SELECT DISTINCT d.status FROM `tabCRM Deal` d LEFT JOIN `tabCRM Deal Status` s ON s.name = d.status WHERE s.name IS NULL",
		pluck=True,
	)
	return {
		"pipeline": LEGACY_PIPELINE,
		"stages": stages,
		"records_to_map": counts,
		"missing_values": missing_values,
		"unmapped_statuses": unmapped,
		"preserves": ["status", "status_change_log", "repair links", "modified", "probability", "currency"],
	}


def execute():
	warn_if_missing("pipeline mapping")
	before = preview()
	# Deals whose stage ID no longer exists keep an empty pipeline (still
	# visible, unchanged) instead of aborting install/migrate; a manager picks
	# a stage for them. Every other record is mapped.
	held = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabCRM Deal` WHERE (pipeline IS NULL OR pipeline = '') AND NOT ({KNOWN_STATUS} AND status IS NOT NULL)"
	)[0][0]
	if held:
		frappe.log_error(
			title="CRM pipeline mapping needs review",
			message=(
				f"{held} deal(s) reference stage IDs that are not CRM Deal Status records "
				f"({', '.join(repr(status) for status in before['unmapped_statuses'])}). "
				"They were left without a pipeline; choose a stage for them to map them."
			),
		)
	frappe.db.sql("SELECT name FROM `tabDocType` WHERE name = 'CRM Pipeline' FOR UPDATE")
	if not frappe.db.exists("CRM Pipeline", LEGACY_PIPELINE):
		pipeline = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": "Existing sales (compatibility)",
				"probability_policy": "Legacy",
				"is_default": 0
				if any(
					not row.sales_company
					for row in frappe.get_all(
						"CRM Pipeline", filters={"is_default": 1}, fields=["sales_company"]
					)
				)
				else 1,
				"stages": [
					{"status": row.name, "probability": flt(row.probability), "archived": cint(row.hidden)}
					for row in before["stages"]
				],
			}
		)
		pipeline.insert(ignore_permissions=True, set_name=LEGACY_PIPELINE)
	for doctype in ("CRM Lead", "CRM Deal"):
		known = f" AND {KNOWN_STATUS}" if doctype == "CRM Deal" else ""
		frappe.db.sql(
			f"UPDATE `tab{doctype}` SET pipeline = %s WHERE (pipeline IS NULL OR pipeline = ''){known}",
			LEGACY_PIPELINE,
		)
	after = preview()
	if after["records_to_map"] != {"CRM Lead": 0, "CRM Deal": held}:
		frappe.throw(_("Pipeline mapping did not complete."))
	return {"before": before, "after": after, "held_for_review": held}
