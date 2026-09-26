"""Plain-Python financial boundary tests; no Frappe or provider doubles."""

import unittest

from crm.offers.contract import calculate, digest, terms_snapshot


class TestOfferArithmetic(unittest.TestCase):
	def line(self, **values):
		return {
			"product_name": "Installation",
			"qty": 3,
			"rate": "19.995",
			"discount_percentage": 10,
			**values,
		}

	def test_rounds_each_commercial_line_before_summing_discount(self):
		result = calculate([self.line(), self.line(qty=1, rate="0.05", discount_percentage=10)])
		self.assertEqual(result["total"], 60.04)
		self.assertEqual(result["net_total"], 54.03)
		self.assertEqual(result["products"][0]["discount_amount"], 6)

	def test_whole_unit_currency_and_fully_discounted_service(self):
		result = calculate([self.line(qty=1, rate="100.5", discount_percentage=100)], precision=0)
		self.assertEqual(result["total"], 101)
		self.assertEqual(result["net_total"], 0)
		self.assertEqual(result["products"][0]["product_code"], "")

	def test_nonfinite_negative_boolean_and_excessive_values_are_rejected(self):
		for field, value in (
			("rate", "NaN"),
			("rate", "Infinity"),
			("qty", False),
			("qty", 0),
			("qty", -1),
			("rate", -1),
			("discount_percentage", 101),
			("rate", "1e50"),
			("qty", "0.00000000001"),
		):
			with self.subTest(field=field, value=value), self.assertRaises(ValueError):
				calculate([self.line(**{field: value})])

	def test_client_totals_and_arbitrary_fields_cannot_enter_calculation(self):
		for field in ("net_amount", "amount", "discount_amount", "doctype", "parent"):
			with self.subTest(field=field), self.assertRaises(ValueError):
				calculate([self.line(**{field: 1})])

	def test_empty_and_excessive_lines_and_overflow_fail(self):
		for lines in ([], [self.line()] * 101, [self.line(qty=1000000, rate=1000000000000)]):
			with self.assertRaises(ValueError):
				calculate(lines)

	def test_hash_binds_customer_terms_and_lines_but_not_workflow_metadata(self):
		proposal = {
			"deal": "D-1",
			"title": "Repair",
			"currency": "USD",
			"currency_precision": 2,
			"valid_until": "2030-01-01",
			"terms": "Seven days",
			**calculate([self.line()]),
		}
		before = digest(terms_snapshot(proposal))
		self.assertEqual(
			before,
			digest(terms_snapshot({**proposal, "status": "Accepted", "decision_by": "rep@example.invalid"})),
		)
		self.assertNotEqual(before, digest(terms_snapshot({**proposal, "terms": "Two days"})))
		self.assertNotEqual(before, digest(terms_snapshot({**proposal, "deal": "D-2"})))


if __name__ == "__main__":
	unittest.main()
