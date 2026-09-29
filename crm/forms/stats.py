# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""How each form is doing: submissions over time and what they turned into.

A submission is the Lead/Deal a form created (linked by `crm_web_form`). For a
Lead form the outcome is conversion to a deal and won deals; for a Deal form it
is won deals.
"""

import frappe
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

	for doctype in ("CRM Lead", "CRM Deal"):
		names = [f["name"] for f in forms if f["document_type"] == doctype]
		if not names or not _has_link(doctype):
			continue
		rows = frappe.db.sql(
			f"""SELECT `{FIELD}` AS form, COUNT(*) AS total,
				SUM(creation >= %(d7)s) AS d7, SUM(creation >= %(d30)s) AS d30,
				MAX(creation) AS last
			FROM `tab{doctype}` WHERE `{FIELD}` IN %(names)s GROUP BY `{FIELD}`""",
			{"names": names, "d7": d7, "d30": d30},
			as_dict=True,
		)
		for r in rows:
			out[r.form].update(
				{
					"total": int(r.total or 0),
					"last_7_days": int(r.d7 or 0),
					"last_30_days": int(r.d30 or 0),
					"last_submission": r.last,
				}
			)

	lead_forms = [f["name"] for f in forms if f["document_type"] == "CRM Lead"]
	if lead_forms and _has_link("CRM Lead"):
		# deals that came out of a form's leads (conversion), and how many were won
		for r in frappe.db.sql(
			f"""SELECT l.`{FIELD}` AS form, COUNT(d.name) AS deals,
				SUM(COALESCE(s.type, '') = 'Won') AS won
			FROM `tabCRM Deal` d
			JOIN `tabCRM Lead` l ON l.name = d.lead
			LEFT JOIN `tabCRM Deal Status` s ON s.name = d.status
			WHERE l.`{FIELD}` IN %(names)s GROUP BY l.`{FIELD}`""",
			{"names": lead_forms},
			as_dict=True,
		):
			out[r.form].update({"deals": int(r.deals or 0), "won": int(r.won or 0)})

	deal_forms = [f["name"] for f in forms if f["document_type"] == "CRM Deal"]
	if deal_forms and _has_link("CRM Deal"):
		for r in frappe.db.sql(
			f"""SELECT d.`{FIELD}` AS form, COUNT(*) AS deals,
				SUM(COALESCE(s.type, '') = 'Won') AS won
			FROM `tabCRM Deal` d LEFT JOIN `tabCRM Deal Status` s ON s.name = d.status
			WHERE d.`{FIELD}` IN %(names)s GROUP BY d.`{FIELD}`""",
			{"names": deal_forms},
			as_dict=True,
		):
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
