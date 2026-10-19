"""Ventas (Shell SPEC §6 DD6, DD7; session D2): where a sales document came from.

`cadena` is the «Creado desde» chain (Cotización → Pedido → Entrega → Factura → Cobro) of one
document: its ancestors and its descendants through ERPNext's own links, each step with its
documents and state. `atribucion` answers «¿De dónde vino?»: the channel (tienda / POS profile,
tienda en línea through the `SO:<name>` Deal, WhatsApp, Mercado Libre, mostrador), the campaign
(utm and `marketing_campaign` through the Deal, its Lead or the Customer), the seller (sales
team, else who captured it) and who did each step. `origen` returns both for the record panel in
one call. `estado_de_cuenta` is a customer's open invoices and last payments, `registrar_cobro`
a draft payment against one open invoice (the screens' «Registrar cobro»).

Read only, as the caller: every list goes through `frappe.get_list` (permissions and User
Permissions), the Deal and the Lead only when the worker may read them. Without ERPNext the
readers answer `{"available": False}`; without doco_marketing the campaign part is empty.
"""

import json
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, nowdate

from crm.api import documentos

# The chain's steps in order: (key, doctype, label).
STEPS = (
	("cotizacion", "Quotation", "Cotización"),
	("pedido", "Sales Order", "Pedido"),
	("entrega", "Delivery Note", "Entrega"),
	("factura", "Sales Invoice", "Factura"),
	("cobro", "Payment Entry", "Cobro"),
)
STEP_OF = {doctype: key for key, doctype, _label in STEPS}
SALES = (*STEP_OF, "POS Invoice")
MAX_DOCS = 40  # per step; a chain longer than this is not a chain any more
MAX_WHO = 12  # documents whose «who did it» we read (Version rows)


def _erpnext():
	return "erpnext" in frappe.get_installed_apps()


def _has(doctype, field):
	return documentos._exists(doctype) and frappe.get_meta(doctype).has_field(field)


def _open_doc(doctype, name):
	if doctype not in SALES:
		frappe.throw(_("This document has no sales chain."), frappe.ValidationError)
	documentos._require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return doc


def _child_links(child, match_field, values, out_field):
	"""(parent, value) pairs of a child table, for documents not cancelled."""
	values = [v for v in values if v]
	# `parent` is a standard column, not a field: meta.has_field() says no for it.
	if not values or not documentos._exists(child):
		return []
	if any(f != "parent" and not _has(child, f) for f in (match_field, out_field)):
		return []
	rows = frappe.get_all(
		child,
		filters={match_field: ["in", values], "docstatus": ["<", 2]},
		fields=["parent", out_field],
		distinct=True,
		limit_page_length=MAX_DOCS * 4,
	)
	return [(r.parent, r.get(out_field)) for r in rows]


def _parents(child, match_field, values):
	return {parent for parent, _v in _child_links(child, match_field, values, match_field)}


def _values(child, parents, field):
	"""Values of `field` on the items of `parents` (an invoice's orders)."""
	return {v for _p, v in _child_links(child, "parent", parents, field) if v}


def _payments_for(names):
	names = [n for n in names if n]
	if not names or not documentos._exists("Payment Entry Reference"):
		return set()
	rows = frappe.get_all(
		"Payment Entry Reference",
		filters={"reference_name": ["in", names], "docstatus": ["<", 2], "parenttype": "Payment Entry"},
		pluck="parent",
		limit_page_length=MAX_DOCS * 4,
	)
	return set(rows)


def _references(payment):
	rows = frappe.get_all(
		"Payment Entry Reference",
		filters={"parent": payment, "parenttype": "Payment Entry"},
		fields=["reference_doctype", "reference_name"],
	)
	out = {}
	for r in rows:
		out.setdefault(r.reference_doctype, set()).add(r.reference_name)
	return out


