"""Native connector role lifecycle; fixture writes roll back, authority is real."""

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.model import get_permitted_fields
from frappe.permissions import has_permission, update_permission_property
from frappe.tests import IntegrationTestCase

from crm.api.whatsapp import add_roles, after_app_install

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
		# Native Custom DocPerm defaults read to 1 even when add_permission is
		# called with ptype="write". Do not treat a later read=0 as legacy damage.
		self.assertEqual(int(frappe.get_meta("Custom DocPerm").get_field("read").default), 1)
		add_roles()
		self.assertEqual(len(self.grants()), 6)
		self.assertTrue(all(row.write and row.create for row in self.grants()))
		for row in self.grants():
			self.assertTrue(row.read)
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
			self.assertTrue(row.read)
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

	def test_canonical_setup_preserves_all_existing_write_only_rules(self):
		add_roles()
		for row in self.grants():
			frappe.get_doc("Custom DocPerm", row.name).update({"read": 0}).save()
		before = {row.name: frappe.get_doc("Custom DocPerm", row.name).as_dict() for row in self.grants()}
		add_roles()
		after_app_install("frappe_whatsapp")
		self.assertEqual(
			{row.name: frappe.get_doc("Custom DocPerm", row.name).as_dict() for row in self.grants()}, before
		)
		self.assertFalse(has_permission("WhatsApp Message", "read", user=self.actor, print_logs=False))

	def test_canonical_setup_does_not_expand_an_owner_only_custom_rule(self):
		owner_rule = frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": "WhatsApp Message",
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": "Sales User",
				"permlevel": 0,
				"if_owner": 1,
				"read": 0,
				"write": 1,
				"select": 1,
			}
		).insert()
		before = owner_rule.as_dict()
		add_roles()
		after_app_install("frappe_whatsapp")
		self.assertEqual(owner_rule.reload().as_dict(), before)
		self.assertFalse(
			frappe.db.exists(
				"Custom DocPerm",
				{"parent": "WhatsApp Message", "role": "Sales User", "permlevel": 0, "if_owner": 0},
			)
		)
