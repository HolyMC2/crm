"""Accepted CRM revision to a reviewed, canonical ERP Quotation draft.

No remote transport, permission elevation, submission, reservation or payment.
Native ERP pricing/tax validation owns the resulting financial document.
"""

import hmac
import json
from decimal import Decimal
from html import escape
from urllib.parse import quote

import frappe
from frappe.utils import get_datetime, getdate, now_datetime, nowdate

from crm.offers import service
from crm.offers.contract import digest, terms_snapshot, text


def _single(doctype):
	current = dict(frappe.db.sql("SELECT field, value FROM tabSingles WHERE doctype=%s FOR UPDATE", doctype))
	visible = dict(frappe.db.sql("SELECT field, value FROM tabSingles WHERE doctype=%s", doctype))
	if current != visible:
		service._fail(
			"ERP settings changed during this request. Reload the quotation preview.",
			frappe.TimestampMismatchError,
		)
	frappe.clear_document_cache(doctype, doctype)
	return frappe._dict(current)


def _view_fence(doctype, filters):
	"""Native ERP reads use its normal MVCC view: reject a stale view, never price it.

	Current locking reads also fence changes until the quotation transaction ends.
	Bounds fail visibly instead of silently pricing an incomplete policy set.
	"""
	options = {"filters": filters, "fields": ["*"], "order_by": "name asc", "limit_page_length": 1001}
	current = frappe.get_all(doctype, **options, for_update=True)
	if len(current) > 1000:
		service._fail(
			"ERP pricing configuration exceeds the bounded offer preview. Use ERP quotation review."
		)
	if digest(current) != digest(frappe.get_all(doctype, **options)):
		service._fail(
			"ERP pricing configuration changed during this request. Reload the quotation preview.",
			frappe.TimestampMismatchError,
		)
	for row in current:
		frappe.clear_document_cache(doctype, row.name)
	children = {}
	if current:
		for field in frappe.get_meta(doctype).get_table_fields():
			child_options = {
				"filters": {"parenttype": doctype, "parent": ["in", [r.name for r in current]]},
				"fields": ["*"],
				"order_by": "parent asc, idx asc, name asc",
				"limit_page_length": 10001,
			}
			rows = frappe.get_all(field.options, **child_options, for_update=True)
			if len(rows) > 10000 or digest(rows) != digest(frappe.get_all(field.options, **child_options)):
				service._fail(
					"ERP pricing detail changed or exceeds the preview bound. Review it in ERP.",
					frappe.TimestampMismatchError,
				)
			children[field.fieldname] = rows
	return {"rows": current, "children": children}


def _read(doctype, name):
	_view_fence(doctype, {"name": name})
	doc = frappe.get_doc(doctype, name, for_update=True)
	doc.check_permission("read")
	return doc


def _accepted(name):
	doc = service._load(name, write=True)
	service._applicable(doc)
	if doc.status != "Accepted":
		service._fail("Record the customer's acceptance of this revision before ERP handoff.")
	if digest(terms_snapshot(doc)) != doc.terms_hash:
		service._fail(
			"A linked product identity changed after acceptance. Revise and review the offer before ERP handoff."
		)
	return doc


