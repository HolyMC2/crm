# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Reads over CRM Task that answer "what is owed on this record next?"."""

import frappe

from crm.pipeline.constants import OPEN_TASK_STATUSES


def earliest_open_task(doctype: str, name: str, exclude_task: str | None = None) -> dict | None:
	"""The open task a user should do next: earliest due date first, undated ones last.

	Two ordered reads instead of one: MariaDB sorts NULL before every date on ASC,
	so a single `order by due_date` would hand an undated task the top slot.
	`exclude_task` skips the task currently being deleted -- on_trash runs before
	the row leaves the table.
	"""
	fields = _task_fields()
	dated = _first_open_task(doctype, name, exclude_task, fields, ["is", "set"], "due_date asc, creation asc")
	if dated:
		return dated
	return _first_open_task(doctype, name, exclude_task, fields, ["is", "not set"], "creation asc")


def records_with_open_tasks(doctype: str) -> list[str]:
	"""Every record of `doctype` that carries at least one open task."""
	return frappe.get_all(
		"CRM Task",
		filters={
			"reference_doctype": doctype,
			"reference_docname": ["is", "set"],
			"status": ["in", OPEN_TASK_STATUSES],
		},
		pluck="reference_docname",
		distinct=True,
	)


def _task_fields() -> list[str]:
	"""WHY the guard: a bind-mounted deploy runs this code before its migration."""
	fields = ["name", "title", "due_date"]
	if frappe.db.has_column("CRM Task", "activity_type"):
		fields.append("activity_type")
	return fields


def _first_open_task(doctype, name, exclude_task, fields, due_date_filter, order_by) -> dict | None:
	filters = {
		"reference_doctype": doctype,
		"reference_docname": name,
		"status": ["in", OPEN_TASK_STATUSES],
		"due_date": due_date_filter,
	}
	if exclude_task:
		filters["name"] = ["!=", exclude_task]
	rows = frappe.get_all("CRM Task", filters=filters, fields=fields, order_by=order_by, limit=1)
	return rows[0] if rows else None
