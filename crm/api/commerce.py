"""Continue a CRM sale through its native ERP order, cashier or payment owner.

No provider calls, finance ledger or inferred deal-stage changes live here.
Optional app imports occur only after explicit capability and record checks.
"""

from contextlib import contextmanager
from importlib import import_module
from urllib.parse import quote

import frappe
from frappe import _
from frappe.model import get_permitted_fields


def _fail(message, exception=frappe.ValidationError):
	frappe.throw(_(message), exception)


def _identifier(value):
	if (
		not isinstance(value, str)
		or not value
		or len(value) > 140
		or any(ord(c) < 32 or ord(c) == 127 for c in value)
	):
		_fail("Choose a valid source record.")
	return value


def _optional(app, module):
	# Companion apps may be deployed before or after the adapter this CRM
	# revision needs; an absent adapter means the capability is unavailable.
	if app not in frappe.get_installed_apps():
		return None
	try:
		return import_module(module)
	except ImportError:
		return None


def _checkout_module():
	if "erpnext" not in frappe.get_installed_apps():
		return None
	return _optional("doco", "doco.docoutils.order_checkout")


def _payments_modules():
	# `service` and `source` may be submodules; import each one explicitly.
	package = "mercadopago_connector.services.order_payments"
	service = _optional("mercadopago_connector", package + ".service")
	source = _optional("mercadopago_connector", package + ".source")
	return (service, source) if service and source else None


def _available():
	return _checkout_module() is not None


def _owner():
	owner = _checkout_module()
	if owner is None:
		_fail("Native ERP order checkout is not installed on this site.")
	return owner


def _payments():
	payments = _payments_modules()
	if payments is None:
		_fail("Mercado Pago order payments are not installed on this site.")
	return payments


def _deal(name, *, write=False):
	doc = frappe.get_doc("CRM Deal", _identifier(name))
	doc.check_permission("read")
	if write:
		doc.check_permission("write")
	return doc


@contextmanager
def _bound_order(sales_order, *, deal=None, cart=None, write=False):
	owner = _owner()
	if cart:
		if "doco_meta_catalog" not in frappe.get_installed_apps():
			_fail("Catalog order review is not installed on this site.")
		from doco_meta_catalog import orders

		from crm.api import conversations

		first = orders._load(_identifier(cart))
		orders._conversation(first, write=write)
		with conversations.conversation_fence(first.conversation):
			current = orders._load(cart, lock=True)
			orders._conversation(current, write=write)
			if current.sales_order != sales_order or (deal and current.deal != deal):
				_fail("This cart is not linked to the selected order.", frappe.PermissionError)
			with _bound_order(sales_order, deal=deal, write=write) as order:
				yield order
		return
	order = owner._fresh(_identifier(sales_order), write=write)
	owner._scope(order)
	linked_deal = order.get("crm_deal")
	if deal and linked_deal != deal:
		_fail("This order is not linked to the selected opportunity.", frappe.PermissionError)
	if linked_deal:
		_deal(linked_deal, write=write)
	yield order


def _summary(order):
	owner = _owner()
	total = owner.contract.money(owner._total(order))
	advance = owner.contract.money(order.advance_paid)
	return {
		"name": order.name,
		"status": order.status,
		"docstatus": order.docstatus,
		"currency": order.currency,
		"total": str(total),
		"advance_paid": str(advance),
		"remaining": str(total - advance),
		"sales_order_url": "/app/sales-order/" + quote(order.name, safe=""),
	}


def _read_status_fields():
	meta = frappe.get_meta("Sales Order")
	needed = {key for key in ("status", "per_delivered", "per_billed", "advance_paid") if meta.has_field(key)}
	permitted = set(get_permitted_fields("Sales Order", permission_type="read"))
	masked = {field.fieldname for field in meta.get_masked_fields()}
	if not needed.issubset(permitted) or needed & masked:
		_fail(
			"Your permissions do not allow reviewing this order's billing and delivery status.",
			frappe.PermissionError,
		)


def _checkout_receipt(order):
	if "posawesome" not in frappe.get_installed_apps():
		return None
	names = frappe.db.get_values(
		"POS Charge Request",
		filters={"reference_doctype": "Sales Order", "reference_name": order.name},
		fieldname="name",
		pluck=True,
		order_by="creation desc",
		limit=1,
		for_update=True,
	)
	if not names:
		return None
	request = frappe.get_doc("POS Charge Request", names[0])
	if (request.company, request.customer, request.currency) != (
		order.company,
		order.customer,
		order.currency,
	):
		_fail("The cashier request has inconsistent source details. Review it in ERP.")
	return _owner()._result(order, request, replayed=True)


