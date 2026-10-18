"""Documentos: one engine for business documents in the Muelle shell (Shell Wave D, SPEC §6).

Lists, chip counts and a record bundle (document, display header, allowed actions,
Conexiones, Actividad) for the curated sales, purchase, payment and stock doctypes and,
through the same calls, for any doctype the worker can read (the generic floor).

Frappe permissions only: every read goes through `frappe.get_list` / `check_permission`,
fields above the worker's permlevel are dropped, and a doctype whose module is in the
worker's `User.block_modules` is unreadable here. Nothing is granted; ERPNext-specific
doctypes simply drop out where ERPNext is not installed.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_fullname, strip_html

# The module each curated doctype lights in the shell (SPEC §6 DD3). Order is the hub order.
DOCUMENTOS_DOCTYPES = (
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"POS Invoice",
	"Payment Entry",
	"Material Request",
	"Request for Quotation",
	"Supplier Quotation",
	"Purchase Order",
	"Purchase Receipt",
	"Purchase Invoice",
)
INVENTARIO_DOCTYPES = (
	"Stock Entry",
	"Stock Reconciliation",
	"Stock Ledger Entry",
	"Warehouse",
)
MODULE_DOCTYPES = {"documentos": DOCUMENTOS_DOCTYPES, "inventario": INVENTARIO_DOCTYPES}

# How a curated doctype reads in a list and a record header. `title` lists the party or name
# fields in preference order (never the ID); `amount`, `date` and `due` name the hero amount,
# the document date and the date that asks for action.
DISPLAY = {
	"Quotation": {"title": ("customer_name", "party_name"), "amount": "grand_total", "date": "transaction_date", "due": "valid_till", "party": ("quotation_to", "party_name")},
	"Sales Order": {"title": ("customer_name", "customer"), "amount": "grand_total", "date": "transaction_date", "due": "delivery_date", "party": ("Customer", "customer")},
	"Delivery Note": {"title": ("customer_name", "customer"), "amount": "grand_total", "date": "posting_date", "party": ("Customer", "customer")},
	"Sales Invoice": {"title": ("customer_name", "customer"), "amount": "grand_total", "date": "posting_date", "due": "due_date", "outstanding": "outstanding_amount", "party": ("Customer", "customer")},
	"POS Invoice": {"title": ("customer_name", "customer"), "amount": "grand_total", "date": "posting_date", "party": ("Customer", "customer")},
	"Payment Entry": {"title": ("party_name", "party"), "amount": "paid_amount", "currency": "paid_from_account_currency", "date": "posting_date", "party": ("party_type", "party")},
	"Material Request": {"title": ("title",), "date": "transaction_date", "due": "schedule_date"},
	"Request for Quotation": {"title": (), "date": "transaction_date", "due": "schedule_date"},
	"Supplier Quotation": {"title": ("supplier_name", "supplier"), "amount": "grand_total", "date": "transaction_date", "due": "valid_till", "party": ("Supplier", "supplier")},
	"Purchase Order": {"title": ("supplier_name", "supplier"), "amount": "grand_total", "date": "transaction_date", "due": "schedule_date", "party": ("Supplier", "supplier")},
	"Purchase Receipt": {"title": ("supplier_name", "supplier"), "amount": "grand_total", "date": "posting_date", "party": ("Supplier", "supplier")},
	"Purchase Invoice": {"title": ("supplier_name", "supplier"), "amount": "grand_total", "date": "posting_date", "due": "due_date", "outstanding": "outstanding_amount", "party": ("Supplier", "supplier")},
	"Stock Entry": {"title": ("title", "stock_entry_type"), "amount": "total_amount", "date": "posting_date"},
	"Stock Reconciliation": {"title": ("purpose",), "date": "posting_date"},
	"Stock Ledger Entry": {"title": ("item_code",), "date": "posting_date"},
	"Warehouse": {"title": ("warehouse_name",)},
}

MAX_PAGE = 100
MAX_CHIPS = 12
MAX_SEARCH = 140
_ORDER = re.compile(r"^([a-z_][a-z0-9_]*)(?:\s+(asc|desc))?$", re.I)
_STANDARD = ("name", "owner", "creation", "modified", "modified_by", "docstatus", "idx")
_LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"}
_HIDDEN_TYPES = _LAYOUT | {"Table", "Table MultiSelect", "Password", "Code", "Signature", "Geolocation", "JSON"}
_ITEM_FIELDS = (
	"item_code",
	"item_name",
	"description",
	"qty",
	"uom",
	"stock_uom",
	"rate",
	"amount",
	"warehouse",
	"s_warehouse",
	"t_warehouse",
	"image",
	"discount_percentage",
	"delivered_qty",
	"received_qty",
	"billed_amt",
	"ordered_qty",
)
_TOTAL_FIELDS = (
	"total_qty",
	"net_total",
	"total",
	"discount_amount",
	"total_taxes_and_charges",
	"grand_total",
	"rounding_adjustment",
	"rounded_total",
	"paid_amount",
	"outstanding_amount",
	"advance_paid",
	"per_delivered",
	"per_billed",
	"per_received",
	"per_ordered",
)


# ── Access ────────────────────────────────────────────────────────────────────


def _blocked_modules():
	user = frappe.session.user
	if user == "Administrator":
		return set()
	return {row.module for row in frappe.get_cached_doc("User", user).get("block_modules") or []}


def _exists(doctype):
	return bool(doctype) and bool(frappe.db.exists("DocType", doctype))


def readable(doctype, blocked=None):
	"""True when the worker may list `doctype` here: it exists, it is a normal document type,
	Frappe grants read, and its module is not blocked for the user."""
	if not isinstance(doctype, str) or not _exists(doctype):
		return False
	meta = frappe.get_meta(doctype)
	if meta.istable or meta.issingle or meta.is_virtual:
		return False
	if meta.module in (_blocked_modules() if blocked is None else blocked):
		return False
	return bool(frappe.has_permission(doctype, "read"))


def _require(doctype):
	if not readable(doctype):
		frappe.throw(_("You cannot open these documents. Ask your manager for access."), frappe.PermissionError)
	return frappe.get_meta(doctype)


def get_capabilities(module):
	"""Shell capability for `documentos` or `inventario`: on when at least one of its doctypes
	is readable (SPEC §6 DD3). Neutral: no Ventas or CRM gate."""
	if frappe.session.user == "Guest":
		return {"enabled": False, "reason": _("Sign in to open your documents."), "capabilities": {}}
	blocked = _blocked_modules()
	doctypes = [dt for dt in MODULE_DOCTYPES[module] if readable(dt, blocked)]
	if not doctypes:
		return {
			"enabled": False,
			"reason": _("Your user cannot read any of these documents. Ask the owner or the manager for access."),
			"capabilities": {},
		}
	return {
		"enabled": True,
		"reason": None,
		"capabilities": {
			"read": True,
			"doctypes": doctypes,
			"create": [dt for dt in doctypes if frappe.has_permission(dt, "create")],
		},
	}


def check_documentos_permission():
	return bool(get_capabilities("documentos").get("enabled"))


def check_inventario_permission():
	return bool(get_capabilities("inventario").get("enabled"))


# ── Display ───────────────────────────────────────────────────────────────────


def _display(meta):
	known = DISPLAY.get(meta.name) or {}
	title = tuple(f for f in known.get("title", ()) if meta.has_field(f))
	if not title and meta.title_field and meta.title_field != "name" and meta.has_field(meta.title_field):
		title = (meta.title_field,)
	status = "status" if meta.has_field("status") else None

	def field(key, fallbacks=()):
		value = known.get(key)
		if value and meta.has_field(value):
			return value
		for name in fallbacks:
			if meta.has_field(name):
				return name
		return None

	return {
		"title": title,
		"status": status,
		"amount": field("amount", () if known else ("grand_total",)),
		"currency": field("currency", ("currency",)),
		"date": field("date", () if known else ("posting_date", "transaction_date", "date")),
		"due": field("due"),
		"outstanding": field("outstanding"),
	}


def _list_fields(meta):
	"""In-list fields for the generic floor (any doctype)."""
	fields = []
	for df in meta.fields:
		if df.in_list_view and df.fieldtype not in _HIDDEN_TYPES and not df.permlevel:
			fields.append(df.fieldname)
	return fields[:6]


def _row(doc, display):
	title = next((cstr(doc.get(f)).strip() for f in display["title"] if cstr(doc.get(f)).strip()), "")
	return {
		"name": doc.name,
		"title": title,
		"status": doc.get(display["status"]) if display["status"] else None,
		"docstatus": cint(doc.get("docstatus")),
		"amount": doc.get(display["amount"]) if display["amount"] else None,
		"currency": doc.get(display["currency"]) if display["currency"] else None,
		"date": cstr(doc.get(display["date"])) if display["date"] else None,
		"due": cstr(doc.get(display["due"])) if display["due"] and doc.get(display["due"]) else None,
		"outstanding": doc.get(display["outstanding"]) if display["outstanding"] else None,
		"modified": cstr(doc.get("modified")),
		"fields": doc,
	}


def _parse(value, default):
	if value in (None, ""):
		return default
	if isinstance(value, str):
		try:
			return json.loads(value)
		except ValueError:
			frappe.throw(_("The filters could not be read."), frappe.ValidationError)
	return value


def _order_by(meta, display, order_by):
	match = _ORDER.match(cstr(order_by).strip()) if order_by else None
	if match and (match.group(1) in _STANDARD or meta.has_field(match.group(1))):
		return f"`tab{meta.name}`.`{match.group(1)}` {(match.group(2) or 'desc').lower()}"
	field = display["date"] or "modified"
	return f"`tab{meta.name}`.`{field}` desc, `tab{meta.name}`.`modified` desc"


def _wanted_fields(meta, display, extra):
	fields = {"name", "docstatus", "modified"}
	fields.update(display["title"])
	for key in ("status", "amount", "currency", "date", "due", "outstanding"):
		if display[key]:
			fields.add(display[key])
	if not DISPLAY.get(meta.name):
		fields.update(_list_fields(meta))
	for key in ("party", "party_type", "payment_type", "purpose", "customer", "supplier", "company", "is_return", "return_against"):
		if meta.has_field(key):
			fields.add(key)
	for name in _parse(extra, []) or []:
		# Profiles may ask for more columns; only real, permlevel-0 fields of this doctype.
		df = meta.get_field(name) if isinstance(name, str) else None
		if df and not df.permlevel and df.fieldtype not in _HIDDEN_TYPES:
			fields.add(name)
	return sorted(fields)


def _search_filters(meta, display, search):
	term = cstr(search).strip()[:MAX_SEARCH]
	if not term:
		return None
	like = f"%{term}%"
	fields = ["name", *display["title"]]
	for key in ("customer_name", "supplier_name", "party_name", "title", "item_name"):
		if meta.has_field(key) and key not in fields:
			fields.append(key)
	if meta.search_fields:
		for key in (f.strip() for f in meta.search_fields.split(",")):
			if key and meta.has_field(key) and key not in fields:
				fields.append(key)
	return [[meta.name, field, "like", like] for field in fields[:8]]


# ── Lists ─────────────────────────────────────────────────────────────────────


@frappe.whitelist()
def rows(doctype, filters=None, search=None, order_by=None, start=0, limit=30, fields=None):
	"""One page of display rows: the party or name as title (never the ID), the status, the
	amount, the document and due dates. `fields` adds columns a profile needs."""
	meta = _require(doctype)
	display = _display(meta)
	limit = max(1, min(cint(limit) or 30, MAX_PAGE))
	found = frappe.get_list(
		doctype,
		fields=_wanted_fields(meta, display, fields),
		filters=_parse(filters, None),
		or_filters=_search_filters(meta, display, search),
		order_by=_order_by(meta, display, order_by),
		limit_start=max(0, cint(start)),
		limit_page_length=limit + 1,
	)
	return {
		"rows": [_row(doc, display) for doc in found[:limit]],
		"has_more": len(found) > limit,
		"label": _(doctype),
	}


def _count(doctype, filters, or_filters=None):
	from crm.api.doc import COUNT_NAME

	result = frappe.get_list(doctype, filters=filters, or_filters=or_filters, fields=[COUNT_NAME])
	return cint(result[0].total_count) if result else 0


@frappe.whitelist()
def counts(doctype, chips=None, search=None):
	"""Counts for a list's filter chips: `{key: filters}` → `{key: count}`."""
	meta = _require(doctype)
	chips = _parse(chips, {}) or {}
	if not isinstance(chips, dict):
		frappe.throw(_("The filters could not be read."), frappe.ValidationError)
	or_filters = _search_filters(meta, _display(meta), search)
	return {
		cstr(key)[:40]: _count(doctype, value or None, or_filters)
		for key, value in list(chips.items())[:MAX_CHIPS]
	}


