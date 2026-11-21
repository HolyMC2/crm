# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""«Resumen de ayer» (crm.morning): the rows, the notice and the owner's hour."""

import datetime
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, nowdate

from crm import handover, morning


def row(key, attention=True, title="Algo"):
	return {"key": key, "title": title, "value": "3", "detail": "", "to": "/x", "attention": attention}


class TestMorning(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.users = []
		self.settings = patch.object(handover, "_stored", return_value={})
		self.settings.start()
		self.addCleanup(self.settings.stop)
		self.paths = patch.object(morning, "_paths", return_value=[])
		self.paths.start()
		self.addCleanup(self.paths.stop)

	def tearDown(self):
		frappe.set_user("Administrator")
		for user in self.users:
			frappe.db.delete("Notification Log", {"for_user": user})
			frappe.cache.delete_value(f"{morning.SENT_KEY}:{user}:{morning.yesterday()}")
			frappe.delete_doc("User", user, force=True, ignore_missing=True)
		super().tearDown()

	def owner(self):
		email = f"zz-manana-{frappe.generate_hash(length=6)}@example.invalid"
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Dueña",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales Manager"}],
			}
		)
		doc.flags.no_welcome_mail = True
		doc.insert(ignore_permissions=True)
		self.users.append(email)
		return email

	def test_a_provider_that_fails_costs_only_its_rows(self):
		def broken(day):
			raise RuntimeError("boom")

		with (
			patch.object(morning, "_paths", return_value=["a", "b"]),
			patch.object(morning, "_load", side_effect=[broken, lambda day: [row("taller.vencidos")]]),
			patch.object(morning, "_sales", return_value=[]),
			patch.object(morning, "_follow_ups", return_value=[]),
			patch.object(morning, "_approvals", return_value=[]),
		):
			self.assertEqual([r["key"] for r in morning.rows()], ["taller.vencidos"])

	def test_the_notice_says_sales_and_what_needs_attention_once_a_day(self):
		user = self.owner()
		found = [row("ventas", attention=False, title="Ventas de ayer"), row("a"), row("b")]
		found[0]["value"] = "$12,400"
		with patch.object(morning, "rows", return_value=found):
			self.assertTrue(morning.send(user, morning.yesterday()))
			self.assertFalse(morning.send(user, morning.yesterday()))
		notices = frappe.get_all("Notification Log", filters={"for_user": user}, fields=["subject"])
		self.assertEqual(len(notices), 1)
		self.assertIn("$12,400", notices[0].subject)
		self.assertIn("2", notices[0].subject)

	def test_nothing_to_say_sends_nothing(self):
		user = self.owner()
		with patch.object(morning, "rows", return_value=[]):
			self.assertFalse(morning.send(user, morning.yesterday()))
		self.assertFalse(frappe.get_all("Notification Log", filters={"for_user": user}))

	def test_it_goes_out_only_at_the_owners_hour_and_when_on(self):
		with (
			patch.object(morning, "recipients", return_value=["x@example.invalid"]),
			patch.object(morning, "send") as send,
		):
			at = datetime.datetime.combine(getdate(nowdate()), datetime.time(9, 5))
			with patch.object(morning, "now_datetime", return_value=at):
				morning.send_due()
				self.assertFalse(send.called)
				self.settings.stop()
				with patch.object(handover, "_stored", return_value={"morning_hour": 9}):
					morning.send_due()
					self.assertTrue(send.called)
					send.reset_mock()
				with patch.object(handover, "_stored", return_value={"morning_hour": 9, "morning": False}):
					morning.send_due()
					self.assertFalse(send.called)
				self.settings.start()

	def test_the_hour_is_one_of_the_offered_ones(self):
		with patch("frappe.db.set_single_value"):
			saved = handover.save_settings({"morning_hour": 7})
			self.assertEqual(saved["morning_hour"], 7)
			with self.assertRaises(frappe.ValidationError):
				handover.save_settings({"morning_hour": 3})

	def test_yesterday_is_the_day_before_in_site_time(self):
		self.assertEqual(morning.yesterday(), getdate(add_days(nowdate(), -1)))
