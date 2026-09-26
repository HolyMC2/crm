"""Permissioned, serialized offer revisions and recorded customer decisions."""

import json
from html import escape

import frappe
from frappe.utils import getdate, now_datetime, nowdate

from crm.offers.contract import CHANNELS, INPUT_FIELDS, LINE_FIELDS, calculate, digest, terms_snapshot, text

_TOKEN = object()


def _fail(message, exception=frappe.ValidationError):
	frappe.throw(frappe._(message), exception)


def _input(values):
	if isinstance(values, str):
		if len(values) > 100000:
			_fail("Offer is too large.")
		values = frappe.parse_json(values)
	if not isinstance(values, dict) or set(values) - INPUT_FIELDS:
		_fail("Use only title, currency, valid until, terms and product lines.")
	return values


def _deal(deal, write=False, lock=False):
	doc = frappe.get_doc("CRM Deal", deal, for_update=lock)
	doc.check_permission("write" if write else "read")
	return doc


def _field_access():
	from frappe.model import get_permitted_fields

	for doctype, wanted, parent in (
		(
			"CRM Offer",
			{"title", "currency", "total", "net_total", "terms", "issued_snapshot", "decision_evidence"},
			None,
		),
		("CRM Products", LINE_FIELDS | {"amount", "discount_amount", "net_amount"}, "CRM Offer"),
	):
		permitted = set(get_permitted_fields(doctype, parenttype=parent, permission_type="read"))
		masked = {field.fieldname for field in frappe.get_meta(doctype).get_masked_fields()}
		if not wanted.issubset(permitted) or wanted & masked:
			_fail("You do not have permission to read the complete offer terms.", frappe.PermissionError)


def _load(name, write=False):
	# Same lock order for every offer operation, including ERP handoff.
	deal = frappe.db.get_value("CRM Offer", name, "deal")
	if not deal:
		_fail("Offer does not exist.", frappe.DoesNotExistError)
	_deal(deal, write=write, lock=write)
	doc = frappe.get_doc("CRM Offer", name, for_update=write)
	doc.check_permission("write" if write else "read")
	_field_access()
	return doc


def _stale(doc, modified):
	if not modified or str(doc.modified) != str(modified):
		_fail(
			"This offer changed. Reload it and review your draft before trying again.",
			frappe.TimestampMismatchError,
		)


def _current(doc):
	return not frappe.get_all(
		"CRM Offer",
		filters={"root_offer": doc.root_offer, "revision": [">", doc.revision]},
		fields=["name"],
		limit_page_length=1,
		for_update=True,
	)


def effective_status(doc, current=None):
	if doc.status == "Issued":
		if not (_current(doc) if current is None else current):
			return "Superseded"
		if getdate(doc.valid_until) < getdate(nowdate()):
			return "Expired"
	return doc.status


def _applicable(doc):
	if not _current(doc):
		_fail("Use the latest offer revision. An earlier decision does not apply to a new revision.")


def _precision(currency):
	if not frappe.db.exists("Currency", currency):
		_fail("Choose a valid currency.")
	units = frappe.db.get_value("Currency", currency, "fraction_units")
	if units and int(units) in (1, 10, 100, 1000, 10000, 100000, 1000000):
		return len(str(int(units))) - 1
	return int(frappe.db.get_single_value("System Settings", "currency_precision") or 2)


def _set_values(doc, values):
	try:
		doc.title = text(values.get("title"), "title", 140)
		doc.currency = text(values.get("currency"), "currency", 12)
		doc.terms = text(values.get("terms") or "", "terms", 10000, False)
		if not values.get("valid_until"):
			raise ValueError("Valid until is required.")
		doc.valid_until = getdate(values["valid_until"]).isoformat()
		doc.currency_precision = _precision(doc.currency)
		calculated = calculate(values.get("products"), doc.currency_precision)
	except (ValueError, TypeError, OverflowError) as exc:
		_fail(str(exc))
	for row in calculated["products"]:
		if row["product_code"]:
			product = frappe.get_doc("CRM Product", row["product_code"])
			product.check_permission("read")
			if product.disabled:
				_fail("An offer product is disabled. Choose an available product or a service line.")
	doc.set("products", calculated.pop("products"))
	doc.update(calculated)
	doc.terms_hash = digest(terms_snapshot(doc))


