# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, nowdate

from crm.pipeline.services.deal_title import backfill, default_deal_name, is_migrated
from crm.tests.test_next_activity import open_deal_status


class TestDealTitle(IntegrationTestCase):
	"""`deal_name` is the title field: a blank one renders as an empty link."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		if not is_migrated():
			self.skipTest("CRM Deal.deal_name not migrated on this site")
		self.deals: list[str] = []

	def tearDown(self):
		for name in self.deals:
			frappe.delete_doc("CRM Deal", name, force=True, ignore_missing=True)
		super().tearDown()

	def make_deal(self, **values):
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": open_deal_status(),
				"deal_owner": "Administrator",
				# Sites with FCRM forecasting enabled hard-require these.
				"expected_deal_value": 100,
				"expected_closure_date": add_to_date(nowdate(), days=30),
				**values,
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.deals.append(deal.name)
		return deal

	def test_blank_title_defaults_from_the_lead_name(self):
		deal = self.make_deal(lead_name="Ana Pérez", mobile_no="+5215550000001")
		self.assertEqual(deal.deal_name, "Ana Pérez")

	def test_phone_is_the_last_resort(self):
		# The controller derives channel fields from the primary Contact row;
		# a bare top-level mobile_no is deliberately cleared during validate.
		contact = frappe.get_doc({
			"doctype": "Contact", "first_name": "Title fallback fixture",
			"phone_nos": [{"phone": "+5215550000002", "is_primary_mobile_no": 1}],
		}).insert(ignore_permissions=True)
		deal = self.make_deal(contacts=[{
			"contact": contact.name, "is_primary": 1, "mobile_no": "+5215550000002",
		}])
		self.assertEqual(deal.deal_name, "+5215550000002")

	def test_a_given_title_is_kept_across_saves(self):
		deal = self.make_deal(deal_name="Reparación iPhone — Ana", lead_name="Ana Pérez")
		self.assertEqual(deal.deal_name, "Reparación iPhone — Ana")
		deal.lead_name = "Otra Persona"
		deal.save()
		self.assertEqual(deal.deal_name, "Reparación iPhone — Ana")

	def test_backfill_titles_only_the_blank_ones(self):
		titled = self.make_deal(deal_name="Con título", lead_name="Alguien")
		blank = self.make_deal(lead_name="Sin Título")
		# Blank it behind the hook's back, the way a pre-migration row looks.
		frappe.db.set_value("CRM Deal", blank.name, "deal_name", None, update_modified=False)

		self.assertGreaterEqual(backfill(), 1)

		self.assertEqual(frappe.db.get_value("CRM Deal", blank.name, "deal_name"), "Sin Título")
		self.assertEqual(frappe.db.get_value("CRM Deal", titled.name, "deal_name"), "Con título")

	def test_default_prefers_organization_then_person_then_channel(self):
		self.assertEqual(default_deal_name({"organization": "ACME", "lead_name": "Ana"}), "ACME")
		self.assertEqual(default_deal_name({"first_name": "Ana", "last_name": "Pérez"}), "Ana Pérez")
		self.assertEqual(default_deal_name({"email": "a@b.mx", "mobile_no": "+52"}), "a@b.mx")
		self.assertIsNone(default_deal_name({}))
