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
from html import unescape

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_fullname, getdate, nowdate, strip_html

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
	"Quotation": {
		"title": ("customer_name", "party_name"),
		"amount": "grand_total",
		"date": "transaction_date",
		"due": "valid_till",
		"party": ("quotation_to", "party_name"),
	},
	"Sales Order": {
		"title": ("customer_name", "customer"),
		"amount": "grand_total",
		"date": "transaction_date",
		"due": "delivery_date",
		"party": ("Customer", "customer"),
	},
	"Delivery Note": {
		"title": ("customer_name", "customer"),
		"amount": "grand_total",
		"date": "posting_date",
		"party": ("Customer", "customer"),
	},
	"Sales Invoice": {
		"title": ("customer_name", "customer"),
		"amount": "grand_total",
		"date": "posting_date",
		"due": "due_date",
		"outstanding": "outstanding_amount",
		"party": ("Customer", "customer"),
	},
	"POS Invoice": {
		"title": ("customer_name", "customer"),
		"amount": "grand_total",
		"date": "posting_date",
		"party": ("Customer", "customer"),
	},
	"Payment Entry": {
		"title": ("party_name", "party"),
		"amount": "paid_amount",
		"currency": "paid_from_account_currency",
		"date": "posting_date",
		"party": ("party_type", "party"),
	},
	"Material Request": {"title": ("title",), "date": "transaction_date", "due": "schedule_date"},
	"Request for Quotation": {"title": (), "date": "transaction_date", "due": "schedule_date"},
	"Supplier Quotation": {
		"title": ("supplier_name", "supplier"),
		"amount": "grand_total",
		"date": "transaction_date",
		"due": "valid_till",
		"party": ("Supplier", "supplier"),
	},
	"Purchase Order": {
		"title": ("supplier_name", "supplier"),
		"amount": "grand_total",
		"date": "transaction_date",
		"due": "schedule_date",
		"party": ("Supplier", "supplier"),
	},
	"Purchase Receipt": {
		"title": ("supplier_name", "supplier"),
		"amount": "grand_total",
		"date": "posting_date",
		"party": ("Supplier", "supplier"),
	},
	"Purchase Invoice": {
		"title": ("supplier_name", "supplier"),
		"amount": "grand_total",
		"date": "posting_date",
		"due": "due_date",
		"outstanding": "outstanding_amount",
		"party": ("Supplier", "supplier"),
	},
	# Stock documents read by what they do and where (`stock`: the fields `_stock_title` reads):
	# «Traspaso · Centro → Bodega», «Ajuste · Centro». `lines` counts the rows of that table.
	"Stock Entry": {
		"title": ("stock_entry_type",),
		"stock": ("purpose", "from_warehouse", "to_warehouse"),
		"amount": "total_amount",
		"date": "posting_date",
	},
	"Stock Reconciliation": {
		"title": ("purpose",),
		"stock": ("purpose", "set_warehouse"),
		"lines": "items",
		"date": "posting_date",
	},
	"Stock Ledger Entry": {"title": ("item_code",), "date": "posting_date"},
	"Warehouse": {"title": ("warehouse_name",)},
}

