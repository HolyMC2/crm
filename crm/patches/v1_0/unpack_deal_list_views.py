# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Turn the custom deals page's packed saved views into standard CRM View Settings.

That page (frontend/src/utils/dealViewSettings.js) kept its follow-up queue, search,
mode, grouping and visible columns as one JSON object in ``kanban_fields``. The
unified list reads only the standard fields, so each packed view is rewritten into
filters (with request-time tokens), columns, rows, order_by and group_by.

- The original row is kept verbatim in ``legacy_view_state``.
- Idempotent: a view with a backup, or without the packed marker, is skipped.
- Views never written by that page are not touched.
"""

import json

import frappe

from crm.api.deal_queues import OVERDUE
from crm.api.list_tokens import TERMINAL_DEAL_STATUS_TYPES

DOCTYPE = "CRM Deal"
PACKED_ROUTE = "Deals List"
MARKER = "doco_deal_list"
BACKUP_FIELDS = (
	"type",
	"route_name",
	"filters",
	"order_by",
	"group_by_field",
	"columns",
	"rows",
	"kanban_columns",
	"kanban_fields",
	"column_field",
	"title_field",
)

# DealsView column key -> (field or virtual key, label, type, width, options)
COLUMN_MAP = {
	"contact": ("deal_name", "Deal Name", "Data", "14rem", None),
	"customer": ("_v_customer", "Customer", "Data", "150px", None),
	"phone": ("_v_phone", "Phone", "Data", "130px", None),
	"device": ("_v_device", "Device", "Data", "140px", None),
	"repair_type": ("_v_repair_type", "Repair Type", "Data", "130px", None),
	"ro": ("_v_repair_order", "Repair Order", "Data", "150px", None),
	"value": ("deal_value", "Deal Value", "Currency", "110px", None),
	"expected_value": ("expected_deal_value", "Expected Deal Value", "Currency", "120px", None),
	"close_date": ("expected_closure_date", "Expected Closure Date", "Date", "100px", None),
	"next_activity": ("_v_next_step", "Next step", "Data", "170px", None),
	"stage": ("status", "Status", "Link", "125px", "CRM Deal Status"),
	"source": ("source", "Source", "Link", "110px", "CRM Lead Source"),
	"modified": ("modified", "Last Modified", "Datetime", "100px", None),
	"owner": ("deal_owner", "Deal Owner", "Link", "50px", "User"),
}
# The RO cell showed the order and its status chip together.
COLUMN_COMPANIONS = {"ro": ("_v_repair_status", "Repair Status", "Data", "110px", None)}
# The page's own column order (COL_ORDER) and defaults (DEFAULT_COLS).
COLUMN_ORDER = (
	"customer",
	"phone",
	"device",
	"repair_type",
	"ro",
	"value",
	"expected_value",
	"close_date",
	"next_activity",
	"stage",
	"source",
	"modified",
	"owner",
)
DEFAULT_COLUMNS = (
	"customer",
	"phone",
	"device",
	"ro",
	"stage",
	"value",
	"next_activity",
	"modified",
	"owner",
)
GROUP_BY_MAP = {"status": "status", "deal_owner": "deal_owner", "repair_status": "_v_repair_status"}
SEARCH_FIELD = "deal_name"


def execute():
	if not frappe.db.has_column("CRM View Settings", "legacy_view_state"):
		return
	for name in frappe.get_all(
		"CRM View Settings",
		filters={"dt": DOCTYPE, "route_name": PACKED_ROUTE},
		pluck="name",
	):
		unpack_view(name)


def packed_state(row) -> dict | None:
	try:
		blob = json.loads(row.get("kanban_fields") or "null")
	except (TypeError, ValueError):
		return None
	return blob if isinstance(blob, dict) and blob.get(MARKER) else None


def unpack_view(name) -> bool:
	"""Rewrite one packed view in place; False when there is nothing to do."""
	row = frappe.db.get_value(
		"CRM View Settings", name, ["name", "legacy_view_state", *BACKUP_FIELDS], as_dict=True
	)
	if not row or row.legacy_view_state:
		return False
	blob = packed_state(row)
	if blob is None:
		return False

	backup = {field: row.get(field) for field in BACKUP_FIELDS}
	values = convert(row, blob)
	values["legacy_view_state"] = json.dumps(backup, sort_keys=True)
	frappe.db.set_value("CRM View Settings", name, values, update_modified=False)
	return True


def convert(row, blob: dict) -> dict:
	from crm.fcrm.doctype.crm_view_settings.crm_view_settings import (
		remove_duplicates,
		sync_default_columns,
		sync_default_rows,
	)

	filters = _parse(row.get("filters"), {})
	filters = filters if isinstance(filters, dict) else {}
	filters = apply_queue(filters, blob.get("followUp"))
	search = str(blob.get("search") or "").strip()
	if search and SEARCH_FIELD not in filters:
		filters[SEARCH_FIELD] = ["like", f"%{search}%"]

	columns = map_columns(blob.get("columns"))
	rows = remove_duplicates([column["key"] for column in columns] + (sync_default_rows(DOCTYPE) or []))
	group_by = GROUP_BY_MAP.get(blob.get("groupBy") or "")
	mode = blob.get("view")

	values = {
		"filters": json.dumps(filters),
		"order_by": row.get("order_by") or "modified desc",
		"columns": json.dumps(columns),
		"rows": json.dumps(rows),
		"kanban_fields": "[]",
		"route_name": "Deals",
	}
	if mode == "board":
		values.update(
			type="kanban",
			column_field="status",
			title_field="deal_name",
			kanban_columns=json.dumps(
				sync_default_columns(frappe._dict(dt=DOCTYPE, type="kanban", column_field="status"))
			),
			kanban_fields=json.dumps(["deal_value", "deal_owner", "modified"]),
			group_by_field=row.get("group_by_field") or "",
		)
	elif group_by:
		values.update(type="group_by", group_by_field=group_by)
	else:
		values.update(type="list", group_by_field=row.get("group_by_field") or "")
	return values


def apply_queue(filters: dict, queue: str | None) -> dict:
	"""The follow-up queue as dict filters, mirroring followUpFilters() in dealFollowUp.js."""
	filters = dict(filters)
	if queue == "missing":
		filters["next_activity_task"] = ["is", "not set"]
		filters["status"] = open_status_filter(filters.get("status"))
	elif queue == "undated":
		filters["next_activity_task"] = ["is", "set"]
		filters["next_activity_at"] = ["is", "not set"]
	elif queue == "overdue":
		filters["next_activity_task"] = ["is", "set"]
		filters["next_activity_at"] = OVERDUE
	elif queue == "today":
		filters["next_activity_task"] = ["is", "set"]
		filters["next_activity_at"] = ["between", ["@today", "@today"]]
	return filters


def open_status_filter(existing):
	"""«Sin seguimiento» only lists open deals; keep a user's stage choice within that."""
	if not existing:
		return ["in", "@open_deal_statuses"]
	chosen = existing[1] if isinstance(existing, list) and len(existing) == 2 else existing
	chosen = chosen if isinstance(chosen, list) else [chosen]
	terminal = set(
		frappe.get_all("CRM Deal Status", filters={"type": ["in", TERMINAL_DEAL_STATUS_TYPES]}, pluck="name")
	)
	still_open = [status for status in chosen if status not in terminal]
	return ["in", still_open or chosen]


def map_columns(keys) -> list[dict]:
	chosen = [key for key in (keys or []) if key in COLUMN_MAP] or list(DEFAULT_COLUMNS)
	ordered = ["contact", *[key for key in COLUMN_ORDER if key in chosen]]
	columns = []
	for key in ordered:
		columns.append(_column(COLUMN_MAP[key]))
		if key in COLUMN_COMPANIONS:
			columns.append(_column(COLUMN_COMPANIONS[key]))
	return columns


def _column(spec) -> dict:
	key, label, fieldtype, width, options = spec
	column = {"label": label, "type": fieldtype, "key": key, "width": width}
	if options:
		column["options"] = options
	return column


def _parse(raw, fallback):
	if isinstance(raw, dict | list):
		return raw
	try:
		value = json.loads(raw or "null")
	except (TypeError, ValueError):
		return fallback
	return fallback if value is None else value
