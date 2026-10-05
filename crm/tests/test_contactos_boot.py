"""The neutral entry gate must never unlock sales routes."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.contactos_routes import is_contactos_path, is_contactos_recovery_path

try:
	import frappe

	from crm.api.contactos import check_contactos_permission

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


class TestContactosPaths(TestCase):
	def test_recovery_route_is_only_an_exact_local_screen(self):
		self.assertTrue(is_contactos_recovery_path("/crm/not-permitted?intended=%2Fcontactos"))
		for path in ("/crm/not-permitted/extra", "//evil.invalid/crm/not-permitted", "/crm/deals/X"):
			self.assertFalse(is_contactos_recovery_path(path))
		self.assertFalse(is_contactos_path("/crm/not-permitted"))

	def test_canonical_and_exact_legacy_identity_paths(self):
		for path in (
			"/crm/contactos",
			"/crm/contactos/contact/A%2FB",
			"/crm/contacts",
			"/crm/contacts/view/list?view=Private",
			"/crm/contacts/ABC",
			"/crm/organizations/view/list",
			"/crm/organizations/ACME",
		):
			with self.subTest(path=path):
				self.assertTrue(is_contactos_path(path))

	def test_neutral_gate_rejects_sales_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/leads/X",
			"/crm/deals/X",
			"/crm/contactos-other",
			"/crm/contactos/contact/X/extra",
			"//evil.invalid/crm/contactos",
			"https://evil.invalid/crm/contactos",
			"/crm/contacts\\evil",
		):
			with self.subTest(path=path):
				self.assertFalse(is_contactos_path(path))

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_guest_never_calls_doco(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="Guest")),
			patch.object(frappe, "get_installed_apps") as apps,
		):
			self.assertFalse(check_contactos_permission())
			apps.assert_not_called()

	@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
	def test_missing_doco_denies_without_sales_role_grant(self):
		with (
			patch.object(frappe, "session", frappe._dict(user="buyer@example.invalid")),
			patch.object(frappe, "get_installed_apps", return_value=["crm"]),
		):
			self.assertFalse(check_contactos_permission())