def _deal_orders(deal):
	_deal(deal)
	owner = _owner()
	owner._read_fields(None)
	_read_status_fields()
	if not frappe.get_meta("Sales Order").has_field("crm_deal"):
		return [], False
	rows = frappe.get_list(
		"Sales Order",
		filters={"crm_deal": deal},
		fields=[
			"name",
			"status",
			"docstatus",
			"currency",
			"grand_total",
			"rounded_total",
			"disable_rounded_total",
			"advance_paid",
		],
		order_by="modified desc, name desc",
		limit_page_length=21,
	)
	return [_summary(frappe.get_doc({"doctype": "Sales Order", **row})) for row in rows[:20]], len(rows) > 20


def _invoices(order):
	if not frappe.has_permission("Sales Invoice", "read"):
		return []
	permitted = set(get_permitted_fields("Sales Invoice", permission_type="read"))
	masked = {field.fieldname for field in frappe.get_meta("Sales Invoice").get_masked_fields()}
	needed = {"currency", "outstanding_amount"}
	if not needed.issubset(permitted) or needed & masked:
		return []
	rows = frappe.get_list(
		"Sales Invoice",
		filters=[["Sales Invoice Item", "sales_order", "=", order.name]],
		fields=["name", "docstatus", "currency", "outstanding_amount"],
		distinct=True,
		order_by="modified desc",
		limit_page_length=20,
	)
	return [{**row, "invoice_url": "/app/sales-invoice/" + quote(row.name, safe="")} for row in rows]


def _profiles(order):
	if "posawesome" not in frappe.get_installed_apps() or not frappe.has_permission("POS Profile", "read"):
		return []
	filters = {
		"company": order.company,
		"currency": order.currency,
		"create_pos_invoice_instead_of_sales_invoice": 0,
	}
	if frappe.get_meta("POS Profile").has_field("disabled"):
		filters["disabled"] = 0
	return frappe.get_list(
		"POS Profile", filters=filters, fields=["name"], order_by="name", limit_page_length=100
	)


@frappe.whitelist()
def get_context(sales_order=None, deal=None, cart=None):
	if not _available():
		return {"available": False, "reason_code": "erp_checkout_unavailable", "orders": [], "selected": None}
	orders, has_more = _deal_orders(deal) if deal else ([], False)
	result = {
		"available": True,
		"reason_code": None,
		"orders": orders,
		"has_more": has_more,
		"selected": None,
	}
	if not sales_order:
		return result
	with _bound_order(sales_order, deal=deal, cart=cart) as order:
		_read_status_fields()
		selected = _summary(order)
		can_write = order.has_permission("write") and (
			not order.get("crm_deal") or _deal(order.crm_deal).has_permission("write")
		)
		payment_installed = _payments_modules() is not None
		payment_available = False
		payment_reason = "payment_adapter_unavailable"
		payments = []
		if payment_installed:
			service, source = _payments()
			if can_write:
				payments = service.list_payments(order.name)
				try:
					source.actor(order, money=True)
					source.settings(order, creating=True)
				except frappe.PermissionError:
					payment_reason = "payment_permission_required"
				except frappe.ValidationError:
					payment_reason = "payment_configuration_required"
				else:
					payment_available, payment_reason = True, None
			else:
				payment_reason = "payment_permission_required"
		profiles = _profiles(order)
		selected.update(
			{
				"customer": order.customer,
				"company": order.company,
				"delivery": {
					"percent": order.per_delivered,
					"state": "Cancelled"
					if order.docstatus == 2
					else "Delivered"
					if order.per_delivered >= 100
					else "Partial"
					if order.per_delivered
					else "Pending",
				},
				"billing": {
					"percent": order.per_billed,
					"state": "Cancelled"
					if order.docstatus == 2
					else "Billed"
					if order.per_billed >= 100
					else "Partial"
					if order.per_billed
					else "Pending",
					"invoices": _invoices(order),
				},
				"profiles": profiles,
				"payments": payments,
				"pos_checkout": _checkout_receipt(order),
				"payment_available": payment_available,
				"payment_reason_code": payment_reason,
				"capabilities": {
					"can_pos_review": bool(can_write and profiles and order.docstatus != 2),
					"can_payment_review": bool(can_write and payment_available and order.docstatus != 2),
					"can_submit": bool(order.docstatus == 0 and order.has_permission("submit")),
				},
			}
		)
		result["selected"] = selected
		return result


