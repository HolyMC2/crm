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


def _child_leg_args(**extra):
	return {**_callback_args(), "CallStatus": "in-progress", "Direction": "outbound-dial", **extra}


class TestChildLegStatusPush(unittest.TestCase):
	"""Prod 2026-11-12: every callback of a dialled leg (Direction outbound-dial,
	with a ParentCallSid) wrote «Failed to update Twilio call status» with Twilio
	code=400 and HTTP status=400 after its call log update had succeeded."""

	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.enterContext(patch.object(api, "validate_twilio_request", return_value=MagicMock()))
		self.enterContext(
			patch.object(api, "update_call_log", return_value=frappe._dict(name="CRM-CALL-FICTIONAL"))
		)
		self.logged = self.enterContext(patch.object(api.frappe, "log_error"))
		self.file_log = self.enterContext(patch.object(api.frappe, "logger")).return_value

	def _run(self, refusal, **args):
		client = MagicMock()
		client.calls.return_value.user_defined_messages.create.side_effect = refusal
		with patch.object(api.Twilio, "get_twilio_client", return_value=client):
			api.update_call_status_info(**_child_leg_args(**args))

	def test_bare_400_on_a_child_leg_goes_to_the_log_file_not_the_error_log(self):
		self._run(TwilioRestException(400, "https://api.twilio.com/fictional", msg="Bad request", code=400))
		self.logged.assert_not_called()
		self.file_log.info.assert_called_once()
		self.assertIn("CAfictionalparent", self.file_log.info.call_args.args)

	def test_bare_400_without_a_twilio_code_is_also_expected(self):
		self._run(TwilioRestException(400, "https://api.twilio.com/fictional", msg="Bad request"))
		self.logged.assert_not_called()

	def test_a_child_leg_refused_for_another_reason_is_still_recorded(self):
		self._run(TwilioRestException(401, "https://api.twilio.com/fictional", msg="secret", code=20003))
		self.logged.assert_called_once()
		self.file_log.info.assert_not_called()

	def test_a_coded_400_on_a_child_leg_is_still_recorded(self):
		self._run(TwilioRestException(400, "https://api.twilio.com/fictional", msg="Invalid", code=21201))
		self.logged.assert_called_once()

	def test_a_bare_400_outside_a_child_leg_is_still_recorded(self):
		self._run(
			TwilioRestException(400, "https://api.twilio.com/fictional", msg="Bad request", code=400),
			Direction="inbound",
		)
		self.logged.assert_called_once()

	def test_a_log_file_failure_cannot_fail_the_callback(self):
		self.file_log.info.side_effect = OSError("disk full")
		self._run(TwilioRestException(400, "https://api.twilio.com/fictional", msg="Bad request", code=400))
		self.logged.assert_not_called()

	def test_the_classifier_needs_the_callback_to_trust_a_bare_400(self):
		refusal = TwilioRestException(400, "https://api.twilio.com/fictional", msg="Bad request", code=400)
		self.assertFalse(api.is_expected_user_message_rejection(refusal))
		self.assertTrue(api.is_expected_user_message_rejection(refusal, frappe._dict(_child_leg_args())))


def _call_details():
	return frappe._dict(status="in-progress", duration="12", start_time=None, end_time=None)


