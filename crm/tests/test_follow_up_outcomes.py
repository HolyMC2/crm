# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""One-tap follow-up outcomes (crm.api.follow_up_outcomes)."""

import datetime
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.utils import add_days, add_to_date, get_datetime, getdate, now_datetime, nowdate

from crm.api import follow_up_outcomes as api
from crm.lead import settings as prospect_settings
from crm.pipeline.services import outcomes
from crm.tests.test_deals_list_unification import DealsListTestCase

CLOCK = datetime.time(16, 30)
SETTINGS = {
	"companies": False,
	"inquiries": True,
	"phone_required": True,
	"first_follow_up": "none",
	"ask_salutation": False,
	"ask_gender": False,
	"retry_after": "tomorrow",
	"follow_up_message": "",
}


def today_at(clock=CLOCK, days=0):
	return datetime.datetime.combine(getdate(add_days(nowdate(), days)), clock)


class OutcomeCase(DealsListTestCase):
	def setUp(self):
		super().setUp()
		self.leads: list[str] = []
		self.reasons: list[str] = []
		self.settings = patch.object(prospect_settings, "get", return_value=dict(SETTINGS))
		self.settings.start()

	def tearDown(self):
		self.settings.stop()
		frappe.set_user("Administrator")
		for doctype, names in (("CRM Deal", self.deals), ("CRM Lead", self.leads)):
			for name in names:
				frappe.db.delete("CRM Task", {"reference_doctype": doctype, "reference_docname": name})
				frappe.db.delete("Comment", {"reference_doctype": doctype, "reference_name": name})
		for name in self.leads:
			frappe.delete_doc("CRM Lead", name, force=True, ignore_missing=True)
		super().tearDown()
		for name in self.reasons:
			frappe.delete_doc("CRM Lost Reason", name, force=True, ignore_missing=True)

	def make_lead(self) -> str:
		lead = frappe.get_doc({"doctype": "CRM Lead", "first_name": "Ana", "last_name": "Pruebas"})
		lead.flags.ignore_permissions = True
		lead.insert()
		self.leads.append(lead.name)
		return lead.name

	def make_task(self, doctype, name, **values) -> str:
		task = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": "Dar seguimiento",
				"status": "Todo",
				"activity_type": "WhatsApp",
				"due_date": today_at(days=-1),
				"assigned_to": "Administrator",
				"reference_doctype": doctype,
				"reference_docname": name,
				**values,
			}
		)
		task.insert(ignore_permissions=True)
		return str(task.name)

	def lost_reason(self) -> str:
		name = "ZZ Outcome price"
		if not frappe.db.exists("CRM Lost Reason", name):
			frappe.get_doc({"doctype": "CRM Lost Reason", "lost_reason": name}).insert(
				ignore_permissions=True
			)
			self.reasons.append(name)
		return name

	def comments(self, doctype, name):
		return frappe.get_all(
			"Comment",
			filters={"reference_doctype": doctype, "reference_name": name, "comment_type": "Comment"},
			pluck="content",
		)


