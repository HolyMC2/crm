"""CRM's Resultados card: the periods and comparison windows it counts in."""

from datetime import date
from unittest import TestCase, skipIf

try:
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
