"""Own module inventory, native role/module denial, and unavailable metadata."""

from pathlib import Path
from unittest import TestCase
from unittest.mock import MagicMock, patch

import frappe

from crm import api


class TestAppPermission(TestCase):
	def setUp(self):
		self.enterContext(patch.object(frappe, "session", frappe._dict(user="seller@example.invalid")))
		self.roles = self.enterContext(patch.object(frappe, "get_roles", return_value=["Sales User"]))
		self.enterContext(patch.object(api, "is_frappe_version", return_value=True))
		self.enterContext(
			patch.object(frappe, "get_installed_apps", return_value=["crm", "broken_other_app"])
		)
		self.inventory = self.enterContext(
			patch.object(frappe, "get_module_list", return_value=["FCRM", "Lead Syncing"])
		)
		self.modules = self.enterContext(
			patch.object(frappe, "get_all", return_value=["FCRM", "Lead Syncing"])
		)
		self.user = MagicMock()
		self.user.get_blocked_modules.return_value = []
		self.users = self.enterContext(patch.object(frappe, "get_cached_doc", return_value=self.user))
		self.cache = MagicMock()
		self.cache.get_value.return_value = None
		self.enterContext(patch.object(frappe, "cache", self.cache))
		self.incident = self.enterContext(patch.object(frappe, "log_error"))

	def test_valid_metadata_and_sales_role_grant_access_despite_unrelated_app(self):
		self.assertTrue(api.check_app_permission())
		self.modules.assert_called_once_with("Module Def", filters={"app_name": "crm"}, pluck="module_name")
		self.incident.assert_not_called()

	def test_missing_role_denies_before_inventory_reads(self):
		self.roles.return_value = ["Employee"]
		self.assertFalse(api.check_app_permission())
		self.modules.assert_not_called()

	def test_guest_denied_even_with_a_sales_role(self):
		frappe.session.user = "Guest"
		self.assertFalse(api.check_app_permission())

	def test_blocked_user_module_denies_access(self):
		self.user.get_blocked_modules.return_value = ["FCRM"]
		self.assertFalse(api.check_app_permission())

	def test_globally_blocked_module_denies_access(self):
		admin = MagicMock()
		admin.get_blocked_modules.return_value = ["FCRM"]
		self.users.side_effect = [admin, self.user]
		self.assertFalse(api.check_app_permission())

	def test_none_inventory_fails_closed_and_logs_once(self):
		self.modules.return_value = None
		self.cache.get_value.side_effect = [None, 1]
		self.assertFalse(api.check_app_permission())
		self.assertFalse(api.check_app_permission())
		self.assertEqual(self.incident.call_count, 1)

	def test_incomplete_module_metadata_denies_and_emits_health_incident(self):
		self.modules.return_value = ["FCRM"]
		self.assertFalse(api.check_app_permission())
		self.incident.assert_called_once()

	def test_metadata_read_error_fails_closed(self):
		self.inventory.side_effect = OSError("modules.txt unavailable")
		self.assertFalse(api.check_app_permission())

	def test_administrator_keeps_native_bypass(self):
		frappe.session.user = "Administrator"
		self.assertTrue(api.check_app_permission())
		self.modules.assert_not_called()

	def test_packaged_module_inventory_has_importable_directories(self):
		root = Path(__file__).resolve().parents[1]
		modules = (root / "modules.txt").read_text().splitlines()
		self.assertIn("FCRM", modules)
		for module in modules:
			if module.strip():
				self.assertTrue((root / frappe.scrub(module) / "__init__.py").is_file(), module)


class TestNativeAppPermission(TestCase):
	def setUp(self):
		if "crm" not in frappe.get_installed_apps():
			self.skipTest("requires installed CRM on the disposable site")
		frappe.set_user("Administrator")
		self.savepoint = "crm_permission_" + frappe.generate_hash(length=8)
		frappe.db.savepoint(self.savepoint)

	def tearDown(self):
		frappe.set_user("Administrator")
		if hasattr(self, "savepoint"):
			frappe.db.rollback(save_point=self.savepoint)
			frappe.clear_cache()

	def _user(self, *, sales=True, blocked=False):
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": f"crm-permission-{frappe.generate_hash(length=10)}@example.invalid",
				"first_name": "Permission regression",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}] if sales else [],
				"block_modules": [{"module": "FCRM"}] if blocked else [],
			}
		).insert(ignore_permissions=True)
		frappe.set_user(doc.name)

	def test_real_sales_user_with_complete_metadata_is_allowed(self):
		self._user()
		self.assertTrue(api.check_app_permission())

	def test_real_user_without_sales_roles_is_denied(self):
		self._user(sales=False)
		self.assertFalse(api.check_app_permission())

	def test_real_sales_user_with_blocked_crm_module_is_denied(self):
		self._user(blocked=True)
		self.assertFalse(api.check_app_permission())
