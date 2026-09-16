import unittest
from unittest.mock import patch

import frappe

from crm.api import whatsapp, whatsapp_contacts


class TestOptionalWhatsApp(unittest.TestCase):
	def test_numbers_do_not_depend_on_the_retired_extension(self):
		numbers = [{"phone": "5215550198765", "peer_key": "5550198765"}]
		with (
			patch.object(whatsapp, "validate_access") as access,
			patch.object(whatsapp_contacts, "list_numbers", return_value=numbers) as listed,
			patch.object(frappe, "get_installed_apps", return_value=["crm", "frappe_whatsapp"]),
		):
			self.assertEqual(whatsapp.get_deal_whatsapp_contacts("CRM Deal", "D1"), numbers)
			access.assert_called_once_with("CRM Deal", "D1")
			listed.assert_called_once_with("CRM Deal", "D1")

	def test_no_permission_is_rejected_before_any_number_lookup(self):
		with (
			patch.object(whatsapp, "validate_access", side_effect=frappe.PermissionError),
			patch.object(whatsapp_contacts, "list_numbers") as listed,
		):
			with self.assertRaises(frappe.PermissionError):
				whatsapp.get_deal_whatsapp_contacts("CRM Deal", "D1")
			listed.assert_not_called()

	def test_arbitrary_doctypes_rejected(self):
		with self.assertRaises(frappe.PermissionError):
			whatsapp.get_deal_whatsapp_contacts("User", "Administrator")
