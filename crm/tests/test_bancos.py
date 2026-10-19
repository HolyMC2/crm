# ci: shell-apis
"""Bancos y catálogo de cuentas (Shell D11): worker words, the entry gate, permissions."""

from unittest import TestCase, skipIf

from crm.bancos_routes import is_bancos_path
from crm.bancos_words import (
	account_display,
	last4,
	movement_words,
	natural_sign,
	parse_amount,
	reference_key,
	root_word,
	voucher_word,
)

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import bancos

	HAS_FRAPPE = True
except ImportError:  # bench-free run: only the words and path tests
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


class TestBancosWords(TestCase):
	def test_statement_lines_read_as_a_bank_app(self):
		self.assertEqual(
			movement_words("SPEI RECIBIDOMERCADO PAGO | liquidación 17/ABR | corte 2026-04-20", None, 190),
			{"title": "Transferencia recibida", "detail": "Mercado Pago"},
		)
		self.assertEqual(
			movement_words("COMISION MANEJO DE CUENTA", None, -150),
			{"title": "Comisión del banco", "detail": "Manejo de Cuenta"},  # «DE» stays small
		)
		self.assertEqual(
			movement_words("PAGO REFERENCIADO SAT", None, -900)["title"],
			"Pago al SAT",
		)

	def test_party_leads_and_kind_follows(self):
		self.assertEqual(
			movement_words("SPEI ENVIADO ACME", "Acme Distribuidora", -775),
			{"title": "Acme Distribuidora", "detail": "Transferencia enviada"},
		)
		self.assertEqual(movement_words("", "Acme", 10)["detail"], "Entrada")

	def test_unknown_or_empty_lines(self):
		self.assertEqual(movement_words("ABONO VARIOS", None, 5), {"title": "Abono Varios", "detail": ""})
		self.assertEqual(movement_words("", None, -5), {"title": "Salida", "detail": ""})
		self.assertEqual(movement_words(None, None, 5), {"title": "Entrada", "detail": ""})

	def test_last4_and_display(self):
		self.assertEqual(last4("012180001234569775"), "9775")
		self.assertEqual(last4("**** 3697"), "3697")
		self.assertEqual(last4(None), "")
		self.assertEqual(account_display("BBVA Debito - GD", "GD"), "BBVA Debito")
		self.assertEqual(account_display("Bancos - GDX", "GD"), "Bancos - GDX")
		self.assertEqual(
			account_display("UTILIZACIÓN DE FONDOS (ACTIVOS) - GD", "GD"), "Utilización de fondos (activos)"
		)
		self.assertEqual(account_display("IVA ACREDITABLE - GD", "GD"), "IVA acreditable")
		self.assertEqual(account_display("Mercado Pago Débito"), "Mercado Pago Débito")

	def test_signs_roots_and_vouchers(self):
		self.assertEqual(natural_sign("Asset"), 1)
		self.assertEqual(natural_sign("Expense"), 1)
		self.assertEqual(natural_sign("Liability"), -1)
		self.assertEqual(natural_sign("Income"), -1)
		self.assertEqual(root_word("Equity"), "Capital")
		self.assertEqual(root_word(None), "")
		self.assertEqual(voucher_word("Payment Entry", "Receive"), "Cobro")
		self.assertEqual(voucher_word("Payment Entry", "Pay"), "Pago")
		self.assertEqual(voucher_word("Journal Entry"), "Póliza")
		self.assertEqual(voucher_word("Something Else"), "Documento")

	def test_references_and_amounts(self):
		self.assertEqual(reference_key("0118-220827"), reference_key("118220827"))
		self.assertEqual(parse_amount("$1,500"), 1500.0)
		self.assertEqual(parse_amount("-775.50"), 775.5)
		self.assertEqual(parse_amount("−190"), 190.0)
		self.assertIsNone(parse_amount("0118220827"))
		self.assertIsNone(parse_amount("Mercado Pago"))
		self.assertIsNone(parse_amount(""))


class TestBancosPaths(TestCase):
	def test_gate_accepts_bancos_pages(self):
		for path in (
			"/crm/bancos",
			"/crm/bancos/",
			"/crm/bancos/cuenta/BBVA%20Debito%20-%20BBVA%20Mexico",
			"/crm/bancos/catalogo",
			"/crm/bancos/catalogo/Bancos%20-%20GD",
			"/crm/bancos/balanza",
			"/crm/bancos/balanza?periodo=mes",
		):
			with self.subTest(path=path):
				self.assertTrue(is_bancos_path(path))

	def test_gate_rejects_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/bancosx",
			"/crm/bancos/cuenta",
			"/crm/bancos/cuenta/a/b",
			"/crm/bancos/catalogo/a/b",
			"//evil.invalid/crm/bancos",
			"https://evil.invalid/crm/bancos",
			"/crm/bancos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_bancos_path(path))


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestBancosAccess(IntegrationTestCase):
	"""Frappe permissions are the wall: a worker without accounting roles is refused."""

	USER = "bancos-sin-roles@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not bancos._erpnext():
			self.skipTest("ERPNext is not installed")
		if not frappe.db.exists("User", self.USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": self.USER,
					"first_name": "Sin roles",
					"send_welcome_email": 0,
				}
			).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_manager_sees_the_module(self):
		answer = bancos.get_capabilities()
		self.assertTrue(answer["enabled"])
		self.assertTrue(answer["capabilities"]["bancos"])
		self.assertTrue(answer["capabilities"]["catalogo"])

	def test_worker_without_roles_is_refused(self):
		frappe.set_user(self.USER)
		answer = bancos.get_capabilities()
		self.assertFalse(answer["enabled"])
		self.assertTrue(answer["reason"])
		self.assertFalse(bancos.check_bancos_permission())
		with self.assertRaises(frappe.PermissionError):
			bancos.cuentas()
		with self.assertRaises(frappe.PermissionError):
			bancos.catalogo()

	def test_seller_reading_account_names_is_still_refused(self):
		"""ERPNext lets a Sales User read Account (pickers); that alone does not open Bancos."""
		user = frappe.get_doc("User", self.USER)
		user.add_roles("Sales User")
		try:
			frappe.set_user(self.USER)
			answer = bancos.get_capabilities()
			self.assertFalse(answer["capabilities"]["catalogo"])
			self.assertEqual(answer["enabled"], answer["capabilities"]["bancos"])
		finally:
			frappe.set_user("Administrator")
			user.remove_roles("Sales User")

	def test_catalogo_lists_roots_of_a_company(self):
		company = frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No company on this site")
		answer = bancos.catalogo(company=company)
		self.assertIsInstance(answer, dict)
