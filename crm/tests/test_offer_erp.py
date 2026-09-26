"""Full-graph native ERP fixtures; no mocked quotation, ItemPrice or financial calculation.

Requires normal same-site ERP CRM custom fields to have been installed in the
disposable site before the test transaction (enabling ERPNext CRM Settings).
"""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from crm.api import offers
from crm.tests.test_offers import OfferFixture


class TestOfferERP(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.assertIn(
			"erpnext", frappe.get_installed_apps(), "Run this module in the full-graph native environment"
		)
		self.make_fixture()
		self.assertTrue(
			frappe.get_meta("CRM Product").has_field("erpnext_item_code"),
			"Enable same-site ERPNext CRM Settings before taking the test transaction baseline",
		)
		frappe.db.set_single_value("ERPNext CRM Settings", {"enabled": 0, "is_erpnext_in_different_site": 0})
		self.company = frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": "Offer ERP " + self.key,
				"abbr": self.key[:5].upper(),
				"default_currency": "USD",
				"country": "United States",
				"chart_of_accounts": "Standard",
			}
		).insert()
		self.price_list = frappe.get_doc(
			{
				"doctype": "Price List",
				"price_list_name": "Offers " + self.key,
				"currency": "USD",
				"selling": 1,
				"enabled": 1,
			}
		).insert()
		self.customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": "Offer customer " + self.key,
				"customer_type": "Individual",
				"customer_group": "All Customer Groups",
				"territory": "All Territories",
				"default_price_list": self.price_list.name,
			}
		).insert()
		self.item = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": "OFFER-" + self.key,
				"item_name": "Offer service",
				"item_group": "All Item Groups",
				"stock_uom": "Nos",
				"is_stock_item": 0,
				"is_sales_item": 1,
			}
		).insert()
		self.price = frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": self.item.name,
				"price_list": self.price_list.name,
				"currency": "USD",
				"selling": 1,
				"price_list_rate": 100,
				"uom": "Nos",
			}
		).insert()
		self.product = frappe.get_doc(
			{
				"doctype": "CRM Product",
				"product_code": "OFFER-CRM-" + self.key,
				"product_name": "Offer service",
				"standard_rate": 100,
				"erpnext_item_code": self.item.name,
			}
		).insert()
		self.deal.db_set("erpnext_customer", self.customer.name)
		frappe.db.set_single_value(
			"ERPNext CRM Settings", {"enabled": 1, "erpnext_company": self.company.name}
		)
		frappe.db.set_single_value("Stock Settings", "auto_insert_price_list_rate_if_missing", 0)
		self.values["products"] = [
			{
				"product_code": self.product.name,
				"product_name": "Offer service",
				"qty": 1,
				"rate": 100,
				"discount_percentage": 0,
			}
		]

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def test_native_preview_and_replay_create_one_linked_draft_without_repricing_catalog(self):
		accepted = self.accepted()
		price_before = self.price.price_list_rate
		preview = offers.preview_erp(accepted["name"])
		self.assertEqual(preview["grand_total"], 100)
		self.assertFalse(preview["financial_drift"])
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)
		created = offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		replay = offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		self.assertEqual(created["quotation"], replay["quotation"])
		self.assertTrue(replay["already_existed"])
		quotation = frappe.get_doc("Quotation", created["quotation"])
		self.assertEqual(
			(quotation.docstatus, quotation.crm_deal, quotation.party_name, quotation.grand_total),
			(0, self.deal.name, self.customer.name, 100),
		)
		self.assertIn(accepted["name"], quotation.terms)
		self.assertIn(accepted["terms_hash"], quotation.terms)
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 1)
		self.assertEqual(frappe.db.get_value("Item Price", self.price.name, "price_list_rate"), price_before)

	def test_current_price_change_invalidates_review_then_requires_drift_evidence(self):
		accepted = self.accepted()
		preview = offers.preview_erp(accepted["name"])
		self.price.db_set("price_list_rate", 125)
		with self.assertRaises(frappe.TimestampMismatchError):
			offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)
		preview = offers.preview_erp(accepted["name"])
		self.assertTrue(preview["financial_drift"])
		self.assertEqual(preview["total_difference"], 25)
		with self.assertRaises(frappe.ValidationError):
			offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		created = offers.create_erp_quotation(
			accepted["name"],
			preview["review_hash"],
			"ERP price changed; request customer approval of the new quotation.",
		)
		self.assertEqual(frappe.db.get_value("Quotation", created["quotation"], "grand_total"), 125)
		self.assertEqual(offers.get_offer(accepted["name"])["net_total"], 100)

	def test_disabled_item_invalidates_preview(self):
		accepted = self.accepted()
		preview = offers.preview_erp(accepted["name"])
		self.item.db_set("disabled", 1)
		with self.assertRaises(frappe.ValidationError):
			offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)

	def test_changed_customer_invalidates_the_reviewed_binding(self):
		accepted = self.accepted()
		preview = offers.preview_erp(accepted["name"])
		customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": "Different offer customer " + self.key,
				"customer_type": "Individual",
				"customer_group": "All Customer Groups",
				"territory": "All Territories",
				"default_price_list": self.price_list.name,
			}
		).insert()
		self.deal.db_set("erpnext_customer", customer.name)
		with self.assertRaises(frappe.TimestampMismatchError):
			offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)

	def test_review_token_is_not_transferable_to_another_deal_authorized_actor(self):
		accepted = self.accepted()
		preview = offers.preview_erp(accepted["name"])
		frappe.set_user(self.user)
		self.assertEqual(offers.get_offer(accepted["name"])["status"], "Accepted")
		with self.assertRaises(frappe.TimestampMismatchError):
			offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)

	def test_future_review_timestamp_is_not_fresh(self):
		accepted = self.accepted()
		preview = offers.preview_erp(accepted["name"])
		frappe.db.set_value(
			"CRM Offer",
			accepted["name"],
			"erp_preview_at",
			add_to_date(now_datetime(), minutes=1),
			update_modified=False,
		)
		with self.assertRaises(frappe.TimestampMismatchError):
			offers.create_erp_quotation(accepted["name"], preview["review_hash"])
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)

	def test_wire_preserves_zero_payable_and_obeys_native_rounding_policy(self):
		from crm.integrations.erpnext.offers import _wire

		# Presenter regression, using the native document's rounding-policy method.
		# The manually supplied totals are not a claim about ERP tax calculation.
		quotation = frappe.new_doc("Quotation")
		quotation.update(
			{
				"currency": "USD",
				"company": self.company.name,
				"party_name": self.customer.name,
				"grand_total": 0.4,
				"net_total": 0.4,
				"rounded_total": 0,
				"total_taxes_and_charges": 0,
				"disable_rounded_total": 0,
			}
		)
		quotation.append(
			"items", {"item_code": self.item.name, "qty": 1, "rate": 0.4, "amount": 0.4, "uom": "Nos"}
		)
		offer = frappe._dict(net_total=0.4, products=[frappe._dict(qty=1, net_amount=0.4)])
		frappe.db.set_single_value("Global Defaults", "disable_rounded_total", 0)
		wire = _wire(offer, quotation)
		self.assertTrue(wire["rounding_applied"])
		self.assertEqual(wire["payable_total"], 0)
		self.assertEqual(wire["total_difference"], -0.4)
		self.assertTrue(wire["financial_drift"])
		quotation.disable_rounded_total = 1
		frappe.db.set_single_value("Global Defaults", "disable_rounded_total", 1)
		wire = _wire(offer, quotation)
		self.assertFalse(wire["rounding_applied"])
		self.assertEqual(wire["payable_total"], 0.4)
		self.assertFalse(wire["financial_drift"])

	def test_price_auto_write_settings_block_preview_and_leave_item_price_untouched(self):
		accepted = self.accepted()
		frappe.db.set_single_value("Stock Settings", "auto_insert_price_list_rate_if_missing", 1)
		with self.assertRaises(frappe.ValidationError):
			offers.preview_erp(accepted["name"])
		self.assertEqual(frappe.db.get_value("Item Price", self.price.name, "price_list_rate"), 100)
		self.assertEqual(frappe.db.count("Quotation", {"crm_deal": self.deal.name}), 0)
