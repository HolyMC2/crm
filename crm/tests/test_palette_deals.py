"""Ctrl+K deal provider (CRM-S3.3): a customer's name, phone or RO finds their deal."""

from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import palette


class PaletteHelpersTests(TestCase):
	def test_phone_queries_key_on_national_digits(self):
		self.assertEqual(palette._phone_digits("695 122 3254"), "6951223254")
		self.assertEqual(palette._phone_digits("+52 1 695 122 3254"), "6951223254")
		self.assertEqual(palette._phone_digits("(695) 122-32"), "69512232")
		self.assertIsNone(palette._phone_digits("RO-00123"))
		self.assertIsNone(palette._phone_digits("12 34"))
		self.assertIsNone(palette._phone_digits("karolina"))

	def test_every_word_must_match(self):
		self.assertEqual(palette._words("  karolina   quevedo "), ["karolina", "quevedo"])

	def test_title_skips_a_channel_used_as_title(self):
		row = frappe._dict(name="D-1", deal_name="ana@example.test", email="ana@example.test")
		self.assertEqual(palette.deal_title(row, "Ana López"), "Ana López")
		row = frappe._dict(name="D-2", deal_name="Apple iPhone 12 — Karolina Quevedo")
		self.assertEqual(palette.deal_title(row), "Apple iPhone 12 — Karolina Quevedo")
		self.assertEqual(palette.deal_title(frappe._dict(name="D-3", first_name="Ana")), "Ana")

	def test_short_queries_and_guests_do_not_search(self):
		with patch("crm.api.check_app_permission", return_value=True):
			self.assertEqual(palette.search_deals("k"), [])

	def test_without_ventas_access_nothing_is_returned(self):
		with patch("crm.api.check_app_permission", return_value=False):
			self.assertEqual(palette.search_deals("karolina"), [])


class PaletteSearchTests(IntegrationTestCase):
	"""Run on disposable sites: a real deal, the native permission query, SQL rollback."""

	def setUp(self):
		from crm.tests.test_next_activity import open_deal_status

		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, self.previous_user)
		self.tag = uuid4().hex[:8]
		self.phone = "695" + str(uuid4().int)[:7]
		contact = frappe.new_doc("Contact")
		contact.first_name, contact.last_name = "Karolina", f"Q{self.tag}"
		contact.append(
			"phone_nos",
			{"phone": f"{self.phone[:3]} {self.phone[3:6]} {self.phone[6:]}", "is_primary_mobile_no": 1},
		)
		contact.insert(ignore_permissions=True)
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": open_deal_status(),
				"deal_owner": "Administrator",
				"deal_name": f"Apple iPhone 12 — Karolina Q{self.tag}",
				"first_name": "Karolina",
				"last_name": f"Q{self.tag}",
				"contacts": [{"contact": contact.name, "is_primary": 1}],
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.deal = deal.name

	def _names(self, q):
		return [row["name"] for row in palette.search_deals(q)]

	def test_name_words_phone_spellings_and_deal_id_find_the_deal(self):
		for q in (
			f"karolina q{self.tag}",
			f"q{self.tag} iphone",
			self.phone,
			f"+52 1 {self.phone}",
			self.deal,
		):
			with self.subTest(q=q):
				self.assertIn(self.deal, self._names(q))

	def test_unrelated_text_does_not_match(self):
		self.assertNotIn(self.deal, self._names(f"zz{self.tag}"))
