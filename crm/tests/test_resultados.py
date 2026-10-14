"""Resultados composes the owning apps' cards: per-card refusal and failure,
margin only for cost readers, Company User Permission scope, a per-user cache
that a submitted or cancelled sale retires."""

from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.resultados_routes import is_resultados_path

try:
	import frappe

	from crm.api import resultados

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


def failing_card(ctx):
	raise RuntimeError("provider down")


def plain_card(ctx):
	return {"label": "Plain", "format": "count", "value": 3, "attention": None}


def refusing_card(ctx):
	frappe.throw("Ask for the plain permission.", frappe.PermissionError)


class TestResultadosPaths(TestCase):
	def test_board_lens_and_ticket_paths(self):
		for path in (
			"/crm/resultados",
			"/crm/resultados/",
			"/crm/resultados?periodo=mes&compara=anterior&tienda=T1",
			"/crm/resultados/documentos?tipo=ventas&periodo=hoy",
			"/crm/resultados/documento/Sales%20Invoice/ACC-SINV-2026-00001",
		):
			with self.subTest(path=path):
				self.assertTrue(is_resultados_path(path))

	def test_gate_rejects_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/resultados-x",
			"/crm/resultados/otra",
			"/crm/resultados/documento/Sales Invoice",
			"//evil.invalid/crm/resultados",
			"https://evil.invalid/crm/resultados",
			"/crm/resultados\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_resultados_path(path))


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestResultadosQuery(TestCase):
	def test_unknown_values_fall_back_and_text_is_capped(self):
		q = resultados.query("year", "<b>", "  C1 ", "x" * 500)
		self.assertEqual((q["periodo"], q["compara"], q["empresa"]), ("mes", "anterior", "C1"))
		self.assertEqual(len(q["tienda"]), resultados.MAX_TEXT)

	def test_cache_key_names_user_card_query_and_generation(self):
		q = resultados.query("hoy", "anio", "C1", "T1")
		self.assertEqual(
			resultados.cache_key("a@x", "ventas", q, 7), "resultados:a@x:ventas:hoy:anio:C1:T1:7"
		)


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestResultadosBoard(TestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# The fixtures live in Mercado's own test module. An older Mercado (the
		# pinned CI image carries one) has the app installed but not that module,
		# so ask the import, not the app list.
		try:
			from mercado.tests.test_resultados_cards import ensure_resultados_fixtures
		except ImportError:
			cls.has_mercado = False
			return
		cls.has_mercado = True
		ensure_resultados_fixtures()

	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")
		frappe.local._resultados_cards = None

	def tearDown(self):
		frappe.set_user(self.previous)
		frappe.local._resultados_cards = None

	def need_mercado(self):
		if not self.has_mercado:
			self.skipTest("Mercado provides the sales cards")
		from mercado.tests import test_resultados_cards as fixtures

		return fixtures

	def card(self, out, key):
		return next((c for c in out["cards"] if c["key"] == key), None)

	# -- composition ---------------------------------------------------------

	def test_cards_come_in_board_order_with_their_drills(self):
		self.need_mercado()
		out = resultados.board(periodo="mes")
		keys = [c["key"] for c in out["cards"]]
		self.assertEqual(keys[:4], ["ventas", "margen", "efectivo", "por_cobrar"])
		self.assertEqual(out["query"], {"periodo": "mes", "compara": "anterior", "empresa": "", "tienda": ""})
		ventas = self.card(out, "ventas")
		self.assertIsInstance(ventas["value"], float)
		self.assertEqual(ventas["drill"]["path"], "/crm/resultados/documentos")
		self.assertEqual(self.card(out, "por_cobrar")["drill"]["path"], "/crm/cobranza")
		self.assertTrue(out["scope"]["companies"])
		self.assertTrue(out["period"]["from"])

	def test_a_failing_provider_yields_one_blocked_card(self):
		providers = [
			("ventas", "crm.tests.test_resultados.failing_card"),
			("efectivo", "crm.tests.test_resultados.refusing_card"),
			("reparaciones", "crm.tests.test_resultados.plain_card"),
		]
		with patch.object(resultados, "_providers", return_value=providers):
			out = resultados.board(periodo="hoy", compara="no")
		ventas, efectivo, plain = out["cards"]
		self.assertEqual(ventas["key"], "ventas")
		self.assertTrue(ventas["blocked_reason"])
		self.assertTrue(ventas["retry"])
		self.assertNotIn("value", ventas)
		self.assertEqual(efectivo["blocked_reason"], "Ask for the plain permission.")
		self.assertFalse(efectivo["retry"])
		self.assertEqual((plain["key"], plain["value"]), ("reparaciones", 3))
		# A failure is never cached: the retry asks the provider again.
		gen = resultados.generation()
		q = resultados.query("hoy", "no")
		self.assertIsNone(frappe.cache.get_value(resultados.cache_key("Administrator", "ventas", q, gen)))
		self.assertIsNotNone(
			frappe.cache.get_value(resultados.cache_key("Administrator", "reparaciones", q, gen))
		)

	# -- margin ----------------------------------------------------------------

	def test_sales_manager_without_gross_profit_gets_no_margin(self):
		fixtures = self.need_mercado()
		frappe.set_user(fixtures.SALES_MANAGER)
		out = resultados.board(periodo="mes")
		margen = self.card(out, "margen")
		self.assertTrue(margen["blocked_reason"])
		for field in ("value", "prev", "facts", "items"):
			self.assertNotIn(field, margen)
		self.assertIn("value", self.card(out, "ventas"))
		frappe.set_user(fixtures.ACCOUNTANT)
		self.assertIn("value", self.card(resultados.board(periodo="mes"), "margen"))

	# -- scope -----------------------------------------------------------------

	def test_company_user_permission_bounds_the_board(self):
		fixtures = self.need_mercado()
		company = fixtures.pick_company()
		user = fixtures.ensure_user(
			"resultados-crm-co@example.invalid", ["Sales Manager", fixtures.READER_ROLE]
		)
		fixtures._grant(user, fixtures.SHOP_A)
		if not frappe.db.exists("User Permission", {"user": user, "allow": "Company", "for_value": company}):
			frappe.get_doc(
				{"doctype": "User Permission", "user": user, "allow": "Company", "for_value": company}
			).insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.set_user(user)
		out = resultados.board(periodo="mes")
		self.assertEqual(out["scope"]["companies"], [company])
		self.assertEqual([s["name"] for s in out["scope"]["shops"]], [fixtures.SHOP_A])
		outside = resultados.board(periodo="mes", empresa="Not My Company")
		ventas = self.card(outside, "ventas")
		self.assertTrue(ventas["blocked_reason"])
		self.assertNotIn("value", ventas)

	def test_shop_supervisor_only_sees_their_shop(self):
		fixtures = self.need_mercado()
		frappe.set_user(fixtures.SUPERVISOR)
		out = resultados.board(periodo="mes", tienda=fixtures.SHOP_B)
		self.assertTrue(self.card(out, "ventas")["blocked_reason"])
		self.assertEqual([s["name"] for s in resultados.board()["scope"]["shops"]], [fixtures.SHOP_A])

	# -- cache -----------------------------------------------------------------

	def test_cache_is_per_user(self):
		fixtures = self.need_mercado()
		resultados.board(periodo="semana")
		gen = resultados.generation()
		q = resultados.query("semana")
		mine = frappe.cache.get_value(resultados.cache_key("Administrator", "margen", q, gen))
		self.assertIn("value", mine)
		frappe.set_user(fixtures.SALES_MANAGER)
		theirs = self.card(resultados.board(periodo="semana"), "margen")
		self.assertTrue(theirs["blocked_reason"])
		self.assertTrue(
			frappe.cache.get_value(resultados.cache_key(fixtures.SALES_MANAGER, "margen", q, gen))[
				"blocked_reason"
			]
		)

	def test_submit_and_cancel_move_the_generation_and_refresh_the_numbers(self):
		fixtures = self.need_mercado()
		before = self.card(resultados.board(periodo="hoy", tienda=fixtures.SHOP_A), "ventas")["value"]
		gen = resultados.generation()
		sale = fixtures.make_sale(fixtures.PROFILE_A, 135)
		frappe.db.commit()
		self.assertEqual(resultados.generation(), gen + 1)
		after = self.card(resultados.board(periodo="hoy", tienda=fixtures.SHOP_A), "ventas")["value"]
		self.assertAlmostEqual(after - before, sale.grand_total, places=2)
		sale.reload()
		sale.flags.ignore_permissions = True
		sale.cancel()
		frappe.db.commit()
		self.assertEqual(resultados.generation(), gen + 2)
		again = self.card(resultados.board(periodo="hoy", tienda=fixtures.SHOP_A), "ventas")["value"]
		self.assertAlmostEqual(again, before, places=2)

	# -- documents lens ----------------------------------------------------------

	def test_documents_delegate_to_the_lens_with_the_same_query(self):
		fixtures = self.need_mercado()
		sale = fixtures.make_sale(fixtures.PROFILE_A, 90)
		frappe.db.commit()
		out = resultados.documents(tipo="ventas", periodo="hoy", tienda=fixtures.SHOP_A)
		self.assertIn(sale.name, {r["name"] for r in out["rows"]})
		self.assertEqual(out["query"]["tipo"], "ventas")
		ticket = resultados.document("Sales Invoice", sale.name)
		self.assertEqual(ticket["name"], sale.name)
		with self.assertRaises(frappe.PermissionError):
			resultados.document("User", "Administrator")
		frappe.set_user(fixtures.CASHIER)
		with self.assertRaises(frappe.PermissionError):
			resultados.documents(tipo="ventas")
