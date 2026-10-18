"""«Prospectos»: one capture list for leads and inquiries (CRM-S3.4, decision D4).

A seller should not check Leads and Consultas separately to find who is waiting. This
list merges open CRM Leads (not converted, status type Open/Ongoing/On Hold) and open
CRM Inquiries (New/In Progress), newest first, each with a source chip. Both halves are
read through their native permission-scoped lists: an inquiry stays visible only to its
owner, its assignee and managers; a lead follows CRM's own query conditions.
Conversion stays where it is: a lead converts on its page, an inquiry person converts
to a lead in Consultas, and both keep their history (see crm.lead.conversion).
"""

import frappe
from frappe import _

OPEN_LEAD_TYPES = ("Open", "Ongoing", "On Hold")
OPEN_INQUIRY = ("New", "In Progress")
MAX_PAGE = 100

# Source chips: one small vocabulary over CRM Lead Source names and inquiry source types.
SOURCE_LABELS = {
	"whatsapp": "WhatsApp",
	"facebook": "Facebook",
	"instagram": "Instagram",
	"tienda": "Tienda en línea",
	"web": "Sitio web",
	"mostrador": "Mostrador",
	"llamada": "Llamada",
	"correo": "Correo",
	"referido": "Recomendación",
	"manual": "Captura manual",
	"otro": "Otro",
}
_SOURCE_WORDS = (
	("whatsapp", ("whatsapp", "wa ")),
	("facebook", ("facebook", "messenger", "meta")),
	("instagram", ("instagram",)),
	("tienda", ("storefront", "tienda", "shop", "newsletter", "restock")),
	("web", ("web", "website", "sitio", "form")),
	("mostrador", ("walk in", "walk-in", "mostrador", "sucursal")),
	("llamada", ("call", "llamada", "phone", "teléfono", "telefono")),
	("correo", ("email", "correo", "mail")),
	("referido", ("refer", "recomend")),
	("manual", ("manual",)),
)


def source_key(value):
	"""The chip for a lead source or inquiry source type; unknown names are «otro»."""
	text = f" {str(value or '').strip().casefold()} "
	if not text.strip():
		return "otro"
	for key, words in _SOURCE_WORDS:
		if any(word in text for word in words):
			return key
	return "otro"


def _open_lead_statuses():
	if not frappe.db.exists("DocType", "CRM Lead Status"):
		return None
	meta = frappe.get_meta("CRM Lead Status")
	if not meta.has_field("type"):
		return None
	return frappe.get_all("CRM Lead Status", filters={"type": ["in", OPEN_LEAD_TYPES]}, pluck="name")


def _lead_filters(q):
	filters = [["CRM Lead", "converted", "=", 0]]
	statuses = _open_lead_statuses()
	if statuses is not None:
		filters.append(["CRM Lead", "status", "in", statuses or ["__none__"]])
	or_filters = None
	if q:
		like = f"%{q}%"
		or_filters = [
			["CRM Lead", field, "like", like]
			for field in (
				"lead_name",
				"first_name",
				"last_name",
				"organization",
				"email",
				"mobile_no",
				"phone",
			)
			if frappe.get_meta("CRM Lead").has_field(field)
		]
	return filters, or_filters


def _inquiries_available():
	from crm.api import inquiries

	if not inquiries._eligible(frappe.session.user):
		return False
	return frappe.db.exists("DocType", inquiries.DOCTYPE) and frappe.get_meta(inquiries.DOCTYPE).has_field(
		"capture_payload_hash"
	)


def _lead_rows(q, limit, sources=None):
	filters, or_filters = _lead_filters(q)
	if sources is not None:
		filters.append(["CRM Lead", "source", "in", sources or ["__none__"]])
	meta = frappe.get_meta("CRM Lead")
	fields = ["name", "modified", "creation", "status"] + [
		field
		for field in (
			"lead_name",
			"first_name",
			"last_name",
			"organization",
			"mobile_no",
			"email",
			"source",
			"lead_owner",
			"next_activity_at",
		)
		if meta.has_field(field)
	]
	rows = frappe.get_list(
		"CRM Lead",
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by="modified desc",
		limit_page_length=limit,
	)
	out = []
	for row in rows:
		person = " ".join(part for part in (row.get("first_name"), row.get("last_name")) if part)
		key = source_key(row.get("source"))
		out.append(
			{
				"kind": "lead",
				"name": row.name,
				"title": row.get("lead_name") or person or row.get("organization") or row.name,
				"detail": row.get("organization")
				if row.get("organization") != row.get("lead_name")
				else None,
				"phone": row.get("mobile_no"),
				"email": row.get("email"),
				"source": key,
				"source_label": SOURCE_LABELS[key],
				"source_raw": row.get("source"),
				"status": row.status,
				"status_label": _(row.status) if row.status else None,
				"owner": row.get("lead_owner"),
				"next_action_at": str(row.next_activity_at) if row.get("next_activity_at") else None,
				"modified": str(row.modified),
				"creation": str(row.creation),
			}
		)
	return out


