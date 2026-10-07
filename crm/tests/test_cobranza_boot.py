"""The Cobranza entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.cobranza_routes import is_cobranza_path

try:
	import frappe

	from crm.api.cobranza import check_cobranza_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestCobranzaPaths(TestCase):
	def test_queue_and_customer_paths(self):
		for path in (
			"/crm/cobranza",
			"/crm/cobranza/",
			"/crm/cobranza?segment=promesas&company=Doco&q=ana",
			"/crm/cobranza/cliente/Ana%20P%C3%A9rez?company=Doco",
			"/crm/cobranza/cliente/CUST-0001?done=Payment%20Entry%3AACC-PAY-1&return_to=%2Fposapp%2Fpayments",
		):
			with self.subTest(path=path):
				self.assertTrue(is_cobranza_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/cobranza-otra",
			"/crm/cobranza/factura/SINV-1",
			"/crm/cobranza/cliente/1/extra",
			"//evil.invalid/crm/cobranza",
			"https://evil.invalid/crm/cobranza",
			"/crm/cobranza\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_cobranza_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_cobranza_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="collector@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_cobranza_permission())
