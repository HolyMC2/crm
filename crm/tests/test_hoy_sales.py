# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Hoy «Ventas de hoy»: Resultados' own Ventas card for today, in the one Hoy read."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import hoy, resultados

CARD_PATH = "crm.tests.test_hoy_sales.ventas"
ANSWER = {}


def ventas(ctx):
	"""A stand-in Ventas provider: records the query it was asked and answers ANSWER."""
	ANSWER["ctx"] = ctx
	if "raise" in ANSWER:
		raise ANSWER["raise"]
	return dict(ANSWER["card"]) if ANSWER.get("card") is not None else None


CARD = {
	"label": "Sales",
	"format": "money",
	"value": 1520.5,
	"prev": 980.0,
	"delta_pct": 55.2,
	"facts": [
		{"label": "Without VAT", "value": 1310.78, "format": "money"},
		{"label": "Tickets", "value": 12, "format": "count"},
	],
	"attention": {"label": "1 cancelled · $200.00", "drill": {"path": "/crm/resultados/documentos"}},
	"drill": {"label": "See sales", "path": "/crm/resultados/documentos", "query": {"periodo": "hoy"}},
}


class TestHoySales(IntegrationTestCase):
	def setUp(self):
		ANSWER.clear()
		# A fresh generation: no card cached by another test answers this one.
		frappe.cache.incr(frappe.cache.make_key(resultados.GEN_KEY))
		self.providers = patch.object(resultados, "_providers", return_value=[("ventas", CARD_PATH)])
		self.providers.start()
		self.addCleanup(self.providers.stop)

	def test_shows_todays_ventas_card_with_yesterday_as_context(self):
		ANSWER["card"] = CARD
		section = hoy._sales_today()
		self.assertEqual(ANSWER["ctx"]["periodo"], "hoy")
		self.assertEqual(ANSWER["ctx"]["compara"], "anterior")
		self.assertTrue(section["available"])
		self.assertEqual(section["value"], 1520.5)
		self.assertEqual(section["prev"], 980.0)
		self.assertEqual(section["facts"], CARD["facts"])
		self.assertEqual(section["drill"], CARD["drill"])
		self.assertEqual(section["attention"], CARD["attention"])
		# A percentage against a day still running is not shown on Hoy.
		self.assertNotIn("delta_pct", section)

	def test_no_section_when_the_card_is_blocked_or_does_not_apply(self):
		ANSWER["card"] = {"key": "ventas", "blocked_reason": "Managers only"}
		self.assertEqual(hoy._sales_today(), {"available": False, "reason": None})
		frappe.cache.incr(frappe.cache.make_key(resultados.GEN_KEY))
		ANSWER["card"] = None
		self.assertEqual(hoy._sales_today(), {"available": False, "reason": None})

	def test_no_section_without_a_ventas_provider(self):
		with patch.object(resultados, "_providers", return_value=[]):
			self.assertEqual(hoy._sales_today(), {"available": False, "reason": None})

	def test_a_failing_card_is_a_failed_section_never_a_failed_page(self):
		ANSWER["raise"] = RuntimeError("boom")
		with patch.object(frappe, "log_error"):
			self.assertEqual(hoy._sales_today(), {"available": False, "failed": True})
			with (
				patch.object(hoy, "check_hoy_permission", return_value=True),
				patch.object(hoy, "_sales_today", side_effect=RuntimeError("boom")),
			):
				page = hoy.page()
		self.assertEqual(page["ventas"], {"available": False, "failed": True})
		self.assertIn("avisos", page)
