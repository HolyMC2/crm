"""Real linked-row permissions and projection; no provider or permission doubles."""

from collections import Counter
from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.api import activities
from crm.fcrm.doctype.crm_call_log import crm_call_log as calls
from crm.tests.test_offers import OfferFixture


class TestActivityLinkedScope(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "linked_scope_" + frappe.generate_hash(length=8)
		frappe.db.savepoint(self.point)
		self.callbacks = {
			name: getattr(frappe.db, name)
			for name in ("before_commit", "after_commit", "before_rollback", "after_rollback")
		}
		self.had_realtime_log = hasattr(frappe.local, "_realtime_log")
		self.realtime_log = getattr(frappe.local, "_realtime_log", None)
		if self.had_realtime_log:
			del frappe.local._realtime_log
		for name in self.callbacks:
			setattr(frappe.db, name, CallbackManager())
		self.addCleanup(self.restore_fixture)
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.make_fixture()
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)

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
				for doctype in (
					"CRM Call Log",
					"Dynamic Link",
					"FCRM Note",
					"CRM Task",
					"User",
					"Contact",
					"Contact Phone",
					"CRM Lead",
					"CRM Deal",
				):
					frappe.clear_cache(doctype=doctype)
				if getattr(self, "user", None):
					frappe.clear_cache(user=self.user)
				frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime_log:
					frappe.local._realtime_log = self.realtime_log
				frappe.set_user(self.previous_user)

	def call(self, *, direct=True, **values):
		return frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"type": "Outgoing",
				"caller": self.user,
				"from": "+12025550100",
				"to": "+12025550123",
				"status": "Completed",
				"duration": 123,
				**({"reference_doctype": "CRM Deal", "reference_docname": self.deal.name} if direct else {}),
				**values,
			}
		).insert()

	def note(self, **values):
		return frappe.get_doc(
			{
				"doctype": "FCRM Note",
				"title": "Readable note " + frappe.generate_hash(length=6),
				"reference_doctype": "CRM Deal",
				"reference_docname": self.deal.name,
				**values,
			}
		).insert()

	def task(self, **values):
		return (
			frappe.get_doc(
				{
					"doctype": "CRM Task",
					"title": "Readable task " + frappe.generate_hash(length=6),
					"reference_doctype": "CRM Deal",
					"reference_docname": self.deal.name,
					**values,
				}
			)
			.insert()
			.reload()
		)

	def link(self, call, *documents):
		call.reload()
		for document in documents:
			call.link_with_reference_doc(document.doctype, document.name)
		call.save()

	def protect(self, doctype, field, prop="mask", value=1):
		frappe.set_user("Administrator")
		make_property_setter(doctype, field, prop, value, "Check" if prop == "mask" else "Int")
		frappe.clear_cache(doctype=doctype)
		frappe.set_user(self.user)

	def restrict(self, doctype, name):
		frappe.set_user("Administrator")
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.user,
				"allow": doctype,
				"for_value": str(name),
				"apply_to_all_doctypes": 0,
				"applicable_for": doctype,
			}
		).insert()
		frappe.clear_cache(user=self.user)
		frappe.set_user(self.user)

	def linked(self):
		return activities.get_linked_calls("CRM Deal", self.deal.name)

	def test_readable_parent_is_not_permission_to_its_calls_or_children(self):
		visible = self.call()
		private = self.call(
			caller="Administrator", to="+12025550999", recording_url="https://example.invalid/PRIVATE-CALL"
		)
		note = self.note(reference_doctype=None, reference_docname=None, content="PRIVATE-LINKED-NOTE")
		task = self.task(reference_doctype=None, reference_docname=None, description="PRIVATE-LINKED-TASK")
		self.link(private, self.deal, note, task)
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		self.assertFalse(frappe.has_permission("CRM Call Log", "read", private.name))
		result = self.linked()
		self.assertEqual([row.name for row in result["calls"]], [visible.name])
		for secret in (
			private.name,
			private.to,
			private.recording_url,
			note.name,
			"PRIVATE-LINKED-NOTE",
			"PRIVATE-LINKED-TASK",
		):
			self.assertNotIn(secret, frappe.as_json(result))
		with self.assertRaises(frappe.PermissionError):
			calls.get_call_log(private.name)

	def test_recording_proxy_encodes_the_admitted_native_identifier(self):
		call = self.call(
			id="scope-" + self.key + "&other=1", recording_url="https://example.invalid/recording"
		)
		frappe.set_user(self.user)
		path = calls.get_call_log(call.name)["recording_url_path"]
		self.assertTrue(path.endswith("scope-" + self.key + "%26other%3D1"))
		self.assertNotIn("&other=1", path)

	def test_native_call_share_and_revocation_change_timeline_membership(self):
		shared = self.call(caller="Administrator")
		frappe.set_user(self.user)
		self.assertEqual(self.linked()["calls"], [])
		frappe.set_user("Administrator")
		frappe.share.add("CRM Call Log", shared.name, self.user, read=1)
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Call Log", "read", shared.name))
		self.assertEqual([row.name for row in self.linked()["calls"]], [shared.name])
		frappe.set_user("Administrator")
		frappe.share.remove("CRM Call Log", shared.name, self.user)
		frappe.set_user(self.user)
		self.assertEqual(self.linked()["calls"], [])

	def test_native_call_user_permission_intersects_hierarchy(self):
		allowed, denied = self.call(), self.call()
		self.restrict("CRM Call Log", allowed.name)
		self.assertTrue(frappe.has_permission("CRM Call Log", "read", allowed.name))
		self.assertFalse(frappe.has_permission("CRM Call Log", "read", denied.name))
		self.assertEqual([row.name for row in self.linked()["calls"]], [allowed.name])

	def test_child_rows_require_native_note_and_task_permissions(self):
		call = self.call()
		allowed_note, denied_note = self.note(), self.note(content="DENIED-NOTE-CONTENT")
		allowed_task, denied_task = self.task(), self.task(description="DENIED-TASK-CONTENT")
		self.link(call, self.deal, allowed_note, denied_note, allowed_task, denied_task)
		call.note = denied_note.name
		call.save()
		self.restrict("FCRM Note", allowed_note.name)
		self.restrict("CRM Task", allowed_task.name)
		self.assertFalse(frappe.has_permission("FCRM Note", "read", denied_note.name))
		self.assertFalse(frappe.has_permission("CRM Task", "read", denied_task.name))
		for result in (self.linked(), calls.get_call_log(call.name)):
			self.assertNotIn(denied_note.name, frappe.as_json(result))
			self.assertNotIn("DENIED-NOTE-CONTENT", frappe.as_json(result))
			self.assertNotIn("DENIED-TASK-CONTENT", frappe.as_json(result))
		self.assertEqual(
			[row.name for row in activities.get_linked_notes("CRM Deal", self.deal.name)], [allowed_note.name]
		)
		self.assertEqual(
			[row.name for row in activities.get_linked_tasks("CRM Deal", self.deal.name)], [allowed_task.name]
		)

	def test_detail_and_timeline_never_serialize_private_sibling_identity(self):
		private_lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Private parent", "lead_owner": "Administrator"}
		).insert()
		note = self.note(reference_docname=self.other.name)
		task = self.task(reference_doctype="CRM Lead", reference_docname=private_lead.name)
		call = self.call(reference_docname=self.other.name)
		self.link(call, private_lead, self.deal, note, task)
		frappe.set_user(self.user)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name))
		self.assertFalse(frappe.has_permission("CRM Lead", "read", private_lead.name))
		detail = calls.get_call_log(call.name)
		self.assertEqual(detail["_deal"], self.deal.name)
		self.assertEqual(detail["id"], call.id)  # Native add-note/task continuation.
		self.assertNotIn("links", detail)
		for result in (detail, self.linked()):
			self.assertNotIn(self.other.name, frappe.as_json(result))
			self.assertNotIn(private_lead.name, frappe.as_json(result))
		self.assertEqual(detail["_notes"][0].name, note.name)
		self.assertEqual(detail["_tasks"][0].name, task.name)

	def test_same_call_and_children_are_not_duplicated_across_reference_paths(self):
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Converted scope", "lead_owner": self.user}
		).insert()
		self.deal.reload()
		self.deal.lead = lead.name
		self.deal.save()
		call, note, task = self.call(), self.note(), self.task()
		self.link(call, self.deal, self.other, lead, note, task)
		call.note = note.name
		call.save()
		frappe.set_user(self.user)
		result = activities.get_activities(self.deal.name, "CRM Deal")
		self.assertEqual([row.name for row in result[1]], [call.name])
		self.assertEqual([row.name for row in result[2]], [note.name])
		self.assertEqual([row.name for row in result[3]], [task.name])

	def test_masked_and_restricted_scalars_do_not_leak_through_derived_values(self):
		call = self.call(recording_url="https://example.invalid/MASKED-RECORDING")
		note = self.note(content="MASKED-NOTE-CONTENT")
		task = self.task(description="RESTRICTED-TASK-CONTENT")
		self.link(call, self.deal, note, task)
		frappe.set_user(self.user)
		before = calls.get_call_log(call.name)
		self.assertIn("recording_url_path", before)
		self.assertIn("MASKED-NOTE-CONTENT", frappe.as_json(before))
		self.assertIn("RESTRICTED-TASK-CONTENT", frappe.as_json(before))
		self.protect("CRM Call Log", "recording_url")
		self.protect("CRM Call Log", "to")
		self.protect("FCRM Note", "content")
		self.protect("CRM Task", "description", "permlevel", 1)
		for result in (self.linked(), calls.get_call_log(call.name)):
			wire = frappe.as_json(result)
			for secret in (call.to, call.recording_url, "MASKED-NOTE-CONTENT", "RESTRICTED-TASK-CONTENT"):
				self.assertNotIn(secret, wire)
		self.assertNotIn("recording_url_path", calls.get_call_log(call.name))
		self.assertEqual(self.linked()["calls"][0]["status"], "Completed")

	def test_protected_table_and_child_relation_cannot_reveal_membership(self):
		call = self.call(direct=False)
		self.link(call, self.deal)
		frappe.set_user(self.user)
		self.assertEqual([row.name for row in self.linked()["calls"]], [call.name])
		self.protect("CRM Call Log", "links")
		self.assertEqual(self.linked()["calls"], [])
		self.assertNotIn(self.deal.name, frappe.as_json(calls.get_call_log(call.name)))
		self.protect("CRM Call Log", "links", value=0)
		self.assertEqual([row.name for row in self.linked()["calls"]], [call.name])
		self.protect("Dynamic Link", "link_name")
		self.assertEqual(self.linked()["calls"], [])
		self.assertNotIn(self.deal.name, frappe.as_json(calls.get_call_log(call.name)))
		self.protect("Dynamic Link", "link_name", value=0)
		self.assertEqual([row.name for row in self.linked()["calls"]], [call.name])
		self.protect("Dynamic Link", "link_name", "permlevel", 1)
		self.assertEqual(self.linked()["calls"], [])
		self.assertNotIn(self.deal.name, frappe.as_json(calls.get_call_log(call.name)))

	def test_administrator_keeps_native_access_to_higher_level_table(self):
		call = self.call(direct=False)
		self.link(call, self.deal)
		self.protect("CRM Call Log", "links", "permlevel", 1)
		self.assertNotIn("_deal", calls.get_call_log(call.name))
		frappe.set_user("Administrator")
		self.assertEqual(calls.get_call_log(call.name)["_deal"], self.deal.name)

	def test_protected_direct_reference_does_not_reveal_membership(self):
		call = self.call()
		frappe.set_user(self.user)
		self.assertEqual([row.name for row in self.linked()["calls"]], [call.name])
		self.protect("CRM Call Log", "reference_docname")
		self.assertEqual(self.linked()["calls"], [])
		self.assertNotIn(self.deal.name, frappe.as_json(calls.get_call_log(call.name)))

	def test_readable_call_children_are_complete_beyond_default_page(self):
		call = self.call()
		notes, tasks = [self.note() for _ in range(25)], [self.task() for _ in range(25)]
		self.link(call, self.deal, *notes, *tasks)
		frappe.set_user(self.user)
		result = calls.get_call_log(call.name)
		self.assertEqual([row.name for row in result["_notes"]], [row.name for row in notes])
		self.assertEqual([row.name for row in result["_tasks"]], [row.name for row in tasks])
		for row in result["_notes"] + result["_tasks"]:
			self.assertNotIn("reference_docname", row)
			self.assertNotIn("automation_source_name", row)

	def test_actor_contact_enrichment_is_detail_only_and_cannot_cross_user_permission(self):
		call = self.call()
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Private phone identity",
				"phone_nos": [{"phone": call.to, "is_primary_mobile_no": 1}],
			}
		).insert()
		allowed = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Other allowed identity",
				"phone_nos": [{"phone": "+12025550124", "is_primary_mobile_no": 1}],
			}
		).insert()
		frappe.set_user(self.user)
		self.assertEqual(calls.get_call_log(call.name)["_receiver"]["label"], contact.full_name)
		with patch.object(
			calls,
			"get_contact_by_phone_number",
			side_effect=AssertionError("Timeline must not enrich each phone"),
		):
			self.assertEqual(self.linked()["calls"][0]["_receiver"]["label"], call.to)
		self.restrict("Contact", allowed.name)
		self.assertFalse(frappe.has_permission("Contact", "read", contact.name))
		self.assertNotIn(contact.full_name, frappe.as_json(calls.get_call_log(call.name)))

	def test_native_user_profile_mask_suppresses_name_and_image(self):
		frappe.get_doc("User", self.user).add_roles("System Manager")
		user = frappe.get_doc("User", self.user)
		user.first_name = "PRIVATE-AGENT-LABEL"
		user.user_image = "https://example.invalid/PRIVATE-AGENT-IMAGE.png"
		user.save()
		call = self.call()
		frappe.set_user(self.user)
		self.assertEqual(calls.get_call_log(call.name)["_caller"]["label"], user.full_name)
		self.protect("User", "full_name")
		self.protect("User", "user_image")
		for result in (self.linked(), calls.get_call_log(call.name)):
			self.assertNotIn(user.full_name, frappe.as_json(result))
			self.assertNotIn(user.user_image, frappe.as_json(result))
		self.assertEqual(self.linked()["calls"][0]["_caller"]["label"], self.user)

	def test_parent_denial_precedes_any_call_selection(self):
		frappe.set_user(self.user)
		with patch.object(
			activities, "readable_activity_fields", side_effect=AssertionError("No linked query")
		):
			for helper in (
				activities.get_linked_calls,
				activities.get_linked_notes,
				activities.get_linked_tasks,
			):
				with self.assertRaises(frappe.PermissionError):
					helper("CRM Deal", self.other.name)

	def test_timeline_activity_sql_does_not_grow_per_call_or_phone(self):
		first = self.call()
		self.link(first, self.deal)
		frappe.set_user(self.user)
		self.linked()  # Warm metadata/permission caches; not counted as evidence.

		def read():
			queries = Counter()
			native_sql = frappe.db.sql

			def observe(query, *args, **kwargs):
				text = str(query)
				if text.lstrip().lower().startswith("select"):
					for table in ("CRM Call Log", "Dynamic Link", "User", "Contact Phone"):
						if f"`tab{table}`" in text:
							queries[table] += 1  # Counts only; no SQL/values in artifacts.
				return native_sql(query, *args, **kwargs)

			with patch.object(frappe.db, "sql", side_effect=observe):
				result = self.linked()
			return result, queries

		before, small = read()
		self.assertGreater(small["CRM Call Log"], 0)
		frappe.set_user("Administrator")
		for index in range(14):
			call = self.call(to=f"+1202555{1200 + index}")
			self.link(call, self.deal)
		frappe.set_user(self.user)
		self.linked()
		after, large = read()
		self.assertEqual(len(before["calls"]), 1)
		self.assertEqual(len(after["calls"]), 15)
		self.assertEqual(large, small)
		self.assertEqual(large["Contact Phone"], 0)
