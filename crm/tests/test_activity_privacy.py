"""Native Version history must not bypass current masking through the RPC envelope."""

import json
from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from crm.api import activities
from crm.tests.test_activity_permlevel import changed_fields
from crm.tests.test_offers import OfferFixture


class TestActivityPrivacy(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.make_fixture()
		self.enterContext(patch.dict(frappe.response, {}, clear=True))

	def tearDown(self):
		frappe.set_user("Administrator")
		try:
			super().tearDown()
		finally:
			frappe.clear_cache(doctype="CRM Deal")

	def versioned_deal(self):
		self.deal.expected_deal_value = 812345.67
		self.deal.save(ignore_version=False)
		self.deal.reload()
		self.deal.probability = 61
		self.deal.save(ignore_version=False)

	def test_current_mask_hides_preexisting_version_values_and_raw_envelope(self):
		self.versioned_deal()
		# Prove native history actually contains the value before masking it.
		activities.get_docinfo("", "CRM Deal", self.deal.name)
		raw = frappe.response.pop("docinfo")
		stored_values = [
			change[2]
			for version in raw.versions
			for change in json.loads(version.data).get("changed", [])
			if change[0] == "expected_deal_value"
		]
		self.assertEqual(stored_values, [self.deal.get_formatted("expected_deal_value")])
		self.assertIn("expected_deal_value", changed_fields(activities.get_activities(self.deal.name)[0]))
		make_property_setter("CRM Deal", "expected_deal_value", "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Deal")
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		result = activities.get_activities(self.deal.name)
		self.assertNotIn("expected_deal_value", changed_fields(result[0]))
		self.assertIn("probability", changed_fields(result[0]))
		self.assertNotIn("docinfo", frappe.response)
		# Includes the extra keys Frappe serializes beside the endpoint's result.
		self.assertNotIn(
			frappe.as_json(stored_values[0]), frappe.as_json({**frappe.response, "message": result})
		)

	def test_native_docinfo_is_internal_and_preserves_existing_response_state(self):
		self.versioned_deal()
		frappe.set_user(self.user)
		for previous in (None, {"unrelated": "existing response"}):
			with self.subTest(previous=previous):
				frappe.response["docinfo"] = previous
				frappe.response["unrelated"] = "keep"
				result = activities.get_activities(self.deal.name)
				self.assertIn("expected_deal_value", changed_fields(result[0]))
				self.assertIs(frappe.response["docinfo"], previous)
				self.assertEqual(frappe.response["unrelated"], "keep")

	def test_native_failure_does_not_leave_partial_docinfo_in_response(self):
		self.versioned_deal()
		frappe.set_user(self.user)
		native_docinfo = activities.get_docinfo

		def fail_after_native_load(*args):
			native_docinfo(*args)
			raise RuntimeError("Timeline interrupted after loading history")

		for has_previous in (False, True):
			with self.subTest(has_previous=has_previous), patch.dict(frappe.response, {}, clear=True):
				previous = {"unrelated": "preserved"}
				if has_previous:
					frappe.response["docinfo"] = previous
				with (
					patch.object(activities, "get_docinfo", side_effect=fail_after_native_load),
					self.assertRaisesRegex(RuntimeError, "Timeline interrupted"),
				):
					activities.get_activities(self.deal.name)
				if has_previous:
					self.assertIs(frappe.response["docinfo"], previous)
				else:
					self.assertNotIn("docinfo", frappe.response)
