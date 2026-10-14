"""The Manual de la tienda entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.manual_routes import is_manual_path

try:
	import frappe

	from crm.api.manual import check_manual_permission, get_capabilities

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestManualPaths(TestCase):
	def test_list_article_and_editor_paths(self):
		for path in (
			"/crm/manual",
			"/crm/manual/",
			"/crm/manual?q=garant&categoria=Caja&vista=borradores",
			"/crm/manual?lugar=garantias.nueva&return_to=%2Fcrm%2Fgarantias",
			"/crm/manual/nuevo",
			"/crm/manual/nuevo?lugar=caja",
			"/crm/manual/a1b2c3d4e5",
			"/crm/manual/a1b2c3d4e5/editar",
			"/crm/manual/a1b2c3d4e5?return_to=%2Fcrm%2Fhoy&return_label=Hoy",
		):
			with self.subTest(path=path):
				self.assertTrue(is_manual_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/manual-otro",
			"/crm/manual/a1b2/editar/extra",
			"/crm/manual/a1b2/borrar",
			"//evil.invalid/crm/manual",
			"https://evil.invalid/crm/manual",
			"/crm/manual\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_manual_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_manual_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies_with_a_reason(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_manual_permission())
			answer = get_capabilities()
		self.assertFalse(answer["enabled"])
		self.assertTrue(answer["reason"])
		self.assertEqual(answer["capabilities"], {})
