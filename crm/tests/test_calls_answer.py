"""The shop's line when nobody can answer, and ringing the whole team (site).

Outside office hours the caller hears the owner's message (and may leave one) without
ringing a closed shop; in hours every person on the number rings at once, whoever
answers becomes the call's receiver, and a call nobody took stays missed even when the
caller's leg ends «completed» after leaving a message.
"""

import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

import frappe

from crm import call_rule, calls_answer
from crm.integrations.twilio import api, twilio_handler

SHOP = "+526690000001"
CUSTOMER = "+526691112233"
RULES = {
	"call_after_hours": 1,
	"call_after_hours_message": "Estamos cerrados.",
	"call_voicemail": 1,
	"call_voicemail_prompt": "Deja tu recado.",
	"call_ring_seconds": 25,
}


def fake_twilio(sip_domain=""):
	twilio = MagicMock()
	twilio.settings = frappe._dict(
		enable_sip_phone=1 if sip_domain else 0, sip_domain=sip_domain, record_calls=0
	)
	twilio.safe_identity = twilio_handler.Twilio.safe_identity
	twilio.get_recording_status_callback_url.return_value = "https://shop.example/rec"
	twilio.get_message_done_url.return_value = "https://shop.example/done"
	twilio.get_dial_outcome_url.return_value = "https://shop.example/outcome"
	twilio.get_update_call_status_callback_url.return_value = "https://shop.example/status"
	twilio.get_recording_status_callback_url.return_value = "https://shop.example/rec"
	twilio.generate_twilio_parallel_response = (
		lambda *a, **k: twilio_handler.Twilio.generate_twilio_parallel_response(twilio, *a, **k)
	)
	return twilio


class TestAnswerRules(unittest.TestCase):
	def test_policy_needs_a_message_and_clamps_the_ring(self):
		self.assertTrue(calls_answer.policy(frappe._dict(RULES))["after_hours"])
		self.assertFalse(
			calls_answer.policy(frappe._dict(RULES, call_after_hours_message=" "))["after_hours"]
		)
		self.assertEqual(calls_answer.policy(frappe._dict(call_ring_seconds=2))["ring_seconds"], 5)
		self.assertEqual(calls_answer.policy(frappe._dict(call_ring_seconds=300))["ring_seconds"], 60)
		self.assertEqual(calls_answer.policy(frappe._dict())["ring_seconds"], 25)

	def test_speech_language_from_language_and_country(self):
		self.assertEqual(calls_answer.speech_language("es", "mx"), "es-MX")
		self.assertEqual(calls_answer.speech_language("es-MX", "us"), "es-MX")
		self.assertEqual(calls_answer.speech_language("pt_BR", ""), "pt-BR")
		self.assertEqual(calls_answer.speech_language("", "mx"), "")

	def test_closed_says_the_message_then_takes_a_message(self):
		xml = calls_answer.unanswered(
			calls_answer.policy(frappe._dict(RULES)),
			closed=True,
			language="es-MX",
			recording_callback="https://shop.example/rec",
			done_url="https://shop.example/done",
		).to_xml()
		say = xml[xml.index("<Say") : xml.index("</Say>")]
		self.assertIn('language="es-MX"', say)
		self.assertIn('voice="Polly.Mia-Neural"', say)
		self.assertTrue(say.endswith(">Estamos cerrados."))
		self.assertIn("Deja tu recado.</Say><Record", xml)
		self.assertIn('action="https://shop.example/done"', xml)
		self.assertIn('recordingStatusCallback="https://shop.example/rec"', xml)
		self.assertTrue(xml.endswith("<Hangup /></Response>"))

	def test_no_messages_allowed_just_ends(self):
		xml = calls_answer.unanswered(
			calls_answer.policy(frappe._dict(RULES, call_voicemail=0)),
			closed=False,
			language="",
			recording_callback="r",
			done_url="d",
		).to_xml()
		self.assertNotIn("<Say", xml)
		self.assertNotIn("<Record", xml)


