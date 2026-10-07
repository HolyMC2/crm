"""The Garantías entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.garantias_routes import is_garantias_path

try:
	import frappe

	from crm.api.garantias import check_garantias_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestGarantiasPaths(TestCase):
	def test_queue_record_and_new_paths(self):
		for path in (
			"/crm/garantias",
			"/crm/garantias/",
			"/crm/garantias?segment=en-revision&mine=1&q=pantalla",
			"/crm/garantias?create=1&against_doctype=Repair%20Order&against_name=RO-1",
			"/crm/garantias/SER-WRN-2026-00001",
			"/crm/garantias/SER-WRN-2026-00001?return_to=%2Ftaller%2Forders%2FRO-1",
		):
			with self.subTest(path=path):
				self.assertTrue(is_garantias_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/garantias-otra",
			"/crm/garantias/SER-WRN-1/extra",
			"//evil.invalid/crm/garantias",
			"https://evil.invalid/crm/garantias",
			"/crm/garantias\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_garantias_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_garantias_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_garantias_permission())
