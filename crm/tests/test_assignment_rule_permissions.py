"""Native actor/document scope for CRM assignment settings (no mocked permissions)."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.assignment_rule import (
	duplicate_assignment_rule,
	get_assignment_rule_access,
	get_assignment_rules_list,
)


class TestAssignmentRulePermissions(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.key = frappe.generate_hash(length=10)
		self.manager = self.user("manager", "System Manager")
		self.seller = self.user("seller", "Sales User")
		self.lead_rule = self.rule("CRM Lead")
		self.deal_rule = self.rule("CRM Deal")
		self.other_rule = self.rule("User")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.clear_cache(doctype="Assignment Rule")
		super().tearDown()

	def user(self, label, role):
		return (
			frappe.get_doc(
				{
					"doctype": "User",
					"email": f"assignment-{label}-{self.key}@example.invalid",
					"first_name": label,
					"send_welcome_email": 0,
					"roles": [{"role": role}],
				}
			)
			.insert()
			.name
		)

	def rule(self, doctype):
		return frappe.get_doc(
			{
				"doctype": "Assignment Rule",
				"description": "Native permission test; disabled",
				"document_type": doctype,
				"disabled": 1,
				"rule": "Round Robin",
				"assign_condition": "name != ''",
				"priority": 1,
				"users": [{"user": self.manager}],
				"assignment_days": [{"day": "Monday"}],
			}
		).insert(set_name=f"CRM settings {doctype} {self.key}")

	def test_seller_cannot_list_or_discover_configuration_capabilities(self):
		frappe.set_user(self.seller)
		with self.assertRaises(frappe.PermissionError):
			get_assignment_rules_list()
		with self.assertRaises(frappe.PermissionError):
			get_assignment_rule_access()

	def test_manager_role_does_not_replace_native_doctype_read_permission(self):
		# A fresh Frappe Assignment Rule grants System Manager, not Sales Manager.
		# No permission table is changed or mocked to obtain this refusal.
		limited = self.user("limited-manager", "Sales Manager")
		frappe.set_user(limited)
		self.assertFalse(frappe.has_permission("Assignment Rule", "read"))
		with self.assertRaises(frappe.PermissionError):
			get_assignment_rules_list()
		with self.assertRaises(frappe.PermissionError):
			duplicate_assignment_rule(self.lead_rule.name, f"Denied manager {self.key}")

	def test_seller_cannot_copy_a_rule_by_known_name(self):
		name = f"Denied {self.key}"
		frappe.set_user(self.seller)
		with self.assertRaises(frappe.PermissionError):
			duplicate_assignment_rule(self.lead_rule.name, name)
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("Assignment Rule", name))

	def test_native_manager_lists_only_crm_rule_types_with_capabilities(self):
		frappe.set_user(self.manager)
		rows = {row["name"]: row for row in get_assignment_rules_list()}
		self.assertIn(self.lead_rule.name, rows)
		self.assertIn(self.deal_rule.name, rows)
		self.assertNotIn(self.other_rule.name, rows)
		self.assertTrue(all(row["document_type"] in ("CRM Lead", "CRM Deal") for row in rows.values()))
		self.assertTrue(rows[self.lead_rule.name]["users_exists"])
		self.assertTrue(rows[self.lead_rule.name]["can_write"])
		self.assertTrue(get_assignment_rule_access()["can_create"])

	def test_native_copy_preserves_source_and_creates_distinct_child_rows(self):
		before = self.lead_rule.reload().as_dict()
		frappe.set_user(self.manager)
		result = duplicate_assignment_rule(self.lead_rule.name, f"Copied {self.key}")
		self.assertNotEqual(result.name, self.lead_rule.name)
		self.assertEqual(result.owner, self.manager)
		self.assertEqual(result.document_type, "CRM Lead")
		self.assertEqual(result.users[0].user, self.manager)
		self.assertNotEqual(result.users[0].name, before.users[0].name)
		self.assertEqual(result.users[0].parent, result.name)
		self.assertEqual(self.lead_rule.reload().as_dict(), before)

	def test_manager_cannot_use_crm_copy_endpoint_for_another_doctype(self):
		frappe.set_user(self.manager)
		with self.assertRaises(frappe.PermissionError):
			duplicate_assignment_rule(self.other_rule.name, f"Wrong scope {self.key}")

	def test_blank_name_does_not_insert_a_rule(self):
		frappe.set_user(self.manager)
		before = frappe.db.count("Assignment Rule")
		with self.assertRaises(frappe.ValidationError):
			duplicate_assignment_rule(self.lead_rule.name, " ")
		self.assertEqual(frappe.db.count("Assignment Rule"), before)
