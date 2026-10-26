"""CRM's Resultados cards: the periods and comparison windows they count in, and the
Recomendación card that reads Encuestas' own number."""

from datetime import date
from types import SimpleNamespace
from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	from crm import resultados_cards
	from crm.resultados_cards import _pct, compare_window, window

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


@skipIf(not HAS_FRAPPE, "needs frappe")
class TestTratosWindows(TestCase):
	today = "2026-10-17"  # a Saturday

	def test_periods(self):
		self.assertEqual(window("hoy", self.today), (date(2026, 10, 17), date(2026, 10, 17)))
		self.assertEqual(window("ayer", self.today), (date(2026, 10, 16), date(2026, 10, 16)))
		self.assertEqual(window("semana", self.today), (date(2026, 10, 12), date(2026, 10, 17)))
		self.assertEqual(window("mes", self.today), (date(2026, 10, 1), date(2026, 10, 17)))
		self.assertEqual(window("mes_anterior", self.today), (date(2026, 9, 1), date(2026, 9, 30)))
		self.assertEqual(
			window("rango", self.today, "2026-08-02", "2026-08-09"), (date(2026, 8, 2), date(2026, 8, 9))
		)
		self.assertEqual(window("nope", self.today), (date(2026, 10, 1), date(2026, 10, 17)))

	def test_comparisons(self):
		start, end = date(2026, 10, 1), date(2026, 10, 17)
		self.assertEqual(compare_window("anterior", start, end), (date(2026, 9, 14), date(2026, 9, 30)))
		self.assertEqual(compare_window("anio", start, end), (date(2025, 10, 1), date(2025, 10, 17)))
		self.assertIsNone(compare_window("no", start, end))

	def test_delta_needs_a_previous_value(self):
		self.assertEqual(_pct(6, 4), 50.0)
		self.assertIsNone(_pct(6, 0))
		self.assertIsNone(_pct(6, None))


def _answers(value, promoter, passive, detractor):
	"""What doco's recommendation() returns for a window."""
	total = promoter + passive + detractor
	return {
		"value": value,
		"answers": total,
		"few": total < 5,
		"promoter": promoter,
		"passive": passive,
		"detractor": detractor,
	}


RANGE = {"user": "dueno@example.test", "periodo": "rango", "desde": "2026-10-01", "hasta": "2026-10-17"}


@skipIf(not HAS_FRAPPE, "needs frappe")
class TestEncuestasCard(TestCase):
	def service(self, windows, readable=True):
		asked = []

		def between(start, end):
			asked.append((start, end))
			return windows[(start, end)]

		fake = SimpleNamespace(may_read=lambda: readable, recommendation_between=between)
		return fake, asked

	def card(self, fake, **ctx):
		with patch.object(resultados_cards, "_encuestas_service", return_value=fake):
			return resultados_cards.encuestas({**RANGE, **ctx})

	def test_the_number_and_its_three_groups_come_from_encuestas(self):
		fake, asked = self.service(
			{
				(date(2026, 10, 1), date(2026, 10, 17)): _answers(40, 6, 2, 2),
				(date(2026, 9, 14), date(2026, 9, 30)): _answers(20, 3, 3, 1),
			}
		)
		card = self.card(fake)
		self.assertEqual(
			asked, [(date(2026, 10, 1), date(2026, 10, 17)), (date(2026, 9, 14), date(2026, 9, 30))]
		)
		self.assertEqual(
			(card["key"], card["format"], card["value"], card["prev"]), ("encuestas", "signed", 40, 20)
		)
		self.assertEqual((card["delta_pct"], card["delta_unit"]), (20, "pp"))
		self.assertEqual([fact["value"] for fact in card["facts"]], [6, 2, 2])
		self.assertTrue(all(fact["format"] == "count" for fact in card["facts"]))
		self.assertEqual((card["period"]["from"], card["period"]["to"]), ("2026-10-01", "2026-10-17"))
		self.assertEqual(card["drill"]["path"], "/crm/encuestas")
		self.assertEqual(card["drill"]["query"], {"view": "todas"})

	def test_no_answers_is_an_empty_card_not_zero(self):
		fake, _asked = self.service({(date(2026, 10, 1), date(2026, 10, 17)): _answers(None, 0, 0, 0)})
		card = self.card(fake, compara="no")
		self.assertIsNone(card["value"])
		self.assertIsNone(card["prev"])
		self.assertIsNone(card["delta_pct"])
		self.assertTrue(card["note"])

	def test_few_answers_say_so(self):
		fake, _asked = self.service({(date(2026, 10, 1), date(2026, 10, 17)): _answers(100, 2, 0, 0)})
		few = self.card(fake, compara="no")["note"]
		fake, _asked = self.service({(date(2026, 10, 1), date(2026, 10, 17)): _answers(40, 6, 2, 2)})
		self.assertNotEqual(few, self.card(fake, compara="no")["note"])

	def test_absent_for_who_may_not_read_answers_or_without_doco(self):
		fake, asked = self.service({}, readable=False)
		self.assertIsNone(self.card(fake))
		self.assertEqual(asked, [])
		self.assertIsNone(self.card(None))

	def test_the_shell_check_reads_no_answers(self):
		fake, asked = self.service({})
		self.assertEqual(self.card(fake, check=1), {"key": "encuestas"})
		self.assertEqual(asked, [])
