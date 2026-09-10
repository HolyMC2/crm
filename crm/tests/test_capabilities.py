from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import capabilities


class TestGetCapabilities(IntegrationTestCase):
	def test_reports_installed_apps_for_crm_session(self):
		# Administrator (the test session) holds System Manager: real installed list.
		result = capabilities.get_capabilities()
		self.assertIsInstance(result["installed_apps"], list)
		self.assertIn("frappe", result["installed_apps"])
		self.assertIn("crm", result["installed_apps"])

	def test_passes_through_the_site_list_without_the_addon(self):
		with patch.object(capabilities, "get_installed_apps", return_value=["frappe", "erpnext", "crm"]):
			result = capabilities.get_capabilities()
		self.assertEqual(result, {"installed_apps": ["frappe", "erpnext", "crm"]})
		self.assertNotIn("doco_marketing", result["installed_apps"])

	def test_passes_through_the_site_list_with_the_addon(self):
		with patch.object(capabilities, "get_installed_apps", return_value=["frappe", "crm", "doco_marketing"]):
			result = capabilities.get_capabilities()
		self.assertIn("doco_marketing", result["installed_apps"])

	def test_non_crm_session_is_rejected_before_any_lookup(self):
		with (
			patch.object(capabilities, "get_session_role_flags", side_effect=frappe.PermissionError),
			patch.object(capabilities, "get_installed_apps") as apps,
		):
			with self.assertRaises(frappe.PermissionError):
				capabilities.get_capabilities()
			apps.assert_not_called()
