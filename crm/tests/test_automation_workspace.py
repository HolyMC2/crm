"""Native source permissions; opening automations never creates workflow work."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.automation_workspace import _return_path, get_context


class TestAutomationWorkspace(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def test_guest_cannot_open_even_an_absent_workspace(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			get_context()

	def test_no_optional_import_when_workspace_is_absent(self):
		with patch("frappe.get_installed_apps", return_value=["frappe", "crm"]):
			result = get_context(return_to="/crm/deals?owner=me#offers")
		self.assertEqual(result["reason"], "not_installed")
		self.assertFalse(result["available"])
		self.assertNotIn("workspace_url", result)

	def test_external_and_traversal_return_destinations_are_rejected(self):
		for value in (
			"https://evil.invalid",
			"//evil.invalid",
			"/crm/../api",
			"/crm/%2e%2e/api",
			"/crm/%5c",
			"/crm/deals%0a",
		):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				_return_path(value)

	def test_arbitrary_or_partial_source_is_rejected(self):
		for doctype, name in (("User", "Administrator"), ("CRM Deal", None), (None, "DEAL")):
			with self.subTest(doctype=doctype), self.assertRaises(frappe.ValidationError):
				get_context(doctype, name)

	def test_known_source_name_does_not_bypass_native_permission(self):
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Private automation source", "lead_owner": "Administrator"}
		).insert()
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": f"automation-denied-{frappe.generate_hash(length=10)}@example.invalid",
				"first_name": "Denied",
				"send_welcome_email": 0,
				"roles": [],
			}
		).insert()
		frappe.set_user(user.name)
		with self.assertRaises(frappe.PermissionError):
			get_context("CRM Lead", lead.name)

	def test_native_source_and_queue_are_carried_without_new_work(self):
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Automation context", "lead_owner": "Administrator"}
		).insert()
		installed = "doco" in frappe.get_installed_apps()
		before = frappe.db.count("Asistente Agent Run") if installed else None
		result = get_context("CRM Lead", lead.name, "/crm/leads/view/list?owner=me")
		self.assertEqual(result["reference"], {"doctype": "CRM Lead", "name": lead.name})
		if installed:
			self.assertTrue(result["available"], result)
			query = parse_qs(urlsplit(result["workspace_url"]).query)
			self.assertEqual(query["dept"], ["sales"])
			self.assertEqual(query["crm_name"], [lead.name])
			self.assertEqual(query["crm_return"], ["/crm/leads/view/list?owner=me"])
			self.assertEqual(frappe.db.count("Asistente Agent Run"), before)
		else:
			self.assertEqual(result["reason"], "not_installed")