class TestRingTheTeam(unittest.TestCase):
	def test_every_person_on_the_number_rings_at_once(self):
		owners = {
			"tere@example.com": {"call_receiving_device": "Computer"},
			"jenni@example.com": {"call_receiving_device": "Phone", "agent_mobile": "+526695550000"},
			"marco@example.com": {"call_receiving_device": "SIP Phone", "sip_username": "marco"},
			"nadie@example.com": {"call_receiving_device": "Computer"},
		}
		signed_in = ["tere@example.com", "marco@example.com"]
		with patch.object(twilio_handler, "get_active_loggedin_users", return_value=signed_in):
			targets = twilio_handler.ring_targets(fake_twilio("shop.sip.twilio.com"), owners)
		self.assertEqual(
			targets,
			[
				("client", twilio_handler.Twilio.safe_identity("tere@example.com")),
				("number", "+526695550000"),
				("sip", "sip:marco@shop.sip.twilio.com"),
				("client", twilio_handler.Twilio.safe_identity("marco@example.com")),
			],
		)

	def _process(self, *, closed, owners, rules=RULES):
		twilio = fake_twilio()
		with (
			patch.object(twilio_handler.Twilio, "connect", return_value=twilio),
			patch.object(twilio_handler, "inbox_settings", return_value=frappe._dict(rules)),
			patch.object(twilio_handler, "is_closed", return_value=closed),
			patch.object(twilio_handler, "get_twilio_number_owners", return_value=owners),
			patch.object(twilio_handler, "get_active_loggedin_users", return_value=list(owners)),
			patch.object(twilio_handler, "mark_unanswered") as mark,
			patch.object(call_rule, "staff", return_value=None),
			patch.object(calls_answer, "site_language", return_value="es-MX"),
		):
			xml = twilio_handler.IncomingCall(CUSTOMER, SHOP, call_sid="CAfictional").process().to_xml()
		return xml, mark

	def test_closed_rings_nobody(self):
		xml, mark = self._process(
			closed=True, owners={"tere@example.com": {"call_receiving_device": "Computer"}}
		)
		self.assertIn("Estamos cerrados.", xml)
		self.assertNotIn("<Dial", xml)
		mark.assert_called_once_with("CAfictional", "closed", after_hours=True)

	def test_closed_without_the_switch_still_rings(self):
		xml, mark = self._process(
			closed=True,
			owners={"tere@example.com": {"call_receiving_device": "Computer"}},
			rules=dict(RULES, call_after_hours=0),
		)
		self.assertIn("<Dial", xml)
		mark.assert_not_called()

	def test_open_rings_with_the_ring_time_and_asks_what_next(self):
		xml, _mark = self._process(
			closed=False,
			owners={
				"tere@example.com": {"call_receiving_device": "Computer"},
				"jenni@example.com": {"call_receiving_device": "Computer"},
			},
		)
		self.assertIn('action="https://shop.example/outcome"', xml)
		self.assertIn('timeout="25"', xml)
		self.assertEqual(xml.count("<Client"), 2)

	def test_nobody_to_ring_goes_straight_to_the_message(self):
		xml, mark = self._process(closed=False, owners={})
		self.assertIn("Deja tu recado.", xml)
		mark.assert_called_once_with("CAfictional", "no-answer")


class TestCallLogOutcome(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.sid = "CAfictionaltest" + frappe.generate_hash(length=8)
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
				"start_time": datetime(2026, 11, 26, 21, 0),
			}
		).insert(ignore_permissions=True)
		self.enterContext(patch.object(frappe.db, "commit"))

	def test_nobody_answered_stays_missed_after_a_message(self):
		twilio_handler.mark_unanswered(self.sid, "no-answer")
		details = MagicMock(status="completed", duration=48, start_time=None, end_time=None)
		api._save_call_details(self.sid, details)
		log = frappe.get_doc("CRM Call Log", self.sid)
		self.assertEqual((log.status, log.dial_outcome), ("No Answer", "no-answer"))

	def test_closed_marks_after_hours(self):
		twilio_handler.mark_unanswered(self.sid, "closed", after_hours=True)
		self.assertEqual(
			frappe.db.get_value("CRM Call Log", self.sid, ["status", "after_hours"]), ("No Answer", 1)
		)

	def test_whoever_answers_becomes_the_receiver_and_the_other_legs_are_ignored(self):
		user = frappe.db.get_value(
			"User", {"enabled": 1, "user_type": "System User", "name": ["!=", "Administrator"]}
		)
		log = frappe.get_doc("CRM Call Log", self.sid)
		api._note_answer(
			log, frappe._dict(CallSid="CAleg1", To="client:" + twilio_handler.Twilio.safe_identity(user))
		)
		self.assertEqual(
			frappe.db.get_value("CRM Call Log", self.sid, ["answered_leg", "receiver"]), ("CAleg1", user)
		)
		self.assertTrue(api._losing_leg(self.sid, frappe._dict(CallSid="CAleg2", CallStatus="canceled")))
		self.assertFalse(api._losing_leg(self.sid, frappe._dict(CallSid="CAleg1", CallStatus="completed")))

	def test_dial_outcome_answered_hangs_up_and_no_answer_takes_a_message(self):
		with (
			patch.object(api, "validate_twilio_request", return_value=fake_twilio()),
			patch.object(twilio_handler, "inbox_settings", return_value=frappe._dict(RULES)),
			patch.object(calls_answer, "site_language", return_value="es-MX"),
		):
			done = api.twilio_dial_outcome(CallSid=self.sid, DialCallStatus="completed")
			self.assertNotIn(b"<Record", done.get_data())
			missed = api.twilio_dial_outcome(CallSid=self.sid, DialCallStatus="no-answer")
		self.assertIn(b"<Record", missed.get_data())
		self.assertNotIn(b"Estamos cerrados", missed.get_data())
		self.assertEqual(frappe.db.get_value("CRM Call Log", self.sid, "status"), "No Answer")


if __name__ == "__main__":
	unittest.main()
