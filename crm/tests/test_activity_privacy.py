"""Native Version history must not bypass current masking through the RPC envelope."""

import json
from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from crm.api import activities
from crm.tests.test_activity_batch_queries import remote_file
from crm.tests.test_activity_permlevel import changed_fields
from crm.tests.test_offers import OfferFixture


class TestActivityPrivacy(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		# Frappe rolls back at class cleanup, not between methods. In particular,
		# a mask Property Setter must not affect the next method's positive control.
		frappe.db.savepoint("activity_privacy_fixture")
		self.addCleanup(self.restore_fixture)
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.make_fixture()
		self.enterContext(patch.dict(frappe.response, {}, clear=True))

	def restore_fixture(self):
		frappe.set_user("Administrator")
		try:
			frappe.db.rollback(save_point="activity_privacy_fixture")
		finally:
			frappe.clear_cache(doctype="CRM Deal")
			frappe.clear_cache(doctype="CRM Lead")

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
		self.assertNotIn(str(stored_values[0]), frappe.as_json({**frappe.response, "message": result}))

	def test_converted_lead_history_keeps_its_own_mask_and_attachment_scope(self):
		lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "History",
				"status": "New Lead",
				"lead_owner": self.user,
			}
		).insert()
		secret = "NESTED-PRIVATE-" + self.key
		lead.job_title = secret
		lead.save(ignore_version=False)
		lead.reload()
		lead.job_title = "Visible ordinary change"
		lead.save(ignore_version=False)
		lead.reload()
		lead.status = "Qualified"
		lead.save(ignore_version=False)
		comment = lead.add_comment("Comment", "Fictional lead history")
		file = remote_file("Comment", comment.name)
		self.deal.reload()
		self.deal.lead = lead.name
		self.deal.save()
		make_property_setter("CRM Lead", "job_title", "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Lead")
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Lead", "read", lead.name))
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		with patch.object(activities, "get_linked_calls", wraps=activities.get_linked_calls) as calls:
			result = activities.get_activities(self.deal.name)
			self.assertEqual(calls.call_count, 2)
		self.assertNotIn("docinfo", frappe.response)
		self.assertNotIn(secret, frappe.as_json({**frappe.response, "message": result}))
		lead_history = [row for row in result[0] if row.get("is_lead")]
		self.assertIn("status", changed_fields(lead_history))
		self.assert_withheld_event(lead_history, "status")
		self.assertNotIn("job_title", changed_fields(lead_history))
		entry = next(row for row in lead_history if row.get("name") == comment.name)
		self.assertEqual([row["name"] for row in entry["attachments"]], [file.name])

	def assert_withheld_event(self, history, field):
		entry = next(
			entry
			for activity in history
			for entry in [activity, *(activity.get("other_versions") or [])]
			if isinstance(entry.get("data"), dict) and entry["data"].get("field") == field
		)
		self.assertEqual(entry["activity_type"], "changed")
		self.assertTrue(entry["data"]["field_label"])
		self.assertTrue(entry["creation"])
		self.assertTrue(entry["owner"])
		self.assertEqual(entry["data"]["old_value"], "")
		self.assertEqual(entry["data"]["value"], "")
		self.assertTrue(entry["data"]["values_withheld"])

	def test_deal_link_event_survives_projection_without_hiding_scalar_history(self):
		organization = frappe.get_doc(
			{
				"doctype": "CRM Organization",
				"organization_name": "History organization " + self.key,
				"currency": "USD",
			}
		).insert()
		self.deal.organization = organization.name
		self.deal.website = "https://example.invalid/history-" + self.key
		self.deal.save(ignore_version=False)
		stored = frappe.get_all(
			"Version",
			filters={"ref_doctype": "CRM Deal", "docname": self.deal.name},
			fields=["name", "data"],
			order_by="name",
		)
		self.assertTrue(
			any(
				change[0] == "organization" and change[2]
				for row in stored
				for change in json.loads(row.data).get("changed", [])
			)
		)
		frappe.set_user(self.user)
		history = activities.get_activities(self.deal.name, "CRM Deal")[0]
		self.assert_withheld_event(history, "organization")
		website = next(
			entry["data"]
			for activity in history
			for entry in [activity, *(activity.get("other_versions") or [])]
			if isinstance(entry.get("data"), dict) and entry["data"].get("field") == "website"
		)
		self.assertEqual(website["value"], self.deal.website)
		self.assertFalse(website.get("values_withheld"))
		frappe.set_user("Administrator")
		self.assertEqual(
			stored,
			frappe.get_all(
				"Version",
				filters={"ref_doctype": "CRM Deal", "docname": self.deal.name},
				fields=["name", "data"],
				order_by="name",
			),
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

	def test_empty_first_version_change_cannot_echo_unfiltered_data(self):
		lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Malformed history",
				"status": "New Lead",
				"lead_owner": self.user,
			}
		).insert()
		secret = "MALFORMED-HISTORY-" + self.key
		for document in (lead, self.deal):
			for empty in (None, []):
				frappe.get_doc(
					{
						"doctype": "Version",
						"ref_doctype": document.doctype,
						"docname": document.name,
						"data": json.dumps({"changed": [empty], "unfiltered": secret}),
					}
				).insert()
		frappe.set_user(self.user)
		for document in (lead, self.deal):
			with self.subTest(doctype=document.doctype):
				result = activities.get_activities(document.name, document.doctype)
				self.assertNotIn(secret, frappe.as_json({**frappe.response, "message": result}))
				self.assertNotIn("docinfo", frappe.response)

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