def _inquiry_rows(q, limit, sources=None):
	from crm.api import inquiries

	if not _inquiries_available():
		return []
	filters = [[inquiries.DOCTYPE, "status", "in", list(OPEN_INQUIRY)]]
	if sources is not None:
		filters.append([inquiries.DOCTYPE, "source_type", "in", sources or ["__none__"]])
	or_filters = None
	if q:
		or_filters = [[inquiries.DOCTYPE, "title", "like", f"%{q}%"]]
	rows = frappe.get_list(
		inquiries.DOCTYPE,
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"title",
			"status",
			"source_type",
			"assigned_to",
			"next_action_at",
			"owner",
			"modified",
			"creation",
		],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"kind": "inquiry",
			"name": row.name,
			"title": row.title or row.name,
			"detail": None,
			"phone": None,
			"email": None,
			"source": source_key(row.source_type),
			"source_label": SOURCE_LABELS[source_key(row.source_type)],
			"source_raw": row.source_type,
			"status": row.status,
			"status_label": _(row.status) if row.status else None,
			"owner": row.assigned_to,
			"next_action_at": str(row.next_action_at) if row.next_action_at else None,
			"modified": str(row.modified),
			"creation": str(row.creation),
		}
		for row in rows
	]


def _grouped(doctype, field, filters, or_filters=None):
	rows = frappe.get_list(
		doctype,
		filters=filters,
		or_filters=or_filters,
		fields=[field, {"COUNT": "name", "as": "n"}],
		group_by=field,
		order_by=None,
		limit_page_length=0,
	)
	return {row.get(field) or None: row.n for row in rows}


def _grouped_inquiries(q):
	from crm.api import inquiries

	filters = [[inquiries.DOCTYPE, "status", "in", list(OPEN_INQUIRY)]]
	or_filters = [[inquiries.DOCTYPE, "title", "like", f"%{q}%"]] if q else None
	return _grouped(inquiries.DOCTYPE, "source_type", filters, or_filters)


@frappe.whitelist(methods=["GET", "POST"])
def list_prospects(
	kind: str | None = None,
	source: str | None = None,
	q: str | None = None,
	start: int | str = 0,
	page_length: int | str = 30,
):
	"""Open leads and inquiries in one list, newest first, with chip counts."""
	from crm.api import check_app_permission

	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if not check_app_permission():
		frappe.throw(_("Ventas is not available for your role."), frappe.PermissionError)
	if kind not in (None, "", "lead", "inquiry"):
		frappe.throw(_("Choose leads or inquiries."))
	if source and source not in SOURCE_LABELS:
		frappe.throw(_("Choose a valid source."))
	try:
		start = int(start or 0)
		page_length = 30 if page_length in (None, "") else int(page_length)
	except (TypeError, ValueError):
		frappe.throw(_("Choose a valid page between 1 and 100 records."))
	if start < 0 or start > 100000 or not 1 <= page_length <= MAX_PAGE:
		frappe.throw(_("Choose a valid page between 1 and 100 records."))
	q = (q or "").strip()[:120] if isinstance(q, str) else ""
	want_leads = kind in (None, "", "lead")
	want_inquiries = kind in (None, "", "inquiry") and _inquiries_available()
	# Kind chips count both kinds whatever kind is on («Consultas» on read
	# «Todos 0 · Prospectos 0» with 46 leads); source chips stay within the kind.
	# Permission-scoped counts per raw source, folded into the small vocabulary.
	all_lead_sources = _grouped("CRM Lead", "source", *_lead_filters(q))
	all_inquiry_sources = _grouped_inquiries(q) if _inquiries_available() else {}
	lead_sources = all_lead_sources if want_leads else {}
	inquiry_sources = all_inquiry_sources if want_inquiries else {}
	chips = {}
	for raw, n in [*lead_sources.items(), *inquiry_sources.items()]:
		chips[source_key(raw)] = chips.get(source_key(raw), 0) + n
	lead_filter = inquiry_filter = None
	if source:
		lead_filter = [raw for raw in lead_sources if source_key(raw) == source and raw is not None]
		inquiry_filter = [raw for raw in inquiry_sources if source_key(raw) == source and raw is not None]
		if source == "otro" and None in lead_sources:
			lead_filter.append("")  # an empty source is «otro» too
	scan = start + page_length + 1
	leads = _lead_rows(q, scan, lead_filter) if want_leads else []
	found = _inquiry_rows(q, scan, inquiry_filter) if want_inquiries else []
	if source == "otro" and want_leads and None in lead_sources:
		leads += [row for row in _lead_rows(q, scan) if not row["source_raw"]]
		leads = list({row["name"]: row for row in leads}.values())
	rows = sorted(leads + found, key=lambda row: row["modified"], reverse=True)
	return {
		"rows": rows[start : start + page_length],
		"has_more": len(rows) > start + page_length,
		"counts": {"lead": sum(all_lead_sources.values()), "inquiry": sum(all_inquiry_sources.values())},
		"sources": [
			{"key": key, "label": SOURCE_LABELS[key], "count": n}
			for key, n in sorted(chips.items(), key=lambda item: (-item[1], item[0]))
		],
		"inquiries_enabled": bool(_inquiries_available()),
	}