MAX_PAGE = 100
MAX_CHIPS = 12
MAX_SEARCH = 140
_ORDER = re.compile(r"^([a-z_][a-z0-9_]*)(?:\s+(asc|desc))?$", re.I)
_STANDARD = ("name", "owner", "creation", "modified", "modified_by", "docstatus", "idx")
_LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"}
_HIDDEN_TYPES = _LAYOUT | {
	"Table",
	"Table MultiSelect",
	"Password",
	"Code",
	"Signature",
	"Geolocation",
	"JSON",
}
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
	# A plain read of the child rows: a session user without a User row (tests, Guest-like
	# sessions) has no blocked modules instead of failing the boot.
	return set(
		frappe.get_all(
			"Block Module",
			filters={"parent": user, "parenttype": "User", "parentfield": "block_modules"},
			pluck="module",
		)
	)


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
		frappe.throw(
			_("You cannot open these documents. Ask your manager for access."), frappe.PermissionError
		)
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
			"reason": _(
				"Your user cannot read any of these documents. Ask the owner or the manager for access."
			),
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

	lines = known.get("lines")
	return {
		"title": title,
		"stock": tuple(f for f in known.get("stock", ()) if meta.has_field(f)),
		"lines": lines if lines and meta.has_field(lines) else None,
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


_ABBR = re.compile(r"\s+-\s+[^\s-]{1,12}$")
# Stock Entry purposes that only add stock, and those that only take it.
_STOCK_IN = {"Material Receipt", "Receive from Customer"}
_STOCK_OUT = {
	"Material Issue",
	"Material Consumption for Manufacture",
	"Return Raw Material to Customer",
	"Subcontracting Delivery",
}


def _store(warehouse):
	"""«Centro - D» → «Centro»: a warehouse without ERPNext's company suffix."""
	text = cstr(warehouse).strip()
	return _ABBR.sub("", text) or text


def _stock_word(purpose):
	"""The worker's word for a stock document's purpose (frontend profiles say the same)."""
	return {
		"Material Receipt": _("Stock in"),
		"Receive from Customer": _("Stock in"),
		"Material Issue": _("Stock out"),
		"Return Raw Material to Customer": _("Stock out"),
		"Subcontracting Delivery": _("Stock out"),
		"Material Consumption for Manufacture": _("Stock consumption"),
		"Material Transfer": _("Stock transfer"),
		"Material Transfer for Manufacture": _("Stock transfer"),
		"Send to Subcontractor": _("Stock transfer"),
		"Manufacture": _("Stock manufacture"),
		"Repack": _("Stock repack"),
		"Disassemble": _("Stock disassembly"),
		"Opening Stock": _("Opening stock count"),
		"Stock Reconciliation": _("Stock count adjustment"),
	}.get(cstr(purpose))


def _stock_title(doc):
	"""«Traspaso · Centro → Bodega», «Entrada · Centro», «Ajuste · Bodega»: what the stock
	document does and where, never its ID; '' when the purpose is unknown."""
	purpose = cstr(doc.get("purpose"))
	word = _stock_word(purpose)
	if not word:
		return ""
	source, target = _store(doc.get("from_warehouse")), _store(doc.get("to_warehouse"))
	if purpose in _STOCK_IN:
		where = target
	elif purpose in _STOCK_OUT:
		where = source
	elif source and target and source != target:
		where = f"{source} → {target}"
	else:
		where = target or source or _store(doc.get("set_warehouse"))
	return f"{word} · {where}" if where else word


def _row(doc, display):
	title = next((cstr(doc.get(f)).strip() for f in display["title"] if cstr(doc.get(f)).strip()), "")
	if display.get("stock"):
		title = _stock_title(doc) or title
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


def _party_titles(doctype, docs, rows):
	"""Rows without a title name their party by its own title (a Lead's name on a quotation),
	one query per party doctype, never the party's ID."""
	spec = DISPLAY.get(doctype, {}).get("party")
	if not spec:
		return
	wanted = {}
	for doc, row in zip(docs, rows, strict=False):
		if row["title"]:
			continue
		party_type = spec[0] if spec[0][:1].isupper() else doc.get(spec[0])
		if party_type and doc.get(spec[1]) and _exists(party_type):
			wanted.setdefault(party_type, set()).add(doc.get(spec[1]))
	titles = {}
	for party_type, names in wanted.items():
		meta = frappe.get_meta(party_type)
		field = meta.title_field if meta.title_field and meta.has_field(meta.title_field) else None
		if not field or not frappe.has_permission(party_type, "read"):
			continue
		for found in frappe.get_list(
			party_type, filters={"name": ["in", list(names)]}, fields=["name", field]
		):
			titles[(party_type, found.name)] = found.get(field)
	for doc, row in zip(docs, rows, strict=False):
		if not row["title"]:
			party_type = spec[0] if spec[0][:1].isupper() else doc.get(spec[0])
			row["title"] = cstr(titles.get((party_type, doc.get(spec[1])))).strip()


def _line_counts(meta, display, rows):
	"""`row.lines` for a list that counts its rows («3 artículos» on an Ajuste): one grouped
	query on the child table, only for the parents the worker could already list."""
	if not display["lines"] or not rows:
		return
	from crm.api.doc import COUNT_NAME

	field = display["lines"]
	found = frappe.get_all(
		meta.get_field(field).options,
		filters={"parenttype": meta.name, "parentfield": field, "parent": ["in", [r["name"] for r in rows]]},
		fields=["parent", COUNT_NAME],
		group_by="parent",
	)
	counts = {r.parent: cint(r.total_count) for r in found}
	for row in rows:
		row["lines"] = counts.get(row["name"], 0)


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
	fields.update(display["stock"])
	for key in ("status", "amount", "currency", "date", "due", "outstanding"):
		if display[key]:
			fields.add(display[key])
	if not DISPLAY.get(meta.name):
		fields.update(_list_fields(meta))
	for key in (
		"party",
		"party_type",
		"payment_type",
		"purpose",
		"customer",
		"supplier",
		"company",
		"is_return",
		"return_against",
	):
		if meta.has_field(key):
			fields.add(key)
	for key in DISPLAY.get(meta.name, {}).get("party") or ():
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
def rows(
	doctype: str,
	filters: str | list | dict | None = None,
	search: str | None = None,
	order_by: str | None = None,
	start: int | str = 0,
	limit: int | str = 30,
	fields: str | list | None = None,
):
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
	out = [_row(doc, display) for doc in found[:limit]]
	_party_titles(doctype, found[:limit], out)
	if "_items" in (_parse(fields, []) or []):
		_items_summary(meta, out)
	_line_counts(meta, display, out)
	return {
		"rows": out,
		"has_more": len(found) > limit,
		"label": _(doctype),
	}


ITEMS_IN_ROW = 3


def _items_summary(meta, rows):
	"""What each listed document carries, for its row («Concha, 2 pzas y 3 más»): the first
	items by position and how many there are, one query for the page. The parent rows
	were already read through Frappe permissions; the child rows follow them."""
	table = _items_table(meta)
	if not table or not rows:
		return
	child = frappe.get_meta(table.options)
	name_field = "item_name" if child.has_field("item_name") else "item_code"
	fields = ["parent", name_field, "idx"]
	fields += [f for f in ("qty", "uom") if child.has_field(f)]
	found = frappe.get_all(
		table.options,
		filters={
			"parent": ["in", [row["name"] for row in rows]],
			"parenttype": meta.name,
			"parentfield": table.fieldname,
		},
		fields=fields,
		order_by="parent asc, idx asc",
		limit_page_length=0,
	)
	by_parent = {}
	for item in found:
		by_parent.setdefault(item.parent, []).append(item)
	for row in rows:
		items = by_parent.get(row["name"]) or []
		row["items"] = {
			"count": len(items),
			"first": [
				{"name": cstr(i.get(name_field)), "qty": i.get("qty"), "uom": i.get("uom")}
				for i in items[:ITEMS_IN_ROW]
			],
		}


def _count(doctype, filters, or_filters=None):
	from crm.api.doc import COUNT_NAME

	result = frappe.get_list(doctype, filters=filters, or_filters=or_filters, fields=[COUNT_NAME])
	return cint(result[0].total_count) if result else 0


@frappe.whitelist()
def counts(doctype: str, chips: str | dict | None = None, search: str | None = None):
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
	"Sales Order": [
		["docstatus", "=", 1],
		["status", "in", ["To Deliver and Bill", "To Deliver", "To Bill"]],
	],
	"Delivery Note": [["docstatus", "=", 1], ["status", "=", "To Bill"]],
	"Sales Invoice": [["docstatus", "=", 1], ["status", "in", ["Overdue", "Overdue and Discounted"]]],
	"Material Request": [["docstatus", "=", 1], ["status", "in", ["Pending", "Partially Ordered"]]],
	"Purchase Order": [["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]]],
	"Purchase Receipt": [["docstatus", "=", 1], ["status", "=", "To Bill"]],
	"Purchase Invoice": [["docstatus", "=", 1], ["status", "in", ["Overdue", "Overdue and Discounted"]]],
}


@frappe.whitelist()
def hub(module: str = "documentos"):
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
def search(q: str | None = None, limit: int | str = 8):
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
def doctypes(search: str | None = None):
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
	can_create = False
	if frappe.has_permission(doc.doctype, "create"):
		can_create = True
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
	# The mappers this document offers («Pedir», «Facturar»): a next step needs create on its target.
	for (source, key), (_path, target) in MAKERS.items():
		if source == doc.doctype and docstatus == 1:
			put(f"make_{key}", frappe.has_permission(target, "create"), no_perm)
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
	"other_charges_calculation",
	"tc_name",
	"customer_name_in_arabic",
	"return_kind",
	"source_exchange_rate",
	"target_exchange_rate",
	"paid_from_account_currency",
	"paid_to_account_currency",
	"paid_from_account_type",
	"paid_to_account_type",
	# Purchase documents (D3 walk): printed addresses, the company's own billing address,
	# reverse charge (not used in Mexico) and the tax subtotals the totals already show.
	"billing_address",
	"billing_address_display",
	"shipping_address_display",
	"dispatch_address",
	"dispatch_address_display",
	"reverse_charge",
	"recoverable_reverse_charge",
	"taxes_and_charges_added",
	"taxes_and_charges_deducted",
}
_DATOS_PREFIXES = ("base_", "per_", "total_billing", "in_words", "advance_", "posa_")
# Bookkeeping links a worker does not read on a document (accounts, price lists, templates).
_DATOS_LINK_SKIP = {
	"Account",
	"Cost Center",
	"Price List",
	"Sales Taxes and Charges Template",
	"Purchase Taxes and Charges Template",
	"Item Tax Template",
	"Terms and Conditions",
	"Tax Category",
	"POS Profile",
	"POS Opening Shift",
	"POS Opening Entry",
	"Letter Head",
	"Print Heading",
	"Finance Book",
	"Accounting Dimension",
}
# A machine reference (request ids, hashes): no spaces, long, digits and separators.
_MACHINE_ID = re.compile(r"^(?=.*\d)[A-Za-z0-9]+[-_.][A-Za-z0-9_.-]{10,}$")


def _data_fields(doc, skip=()):
	"""Datos: fields with a value, labelled in the worker's language, by meta order."""
	out = []
	for df in doc.meta.fields:
		if df.fieldtype in _HIDDEN_TYPES or df.hidden or df.fieldname not in doc.__dict__:
			continue
		name = df.fieldname
		if (
			name in _DATOS_SKIP
			or name in skip
			or name.startswith(_DATOS_PREFIXES)
			or name.endswith("_in_words")
		):
			continue
		if name == "currency" and doc.get("currency") == frappe.get_cached_value(
			"Company", doc.get("company"), "default_currency"
		):
			continue
		value = doc.get(df.fieldname)
		if value in (None, "", 0, 0.0) and df.fieldtype not in ("Check",):
			continue
		# Switches read as noise on a document («Impreso: Sí»); the edit sheet shows them.
		if df.fieldtype == "Check":
			continue
		if df.fieldtype == "Link" and df.options in _DATOS_LINK_SKIP:
			continue
		if df.fieldtype == "Data" and isinstance(value, str) and _MACHINE_ID.match(value) and not df.options:
			continue
		row = {
			"fieldname": df.fieldname,
			"label": _(df.label) if df.label else df.fieldname,
			"fieldtype": df.fieldtype,
			"options": df.options if df.fieldtype in ("Link", "Select", "Currency") else None,
			"value": value,
		}
		if df.fieldtype == "Link" and df.options == "DocType":
			row["title"] = _(value)
		elif df.fieldtype == "Link":
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
		rows.append(
			{
				"name": row.name,
				"_idx": cint(row.idx),
				**{f: row.get(f) for f in _ITEM_FIELDS if row.get(f) not in (None, "")},
			}
		)
	return {"fieldname": table.fieldname, "label": _(table.label or "Items"), "rows": rows}


def _taxes(doc):
	if not doc.meta.has_field("taxes"):
		return []
	return [
		{
			"description": cstr(row.get("description"))[:120],
			"amount": row.get("tax_amount"),
			"rate": row.get("rate"),
		}
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
			party = {
				"doctype": party_type,
				"name": party_name,
				"title": row["title"] or _link_title(party_type, party_name),
			}
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
		if df and df.label and not df.hidden and not df.read_only and df.fieldname not in _DATOS_SKIP:
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
			{
				"kind": "comment",
				"at": cstr(c.creation),
				"who": _person(c.owner),
				"text": unescape(strip_html(cstr(c.content).replace("<br>", "\n")))[:600],
				"id": c.name,
			}
		)
	for key, kind in (
		("assignment_logs", "assignment"),
		("attachment_logs", "attachment"),
		("info_logs", "info"),
		("shared", "share"),
		("workflow_logs", "workflow"),
	):
		for c in info.get(key) or []:
			events.append(
				{
					"kind": kind,
					"at": cstr(c.creation),
					"who": _person(c.owner),
					"text": strip_html(cstr(c.content))[:300],
				}
			)
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
def record(doctype: str, name: str):
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
def connections(doctype: str, name: str):
	_require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return _connections(doc)


@frappe.whitelist()
def timeline(doctype: str, name: str):
	_require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return _timeline(doc)


# ── Editing, creating and tools (D1.2) ────────────────────────────────────────

# ERPNext mappers a profile may offer as its next step or a contextual create (SPEC §6 DD6).
# (source doctype, key) → (dotted path, target doctype). Only these run; each is
# `@frappe.whitelist()` in ERPNext 16. Profiles name the key (`nextStep() → { make: key }`).
_PE = "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry"
MAKERS = {
	("Quotation", "sales_order"): (
		"erpnext.selling.doctype.quotation.quotation.make_sales_order",
		"Sales Order",
	),
	("Quotation", "sales_invoice"): (
		"erpnext.selling.doctype.quotation.quotation.make_sales_invoice",
		"Sales Invoice",
	),
	("Sales Order", "delivery_note"): (
		"erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
		"Delivery Note",
	),
	("Sales Order", "sales_invoice"): (
		"erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
		"Sales Invoice",
	),
	("Sales Order", "payment"): (_PE, "Payment Entry"),
	("Delivery Note", "sales_invoice"): (
		"erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
		"Sales Invoice",
	),
	("Delivery Note", "return"): (
		"erpnext.stock.doctype.delivery_note.delivery_note.make_sales_return",
		"Delivery Note",
	),
	("Sales Invoice", "payment"): (_PE, "Payment Entry"),
	("Sales Invoice", "return"): (
		"erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return",
		"Sales Invoice",
	),
	("Sales Invoice", "delivery_note"): (
		"erpnext.accounts.doctype.sales_invoice.sales_invoice.make_delivery_note",
		"Delivery Note",
	),
	("Material Request", "purchase_order"): (
		"erpnext.stock.doctype.material_request.material_request.make_purchase_order",
		"Purchase Order",
	),
	("Material Request", "request_for_quotation"): (
		"erpnext.stock.doctype.material_request.material_request.make_request_for_quotation",
		"Request for Quotation",
	),
	("Material Request", "supplier_quotation"): (
		"erpnext.stock.doctype.material_request.material_request.make_supplier_quotation",
		"Supplier Quotation",
	),
	("Request for Quotation", "supplier_quotation"): (
		"erpnext.buying.doctype.request_for_quotation.request_for_quotation.make_supplier_quotation_from_rfq",
		"Supplier Quotation",
	),
	("Supplier Quotation", "purchase_order"): (
		"erpnext.buying.doctype.supplier_quotation.supplier_quotation.make_purchase_order",
		"Purchase Order",
	),
	("Purchase Order", "purchase_receipt"): (
		"erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
		"Purchase Receipt",
	),
	("Purchase Order", "purchase_invoice"): (
		"erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice",
		"Purchase Invoice",
	),
	("Purchase Order", "payment"): (_PE, "Payment Entry"),
	("Purchase Receipt", "purchase_invoice"): (
		"erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice",
		"Purchase Invoice",
	),
	("Purchase Invoice", "payment"): (_PE, "Payment Entry"),
}

# Field types the edit sheet has a control for (components/documentos/fields).
_EDIT_TYPES = {
	"Data",
	"Link",
	"Dynamic Link",
	"Select",
	"Date",
	"Datetime",
	"Time",
	"Int",
	"Float",
	"Currency",
	"Percent",
	"Check",
	"Small Text",
	"Text",
	"Long Text",
	"Text Editor",
	"Phone",
}
# Never offered in the sheet: bookkeeping the server sets, or Desk-only knobs.
_EDIT_SKIP = {
	"naming_series",
	"amended_from",
	"status",
	"conversion_rate",
	"plc_conversion_rate",
	"price_list_currency",
	"language",
	"letter_head",
	"select_print_heading",
	"scan_barcode",
	"set_posting_time",
	"posting_time",
	"is_pos",
	"is_return",
	"return_against",
	"update_stock",
}
# What a worker changes on an item row; `item_code` only on a new row.
_ROW_EDIT = ("qty", "rate", "uom", "discount_percentage", "warehouse", "schedule_date", "delivery_date")
MAX_EDIT_FIELDS = 24


def _no_perm():
	frappe.throw(_("Your user does not have this permission."), frappe.PermissionError)


def _select_options(df):
	options = [o for o in cstr(df.options).split("\n") if o.strip()]
	return [{"value": o, "label": _(o)} for o in options]


def _form_field(df, multi_company):
	if df.fieldtype not in _EDIT_TYPES or df.hidden or df.read_only or df.permlevel:
		return None
	if df.fieldname in _EDIT_SKIP or df.fieldname.startswith(_DATOS_PREFIXES) or df.fetch_from:
		return None
	if df.fieldname == "company" and not multi_company:
		return None
	# A sales or purchase `title` is computed from the party; a Note's title is the worker's.
	if df.fieldname == "title" and not df.reqd:
		return None
	row = {
		"fieldname": df.fieldname,
		"label": _(df.label) if df.label else df.fieldname,
		"fieldtype": df.fieldtype,
		"reqd": cint(df.reqd),
		"description": _(df.description) if df.description and len(df.description) < 160 else None,
		"depends_on": df.depends_on or None,
	}
	if df.fieldtype == "Select":
		row["options"] = _select_options(df)
	elif df.fieldtype in ("Link", "Dynamic Link", "Currency"):
		row["options"] = df.options
	return row


def _items_table(meta):
	for df in meta.get_table_fields():
		if df.fieldname == "items" or frappe.get_meta(df.options).has_field("item_code"):
			return df
	return None


@frappe.whitelist()
def form(doctype: str, fields: str | list | None = None):
	"""The edit sheet's controls: the fields a profile names (`fields`), else the required and
	list fields this worker may write, in form order; plus the items table when there is one."""
	meta = _require(doctype)
	wanted = [f for f in (_parse(fields, []) or []) if isinstance(f, str)]
	multi_company = cint(frappe.db.count("Company")) > 1
	by_name = {}
	for df in meta.fields:
		row = _form_field(df, multi_company)
		if row:
			by_name[df.fieldname] = (df, row)
	if wanted:
		out = [by_name[f][1] for f in wanted if f in by_name]
	else:
		out = [
			row
			for df, row in by_name.values()
			if df.reqd or df.in_list_view or df.in_standard_filter or df.bold or df.allow_in_quick_entry
		]
	table = _items_table(meta)
	items = None
	if table:
		child = frappe.get_meta(table.options)
		items = {
			"fieldname": table.fieldname,
			"label": _(table.label or "Items"),
			"fields": [f for f in ("item_code", *_ROW_EDIT) if child.has_field(f)],
		}
	return {"fields": out[:MAX_EDIT_FIELDS], "items": items, "submittable": bool(meta.is_submittable)}


def _editable(meta, fieldname):
	df = meta.get_field(fieldname)
	return bool(df) and df.fieldtype in _EDIT_TYPES and not df.read_only and not df.permlevel


def _apply_rows(doc, table, rows):
	"""Item rows by `_idx` (the row's position before the edit): kept rows take the worker's
	changes, missing rows go, rows without `_idx` are new (`item_code` + changes)."""
	child = frappe.get_meta(table.options)
	existing = {cint(row.idx): row for row in doc.get(table.fieldname) or []}
	kept = []
	for wanted in rows or []:
		if not isinstance(wanted, dict):
			continue
		row = existing.get(cint(wanted.get("_idx"))) if wanted.get("_idx") else None
		if row is None:
			if not wanted.get("item_code"):
				continue
			row = frappe.new_doc(table.options, parent_doc=doc, parentfield=table.fieldname)
			row.item_code = wanted["item_code"]
		for field in _ROW_EDIT:
			if field in wanted and child.has_field(field):
				row.set(field, wanted[field])
		kept.append(row)
	doc.set(table.fieldname, [])
	for idx, row in enumerate(kept, start=1):
		row.idx = idx
		doc.append(table.fieldname, row)


def _apply(doc, values):
	meta = doc.meta
	table = _items_table(meta)
	given = values or {}
	for fieldname, value in given.items():
		if table and fieldname == table.fieldname:
			_apply_rows(doc, table, value if isinstance(value, list) else [])
		elif fieldname in _STANDARD or fieldname.startswith("_"):
			continue
		elif _editable(meta, fieldname):
			doc.set(fieldname, value)
	# Desk fills an item row's store from the document's default one (Ajustes need it).
	if table and meta.has_field("set_warehouse") and doc.get("set_warehouse"):
		for row in doc.get(table.fieldname) or []:
			if row.meta.has_field("warehouse") and not row.get("warehouse"):
				row.warehouse = doc.set_warehouse
	# Desk asks ERPNext for an Ajuste's difference account when its purpose changes: an opening
	# count posts against Temporary Opening, and cannot be saved against Stock Adjustment.
	if meta.name == "Stock Reconciliation" and doc.get("company") and "expense_account" not in given:
		if "purpose" in given or not doc.get("expense_account"):
			from erpnext.stock.doctype.stock_reconciliation.stock_reconciliation import (
				get_difference_account,
			)

			doc.expense_account = get_difference_account(doc.purpose, doc.company) or doc.expense_account
	_header_dates(doc)
	if hasattr(doc, "set_missing_values"):
		try:
			doc.set_missing_values(for_validate=True)
		except TypeError:
			doc.set_missing_values()
	# Only documents with sales or purchase totals: ERPNext's calculator reads item rates and
	# taxes a stock document has not (a Stock Reconciliation row has no `rate`).
	if hasattr(doc, "calculate_taxes_and_totals") and meta.has_field("grand_total"):
		doc.calculate_taxes_and_totals()


def _maker(doctype, key):
	spec = MAKERS.get((doctype, cstr(key)))
	if not spec:
		_no_perm()
	return spec


def _mapped(doctype, name, key):
	path, target = _maker(doctype, key)
	_require(doctype)
	source = frappe.get_doc(doctype, name)
	source.check_permission("read")
	if not readable(target) or not frappe.has_permission(target, "create"):
		_no_perm()
	fn = frappe.get_attr(path)
	return fn(doctype, name) if path == _PE else fn(name)


# Defaults a blank document needs that its meta lacks (a required purpose without one).
_NEW_DEFAULTS = {"Stock Reconciliation": {"purpose": "Stock Reconciliation"}}


def _header_dates(doc, fallback=None):
	"""Desk fills an order's «Required By» (header and rows); ERPNext's Material Request →
	Purchase Order mapper leaves both empty and the save then refuses. Rows without a date
	take `fallback` (the requisición's date) or the header's or today; none is before today
	(an old requisición's dates would fail ERPNext's checks); the header is the earliest row."""
	if not doc.is_new() or not doc.meta.has_field("schedule_date"):
		return
	table = _items_table(doc.meta)
	rows = [
		r for r in (doc.get(table.fieldname) if table else None) or [] if r.meta.has_field("schedule_date")
	]
	today = getdate(nowdate())
	default = fallback or doc.get("schedule_date") or today
	default = max(getdate(default), today)
	for row in rows:
		if not row.get("schedule_date"):
			row.schedule_date = default
		elif getdate(row.schedule_date) < today:
			row.schedule_date = today
	if not doc.get("schedule_date"):
		doc.schedule_date = min((getdate(r.schedule_date) for r in rows), default=default)


def _source_doc(doctype, source):
	"""A new, unsaved document from `source`: a mapper `{doctype, name, make}`, a copy
	`{duplicate: name}` or an amendment `{amend: name}`; else a blank one with defaults."""
	source = _parse(source, None) or {}
	if source.get("make"):
		doc = _mapped(source.get("doctype"), source.get("name"), source.get("make"))
		if doc.doctype != doctype:
			_no_perm()
		origin = source.get("doctype")
		fallback = None
		if origin and _exists(origin) and frappe.get_meta(origin).has_field("schedule_date"):
			fallback = frappe.db.get_value(origin, source.get("name"), "schedule_date")
		_header_dates(doc, fallback)
		return doc
	if source.get("duplicate") or source.get("amend"):
		original = frappe.get_doc(doctype, source.get("duplicate") or source.get("amend"))
		original.check_permission("read")
		if source.get("amend"):
			if cint(original.docstatus) != 2:
				frappe.throw(_("Only a cancelled document can be amended."), frappe.ValidationError)
			if not original.has_permission("amend"):
				_no_perm()
		elif original.meta.allow_copy:
			_no_perm()
		doc = frappe.copy_doc(original)
		if source.get("amend"):
			doc.amended_from = original.name
		return doc
	doc = frappe.new_doc(doctype)
	for fieldname, value in _NEW_DEFAULTS.get(doctype, {}).items():
		if not doc.get(fieldname):
			doc.set(fieldname, value)
	return doc


@frappe.whitelist()
def draft(doctype: str, source: str | dict | None = None):
	"""The prefill of the create sheet (nothing is saved): the mapped, copied or blank document."""
	meta = _require(doctype)
	if not frappe.has_permission(doctype, "create"):
		_no_perm()
	doc = _source_doc(doctype, source)
	data = doc.as_dict(convert_dates_to_str=True)
	table = _items_table(meta)
	items = None
	if table:
		items = {
			"fieldname": table.fieldname,
			"rows": [
				{
					"_idx": cint(row.idx),
					**{f: row.get(f) for f in _ITEM_FIELDS if row.get(f) not in (None, "")},
				}
				for row in doc.get(table.fieldname) or []
			],
		}
	return {"doctype": doctype, "doc": data, "items": items, "title": _row(doc, _display(meta))["title"]}


@frappe.whitelist(methods=["POST"])
def save(
	doctype: str,
	values: str | dict | None = None,
	name: str | None = None,
	modified: str | None = None,
	source: str | dict | None = None,
):
	"""Create (from `source`, see `_source_doc`) or update a draft with the worker's changes.
	Frappe validates and checks create/write permission and permlevels on save."""
	meta = _require(doctype)
	values = _parse(values, {}) or {}
	if not isinstance(values, dict):
		frappe.throw(_("The filters could not be read."), frappe.ValidationError)
	if name:
		doc = frappe.get_doc(doctype, name)
		doc.check_permission("write")
		if cint(doc.docstatus) != 0:
			frappe.throw(_("Only a draft can be edited."), frappe.ValidationError)
		if modified and cstr(doc.modified) != cstr(modified):
			frappe.throw(
				_(
					"Someone changed this document while you were editing it. Open it again to see their changes."
				),
				frappe.TimestampMismatchError,
			)
		_apply(doc, values)
		doc.save()
	else:
		if not frappe.has_permission(doctype, "create"):
			_no_perm()
		doc = _source_doc(doctype, source)
		_apply(doc, values)
		doc.insert()
	return {
		"doctype": doctype,
		"name": doc.name,
		"docstatus": cint(doc.docstatus),
		"slug_hint": _hint(doc, meta),
	}


def _hint(doc, meta):
	return {"payment_type": doc.get("payment_type")} if meta.has_field("payment_type") else None


@frappe.whitelist(methods=["POST"])
def act(doctype: str, name: str, action: str):
	"""Confirm (submit), cancel or delete one document with the worker's own permissions."""
	_require(doctype)
	doc = frappe.get_doc(doctype, name)
	allowed = _actions(doc)
	if action not in ("submit", "cancel", "delete") or not allowed.get(action, {}).get("allowed"):
		frappe.throw(
			(allowed.get(action) or {}).get("reason") or _("Your user does not have this permission."),
			frappe.PermissionError,
		)
	if action == "submit":
		doc.submit()
	elif action == "cancel":
		doc.cancel()
	else:
		frappe.delete_doc(doctype, name)
		return {"deleted": True}
	return {"name": doc.name, "docstatus": cint(doc.docstatus)}


@frappe.whitelist()
def print_formats(doctype: str):
	"""Print formats for the PDF picker: the doctype's enabled formats, «Standard» last."""
	_require(doctype)
	if not frappe.has_permission(doctype, "print"):
		_no_perm()
	default = frappe.get_meta(doctype).default_print_format
	names = frappe.get_all(
		"Print Format", filters={"doc_type": doctype, "disabled": 0}, pluck="name", order_by="name asc"
	)
	out = [{"name": n, "label": _(n), "default": n == default} for n in names]
	out.append({"name": "Standard", "label": _("Standard"), "default": not default or default == "Standard"})
	return out


@frappe.whitelist()
def people(search: str | None = None, limit: int | str = 20):
	"""Coworkers for Asignar: enabled desk users by full name (never their emails as the label)."""
	if frappe.session.user == "Guest":
		_no_perm()
	term = cstr(search).strip()[:MAX_SEARCH]
	filters = {"enabled": 1, "user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]}
	or_filters = {"full_name": ["like", f"%{term}%"], "name": ["like", f"%{term}%"]} if term else None
	found = frappe.get_all(
		"User",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
		limit_page_length=max(1, min(cint(limit) or 20, 50)),
	)
	return [{"user": u.name, "name": _person(u.name), "image": u.user_image} for u in found]


@frappe.whitelist(methods=["POST"])
def comment(doctype: str, name: str, text: str):
	"""Comentar: a comment in the worker's own name; returns the refreshed Actividad."""
	from frappe.desk.form.utils import add_comment
	from frappe.utils import escape_html

	_require(doctype)
	text = cstr(text).strip()[:4000]
	if not text:
		frappe.throw(_("Write the comment first."), frappe.ValidationError)
	user = frappe.session.user
	add_comment(doctype, name, escape_html(text).replace("\n", "<br>"), user, get_fullname(user))
	return _timeline(frappe.get_doc(doctype, name))


@frappe.whitelist(methods=["POST"])
def assign(
	doctype: str,
	name: str,
	add: str | list | None = None,
	remove: str | list | None = None,
):
	"""Asignar: add or remove coworkers (Frappe's ToDo assignments, with its own checks)."""
	from frappe.desk.form import assign_to

	_require(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	for user in [u for u in (_parse(remove, []) or []) if isinstance(u, str)][:20]:
		assign_to.remove(doctype, name, user)
	users = [u for u in (_parse(add, []) or []) if isinstance(u, str)][:20]
	if users:
		assign_to.add({"assign_to": users, "doctype": doctype, "name": name})
	return _timeline(frappe.get_doc(doctype, name))
