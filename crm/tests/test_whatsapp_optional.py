import unittest
from unittest.mock import patch

import frappe

from crm.api import whatsapp


class TestOptionalWhatsApp(unittest.TestCase):
	def test_missing_extension_keeps_basic_conversation(self):
		with (
			patch.object(whatsapp, "validate_access") as access,
			patch.object(frappe, "get_installed_apps", return_value=["crm", "frappe_whatsapp"]),
		):
			self.assertEqual(whatsapp.get_deal_whatsapp_contacts("CRM Deal", "D1"), [])
			access.assert_called_once_with("CRM Deal", "D1")

	def test_no_permission_is_rejected_even_without_extension(self):
		with (
			patch.object(whatsapp, "validate_access", side_effect=frappe.PermissionError),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			with self.assertRaises(frappe.PermissionError):
				whatsapp.get_deal_whatsapp_contacts("CRM Deal", "D1")
			apps.assert_not_called()

	def test_arbitrary_doctypes_rejected(self):
		with self.assertRaises(frappe.PermissionError):
			whatsapp.get_deal_whatsapp_contacts("User", "Administrator")
