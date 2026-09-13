# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, get_datetime, nowdate

from crm.pipeline.api import get_visible_stages
from crm.pipeline.constants import NEXT_ACTIVITY_FIELDS
from crm.pipeline.services.next_activity import backfill

HIDDEN_STAGE = "ZZ Test Hidden Stage"
VISIBLE_STAGE = "ZZ Test Visible Stage"


def open_deal_status() -> str:
	name = frappe.db.get_value("CRM Deal Status", {"type": "Open"}, "name") or frappe.db.get_value(
		"CRM Deal Status", {"type": "Ongoing"}, "name"
	)
	assert name, "site has no non-terminal CRM Deal Status"
	return name


class NextActivityTestCase(IntegrationTestCase):
	"""Fixtures are owned by the test: tasks are removed before deals, or the
	dynamic link from CRM Task would block the deal delete."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.deals: list[str] = []
		self.tasks: list[str] = []

	def tearDown(self):
		for name in self.tasks:
			frappe.delete_doc("CRM Task", name, force=True, ignore_missing=True)
		for name in self.deals:
			frappe.delete_doc("CRM Deal", name, force=True, ignore_missing=True)
		super().tearDown()

	# -- fixtures ---------------------------------------------------------

	def make_deal(self) -> str:
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": open_deal_status(),
				"deal_owner": "Administrator",
				# Sites with FCRM forecasting enabled hard-require these.
				"expected_deal_value": 100,
				"expected_closure_date": add_to_date(nowdate(), days=30),
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.deals.append(deal.name)
		return deal.name

	def make_task(self, deal: str, title: str, days: int | None, activity_type: str = "Task") -> str:
		task = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": title,
				"status": "Todo",
				"activity_type": activity_type,
				"due_date": add_to_date(get_datetime(), days=days) if days is not None else None,
				"reference_doctype": "CRM Deal",
				"reference_docname": deal,
			}
		)
		task.flags.ignore_permissions = True
		task.insert()
		self.tasks.append(task.name)
		return task.name

	def stored(self, deal: str) -> dict:
		return frappe.db.get_value("CRM Deal", deal, NEXT_ACTIVITY_FIELDS, as_dict=True)

	# -- next activity ----------------------------------------------------

	def test_open_task_lands_on_its_deal(self):
		deal = self.make_deal()
		task = self.make_task(deal, "Llamar al cliente", days=1, activity_type="Call")

		stored = self.stored(deal)
		self.assertEqual(stored.next_activity_task, str(task))
		self.assertEqual(stored.next_activity_title, "Llamar al cliente")
		self.assertEqual(stored.next_activity_type, "Call")
		self.assertEqual(
			get_datetime(stored.next_activity_at),
			get_datetime(frappe.db.get_value("CRM Task", task, "due_date")),
		)

	def test_earlier_task_wins_and_done_falls_back_to_the_next_one(self):
		deal = self.make_deal()
		later = self.make_task(deal, "Cotizar", days=5)
		sooner = self.make_task(deal, "Confirmar refaccion", days=1)

		self.assertEqual(self.stored(deal).next_activity_task, str(sooner))

		task = frappe.get_doc("CRM Task", sooner)
		task.status = "Done"
		task.save()

		self.assertEqual(self.stored(deal).next_activity_task, str(later))

	def test_undated_task_ranks_after_a_dated_one(self):
		deal = self.make_deal()
		undated = self.make_task(deal, "Sin fecha", days=None)

		self.assertEqual(self.stored(deal).next_activity_task, str(undated))

		dated = self.make_task(deal, "Con fecha", days=9)
		self.assertEqual(self.stored(deal).next_activity_task, str(dated))

	def test_deleting_the_last_open_task_clears_the_fields(self):
		deal = self.make_deal()
		task = self.make_task(deal, "Unica tarea", days=2)
		self.assertIsNotNone(self.stored(deal).next_activity_at)

		# on_trash runs before Frappe's link check: the hook must have cleared the
		# Link field by then, or the delete is refused.
		frappe.delete_doc("CRM Task", task)
		self.tasks.remove(task)

		self.assertEqual(dict(self.stored(deal)), dict.fromkeys(NEXT_ACTIVITY_FIELDS, None))

	def test_moving_a_task_refreshes_both_deals(self):
		source = self.make_deal()
		target = self.make_deal()
		task = self.make_task(source, "Entregar equipo", days=3)

		doc = frappe.get_doc("CRM Task", task)
		doc.reference_docname = target
		doc.save()

		self.assertIsNone(self.stored(source).next_activity_at)
		self.assertEqual(self.stored(target).next_activity_task, str(task))

	def test_backfill_restores_values_blanked_by_sql(self):
		deal = self.make_deal()
		task = self.make_task(deal, "Recordar pago", days=4)
		frappe.db.set_value(
			"CRM Deal", deal, dict.fromkeys(NEXT_ACTIVITY_FIELDS, None), update_modified=False
		)
		self.assertIsNone(self.stored(deal).next_activity_at)

		counts = backfill()

		self.assertEqual(self.stored(deal).next_activity_task, str(task))
		self.assertGreaterEqual(counts["CRM Deal"], 1)
		self.assertIn("CRM Lead", counts)


class VisibleStagesTestCase(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		for stage, hidden in ((HIDDEN_STAGE, 1), (VISIBLE_STAGE, 0)):
			frappe.get_doc(
				{
					"doctype": "CRM Deal Status",
					"deal_status": stage,
					"type": "Open",
					"position": 99,
					"probability": 40,
					"hidden": hidden,
				}
			).insert(ignore_permissions=True, ignore_if_duplicate=True)

	def tearDown(self):
		for stage in (HIDDEN_STAGE, VISIBLE_STAGE):
			frappe.delete_doc("CRM Deal Status", stage, force=True, ignore_missing=True)
		super().tearDown()

	def test_hidden_deal_stages_are_not_offered(self):
		names = [stage["name"] for stage in get_visible_stages("CRM Deal")]
		self.assertIn(VISIBLE_STAGE, names)
		self.assertNotIn(HIDDEN_STAGE, names)

	def test_stages_come_back_in_position_order(self):
		positions = [stage["position"] for stage in get_visible_stages("CRM Deal Status")]
		self.assertEqual(positions, sorted(positions))

	def test_lead_stages_default_the_columns_they_do_not_have(self):
		stages = get_visible_stages("CRM Lead")
		self.assertTrue(stages, "site has no CRM Lead Status")
		self.assertTrue(all(stage["hidden"] == 0 and stage["probability"] is None for stage in stages))

	def test_an_unknown_doctype_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			get_visible_stages("Contact")
