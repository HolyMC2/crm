"""Native connector role lifecycle; fixture writes roll back, authority is real."""

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.model import get_permitted_fields
from frappe.permissions import has_permission, update_permission_property
from frappe.tests import IntegrationTestCase

from crm.api.whatsapp import add_roles, after_app_install
from crm.patches.v1_0.fix_whatsapp_role_read_permissions import LEGACY_RIGHTS, execute

DOCTYPES = ("WhatsApp Message", "WhatsApp Templates", "WhatsApp Settings")
ROLES = ("Sales Manager", "Sales User")


class TestWhatsAppRoleInstall(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		if not {"crm", "frappe_whatsapp"}.issubset(frappe.get_installed_apps()):
			raise RuntimeError("Role lifecycle tests require the actual CRM+WhatsApp app graph")
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No provider requests"))
		)
		self.point = "wa_roles_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.addCleanup(self.restore)
		# Remove only the tested defaults inside this rollback-isolated fixture.
		frappe.db.delete("Custom DocPerm", {"parent": ["in", DOCTYPES], "role": ["in", ROLES]})
		self.clear()
		self.actor = (
			frappe.get_doc(
				{
					"doctype": "User",
					"email": "wa-install-" + uuid4().hex + "@example.invalid",
					"first_name": "Fictional channel reader",
					"send_welcome_email": 0,
					"roles": [{"role": "Sales User"}],
				}
			)
			.insert()
			.name
		)

	def clear(self):
		for doctype in DOCTYPES:
			frappe.clear_cache(doctype=doctype)

	def restore(self):
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point=self.point)
		self.clear()
		if getattr(self, "actor", None):
			frappe.clear_cache(user=self.actor)

	def grants(self):
		return frappe.get_all(
			"Custom DocPerm",
			filters={"parent": ["in", DOCTYPES], "role": ["in", ROLES]},
			fields=["name", "parent", "role", "read", "write", "create"],
		)

	def test_canonical_setup_supplies_native_read_and_field_admission(self):
		self.assertFalse(has_permission("WhatsApp Message", "read", user=self.actor, print_logs=False))
		add_roles()
		self.assertEqual(len(self.grants()), 6)
		self.assertTrue(all(row.write and row.create for row in self.grants()))
		for row in self.grants():
			self.assertEqual(bool(row.read), row.parent == "WhatsApp Message")
		self.assertTrue(has_permission("WhatsApp Message", "read", user=self.actor, print_logs=False))
		self.assertTrue(
			{"message", "from", "reference_doctype", "reference_name"}.issubset(
				get_permitted_fields("WhatsApp Message", user=self.actor, permission_type="read")
			)
		)

	def test_connector_installed_after_crm_uses_same_defaults(self):
		after_app_install("frappe_whatsapp")
		self.assertEqual(len(self.grants()), 6)
		for row in self.grants():
			self.assertEqual(bool(row.read), row.parent == "WhatsApp Message")
		self.assertIn("crm.api.whatsapp.after_app_install", frappe.get_hooks("after_app_install"))

	def test_unrelated_app_install_does_not_create_channel_grants(self):
		after_app_install("erpnext")
		self.assertEqual(self.grants(), [])

	def test_repeated_setup_preserves_explicit_read_revocation(self):
		add_roles()
		update_permission_property("WhatsApp Message", "Sales User", 0, "read", 0)
		before = self.grants()
		add_roles()
		after_app_install("frappe_whatsapp")
		self.assertEqual(self.grants(), before)
		self.assertFalse(has_permission("WhatsApp Message", "read", user=self.actor, print_logs=False))

	def test_upgrade_repairs_only_exact_legacy_defaults(self):
		add_roles()
		for row in self.grants():
			frappe.get_doc("Custom DocPerm", row.name).update(LEGACY_RIGHTS).save()
		# A tenant-customized rule is not the known generated fingerprint.
		update_permission_property("WhatsApp Message", "Sales User", 0, "export", 0)
		execute()
		for row in self.grants():
			self.assertEqual(bool(row.read), (row.parent, row.role) == ("WhatsApp Message", "Sales Manager"))
		before = self.grants()
		execute()
		self.assertEqual(self.grants(), before)

	def test_upgrade_preserves_custom_owner_only_sibling(self):
		add_roles()
		name = frappe.db.get_value(
			"Custom DocPerm",
			{"parent": "WhatsApp Message", "role": "Sales User", "permlevel": 0, "if_owner": 0},
			"name",
		)
		frappe.get_doc("Custom DocPerm", name).update(LEGACY_RIGHTS).save()
		owner_rule = frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": "WhatsApp Message",
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": "Sales User",
				"permlevel": 0,
				"if_owner": 1,
				"write": 1,
				"select": 1,
			}
		).insert()
		before = owner_rule.as_dict()
		execute()
		self.assertEqual(owner_rule.reload().as_dict(), before)
		self.assertEqual(frappe.db.get_value("Custom DocPerm", name, "read"), 1)
