# ci: shell-apis
"""Cuadre: the difference between books and bank, line by line.

The arithmetic (crm/bancos_cuadre.py) is bench-free; TestCuadreSite runs the endpoints
(crm/api/bancos_cuadre.py) on a site with ERPNext.
"""

import json
import uuid
from unittest import TestCase

from crm.bancos_cuadre import agrees, breakdown, difference, feed_run, months_without, natural, pair, to_asset

try:
	import frappe
	from frappe.tests import IntegrationTestCase
	from frappe.utils import add_days, today

	from crm.api import bancos, bancos_cuadre

	HAS_FRAPPE = True
except ImportError:  # bench-free run: only the arithmetic
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


def bt(name, day, amount):
	return {"name": name, "date": day, "amount": amount}


def gl(name, day, amount, doctype="Payment Entry", matchable=True):
	return {"doctype": doctype, "name": name, "date": day, "amount": amount, "matchable": matchable}


def effects(result):
	return {line["key"]: line["effect"] for line in result["lines"]}


class TestSigns(TestCase):
	def test_a_card_is_owed_whatever_sign_the_bank_uses(self):
		self.assertEqual(to_asset(-6647.69, card=True), -6647.69)
		self.assertEqual(to_asset(6647.69, card=True), -6647.69)
		self.assertEqual(to_asset(4663.09, card=False), 4663.09)
		self.assertIsNone(to_asset(None, card=True))
		self.assertEqual(natural(-6647.69, card=True), 6647.69)
		self.assertEqual(natural(0.0, card=True), 0.0)

	def test_difference_and_agreement(self):
		self.assertEqual(difference(4663.09, -2082.0), 6745.09)
		self.assertIsNone(difference(None, 10))
		self.assertTrue(agrees(difference(100.004, 100)))
		self.assertFalse(agrees(difference(100.02, 100)))
		self.assertFalse(agrees(None))


class TestPairs(TestCase):
	def test_same_amount_closest_dates_first_one_to_one(self):
		bank = [bt("B1", "2026-11-10", -620), bt("B2", "2026-11-11", -620)]
		books = [gl("P1", "2026-11-11", -620), gl("P2", "2026-11-03", -620), gl("P3", "2026-11-25", -620)]
		pairs = pair(bank, books)
		# B2-P1 (same day) first; B1 still reaches P2 (7 days); P3 is out of everyone's window.
		self.assertEqual([(b["name"], g["name"]) for b, g in pairs], [("B1", "P2"), ("B2", "P1")])

	def test_monthly_equal_amounts_pair_month_with_month(self):
		bank = [bt(f"B{m}", f"2026-{m:02d}-05", -9000) for m in (8, 9, 10)]
		books = [gl(f"P{m}", f"2026-{m:02d}-04", -9000) for m in (10, 8, 9)]
		self.assertEqual(
			[(b["name"], g["name"]) for b, g in pair(bank, books)],
			[("B8", "P8"), ("B9", "P9"), ("B10", "P10")],
		)

	def test_outside_the_window_or_another_amount_or_not_matchable_stays_apart(self):
		bank = [bt("B1", "2026-11-10", -620)]
		self.assertEqual(pair(bank, [gl("P1", "2026-11-18", -620)]), [])
		self.assertEqual(pair(bank, [gl("P1", "2026-11-10", -621)]), [])
		self.assertEqual(pair(bank, [gl("P1", "2026-11-10", 620)]), [])
		self.assertEqual(pair(bank, [gl("SI1", "2026-11-10", -620, "Sales Invoice", matchable=False)]), [])

	def test_cents_compare_exactly(self):
		bank = [bt("B1", "2026-11-10", 0.1 + 0.2)]
		self.assertEqual(len(pair(bank, [gl("P1", "2026-11-10", 0.3)])), 1)


class TestMonths(TestCase):
	def test_months_with_no_bank_movement(self):
		self.assertEqual(
			months_without({"2026-09", "2026-11"}, "2026-09-02", "2026-11-16"),
			["2026-10"],
		)
		self.assertEqual(months_without(set(), "2026-12-30", "2027-01-02"), ["2026-12", "2027-01"])
		self.assertEqual(months_without(set(), None, "2026-11-16"), [])


