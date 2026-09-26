"""Native timeline parity and constant attachment reads as history grows."""

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import activities
from crm.tests.test_offers import OfferFixture


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
		file = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": "Support.txt",
				# Native remote-file metadata needs neither disk content nor HTTP.
				"file_url": f"https://assets.example.invalid/{uuid4().hex}.txt",
				"attached_to_doctype": "Comment",
				"attached_to_name": comment.name,
			}
		).insert()
		return comment, file

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
