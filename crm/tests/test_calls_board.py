"""The calls page's board and the shop line's team (site): figures over real call
logs, who may see each person's figures, and who may choose who answers."""

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import frappe

from crm import call_team, calls_board

SHOP = "+526690000001"
CUSTOMER = "+526697770001"


def log(kind, status, when, *, frm=CUSTOMER, to=SHOP, duration=0, **extra):
	sid = "CAboard" + frappe.generate_hash(length=10)
	frappe.get_doc(
		{
			"doctype": "CRM Call Log",
			"id": sid,
			"name": sid,
			"type": kind,
			"status": status,
			"from": frm,
			"to": to,
			"duration": duration,
			"telephony_medium": "Twilio",
			"start_time": when,
			**extra,
		}
	).insert(ignore_permissions=True)
	return sid


class TestCallsBoard(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.addCleanup(frappe.set_user, frappe.session.user)
		frappe.db.delete("CRM Call Log", {"name": ["like", "CAboard%"]})
		self.now = datetime.now().replace(microsecond=0)
		self.missed = log("Incoming", "No Answer", self.now - timedelta(hours=3))
		log(
			"Outgoing",
			"Completed",
			self.now - timedelta(hours=2, minutes=50),
			frm=SHOP,
			to=CUSTOMER,
			duration=40,
		)
		self.waiting = log(
			"Incoming", "No Answer", self.now - timedelta(hours=2), frm="+526697770002", after_hours=1
		)
		log("Incoming", "Completed", self.now - timedelta(hours=1), frm="+526697770003", duration=90)

	def _mine(self, out):
		return {k: v for k, v in out["items"].items() if k.startswith("CAboard")}

	def test_figures_over_the_log(self):
		with patch.object(calls_board, "site_hours", return_value=calls_board.Hours()):
			out = calls_board.board(7, self.now)
		items = self._mine(out)
		self.assertEqual(items[self.missed]["verdict"], "returned")
		self.assertEqual(items[self.missed]["minutes"], 10)
		self.assertEqual(
			items[self.waiting],
			{"verdict": "not_returned", "minutes": None, "closed": True, "message": False},
		)
		self.assertIn(self.waiting, out["waiting"])
		self.assertGreaterEqual(out["totals"]["missed_closed"], 1)

	def test_people_only_for_managers(self):
		with patch.object(calls_board, "site_hours", return_value=calls_board.Hours()):
			with patch.object(frappe, "get_roles", return_value=["Sales User"]):
				self.assertIsNone(calls_board.board(7, self.now)["people"])
			with patch.object(frappe, "get_roles", return_value=["Sales Manager"]):
				self.assertIsInstance(calls_board.board(7, self.now)["people"], list)


class TestCallTeam(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.user = frappe.db.get_value(
			"User", {"enabled": 1, "user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]}
		)
		self.enterContext(patch.object(call_team, "shop_numbers", return_value=[SHOP]))

	def test_a_manager_puts_a_person_on_the_line(self):
		with patch.object(frappe, "get_roles", return_value=["Sales Manager"]):
			out = call_team.save(self.user, 1)
		self.assertEqual(frappe.db.get_value("CRM Telephony Agent", self.user, "twilio_number"), SHOP)
		self.assertIn(self.user, [p["user"] for p in out["people"]])
		with patch.object(frappe, "get_roles", return_value=["Sales Manager"]):
			call_team.save(self.user, 0)
		self.assertFalse(frappe.db.get_value("CRM Telephony Agent", self.user, "twilio_number"))

	def test_calls_to_a_phone_need_its_number(self):
		with patch.object(frappe, "get_roles", return_value=["Sales Manager"]):
			frappe.db.set_value("User", self.user, "mobile_no", "")
			if frappe.db.exists("CRM Telephony Agent", self.user):
				frappe.db.set_value("CRM Telephony Agent", self.user, "mobile_no", "")
			with self.assertRaises(frappe.ValidationError):
				call_team.save(self.user, 1, "Phone")
			call_team.save(self.user, 1, "Phone", "669 555 0000")
		self.assertEqual(
			frappe.db.get_value("CRM Telephony Agent", self.user, ["call_receiving_device", "mobile_no"]),
			("Phone", "669 555 0000"),
		)

	def test_only_managers_choose(self):
		with patch.object(frappe, "get_roles", return_value=["Sales User"]):
			with self.assertRaises(frappe.PermissionError):
				call_team.save(self.user, 1)
			with self.assertRaises(frappe.PermissionError):
				call_team.team()


if __name__ == "__main__":
	unittest.main()
