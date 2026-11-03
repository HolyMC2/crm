"""Resultados cards as Tablero sources (crm/tableros.py): which cards a person
is offered, the board's period as a Resultados query, and a card's answer as a
widget's payload, refusal included."""

from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	from crm import tableros

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False

PROVIDERS = [
	("ventas", "mercado.resultados_cards.ventas"),
	("efectivo", "mercado.resultados_cards.efectivo"),
	("reparaciones", "taller.resultados_cards.reparaciones"),
]


def _check(key, path, ctx):
	assert ctx["check"] == 1
	if key == "efectivo":
		return {"key": key, "blocked_reason": "Solo el encargado ve el efectivo."}
	if key == "reparaciones":
		return None
	return {"key": key}


@skipIf(not HAS_FRAPPE, "needs frappe")
class TestCatalogo(TestCase):
	def test_only_the_cards_the_person_may_see(self):
		with (
			patch.object(tableros.resultados, "_providers", return_value=PROVIDERS),
			patch.object(tableros.resultados, "_call", side_effect=_check),
		):
			rows = tableros.catalogo({"user": "dueno@example.test"})
		self.assertEqual([r["id"] for r in rows], ["resultados.ventas"])
		self.assertEqual(rows[0]["resolver"], tableros.RESOLVER)
		self.assertEqual(rows[0]["app"], "mercado")
		self.assertIn("compara", rows[0]["params"])


@skipIf(not HAS_FRAPPE, "needs frappe")
class TestPeriodo(TestCase):
	def test_the_board_period_as_a_resultados_query(self):
		self.assertEqual(tableros.board_query("hoy"), {"periodo": "hoy"})
		self.assertEqual(tableros.board_query("este_mes"), {"periodo": "mes"})
		self.assertEqual(tableros.board_query("mes_pasado"), {"periodo": "mes_anterior"})
		with patch(
			"doco.docoutils.books.analytics_query.resolve_period",
			return_value=("2026-08-05", "2026-11-03"),
		):
			self.assertEqual(
				tableros.board_query("ultimos_90_dias"),
				{"periodo": "rango", "desde": "2026-08-05", "hasta": "2026-11-03"},
			)


@skipIf(not HAS_FRAPPE, "needs frappe")
class TestResolver(TestCase):
	def _board(self, cards):
		return patch.object(
			tableros.resultados,
			"board",
			return_value={
				"cards": cards,
				"currency": "MXN",
				"period": {"from": "2026-11-01", "to": "2026-11-03"},
				"query": {"periodo": "mes", "compara": "anterior"},
			},
		)

	def test_a_card_is_a_card_payload(self):
		card = {"key": "ventas", "label": "Ventas", "value": 1200, "format": "money"}
		with self._board([card]) as board:
			out = tableros.resolver("resultados.ventas", {"compara": "anio"}, {"periodo": "este_mes"})
		board.assert_called_once_with(card="ventas", compara="anio", empresa=None, tienda=None, periodo="mes")
		self.assertEqual(out["kind"], "card")
		self.assertEqual(out["card"], card)
		self.assertEqual(out["currency"], "MXN")

	def test_a_refused_card_says_why(self):
		blocked = {"key": "efectivo", "blocked_reason": "Solo el encargado ve el efectivo."}
		with self._board([blocked]):
			out = tableros.resolver("resultados.efectivo", {}, {"periodo": "hoy"})
		self.assertEqual(
			out, {"kind": "blocked", "reason": "Solo el encargado ve el efectivo.", "retry": False}
		)
		with self._board([]):
			self.assertEqual(
				tableros.resolver("resultados.efectivo", {}, {"periodo": "hoy"})["kind"], "blocked"
			)

	def test_another_source_is_not_this_adapters(self):
		with self.assertRaises(LookupError):
			tableros.resolver("grafica.ventas_dia", {}, {"periodo": "hoy"})
