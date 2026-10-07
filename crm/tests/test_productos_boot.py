"""The Productos entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.productos_routes import is_productos_path

try:
	import frappe

	from crm.api.productos import check_productos_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestProductosPaths(TestCase):
	def test_list_and_record_paths(self):
		for path in (
			"/crm/productos",
			"/crm/productos/",
			"/crm/productos?vista=sin-precio&q=cable&tienda=Tienda%20Centro",
			"/crm/productos/SKU-0001",
			"/crm/productos/A%20B?accion=precio&lista=Venta&return_to=%2Fapp%2Fmuelle-inventario",
		):
			with self.subTest(path=path):
				self.assertTrue(is_productos_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/productos-otra",
			"/crm/productos/SKU/extra",
			"//evil.invalid/crm/productos",
			"https://evil.invalid/crm/productos",
			"/crm/productos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_productos_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_productos_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="almacen@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_productos_permission())
