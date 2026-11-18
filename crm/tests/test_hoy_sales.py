# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Hoy «Ventas de hoy» and «Credit sales»: Resultados' own Ventas and Credito
cards for today, in the one Hoy read. Today's sales are what the tickets
charged; a provider's later payment is the credit section's."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import hoy, resultados

CARD_PATH = "crm.tests.test_hoy_sales.ventas"
CREDIT_PATH = "crm.tests.test_hoy_sales.credito"
ANSWER = {}


def ventas(ctx):
	"""A stand-in Ventas provider: records the query it was asked and answers ANSWER."""
	ANSWER["ctx"] = ctx
	if "raise" in ANSWER:
		raise ANSWER["raise"]
	return dict(ANSWER["card"]) if ANSWER.get("card") is not None else None


def credito(ctx):
	"""A stand-in Credito provider answering ANSWER["credit"]."""
	ANSWER["credit_ctx"] = ctx
	return dict(ANSWER["credit"]) if ANSWER.get("credit") is not None else None


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
# Resultados counts a Payjoy phone at 3510 (469 down + 3041 Payjoy pays later);
# the tickets charged 2654.
SPLIT = {
	**CARD,
	"value": 5695.0,
	"prev": 4280.0,
	"charged": {
		"value": 2654.0,
		"prev": 4280.0,
		"facts": [
			{"label": "Without VAT", "value": 2287.93, "format": "money"},
			{"label": "Tickets", "value": 12, "format": "count"},
		],
	},
}
CREDIT = {
	"key": "credito",
	"label": "Credit sales",
	"format": "money",
	"value": 3041.0,
	"value_label": "Payjoy pays later",
	"facts": [
		{"label": "Sales", "value": 1, "format": "count"},
		{"label": "Down payments", "value": 469.0, "format": "money"},
	],
	"items": [
		{
			"name": "ACC-SINV-1",
			"label": "Valeria · Payjoy",
			"value": 3041.0,
			"format": "money",
			"href": "/crm/resultados/documento/Sales%20Invoice/ACC-SINV-1",
			"provider": "Payjoy",
			"customer": "Valeria",
			"price": 3900.0,
			"charged": 469.0,
			"pays": 3041.0,
			"missing_price": False,
		}
	],
	"attention": None,
	"drill": {
		"label": "See credit sales",
		"path": "/crm/resultados/documentos",
		"query": {"tipo": "credito"},
	},
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

	def test_todays_sales_are_what_the_tickets_charged(self):
		ANSWER["card"] = SPLIT
		section = hoy._sales_today()
		self.assertEqual((section["value"], section["prev"]), (2654.0, 4280.0))
		self.assertEqual(section["facts"], SPLIT["charged"]["facts"])

	def test_credit_section_is_the_credito_card_for_today(self):
		providers = [("ventas", CARD_PATH), ("credito", CREDIT_PATH)]
		with patch.object(resultados, "_providers", return_value=providers):
			ANSWER["credit"] = CREDIT
			section = hoy._credit_today()
			self.assertEqual(ANSWER["credit_ctx"]["periodo"], "hoy")
			self.assertTrue(section["available"])
			self.assertEqual(
				{
					key: section[key]
					for key in ("label", "format", "value", "value_label", "facts", "items", "drill")
				},
				{
					key: CREDIT[key]
					for key in ("label", "format", "value", "value_label", "facts", "items", "drill")
				},
			)
			# A site without credit providers: the card does not apply, no section.
			frappe.cache.incr(frappe.cache.make_key(resultados.GEN_KEY))
			ANSWER["credit"] = None
			self.assertEqual(hoy._credit_today(), {"available": False, "reason": None})
			frappe.cache.incr(frappe.cache.make_key(resultados.GEN_KEY))
			ANSWER["credit"] = CREDIT
			from crm.api import money

			with patch.object(money, "hidden", return_value=True):
				self.assertEqual(hoy._credit_today(), {"available": False, "reason": None})
			with patch.object(hoy, "check_hoy_permission", return_value=True):
				self.assertTrue(hoy.page()["credito"]["available"])
		# Without a Credito provider (an older Mercado) there is no section.
		self.assertEqual(hoy._credit_today(), {"available": False, "reason": None})

	def test_no_section_when_the_card_is_blocked_or_does_not_apply(self):
		ANSWER["card"] = {"key": "ventas", "blocked_reason": "Managers only"}
		self.assertEqual(hoy._sales_today(), {"available": False, "reason": None})
		frappe.cache.incr(frappe.cache.make_key(resultados.GEN_KEY))
		ANSWER["card"] = None
		self.assertEqual(hoy._sales_today(), {"available": False, "reason": None})

	def test_no_section_and_no_resultados_when_the_owner_keeps_the_money(self):
		"""Equipo «Ve el dinero del negocio» off: no «Ventas de hoy», no Resultados, not even by URL."""
		from crm.api import money

		ANSWER["card"] = CARD
		with patch.object(money, "hidden", return_value=True):
			self.assertEqual(hoy._sales_today(), {"available": False, "reason": None})
			self.assertNotIn("ctx", ANSWER)
			answer = resultados.get_capabilities()
			self.assertFalse(answer["enabled"])
			self.assertEqual(answer["reason"], money.reason())
			self.assertFalse(resultados.check_resultados_permission())
			with self.assertRaises(frappe.PermissionError):
				resultados.board(periodo="hoy")
		self.assertTrue(hoy._sales_today()["available"])

	def test_a_failing_money_hook_hides_the_money(self):
		from crm.api import money

		with patch.object(frappe, "get_hooks", return_value=["crm.tests.test_hoy_sales.no_such_hook"]):
			self.assertTrue(money.hidden("someone@example.com"))
		with patch.object(frappe, "get_hooks", return_value=[]):
			self.assertFalse(money.hidden("someone@example.com"))

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
