"""Native CRM → canonical ERP order → payment/POS continuation.

Full graph suite: no finance or permission mocks, no provider calls. The Doco
fixture supplies real ERP company/taxes/items/register/shift/terminal records.
"""

from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import commerce
from crm.tests.companion import fixture, skip_if_missing

OrderCheckoutFixture, MISSING_CHECKOUT = fixture(
	"doco.docoutils.test_order_checkout_native", "OrderCheckoutFixture"
)
configure_company, MISSING_PAYMENTS = fixture(
	"mercadopago_connector.tests.test_order_payments_native", "configure_company"
)


@skip_if_missing(MISSING_CHECKOUT, MISSING_PAYMENTS)
class TestCommerceBroker(OrderCheckoutFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.assertIn("mercadopago_connector", frappe.get_installed_apps())
		configure_company(self.company.name)

	def payment_review(self, order):
		review = commerce.preview_payment_link(order.name)
		self.tokens.append(commerce._review_key(review["review_hash"]))
		return review

	def test_read_context_and_payment_preview_have_no_order_or_financial_effect(self):
		order = self.make_order(tax=True, discount=10)
		before = {
			dt: frappe.db.count(dt)
			for dt in (
				"Payment Request",
				"Payment Entry",
				"MercadoPago Order",
				"POS Charge Request",
				"Sales Invoice",
			)
		}
		context = commerce.get_context(sales_order=order.name)["selected"]
		review = self.payment_review(order)
		self.assertEqual(order.reload().docstatus, 0)
		self.assertTrue(review["requires_submit"])
		self.assertEqual(review["effect"], "submit_order_and_request_link")
		self.assertEqual(float(review["amount"]), order.grand_total)
		self.assertEqual(context["billing"]["state"], "Pending")
		self.assertEqual(context["delivery"]["state"], "Pending")
		self.assertEqual(context["payments"], [])
		self.assertIsNone(context["pos_checkout"])
		self.assertEqual(before, {dt: frappe.db.count(dt) for dt in before})

	def test_explicit_submit_and_link_request_replays_after_review_expiry(self):
		order = self.make_order()
		review = self.payment_review(order)
		request_id = uuid4().hex
		first = commerce.request_payment_link(order.name, review["review_hash"], request_id)
		self.assertEqual(order.reload().docstatus, 1)
		self.assertEqual(first["state"], "Queued")
		self.assertIsNone(first["checkout_url"])
		frappe.cache.delete_value(commerce._review_key(review["review_hash"]))
		repeated = commerce.request_payment_link(order.name, review["review_hash"], request_id)
		self.assertEqual(repeated["name"], first["name"])
		self.assertTrue(repeated["replayed"])
		self.assertEqual(frappe.db.count("MercadoPago Order", {"sales_order": order.name}), 1)
		self.assertEqual(
			frappe.db.count(
				"Payment Request", {"reference_doctype": "Sales Order", "reference_name": order.name}
			),
			1,
		)
		self.assertFalse(
			frappe.db.exists(
				"Payment Entry Reference", {"reference_doctype": "Sales Order", "reference_name": order.name}
			)
		)

	def test_stale_review_cannot_submit_or_create_a_payment_intent(self):
		order = self.make_order()
		review = self.payment_review(order)
		order.items[0].rate = 75
		order.save()
		with self.assertRaises(frappe.TimestampMismatchError):
			commerce.request_payment_link(order.name, review["review_hash"], uuid4().hex)
		self.assertEqual(order.reload().docstatus, 0)
		self.assertFalse(frappe.db.exists("MercadoPago Order", {"sales_order": order.name}))

	def test_known_order_cannot_borrow_an_unrelated_deal_context(self):
		order = self.make_order()
		with self.assertRaises(frappe.PermissionError):
			commerce.preview_payment_link(order.name, deal="NOT-THE-SOURCE")

	def test_guest_cannot_view_order_or_review_financial_effect(self):
		order = self.make_order()
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			commerce.get_context(sales_order=order.name)
		with self.assertRaises(frappe.PermissionError):
			commerce.preview_payment_link(order.name)

	def test_genuinely_zero_order_does_not_create_a_payment_link(self):
		order = self.make_order(rate=0)
		context = commerce.get_context(sales_order=order.name)["selected"]
		self.assertEqual(float(context["total"]), 0)
		with self.assertRaisesRegex(frappe.ValidationError, "no remaining amount"):
			commerce.preview_payment_link(order.name)
		self.assertFalse(frappe.db.exists("MercadoPago Order", {"sales_order": order.name}))

	def test_cashier_receipt_recovers_the_existing_request_after_review_expiry(self):
		order = self.make_order()
		review = commerce.preview_checkout(order.name, self.profile.name)
		first = commerce.queue_checkout(order.name, self.profile.name, review["review_hash"])
		frappe.cache.delete_value(commerce._owner()._review_key(review["review_hash"]))
		context = commerce.get_context(sales_order=order.name)["selected"]
		self.assertEqual(context["pos_checkout"]["charge_request"], first["charge_request"])
		self.assertEqual(context["pos_checkout"]["cashier_url"], first["cashier_url"])
		self.assertEqual(context["pos_checkout"]["state"], "Open")
		self.assertEqual(
			frappe.db.count(
				"POS Charge Request", {"reference_name": order.name, "reference_doctype": "Sales Order"}
			),
			1,
		)

	def test_payment_command_cannot_use_another_orders_receipt(self):
		order = self.make_order()
		review = self.payment_review(order)
		payment = commerce.request_payment_link(order.name, review["review_hash"], uuid4().hex)
		other = self.make_order()
		with self.assertRaises(frappe.PermissionError):
			commerce.cancel_payment(payment["name"], other.name)
		self.assertEqual(frappe.db.get_value("MercadoPago Order", payment["name"], "online_state"), "Queued")
