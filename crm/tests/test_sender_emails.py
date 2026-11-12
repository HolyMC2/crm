"""The composer's «From» reads only the signed-in user's own sender rows."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.session import get_sender_emails


class TestSenderEmails(IntegrationTestCase):
	def setUp(self):
		self.previous_user = frappe.session.user
		self.point = "sender_emails_" + frappe.generate_hash(length=8)
		frappe.db.savepoint(self.point)
		self.addCleanup(self.restore)

	def restore(self):
		frappe.set_user(self.previous_user)
		frappe.db.rollback(save_point=self.point)

	def row(self, parent, account, email, idx):
		frappe.get_doc(
			{
				"doctype": "User Email",
				"parent": parent,
				"parenttype": "User",
				"parentfield": "user_emails",
				"email_account": account,
				"email_id": email,
				"idx": idx,
			}
		).db_insert()

	def test_own_rows_in_their_order_and_nothing_else(self):
		frappe.set_user("Administrator")
		self.row("Administrator", "Ventas", "ventas@sender.example", 2)
		self.row("Administrator", "Taller", "taller@sender.example", 1)
		self.row("Guest", "Otra", "otra@sender.example", 1)

		rows = [r for r in get_sender_emails() if r.email_id.endswith("@sender.example")]

		self.assertEqual(
			[(r.email_account, r.email_id) for r in rows],
			[("Taller", "taller@sender.example"), ("Ventas", "ventas@sender.example")],
		)
		self.assertEqual(set(rows[0]), {"email_account", "email_id"})
