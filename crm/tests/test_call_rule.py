"""Calls ring the salespeople at work (site; Twilio is always mocked, no call is placed).

An incoming call under the «shift» rule rings who the attendance hook says is at work
and sells, each on their own device («in Muelle» for someone who never chose one), plus
the people who always ring; nobody at work falls back to the list. The call's log keeps
who was at work and who rang, the board shows it per missed call, and the browser of a
salesperson who is not on the number still gets an incoming-calls token.
"""

import json
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

import frappe

from crm import call_rule, call_team, calls_answer, calls_board
from crm.integrations import api as integrations_api
from crm.integrations.twilio import api, twilio_handler
from crm.tests.test_calls_answer import CUSTOMER, RULES, SHOP, fake_twilio

SELLER = "turno-vende@example.com"
LISTED = "turno-lista@example.com"
OWNER = "turno-dueno@example.com"


def user(email, roles=("Sales User",)):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0].replace("-", " ").title(),
				"send_welcome_email": 0,
				"user_type": "System User",
				"roles": [{"role": r} for r in roles],
			}
		).insert(ignore_permissions=True)
	return email


def staff(at_work=(), kept=True, team=None):
	team = team if team is not None else {SELLER: "Ventas", LISTED: "Ventas", OWNER: ""}
	return {
		"kept": kept,
		"team": [{"user": u, "area": a, "area_label": a} for u, a in team.items()],
		"at_work": [{"user": u, "shift": "9–15", "checked_in": "9:02"} for u in at_work],
	}


class TestRingOnShift(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.enterContext(patch.object(frappe.db, "commit"))
		for email in (SELLER, LISTED, OWNER):
			user(email)
		self.sid = "CAturno" + frappe.generate_hash(length=8)
		frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"id": self.sid,
				"name": self.sid,
				"type": "Incoming",
				"status": "Ringing",
				"from": CUSTOMER,
				"to": SHOP,
				"telephony_medium": "Twilio",
				"start_time": datetime(2026, 11, 27, 11, 0),
			}
		).insert(ignore_permissions=True)
		self.owners = {
			LISTED: {"name": LISTED, "call_receiving_device": "Computer"},
			OWNER: {
				"name": OWNER,
				"call_receiving_device": "Phone",
				"agent_mobile": "+526695550000",
				"ring_always": 1,
			},
		}

	def process(self, rules, at_work=(), kept=True, signed_in=(SELLER, LISTED, OWNER)):
		with (
			patch.object(twilio_handler.Twilio, "connect", return_value=fake_twilio()),
			patch.object(twilio_handler, "inbox_settings", return_value=frappe._dict(rules)),
			patch.object(twilio_handler, "is_closed", return_value=False),
			patch.object(twilio_handler, "get_twilio_number_owners", return_value=self.owners),
			patch.object(twilio_handler, "get_active_loggedin_users", return_value=list(signed_in)),
			patch.object(call_rule, "staff", return_value=staff(at_work, kept)),
			patch.object(calls_answer, "site_language", return_value="es-MX"),
		):
			xml = twilio_handler.IncomingCall(CUSTOMER, SHOP, call_sid=self.sid).process().to_xml()
		log = json.loads(frappe.db.get_value("CRM Call Log", self.sid, "ring_log") or "null")
		return xml, log

	def test_rings_the_seller_at_work_who_never_chose_a_device_and_the_always_person(self):
		xml, log = self.process(dict(RULES, call_ring_rule="shift"), at_work=(SELLER,))
		self.assertIn(twilio_handler.Twilio.safe_identity(SELLER), xml)
		self.assertIn("+526695550000", xml)
		self.assertNotIn(twilio_handler.Twilio.safe_identity(LISTED), xml)
		self.assertEqual(log["mode"], "shift")
		self.assertEqual(log["on_shift"], [SELLER])
		self.assertEqual(log["rang"], [SELLER, OWNER])

	def test_a_seller_without_muelle_open_is_noted_as_not_reached(self):
		_xml, log = self.process(dict(RULES, call_ring_rule="shift"), at_work=(SELLER,), signed_in=(LISTED,))
		self.assertEqual(log["rang"], [OWNER])
		self.assertEqual(log["unreached"], [SELLER])

	def test_nobody_at_work_rings_the_list(self):
		xml, log = self.process(dict(RULES, call_ring_rule="shift"), at_work=())
		self.assertIn(twilio_handler.Twilio.safe_identity(LISTED), xml)
		self.assertEqual((log["mode"], log["because"]), ("fallback", "nobody"))

	def test_message_fallback_rings_only_the_always_person(self):
		xml, log = self.process(dict(RULES, call_ring_rule="shift", call_ring_fallback="message"), at_work=())
		self.assertNotIn(twilio_handler.Twilio.safe_identity(LISTED), xml)
		self.assertEqual(log["rang"], [OWNER])

	def test_an_area_off_the_line_falls_back(self):
		_xml, log = self.process(
			dict(RULES, call_ring_rule="shift", call_ring_skip_areas='["Ventas"]'), at_work=(SELLER,)
		)
		self.assertEqual(log["because"], "nobody")

	def test_no_shifts_kept_rings_the_list(self):
		_xml, log = self.process(dict(RULES, call_ring_rule=""), at_work=(SELLER,), kept=False)
		self.assertEqual(log["mode"], "list")
		self.assertEqual(log["rang"], [LISTED, OWNER])

	def test_empty_rule_on_a_shop_with_shifts_rings_the_shift(self):
		_xml, log = self.process(dict(RULES, call_ring_rule=""), at_work=(SELLER,))
		self.assertEqual(log["mode"], "shift")

	def test_the_list_rule_ignores_shifts(self):
		_xml, log = self.process(dict(RULES, call_ring_rule="list"), at_work=(SELLER,))
		self.assertEqual(log["rang"], [LISTED, OWNER])

	def test_the_board_names_who_was_on_shift_and_rang(self):
		self.process(dict(RULES, call_ring_rule="shift"), at_work=(SELLER,))
		twilio_handler.mark_unanswered(self.sid, "no-answer")
		with patch.object(calls_board, "site_hours", return_value=calls_board.Hours()):
			out = calls_board.board(7, datetime(2026, 11, 27, 12, 0))
		ring = out["items"][self.sid]["ring"]
		self.assertEqual(ring["on_shift"], ["Turno"])
		self.assertEqual(len(ring["rang"]), 2)