def _lineage(doctype, name):
	"""{doctype: set(names)} for the chain of one document: up to its origins, down to what
	came from it (never its siblings: a second order of the same quotation is not this one's)."""
	up = {dt: set() for dt in STEP_OF}
	if doctype == "POS Invoice":
		return up
	up[doctype].add(name)
	# Up: payment → invoices and orders; invoice → orders, deliveries; delivery → orders,
	# invoices (a delivery made from an invoice); order → quotations.
	if doctype == "Payment Entry":
		refs = _references(name)
		up["Sales Invoice"] |= refs.get("Sales Invoice", set())
		up["Sales Order"] |= refs.get("Sales Order", set())
	if up["Sales Invoice"]:
		up["Sales Order"] |= _values("Sales Invoice Item", up["Sales Invoice"], "sales_order")
		up["Delivery Note"] |= _values("Sales Invoice Item", up["Sales Invoice"], "delivery_note")
	if up["Delivery Note"]:
		up["Sales Order"] |= _values("Delivery Note Item", up["Delivery Note"], "against_sales_order")
		if doctype == "Delivery Note":
			up["Sales Invoice"] |= _values("Delivery Note Item", up["Delivery Note"], "against_sales_invoice")
	if up["Sales Order"]:
		up["Quotation"] |= _values("Sales Order Item", up["Sales Order"], "prevdoc_docname")
	# Down from the document itself (and what it already reaches).
	down = {dt: set() for dt in STEP_OF}
	down[doctype].add(name)
	order = [dt for _k, dt, _l in STEPS]
	start = order.index(doctype)
	if start <= 0:
		down["Sales Order"] |= _parents("Sales Order Item", "prevdoc_docname", down["Quotation"])
	if start <= 1:
		down["Delivery Note"] |= _parents("Delivery Note Item", "against_sales_order", down["Sales Order"])
		down["Sales Invoice"] |= _parents("Sales Invoice Item", "sales_order", down["Sales Order"])
	if start <= 2:
		down["Sales Invoice"] |= _parents("Sales Invoice Item", "delivery_note", down["Delivery Note"])
	if start <= 3:
		if doctype == "Sales Invoice":
			down["Delivery Note"] |= _parents(
				"Delivery Note Item", "against_sales_invoice", down["Sales Invoice"]
			)
		down["Payment Entry"] |= _payments_for(down["Sales Invoice"] | down["Sales Order"])
	for dt in STEP_OF:
		up[dt] |= down[dt]
	return up


def _rows(doctype, names):
	"""Display rows of `names` the worker may read (title, status, amount, date), and how
	many more exist that they may not."""
	names = sorted(names)[:MAX_DOCS]
	if not names or not documentos.readable(doctype):
		return [], len(names)
	meta = frappe.get_meta(doctype)
	display = documentos._display(meta)
	extra = [
		f
		for f in ("per_delivered", "per_billed", "payment_type", "is_return", "update_stock")
		if meta.has_field(f)
	]
	found = frappe.get_list(
		doctype,
		filters={"name": ["in", names]},
		fields=sorted(set(documentos._wanted_fields(meta, display, None)) | set(extra)),
		order_by=documentos._order_by(meta, display, None),
		limit_page_length=MAX_DOCS,
	)
	rows = [documentos._row(doc, display) for doc in found]
	documentos._party_titles(doctype, found, rows)
	for doc, row in zip(found, rows, strict=False):
		row["fields"] = {f: doc.get(f) for f in extra}
	return rows, max(0, len(names) - len(rows))


def _step_state(rows, hidden):
	if any(r["docstatus"] == 1 for r in rows):
		return "done"
	if rows:
		return "draft"
	return "done" if hidden else "none"


def _partial(key, steps_rows):
	"""A step that is there but not complete: an order delivered or billed in part, an
	invoice still owed after a payment."""
	orders = [r for r in steps_rows.get("pedido", []) if r["docstatus"] == 1]
	if key == "entrega" and orders:
		return any(flt(r["fields"].get("per_delivered")) < 100 for r in orders)
	if key == "factura" and orders:
		return any(flt(r["fields"].get("per_billed")) < 100 for r in orders)
	if key == "cobro":
		invoices = [r for r in steps_rows.get("factura", []) if r["docstatus"] == 1]
		return any(flt(r.get("outstanding")) > 0 for r in invoices)
	return False


def _chain(doc):
	lineage = _lineage(doc.doctype, doc.name)
	current = STEP_OF.get(doc.doctype)
	steps_rows, out = {}, []
	for key, doctype, _label in STEPS:
		steps_rows[key], hidden = _rows(doctype, lineage[doctype])
		steps_rows[key + ":hidden"] = hidden
	first = next(
		(i for i, (key, _dt, _l) in enumerate(STEPS) if steps_rows[key] or steps_rows[key + ":hidden"]),
		None,
	)
	if first is None or not current:
		return []
	for key, doctype, label in STEPS[first:]:
		rows, hidden = steps_rows[key], steps_rows[key + ":hidden"]
		state = _step_state(rows, hidden)
		out.append(
			{
				"key": key,
				"doctype": doctype,
				"label": label,
				"state": state,
				"partial": bool(rows) and state == "done" and _partial(key, steps_rows),
				"current": key == current,
				"docs": rows,
				"hidden": hidden,
			}
		)
	return out


