"""Native Frappe lifecycle, SQL scope, immutable history and idempotent offers."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate

from crm.api import offers
from crm.offers import service


class OfferFixture:
	def make_fixture(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", "currency", "USD")
		self.key = frappe.generate_hash(length=8)
		self.user = f"offer-{self.key}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.user,
				"first_name": "Offer",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert()
		status = frappe.get_doc(
			{
				"doctype": "CRM Deal Status",
				"deal_status": f"Offer Open {self.key}",
				"type": "Open",
				"position": 1,
				"probability": 50,
			}
		).insert()
		self.pipeline = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": f"Offers {self.key}",
				"currency": "USD",
				"probability_policy": "Manual",
				"stages": [{"status": status.name, "probability": 50}],
			}
		).insert()
		self.deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"pipeline": self.pipeline.name,
				"status": status.name,
				"deal_owner": self.user,
				"currency": "USD",
				"expected_deal_value": 100,
				"expected_closure_date": add_days(nowdate(), 14),
				"probability": 50,
			}
		).insert()
		self.other = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"pipeline": self.pipeline.name,
				"status": status.name,
				"deal_owner": "Administrator",
				"currency": "USD",
				"expected_deal_value": 9000,
				"expected_closure_date": add_days(nowdate(), 14),
				"probability": 50,
			}
		).insert()
		self.values = {
			"title": "Service proposal",
			"currency": "USD",
			"valid_until": add_days(nowdate(), 14),
			"terms": "Service appointment by agreement",
			"products": [
				{"product_name": "Installation", "qty": 3, "rate": "19.995", "discount_percentage": 10}
			],
		}

	def draft(self, **overrides):
		return offers.save_draft(
			self.deal.name, {**self.values, **overrides}, request_id=frappe.generate_hash(length=16)
		)

	def accepted(self):
		draft = self.draft()
		issued = offers.issue(draft["name"], str(draft["modified"]))
		return offers.record_decision(
			issued["name"],
			"Accepted",
			"Email",
			"Customer Maria accepted revision 1 by email.",
			str(issued["modified"]),
		)


class TestOffers(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.make_fixture()

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def test_standalone_service_offer_never_requires_an_erp_import(self):
		with patch("frappe.get_installed_apps", return_value=["frappe", "crm"]):
			result = self.accepted()
			self.assertEqual(result["net_total"], 53.99)
			self.assertEqual(result["status"], "Accepted")
			self.assertFalse(result["capabilities"]["can_erp"])
			self.assertFalse(offers.get_offers(self.deal.name)["erp_available"])
		self.deal.reload()
		self.assertEqual(self.deal.expected_deal_value, 100)
		self.assertEqual(self.deal.status, self.pipeline.stages[0].status)

	def test_create_replay_and_changed_request_identity(self):
		first = offers.save_draft(self.deal.name, self.values, request_id=self.key)
		replay = offers.save_draft(self.deal.name, self.values, request_id=self.key)
		self.assertEqual(first["name"], replay["name"])
		self.assertEqual(frappe.db.count("CRM Offer", {"deal": self.deal.name}), 1)
		with self.assertRaises(frappe.ValidationError):
			offers.save_draft(self.deal.name, {**self.values, "title": "Different"}, request_id=self.key)

	def test_stale_draft_edit_does_not_replace_saved_work(self):
		draft = self.draft()
		saved = offers.save_draft(
			self.deal.name,
			{**self.values, "title": "Latest edit"},
			name=draft["name"],
			modified=str(draft["modified"]),
		)
		with self.assertRaises(frappe.TimestampMismatchError):
			offers.save_draft(
				self.deal.name,
				{**self.values, "title": "Stale edit"},
				name=draft["name"],
				modified=str(draft["modified"]),
			)
		self.assertEqual(offers.get_offer(saved["name"])["title"], "Latest edit")

	def test_issue_and_decision_exact_retry_keep_one_evidence_record(self):
		draft = self.draft()
		issued = offers.issue(draft["name"], str(draft["modified"]))
		self.assertEqual(
			offers.issue(draft["name"], str(draft["modified"]))["issued_at"], issued["issued_at"]
		)
		arguments = (
			issued["name"],
			"Accepted",
			"Phone",
			"Maria confirmed the exact printed revision.",
			str(issued["modified"]),
		)
		accepted = offers.record_decision(*arguments)
		self.assertEqual(offers.record_decision(*arguments)["decision_at"], accepted["decision_at"])
		with self.assertRaises(frappe.TimestampMismatchError):
			offers.record_decision(
				issued["name"], "Rejected", "Phone", "Different decision", str(issued["modified"])
			)
		self.assertEqual(offers.get_offer(accepted["name"])["decision_evidence"], arguments[3])

	def test_revision_never_inherits_acceptance_and_replay_returns_same_new_draft(self):
		accepted = self.accepted()
		revision = offers.revise(accepted["name"], self.key)
		self.assertEqual(revision["revision"], 2)
		self.assertEqual(revision["status"], "Draft")
		self.assertFalse(revision["decision_at"])
		self.assertEqual(offers.revise(accepted["name"], self.key)["name"], revision["name"])
		history = offers.get_offer(accepted["name"])
		self.assertEqual(history["status"], "Accepted")
		self.assertFalse(history["is_current"])
		self.assertFalse(history["capabilities"]["can_erp"])
		with self.assertRaises(frappe.ValidationError):
			offers.revise(accepted["name"], self.key + "second")

	def test_native_save_cannot_mutate_issued_terms_or_forge_acceptance(self):
		accepted = self.accepted()
		doc = frappe.get_doc("CRM Offer", accepted["name"])
		doc.products[0].rate = 1
		with self.assertRaises(frappe.PermissionError):
			doc.save()
		self.assertEqual(offers.get_offer(accepted["name"])["net_total"], 53.99)
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("CRM Offer", accepted["name"])

	def test_issue_rejects_expired_validity_and_decision_rejects_expired_issued_offer(self):
		past = self.draft(valid_until=add_days(nowdate(), -1))
		with self.assertRaises(frappe.ValidationError):
			offers.issue(past["name"], str(past["modified"]))
		draft = self.draft(valid_until=nowdate())
		issued = offers.issue(draft["name"], str(draft["modified"]))
		with patch("crm.offers.service.nowdate", return_value=add_days(nowdate(), 1)):
			self.assertEqual(offers.get_offer(issued["name"])["effective_status"], "Expired")
			with self.assertRaises(frappe.ValidationError):
				offers.record_decision(
					issued["name"], "Accepted", "Email", "Late reply", str(issued["modified"])
				)
			self.assertEqual(offers.expire(issued["name"], str(issued["modified"]))["status"], "Expired")

	def test_restricted_user_cannot_read_print_write_or_list_another_deals_offer(self):
		own = self.draft()
		other = offers.save_draft(self.other.name, self.values, request_id=self.key)
		frappe.set_user(self.user)
		self.assertEqual(offers.get_offer(own["name"])["deal"], self.deal.name)
		for operation in (
			lambda: offers.get_offer(other["name"]),
			lambda: offers.preview(other["name"]),
			lambda: offers.get_offers(self.other.name),
			lambda: offers.issue(other["name"], str(other["modified"])),
		):
			with self.assertRaises(frappe.PermissionError):
				operation()
		visible = frappe.get_list("CRM Offer", pluck="name", limit_page_length=0)
		self.assertIn(own["name"], visible)
		self.assertNotIn(other["name"], visible)

	def test_permissioned_preview_escapes_customer_text_and_keeps_amount_labels_truthful(self):
		draft = self.draft(title="<script>alert(1)</script>", terms="<img src=x onerror=alert(1)>")
		html = offers.preview(draft["name"])["html"]
		self.assertNotIn("<script>", html)
		self.assertNotIn("<img ", html)
		self.assertIn("53.99 USD", html)
		self.assertIn("Taxes are not calculated", html)

	def test_paginated_history_preserves_latest_revision_and_exact_total(self):
		accepted = self.accepted()
		self.draft(title="Another offer")
		offers.revise(accepted["name"], self.key)
		page = offers.get_offers(self.deal.name, offset=2, limit=1)
		self.assertEqual(page["total"], 3)
		self.assertFalse(page["has_more"])
		self.assertEqual(page["offers"][0]["name"], accepted["name"])
		self.assertFalse(page["offers"][0]["is_current"])

	def test_issued_preview_uses_frozen_currency_after_native_link_rewrite(self):
		accepted = self.accepted()
		# Native Link renames operate outside Document.save. Model that rewrite on
		# this one synthetic row; the customer-visible issued revision must survive.
		frappe.db.set_value("CRM Offer", accepted["name"], "currency", "MXN", update_modified=False)
		html = offers.preview(accepted["name"])["html"]
		self.assertIn("53.99 USD", html)
		self.assertNotIn("MXN", html)
		self.assertEqual(offers.get_offer(accepted["name"])["currency"], "USD")

	def test_claimed_amounts_and_blank_decision_provenance_are_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self.draft(net_total=1)
		draft = self.draft()
		issued = offers.issue(draft["name"], str(draft["modified"]))
		with self.assertRaises(frappe.ValidationError):
			offers.record_decision(issued["name"], "Accepted", "Email", " ", str(issued["modified"]))
