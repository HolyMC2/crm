"""What Equipo's Metas (doco.metas) reads from the CRM: response SLA verdicts, the
inbox's per-person figures as indicators, and every indicator's contract."""

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import frappe

from crm import metas

UNITS = {"count", "money", "percent", "minutes", "hours", "rating"}


class TestResponseVerdict(unittest.TestCase):
	def test_answered_by_the_time_due_is_on_time(self):
		now = datetime(2026, 11, 16, 12, 0)
		due = now - timedelta(hours=1)
		self.assertTrue(metas.judge_response(due, due - timedelta(minutes=5), now))
		self.assertFalse(metas.judge_response(due, due + timedelta(minutes=5), now))
		# Unanswered: late once due has passed, not judged before.
		self.assertFalse(metas.judge_response(due, None, now))
		self.assertIsNone(metas.judge_response(now + timedelta(hours=1), None, now))
		self.assertIsNone(metas.judge_response(None, None, now))


class TestIndicators(unittest.TestCase):
	def setUp(self):
		frappe.local.crm_metas_inbox = None

	def tearDown(self):
		frappe.local.crm_metas_inbox = None

	def test_every_indicator_keeps_doco_metas_contract(self):
		rows = metas.indicators()
		self.assertTrue(rows)
		keys = [row["key"] for row in rows]
		self.assertEqual(len(keys), len(set(keys)))
		for row in rows:
			with self.subTest(key=row["key"]):
				self.assertIn(row["unit"], UNITS)
				self.assertIn(row["better"], ("higher", "lower"))
				self.assertTrue(row["label"] and row["group"] and row["help"])
				self.assertTrue(callable(row["values"]))
		self.assertIn("crm.metas.indicators", frappe.get_hooks("doco_metas_indicadores"))

	def test_inbox_figures_become_per_person_values_once_per_period(self):
		if not frappe.db.exists("DocType", "CRM Conversation"):
			self.skipTest("No inbox on this site")
		rows = [
			{
				"person": "ana@example.invalid",
				"first_responses": 4,
				"first_response_met_pct": 75.0,
				"avg_first_response_minutes": 12.5,
				"closed": 0,
				"resolution_met_pct": None,
				"ratings": 2,
				"avg_rating": 4.5,
				"replies": 9,
			},
			{"person": None, "first_responses": 3, "first_response_met_pct": 100.0},
		]
		by_key = {row["key"]: row for row in metas.indicators()}
		day = datetime(2026, 11, 16).date()
		with patch("crm.inbox.report.measure", return_value={"rows": rows}) as measure:
			met = by_key["inbox.primera_respuesta"]["values"](day, day)
			minutes = by_key["inbox.primera_respuesta_min"]["values"](day, day)
			closed = by_key["inbox.cerradas_a_tiempo"]["values"](day, day)
			rating = by_key["inbox.calificacion"]["values"](day, day)
		self.assertEqual(measure.call_count, 1)
		self.assertEqual(
			met,
			{"ana@example.invalid": {"value": 75.0, "n": 4, "detail": met["ana@example.invalid"]["detail"]}},
		)
		self.assertEqual(minutes["ana@example.invalid"]["value"], 12.5)
		# Nothing closed: not judged on closing in time.
		self.assertEqual(closed, {})
		self.assertEqual(rating["ana@example.invalid"]["n"], 2)