@frappe.whitelist()
def cadena(doctype: str, name: str):
	"""The «Creado desde» chain of one sales document: `{available, steps}`; each step
	`{key, doctype, label, state: done|draft|none, partial, current, docs, hidden}`."""
	if not _erpnext():
		return {"available": False, "steps": []}
	doc = _open_doc(doctype, name)
	return {"available": True, "steps": _chain(doc)}


# D1's `rastrear_documento` looks for this name.
chain = cadena


# ── Atribución (DD7) ──────────────────────────────────────────────────────────


def _readable_doc(doctype, name):
	if not name or not documentos._exists(doctype):
		return None
	if not frappe.db.exists(doctype, name) or not frappe.has_permission(doctype, "read", name):
		return None
	return frappe.get_doc(doctype, name)


def _first_value(doctype, names, field):
	if not names or not _has(doctype, field):
		return None
	for value in frappe.get_all(doctype, filters={"name": ["in", list(names)]}, pluck=field):
		if value:
			return value
	return None


def _deal_name(doc, lineage):
	"""The CRM Deal behind a sale: the document's own `crm_deal`, its chain's, else the Deal the
	web shop tagged with `source_campaign = "SO:<order>"`."""
	if doc.meta.has_field("crm_deal") and doc.get("crm_deal"):
		return doc.crm_deal
	for doctype in ("Sales Order", "Quotation", "Sales Invoice"):
		found = _first_value(doctype, lineage.get(doctype), "crm_deal")
		if found:
			return found
	orders = list(lineage.get("Sales Order") or [])
	if orders and _has("CRM Deal", "source_campaign"):
		tags = [f"SO:{o}" for o in orders]
		found = frappe.get_all("CRM Deal", filters={"source_campaign": ["in", tags]}, pluck="name", limit=1)
		if found:
			return found[0]
	return None


def _shop_of(pos_profile):
	"""The store a POS profile sells for: its Mercado Shop's name, else the profile's own."""
	if not pos_profile:
		return ""
	if documentos._exists("Mercado Shop POS Profile") and documentos._exists("Mercado Shop"):
		shop = frappe.get_all(
			"Mercado Shop POS Profile",
			filters={"pos_profile": pos_profile, "parenttype": "Mercado Shop"},
			pluck="parent",
			limit=1,
		)
		if shop:
			label = frappe.db.get_value("Mercado Shop", shop[0], "shop_name")
			if label:
				return label
	return pos_profile


_MELI = ("mercado libre", "mercadolibre", "meli")


def _is_meli(*values):
	text = " ".join(cstr(v).lower() for v in values if v)
	return any(word in text for word in _MELI)


def _whatsapp_deal(deal):
	if not deal or not _has("WhatsApp Message", "reference_doctype"):
		return False
	return bool(
		frappe.db.exists("WhatsApp Message", {"reference_doctype": "CRM Deal", "reference_name": deal})
	)


def _canal(doc, lineage, deal):
	"""(kind, label, detail): tienda · web · mercado_libre · whatsapp · mostrador."""
	pos_profile = doc.get("pos_profile") if doc.meta.has_field("pos_profile") else None
	if not pos_profile:
		pos_profile = _first_value("Sales Invoice", lineage.get("Sales Invoice"), "pos_profile")
	if not pos_profile and doc.doctype == "Quotation" and doc.meta.has_field("posa_pos_profile"):
		pos_profile = doc.get("posa_pos_profile")
	orders = lineage.get("Sales Order") or set()
	web = bool(_first_value("Sales Order", orders, "is_storefront_order"))
	deal_doc = deal["doc"] if deal else None
	if not web and deal_doc and cstr(deal_doc.get("source_campaign")).startswith("SO:"):
		web = True
	if _is_meli(
		pos_profile,
		deal_doc and deal_doc.get("source"),
		deal_doc and deal_doc.get("utm_source"),
		doc.get("source") if doc.meta.has_field("source") else None,
	):
		return {"kind": "mercado_libre", "label": _("Mercado Libre"), "detail": ""}
	if web:
		return {"kind": "web", "label": _("Online store"), "detail": _("Order placed on the web shop")}
	if deal and deal.get("whatsapp"):
		return {"kind": "whatsapp", "label": "WhatsApp", "detail": _("The deal was talked over WhatsApp")}
	if pos_profile:
		return {
			"kind": "tienda",
			"label": _shop_of(pos_profile),
			"detail": _("Sold at the till ({0})").format(pos_profile),
		}
	return {"kind": "mostrador", "label": _("Counter"), "detail": _("Captured by staff")}


