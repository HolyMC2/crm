"""Native pipeline contract: normal controllers, lists, permission hooks and migration."""

import copy
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate

from crm.pipeline.api import get_pipelines, save_pipeline
from crm.pipeline.services.configuration import LEGACY_PIPELINE
from crm.pipeline.services.migration import execute, preview


class TestPipelineConfiguration(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", "currency", "USD")
		self.open = self.make_status("Open", 10)
		self.next = self.make_status("Ongoing", 40)
		self.other = self.make_status("Open", 20)
		self.a = self.make_pipeline([self.open, self.next])
		self.b = self.make_pipeline([self.other])

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		super().tearDown()

	def make_status(self, outcome, probability):
		return (
			frappe.get_doc(
				{
					"doctype": "CRM Deal Status",
					"deal_status": "Pipeline test " + frappe.generate_hash(length=10),
					"type": outcome,
					"probability": probability,
				}
			)
			.insert()
			.name
		)

	def make_pipeline(self, stages, **values):
		return frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": "Pipeline test " + frappe.generate_hash(length=8),
				"probability_policy": "Stage",
				"stages": [{"status": status, "probability": 30 + i * 10} for i, status in enumerate(stages)],
				**values,
			}
		).insert()

	def deal(self, pipeline=None, **values):
		return frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"pipeline": pipeline or self.a.name,
				"deal_name": "Pipeline fixture",
				"currency": "USD",
				"deal_owner": "Administrator",
				"expected_deal_value": 100,
				"expected_closure_date": add_days(nowdate(), 7),
				**values,
			}
		).insert()

	def user(self):
		email = "pipeline-" + frappe.generate_hash(length=8) + "@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Pipeline seller",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert(ignore_permissions=True)
		return email

	def test_two_pipelines_default_stages_and_invalid_cross_write(self):
		deal = self.deal()
		self.assertEqual(deal.status, self.open)
		self.assertEqual(deal.probability, 30)
		other = self.deal(self.b.name)
		self.assertEqual(other.status, self.other)
		deal.status = self.other
		with self.assertRaises(frappe.ValidationError):
			deal.save()

	def test_requirements_and_previous_stage_apply_to_native_writes(self):
		self.a.stages[1].required_fields = "next_step"
		self.a.stages[1].allowed_from = self.open
		self.a.save()
		deal = self.deal()
		deal.status = self.next
		with self.assertRaises(frappe.MandatoryError):
			deal.save()
		deal.reload()
		deal.status = self.next
		deal.next_step = "Confirm proposal"
		deal.save()
		self.assertEqual(deal.probability, 40)
		with self.assertRaises(frappe.ValidationError):
			self.deal(status=self.next, next_step="Cannot skip opening")

	def test_archived_stage_is_editable_but_no_new_entry(self):
		deal = self.deal(status=self.next)
		deal.reload()
		history = [
			(row.name, row.get("from"), row.to, row.from_date, row.to_date) for row in deal.status_change_log
		]
		self.a.stages[1].archived = 1
		self.a.save()
		deal.reload()
		deal.next_step = "Follow up historic work"
		deal.save()
		self.assertEqual(
			[
				(row.name, row.get("from"), row.to, row.from_date, row.to_date)
				for row in deal.status_change_log
			],
			history,
		)
		with self.assertRaises(frappe.ValidationError):
			self.deal(status=self.next)
		self.a.stages.pop()
		with self.assertRaises(frappe.ValidationError):
			self.a.save()

	def test_later_global_hide_preserves_history_but_prevents_new_entry(self):
		deal = self.deal(status=self.next)
		frappe.db.set_value("CRM Deal Status", self.next, "hidden", 1)
		visible = next(row for row in get_pipelines() if row.name == self.a.name)
		self.assertTrue(next(row for row in visible.stages if row["name"] == self.next)["archived"])
		deal.next_step = "Retain existing hidden stage"
		deal.save()
		with self.assertRaises(frappe.ValidationError):
			self.deal(status=self.next)

	def test_pipeline_archive_keeps_existing_record(self):
		deal = self.deal()
		self.a.archived = 1
		self.a.save()
		deal.reload()
		deal.next_step = "Still editable"
		deal.save()
		with self.assertRaises(frappe.ValidationError):
			self.deal()

	def test_manual_zero_and_stage_probability(self):
		self.a.probability_policy = "Manual"
		self.a.save()
		deal = self.deal(probability=0)
		self.assertEqual(deal.probability, 0)
		deal.status = self.next
		deal.save()
		self.assertEqual(deal.probability, 0)

	def test_role_denied_on_discovery_list_document_and_write(self):
		user = self.user()
		self.a.append("roles", {"role": "System Manager"})
		self.a.save()
		deal = self.deal(deal_owner=user)
		frappe.set_user(user)
		self.assertNotIn(self.a.name, [row.name for row in get_pipelines()])
		self.assertNotIn(deal.name, frappe.get_list("CRM Deal", pluck="name"))
		self.assertFalse(frappe.has_permission("CRM Deal", "read", doc=deal))
		with self.assertRaises(frappe.PermissionError):
			self.deal()
		with self.assertRaises(frappe.PermissionError):
			deal.pipeline = self.b.name
			deal.status = self.other
			deal.save(ignore_permissions=True)

	def test_transition_role_is_server_enforced(self):
		user = self.user()
		self.a.stages[1].transition_roles = "Sales Manager"
		self.a.save()
		deal = self.deal(deal_owner=user)
		frappe.set_user(user)
		deal.status = self.next
		with self.assertRaises(frappe.PermissionError):
			deal.save()

	def test_everyone_share_cannot_bypass_pipeline_or_document_permissions(self):
		user = self.user()
		deal = self.deal()
		frappe.share.add("CRM Deal", deal.name, everyone=1, read=1)
		frappe.set_user(user)
		self.assertIn(deal.name, frappe.share.get_shared("CRM Deal"))
		self.assertTrue(frappe.has_permission("CRM Deal", "read", doc=deal))
		frappe.set_user("Administrator")
		self.a.append("roles", {"role": "System Manager"})
		self.a.save()
		frappe.set_user(user)
		self.assertNotIn(deal.name, frappe.share.get_shared("CRM Deal"))
		self.assertNotIn(deal.name, frappe.get_list("CRM Deal", pluck="name"))
		self.assertFalse(frappe.has_permission("CRM Deal", "read", doc=deal))

	def test_share_hooks_cannot_widen_and_fail_closed(self):
		user = self.user()
		shared = self.deal()
		unshared = self.deal(self.b.name)
		frappe.share.add("CRM Deal", shared.name, user=user, read=1)
		original_hooks = frappe.get_hooks
		original_attr = frappe.get_attr

		def hooks(key=None, *args, **kwargs):
			if key == "filter_shared_documents":
				return {"CRM Deal": ["test.shared_filter"]}
			return original_hooks(key, *args, **kwargs)

		def widening(**kwargs):
			return [*kwargs["names"], unshared.name]

		def failing(**kwargs):
			raise RuntimeError("permission filter failed")

		with patch("frappe.get_hooks", side_effect=hooks):
			with patch(
				"frappe.get_attr",
				side_effect=lambda name: widening if name == "test.shared_filter" else original_attr(name),
			):
				self.assertEqual(frappe.share.get_shared("CRM Deal", user), [shared.name])
			with patch(
				"frappe.get_attr",
				side_effect=lambda name: failing if name == "test.shared_filter" else original_attr(name),
			):
				with self.assertRaisesRegex(RuntimeError, "permission filter failed"):
					frappe.share.get_shared("CRM Deal", user)

	def test_unsupported_framework_fails_before_request_and_configuration(self):
		from crm.pipeline.services.configuration import check_request_compatibility

		with patch.object(frappe.share, "FILTER_SHARED_DOCUMENTS_VERSION", 0):
			with self.assertRaises(frappe.PermissionError):
				check_request_compatibility()
			with self.assertRaises(frappe.PermissionError):
				self.make_pipeline([self.open])

	def test_legacy_mapping_is_previewable_idempotent_and_preserves_history(self):
		deal = self.deal(probability=0)
		frappe.db.set_value("CRM Deal", deal.name, "pipeline", None, update_modified=False)
		deal.reload()
		before = copy.deepcopy(deal.as_dict())
		self.assertGreaterEqual(preview()["records_to_map"]["CRM Deal"], 1)
		execute()
		deal.reload()
		self.assertEqual(deal.pipeline, LEGACY_PIPELINE)
		for field in ("status", "modified", "probability", "currency", "status_change_log"):
			self.assertEqual(deal.as_dict()[field], before[field])
		self.assertEqual(execute()["before"]["records_to_map"], {"CRM Lead": 0, "CRM Deal": 0})

	def test_new_global_stage_is_added_only_to_compatibility_pipeline(self):
		status = self.make_status("Ongoing", 55)
		legacy = frappe.get_doc("CRM Pipeline", LEGACY_PIPELINE)
		self.assertIn(status, [row.status for row in legacy.stages])
		self.assertNotIn(status, [row.status for row in self.a.stages])

	def test_stale_settings_save_is_rejected(self):
		data = self.a.as_dict()
		data["modified"] = "2000-01-01 00:00:00"
		with self.assertRaises(frappe.TimestampMismatchError):
			save_pipeline(data)

	def test_only_one_default_per_scope(self):
		self.a.is_default = 1
		with self.assertRaises(frappe.ValidationError):
			self.a.save()

	def test_lead_target_pipeline_does_not_replace_lead_status(self):
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Pipeline prospect", "pipeline": self.b.name}
		).insert()
		self.assertEqual(lead.pipeline, self.b.name)
		self.assertEqual(lead.status, "New")