def _save(doc):
	doc.flags.crm_offer_service = _TOKEN
	# Only this service may persist the private ERP review receipt. Public DTOs
	# never expose it; ERP preview separately checks native ERP permissions.
	doc.flags.ignore_permlevel_for_fields = [
		field.fieldname for field in doc.meta.fields if field.fieldname.startswith("erp_")
	]
	doc.save()
	return doc


def validate_offer(doc):
	if doc.flags.get("crm_offer_service") is not _TOKEN:
		_fail("Use the offer actions to preserve revisions and decision evidence.", frappe.PermissionError)
	previous = doc.get_doc_before_save()
	if previous and previous.status != "Draft":
		if terms_snapshot(previous) != terms_snapshot(doc) or previous.terms_hash != doc.terms_hash:
			_fail("Issued offer terms are immutable. Create a new revision.")
		if previous.issued_snapshot != doc.issued_snapshot:
			_fail("The issued offer snapshot is immutable.")
	if previous:
		for field in (
			"deal",
			"root_offer",
			"previous_revision",
			"revision",
			"request_key",
			"request_fingerprint",
		):
			if previous.get(field) != doc.get(field):
				_fail("Offer revision identity is immutable.")
		if previous.status in {"Accepted", "Rejected", "Expired"}:
			for field in ("status", "decision_by", "decision_at", "decision_channel", "decision_evidence"):
				if previous.get(field) != doc.get(field):
					_fail("Recorded decisions are immutable. Create a new revision.")
	if doc.terms_hash != digest(_terms(doc)):
		_fail("Offer terms do not match their saved revision.")


def _terms(doc):
	# Link renames may update native child Links directly. The issued content and
	# hash retain exactly what the customer saw, including original product codes.
	return json.loads(doc.issued_snapshot) if doc.get("issued_snapshot") else terms_snapshot(doc)


def _request(deal, request_id, payload):
	try:
		request_id = text(request_id, "request ID", 140)
	except ValueError as exc:
		_fail(str(exc))
	return digest([frappe.session.user, deal, request_id]), digest(payload)


def _replay(key, fingerprint):
	name = frappe.db.get_value("CRM Offer", {"request_key": key}, "name", for_update=True)
	if name:
		doc = frappe.get_doc("CRM Offer", name, for_update=True)
		doc.check_permission("read")
		_field_access()
		if doc.request_fingerprint != fingerprint:
			_fail("This request ID was already used for another offer action.")
		return doc


def _new(deal, values, key, fingerprint, previous=None):
	if not frappe.has_permission("CRM Offer", "create"):
		_fail("You cannot create offers.", frappe.PermissionError)
	_field_access()
	name = "CRM-OFF-" + key[:24]
	doc = frappe.get_doc(
		{
			"doctype": "CRM Offer",
			"name": name,
			"deal": deal.name,
			"root_offer": previous.root_offer if previous else name,
			"previous_revision": previous.name if previous else None,
			"revision": previous.revision + 1 if previous else 1,
			"sales_company": deal.get("sales_company") or "",
			"status": "Draft",
			"request_key": key,
			"request_fingerprint": fingerprint,
		}
	)
	_set_values(doc, values)
	return _save(doc)


def save_draft(deal, values, name=None, modified=None, request_id=None):
	deal_doc = _deal(deal, write=True, lock=True)
	values = _input(values)
	if not name:
		key, fingerprint = _request(deal, request_id, {"create": values})
		doc = _replay(key, fingerprint) or _new(deal_doc, values, key, fingerprint)
	else:
		doc = _load(name, write=True)
		if doc.deal != deal:
			_fail("This offer belongs to another deal.", frappe.PermissionError)
		_stale(doc, modified)
		_applicable(doc)
		if doc.status != "Draft":
			_fail("Issued offer terms are immutable. Create a new revision.")
		_set_values(doc, values)
		_save(doc)
	return dto(doc)