class TestFeedRun(TestCase):
	def test_the_run_starts_after_the_last_empty_month(self):
		# BBVA débito on doco: a March-April statement, nothing May-August, the feed since 2 Sep.
		months = {
			"2026-03": "2026-03-21",
			"2026-04": "2026-04-01",
			"2026-09": "2026-09-02",
			"2026-10": "2026-10-01",
			"2026-11": "2026-11-03",
		}
		run = feed_run(months, "2026-11-16")
		self.assertEqual(run["start"], "2026-09-02")
		self.assertEqual(run["first"], "2026-03-21")
		self.assertEqual(run["holes"], ["2026-05", "2026-06", "2026-07", "2026-08"])
		self.assertFalse(run["behind"])

	def test_a_statement_account_one_month_late_is_not_behind(self):
		run = feed_run({"2026-09": "2026-09-01", "2026-10": "2026-10-02"}, "2026-11-16")
		self.assertEqual(run["start"], "2026-09-01")
		self.assertEqual(run["holes"], ["2026-11"])
		self.assertFalse(run["behind"])

	def test_an_older_last_movement_is_behind(self):
		run = feed_run({"2026-07": "2026-07-03", "2026-08": "2026-08-01"}, "2026-11-16")
		self.assertTrue(run["behind"])
		self.assertEqual(run["holes"], ["2026-09", "2026-10", "2026-11"])
		self.assertTrue(feed_run({"2025-12": "2025-12-01"}, "2026-02-10")["behind"])
		self.assertFalse(feed_run({"2025-12": "2025-12-01"}, "2026-01-10")["behind"])

	def test_no_movements(self):
		self.assertEqual(
			feed_run({}, "2026-11-16"), {"start": None, "first": None, "holes": [], "behind": False}
		)


