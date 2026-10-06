"""The Pendientes entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.pendientes_routes import is_pendientes_path

try:
	import frappe

	from crm.api.pendientes import check_pendientes_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestPendientesPaths(TestCase):
	def test_queue_record_and_legacy_task_paths(self):
		for path in (
			"/crm/pendientes",
			"/crm/pendientes/",
			"/crm/pendientes?segment=today&q=cotizaci%C3%B3n",
			"/crm/pendientes/todo/abc123",
			"/crm/pendientes/crm-task/42?return_to=%2Fcrm%2Fcontactos",
			"/crm/tasks",
			"/crm/tasks/view",
			"/crm/tasks/view/kanban?view=VIEW-1",
		):
			with self.subTest(path=path):
				self.assertTrue(is_pendientes_path(path))

	def test_gate_rejects_sales_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals/X",
			"/crm/pendientes-other",
			"/crm/pendientes/event/1",
			"/crm/pendientes/todo/1/extra",
			"/crm/tasks/1",
			"//evil.invalid/crm/pendientes",
			"https://evil.invalid/crm/pendientes",
			"/crm/pendientes\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_pendientes_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_pendientes_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_pendientes_permission())


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestPendientesEntry(TestCase):
	"""A worker with Pendientes but no Ventas/Contactos reaches a continuation, never Frappe's refusal."""

	def gate(self, path, sales=False, contactos=False, pendientes=True):
		from crm.www import crm as entry

		flags = frappe._dict()
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe.local, "flags", flags),
			patch("crm.api.check_app_permission", return_value=sales),
			patch("crm.api.contactos.check_contactos_permission", return_value=contactos),
			patch("crm.api.pendientes.check_pendientes_permission", return_value=pendientes),
			patch("crm.api.shell._contactos", return_value={"enabled": contactos}),
			patch("crm.api.shell._pendientes", return_value={"enabled": pendientes}),
		):
			try:
				return entry._gate(path), None
			except frappe.Redirect:
				return None, flags.redirect_location

	def test_installed_app_start_opens_pendientes_without_sales(self):
		for path in ("/crm", "/crm/", "/crm?utm_source=pwa"):
			with self.subTest(path=path):
				self.assertEqual(self.gate(path), (None, "/crm/pendientes"))

	def test_installed_app_start_opens_the_first_module_in_contracts_order(self):
		self.assertEqual(self.gate("/crm", contactos=True), (None, "/crm/pendientes"))
		self.assertEqual(self.gate("/crm", contactos=True, pendientes=False), (None, "/crm/contactos"))

	def test_pendientes_queue_gets_its_neutral_boot(self):
		self.assertEqual(self.gate("/crm/pendientes/todo/T-1"), ((True, "pendientes"), None))

	def test_sales_route_offers_recovery_not_a_grant(self):
		self.assertEqual(self.gate("/crm/deals/D-1"), (None, "/crm/not-permitted?intended=%2Fdeals%2FD-1"))

	def test_denied_pendientes_recovers_to_its_own_intent(self):
		self.assertEqual(
			self.gate("/crm/pendientes", pendientes=False),
			(None, "/crm/not-permitted?intended=%2Fpendientes"),
		)

	def test_sales_users_keep_the_sales_root(self):
		self.assertEqual(self.gate("/crm", sales=True), ((False, "contactos"), None))

	def test_without_any_module_frappe_refuses(self):
		with self.assertRaises(frappe.PermissionError):
			self.gate("/crm", pendientes=False)
