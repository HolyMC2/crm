"""CRM's automatic owner assignments are marked; a person's assignment is not."""

from uuid import uuid4

import frappe
from frappe.desk.form.assign_to import add as assign_add
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, nowdate

from crm.owner_assignment import FIELD, backfill

OWNER = "owner-assignment-owner@example.test"
HELPER = "owner-assignment-helper@example.test"


def _user(email):
	if not frappe.db.exists("User", email):
		user = frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0}
		)
		user.flags.ignore_permissions = True
		user.insert()
	frappe.get_doc("User", email).add_roles("Sales User")


class OwnerAssignmentTestCase(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		_user(OWNER)
		_user(HELPER)

	def tearDown(self):
		frappe.db.rollback()
		super().tearDown()

	def deal(self, owner=OWNER):
		status = frappe.db.get_value("CRM Deal Status", {"type": "Open"}, "name") or frappe.db.get_value(
			"CRM Deal Status", {}, "name"
		)
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": status,
				"deal_owner": owner,
				"expected_deal_value": 100,
				"expected_closure_date": add_to_date(nowdate(), days=30),
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		return deal.name

	def todo(self, deal, user):
		return frappe.db.get_value(
			"ToDo", {"reference_type": "CRM Deal", "reference_name": deal, "allocated_to": user}
		)

	def test_owner_assignment_is_marked_and_manual_assignment_is_not(self):
		deal = self.deal()
		self.assertEqual(frappe.db.get_value("ToDo", self.todo(deal, OWNER), FIELD), 1)
		assign_add({"assign_to": [HELPER], "doctype": "CRM Deal", "name": deal, "description": "Visitar"})
		self.assertEqual(frappe.db.get_value("ToDo", self.todo(deal, HELPER), FIELD), 0)
		self.assertFalse(frappe.flags.crm_owner_assignment)

	def test_legacy_backfill_marks_only_default_owner_rows(self):
		deal = self.deal()
		automatic = self.todo(deal, OWNER)
		# A row from before the marker existed.
		frappe.db.set_value("ToDo", automatic, FIELD, 0, update_modified=False)
		personal = frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": f"Llamar al dueño {uuid4().hex[:6]}",
				"allocated_to": OWNER,
				"reference_type": "CRM Deal",
				"reference_name": deal,
			}
		).insert(ignore_permissions=True)
		other = frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": f"Assignment for CRM Deal {deal}",
				"allocated_to": HELPER,
				"reference_type": "CRM Deal",
				"reference_name": deal,
			}
		).insert(ignore_permissions=True)
		# Inserting the helper row made CRM move ownership; restore the original owner.
		frappe.db.set_value("CRM Deal", deal, "deal_owner", OWNER, update_modified=False)
		backfill()
		self.assertEqual(frappe.db.get_value("ToDo", automatic, FIELD), 1)
		self.assertEqual(frappe.db.get_value("ToDo", personal.name, FIELD), 0)
		self.assertEqual(frappe.db.get_value("ToDo", other.name, FIELD), 0)