def _campana(doc, deal):
	"""Campaign words from the Deal (or its Lead), the web order's campaign, else the
	Customer's: `{label, source, medium, first_touch, last_touch}`; None when there is none."""
	fields = {}
	deal_doc = deal["doc"] if deal else None
	if deal_doc:
		if deal_doc.get("marketing_campaign"):
			fields["label"] = documentos._link_title("CRM Campaign", deal_doc.marketing_campaign)
		for key in (
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"marketing_first_touch",
			"marketing_last_touch",
		):
			if deal_doc.get(key):
				fields[key] = cstr(deal_doc.get(key))
		lead = _readable_doc("CRM Lead", deal_doc.get("lead")) if deal_doc.get("lead") else None
		if lead:
			for key in ("utm_source", "utm_medium", "utm_campaign"):
				if lead.get(key) and key not in fields:
					fields[key] = cstr(lead.get(key))
		if deal_doc.get("source") and "utm_source" not in fields:
			fields["source"] = documentos._link_title("CRM Lead Source", deal_doc.source)
	if "label" not in fields and doc.doctype == "Sales Order" and doc.meta.has_field("storefront_campaign"):
		if doc.get("storefront_campaign"):
			fields["label"] = cstr(doc.storefront_campaign)
	customer = doc.get("customer") if doc.meta.has_field("customer") else None
	if "label" not in fields and customer and _has("Customer", "marketing_campaign"):
		if frappe.has_permission("Customer", "read", customer):
			campaign = frappe.db.get_value("Customer", customer, "marketing_campaign")
			if campaign:
				fields["label"] = documentos._link_title("Campaign", campaign)
	if "label" not in fields and fields.get("utm_campaign"):
		fields["label"] = fields["utm_campaign"]
	if not fields:
		return None
	return {
		"label": fields.get("label") or "",
		"source": fields.get("utm_source") or fields.get("source") or "",
		"medium": fields.get("utm_medium") or "",
		"first_touch": fields.get("marketing_first_touch") or "",
		"last_touch": fields.get("marketing_last_touch") or "",
	}


def _team(doctype, names):
	if not names or not _has(doctype, "sales_team") or not documentos._exists("Sales Team"):
		return []
	rows = frappe.get_all(
		"Sales Team",
		filters={"parent": ["in", list(names)], "parenttype": doctype},
		fields=["sales_person", "allocated_percentage"],
		order_by="allocated_percentage desc, idx asc",
	)
	seen, out = set(), []
	for r in rows:
		if r.sales_person and r.sales_person not in seen:
			seen.add(r.sales_person)
			out.append({"name": r.sales_person, "percent": flt(r.allocated_percentage)})
	return out


def _vendedor(doc, lineage):
	"""The sales team of the document (or its order, then its quotation), else who captured it."""
	team = _team(doc.doctype, [doc.name])
	for doctype in ("Sales Order", "Sales Invoice", "Quotation"):
		if team:
			break
		team = _team(doctype, lineage.get(doctype))
	if team:
		return {"kind": "equipo", "people": team}
	owner = doc.owner
	if doc.doctype != "Quotation" and lineage.get("Sales Order"):
		owner = frappe.db.get_value("Sales Order", sorted(lineage["Sales Order"])[0], "owner") or owner
	return {"kind": "captura", "people": [{"name": documentos._person(owner), "percent": None}]}


def _submitter(doctype, name):
	"""Who confirmed a document: the Version that moved docstatus 0 → 1."""
	for row in frappe.get_all(
		"Version",
		filters={"ref_doctype": doctype, "docname": name},
		fields=["owner", "data", "creation"],
		order_by="creation asc",
		limit_page_length=20,
	):
		try:
			changed = (json.loads(row.data or "{}") or {}).get("changed") or []
		except ValueError:
			continue
		for field, old, new in changed:
			if field == "docstatus" and cint(old) == 0 and cint(new) == 1:
				return row.owner, cstr(row.creation)
	return None, None