def _build(doc):
	if "erpnext" not in frappe.get_installed_apps():
		service._fail("ERPNext is not installed. The commercial offer remains available.")
	settings = _single("ERPNext CRM Settings")
	if not int(settings.enabled or 0) or int(settings.is_erpnext_in_different_site or 0):
		service._fail("Configure the same-site ERPNext integration before quotation handoff.")
	if not frappe.has_permission("Quotation", "create") or not frappe.has_permission("Quotation", "read"):
		service._fail("Quotation create and read permissions are required.", frappe.PermissionError)
	stock_settings = _single("Stock Settings")
	_single("System Settings")
	_single("Global Defaults")  # Native rounding policy, not a stale cached value.
	if int(stock_settings.auto_insert_price_list_rate_if_missing or 0):
		service._fail(
			"ERP automatic price-list insertion must be disabled for a read-only quotation preview. Review Stock Settings with an ERP manager."
		)
	deal = service._deal(doc.deal, write=True, lock=True)
	company = _read("Company", settings.erpnext_company)
	if (doc.sales_company and doc.sales_company != company.name) or (
		deal.get("sales_company") and deal.sales_company != company.name
	):
		service._fail("The offer and ERP integration belong to different companies.")
	customer_name = deal.get("erpnext_customer")
	if not customer_name:
		service._fail("Link the intended ERP Customer on this deal before quotation handoff.")
	customer = _read("Customer", customer_name)
	if customer.get("disabled"):
		service._fail("The linked ERP Customer is disabled.")
	group = _read("Customer Group", customer.customer_group)
	price_list = (
		customer.get("default_price_list")
		or group.get("default_price_list")
		or _single("Selling Settings").selling_price_list
	)
	if not price_list:
		service._fail("Configure an explicit selling price list for this customer or company.")
	price_list = _read("Price List", price_list)
	if not price_list.enabled or not price_list.selling:
		service._fail("The configured selling price list is disabled.")
	if doc.currency != price_list.currency or doc.currency != company.default_currency:
		service._fail(
			"This handoff requires offer, price-list and company currencies to match. Review cross-currency quotation terms in ERP before using this handoff."
		)
	if not frappe.get_meta("CRM Product").has_field("erpnext_item_code"):
		service._fail("Configure CRM product mappings to ERP items first.")
	codes = sorted({row.product_code for row in doc.products if row.product_code})
	if len(codes) == 0 or any(not row.product_code for row in doc.products):
		service._fail(
			"Map every offered product or service to a CRM Product with an ERP Item before handoff."
		)
	products = {}
	for code in codes:
		product = _read("CRM Product", code)
		if product.disabled or not product.get("erpnext_item_code"):
			service._fail("An offered product has no available ERP item mapping.")
		products[code] = product
	items = {code: _read("Item", code) for code in sorted({p.erpnext_item_code for p in products.values()})}
	for item in items.values():
		if item.disabled or not item.is_sales_item or item.has_variants:
			service._fail("An ERP item is disabled, is a template or is not sellable.")
	_view_fence("Item Price", {"item_code": ["in", sorted(items)], "price_list": price_list.name})
	policies = {
		doctype: digest(_view_fence(doctype, {}))
		for doctype in ("Pricing Rule", "Tax Rule", "Sales Taxes and Charges Template", "Item Tax Template")
	}
	prices = frappe.get_all(
		"Item Price",
		filters={"item_code": ["in", sorted(items)], "price_list": price_list.name, "selling": 1},
		fields=[
			"name",
			"item_code",
			"price_list_rate",
			"currency",
			"uom",
			"customer",
			"supplier",
			"batch_no",
			"packing_unit",
			"valid_from",
			"valid_upto",
			"modified",
		],
		order_by="name asc",
		for_update=True,
		limit_page_length=0,
	)
	base_rates, sources = {}, []
	for code, item in items.items():
		candidates = [
			p
			for p in prices
			if p.item_code == code
			and (not p.valid_from or getdate(p.valid_from) <= getdate(nowdate()))
			and (not p.valid_upto or getdate(p.valid_upto) >= getdate(nowdate()))
			and (not p.customer or p.customer == customer.name)
			and not p.supplier
			and not p.batch_no
			and (not p.uom or p.uom == item.stock_uom)
			and Decimal(str(p.packing_unit or 1)) == 1
		]
		party = [p for p in candidates if p.customer == customer.name]
		candidates = party or [p for p in candidates if not p.customer]
		if (
			len(candidates) != 1
			or candidates[0].currency != doc.currency
			or Decimal(str(candidates[0].price_list_rate or 0)) <= 0
		):
			service._fail(
				"Each ERP item needs one unambiguous current selling price in its stock unit and offer currency."
			)
		base_rates[code] = candidates[0].price_list_rate
		if not frappe.has_permission("Item Price", "read", doc=candidates[0].name):
			service._fail(
				"Read permission for the applicable ERP item price is required.", frappe.PermissionError
			)
		sources.append(dict(candidates[0]))
	quotation = frappe.new_doc("Quotation")
	quotation.update(
		{
			"quotation_to": "Customer",
			"party_name": customer.name,
			"company": company.name,
			"currency": doc.currency,
			"conversion_rate": 1,
			"plc_conversion_rate": 1,
			"selling_price_list": price_list.name,
			"transaction_date": nowdate(),
			"valid_till": doc.valid_until,
			"ignore_pricing_rule": 0,
		}
	)
	quotation.check_permission("create")
	if not quotation.meta.has_field("crm_deal"):
		service._fail("The native ERP quotation deal link is not installed. Finish ERPNext CRM setup first.")
	quotation.crm_deal = doc.deal
	quotation.terms = (
		"<p>CRM commercial offer "
		+ escape(doc.name)
		+ " · revision "
		+ str(doc.revision)
		+ " · "
		+ doc.terms_hash
		+ "</p><p>"
		+ escape(doc.terms or "").replace("\n", "<br>")
		+ "</p><p>This ERP quotation is a separate draft for review. Changed financial terms require their own customer approval.</p>"
	)
	for row in doc.products:
		code = products[row.product_code].erpnext_item_code
		quotation.append(
			"items",
			{
				"item_code": code,
				"qty": row.qty,
				"uom": items[code].stock_uom,
				"conversion_factor": 1,
				"price_list_rate": base_rates[code],
				"rate": float(
					Decimal(str(base_rates[code])) * (1 - Decimal(str(row.discount_percentage or 0)) / 100)
				),
				"discount_percentage": row.discount_percentage,
			},
		)
	# These native methods calculate in memory. No insert/rollback or changed actor
	# is used to obtain the preview. Configured pricing rules remain enabled.
	quotation.run_method("set_missing_values")
	quotation.run_method("set_taxes")
	quotation.run_method("calculate_taxes_and_totals")
	source = {
		"policies": policies,
		"offer": doc.terms_hash,
		"company": company.name,
		"company_modified": str(company.modified),
		"customer": customer.name,
		"customer_modified": str(customer.modified),
		"price_list": price_list.name,
		"price_list_modified": str(price_list.modified),
		"prices": sources,
		"products": [
			{"name": p.name, "modified": str(p.modified), "item": p.erpnext_item_code}
			for p in products.values()
		],
		"items": [
			{"name": i.name, "modified": str(i.modified), "stock_uom": i.stock_uom} for i in items.values()
		],
		"financial": _financial(quotation),
	}
	return quotation, source