class TestUpdateCallLogWriteConflict(unittest.TestCase):
	"""Prod 2026-11-12: «Error while updating call record», MariaDB 1020 «Record has
	changed since last read» when two callbacks of one call saved the same log."""

	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.twilio = MagicMock()
		self.twilio.get_call_info.return_value = _call_details()
		self.enterContext(patch.object(api.Twilio, "connect", return_value=self.twilio))
		self.enterContext(patch.object(api.frappe.db, "exists", return_value=True))
		self.rollback = self.enterContext(patch.object(api.frappe.db, "rollback"))
		self.enterContext(patch.object(api.frappe.db, "commit"))
		self.logged = self.enterContext(patch.object(api.frappe, "log_error"))

	def _saves(self, *outcomes):
		return self.enterContext(patch.object(api, "_save_call_details", side_effect=list(outcomes)))

	def test_a_1020_is_retried_once_after_a_rollback_and_not_logged(self):
		saved = frappe._dict(name="CAfictional")
		save = self._saves(frappe.QueryDeadlockError("1020 Record has changed since last read"), saved)
		self.assertIs(api.update_call_log("CAfictional", status="completed"), saved)
		self.assertEqual(save.call_count, 2)
		self.rollback.assert_called_once()
		self.logged.assert_not_called()

	def test_a_raw_driver_1020_is_also_retried(self):
		saved = frappe._dict(name="CAfictional")
		self._saves(Exception(1020, "Record has changed since last read"), saved)
		self.assertIs(api.update_call_log("CAfictional"), saved)
		self.logged.assert_not_called()

	def test_a_second_conflict_is_logged(self):
		save = self._saves(frappe.QueryDeadlockError("1020"), frappe.QueryDeadlockError("1020"))
		self.assertIsNone(api.update_call_log("CAfictional"))
		self.assertEqual(save.call_count, 2)
		self.logged.assert_called_once()

	def test_any_other_failure_is_logged_without_a_retry(self):
		save = self._saves(frappe.ValidationError("fictional"))
		self.assertIsNone(api.update_call_log("CAfictional"))
		self.assertEqual(save.call_count, 1)
		self.rollback.assert_not_called()
		self.logged.assert_called_once()

	def test_the_retry_saves_what_twilio_says_now_not_the_first_fetch(self):
		stale = _call_details()
		fresh = frappe._dict(status="completed", duration="57", start_time=None, end_time=None)
		self.twilio.get_call_info.side_effect = [stale, fresh]
		saved = frappe._dict(name="CAfictional")
		save = self._saves(frappe.QueryDeadlockError("1020"), saved)
		api.update_call_log("CAfictional", status="in-progress")
		first, retry = save.call_args_list
		self.assertIs(first.args[1], stale)
		self.assertFalse(first.kwargs.get("keep_final_status"))
		self.assertIs(retry.args[1], fresh)
		self.assertEqual(retry.args[2], "in-progress")
		self.assertTrue(retry.kwargs["keep_final_status"])


class TestSaveCallDetails(unittest.TestCase):
	"""What a save writes on the CRM Call Log, the first time and after a conflict."""

	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		self.log = MagicMock(status="Completed", duration="57")
		self.enterContext(patch.object(api.frappe, "get_doc", return_value=self.log))
		self.enterContext(patch.object(api.frappe.db, "commit"))

	def test_a_retry_never_moves_a_finished_call_back(self):
		api._save_call_details("CAfictional", _call_details(), "in-progress", keep_final_status=True)
		self.assertEqual(self.log.status, "Completed")
		self.assertEqual(self.log.duration, "12")
		self.log.save.assert_called_once_with(ignore_permissions=True)

	def test_a_retry_still_writes_a_final_status(self):
		self.log.status = "In Progress"
		api._save_call_details("CAfictional", _call_details(), "completed", keep_final_status=True)
		self.assertEqual(self.log.status, "Completed")

	def test_a_retry_moves_one_final_status_to_another(self):
		api._save_call_details("CAfictional", _call_details(), "no-answer", keep_final_status=True)
		self.assertEqual(self.log.status, "No Answer")

	def test_the_first_save_writes_the_callback_status_as_before(self):
		api._save_call_details("CAfictional", _call_details(), "in-progress")
		self.assertEqual(self.log.status, "In Progress")


class TestTwilioLogFile(unittest.TestCase):
	def test_info_lines_reach_the_log_file_outside_the_dev_server(self):
		import logging

		logger = logging.getLogger("crm.twilio-fictional-site")
		logger.setLevel(logging.ERROR)
		with patch.object(api.frappe, "logger", return_value=logger):
			self.assertTrue(api._twilio_log().isEnabledFor(logging.INFO))
