"""Hoy: the shell's landing page, its gate, its one batched read and where /crm opens."""

import sys
from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.hoy_routes import is_hoy_path

try:
	import frappe

	from crm.api import hoy, shell

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestHoyPath(TestCase):
	def test_gate_accepts_hoy_only(self):
		for path in ("/crm/hoy", "/crm/hoy/", "/crm/hoy?source=pwa"):
			with self.subTest(path=path):
				self.assertTrue(is_hoy_path(path))
		for path in (
			"/crm",
			"/crm/hoyx",
			"/crm/hoy/extra",
			"/crm/deals/hoy",
			"https://evil.example/crm/hoy",
			"//evil.example/crm/hoy",
			"/crm\\hoy",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_hoy_path(path))


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestHoyBoot(TestCase):
	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.defaults.clear_user_default(hoy.LANDING_DEFAULT)
		frappe.set_user(self.previous)

	def test_provider_enables_hoy_for_staff_and_it_leads_the_modules(self):
		data = shell.boot()
		self.assertEqual(
			data["modules"]["hoy"],
			{"key": "hoy", "enabled": True, "reason": None, "capabilities": {"read": True}},
		)
		self.assertEqual(shell.first_module(), "hoy")

	def test_refused_hoy_carries_its_reason_and_leaves_the_others(self):
		with patch("crm.avisos.stream.is_enabled", return_value=False):
			data = shell.boot()
		self.assertFalse(data["modules"]["hoy"]["enabled"])
		self.assertTrue(data["modules"]["hoy"]["reason"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_page_returns_every_section_and_avisos_top_three(self):
		data = hoy.page()
		for key in ("pendientes", "agenda", "continuar", "avisos"):
			with self.subTest(section=key):
				self.assertIn("available", data[key])
		self.assertLessEqual(len(data["avisos"].get("groups") or []), hoy.AVISOS_LIMIT)
		self.assertEqual(data["landing"], "")

	def test_older_doco_turns_its_sections_off_not_the_page(self):
		with patch.dict(sys.modules, {"doco.workspaces.hoy": None}):
			data = hoy.page()
		for key in ("pendientes", "agenda", "continuar"):
			with self.subTest(section=key):
				self.assertFalse(data[key]["available"])
		self.assertTrue(data["avisos"]["available"])

	def test_failing_avisos_costs_only_its_section(self):
		with patch("crm.avisos.stream.stream", side_effect=RuntimeError("boom")):
			data = hoy.page()
		self.assertEqual(data["avisos"], {"available": False, "failed": True})
		self.assertIn("pendientes", data)

	def test_guest_and_website_users_cannot_read_hoy(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			hoy.page()
		frappe.set_user("Administrator")
		with patch("crm.avisos.stream.is_enabled", return_value=False):
			with self.assertRaises(frappe.PermissionError):
				hoy.page()

	def test_landing_choice_keeps_only_sections_the_worker_has(self):
		self.assertEqual(hoy.save_landing("ventas"), {"landing": "ventas"})
		self.assertEqual(hoy.saved_landing(), "ventas")
		with self.assertRaises(frappe.ValidationError):
			hoy.save_landing("bogus")
		self.assertEqual(hoy.save_landing(""), {"landing": ""})
		self.assertEqual(hoy.saved_landing(), "")

	def test_a_revoked_choice_falls_back_to_the_policy(self):
		hoy.save_landing("ventas")
		with patch("crm.api.check_app_permission", return_value=False):
			self.assertEqual(hoy.saved_landing(), "")
			with patch.object(hoy, "dedicated_app", return_value=None):
				self.assertEqual(hoy.root_landing(), "/crm/hoy")

	def test_root_opens_the_choice_then_the_puesto_app_then_hoy(self):
		with patch.object(hoy, "dedicated_app", return_value=None):
			self.assertEqual(hoy.root_landing(), "/crm/hoy")
		with patch.object(hoy, "dedicated_app", return_value="/posapp"):
			self.assertEqual(hoy.root_landing(), "/posapp")
			hoy.save_landing("hoy")
			self.assertEqual(hoy.root_landing(), "/crm/hoy")
			hoy.save_landing("ventas")
			self.assertIsNone(hoy.root_landing())


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestHoyEntry(TestCase):
	"""`/crm` opens Hoy (or the worker's choice); `/crm/hoy` gets its neutral boot."""

	def gate(self, path, landing="/crm/hoy", hoy_ok=True, sales=False):
		from crm.www import crm as entry

		flags = frappe._dict()
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe.local, "flags", flags),
			patch("crm.api.check_app_permission", return_value=sales),
			patch("crm.api.contactos.check_contactos_permission", return_value=False),
			patch("crm.api.hoy.check_hoy_permission", return_value=hoy_ok),
			patch("crm.api.hoy.root_landing", return_value=landing),
			patch("crm.api.shell.first_module", return_value="hoy" if hoy_ok else None),
		):
			try:
				return entry._gate(path), None
			except frappe.Redirect:
				return None, flags.redirect_location

	def test_installed_app_start_lands_on_hoy(self):
		for path in ("/crm", "/crm/", "/crm?source=pwa"):
			with self.subTest(path=path):
				self.assertEqual(self.gate(path), (None, "/crm/hoy"))

	def test_sales_users_land_on_hoy_too(self):
		self.assertEqual(self.gate("/crm", sales=True), (None, "/crm/hoy"))

	def test_puesto_app_and_ventas_choice(self):
		self.assertEqual(self.gate("/crm", landing="/posapp"), (None, "/posapp"))
		self.assertEqual(self.gate("/crm", landing=None, sales=True), ((False, "contactos"), None))

	def test_hoy_gets_its_neutral_boot(self):
		self.assertEqual(self.gate("/crm/hoy"), ((True, "hoy"), None))

	def test_refused_hoy_recovers_instead_of_a_dead_end(self):
		self.assertEqual(
			self.gate("/crm/hoy", hoy_ok=False, sales=True),
			(None, "/crm/not-permitted?intended=%2Fhoy"),
		)
