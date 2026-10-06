"""The Archivos entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.archivos_routes import is_archivos_path

try:
	import frappe

	from crm.api.archivos import check_archivos_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestArchivosPaths(TestCase):
	def test_queue_path_with_any_query(self):
		for path in (
			"/crm/archivos",
			"/crm/archivos/",
			"/crm/archivos?document=DOC-2026-00001",
			"/crm/archivos?target=Purchase%20Invoice%2FPINV-1&return_to=%2Fdesk%2Fpurchase-invoice%2FPINV-1",
		):
			with self.subTest(path=path):
				self.assertTrue(is_archivos_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/archivos-other",
			"/crm/archivos/extra",
			"//evil.invalid/crm/archivos",
			"https://evil.invalid/crm/archivos",
			"/crm/archivos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_archivos_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_archivos_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_archivos_permission())

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_older_doco_without_bandeja_denies(self):
		import sys

		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm", "doco"]),
			patch.dict(sys.modules, {"doco.docoutils.documents.bandeja": None}),
		):
			self.assertFalse(check_archivos_permission())
