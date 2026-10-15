# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Next-step reminders reach the assignee; overdue ones reach their manager, once."""

import datetime
from unittest.mock import patch

import frappe
from frappe.utils import add_days, getdate, now_datetime, nowdate

from crm.pipeline.services import reminders
from crm.tests.test_deals_list_unification import DealsListTestCase, terminal_status


class TestNextStepReminders(DealsListTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		for deal in self.deals:
			frappe.db.delete("CRM Notification", {"reference_doctype": "CRM Deal", "reference_name": deal})
			frappe.db.delete("CRM Task", {"reference_doctype": "CRM Deal", "reference_docname": deal})
		super().tearDown()

	def step(self, due, *, user=None, status=None, title="Llamar para confirmar"):
		deal = self.make_deal(status=status)
		task = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": title,
				"status": "Todo",
				"activity_type": "Call",
				"assigned_to": user or "Administrator",
				"due_date": due,
				"reference_doctype": "CRM Deal",
				"reference_docname": deal,
			}
		)
		task.insert(ignore_permissions=True)
		return deal, str(task.name)

	def avisos(self, deal, user=None):
		filters = {"reference_doctype": "CRM Deal", "reference_name": deal, "type": "Task"}
		if user:
			filters["to_user"] = user
		return frappe.get_all(
			"CRM Notification",
			filters=filters,
			fields=["to_user", "notification_text", "notification_type_doc", "reference_name"],
		)

	def test_a_step_due_soon_reminds_its_assignee_once(self):
		user = self.make_user("Sales User")
		deal, task = self.step(now_datetime() + datetime.timedelta(minutes=5), user=user)
		later, _ = self.step(now_datetime() + datetime.timedelta(hours=3), user=user)
		reminders.remind_due()
		reminders.remind_due()
		sent = self.avisos(deal, user)
		self.assertEqual(len(sent), 1)
		self.assertEqual(sent[0].notification_type_doc, task)
		self.assertIn("Llamar para confirmar", sent[0].notification_text)
		self.assertEqual(self.avisos(later), [])

	def test_a_rescheduled_step_reminds_again(self):
		user = self.make_user("Sales User")
		deal, task = self.step(now_datetime() + datetime.timedelta(minutes=2), user=user)
		reminders.remind_due()
		moved = frappe.get_doc("CRM Task", task)
		moved.due_date = now_datetime() + datetime.timedelta(minutes=9)
		moved.save(ignore_permissions=True)  # the hooks mirror the new time onto the deal
		reminders.remind_due()
		self.assertEqual(len(self.avisos(deal, user)), 2)

	def test_closed_deals_and_settled_steps_stay_quiet(self):
		won, _ = self.step(now_datetime() + datetime.timedelta(minutes=5), status=terminal_status("Won"))
		done, task = self.step(now_datetime() + datetime.timedelta(minutes=5))
		frappe.db.set_value("CRM Task", task, "status", "Done")
		frappe.get_doc("CRM Task", task).save(ignore_permissions=True)  # hooks clear the mirror
		reminders.remind_due()
		self.assertEqual(self.avisos(won), [])
		self.assertEqual(self.avisos(done), [])

	def test_the_reminder_speaks_the_recipient_language(self):
		user = self.make_user("Sales User")
		frappe.db.set_value("User", user, "language", "es-MX")
		deal, _ = self.step(now_datetime() + datetime.timedelta(minutes=5), user=user)
		with patch.object(reminders, "_", side_effect=lambda text, lang=None: f"[{lang}] {text}"):
			reminders.remind_due()
		self.assertTrue(self.avisos(deal, user)[0].notification_text.startswith("[es-MX] "))

	def test_an_overdue_step_reaches_the_hierarchy_manager_once(self):
		seller, boss = self.make_user("Sales User"), self.make_user("Sales Manager")
		overdue = datetime.datetime.combine(getdate(add_days(nowdate(), -3)), datetime.time(10))
		deal, _ = self.step(overdue, user=seller)
		fresh, _ = self.step(datetime.datetime.combine(getdate(nowdate()), datetime.time(0, 1)), user=seller)
		with patch.object(reminders, "managers_of", return_value=[boss]):
			reminders.escalate_overdue()
			reminders.escalate_overdue()
		self.assertEqual(len(self.avisos(deal, boss)), 1)
		self.assertEqual(self.avisos(fresh, boss), [])

	def test_managers_come_from_the_sales_hierarchy_only(self):
		seller = self.make_user("Sales User")
		with patch("crm.permissions.org_hierarchy.hierarchy_enabled", return_value=False):
			self.assertEqual(reminders.managers_of(seller), [])
		self.assertEqual(reminders.managers_of(None), [])