class TestOutcomeOptions(OutcomeCase):
	def test_a_deal_follow_up_offers_the_four_outcomes_and_a_written_message(self):
		deal = self.make_deal()
		frappe.db.set_value("CRM Deal", deal, {"first_name": "Rosa", "mobile_no": "+52 669 123 4567"})
		self.lost_reason()
		state = api.options(self.make_task("CRM Deal", deal))
		self.assertEqual([row["key"] for row in state["actions"]], ["answered", "no_answer", "won", "lost"])
		self.assertTrue(state["open"])
		self.assertTrue(state["can_change"])
		self.assertEqual(state["attempts"], 0)
		self.assertIn("Rosa", state["reach"]["message"])
		self.assertEqual(state["reach"]["call"], "tel:+526691234567")
		self.assertEqual([row["key"] for row in state["whens"]], list(outcomes.WHENS))
		self.assertTrue(state["reasons"])

	def test_a_prospect_offers_no_purchase_and_needs_no_reason(self):
		lead = self.make_lead()
		state = api.options(self.make_task("CRM Lead", lead))
		keys = [row["key"] for row in state["actions"]]
		self.assertNotIn("won", keys)
		lost = next(row for row in state["actions"] if row["key"] == "lost")
		self.assertNotIn("ask", lost)

	def test_a_task_on_anything_else_is_refused(self):
		task = frappe.get_doc(
			{"doctype": "CRM Task", "title": "Suelta", "status": "Todo", "assigned_to": "Administrator"}
		).insert(ignore_permissions=True)
		try:
			with self.assertRaises(frappe.ValidationError):
				api.options(str(task.name))
		finally:
			frappe.delete_doc("CRM Task", task.name, force=True)

	def test_the_shop_message_fills_english_and_spanish_words(self):
		deal = self.make_deal()
		frappe.db.set_value("CRM Deal", deal, "first_name", "Rosa")
		record = frappe.get_doc("CRM Deal", deal)
		with patch("crm.forms.settings.business_name", return_value="Doco"):
			text = outcomes.fill("Hola {nombre}, de {negocio}; {name} {business}", record)
		self.assertEqual(text, "Hola Rosa, de Doco; Rosa Doco")