def _pasos(steps):
	"""Who did each step: created by, confirmed by (full names, never emails)."""
	out, budget = [], MAX_WHO
	for step in steps:
		for row in step["docs"]:
			if budget <= 0:
				return out
			budget -= 1
			owner, created = frappe.db.get_value(step["doctype"], row["name"], ["owner", "creation"]) or (
				None,
				None,
			)
			entry = {
				"step": step["key"],
				"label": step["label"],
				"doctype": step["doctype"],
				"name": row["name"],
				"created_by": documentos._person(owner),
				"created_at": cstr(created),
			}
			if row["docstatus"] == 1:
				user, at = _submitter(step["doctype"], row["name"])
				if user:
					entry["confirmed_by"] = documentos._person(user)
					entry["confirmed_at"] = at
			out.append(entry)
	return out


def _atribucion(doc, steps=None):
	lineage = _lineage(doc.doctype, doc.name)
	deal = None
	deal_name = _deal_name(doc, lineage)
	deal_doc = _readable_doc("CRM Deal", deal_name) if deal_name else None
	if deal_doc:
		deal = {"doc": deal_doc, "whatsapp": _whatsapp_deal(deal_name)}
	steps = _chain(doc) if steps is None else steps
	return {
		"canal": _canal(doc, lineage, deal),
		"campana": _campana(doc, deal),
		"vendedor": _vendedor(doc, lineage),
		"trato": {
			"name": deal_name,
			"title": cstr(deal_doc.get("organization") or deal_doc.get("lead_name") or ""),
		}
		if deal_doc
		else None,
		"pasos": _pasos(steps),
	}


@frappe.whitelist()
def atribucion(doctype: str, name: str):
	"""«¿De dónde vino?»: `{available, canal, campana, vendedor, trato, pasos}`."""
	if not _erpnext():
		return {"available": False}
	doc = _open_doc(doctype, name)
	return {"available": True, **_atribucion(doc)}


@frappe.whitelist()
def origen(doctype: str, name: str):
	"""The record panel's one call: the chain and the attribution of a sales document."""
	if not _erpnext():
		return {"available": False, "steps": []}
	doc = _open_doc(doctype, name)
	steps = _chain(doc)
	return {"available": True, "steps": steps, **_atribucion(doc, steps)}


# ── Estado de cuenta y cobro (the bot's faces of the screens; DD16) ───────────


OWED = (
	"Unpaid",
	"Partly Paid",
	"Overdue",
	"Unpaid and Discounted",
	"Partly Paid and Discounted",
	"Overdue and Discounted",
)


@frappe.whitelist()
def estado_de_cuenta(customer: str, limit: int | str = 20):
	"""A customer's open invoices (oldest due first), what they owe, how much is overdue and
	their last payments: the Facturas list «Por cobrar» filtered to the customer."""
	if not _erpnext():
		return {"available": False}
	documentos._require("Sales Invoice")
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("That customer does not exist."), frappe.DoesNotExistError)
	if not frappe.has_permission("Customer", "read", customer):
		documentos._no_perm()
	limit = max(1, min(cint(limit) or 20, 50))
	invoices = frappe.get_list(
		"Sales Invoice",
		filters={
			"customer": customer,
			"docstatus": 1,
			"status": ["in", list(OWED)],
			"outstanding_amount": [">", 0],
		},
		fields=[
			"name",
			"posting_date",
			"due_date",
			"grand_total",
			"outstanding_amount",
			"currency",
			"status",
		],
		order_by="due_date asc, posting_date asc",
		limit_page_length=limit,
	)
	today = getdate(nowdate())
	owed = sum(flt(i.outstanding_amount) for i in invoices)
	overdue = sum(flt(i.outstanding_amount) for i in invoices if i.due_date and getdate(i.due_date) < today)
	payments = []
	if documentos.readable("Payment Entry"):
		payments = frappe.get_list(
			"Payment Entry",
			filters={"party_type": "Customer", "party": customer, "docstatus": 1, "payment_type": "Receive"},
			fields=["name", "posting_date", "paid_amount", "mode_of_payment"],
			order_by="posting_date desc",
			limit_page_length=5,
		)
	return {
		"available": True,
		"customer": customer,
		"title": documentos._link_title("Customer", customer),
		"owed": owed,
		"overdue": overdue,
		"invoices": [
			{
				"name": i.name,
				"date": cstr(i.posting_date),
				"due": cstr(i.due_date) if i.due_date else None,
				"amount": flt(i.grand_total),
				"outstanding": flt(i.outstanding_amount),
				"currency": i.currency,
				"overdue": bool(i.due_date and getdate(i.due_date) < today),
			}
			for i in invoices
		],
		"payments": [
			{
				"name": p.name,
				"date": cstr(p.posting_date),
				"amount": flt(p.paid_amount),
				"mode": p.mode_of_payment,
			}
			for p in payments
		],
		"route": f"/documentos/facturas?f_customer={quote(customer)}",
	}


