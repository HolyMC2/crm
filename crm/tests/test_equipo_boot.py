"""The Equipo entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.equipo_routes import is_equipo_path

try:
	import frappe

	from crm.api.equipo import check_equipo_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestEquipoPaths(TestCase):
	def test_queue_person_and_vacation_paths(self):
		for path in (
			"/crm/equipo",
			"/crm/equipo/",
			"/crm/equipo?segment=por-revisar",
			"/crm/equipo/persona/HR-EMP-00001",
			"/crm/equipo/persona/HR-EMP-00001?request=HR-LAP-2026-00001&list=%2Fequipo",
			"/crm/equipo/vacaciones",
			"/crm/equipo/vacaciones?employee=HR-EMP-00001",
		):
			with self.subTest(path=path):
				self.assertTrue(is_equipo_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/equipo-otro",
			"/crm/equipo/persona",
			"/crm/equipo/persona/X/extra",
			"/crm/equipo/HR-EMP-1",
			"//evil.invalid/crm/equipo",
			"https://evil.invalid/crm/equipo",
			"/crm/equipo\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_equipo_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_equipo_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_equipo_permission())