class TestBreakdown(TestCase):
	def test_the_lines_add_up_to_the_difference(self):
		# Bank: 940 before S; since S B0 -300 (linked to its payment), B1 -200, B2 +900 and a
		# held connection movement +80. Books: 1,000 before S; since S the payment of B0, a
		# supplier payment P1 not linked yet (the same money as B1) and a sale booked here by
		# mistake (P9).
		result = breakdown(
			card=False,
			bank=940.0 - 300.0 - 200.0 + 900.0 + 80.0,
			books=1000.0 - 300.0 - 200.0 + 50.0,
			start="2026-09-02",
			books_before=1000.0,
			bank_total=-300.0 - 200.0 + 900.0,
			pending=[bt("B1", "2026-09-10", -200.0), bt("B2", "2026-09-12", 900.0)],
			book_only=[gl("P1", "2026-09-09", -200.0), gl("P9", "2026-09-20", 50.0, "Journal Entry")],
			conexion=80.0,
			conexion_count=1,
		)
		lines = effects(result)
		self.assertEqual(result["difference"], 870.0)
		self.assertEqual(lines["pares"], 0.0)
		self.assertEqual(lines["solo_banco"], 900.0)
		self.assertEqual(lines["solo_libros"], -50.0)
		self.assertEqual(lines["conexion"], 80.0)
		self.assertEqual(lines["antes"], -60.0)
		self.assertEqual(result["opening"], {"bank": 940.0, "books": 1000.0})
		self.assertNotIn("otros", lines)  # nothing left unexplained
		self.assertEqual(round(sum(lines.values()), 2), result["difference"])
		self.assertEqual([(b["name"], g["name"]) for b, g in result["pairs"]], [("B1", "P1")])
		self.assertEqual([row["name"] for row in result["only_bank"]], ["B2"])
		self.assertEqual([row["name"] for row in result["only_books"]], ["P9"])

	def test_a_card_reads_as_owed(self):
		# Owed 6,647.69 at the bank, nothing in the books, 16 charges and payments since S.
		result = breakdown(
			card=True,
			bank=to_asset(-6647.69, card=True),
			books=0.0,
			start="2026-09-01",
			books_before=0.0,
			bank_total=-9919.36,
			pending=[bt("C1", "2026-09-05", -9919.36)],
		)
		lines = effects(result)
		self.assertEqual(result["bank"], 6647.69)
		self.assertEqual(result["books"], 0.0)
		self.assertEqual(result["difference"], 6647.69)
		self.assertEqual(lines["solo_banco"], 9919.36)  # charges the books do not have: more owed
		# Before S the bank had the card 3,271.67 in favour; the books say nothing was owed.
		self.assertEqual(lines["antes"], -3271.67)
		self.assertEqual(round(sum(lines.values()), 2), result["difference"])

	def test_links_with_another_amount_are_left_as_otros(self):
		# B0 (-300) linked to an entry of -290 on this ledger.
		result = breakdown(
			card=False, bank=700.0, books=710.0, start="2026-09-01", books_before=1000.0, bank_total=-300.0
		)
		lines = effects(result)
		self.assertEqual(lines["otros"], -10.0)
		self.assertNotIn("antes", lines)  # 1000 before S on both sides
		self.assertEqual(round(sum(lines.values()), 2), result["difference"])

	def test_without_a_bank_figure_the_lines_still_show(self):
		result = breakdown(
			card=False,
			books=-27824.49,
			start="2026-10-01",
			pending=[bt("B1", "2026-10-03", 500.0)],
			book_only=[gl("P1", "2026-10-03", 500.0)],
		)
		self.assertIsNone(result["difference"])
		self.assertFalse(result["agrees"])
		self.assertEqual([line["key"] for line in result["lines"]], ["pares"])
		self.assertIsNone(result["opening"])

	def test_an_account_with_no_bank_movements(self):
		result = breakdown(card=False, bank=125556.0, books=125556.0)
		self.assertTrue(result["agrees"])
		self.assertEqual(result["lines"], [])
		self.assertIsNone(result["start"])
		typed = breakdown(card=False, bank=1000.0, books=-27824.49)
		self.assertEqual(effects(typed), {"faltan": 28824.49})

	def test_behind_leaves_the_remainder_as_faltan(self):
		result = breakdown(
			card=False,
			bank=500.0,
			books=100.0,
			start="2026-07-01",
			books_before=0.0,
			bank_total=100.0,
			pending=[bt("B1", "2026-07-02", 60.0)],
			behind=True,
		)
		lines = effects(result)
		self.assertEqual(lines, {"solo_banco": 60.0, "faltan": 340.0})
		self.assertIsNone(result["opening"])
		self.assertEqual(round(sum(lines.values()), 2), result["difference"])


