# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""How each form is doing: submissions over time and what they turned into.

A submission is the Lead/Deal a form created (linked by `crm_web_form`). For a
Lead form the outcome is conversion to a deal and won deals; for a Deal form it
is won deals.
"""

import frappe
from frappe.query_builder import Case
from frappe.query_builder.functions import Count, Max, Sum
from frappe.utils import add_days, now_datetime

FIELD = "crm_web_form"


def _has_link(doctype: str) -> bool:
	return frappe.get_meta(doctype).has_field(FIELD)


def form_stats(forms: list[dict]) -> dict[str, dict]:
	"""{form name: counts} for rows with `name` and `document_type`."""
	out = {
		f["name"]: {
			"total": 0,
			"last_7_days": 0,
			"last_30_days": 0,
			"last_submission": None,
			"deals": 0,
			"won": 0,
		}
		for f in forms
	}
	if not out:
		return out
	now = now_datetime()
	d7, d30 = add_days(now, -7), add_days(now, -30)

	def counted(condition):
		return Sum(Case().when(condition, 1).else_(0))

	for doctype in ("CRM Lead", "CRM Deal"):
		names = [f["name"] for f in forms if f["document_type"] == doctype]
		if not names or not _has_link(doctype):
			continue
		t = frappe.qb.DocType(doctype)
		rows = (
			frappe.qb.from_(t)
			.select(
				t[FIELD].as_("form"),
				Count("*").as_("total"),
				counted(t.creation >= d7).as_("d7"),
				counted(t.creation >= d30).as_("d30"),
				Max(t.creation).as_("last"),
			)
			.where(t[FIELD].isin(names))
			.groupby(t[FIELD])
		).run(as_dict=True)
		for r in rows:
			out[r.form].update(
				{
					"total": int(r.total or 0),
					"last_7_days": int(r.d7 or 0),
					"last_30_days": int(r.d30 or 0),
					"last_submission": r.last,
				}
			)

	deal = frappe.qb.DocType("CRM Deal")
	status = frappe.qb.DocType("CRM Deal Status")
	won = counted(status.type == "Won").as_("won")

	lead_forms = [f["name"] for f in forms if f["document_type"] == "CRM Lead"]
	if lead_forms and _has_link("CRM Lead"):
		# deals that came out of a form's leads (conversion), and how many were won
		lead = frappe.qb.DocType("CRM Lead")
		rows = (
			frappe.qb.from_(deal)
			.join(lead)
			.on(lead.name == deal.lead)
			.left_join(status)
			.on(status.name == deal.status)
			.select(lead[FIELD].as_("form"), Count(deal.name).as_("deals"), won)
			.where(lead[FIELD].isin(lead_forms))
			.groupby(lead[FIELD])
		).run(as_dict=True)
		for r in rows:
			out[r.form].update({"deals": int(r.deals or 0), "won": int(r.won or 0)})

	deal_forms = [f["name"] for f in forms if f["document_type"] == "CRM Deal"]
	if deal_forms and _has_link("CRM Deal"):
		rows = (
			frappe.qb.from_(deal)
			.left_join(status)
			.on(status.name == deal.status)
			.select(deal[FIELD].as_("form"), Count("*").as_("deals"), won)
			.where(deal[FIELD].isin(deal_forms))
			.groupby(deal[FIELD])
		).run(as_dict=True)
		for r in rows:
			out[r.form].update({"deals": int(r.deals or 0), "won": int(r.won or 0)})
	return out


def submissions(form: str, document_type: str, start: int = 0, page_length: int = 50) -> list[dict]:
	"""The records a form created, newest first, with what happened to them since."""
	if not _has_link(document_type):
		return []
	if document_type == "CRM Lead":
		fields = ["name", "lead_name as title", "status", "lead_owner as owner", "creation", "converted"]
	else:
		fields = ["name", "deal_name as title", "organization", "status", "deal_owner as owner", "creation"]
	meta = frappe.get_meta(document_type)
	for key in ("utm_source", "utm_medium", "utm_campaign"):
		if meta.has_field(key):
			fields.append(key)
	for key in ("email", "mobile_no"):
		if meta.has_field(key):
			fields.append(key)
	rows = frappe.get_list(
		document_type,
		filters={FIELD: form},
		fields=fields,
		order_by="creation desc",
		start=start,
		page_length=page_length,
	)
	if document_type == "CRM Lead" and rows:
		deals = frappe.get_all(
			"CRM Deal",
			filters={"lead": ["in", [r.name for r in rows]]},
			fields=["name", "lead", "status"],
		)
		by_lead = {d.lead: d for d in deals}
		for r in rows:
			deal = by_lead.get(r.name)
			r["deal"] = deal.name if deal else None
			r["deal_status"] = deal.status if deal else None
	for r in rows:
		if not r.get("title"):
			r["title"] = r.get("organization") or r.get("email") or r.get("mobile_no") or r.name
	return rows
