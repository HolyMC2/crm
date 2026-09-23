"""Twilio status callback: a refused live-status push must not fail the webhook.

Prod 2026-09-14: every `update_call_status_info` answered HTTP 500, so Twilio
retried a callback whose real work — the CRM Call Log update — had already
committed. Twilio refuses the user-defined message when the parent call has
already ended (21220) and when the parent leg is PSTN, which has no Client SDK
listener to receive it. Both are ordinary outcomes, not shop problems.
"""

import unittest
from unittest.mock import MagicMock, patch

import frappe
from twilio.base.exceptions import TwilioRestException

from crm.integrations.twilio import api


def _Refused(msg, code=None):
	return TwilioRestException(400, "https://api.twilio.com/fictional", msg=msg, code=code)


def _callback_args():
	return {
		"AccountSid": "ACfictional",
		"ParentCallSid": "CAfictionalparent",
		"CallSid": "CAfictionalchild",
		"CallStatus": "completed",
		"CallDuration": "42",
		"From": "+520000000000",
		"To": "client:fictional",
	}


class TestTwilioStatusCallback(unittest.TestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.enterContext(patch.object(api, "validate_twilio_request", return_value=MagicMock()))
		self.enterContext(
			patch.object(api, "update_call_log", return_value=frappe._dict(name="CRM-CALL-FICTIONAL"))
		)
		self.logged = self.enterContext(patch.object(api.frappe, "log_error"))

	def _run_callback(self, refusal):
		client = MagicMock()
		client.calls.return_value.user_defined_messages.create.side_effect = refusal
		with patch.object(api.Twilio, "get_twilio_client", return_value=client):
			api.update_call_status_info(**_callback_args())

	def test_call_already_ended_is_not_an_error(self):
		self._run_callback(_Refused("Unable to create record: Call is not in the expected state", code=21220))
		self.logged.assert_not_called()

	def test_pstn_leg_with_no_client_listener_is_not_an_error(self):
		self._run_callback(
			_Refused("Unable to create record: Client message not supported for PSTN calls", code=400)
		)
		self.logged.assert_not_called()

	def test_an_unexpected_failure_is_recorded_but_the_callback_still_succeeds(self):
		self._run_callback(RuntimeError("fictional transport failure"))
		self.logged.assert_called_once()

	def test_a_successful_push_records_nothing(self):
		self._run_callback(None)
		self.logged.assert_not_called()

	def test_a_missing_call_log_still_fails_the_callback(self):
		with patch.object(api, "update_call_log", return_value=None):
			with self.assertRaises(frappe.DoesNotExistError):
				api.update_call_status_info(**_callback_args())

	def test_logging_failure_cannot_fail_the_callback(self):
		self.logged.side_effect = RuntimeError("Error Log unavailable")
		with patch.object(api.logging, "getLogger") as logger:
			self._run_callback(RuntimeError("transport failure"))
			logger.return_value.error.assert_called_once()

	def test_both_logging_outputs_can_fail(self):
		self.logged.side_effect = RuntimeError("Error Log unavailable")
		with patch.object(api.logging, "getLogger", side_effect=RuntimeError("logger unavailable")):
			self._run_callback(RuntimeError("transport failure"))

	def test_unrelated_exception_with_matching_text_is_reported(self):
		self._run_callback(RuntimeError("client message not supported"))
		self.logged.assert_called_once()

	def test_error_report_links_call_without_raw_sdk_details(self):
		self._run_callback(RuntimeError("access_token=fictional-secret +520000000000"))
		kwargs = self.logged.call_args.kwargs
		self.assertEqual(kwargs["reference_name"], "CAfictionalparent")
		self.assertNotIn("fictional-secret", kwargs["message"])
		self.assertNotIn("+520000000000", kwargs["message"])

	def test_unexpected_twilio_error_keeps_diagnostic_codes(self):
		self._run_callback(
			TwilioRestException(401, "https://api.twilio.com/fictional", code=20003, msg="secret")
		)
		message = self.logged.call_args.kwargs["message"]
		self.assertIn("Twilio code=20003", message)
		self.assertIn("HTTP status=401", message)
		self.assertNotIn("secret", message)