@frappe.whitelist(methods=["POST"])
def registrar_cobro(
	invoice: str,
	amount: float | str | None = None,
	mode_of_payment: str | None = None,
	reference_no: str | None = None,
):
	"""A DRAFT payment against one open invoice (never submitted here): ERPNext's own
	`get_payment_entry` through the documentos mapper allowlist, as the caller, then the
	amount and the way it was paid. The worker confirms it on the record («Confirmar»)."""
	if not _erpnext():
		frappe.throw(_("Sales are not set up on this site."), frappe.ValidationError)
	invoice_doc = _open_doc("Sales Invoice", invoice)
	if cint(invoice_doc.docstatus) != 1 or flt(invoice_doc.outstanding_amount) <= 0:
		frappe.throw(_("This invoice has nothing left to collect."), frappe.ValidationError)
	value = None
	if amount not in (None, ""):
		value = min(flt(amount), flt(invoice_doc.outstanding_amount))
		if value <= 0:
			frappe.throw(_("The amount must be more than zero."), frappe.ValidationError)
	values = {}
	if mode_of_payment:
		values["mode_of_payment"] = mode_of_payment
	if reference_no:
		values["reference_no"] = cstr(reference_no)[:140]
	saved = documentos.save(
		"Payment Entry",
		values=values,
		source={"make": "payment", "doctype": "Sales Invoice", "name": invoice},
	)
	if value is not None:
		pay = frappe.get_doc("Payment Entry", saved["name"])
		pay.paid_amount = value
		pay.received_amount = value
		for ref in pay.references:
			if ref.reference_name == invoice:
				ref.allocated_amount = value
		pay.set_amounts()
		pay.save()
	pay = frappe.get_doc("Payment Entry", saved["name"])
	return {
		"name": pay.name,
		"docstatus": cint(pay.docstatus),
		"amount": flt(pay.paid_amount),
		"invoice": invoice,
		"route": f"/documentos/cobros/{quote(pay.name)}",
	}


# ── Ventas de un cliente (Contacto «Relaciones» → the lists filtered to them) ──

# doctype → the field that names the customer on it (the list's «Filtros» key).
CUSTOMER_FIELD = {
	"Quotation": "party_name",
	"Sales Order": "customer",
	"Delivery Note": "customer",
	"Sales Invoice": "customer",
	"POS Invoice": "customer",
	"Payment Entry": "party",
}


@frappe.whitelist()
def ventas_del_cliente(customer: str):
	"""How many of each sales document a customer has, and how many ask for action
	(`documentos.ATTENTION`), for the lists the worker may read: `[{doctype, field, count, open}]`."""
	if not _erpnext() or not customer:
		return []
	if not frappe.db.exists("Customer", customer) or not frappe.has_permission("Customer", "read", customer):
		return []
	blocked = documentos._blocked_modules()
	out = []
	for doctype, field in CUSTOMER_FIELD.items():
		if not documentos.readable(doctype, blocked):
			continue
		base = [[doctype, field, "=", customer]]
		if doctype == "Quotation":
			base.append([doctype, "quotation_to", "=", "Customer"])
		if doctype == "Payment Entry":
			base += [[doctype, "party_type", "=", "Customer"], [doctype, "payment_type", "=", "Receive"]]
		count = documentos._count(doctype, base)
		if not count:
			continue
		attention = documentos.ATTENTION.get(doctype)
		out.append(
			{
				"doctype": doctype,
				"field": field,
				"count": count,
				"open": documentos._count(doctype, base + attention) if attention else 0,
			}
		)
	return out