class TestCuadreSite(IntegrationTestCase):
	"""One bank account with an opening, a pair, a bank-only and a books-only movement."""

	def setUp(self):
		if not HAS_FRAPPE:
			self.skipTest("needs a site")
		frappe.set_user("Administrator")
		if not bancos._erpnext():
			self.skipTest("ERPNext is not installed")
		self.company = frappe.db.get_value("Company", {}, "name")
		if not self.company:
			self.skipTest("No company on this site")
		self.abbr = frappe.get_cached_value("Company", self.company, "abbr")
		self.currency = frappe.get_cached_value("Company", self.company, "default_currency")
		tag = uuid.uuid4().hex[:6]
		self.ledger = self._ledger(f"Cuadre {tag}")
		self.other = self._ledger(f"Cuadre otra {tag}")
		bank = "Cuadre Test Bank"
		if not frappe.db.exists("Bank", bank):
			frappe.get_doc({"doctype": "Bank", "bank_name": bank}).insert()
		self.bank_account = (
			frappe.get_doc(
				{
					"doctype": "Bank Account",
					"account_name": f"Cuadre {tag}",
					"bank": bank,
					"account": self.ledger,
					"company": self.company,
					"is_company_account": 1,
				}
			)
			.insert()
			.name
		)
		start = add_days(today(), -5)
		self.start = start
		self.opening = self._je(add_days(start, -1), 1000)  # books before the bank's movements
		self.b1 = self._bt(start, 500, "SPEI RECIBIDO CLIENTE")
		self.je2 = self._je(start, 500)  # the same money as b1, not linked yet
		self.b2 = self._bt(add_days(start, 1), -200, "COMISION MANEJO DE CUENTA")  # only in the bank
		self.je3 = self._je(add_days(start, 2), 50)  # only in the books

	def tearDown(self):
		frappe.set_user("Administrator")

	def _ledger(self, name):
		parent = frappe.db.get_value(
			"Account", {"company": self.company, "is_group": 1, "account_type": "Bank"}, "name"
		) or frappe.db.get_value(
			"Account", {"company": self.company, "is_group": 1, "root_type": "Asset"}, "name"
		)
		return (
			frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": name,
					"parent_account": parent,
					"company": self.company,
					"account_type": "Bank",
					"account_currency": self.currency,
				}
			)
			.insert()
			.name
		)

	def _je(self, date, amount):
		doc = frappe.get_doc(
			{
				"doctype": "Journal Entry",
				"voucher_type": "Journal Entry",
				"company": self.company,
				"posting_date": date,
				"accounts": [
					{"account": self.ledger, "debit_in_account_currency": amount},
					{"account": self.other, "credit_in_account_currency": amount},
				],
			}
		).insert()
		doc.submit()
		return doc.name

	def _bt(self, date, amount, description):
		doc = frappe.get_doc(
			{
				"doctype": "Bank Transaction",
				"company": self.company,
				"bank_account": self.bank_account,
				"date": date,
				"deposit": amount if amount > 0 else 0,
				"withdrawal": -amount if amount < 0 else 0,
				"currency": self.currency,
				"description": description,
			}
		).insert()
		doc.submit()
		return doc.name

	def test_the_difference_splits_into_its_reasons(self):
		# The bank says 1,200: 900 before the first movement, +500, -200.
		answer = bancos_cuadre.cuadre(self.bank_account, saldo_banco="1,200")
		self.assertEqual(answer["bank_source"], "escrito")
		self.assertEqual(answer["bank"], 1200.0)
		self.assertEqual(answer["books"], 1550.0)
		self.assertEqual(answer["difference"], -350.0)
		self.assertEqual(answer["start"], str(self.start))
		effects = {line["key"]: line["effect"] for line in answer["lines"]}
		self.assertEqual(effects, {"pares": 0.0, "solo_banco": -200.0, "solo_libros": -50.0, "antes": -100.0})
		self.assertEqual(answer["opening"], {"bank": 900.0, "books": 1000.0})
		[found] = answer["pairs"]
		self.assertEqual(found["movimiento"]["name"], self.b1)
		self.assertEqual(
			(found["registro"]["doctype"], found["registro"]["name"]), ("Journal Entry", self.je2)
		)
		self.assertTrue(found["ligable"])
		self.assertEqual([row["name"] for row in answer["only_bank"]], [self.b2])
		self.assertEqual([row["name"] for row in answer["only_books"]], [self.je3])

	def test_without_a_bank_figure_the_reasons_still_show(self):
		answer = bancos_cuadre.cuadre(self.bank_account)
		self.assertIsNone(answer["bank"])
		self.assertIsNone(answer["difference"])
		self.assertEqual({line["key"] for line in answer["lines"]}, {"pares", "solo_banco", "solo_libros"})

	def test_a_typed_balance_that_is_not_a_number_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			bancos_cuadre.cuadre(self.bank_account, saldo_banco="mucho")

	def test_books_without_a_bank_movement(self):
		rows = bancos.movimientos(self.bank_account, vista="libros", filtro="sin_banco")["rows"]
		names = {row["voucher"]["name"] for row in rows}
		self.assertIn(self.je2, names)
		self.assertIn(self.je3, names)
		self.assertNotIn(self.opening, names)  # before the bank's movements: history

	def test_ligar_links_what_the_engine_proposes(self):
		pairs = [
			{"movimiento": self.b1, "doctype": "Journal Entry", "name": self.je2},
			{"movimiento": self.b2, "doctype": "Journal Entry", "name": self.je3},
		]
		answer = bancos_cuadre.ligar(self.bank_account, json.dumps(pairs))
		self.assertNotIn("identificador", json.dumps(answer, ensure_ascii=False))
		# b2 (-200) and je3 (+50) are no pair: no engine proposes it.
		self.assertIn(self.b2, [row["movimiento"] for row in answer["rechazados"]])
		self.assertTrue(all(row["message"] for row in answer["rechazados"]))
		if bancos._contador_module():
			# Contador decides with its own review and period rules; whatever it refuses
			# comes back in words and leaves the movement as it was.
			linked = self.b1 in [row["movimiento"] for row in answer["ligados"]]
			remaining = frappe.db.get_value("Bank Transaction", self.b1, "unallocated_amount")
			self.assertEqual(remaining, 0 if linked else 500)
			return
		self.assertEqual([row["movimiento"] for row in answer["ligados"]], [self.b1])
		self.assertEqual(frappe.db.get_value("Bank Transaction", self.b1, "unallocated_amount"), 0)
		after = bancos_cuadre.cuadre(self.bank_account, saldo_banco="1200")
		self.assertEqual(after["pairs"], [])
		self.assertEqual(after["difference"], -350.0)  # linking moves no money

	def test_request_ids_are_stable_and_in_contadors_shape(self):
		first = bancos_cuadre._request_id("ACC-BTN-2026-00437", "Payment Entry", "ACC-PAY-2026-00182")
		self.assertEqual(
			first, bancos_cuadre._request_id("ACC-BTN-2026-00437", "Payment Entry", "ACC-PAY-2026-00182")
		)
		self.assertRegex(first, r"^[A-Za-z0-9-]{8,64}$")

	def test_a_link_lost_with_the_transaction_reads_as_refused(self):
		# The engine rolled the whole transaction back (a deadlock): what this call linked
		# before is gone too, so nothing reads as linked.
		from unittest.mock import patch

		pairs = [
			{"movimiento": self.b1, "doctype": "Journal Entry", "name": self.je2},
			{"movimiento": self.b2, "doctype": "Journal Entry", "name": self.je3},
		]
		answers = iter([{"ok": True, "state": "Reconciled"}, {"ok": False, "message": "cambió"}])
		detail = {"can": {"conciliar": True}, "scope": "near"}

		def movimiento(name):
			wanted = self.je2 if name == self.b1 else self.je3
			return {**detail, "candidates": [{"doctype": "Journal Entry", "name": wanted}]}

		def rollback(save_point=None, **kwargs):
			if save_point:
				raise RuntimeError("(1305, SAVEPOINT does not exist)")

		with (
			patch.object(bancos, "movimiento", movimiento),
			patch.object(bancos, "conciliar", lambda *a, **k: next(answers)),
			patch.object(frappe.db, "rollback", rollback),
		):
			answer = bancos_cuadre.ligar(self.bank_account, pairs)
		self.assertEqual(answer["ligados"], [])
		self.assertTrue(answer["perdido"])
		self.assertEqual(
			sorted(row["movimiento"] for row in answer["rechazados"]), sorted([self.b1, self.b2])
		)

	def test_a_pair_from_another_account_is_refused(self):
		answer = bancos_cuadre.ligar(
			self.bank_account,
			[{"movimiento": "ACC-BTN-NO-EXISTE", "doctype": "Journal Entry", "name": self.je2}],
		)
		self.assertEqual(answer["ligados"], [])
		self.assertEqual(answer["rechazados"][0]["movimiento"], "ACC-BTN-NO-EXISTE")

	def test_a_worker_without_accounting_roles_is_refused(self):
		user = "cuadre-sin-roles@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc(
				{"doctype": "User", "email": user, "first_name": "Sin roles", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		frappe.set_user(user)
		with self.assertRaises(frappe.PermissionError):
			bancos_cuadre.cuadre(self.bank_account)
		with self.assertRaises(frappe.PermissionError):
			bancos_cuadre.ligar(self.bank_account, "[]")
