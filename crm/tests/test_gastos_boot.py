"""The Gastos entry gate must never unlock sales routes."""

import sys
from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.gastos_routes import is_gastos_path

try:
	import frappe

	from crm.api.gastos import can_create_bill, check_gastos_permission, get_capabilities

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
			"/crm/gastos/captura/CAP-2026-00001",
			"/crm/gastos/factura/ACC-PINV-2026-00001?list=%2Fgastos%3Fchip%3Dvencidas",
			"/crm/gastos?segment=empleados&chip=por-aprobar",
			"/crm/gastos/gasto/HR-EXP-2026-00001",
			"/crm/gastos/gasto/HR-EXP-2026-00001?return_to=%2Fcrm%2Fpendientes",
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
			"/crm/gastos/gasto/1/extra",
			"/crm/gastos/gasto/",
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
	def test_create_is_the_purchase_invoice_permission_of_a_bill_reader(self):
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Gastos (doco) is not installed")
		try:
			import doco.workspaces.payables  # the patch target must be loaded
		except ImportError:
			self.skipTest("This doco has no Gastos service")
		reader = {"enabled": True, "capabilities": {"read": True, "submit": False, "pay": False}}
		with (
			patch("doco.workspaces.payables.bootstrap", return_value=dict(reader)),
			patch("crm.api.gastos.can_create_bill", return_value=True),
		):
			self.assertTrue(get_capabilities()["capabilities"]["create"])
		with (
			patch("doco.workspaces.payables.bootstrap", return_value=dict(reader)),
			patch("crm.api.gastos.can_create_bill", return_value=False),
		):
			self.assertFalse(get_capabilities()["capabilities"]["create"])
		blind = {"enabled": True, "capabilities": {"read": False}, "claims": {"enabled": True, "file": True}}
		with (
			patch("doco.workspaces.payables.bootstrap", return_value=blind),
			patch("crm.api.gastos.can_create_bill", return_value=True),
		):
			self.assertFalse(get_capabilities()["capabilities"]["create"])
		refused = {"enabled": False, "reason": "no"}
		with patch("doco.workspaces.payables.bootstrap", return_value=refused):
			self.assertNotIn("capabilities", get_capabilities())

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_can_create_bill_asks_frappe_for_purchase_invoice_create(self):
		with patch.object(frappe, "has_permission", return_value=True) as has_permission:
			self.assertTrue(can_create_bill())
		has_permission.assert_called_once_with("Purchase Invoice", "create")

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_older_doco_without_payables_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="payer@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm", "doco"]),
			patch.dict(sys.modules, {"doco.workspaces.payables": None}),
		):
			self.assertFalse(check_gastos_permission())
			self.assertFalse(get_capabilities()["enabled"])