def issue(name, modified):
	doc = _load(name, write=True)
	_applicable(doc)
	if doc.status == "Issued":
		return dto(doc)
	_stale(doc, modified)
	if doc.status != "Draft":
		_fail("Only a draft can be issued.")
	if getdate(doc.valid_until) < getdate(nowdate()):
		_fail("Choose a validity date that has not expired.")
	# Revalidate product eligibility at issue; never replace the seller's agreed rates.
	_set_values(
		doc,
		{
			**{f: doc.get(f) for f in INPUT_FIELDS if f != "products"},
			"products": [{f: r.get(f) for f in LINE_FIELDS} for r in doc.products],
		},
	)
	doc.status, doc.issued_by, doc.issued_at = "Issued", frappe.session.user, now_datetime()
	doc.issued_snapshot = json.dumps(terms_snapshot(doc), sort_keys=True, default=str)
	return dto(_save(doc))


def record_decision(name, decision, channel, evidence, modified):
	doc = _load(name, write=True)
	if decision not in {"Accepted", "Rejected"} or channel not in CHANNELS:
		_fail("Choose an accepted or rejected decision and its channel.")
	try:
		evidence = text(evidence, "customer decision evidence", 2000)
	except ValueError as exc:
		_fail(str(exc))
	if (
		doc.status == decision
		and doc.decision_by == frappe.session.user
		and doc.decision_channel == channel
		and doc.decision_evidence == evidence
	):
		return dto(doc)
	_stale(doc, modified)
	_applicable(doc)
	if effective_status(doc) != "Issued":
		_fail("Only a current, unexpired issued offer can receive a customer decision.")
	doc.status, doc.decision_by, doc.decision_at = decision, frappe.session.user, now_datetime()
	doc.decision_channel, doc.decision_evidence = channel, evidence
	return dto(_save(doc))


def revise(name, request_id):
	doc = _load(name, write=True)
	key, fingerprint = _request(doc.deal, request_id, {"revise": name})
	if existing := _replay(key, fingerprint):
		return dto(existing)
	_applicable(doc)
	if doc.status == "Draft":
		_fail("Edit the existing draft before issuing it.")
	values = {f: doc.get(f) for f in INPUT_FIELDS if f != "products"}
	values["products"] = [{f: row.get(f) for f in LINE_FIELDS} for row in doc.products]
	return dto(_new(_deal(doc.deal, write=True), values, key, fingerprint, doc))


def expire(name, modified):
	doc = _load(name, write=True)
	if doc.status == "Expired":
		return dto(doc)
	_stale(doc, modified)
	_applicable(doc)
	if doc.status != "Issued" or effective_status(doc) != "Expired":
		_fail("Only an issued offer past its validity date can expire.")
	doc.status = "Expired"
	return dto(_save(doc))


def erp_available():
	if "erpnext" not in frappe.get_installed_apps():
		return False
	settings = frappe.get_doc("ERPNext CRM Settings")
	return bool(settings.enabled and not settings.is_erpnext_in_different_site)


def dto(doc, current=None, writable=None, erp=None, exportable=None):
	current = _current(doc) if current is None else current
	writable = doc.has_permission("write") if writable is None else writable
	erp = erp_available() if erp is None else erp
	status = effective_status(doc, current)
	result = {
		field: doc.get(field)
		for field in (
			"name",
			"deal",
			"root_offer",
			"previous_revision",
			"revision",
			"title",
			"currency",
			"currency_precision",
			"valid_until",
			"terms",
			"sales_company",
			"total",
			"net_total",
			"status",
			"modified",
			"terms_hash",
			"issued_by",
			"issued_at",
			"decision_by",
			"decision_at",
			"decision_channel",
			"decision_evidence",
			"erp_quotation",
		)
	}
	result.update(
		{
			"products": [
				{
					field: row.get(field)
					for field in (*sorted(LINE_FIELDS), "amount", "discount_amount", "net_amount")
				}
				for row in doc.products
			],
			"effective_status": status,
			"is_current": current,
			"capabilities": {
				"can_edit": writable and current and status == "Draft",
				"can_issue": writable and current and status == "Draft",
				"can_decide": writable and current and status == "Issued",
				"can_revise": writable and current and doc.status != "Draft",
				"can_expire": writable and current and doc.status == "Issued" and status == "Expired",
				"can_export": doc.has_permission("print") if exportable is None else exportable,
				"can_erp": writable
				and current
				and status == "Accepted"
				and erp
				and frappe.has_permission("Quotation", "create"),
			},
		}
	)
	if doc.get("issued_snapshot"):
		frozen = _terms(doc)
		for field in (
			"title",
			"currency",
			"currency_precision",
			"valid_until",
			"terms",
			"sales_company",
			"total",
			"net_total",
		):
			result[field] = frozen[field]
		result["products"] = calculate(frozen["products"], frozen["currency_precision"])["products"]
	return result


