# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""A deal's next step: schedule, snooze, reschedule, complete (crm.api.next_step)."""

import datetime

import frappe
from frappe.utils import add_days, get_datetime, getdate, now_datetime, nowdate

from crm.api import next_step as api
from crm.pipeline.services import next_step
from crm.tests.test_deals_list_unification import DealsListTestCase, terminal_status


def mirrored(deal):
	return frappe.db.get_value(
		"CRM Deal", deal, ["next_activity_task", "next_activity_at", "next_activity_title"], as_dict=True
	)


class TestNextStep(DealsListTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		for deal in self.deals:
			frappe.db.delete("CRM Task", {"reference_doctype": "CRM Deal", "reference_docname": deal})
		super().tearDown()

	def test_default_is_tomorrow_ten_and_the_deal_owner(self):
		deal = self.make_deal()
		state = api.get(deal)
		self.assertTrue(state["open"])
		self.assertEqual(state["task"], "")
		self.assertEqual(
			get_datetime(state["default_at"]),
			datetime.datetime.combine(getdate(add_days(nowdate(), 1)), datetime.time(10)),
		)
		state = api.schedule(deal, title="Llamar", at=state["default_at"], activity_type="Call")
		task = frappe.get_doc("CRM Task", state["task"])
		self.assertEqual(task.assigned_to, "Administrator")  # the deal owner
		self.assertEqual(task.status, "Todo")
		self.assertEqual(mirrored(deal).next_activity_title, "Llamar")

	def test_reschedule_moves_the_same_step_and_refuses_a_stale_copy(self):
		deal = self.make_deal()
		first = api.schedule(deal, title="Llamar", at=str(next_step.default_at()))
		later = str(next_step.default_at(3))
		moved = api.schedule(deal, title="Llamar", at=later, task=first["task"], modified=first["modified"])
		self.assertEqual(moved["task"], first["task"])
		self.assertEqual(get_datetime(mirrored(deal).next_activity_at), get_datetime(later))
		with self.assertRaises(frappe.TimestampMismatchError):
			api.schedule(deal, title="Otro", at=later, task=first["task"], modified=first["modified"])

	def test_snooze_keeps_the_clock_and_starts_from_today_when_overdue(self):
		deal = self.make_deal()
		state = api.schedule(deal, title="Llamar", at=str(next_step.default_at(2)))
		snoozed = api.snooze(deal, days=1, task=state["task"], modified=state["modified"])
		self.assertEqual(get_datetime(snoozed["at"]), next_step.default_at(3))

		overdue = datetime.datetime.combine(getdate(add_days(nowdate(), -5)), datetime.time(16, 30))
		frappe.db.set_value("CRM Task", state["task"], "due_date", overdue)
		snoozed = api.snooze(deal, days=1)
		self.assertEqual(
			get_datetime(snoozed["at"]),
			datetime.datetime.combine(getdate(add_days(nowdate(), 1)), datetime.time(16, 30)),
		)

	def test_snooze_without_a_step_gives_the_deal_a_dated_one(self):
		deal = self.make_deal()
		state = api.snooze(deal, days=2)
		self.assertTrue(state["task"])
		self.assertEqual(get_datetime(state["at"]), next_step.default_at(2))
		with self.assertRaises(frappe.ValidationError):
			api.snooze(deal, days=0)

	def test_complete_notes_the_outcome_and_schedules_the_next_in_one_call(self):
		deal = self.make_deal()
		first = api.schedule(deal, title="Llamar", at=str(next_step.default_at()))
		state = api.complete(
			deal,
			task=first["task"],
			modified=first["modified"],
			note="Pidió precio",
			next_step='{"title": "Enviar cotización", "at": "%s", "type": "WhatsApp"}'
			% next_step.default_at(2),
		)
		self.assertEqual(frappe.db.get_value("CRM Task", first["task"], "status"), "Done")
		self.assertNotEqual(state["task"], first["task"])
		self.assertEqual(state["type"], "WhatsApp")
		self.assertEqual(mirrored(deal).next_activity_title, "Enviar cotización")
		self.assertTrue(
			frappe.db.exists(
				"Comment",
				{
					"reference_doctype": "CRM Deal",
					"reference_name": deal,
					"content": ["like", "%Pidió precio%"],
				},
			)
		)
		with self.assertRaises(frappe.ValidationError):
			api.complete(deal, task=first["task"])  # already done

	def test_complete_without_next_leaves_no_step(self):
		deal = self.make_deal()
		first = api.schedule(deal, title="Llamar", at=str(next_step.default_at()))
		state = api.complete(deal, task=first["task"])
		self.assertEqual(state["task"], "")
		self.assertIsNone(mirrored(deal).next_activity_task)

	def test_guards_explain_themselves(self):
		deal = self.make_deal()
		with self.assertRaises(frappe.ValidationError):
			api.schedule(deal, title="", at=str(next_step.default_at()))
		with self.assertRaises(frappe.ValidationError):
			api.schedule(deal, title="Llamar", at=str(now_datetime() - datetime.timedelta(days=1)))
		with self.assertRaises(frappe.ValidationError):
			api.schedule(deal, title="Llamar", at=str(next_step.default_at()), activity_type="Fax")
		other = self.make_deal()
		step = api.schedule(other, title="Llamar", at=str(next_step.default_at()))
		with self.assertRaises(frappe.ValidationError):
			api.snooze(deal, task=step["task"])  # a step of another deal

	def test_won_deal_reads_as_closed(self):
		deal = self.make_deal(status=terminal_status("Won"))
		self.assertFalse(api.get(deal)["open"])

	def test_a_user_who_cannot_write_the_deal_is_refused(self):
		deal = self.make_deal()
		frappe.set_user(self.make_user(None))
		with self.assertRaises(frappe.PermissionError):
			api.snooze(deal)
