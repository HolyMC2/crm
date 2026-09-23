"""Unsigned or changed Twilio requests cannot authorize call creation or dialing."""

import unittest

from twilio.request_validator import RequestValidator
from werkzeug.datastructures import MultiDict
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from crm.integrations.twilio.verification import request_is_authentic

TOKEN = "fictional-ci-auth-token"
CALLBACK = "https://crm.example.invalid/api/method/crm.integrations.twilio.api.sip_voice"
PARAMETERS = {"AccountSid": "ACfictional", "From": "sip:operator@example.invalid", "To": "+520000000000"}


class TestTwilioVerification(unittest.TestCase):
	def request(self, *, parameters=None, query="", signature=None, method="POST", content_type=None):
		parameters = PARAMETERS if parameters is None else parameters
		url = CALLBACK + ("?" + query if query else "")
		if signature is None:
			signature = RequestValidator(TOKEN).compute_signature(url, parameters if method == "POST" else {})
		return Request(
			EnvironBuilder(
				path="/api/method/crm.integrations.twilio.api.sip_voice" + ("?" + query if query else ""),
				# Internal reverse-proxy URL is deliberately different from the configured callback URL.
				base_url="http://backend:8000",
				method=method,
				data=parameters if method == "POST" else None,
				content_type=content_type,
				headers={"X-Twilio-Signature": signature},
			).get_environ()
		)

	def test_signed_post_uses_configured_public_callback_behind_proxy(self):
		self.assertTrue(request_is_authentic(self.request(), TOKEN, CALLBACK))

	def test_missing_or_wrong_signature_is_denied_even_with_matching_account_sid(self):
		for signature in ("", "forged"):
			with self.subTest(signature=signature):
				self.assertFalse(request_is_authentic(self.request(signature=signature), TOKEN, CALLBACK))

	def test_changed_destination_is_denied(self):
		signature = RequestValidator(TOKEN).compute_signature(CALLBACK, PARAMETERS)
		request = self.request(parameters={**PARAMETERS, "To": "+529999999999"}, signature=signature)
		self.assertFalse(request_is_authentic(request, TOKEN, CALLBACK))

	def test_signature_for_another_callback_is_denied(self):
		self.assertFalse(request_is_authentic(self.request(), TOKEN, CALLBACK + "/other"))

	def test_missing_configured_secret_or_request_is_denied(self):
		self.assertFalse(request_is_authentic(self.request(), None, CALLBACK))
		self.assertFalse(request_is_authentic(None, TOKEN, CALLBACK))

	def test_query_encoding_is_preserved(self):
		request = self.request(query="route=a%2Fb&space=a%20b")
		self.assertTrue(request_is_authentic(request, TOKEN, CALLBACK))

	def test_signed_get_remains_compatible(self):
		self.assertTrue(
			request_is_authentic(self.request(method="GET", query="AccountSid=ACfictional"), TOKEN, CALLBACK)
		)

	def test_signed_get_cannot_override_signed_arguments_with_unsigned_form_body(self):
		url = CALLBACK + "?AccountSid=ACfictional&To=%2B520000000000"
		signature = RequestValidator(TOKEN).compute_signature(url, {})
		request = Request(
			EnvironBuilder(
				path=url,
				method="GET",
				data={"To": "+529999999999"},
				headers={"X-Twilio-Signature": signature},
			).get_environ()
		)
		# Frappe reads the form before the endpoint; consuming it must not hide the body.
		request.environ.pop("CONTENT_LENGTH", None)
		request.environ["wsgi.input_terminated"] = True
		self.assertEqual(request.form["To"], "+529999999999")
		self.assertIsNone(request.content_length)
		self.assertEqual(request.get_data(), b"")
		self.assertFalse(request_is_authentic(request, TOKEN, CALLBACK))

	def test_signed_get_cannot_override_signed_arguments_with_unsigned_json_body(self):
		url = CALLBACK + "?AccountSid=ACfictional"
		signature = RequestValidator(TOKEN).compute_signature(url, {})
		request = Request(
			EnvironBuilder(
				path=url,
				method="GET",
				data='{"To":"+529999999999"}',
				content_type="application/json",
				headers={"X-Twilio-Signature": signature},
			).get_environ()
		)
		request.environ.pop("CONTENT_LENGTH", None)
		request.environ["wsgi.input_terminated"] = True
		self.assertEqual(request.get_json()["To"], "+529999999999")
		self.assertIsNone(request.content_length)
		self.assertFalse(request_is_authentic(request, TOKEN, CALLBACK))

	def test_duplicate_form_values_remain_part_of_the_signature(self):
		parameters = MultiDict([*PARAMETERS.items(), ("Custom", "one"), ("Custom", "two")])
		self.assertTrue(request_is_authentic(self.request(parameters=parameters), TOKEN, CALLBACK))

	def test_unsigned_json_body_is_not_accepted_as_empty_form(self):
		request = self.request(
			parameters='{"AccountSid":"ACfictional"}', signature="unused", content_type="application/json"
		)
		self.assertFalse(request_is_authentic(request, TOKEN, CALLBACK))
