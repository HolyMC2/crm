"""Deal order context degrades when a companion adapter is not deployed yet."""

from unittest.mock import patch

from frappe.tests import IntegrationTestCase

from crm.api import commerce


def _missing(name, *args, **kwargs):
	raise ModuleNotFoundError(f"No module named '{name}'", name=name)


class TestCommerceOptionalAdapters(IntegrationTestCase):
	def test_missing_checkout_adapter_reports_unavailable_context(self):
		apps = ["frappe", "erpnext", "doco", "crm"]
		with (
			patch.object(commerce.frappe, "get_installed_apps", return_value=apps),
			patch.object(commerce, "import_module", side_effect=_missing),
		):
			self.assertFalse(commerce._available())
			self.assertIsNone(commerce._payments_modules())
			context = commerce.get_context(deal="any-deal")
		self.assertEqual(context["available"], False)
		self.assertEqual(context["reason_code"], "erp_checkout_unavailable")
		self.assertEqual(context["orders"], [])

	def test_missing_payment_adapter_is_not_installed(self):
		apps = ["frappe", "erpnext", "doco", "mercadopago_connector", "crm"]
		with (
			patch.object(commerce.frappe, "get_installed_apps", return_value=apps),
			patch.object(commerce, "import_module", side_effect=_missing),
		):
			self.assertIsNone(commerce._payments_modules())
			with self.assertRaises(commerce.frappe.ValidationError):
				commerce._payments()
