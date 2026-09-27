"""Native assignment metadata requires the current reader's parent authority."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.api.doc import get_assigned_users
from crm.tests.test_offers import OfferFixture


class TestAssignedUsersScope(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "assignment_scope_" + frappe.generate_hash(length=8)
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
		self.make_fixture()
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		self.assertIn(self.user, [row.allocated_to for row in self.assignments()])

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
				if getattr(self, "user", None):
					frappe.clear_cache(user=self.user)
				frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime:
					frappe.local._realtime_log = self.realtime
				frappe.set_user(self.previous_user)

	def restrict_to_own_deal(self):
		frappe.set_user("Administrator")
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
		frappe.clear_cache(user=self.user)
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name))
		self.assertEqual(frappe.get_list("CRM Deal", filters={"name": self.other.name}), [])

	def assignments(self):
		return frappe.get_all(
			"ToDo",
			filters={"reference_type": "CRM Deal", "reference_name": self.deal.name},
			fields=["name", "allocated_to", "status", "modified"],
			order_by="name",
		)

	def close_assignments(self):
		frappe.set_user("Administrator")
		for row in self.assignments():
			doc = frappe.get_doc("ToDo", row.name)
			doc.status = "Closed"
			doc.save()

	def test_readable_parent_preserves_native_assignees_without_writes(self):
		self.restrict_to_own_deal()
		before = self.assignments()
		self.assertEqual(get_assigned_users("CRM Deal", self.deal.name), [self.user])
		self.assertEqual(self.assignments(), before)
		self.assertEqual(frappe.session.user, self.user)

	def test_denied_parent_cannot_expose_assignee_identity_or_count(self):
		self.restrict_to_own_deal()
		with self.assertRaises(frappe.PermissionError):
			get_assigned_users("CRM Deal", self.other.name)

	def test_default_assignee_does_not_bypass_parent_denial(self):
		self.restrict_to_own_deal()
		with self.assertRaises(frappe.PermissionError):
			get_assigned_users("CRM Deal", self.other.name, default_assigned_to=self.user)

	def test_closed_and_cancelled_assignments_are_not_returned(self):
		self.close_assignments()
		frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": "Fictional cancelled assignment",
				"allocated_to": self.user,
				"reference_type": "CRM Deal",
				"reference_name": self.deal.name,
				"status": "Cancelled",
			}
		).insert()
		self.restrict_to_own_deal()
		self.assertEqual(get_assigned_users("CRM Deal", self.deal.name), [])

	def test_default_is_used_only_for_readable_parent_without_active_assignments(self):
		self.close_assignments()
		self.restrict_to_own_deal()
		self.assertEqual(
			get_assigned_users("CRM Deal", self.deal.name, default_assigned_to=self.user), [self.user]
		)

	def test_active_assignment_takes_precedence_over_default(self):
		self.restrict_to_own_deal()
		self.assertEqual(
			get_assigned_users("CRM Deal", self.deal.name, default_assigned_to="Administrator"),
			[self.user],
		)

	def test_missing_parent_cannot_return_a_default_identity(self):
		with self.assertRaises(frappe.DoesNotExistError):
			get_assigned_users("CRM Deal", "assignment-scope-missing-" + self.key, self.user)

	def test_singleton_read_does_not_require_an_ordinary_list_table(self):
		self.assertEqual(get_assigned_users("FCRM Settings", "FCRM Settings"), [])

	def test_internal_notification_lookup_is_not_a_whitelisted_bypass(self):
		from crm.api import doc as document_api
		from crm.api.whatsapp import get_assigned_users as notification_assignments

		internal = getattr(document_api, "_assigned_users_for_document", None)
		self.assertIsNotNone(internal)
		self.assertIs(notification_assignments, internal)
		self.assertNotIn(internal, frappe.whitelisted)
		self.assertEqual(notification_assignments("CRM Deal", self.deal.name), [self.user])
		with self.assertRaises(frappe.PermissionError):
			frappe.is_whitelisted(internal)