class TestIncomingOnlyToken(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.addCleanup(frappe.set_user, frappe.session.user)
		user(SELLER)

	def test_a_seller_off_the_number_gets_an_incoming_token_and_receives_calls(self):
		twilio = MagicMock()
		twilio.generate_voice_access_token.return_value = b"token"
		with (
			patch.object(twilio_handler.Twilio, "connect", return_value=twilio),
			patch.object(call_rule, "may_ring", return_value=True),
		):
			frappe.set_user(SELLER)
			out = api.generate_access_token()
			self.assertTrue(integrations_api.receives_calls(SELLER))
		self.assertEqual(out, {"token": "token", "incoming_only": True})
		twilio.generate_voice_access_token.assert_called_once_with(identity=SELLER, incoming_only=True)

	def test_someone_the_line_never_rings_gets_no_token(self):
		twilio = MagicMock()
		with (
			patch.object(twilio_handler.Twilio, "connect", return_value=twilio),
			patch.object(call_rule, "may_ring", return_value=False),
		):
			frappe.set_user(SELLER)
			out = api.generate_access_token()
			self.assertFalse(integrations_api.receives_calls(SELLER))
		self.assertEqual(out["error"], "caller_phone_identity_missing")

	def test_may_ring_needs_the_shift_rule_a_sales_role_and_an_area_on_the_line(self):
		settings = frappe._dict(call_ring_rule="shift", call_ring_skip_areas="")
		with (
			patch("crm.inbox.settings", return_value=settings),
			patch.object(call_rule, "staff", return_value=staff()),
		):
			self.assertTrue(call_rule.may_ring(SELLER))
			self.assertFalse(call_rule.may_ring("Guest"))
			settings.call_ring_skip_areas = '["Ventas"]'
			self.assertFalse(call_rule.may_ring(SELLER))
			settings.call_ring_skip_areas = ""
			settings.call_ring_rule = "list"
			self.assertFalse(call_rule.may_ring(SELLER))


class TestRingNow(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		for email in (SELLER, LISTED):
			user(email)

	def test_the_settings_page_hears_who_rings_now_and_why(self):
		owners = {LISTED: {"name": LISTED, "call_receiving_device": "Computer"}}
		with (
			patch.object(frappe, "get_roles", return_value=["Sales Manager"]),
			patch.object(call_team, "shop_numbers", return_value=[SHOP]),
			patch.object(twilio_handler, "inbox_settings", return_value=frappe._dict(RULES)),
			patch.object(twilio_handler, "is_closed", return_value=False),
			patch.object(twilio_handler, "get_twilio_number_owners", return_value=owners),
			patch.object(twilio_handler, "get_active_loggedin_users", return_value=[SELLER]),
			patch.object(call_rule, "staff", return_value=staff(at_work=(SELLER,))),
		):
			now = call_team.ring_now("shift", "list", "")
			unsaved = call_team.ring_now("list", "list", "")
		self.assertEqual(now["mode"], "shift")
		self.assertEqual(
			[(p["user"], p["kind"], p["shift"], p["reach"]) for p in now["people"]],
			[(SELLER, "shift", "9–15", "muelle")],
		)
		self.assertEqual([(p["user"], p["reach"]) for p in unsaved["people"]], [(LISTED, "muelle_off")])

	def test_only_managers_ask(self):
		with patch.object(frappe, "get_roles", return_value=["Sales User"]):
			with self.assertRaises(frappe.PermissionError):
				call_team.ring_now()


class TestRuleSettings(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)

	def test_message_fallback_needs_messages_on(self):
		doc = frappe.get_single("CRM Inbox Settings")
		doc.call_ring_rule = "shift"
		doc.call_ring_fallback = "message"
		doc.call_voicemail = 0
		with self.assertRaises(frappe.ValidationError):
			doc._validate_ring_rule()
		doc.call_voicemail = 1
		doc._validate_ring_rule()

	def test_areas_are_kept_as_a_sorted_list(self):
		doc = frappe.get_single("CRM Inbox Settings")
		doc.call_ring_skip_areas = '["Taller", "Caja", 3]'
		doc.call_ring_fallback = "list"
		doc._validate_ring_rule()
		self.assertEqual(json.loads(doc.call_ring_skip_areas), ["Caja", "Taller"])


if __name__ == "__main__":
	unittest.main()