@frappe.whitelist(methods=["POST"])
def preview_checkout(sales_order, pos_profile, deal=None, cart=None):
	with _bound_order(sales_order, deal=deal, cart=cart, write=True):
		return _owner().preview(sales_order, pos_profile)


@frappe.whitelist(methods=["POST"])
def queue_checkout(sales_order, pos_profile, review_hash, deal=None, cart=None):
	with _bound_order(sales_order, deal=deal, cart=cart, write=True):
		return _owner().queue(sales_order, pos_profile, review_hash)


def _review_key(token):
	if not isinstance(token, str) or len(token) != 64 or not token.isalnum():
		_fail("Review the order before requesting its payment link.")
	return f"crm:order-payment:{frappe.session.user}:{token}"


def _review_state(order, source, settings):
	return {
		"source": source.commercial(order),
		"config": source.config_snapshot(settings),
		"advance_paid": str(order.advance_paid or 0),
	}


@frappe.whitelist(methods=["POST"])
def preview_payment_link(sales_order, deal=None, cart=None):
	with _bound_order(sales_order, deal=deal, cart=cart, write=True) as order:
		owner = _owner()
		service, source = _payments()
		source.actor(order, money=True)
		settings = source.settings(order, creating=True)
		owner._eligible(order)
		service.assert_pos_allowed(order)
		source.no_other_payer(order)
		if order.docstatus == 0:
			order.check_permission("submit")
		total = owner.contract.money(owner._total(order))
		amount = total - owner.contract.money(order.advance_paid)
		if amount <= 0:
			_fail("This order has no remaining amount to collect.")
		token = frappe.generate_hash(length=64)
		frappe.cache.set_value(
			_review_key(token),
			{
				"sales_order": order.name,
				"state": owner.contract.digest(_review_state(order, source, settings)),
				"modified": str(order.modified),
				"docstatus": order.docstatus,
			},
			expires_in_sec=900,
		)
		return {
			"sales_order": order.name,
			"customer": order.customer,
			"company": order.company,
			"currency": order.currency,
			"total": str(total),
			"advance_paid": str(order.advance_paid or 0),
			"amount": str(amount),
			"requires_submit": order.docstatus == 0,
			"review_hash": token,
			"items": owner._rows(order),
			"effect": "submit_order_and_request_link" if order.docstatus == 0 else "request_link",
		}


@frappe.whitelist(methods=["POST"])
def request_payment_link(sales_order, review_hash, request_id, deal=None, cart=None):
	with _bound_order(sales_order, deal=deal, cart=cart, write=True) as order:
		owner = _owner()
		service, source = _payments()
		source.actor(order, money=True)
		# The owner resolves a durable retry before any fresh effect. A lost HTTP
		# response must not ask the seller to manufacture a different intent key.
		service.contract.identifier(request_id)
		if frappe.db.get_values(
			"MercadoPago Order",
			filters={"sales_order": order.name, "request_id": request_id, "flow": "Online"},
			fieldname=["name"],
			limit=1,
			for_update=True,
		):
			return service.request_link(order.name, request_id)
		receipt = frappe.cache.get_value(_review_key(review_hash))
		settings = source.settings(order, creating=True)
		if (
			not receipt
			or receipt["sales_order"] != order.name
			or receipt["modified"] != str(order.modified)
			or receipt["docstatus"] != order.docstatus
			or receipt["state"] != owner.contract.digest(_review_state(order, source, settings))
		):
			_fail(
				"The order, payments or account changed, or the review expired. Review it again.",
				frappe.TimestampMismatchError,
			)
		owner._eligible(order)
		if order.docstatus == 0:
			order.check_permission("submit")
			order.submit()
			if receipt["state"] != owner.contract.digest(_review_state(order, source, settings)):
				_fail("ERP validation changed the order. Review its updated terms before requesting payment.")
		return service.request_link(order.name, request_id)


def _payment_action(action, name, sales_order, deal, cart):
	with _bound_order(sales_order, deal=deal, cart=cart, write=True) as order:
		service, _source = _payments()
		status = service.get_status(_identifier(name))
		if status["sales_order"] != order.name:
			_fail("This payment belongs to a different order.", frappe.PermissionError)
		return getattr(service, action)(name)


@frappe.whitelist(methods=["POST"])
def refresh_payment(name, sales_order, deal=None, cart=None):
	return _payment_action("refresh", name, sales_order, deal, cart)


@frappe.whitelist(methods=["POST"])
def cancel_payment(name, sales_order, deal=None, cart=None):
	return _payment_action("cancel_link", name, sales_order, deal, cart)
