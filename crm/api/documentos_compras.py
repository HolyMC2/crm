"""Documentos · Compras: the purchase chain of a record (Shell Wave D, SPEC §6 DD6/DD7).

«Creado desde»: Requisición → Cotización → Orden → Recepción → Factura → Pago. From any
purchase document, `cadena` walks ERPNext's own links (the item rows' `material_request`,
`supplier_quotation`, `purchase_order`, `purchase_receipt`, and the payment references) up to
where it came from and down to what came after, never sideways to siblings. Each document
carries who did its step in full names (DD7: who asked, who approved, who received, who
paid), from the document owner and the Version that confirmed it.

Frappe permissions only: every document goes through `frappe.get_list`, so one the worker
cannot read is simply not in the chain. ERPNext doctypes missing → an empty chain.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, cstr

from crm.api.documentos import _person, readable

MAX_NODES = 40

# The chain's stages in order, and which doctypes stand at each.
STAGES = (
	("requisicion", "Requisición", ("Material Request",)),
	("cotizacion", "Cotización", ("Request for Quotation", "Supplier Quotation")),
	("orden", "Orden", ("Purchase Order",)),
	("recepcion", "Recepción", ("Purchase Receipt",)),
	("factura", "Factura", ("Purchase Invoice",)),
	("pago", "Pago", ("Payment Entry",)),
)
STAGE_OF = {doctype: key for key, _label, doctypes in STAGES for doctype in doctypes}

# (child table, parent doctype, link field, the doctype it points back to): a row of the
# parent made from the target. Up = parent → target; down = target → parent.
EDGES = (
	("Request for Quotation Item", "Request for Quotation", "material_request", "Material Request"),
	("Supplier Quotation Item", "Supplier Quotation", "material_request", "Material Request"),
	("Supplier Quotation Item", "Supplier Quotation", "request_for_quotation", "Request for Quotation"),
	("Purchase Order Item", "Purchase Order", "material_request", "Material Request"),
	("Purchase Order Item", "Purchase Order", "supplier_quotation", "Supplier Quotation"),
	("Purchase Receipt Item", "Purchase Receipt", "purchase_order", "Purchase Order"),
	("Purchase Invoice Item", "Purchase Invoice", "purchase_order", "Purchase Order"),
	("Purchase Invoice Item", "Purchase Invoice", "purchase_receipt", "Purchase Receipt"),
)
PAID = ("Purchase Invoice", "Purchase Order")

# Who did the step (DD7), by doctype: (verb when created, verb when confirmed).
WHO = {
	"Material Request": ("Pidió", "Aprobó"),
	"Request for Quotation": ("Pidió precios", "Envió"),
	"Supplier Quotation": ("Registró", "Confirmó"),
	"Purchase Order": ("Preparó", "Aprobó"),
	"Purchase Receipt": ("Capturó", "Recibió"),
	"Purchase Invoice": ("Capturó", "Registró"),
	"Payment Entry": ("Capturó", "Pagó"),
}

_FIELDS = {
	"Material Request": ("title", "schedule_date as date"),
	"Request for Quotation": ("transaction_date as date",),
	"Supplier Quotation": (
		"supplier_name as title",
		"grand_total as amount",
		"currency",
		"transaction_date as date",
	),
	"Purchase Order": (
		"supplier_name as title",
		"grand_total as amount",
		"currency",
		"transaction_date as date",
	),
	"Purchase Receipt": (
		"supplier_name as title",
		"grand_total as amount",
		"currency",
		"posting_date as date",
	),
	"Purchase Invoice": (
		"supplier_name as title",
		"grand_total as amount",
		"currency",
		"posting_date as date",
	),
	"Payment Entry": (
		"party_name as title",
		"paid_amount as amount",
		"paid_from_account_currency as currency",
		"posting_date as date",
		"payment_type",
	),
}


def _exists(doctype):
	return bool(frappe.db.exists("DocType", doctype))


def _up(doctype, name):
	"""The documents this one was made from."""
	out = set()
	for child, parent, field, target in EDGES:
		if parent != doctype or not _exists(child):
			continue
		for value in frappe.get_all(
			child, filters={"parent": name, "parenttype": parent}, pluck=field, distinct=True
		):
			if value:
				out.add((target, value))
	if doctype == "Payment Entry" and _exists("Payment Entry Reference"):
		for ref in frappe.get_all(
			"Payment Entry Reference",
			filters={"parent": name, "parenttype": "Payment Entry", "reference_doctype": ("in", PAID)},
			fields=["reference_doctype", "reference_name"],
		):
			out.add((ref.reference_doctype, ref.reference_name))
	return out


def _down(doctype, name):
	"""The documents made from this one (not cancelled)."""
	out = set()
	for child, parent, field, target in EDGES:
		if target != doctype or not _exists(child):
			continue
		for value in frappe.get_all(
			child,
			filters={field: name, "parenttype": parent, "docstatus": ("<", 2)},
			pluck="parent",
			distinct=True,
		):
			out.add((parent, value))
	if doctype in PAID and _exists("Payment Entry Reference"):
		for value in frappe.get_all(
			"Payment Entry Reference",
			filters={"reference_doctype": doctype, "reference_name": name, "docstatus": ("<", 2)},
			pluck="parent",
			distinct=True,
		):
			out.add(("Payment Entry", value))
	return out


def _walk(start, step):
	seen, todo = set(), [start]
	while todo and len(seen) < MAX_NODES:
		node = todo.pop(0)
		for nxt in step(*node):
			if nxt not in seen and nxt != start:
				seen.add(nxt)
				todo.append(nxt)
	return seen


def confirmed_by(versions):
	"""The user whose save moved docstatus 0 → 1, from a document's Version rows (oldest first)."""
	for row in versions or ():
		try:
			data = json.loads(row.get("data") or "{}")
		except ValueError:
			continue
		for change in data.get("changed") or ():
			if (
				len(change) == 3
				and change[0] == "docstatus"
				and cint(change[1]) == 0
				and cint(change[2]) == 1
			):
				return row.get("owner"), row.get("creation")
	return None, None


