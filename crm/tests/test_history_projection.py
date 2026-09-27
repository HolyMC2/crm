"""Native Desk load/save and follow paths must apply the current recipient's policy."""

import copy
import json
from unittest.mock import patch

import frappe
from frappe.core.doctype.version import version as native_version
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.desk.form import document_follow, load, save
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager, now_datetime

from crm.permissions import activity_history as history
from crm.tests.test_offers import OfferFixture


class TestHistoryProjection(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.actor = frappe.session.user
		self.point = "history_" + frappe.generate_hash(length=8)
		frappe.db.savepoint(self.point)
		self.callbacks = {
			name: getattr(frappe.db, name)
			for name in ("before_commit", "after_commit", "before_rollback", "after_rollback")
		}
		self.had_realtime = hasattr(frappe.local, "_realtime_log")
		self.realtime = getattr(frappe.local, "_realtime_log", None)
		for name in self.callbacks:
			setattr(frappe.db, name, CallbackManager())
		if self.had_realtime:
			del frappe.local._realtime_log
		self.addCleanup(self.restore_fixture)
		for method in ("enqueue", "sendmail", "publish_realtime"):
			self.enterContext(patch("frappe." + method))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.enterContext(patch.dict(frappe.response, {"docs": []}, clear=True))
		self.make_fixture()
		self.lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "History fixture",
				"lead_owner": self.user,
				"status": "New Lead",
			}
		).insert()
		history.require_framework()

	def restore_fixture(self):
		frappe.set_user("Administrator")
		try:
			try:
				frappe.db.before_rollback.run()
			finally:
				frappe.db.rollback(save_point=self.point)
		finally:
			try:
				frappe.db.after_rollback.run()
				for doctype in ("CRM Lead", "CRM Deal", "CRM Contacts", "CRM Organization", "User"):
					frappe.clear_cache(doctype=doctype)
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime:
					frappe.local._realtime_log = self.realtime
				frappe.set_user(self.actor)

	def protect(self, doctype, field, prop="mask", value=1):
		frappe.set_user("Administrator")
		make_property_setter(doctype, field, prop, value, "Check" if prop == "mask" else "Int")
		frappe.clear_cache(doctype=doctype)

	def stored(self, doc):
		return frappe.get_all(
			"Version",
			filters={"ref_doctype": doc.doctype, "docname": doc.name},
			fields=["name", "data"],
			order_by="name",
		)

	def version(self, doc, data):
		return frappe.get_doc(
			{"doctype": "Version", "ref_doctype": doc.doctype, "docname": doc.name, "data": json.dumps(data)}
		).insert()

	def project(self, data, doc=None, user=None):
		doc = doc or self.deal
		return history.project(doc.doctype, doc.name, data, user or self.user)

	def test_supported_framework_and_registered_parent_hooks(self):
		self.assertEqual(native_version.VERSION_HISTORY_FILTER_VERSION, 1)
		for doctype in ("CRM Lead", "CRM Deal"):
			self.assertIn(
				"crm.permissions.activity_history.project",
				frappe.get_hooks("filter_version_history")[doctype],
			)
		with patch.object(native_version, "VERSION_HISTORY_FILTER_VERSION", 0):
			with self.assertRaises(frappe.PermissionError):
				history.require_framework()

	def test_native_desk_load_and_docinfo_filter_historical_values_without_rewriting(self):
		for doc, field, secret, current in (
			(self.lead, "job_title", "OLD-PRIVATE-" + self.key, "Current job"),
			(self.deal, "expected_deal_value", 731928.45, 150),
		):
			with self.subTest(doctype=doc.doctype):
				frappe.set_user("Administrator")
				doc.set(field, secret)
				doc.save(ignore_version=False)
				doc.reload().set(field, current)
				doc.save(ignore_version=False)
				stored = self.stored(doc)
				old_values = [
					entry[2]
					for row in stored
					for entry in json.loads(row.data).get("changed", [])
					if entry[0] == field
				]
				self.assertTrue(old_values)
				self.protect(doc.doctype, field)
				frappe.set_user(self.user)
				for reader in (
					lambda: load.getdoc(doc.doctype, doc.name),
					lambda: load.get_docinfo(doctype=doc.doctype, name=doc.name),
				):
					with patch.dict(frappe.response, {"docs": []}, clear=True):
						reader()
						versions = frappe.response.docinfo.versions
						self.assertNotIn(
							field,
							[
								entry[0]
								for row in versions
								for entry in json.loads(row.data).get("changed", [])
							],
						)
						self.assertNotIn(str(old_values[0]), frappe.as_json(frappe.response))
				frappe.set_user("Administrator")
				self.assertEqual(self.stored(doc), stored)

	def test_native_save_response_cannot_reintroduce_masked_old_values(self):
		secret = "SAVED-HISTORY-" + self.key
		self.lead.job_title = secret
		self.lead.save(ignore_version=False)
		self.lead.reload().job_title = "Current role"
		self.lead.save(ignore_version=False)
		self.protect("CRM Lead", "job_title")
		frappe.set_user(self.user)
		payload = frappe.get_doc("CRM Lead", self.lead.name).as_dict()
		payload["status"] = "Qualified"
		save.savedocs(frappe.as_json(payload), "Save")
		self.assertEqual(frappe.db.get_value("CRM Lead", self.lead.name, "status"), "Qualified")
		self.assertTrue(frappe.response.docinfo.versions)
		self.assertNotIn(secret, frappe.as_json(frappe.response))

	def test_digest_uses_recipient_mask_while_session_is_administrator(self):
		self.deal.expected_deal_value = 827364.12
		self.deal.save(ignore_version=False)
		self.deal.reload().probability = 63
		self.deal.save(ignore_version=False)
		self.protect("CRM Deal", "expected_deal_value")
		self.assertEqual(frappe.session.user, "Administrator")
		result = document_follow.get_version("CRM Deal", self.deal.name, "Hourly", self.user)
		self.assertTrue(result)
		frappe.get_doc(
			{
				"doctype": "Document Follow",
				"ref_doctype": "CRM Deal",
				"ref_docname": self.deal.name,
				"user": self.user,
			}
		).insert()
		message, documents = document_follow.get_message_for_user("Hourly", self.user)
		self.assertTrue(message)
		self.assertEqual([row["reference_docname"] for row in documents], [self.deal.name])
		self.assertNotIn("827364", frappe.as_json(message))
		self.assertNotIn("827,364", frappe.as_json(message))
		wire = frappe.as_json(result)
		self.assertNotIn("827,364", wire)
		self.assertNotIn("827364", wire)
		self.assertIn("63", wire)
		self.assertEqual(frappe.session.user, "Administrator")
		data = {"changed": [["expected_deal_value", 1, 827364.12]]}
		self.assertIsNone(self.project(data))
		frappe.set_user(self.user)
		self.assertEqual(self.project(data, user="Administrator")["changed"], data["changed"])

	def test_parent_read_is_required_for_the_explicit_recipient(self):
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.user,
				"allow": "CRM Deal",
				"for_value": self.deal.name,
				"apply_to_all_doctypes": 0,
				"applicable_for": "CRM Deal",
			}
		).insert()
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name, user=self.user))
		with self.assertRaises(frappe.PermissionError):
			self.project({"changed": [["probability", 10, 20]]}, doc=self.other)

	def child_history(self):
		return {
			"added": [
				[
					"contacts",
					{
						"doctype": "CRM Contacts",
						"name": "historical-child",
						"idx": 1,
						"full_name": "Visible person",
						"phone": "PRIVATE-CHILD-PHONE",
						"parent": "PRIVATE-PARENT",
						"unknown_secret": "PRIVATE-EXTRA",
					},
				]
			],
			"removed": [
				[
					"contacts",
					{
						"doctype": "CRM Contacts",
						"name": "removed-child",
						"full_name": "Removed person",
						"phone": "PRIVATE-REMOVED-PHONE",
					},
				]
			],
			"row_changed": [
				[
					"contacts",
					1,
					"historical-child",
					[["phone", "PRIVATE-OLD", "PRIVATE-NEW"], ["full_name", "Before", "After"]],
				]
			],
		}

	def test_child_add_remove_and_every_diff_are_projected_without_mutation(self):
		data = self.child_history()
		original = copy.deepcopy(data)
		version = self.version(self.deal, data)
		self.protect("CRM Contacts", "phone")
		result = self.project(data)
		self.assertNotIn("PRIVATE-", frappe.as_json(result))
		self.assertEqual(result["added"][0][1]["full_name"], "Visible person")
		self.assertEqual(result["removed"][0][1]["full_name"], "Removed person")
		self.assertEqual(result["row_changed"][0][3], [["full_name", "Before", "After"]])
		self.assertEqual(data, original)
		self.assertEqual(json.loads(version.reload().data), original)

	def test_child_permlevel_and_parent_table_masks_both_apply(self):
		data = self.child_history()
		self.protect("CRM Contacts", "phone", "permlevel", 9)
		self.assertNotIn("PHONE", frappe.as_json(self.project(data)))
		self.protect("CRM Deal", "contacts")
		self.assertIsNone(self.project(data))

	def test_denied_only_child_does_not_expose_row_identity(self):
		self.protect("CRM Contacts", "phone")
		data = {"added": [["contacts", {"name": "PRIVATE-ROW", "phone": "PRIVATE-PHONE"}]]}
		self.assertIsNone(self.project(data))

	def test_link_titles_cannot_bypass_current_target_title_mask(self):
		make_property_setter(
			"CRM Organization", None, "show_title_field_in_link", 1, "Check", for_doctype=True
		)
		make_property_setter(
			"CRM Organization", None, "title_field", "organization_name", "Data", for_doctype=True
		)
		self.protect("CRM Organization", "organization_name")
		result = self.project({"changed": [["organization", "PRIVATE-OLD-TITLE", "PRIVATE-NEW-TITLE"]]})
		self.assertEqual(result["changed"], [["organization", "", ""]])
		self.assertEqual(
			history._value(frappe._dict(fieldtype="Dynamic Link"), "PRIVATE-UNRESOLVABLE", self.user), ""
		)

	def test_creation_stays_renderable_without_disclosing_arbitrary_source_link(self):
		data = {
			"creation": str(now_datetime()),
			"created_by": "Administrator",
			"updater_reference": {
				"doctype": "Data Import",
				"docname": "PRIVATE-IMPORT",
				"label": "<script>PRIVATE-SOURCE</script>",
			},
			"audit_user": "Operator <reviewed>",
		}
		result = self.project(data)
		self.assertEqual(result["created_by"], "Administrator")
		self.assertEqual(set(result["updater_reference"]), {"label"})
		self.assertNotIn("PRIVATE-", frappe.as_json(result))
		self.assertEqual(result["audit_user"], "Operator &lt;reviewed&gt;")

	def test_malformed_unknown_and_oversized_diffs_have_no_raw_fallback(self):
		data = {
			"changed": [
				None,
				[],
				["probability", {"secret": "PRIVATE-NESTED"}, 20],
				["missing_field", "", "PRIVATE-UNKNOWN"],
				["probability", 10, 20],
			],
			"added": [["contacts", {"doctype": "Wrong child", "full_name": "PRIVATE-WRONG"}]],
			"comment": "PRIVATE-COMMENT",
			"extra": "PRIVATE-EXTRA",
		}
		result = self.project(data)
		self.assertEqual(result["changed"], [["probability", 10, 20]])
		self.assertNotIn("PRIVATE-", frappe.as_json(result))
		self.assertIsNone(self.project({"changed": [["probability", 0, 1]] * (history.MAX_CHANGES + 1)}))
		self.assertIsNone(self.project([]))

	def test_non_crm_history_is_untouched(self):
		data = {"changed": [["subject", "old", "new"]], "other_native_key": True}
		self.assertIs(history.project("ToDo", "unrelated", data, self.user), data)
