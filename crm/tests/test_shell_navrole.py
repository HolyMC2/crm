"""DD18: each worker's bottom bar and boot copy come from their puesto, roles and permissions."""

# ci: shell-apis
from unittest import TestCase, skipIf

try:
	import frappe

	from crm.api import shell

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False

USER = "d1-navrole@example.test"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestNavRole(TestCase):
	def test_the_puesto_wins_when_it_maps(self):
		self.assertEqual(shell.nav_role("Cajero", ["Sales User"]), "cajero")
		self.assertEqual(shell.nav_role("Técnico", ["Sales User"]), "recepcion")
		self.assertEqual(shell.nav_role("Encargado", []), "dueno")
		self.assertEqual(shell.nav_role("Dueño", []), "dueno")

	def test_without_a_puesto_the_roles_decide(self):
		self.assertEqual(shell.nav_role(None, ["Stock User"]), "almacen")
		self.assertEqual(shell.nav_role(None, ["Purchase User", "Stock User"]), "compras")
		self.assertEqual(shell.nav_role(None, ["Sales User", "Stock User"]), "vendedor")
		self.assertEqual(shell.nav_role(None, ["POS User", "Sales User", "Stock User"]), "cajero")
		self.assertEqual(shell.nav_role(None, ["Accounts Manager", "Sales User"]), "dueno")
		# Who keeps the books: Contador's role (even with Accounts Manager) or Accounts User.
		self.assertEqual(shell.nav_role(None, ["Contador", "Accounts Manager"]), "contador")
		self.assertEqual(shell.nav_role(None, ["Accounts User", "Sales User"]), "contador")
		self.assertEqual(shell.nav_role(None, ["System Manager", "Contador"]), "dueno")
		# A puesto still wins over the accounting roles.
		self.assertEqual(shell.nav_role("Encargado", ["Accounts User"]), "dueno")
		# An unknown puesto falls through to the roles, nothing to a plain bar.
		self.assertEqual(shell.nav_role("Repartidor", ["Stock User"]), "almacen")
		self.assertIsNone(shell.nav_role(None, ["Guest", "All"]))

	def test_a_module_hint_beats_the_roles_but_not_the_puesto(self):
		# Inmobiliaria workers also hold Sales User; their module names their bar.
		self.assertEqual(shell.nav_role(None, ["Sales User"], "inmobiliaria"), "inmobiliaria")
		self.assertEqual(shell.nav_role("Cajero", ["Sales User"], "inmobiliaria"), "cajero")
		modules = {
			"inmobiliaria": {"key": "inmobiliaria", "enabled": True, "nav_role": "inmobiliaria"},
			"ventas": {"key": "ventas", "enabled": True},
		}
		self.assertEqual(shell._module_nav_hint(modules), "inmobiliaria")
		modules["inmobiliaria"]["enabled"] = False
		self.assertIsNone(shell._module_nav_hint(modules))

	def test_every_class_is_a_contracts_nav_role(self):
		known = {"vendedor", "recepcion", "compras", "dueno", "inmobiliaria", "almacen", "cajero", "contador"}
		self.assertLessEqual(set(shell.NAV_ROLES.values()), known)
		self.assertLessEqual({klass for _, klass in shell.ROLE_NAV_ROLES}, known)


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestScopeHash(TestCase):
	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": USER,
					"first_name": "Navrole",
					"send_welcome_email": 0,
					"roles": [{"role": "Stock User"}],
				}
			).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user(self.previous)
		frappe.db.rollback()

	def test_a_role_change_changes_the_scope(self):
		before = shell.scope_hash(USER)
		self.assertRegex(before, r"^[0-9a-f]{12}$")
		self.assertEqual(shell.scope_hash(USER), before)
		frappe.get_doc("User", USER).add_roles("Purchase User")
		frappe.clear_cache(user=USER)
		self.assertNotEqual(shell.scope_hash(USER), before)

	def test_a_user_permission_changes_the_scope(self):
		before = shell.scope_hash(USER)
		company = frappe.db.exists("DocType", "Company") and frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("no Company on this site")
		frappe.get_doc(
			{"doctype": "User Permission", "user": USER, "allow": "Company", "for_value": company}
		).insert(ignore_permissions=True)
		self.assertNotEqual(shell.scope_hash(USER), before)

	def test_guest_has_no_scope(self):
		self.assertEqual(shell.scope_hash("Guest"), "")

	def test_the_boot_carries_the_scope_and_the_class(self):
		data = shell.boot()
		self.assertEqual(data["scope"], shell.scope_hash("Administrator"))
		self.assertEqual(data["user"]["nav_role"], "dueno")
