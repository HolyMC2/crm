# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""crm's own virtual columns for CRM Deal (see crm.api.list_columns).

- ``_v_next_step``: the denormalised ``next_activity_*`` fields as one compact object
  ``{at, task, type, title, overdue, days}``; overdue is measured against site-local now.
- ``_v_weighted``: deal value x probability, formatted in the deal currency.

Both read the deal itself again through ``frappe.get_list`` so the row set is limited
to what the user may read, and field-level (permlevel) restrictions leave the value
None rather than deriving it from a field the user cannot see.
"""

import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.utils import date_diff, flt, fmt_money, get_datetime, getdate, now_datetime

DOCTYPE = "CRM Deal"
NEXT_STEP = "_v_next_step"
WEIGHTED = "_v_weighted"
NEXT_STEP_FIELDS = ("next_activity_at", "next_activity_task", "next_activity_type", "next_activity_title")
WEIGHTED_FIELDS = ("deal_value", "probability", "currency")


def columns(doctype: str) -> list[dict]:
	if doctype != DOCTYPE:
		return []
	return [
		{
			"key": NEXT_STEP,
			"label": _("Next step"),
			"fieldtype": "Data",
			"width": "12rem",
			"groupable": 0,
		},
		{
			"key": WEIGHTED,
			"label": _("Weighted value"),
			"fieldtype": "Data",
			"width": "9rem",
			"groupable": 0,
		},
	]


def enrich(doctype: str, rows: list[dict], keys: set[str]) -> None:
	if doctype != DOCTYPE:
		return
	names = [row.get("name") for row in rows if row.get("name")]
	if not names:
		return
	permitted = set(get_permitted_fields(DOCTYPE, permission_type="read"))
	masked = {field.fieldname for field in frappe.get_meta(DOCTYPE).get_masked_fields()}
	wants_next = NEXT_STEP in keys and _readable(NEXT_STEP_FIELDS, permitted, masked)
	wants_weighted = WEIGHTED in keys and _readable(WEIGHTED_FIELDS, permitted, masked)
	fields = ["name"]
	if wants_next:
		fields += NEXT_STEP_FIELDS
	if wants_weighted:
		fields += WEIGHTED_FIELDS
	if len(fields) == 1:
		return

	# One query for the page; get_list applies the same row permissions as the list.
	source = {
		deal.name: deal
		for deal in frappe.get_list(
			DOCTYPE,
			fields=fields,
			filters={"name": ["in", names]},
			limit_page_length=0,
			order_by=None,
		)
	}
	now = now_datetime()
	base_currency = None
	if wants_weighted:
		base_currency = frappe.db.get_single_value("FCRM Settings", "currency")
	for row in rows:
		deal = source.get(row.get("name"))
		if not deal:
			continue
		if wants_next:
			row[NEXT_STEP] = next_step(deal, now)
		if wants_weighted:
			row[WEIGHTED] = weighted(deal, base_currency)


def next_step(deal, now=None) -> dict | None:
	"""The follow-up shown on the row; None when the deal has no pending task."""
	if not deal.get("next_activity_task") and not deal.get("next_activity_at"):
		return None
	now = now or now_datetime()
	at = get_datetime(deal.get("next_activity_at")) if deal.get("next_activity_at") else None
	return {
		"at": str(at) if at else None,
		"task": deal.get("next_activity_task"),
		"type": deal.get("next_activity_type"),
		"title": deal.get("next_activity_title"),
		"overdue": bool(at and at < now),
		"days": date_diff(getdate(at), getdate(now)) if at else None,
	}


def weighted(deal, base_currency=None) -> str | None:
	if deal.get("deal_value") is None:
		return None
	amount = flt(deal.get("deal_value")) * flt(deal.get("probability")) / 100
	return fmt_money(amount, currency=deal.get("currency") or base_currency)


def format_export(doctype: str, key: str, value):
	if key == NEXT_STEP and isinstance(value, dict):
		return " · ".join(str(part) for part in (value.get("at"), value.get("title")) if part)
	return value


def _readable(fields, permitted: set, masked: set) -> bool:
	return all(field in permitted and field not in masked for field in fields)
