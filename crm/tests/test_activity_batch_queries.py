"""Native timeline parity and constant attachment reads as history grows."""

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.desk.form.assign_to import remove as remove_assignment
from frappe.tests import IntegrationTestCase

from crm.api import activities
from crm.tests.test_offers import OfferFixture


def remote_file(doctype, name):
	"""Native remote-file metadata needs neither disk content nor HTTP."""
	return frappe.get_doc(
		{
			"doctype": "File",
			"file_name": "Support.txt",
			"file_url": f"https://assets.example.invalid/{uuid4().hex}.txt",
			"attached_to_doctype": doctype,
			"attached_to_name": name,
		}
	).insert()


class TestActivityBatchQueries(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.make_fixture()

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def comment_with_file(self, deal):
		comment = deal.add_comment("Comment", "Fictional support note")
		file = remote_file("Comment", comment.name)
		return comment, file

	def test_same_named_lead_and_deal_keep_direct_and_dynamic_activity_scopes(self):
		lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Same name",
				"status": "New",
				"lead_owner": self.user,
			}
		).insert(set_name=self.deal.name)
		expected = {}
		for doctype in ("CRM Lead", "CRM Deal"):
			common = {"reference_doctype": doctype, "reference_docname": self.deal.name}
			note = frappe.get_doc({"doctype": "FCRM Note", "title": doctype + " note", **common}).insert()
			task = frappe.get_doc({"doctype": "CRM Task", "title": doctype + " task", **common}).insert()
			call_values = {
				"doctype": "CRM Call Log",
				"telephony_medium": "Manual",
				"caller": self.user,
				"type": "Outgoing",
				"from": "+12025550100",
				"to": "+12025550123",
				"status": "Completed",
			}
			direct = frappe.get_doc({**call_values, **common}).insert()
			dynamic = frappe.get_doc(
				{
					**call_values,
					"links": [{"link_doctype": doctype, "link_name": self.deal.name}],
				}
			).insert()
			expected[doctype] = ({direct.name, dynamic.name}, {note.name}, {task.name})
		frappe.set_user(self.user)
		for doctype, names in expected.items():
			with self.subTest(doctype=doctype):
				result = activities.get_activities(self.deal.name, doctype=doctype)
				self.assertEqual(tuple({row["name"] for row in rows} for rows in result[1:4]), names)
				self.assertTrue(all(row["is_lead"] == (doctype == "CRM Lead") for row in result[0]))
		# The old name-only contract remains Deal-first; new clients identify the parent.
		self.assertEqual(
			activities.get_activities(self.deal.name), activities.get_activities(self.deal.name, "CRM Deal")
		)
		frappe.set_user("Administrator")
		# Native owner changes intentionally preserve other assignees. Revoke
		# this seller's assignment through the normal command before asserting
		# denial; changing ownership alone is not a valid private-record fixture.
		remove_assignment("CRM Lead", lead.name, self.user)
		lead.reload()
		lead.lead_owner = "Administrator"
		lead.save()
		self.assertFalse(
			frappe.db.exists(
				"ToDo",
				{
					"reference_type": "CRM Lead",
					"reference_name": lead.name,
					"allocated_to": self.user,
					"status": ["!=", "Cancelled"],
				},
			)
		)
		self.assertFalse(
			frappe.db.exists(
				"DocShare", {"share_doctype": "CRM Lead", "share_name": lead.name, "user": self.user}
			)
		)
		self.assertEqual(lead.reload().lead_owner, "Administrator")
		frappe.set_user(self.user)
		self.assertFalse(frappe.has_permission("CRM Lead", "read", lead.name))
		with self.assertRaises(frappe.PermissionError):
			activities.get_activities(lead.name, doctype="CRM Lead")
		self.assertEqual(
			{row["name"] for row in activities.get_activities(self.deal.name, "CRM Deal")[1]},
			expected["CRM Deal"][0],
		)
		with self.assertRaises(frappe.ValidationError):
			activities.get_activities(self.deal.name, doctype="Sales Order")

	def test_communication_and_automated_files_cannot_borrow_comment_names(self):
		comment, comment_file = self.comment_with_file(self.deal)
		communications = []
		for kind in ("Communication", "Automated Message"):
			communication = frappe.get_doc(
				{
					"doctype": "Communication",
					"communication_type": kind,
					"communication_medium": "Email",
					"sent_or_received": "Received",
					"subject": "Fictional " + kind,
					"content": "Support reply",
					"reference_doctype": "CRM Deal",
					"reference_name": self.deal.name,
				}
			).insert()
			communications.append((communication, remote_file("Communication", communication.name)))
		foreign = frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_type": "Communication",
				"communication_medium": "Email",
				"sent_or_received": "Received",
				"subject": "Foreign reply",
				"reference_doctype": "CRM Deal",
				"reference_name": self.other.name,
			}
		).insert(set_name=comment.name)
		foreign_file = remote_file("Communication", foreign.name)
		frappe.set_user(self.user)
		result, _ = self.read_timeline()
		entry = next(row for row in result[0] if row.get("name") == comment.name)
		self.assertEqual([row["name"] for row in entry["attachments"]], [comment_file.name])
		for communication, file in communications:
			entry = next(
				row
				for row in result[0]
				if isinstance(row.get("data"), dict) and row["data"].get("subject") == communication.subject
			)
			self.assertEqual([row["name"] for row in entry["data"]["attachments"]], [file.name])
		self.assertNotIn(foreign_file.file_url, frappe.as_json(result))

	def read_timeline(self):
		queries = []
		native_sql = frappe.db.sql

		def observe(query, *args, **kwargs):
			if "tabFile" in str(query) and str(query).lstrip().lower().startswith("select"):
				queries.append(1)  # Counts only; no SQL/values in test artifacts.
			return native_sql(query, *args, **kwargs)

		with (
			patch.object(frappe.db, "sql", side_effect=observe),
			patch.object(activities, "get_linked_calls", wraps=activities.get_linked_calls) as calls,
		):
			result = activities.get_activities(self.deal.name)
			self.assertEqual(calls.call_count, 1)
		return result, len(queries)

	def test_more_comments_preserve_all_files_without_per_comment_queries(self):
		first = self.comment_with_file(self.deal)
		foreign = self.comment_with_file(self.other)
		frappe.set_user(self.user)
		before, small_reads = self.read_timeline()
		self.assertGreater(small_reads, 0, "The observer must see real attachment SQL")
		frappe.set_user("Administrator")
		pairs = [first, *(self.comment_with_file(self.deal) for _ in range(14))]
		frappe.set_user(self.user)
		after, larger_reads = self.read_timeline()
		self.assertEqual(larger_reads, small_reads)
		comments = {row["name"]: row for row in after[0] if row["activity_type"] == "comment"}
		for comment, file in pairs:
			files = comments[comment.name]["attachments"]
			self.assertEqual([row["name"] for row in files], [file.name])
			self.assertEqual(set(files[0]), set(activities.ATTACHMENT_FIELDS))
		self.assertNotIn(foreign[0].name, comments)
		self.assertNotIn(foreign[1].file_url, frappe.as_json(after))
		self.assertEqual(before[1:], after[1:])  # Calls/notes/tasks/parent files unchanged.

	def test_native_parent_denial_precedes_attachment_queries(self):
		self.comment_with_file(self.other)
		frappe.set_user(self.user)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name))
		with patch.object(
			activities, "_activity_attachments", wraps=activities._activity_attachments
		) as batch:
			with self.assertRaises(frappe.PermissionError):
				activities.get_activities(self.other.name)
			batch.assert_not_called()

	def test_empty_native_history_never_queries_an_unbounded_attachment_scope(self):
		with patch.object(frappe.db, "get_all", wraps=frappe.db.get_all) as reads:
			self.assertEqual(
				activities._activity_attachments(
					frappe._dict(comments=[], communications=[], automated_messages=[])
				),
				{},
			)
			reads.assert_not_called()