def _financial(doc):
	fields = (
		"disable_rounded_total",
		"transaction_date",
		"valid_till",
		"currency",
		"company",
		"party_name",
		"conversion_rate",
		"selling_price_list",
		"total",
		"net_total",
		"total_taxes_and_charges",
		"grand_total",
		"rounded_total",
		"base_grand_total",
		"discount_amount",
		"additional_discount_percentage",
	)
	item_fields = (
		"item_code",
		"qty",
		"uom",
		"conversion_factor",
		"rate",
		"net_rate",
		"amount",
		"net_amount",
		"discount_percentage",
		"pricing_rules",
	)
	tax_fields = ("charge_type", "account_head", "rate", "tax_amount", "total", "included_in_print_rate")
	text_fields = {
		"transaction_date",
		"valid_till",
		"currency",
		"company",
		"party_name",
		"selling_price_list",
		"item_code",
		"uom",
		"pricing_rules",
		"charge_type",
		"account_head",
	}

	def values(row, wanted):
		return {
			field: str(row.get(field) or "") if field in text_fields else float(row.get(field) or 0)
			for field in wanted
		}

	return {
		"rounding_applied": not doc.is_rounded_total_disabled(),
		**values(doc, fields),
		"items": [values(row, item_fields) for row in doc.items],
		"taxes": [values(row, tax_fields) for row in doc.taxes],
	}


