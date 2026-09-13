# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Keeps `CRM Deal.deal_name` filled.

`deal_name` is the deal's title field: Desk link fields, the kanban card and the
redesign list all read it. A deal created by the lead conversion, a repair-order
spawn or an import arrives without one, and a blank title renders as an empty
link. The default is derived once, at validate time, and then left alone:
whatever a user types afterwards is theirs. taller retitles the deals it spawns
from repair orders on top of this (its heal recognises this default as "not a
manual edit" by recomputing it).
"""

import frappe
from frappe.utils import cstr

# What a deal is called when nobody named it, in order of preference: the
# organization (B2B), the person the lead conversion carried over, the name
# fields, then whichever channel identifier exists.
TITLE_FIELDS = ("organization", "lead_name", "first_name", "last_name", "email", "mobile_no")


def default_deal_name(doc) -> str | None:
	"""The title a deal gets when it has none. `doc` is a Document or a dict."""
	value = lambda field: cstr(doc.get(field)).strip()  # noqa: E731
	if value("organization"):
		return value("organization")
	if value("lead_name"):
		return value("lead_name")
	person = " ".join(part for part in (value("first_name"), value("last_name")) if part)
	if person:
		return person
	for field in ("email", "mobile_no"):
		if value(field):
			return value(field)
	return None


def ensure_deal_name(doc) -> None:
	"""Fill a blank deal_name on the document being saved; never touch a set one."""
	if not is_migrated() or cstr(doc.get("deal_name")).strip():
		return
	doc.deal_name = default_deal_name(doc)


def backfill() -> int:
	"""Title every deal that has none. Idempotent; returns how many were written."""
	if not is_migrated():
		return 0
	# "is not set" matches NULL and "": a `not in ["", None]` filter matches nothing.
	rows = frappe.get_all(
		"CRM Deal",
		filters={"deal_name": ["is", "not set"]},
		fields=["name", *TITLE_FIELDS],
	)
	updates = {}
	for row in rows:
		title = default_deal_name(row)
		if title:
			updates[row["name"]] = {"deal_name": title}
	if updates:
		# Derived data: titling the backlog is not user activity on thousands of deals.
		frappe.db.bulk_update("CRM Deal", updates, update_modified=False)
	return len(updates)


def is_migrated() -> bool:
	"""A bind-mounted deploy can run this code before its migration adds the column."""
	return frappe.db.has_column("CRM Deal", "deal_name")