def get_offers(deal, offset=0, limit=20):
	deal_doc = _deal(deal)
	_field_access()
	if not frappe.has_permission("CRM Offer", "read"):
		_fail("You cannot read offers.", frappe.PermissionError)
	offset, limit = int(offset), int(limit)
	if offset < 0 or not 1 <= limit <= 100:
		_fail("Choose a valid offer page.")
	rows = frappe.get_all(
		"CRM Offer",
		filters={"deal": deal},
		fields=["*"],
		order_by="creation desc, name desc",
		limit_start=offset,
		limit_page_length=limit,
	)
	# All records in a deal have the same inherited scope. No arbitrary caller filters.
	latest = {
		r.root_offer: r.revision
		for r in frappe.get_all(
			"CRM Offer",
			filters={"deal": deal},
			fields=["root_offer", "max(revision) as revision"],
			group_by="root_offer",
		)
	}
	children = {}
	if rows:
		for child in frappe.get_all(
			"CRM Products",
			filters={"parenttype": "CRM Offer", "parent": ["in", [r.name for r in rows]]},
			fields=["*"],
			order_by="idx asc",
		):
			children.setdefault(child.parent, []).append(child)
	writable, erp = deal_doc.has_permission("write"), erp_available()
	writable = writable and frappe.has_permission("CRM Offer", "write")
	exportable = frappe.has_permission("CRM Offer", "print")
	items = [
		dto(
			frappe._dict({**row, "products": children.get(row.name, [])}),
			current=row.revision == latest[row.root_offer],
			writable=writable,
			erp=erp,
			exportable=exportable,
		)
		for row in rows
	]
	total = frappe.db.count("CRM Offer", {"deal": deal})
	return {
		"offers": items,
		"total": total,
		"offset": offset,
		"limit": limit,
		"has_more": total > offset + len(items),
		"can_create": writable and frappe.has_permission("CRM Offer", "create"),
		"erp_available": erp,
	}


def preview(name):
	doc = _load(name)
	doc.check_permission("print")
	state = effective_status(doc)
	# Render the customer-visible issued snapshot, including currency and product
	# identities, instead of mutable native Link values after metadata renames.
	if doc.get("issued_snapshot"):
		frozen = _terms(doc)
		doc = frappe._dict({**doc.as_dict(), **frozen})
		doc.products = [
			frappe._dict(row)
			for row in calculate(frozen["products"], frozen["currency_precision"])["products"]
		]
	precision = doc.currency_precision

	def money(value):
		return escape(f"{float(value or 0):,.{precision}f} {doc.currency}")

	rows = "".join(
		f"<tr><td>{escape(r.product_name)}</td><td>{r.qty:g}</td><td>{money(r.rate)}</td><td>{r.discount_percentage:g}%</td><td>{money(r.net_amount)}</td></tr>"
		for r in doc.products
	)
	html = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{escape(doc.title)}</title>
<style>body{{font:16px sans-serif;max-width:850px;margin:32px auto;padding:0 20px;color:#20242c}}table{{border-collapse:collapse;width:100%}}th,td{{padding:10px;border-bottom:1px solid #ddd;text-align:left}}pre{{white-space:pre-wrap;font:inherit}}@media print{{body{{margin:0}}}}</style></head><body>
<h1>{escape(doc.title)}</h1><p>{escape(doc.name)} · Revision {doc.revision} · {escape(state)}</p>
<p>Valid through {escape(str(doc.valid_until))}. Currency: {escape(doc.currency)}.</p>
<table><thead><tr><th>Product / service</th><th>Quantity</th><th>Rate</th><th>Discount</th><th>Amount</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Commercial proposal total: {money(doc.net_total)}</h2><p>These are proposal amounts. Taxes are not calculated here. This is not an invoice, inventory reservation or payment receipt.</p><pre>{escape(doc.terms or "")}</pre>
<p>Recorded decision: {escape(doc.status if doc.status in ("Accepted", "Rejected") else "None")}. {escape(doc.decision_channel or "")}</p></body></html>"""
	return {"name": name, "html": html}