class TestOutcomeRecord(OutcomeCase):
	def test_no_answer_counts_the_try_and_brings_it_back_at_its_hour(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		modified = str(frappe.db.get_value("CRM Task", task, "modified"))
		answer = api.record(task, "no_answer", modified=modified)
		row = frappe.db.get_value("CRM Task", task, ["status", "due_date", "no_answer_count"], as_dict=True)
		self.assertEqual(row.status, "Todo")
		self.assertEqual(row.no_answer_count, 1)
		self.assertEqual(get_datetime(row.due_date), today_at(days=1))
		self.assertIn("1", " ".join(self.comments("CRM Deal", deal)))
		self.assertTrue(answer["message"])

	def test_the_shop_can_bring_it_back_in_two_hours(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		self.settings.stop()
		with patch.object(prospect_settings, "get", return_value={**SETTINGS, "retry_after": "2h"}):
			api.record(task, "no_answer")
		self.settings.start()
		due = get_datetime(frappe.db.get_value("CRM Task", task, "due_date"))
		self.assertLess(abs((due - add_to_date(now_datetime(), hours=2)).total_seconds()), 120)

	def test_answered_closes_it_and_schedules_the_next_at_the_same_hour(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		answer = api.record(task, "answered", when="3d")
		self.assertEqual(frappe.db.get_value("CRM Task", task, "status"), "Done")
		following = frappe.get_all(
			"CRM Task",
			filters={"reference_docname": deal, "status": "Todo"},
			fields=["title", "activity_type", "due_date", "assigned_to"],
		)
		self.assertEqual(len(following), 1)
		self.assertEqual(following[0].title, "Dar seguimiento")
		self.assertEqual(following[0].activity_type, "WhatsApp")
		self.assertEqual(get_datetime(following[0].due_date), today_at(days=3))
		self.assertTrue(answer["next"])

	def test_answered_with_nothing_else_only_closes_it(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		api.record(task, "answered", when="none")
		self.assertFalse(frappe.get_all("CRM Task", filters={"reference_docname": deal, "status": "Todo"}))
		with self.assertRaises(frappe.ValidationError):
			api.record(self.make_task("CRM Deal", deal), "answered", when="someday")

	def test_bought_wins_the_deal_and_cancels_its_other_follow_ups(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		other = self.make_task("CRM Deal", deal, title="Mandar cotización")
		api.record(task, "won")
		status = frappe.db.get_value("CRM Deal", deal, "status")
		self.assertEqual(frappe.db.get_value("CRM Deal Status", status, "type"), "Won")
		self.assertEqual(frappe.db.get_value("CRM Task", task, "status"), "Done")
		self.assertEqual(frappe.db.get_value("CRM Task", other, "status"), "Canceled")

	def test_does_not_want_it_loses_the_deal_with_the_reason_tapped(self):
		deal = self.make_deal()
		reason = self.lost_reason()
		task = self.make_task("CRM Deal", deal)
		with self.assertRaises(frappe.ValidationError):
			api.record(task, "lost", reason="Inventado")
		api.record(task, "lost", reason=reason)
		row = frappe.db.get_value("CRM Deal", deal, ["status", "lost_reason"], as_dict=True)
		self.assertEqual(frappe.db.get_value("CRM Deal Status", row.status, "type"), "Lost")
		self.assertEqual(row.lost_reason, reason)

	def test_a_prospect_that_does_not_want_it_moves_to_a_lost_status(self):
		lead = self.make_lead()
		api.record(self.make_task("CRM Lead", lead), "lost")
		status = frappe.db.get_value("CRM Lead", lead, "status")
		self.assertEqual(frappe.db.get_value("CRM Lead Status", status, "type"), "Lost")

	def test_a_stale_or_closed_task_is_refused(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		with self.assertRaises(frappe.TimestampMismatchError):
			api.record(task, "no_answer", modified="2020-01-01 00:00:00")
		api.record(task, "answered", when="none")
		with self.assertRaises(frappe.ValidationError):
			api.record(task, "no_answer")

	def test_a_provider_owns_its_tasks_and_hands_shared_outcomes_back(self):
		deal = self.make_deal()
		task = self.make_task("CRM Deal", deal)
		applied = []

		def offer(task, record):
			return {
				"actions": [{"key": "notified", "label": "Ya le avisé"}, outcomes.own_action("no_answer")],
				"message": "Tu equipo está listo",
				"detail": "iPhone · RO-1",
			}

		def apply(task, record, action, values):
			applied.append(action)
			if action == "notified":
				outcomes.close(task)
				return {"message": "Aviso registrado"}
			return None

		provider = SimpleNamespace(offer=offer, apply=apply)
		with patch.object(outcomes, "_providers", return_value=[provider]):
			state = api.options(task)
			self.assertEqual([row["key"] for row in state["actions"]], ["notified", "no_answer"])
			self.assertEqual(state["detail"], "iPhone · RO-1")
			self.assertEqual(state["reach"]["message"], "Tu equipo está listo")
			api.record(task, "no_answer")
			self.assertEqual(frappe.db.get_value("CRM Task", task, "no_answer_count"), 1)
			answer = api.record(task, "notified")
			with self.assertRaises(frappe.ValidationError):
				api.record(self.make_task("CRM Deal", deal), "won")
		self.assertEqual(applied, ["no_answer", "notified"])
		self.assertEqual(answer["message"], "Aviso registrado")
		self.assertEqual(frappe.db.get_value("CRM Task", task, "status"), "Done")


class TestOutcomeSettings(OutcomeCase):
	def test_retry_and_message_are_validated_choices(self):
		self.settings.stop()
		try:
			with patch.object(prospect_settings, "_stored", return_value={"retry_after": "nunca"}):
				self.assertEqual(prospect_settings.get()["retry_after"], "tomorrow")
				self.assertEqual(prospect_settings.get()["follow_up_message"], "")
			with (
				patch("frappe.db.set_single_value"),
				patch.object(prospect_settings, "_stored", return_value={}),
			):
				saved = prospect_settings.save(
					{"retry_after": "2d", "follow_up_message": "  Hola {nombre}  "}
				)
				self.assertEqual(saved["retry_after"], "2d")
				self.assertEqual(saved["follow_up_message"], "Hola {nombre}")
				with self.assertRaises(frappe.ValidationError):
					prospect_settings.save({"retry_after": "nunca"})
				with self.assertRaises(frappe.ValidationError):
					prospect_settings.save({"follow_up_message": "x" * 501})
		finally:
			self.settings.start()
