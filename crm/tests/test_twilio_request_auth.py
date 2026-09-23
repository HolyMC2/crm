"""Twilio entrypoint invokes signature validation before dialing or writing a call log."""

import unittest
from unittest.mock import MagicMock, patch

import frappe
from twilio.request_validator import RequestValidator
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from crm.integrations.twilio import api


class TestTwilioRequestAuth(unittest.TestCase):
	def setUp(self):
		self.twilio = MagicMock(account_sid="ACfictional", application_sid="APfictional")
		self.twilio.settings.get_password.return_value = "fictional-ci-auth-token"
		self.enterContext(patch.object(api.Twilio, "connect", return_value=self.twilio))
		self.url = "https://crm.example.invalid/api/method/crm.integrations.twilio.api.sip_voice"
		self.enterContext(patch.object(api, "get_public_url", return_value=self.url))
		self.args = {
			"AccountSid": "ACfictional",
			"From": "sip:operator@example.invalid",
			"To": "+520000000000",
		}

	def request(self, signature=""):
		request = Request(
			EnvironBuilder(
				path="/api/method/crm.integrations.twilio.api.sip_voice",
				method="POST",
				data=self.args,
				headers={"X-Twilio-Signature": signature},
			).get_environ()
		)
		return patch.object(frappe.local, "request", request, create=True)

	def test_unsigned_matching_account_cannot_dial_or_create_call_log(self):
		with self.request(), patch.object(api, "create_call_log") as log:
			with self.assertRaises(frappe.PermissionError):
				api.sip_voice(**self.args)
		log.assert_not_called()
		self.twilio.generate_twilio_dial_response.assert_not_called()

	def test_authentic_request_passes_account_and_signature_validation(self):
		signature = RequestValidator("fictional-ci-auth-token").compute_signature(self.url, self.args)
		with self.request(signature):
			self.assertIs(api.validate_twilio_request(self.args), self.twilio)

	def test_authentic_wrong_application_remains_denied(self):
		self.args["ApplicationSid"] = "APother"
		signature = RequestValidator("fictional-ci-auth-token").compute_signature(self.url, self.args)
		with self.request(signature), self.assertRaises(frappe.PermissionError):
			api.validate_twilio_request(self.args, require_application_sid=True)