def _wire(offer, quotation):
	items = [
		{field: row.get(field) for field in ("item_code", "item_name", "qty", "uom", "rate", "amount")}
		for row in quotation.items
	]
	rounding_applied = not quotation.is_rounded_total_disabled()
	payable = quotation.rounded_total if rounding_applied else quotation.grand_total
	difference = float(Decimal(str(payable or 0)) - Decimal(str(offer.net_total)))
	unrounded_difference = Decimal(str(quotation.grand_total or 0)) - Decimal(str(offer.net_total))
	line_drift = len(quotation.items) != len(offer.products) or any(
		Decimal(str(erp.amount or 0)) != Decimal(str(crm.net_amount or 0))
		or Decimal(str(erp.qty)) != Decimal(str(crm.qty))
		for erp, crm in zip(quotation.items, offer.products, strict=False)
	)
	return {
		"available": True,
		"offer_total": offer.net_total,
		"currency": quotation.currency,
		"company": quotation.company,
		"customer": quotation.party_name,
		"net_total": quotation.net_total,
		"grand_total": quotation.grand_total,
		"rounded_total": quotation.rounded_total,
		"rounding_applied": rounding_applied,
		"payable_total": payable,
		"taxes": quotation.total_taxes_and_charges,
		"total_difference": difference,
		"financial_drift": bool(difference or unrounded_difference or line_drift),
		"items": items,
	}


def preview_erp(name):
	doc = _accepted(name)
	if doc.erp_quotation:
		quotation = _read("Quotation", doc.erp_quotation)
		return {**_wire(doc, quotation), "quotation": quotation.name, "review_hash": None}
	quotation, snapshot = _build(doc)
	doc.erp_preview = json.dumps(snapshot, sort_keys=True, default=str)
	doc.erp_preview_hash = frappe.generate_hash(length=64)
	doc.erp_preview_by, doc.erp_preview_at = frappe.session.user, now_datetime()
	service._save(doc)
	return {**_wire(doc, quotation), "review_hash": doc.erp_preview_hash}


def create_erp_quotation(name, review_hash, review_note=""):
	doc = _accepted(name)
	if doc.erp_quotation:
		_read("Quotation", doc.erp_quotation)
		return _result(doc, True)
	age = (now_datetime() - get_datetime(doc.erp_preview_at)).total_seconds() if doc.erp_preview_at else -1
	if (
		doc.erp_preview_by != frappe.session.user
		or not isinstance(review_hash, str)
		or not hmac.compare_digest(review_hash, doc.erp_preview_hash or "")
		or not doc.erp_preview_at
		or not 0 <= age <= 900
	):
		service._fail(
			"Review the ERP quotation preview again before creating it.", frappe.TimestampMismatchError
		)
	quotation, snapshot = _build(doc)
	if digest(snapshot) != digest(json.loads(doc.erp_preview or "{}")):
		service._fail(
			"ERP customer, items, prices or totals changed. Review the quotation again.",
			frappe.TimestampMismatchError,
		)
	try:
		review_note = text(
			review_note,
			"financial drift review note",
			2000,
			required=_wire(doc, quotation)["financial_drift"],
		)
	except ValueError as exc:
		service._fail(str(exc))
	point = "crm_offer_" + frappe.generate_hash(length=12)
	frappe.db.savepoint(point)
	try:
		quotation.insert()
		if quotation.docstatus != 0 or digest(_financial(quotation)) != digest(snapshot["financial"]):
			service._fail(
				"ERP validation changed the quotation totals. Review the quotation again.",
				frappe.TimestampMismatchError,
			)
		doc.erp_quotation, doc.erp_snapshot_hash = quotation.name, digest(snapshot)
		doc.erp_review = json.dumps(
			{
				"source": snapshot,
				"note": review_note,
				"financial_drift": _wire(doc, quotation)["financial_drift"],
			},
			sort_keys=True,
			default=str,
		)
		doc.erp_created_by, doc.erp_created_at = frappe.session.user, now_datetime()
		service._save(doc)
	except Exception:
		frappe.db.rollback(save_point=point)
		raise
	return _result(doc, False)


def _result(doc, replayed):
	return {
		"quotation": doc.erp_quotation,
		"url": "/app/quotation/" + quote(doc.erp_quotation, safe=""),
		"already_existed": replayed,
		"offer": service.dto(doc),
	}