def _who(doctype, doc):
	made, confirmed = WHO.get(doctype, ("Capturó", "Confirmó"))
	people = [{"verb": made, "name": _person(doc.owner), "when": cstr(doc.creation)}]
	if cint(doc.docstatus) == 1:
		versions = frappe.get_all(
			"Version",
			filters={"ref_doctype": doctype, "docname": doc.name},
			fields=["owner", "creation", "data"],
			order_by="creation asc",
			limit=30,
		)
		user, when = confirmed_by(versions)
		if not user:  # submitted on insert (no 0 → 1 change logged)
			user, when = doc.owner, doc.creation
		if user:
			name = _person(user)
			if name == people[0]["name"] and verb_merges(doctype):
				people = []
			people.append({"verb": confirmed, "name": name, "when": cstr(when)})
	return people


def verb_merges(doctype):
	"""Receipt, bill and payment: when the same person captured and confirmed, say it once
	(«Recibió Ana»), not «Capturó Ana · Recibió Ana»."""
	return doctype in ("Purchase Receipt", "Purchase Invoice", "Payment Entry", "Supplier Quotation")


def _hidden(doctype, names, shown):
	"""How many live documents of this step exist that the caller cannot read (the names stay
	hidden): «1 que no puedes ver» instead of «todavía no». Cancelled ones and cobros don't count."""
	if not names or not _exists(doctype):
		return 0
	filters = {"name": ("in", list(names)), "docstatus": ("<", 2)}
	if doctype == "Payment Entry":
		filters["payment_type"] = "Pay"
	live = set(frappe.get_all(doctype, filters=filters, pluck="name", limit=MAX_NODES))
	return len(live - shown)


def _docs(doctype, names, here):
	if not names or not _exists(doctype) or not readable(doctype):
		return []
	fields = ["name", "status", "docstatus", "owner", "creation", *_FIELDS.get(doctype, ())]
	rows = frappe.get_list(doctype, filters={"name": ("in", list(names))}, fields=fields, limit=MAX_NODES)
	out = []
	for doc in rows:
		if cint(doc.docstatus) == 2 and (doctype, doc.name) != here:
			continue
		if doctype == "Payment Entry" and doc.get("payment_type") != "Pay":
			continue
		out.append(
			{
				"doctype": doctype,
				"name": doc.name,
				"title": doc.get("title") or "",
				"status": doc.status or "",
				"docstatus": cint(doc.docstatus),
				"date": cstr(doc.get("date") or ""),
				"amount": doc.get("amount"),
				"currency": doc.get("currency") or "",
				"here": (doctype, doc.name) == here,
				"people": _who(doctype, doc),
			}
		)
	out.sort(key=lambda d: (d["date"], d["name"]))
	return out


def chain(doctype, name):
	"""{stages: [{key, label, docs, hidden}], here: {doctype, name}} for a readable purchase document."""
	if doctype not in STAGE_OF or not _exists(doctype):
		return {"stages": [], "here": {"doctype": doctype, "name": name}}
	if not frappe.has_permission(doctype, "read", name):
		frappe.throw(
			_("You cannot open these documents. Ask your manager for access."), frappe.PermissionError
		)
	here = (doctype, name)
	nodes = {here} | _walk(here, _up) | _walk(here, _down)
	by_doctype = {}
	for dt, dn in nodes:
		by_doctype.setdefault(dt, set()).add(dn)
	stages = []
	for key, label, doctypes in STAGES:
		docs, hidden = [], 0
		for dt in doctypes:
			found = _docs(dt, by_doctype.get(dt), here)
			docs += found
			hidden += _hidden(dt, by_doctype.get(dt), {d["name"] for d in found})
		stages.append({"key": key, "label": label, "docs": docs, "hidden": hidden})
	return {"stages": stages, "here": {"doctype": doctype, "name": name}}


@frappe.whitelist()
def cadena(doctype: str, name: str):
	"""«Creado desde» for a purchase document: its whole chain with who did each step."""
	return chain(cstr(doctype), cstr(name))