# What asks for action in each curated list, for the hub's supporting line.
ATTENTION = {
	"Quotation": [["docstatus", "=", 1], ["status", "in", ["Open", "Replied"]]],
	"Sales Order": [["docstatus", "=", 1], ["status", "in", ["To Deliver and Bill", "To Deliver", "To Bill"]]],
	"Delivery Note": [["docstatus", "=", 1], ["status", "=", "To Bill"]],
	"Sales Invoice": [["docstatus", "=", 1], ["status", "in", ["Overdue", "Overdue and Discounted"]]],
	"Material Request": [["docstatus", "=", 1], ["status", "in", ["Pending", "Partially Ordered"]]],
	"Purchase Order": [["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]]],
	"Purchase Receipt": [["docstatus", "=", 1], ["status", "=", "To Bill"]],
	"Purchase Invoice": [["docstatus", "=", 1], ["status", "in", ["Overdue", "Overdue and Discounted"]]],
}


@frappe.whitelist()
def hub(module="documentos"):
	"""Per readable list of a module: drafts waiting and documents that ask for action."""
	if module not in MODULE_DOCTYPES:
		frappe.throw(_("The filters could not be read."), frappe.ValidationError)
	blocked = _blocked_modules()
	out = {}
	for doctype in MODULE_DOCTYPES[module]:
		if not readable(doctype, blocked):
			continue
		meta = frappe.get_meta(doctype)
		row = {"drafts": _count(doctype, [["docstatus", "=", 0]]) if meta.is_submittable else 0}
		if doctype in ATTENTION:
			row["attention"] = _count(doctype, ATTENTION[doctype])
		out[doctype] = row
	return out


@frappe.whitelist()
def search(q=None, limit=8):
	"""Palette `#`: documents by number or party across the curated lists this worker reads."""
	term = cstr(q).strip().lstrip("#").strip()[:MAX_SEARCH]
	if len(term) < 2:
		return []
	limit = max(1, min(cint(limit) or 8, 20))
	blocked = _blocked_modules()
	out = []
	for doctype in (*DOCUMENTOS_DOCTYPES, "Stock Entry", "Stock Reconciliation"):
		if not readable(doctype, blocked):
			continue
		meta = frappe.get_meta(doctype)
		display = _display(meta)
		fields = _wanted_fields(meta, display, None)
		found = frappe.get_list(
			doctype,
			fields=fields,
			or_filters=_search_filters(meta, display, term),
			order_by=f"`tab{doctype}`.`modified` desc",
			limit_page_length=3,
		)
		for doc in found:
			row = _row(doc, display)
			row["doctype"] = doctype
			out.append(row)
	out.sort(key=lambda row: row["modified"], reverse=True)
	return out[:limit]


@frappe.whitelist()
def doctypes(search=None):
	"""«Todos los tipos»: document types the worker can read, by their Spanish name."""
	from unidecode import unidecode

	term = unidecode(cstr(search).strip().lower())[:MAX_SEARCH]
	blocked = _blocked_modules()
	out = []
	for doctype in sorted(set(frappe.get_user().can_read)):
		meta = frappe.get_meta(doctype)
		if meta.istable or meta.issingle or meta.is_virtual or meta.module in blocked:
			continue
		label = _(doctype)
		if term and term not in unidecode(label.lower()) and term not in doctype.lower():
			continue
		out.append({"doctype": doctype, "label": label, "module": _(meta.module)})
	out.sort(key=lambda row: unidecode(row["label"].lower()))
	return out[:60]


# ── Record ────────────────────────────────────────────────────────────────────


def _person(user):
	"""A worker's full name; «Sistema» for automation; never an email."""
	if not user or user in ("Administrator", "Guest"):
		return _("System")
	name = get_fullname(user) or ""
	if not name or "@" in name:
		local = cstr(user).split("@")[0].replace(".", " ").replace("_", " ").strip()
		return local.title() if local else _("Someone")
	return name


def _actions(doc):
	meta = doc.meta
	docstatus = cint(doc.docstatus)
	has = lambda ptype: bool(doc.has_permission(ptype))  # noqa: E731
	can_create = bool(frappe.has_permission(doc.doctype, "create"))
	submittable = bool(meta.is_submittable)
	out = {}

	def put(key, allowed, reason=None):
		out[key] = {"allowed": bool(allowed), "reason": None if allowed else reason}

	no_perm = _("Your user does not have this permission.")
	put("edit", docstatus == 0 and has("write"), _("Only a draft can be edited.") if docstatus else no_perm)
	put("submit", submittable and docstatus == 0 and has("submit"), no_perm if docstatus == 0 else None)
	put(
		"cancel",
		submittable and docstatus == 1 and has("cancel"),
		_("Only a confirmed document can be cancelled.") if docstatus != 1 else no_perm,
	)
	put(
		"amend",
		submittable and docstatus == 2 and has("amend") and can_create,
		_("Only a cancelled document can be amended.") if docstatus != 2 else no_perm,
	)
	put(
		"delete",
		docstatus != 1 and has("delete"),
		_("Cancel it first; a confirmed document cannot be deleted.") if docstatus == 1 else no_perm,
	)
	put("duplicate", can_create and not meta.allow_copy, no_perm)
	put("comment", True)
	put("assign", has("read"))
	put("attach", has("write") or docstatus == 1, no_perm)
	put("share", has("share"), no_perm)
	put("print", has("print"), no_perm)
	put("email", has("email"), no_perm)
	return out


def _link_title(doctype, value):
	"""The title of a linked record when its doctype names records by a title field."""
	if not doctype or not value or not _exists(doctype):
		return None
	meta = frappe.get_meta(doctype)
	field = meta.title_field if meta.title_field and meta.title_field != "name" else None
	if not field and meta.show_title_field_in_link:
		field = meta.title_field
	if not field or not meta.has_field(field):
		return None
	try:
		return frappe.db.get_value(doctype, value, field)
	except Exception:
		return None


# Bookkeeping a worker never reads in Datos: the header, items and totals already show the rest.
_DATOS_SKIP = {
	"naming_series",
	"status",
	"title",
	"conversion_rate",
	"plc_conversion_rate",
	"price_list_currency",
	"rounding_adjustment",
	"rounded_total",
	"grand_total",
	"net_total",
	"total",
	"total_qty",
	"total_net_weight",
	"total_taxes_and_charges",
	"outstanding_amount",
	"discount_amount",
	"language",
	"letter_head",
	"select_print_heading",
	"group_same_items",
	"disable_rounded_total",
	"amount_eligible_for_commission",
	"ignore_pricing_rule",
	"apply_discount_on",
	"set_posting_time",
	"posting_time",
	"party_account_currency",
	"is_internal_customer",
	"is_internal_supplier",
	"scan_barcode",
	"company_address",
	"company_address_display",
	"address_display",
	"shipping_address",
	"contact_display",
	"customer_group",
	"territory",
}
_DATOS_PREFIXES = ("base_", "per_", "total_billing", "in_words", "advance_")


def _data_fields(doc, skip=()):
	"""Datos: fields with a value, labelled in the worker's language, by meta order."""
	out = []
	for df in doc.meta.fields:
		if df.fieldtype in _HIDDEN_TYPES or df.hidden or df.fieldname not in doc.__dict__:
			continue
		name = df.fieldname
		if name in _DATOS_SKIP or name in skip or name.startswith(_DATOS_PREFIXES) or name.endswith("_in_words"):
			continue
		if name == "currency" and doc.get("currency") == frappe.get_cached_value(
			"Company", doc.get("company"), "default_currency"
		):
			continue
		value = doc.get(df.fieldname)
		if value in (None, "", 0, 0.0) and df.fieldtype not in ("Check",):
			continue
		if df.fieldtype == "Check" and not value:
			continue
		row = {
			"fieldname": df.fieldname,
			"label": _(df.label) if df.label else df.fieldname,
			"fieldtype": df.fieldtype,
			"options": df.options if df.fieldtype in ("Link", "Select", "Currency") else None,
			"value": value,
		}
		if df.fieldtype == "Link":
			row["title"] = _link_title(df.options, value)
		elif df.fieldtype == "Dynamic Link":
			row["link_doctype"] = doc.get(df.options)
			row["title"] = _link_title(doc.get(df.options), value)
		elif df.fieldtype == "Select" and isinstance(value, str):
			row["title"] = _(value)
		elif df.fieldtype in ("Text Editor", "Text", "Small Text", "Long Text"):
			row["value"] = strip_html(cstr(value))[:600]
		out.append(row)
		if len(out) >= 60:
			break
	return out


def _header_fields(display):
	out = set(display["title"])
	for key in ("status", "amount", "date", "due", "outstanding"):
		if display[key]:
			out.add(display[key])
	return out


def _items(doc):
	table = None
	for df in doc.meta.get_table_fields():
		if df.fieldname == "items" or frappe.get_meta(df.options).has_field("item_code"):
			table = df
			break
	if not table:
		return None
	rows = []
	for row in doc.get(table.fieldname) or []:
		rows.append({"name": row.name, **{f: row.get(f) for f in _ITEM_FIELDS if row.get(f) not in (None, "")}})
	return {"fieldname": table.fieldname, "label": _(table.label or "Items"), "rows": rows}


def _taxes(doc):
	if not doc.meta.has_field("taxes"):
		return []
	return [
		{"description": cstr(row.get("description"))[:120], "amount": row.get("tax_amount"), "rate": row.get("rate")}
		for row in doc.get("taxes") or []
		if row.get("tax_amount")
	]


def _header(doc, display):
	row = _row(doc, display)
	party = None
	spec = DISPLAY.get(doc.doctype, {}).get("party")
	if spec:
		party_type = spec[0] if spec[0][:1].isupper() else doc.get(spec[0])
		party_name = doc.get(spec[1])
		if party_type and party_name:
			party = {"doctype": party_type, "name": party_name, "title": row["title"] or _link_title(party_type, party_name)}
	return {
		"title": row["title"],
		"number": doc.name,
		"status": row["status"],
		"docstatus": row["docstatus"],
		"amount": row["amount"],
		"currency": row["currency"] or doc.get("currency"),
		"date": row["date"],
		"due": row["due"],
		"outstanding": row["outstanding"],
		"party": party,
		"company": doc.get("company"),
		"is_return": cint(doc.get("is_return")),
		"amended_from": doc.get("amended_from"),
	}


def _connections(doc):
	"""Desk's Conexiones: the dashboard's groups with counts; each chip names the filter that
	opens the target list scoped to this record. Doctypes the worker cannot read are left out."""
	from frappe.desk.notifications import get_open_count

	try:
		data = doc.meta.get_dashboard_data()
	except Exception:
		return []
	if not data or not data.get("transactions"):
		return []
	try:
		found = (get_open_count(doc.doctype, doc.name) or {}).get("count") or {}
	except frappe.PermissionError:
		return []
	counts = {}
	for entry in (found.get("external_links_found") or []) if isinstance(found, dict) else []:
		counts[entry["doctype"]] = entry
	for entry in (found.get("internal_links_found") or []) if isinstance(found, dict) else []:
		counts[entry["doctype"]] = entry
	fieldname = data.get("fieldname")
	non_standard = data.get("non_standard_fieldnames") or {}
	blocked = _blocked_modules()
	groups = []
	for group in data.get("transactions") or []:
		items = []
		for target in group.get("items") or []:
			if not readable(target, blocked):
				continue
			entry = counts.get(target) or {}
			count = entry.get("count")
			names = entry.get("names")
			if names:
				filters = [[target, "name", "in", names]]
			else:
				field = non_standard.get(target, fieldname)
				filters = [[_field_doctype(target, field), field, "=", doc.name]] if field else None
			items.append(
				{
					"doctype": target,
					"label": _(target),
					"count": count if isinstance(count, int) else None,
					"open_count": entry.get("open_count") or 0,
					"filters": filters,
				}
			)
		if items:
			groups.append({"label": _(group.get("label") or ""), "items": items})
	return groups


def _field_doctype(doctype, fieldname):
	"""The doctype (parent or a child table) that holds `fieldname`, for a list filter."""
	meta = frappe.get_meta(doctype)
	if meta.has_field(fieldname) or fieldname in _STANDARD:
		return doctype
	for df in meta.get_table_fields():
		if frappe.get_meta(df.options).has_field(fieldname):
			return df.options
	return doctype


def _version_event(doc, row):
	try:
		data = json.loads(row.data or "{}")
	except ValueError:
		return None
	changed = data.get("changed") or []
	for field, old, new in changed:
		if field == "docstatus":
			kind = {(0, 1): "submit", (1, 2): "cancel"}.get((cint(old), cint(new)))
			if kind:
				return {"kind": kind}
	labels = []
	for field, _old, _new in changed:
		df = doc.meta.get_field(field)
		if df and df.label and not df.hidden:
			labels.append(_(df.label))
	rows = len(data.get("added") or []) + len(data.get("removed") or []) + len(data.get("row_changed") or [])
	if not labels and not rows:
		return None
	return {"kind": "edit", "fields": labels[:3], "more": max(0, len(labels) - 3), "rows": rows}


def _timeline(doc):
	"""Actividad: who did what and when, newest first, with full names (never emails)."""
	from frappe.desk.form.load import add_comments, get_assignments, get_attachments, get_versions

	info = frappe._dict()
	add_comments(doc, info)
	events = [{"kind": "create", "at": cstr(doc.creation), "who": _person(doc.owner)}]
	for row in get_versions(doc):
		event = _version_event(doc, frappe._dict(row))
		if event:
			event.update({"at": cstr(row.get("creation")), "who": _person(row.get("owner"))})
			events.append(event)
	for c in info.comments:
		events.append(
			{"kind": "comment", "at": cstr(c.creation), "who": _person(c.owner), "text": strip_html(cstr(c.content))[:600], "id": c.name}
		)
	for key, kind in (("assignment_logs", "assignment"), ("attachment_logs", "attachment"), ("info_logs", "info"), ("shared", "share"), ("workflow_logs", "workflow")):
		for c in info.get(key) or []:
			events.append({"kind": kind, "at": cstr(c.creation), "who": _person(c.owner), "text": strip_html(cstr(c.content))[:300]})
	events.sort(key=lambda e: e["at"], reverse=True)
	assigned = [
		{"user": row.owner, "name": _person(row.owner)}
		for row in get_assignments(doc.doctype, doc.name)
		if row.get("owner")
	]
	attachments = [
		{"name": row.name, "file_name": row.file_name, "file_url": row.file_url, "is_private": row.is_private}
		for row in get_attachments(doc.doctype, doc.name)
	]
	return {"events": events[:80], "assigned": assigned, "attachments": attachments}


@frappe.whitelist()
def record(doctype, name):
	"""The record bundle: the document (read fields only), its header, items and totals, the
	actions this worker may take now, Datos, Conexiones and Actividad."""
	meta = _require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	doc.apply_fieldlevel_read_permissions()
	display = _display(meta)
	totals = {f: doc.get(f) for f in _TOTAL_FIELDS if meta.has_field(f) and doc.get(f) not in (None, "")}
	return {
		"doctype": doctype,
		"name": doc.name,
		"label": _(doctype),
		"submittable": bool(meta.is_submittable),
		"header": _header(doc, display),
		"items": _items(doc),
		"taxes": _taxes(doc),
		"totals": totals,
		"fields": _data_fields(doc, skip=_header_fields(display)),
		"actions": _actions(doc),
		"activity": _timeline(doc),
		# Last: Frappe's link counter caps each later query of this request at 1 s.
		"connections": _connections(doc),
		"modified": cstr(doc.modified),
		"doc": doc.as_dict(no_default_fields=False, convert_dates_to_str=True),
	}


@frappe.whitelist()
def connections(doctype, name):
	_require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return _connections(doc)


@frappe.whitelist()
def timeline(doctype, name):
	_require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return _timeline(doc)
