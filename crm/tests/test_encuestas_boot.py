"""The Encuestas entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.encuestas_routes import is_encuestas_path

try:
	import frappe

	from crm.api.encuestas import check_encuestas_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestEncuestasPaths(TestCase):
	def test_queue_and_record_paths(self):
		for path in (
			"/crm/encuestas",
			"/crm/encuestas/",
			"/crm/encuestas?view=todas&bucket=detractor&periodo=90&q=ana",
			"/crm/encuestas?view=seguimiento&mine=1",
			"/crm/encuestas/QA-FB-00001",
			"/crm/encuestas/QA-FB-00001?return_to=%2Fcrm%2Fhoy&return_label=Hoy",
		):
			with self.subTest(path=path):
				self.assertTrue(is_encuestas_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/encuestas-otra",
			"/crm/encuestas/QA-FB-1/extra",
			"//evil.invalid/crm/encuestas",
			"https://evil.invalid/crm/encuestas",
			"/crm/encuestas\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_encuestas_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_encuestas_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_encuestas_permission())
