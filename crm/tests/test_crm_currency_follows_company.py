"""CRM money follows the company's currency once setup has picked it."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.install import align_currency_with_company


class TestCrmCurrencyFollowsCompany(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		company = frappe.defaults.get_global_default("company")
		self.target = frappe.get_cached_value("Company", company, "default_currency") if company else None
		if not self.target:
			self.skipTest("needs a default company with a currency")
		self.other = "INR" if self.target != "INR" else "USD"
		frappe.db.set_single_value("FCRM Settings", "currency", self.other)
		self.addCleanup(frappe.db.rollback)

	def test_a_site_with_no_deals_takes_the_company_currency(self):
		frappe.db.delete("CRM Deal")
		self.assertEqual(align_currency_with_company(), self.target)
		self.assertEqual(frappe.db.get_single_value("FCRM Settings", "currency"), self.target)
		self.assertIsNone(align_currency_with_company())

	def test_deals_already_priced_keep_their_currency(self):
		if not frappe.db.count("CRM Deal"):
			# A bare row is enough: the rule only asks whether any deal exists.
			frappe.db.sql(
				"""INSERT INTO `tabCRM Deal` (name, creation, modified, owner, modified_by, docstatus)
				VALUES ('CRM-DEAL-CURRENCY-TEST', NOW(), NOW(), 'Administrator', 'Administrator', 0)"""
			)
		self.assertIsNone(align_currency_with_company())
		self.assertEqual(frappe.db.get_single_value("FCRM Settings", "currency"), self.other)
