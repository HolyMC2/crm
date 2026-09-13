# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Keeps the next-activity fields on CRM Lead / CRM Deal in step with CRM Task.

The fields are a denormalisation: lists, boards and sorts need the earliest open
task of a record without one query per row.
"""

import frappe
from frappe.utils import cstr

from crm.pipeline.constants import NEXT_ACTIVITY_FIELDS, REFERENCE_DOCTYPES
from crm.pipeline.queries.next_activity import earliest_open_task, records_with_open_tasks

CLEARED = dict.fromkeys(NEXT_ACTIVITY_FIELDS, None)


def refresh(doctype: str, name: str, exclude_task: str | None = None) -> bool:
	"""Recompute one record's next activity. Returns whether anything was written."""
	if doctype not in REFERENCE_DOCTYPES or not name or not _is_migrated(doctype):
		return False

	current = frappe.db.get_value(doctype, name, NEXT_ACTIVITY_FIELDS, as_dict=True)
	if current is None:
		return False  # the reference record is gone; nothing to mirror onto

	values = _values_of(earliest_open_task(doctype, name, exclude_task))
	if all(current.get(field) == values[field] for field in NEXT_ACTIVITY_FIELDS):
		return False

	# update_modified=False: derived data must not read as user activity, or every
	# "recently modified" list and SLA hygiene sweep would follow task churn.
	frappe.db.set_value(doctype, name, values, update_modified=False)
	return True


def backfill() -> dict[str, int]:
	"""Recompute every record that has an open task or a stale stored one. Idempotent."""
	counts = {}
	for doctype in REFERENCE_DOCTYPES:
		if not _is_migrated(doctype):
			continue
		names = set(records_with_open_tasks(doctype)) | set(_records_with_stored_activity(doctype))
		counts[doctype] = sum(1 for name in names if refresh(doctype, name))
	return counts


def _values_of(task: dict | None) -> dict:
	if not task:
		return dict(CLEARED)
	return {
		"next_activity_at": task.get("due_date"),
		"next_activity_title": task.get("title"),
		"next_activity_type": task.get("activity_type"),
		# CRM Task is autoincrement: cstr keeps the Link column comparable to what
		# the database hands back, so an unchanged record is not rewritten.
		"next_activity_task": cstr(task.get("name")),
	}


def _records_with_stored_activity(doctype: str) -> list[str]:
	# "is set", never ["not in", ["", None]]: SQL NOT IN with NULL matches no row.
	return frappe.get_all(doctype, filters={"next_activity_task": ["is", "set"]}, pluck="name")


def _is_migrated(doctype: str) -> bool:
	"""A bind-mounted deploy can run this code before its migration adds the columns."""
	return frappe.db.has_column(doctype, "next_activity_at")
