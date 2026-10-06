"""The Compras entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.compras_routes import is_compras_path

try:
	import frappe

	from crm.api.compras import check_compras_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestComprasPaths(TestCase):
	def test_queue_record_and_new_paths(self):
		for path in (
			"/crm/compras",
			"/crm/compras/",
			"/crm/compras?segment=por-recibir&q=caja",
			"/crm/compras/nueva?return_to=%2Fposapp%2Fpos",
			"/crm/compras/orden/PUR-ORD-2026-00001",
			"/crm/compras/solicitud/MAT-MR-2026-00003?return_to=%2Fcrm%2Fpendientes",
		):
			with self.subTest(path=path):
				self.assertTrue(is_compras_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/compras-otra",
			"/crm/compras/recepcion/PR-1",
			"/crm/compras/orden/1/extra",
			"//evil.invalid/crm/compras",
			"https://evil.invalid/crm/compras",
			"/crm/compras\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_compras_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_compras_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="buyer@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_compras_permission())
