"""«Prospectos» capture list (CRM-S3.4): one list for open leads and inquiries."""

from unittest import TestCase
from unittest.mock import patch

import frappe

from crm.api import prospects


class SourceChipTests(TestCase):
	def test_lead_sources_and_inquiry_types_share_one_vocabulary(self):
		for raw, key in (
			("Storefront", "tienda"),
			("Storefront Newsletter", "tienda"),
			("Web Form", "web"),
			("Website", "web"),
			("Walk In", "mostrador"),
			("Mostrador", "mostrador"),
			("Facebook", "facebook"),
			("Instagram", "instagram"),
			("WhatsApp", "whatsapp"),
			("Email", "correo"),
			("Cold Calling", "llamada"),
			("Manual", "manual"),
			("Other", "otro"),
			(None, "otro"),
			("", "otro"),
		):
			with self.subTest(raw=raw):
				self.assertEqual(prospects.source_key(raw), key)
				self.assertIn(key, prospects.SOURCE_LABELS)

	def test_invalid_arguments_are_refused_before_any_query(self):
		with patch("crm.api.check_app_permission", return_value=True):
			for kwargs in ({"kind": "deal"}, {"source": "tiktok"}, {"page_length": 0}, {"start": -1}):
				with self.subTest(kwargs=kwargs), self.assertRaises(frappe.ValidationError):
					prospects.list_prospects(**kwargs)

	def test_without_ventas_access_the_list_is_refused(self):
		with (
			patch("crm.api.check_app_permission", return_value=False),
			self.assertRaises(frappe.PermissionError),
		):
			prospects.list_prospects()
