# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Reads over the pipeline stage sets (CRM Deal Status / CRM Lead Status)."""

import frappe
from frappe import _

from crm.pipeline.constants import STATUS_DOCTYPES, STATUS_OPTIONAL_COLUMNS


def status_doctype(doctype: str) -> str:
	"""Resolve a caller-supplied doctype to its stage set, rejecting anything else."""
	resolved = STATUS_DOCTYPES.get(doctype)
	if not resolved:
		frappe.throw(_("{0} has no pipeline stages.").format(doctype or "-"), frappe.ValidationError)
	return resolved


def visible_statuses(doctype: str) -> list[dict]:
	"""Pickable stages in board order: hidden ones dropped, shape identical for lead and deal."""
	stage_doctype = status_doctype(doctype)
	present = [column for column in STATUS_OPTIONAL_COLUMNS if frappe.db.has_column(stage_doctype, column)]
	rows = frappe.get_all(
		stage_doctype,
		fields=["name", "color", "position", "type", *present],
		filters={"hidden": 0} if "hidden" in present else None,
		order_by="position asc, name asc",
	)
	for row in rows:
		for column, fallback in STATUS_OPTIONAL_COLUMNS.items():
			row.setdefault(column, fallback)
	return rows


def exclude_hidden_stages(query, status_table):
	"""Drop hidden stages from a query builder statement already joined to the stage table.

	WHY the guard: dashboards must keep answering on a site that has not run the
	pipeline migration yet, where the column does not exist.
	"""
	if frappe.db.has_column("CRM Deal Status", "hidden"):
		query = query.where(status_table.hidden == 0)
	return query
