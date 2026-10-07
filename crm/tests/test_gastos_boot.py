"""The Gastos entry gate must never unlock sales routes."""

import sys
from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.gastos_routes import is_gastos_path

try:
	import frappe

	from crm.api.gastos import check_gastos_permission, get_capabilities

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestGastosPaths(TestCase):
	def test_queue_and_record_paths(self):
		for path in (
			"/crm/gastos",
			"/crm/gastos/",
			"/crm/gastos?segment=por-registrar&q=renta",
			"/crm/gastos?po=PUR-ORD-2026-00001",
			"/crm/gastos/factura/ACC-PINV-2026-00001",
			"/crm/gastos/factura/ACC-PINV-2026-00001?list=%2Fgastos%3Fchip%3Dvencidas",
		):
			with self.subTest(path=path):
				self.assertTrue(is_gastos_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/gastos-otra",
			"/crm/gastos/pago/ACC-PAY-1",
			"/crm/gastos/factura/1/extra",
			"//evil.invalid/crm/gastos",
			"https://evil.invalid/crm/gastos",
			"/crm/gastos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_gastos_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_gastos_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies_with_a_reason(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="payer@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_gastos_permission())
			answer = get_capabilities()
		self.assertFalse(answer["enabled"])
		self.assertTrue(answer["reason"])

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_older_doco_without_payables_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="payer@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm", "doco"]),
			patch.dict(sys.modules, {"doco.workspaces.payables": None}),
		):
			self.assertFalse(check_gastos_permission())
			self.assertFalse(get_capabilities()["enabled"])
