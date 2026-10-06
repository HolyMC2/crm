"""Agenda attendee picker: coworkers stay searchable when the worker cannot read Contacts."""

from unittest import TestCase, skipIf
from uuid import uuid4

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api.agenda import search_people

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

ROLE = "Agenda People Test Role"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestAgendaPeople(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		self.worker = self.user("agenda-event-only")
		self.coworker = self.user("agenda-people-coworker")
		self.revoke_owner_contact_reads()
		self.contact = frappe.get_doc(
			{"doctype": "Contact", "first_name": "Agenda People Contacto " + uuid4().hex[:6]}
		).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		frappe.clear_cache(doctype="Contact")

	def revoke_owner_contact_reads(self):
		"""Stock Contact grants «All» an if-owner read; this worker must have none at all.
		Rolled back with the test; the cache is cleared in tearDown."""
		frappe.permissions.setup_custom_perms("Contact")
		for name in frappe.get_all(
			"Custom DocPerm", filters={"parent": "Contact", "role": "All"}, pluck="name"
		):
			frappe.db.set_value("Custom DocPerm", name, {"read": 0, "select": 0})
		frappe.clear_cache(doctype="Contact")

	def user(self, prefix: str) -> str:
		email = f"{prefix}-{uuid4().hex[:6]}@example.test"
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Agenda People " + prefix,
				"user_type": "System User",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)
		doc.add_roles(ROLE)
		return email

	def test_event_only_worker_finds_coworkers_without_contacts(self):
		frappe.set_user(self.worker)
		self.assertTrue(frappe.has_permission("Event", "read"))
		self.assertFalse(frappe.has_permission("Contact", "read"))
		people = search_people("Agenda People")["people"]
		self.assertIn(self.coworker, [row["name"] for row in people if row["doctype"] == "User"])
		self.assertNotIn("Contact", {row["doctype"] for row in people})

	def test_select_only_worker_gets_coworkers_and_no_contact_details(self):
		frappe.permissions.add_permission("Contact", ROLE, ptype="select")
		# Custom DocPerm defaults read to 1; a select-only role has select and nothing else.
		for name in frappe.get_all(
			"Custom DocPerm", filters={"parent": "Contact", "role": ROLE}, pluck="name"
		):
			frappe.db.set_value("Custom DocPerm", name, {"read": 0, "select": 1})
		frappe.clear_cache(doctype="Contact")
		frappe.set_user(self.worker)
		self.assertFalse(frappe.has_permission("Contact", "read"))
		people = search_people("Agenda People")["people"]
		self.assertIn(self.coworker, [row["name"] for row in people if row["doctype"] == "User"])
		self.assertNotIn("Contact", {row["doctype"] for row in people})
