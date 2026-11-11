"""Mi cuenta and Mi perfil: who the server gate lets in, and what the shell boot carries.

The path predicates and the permission checks run without a bench (crm/api/cuenta.py is
loaded with a stub Frappe and a stub doco); the gate cases need Frappe and skip without it.
"""

import importlib.util
import sys
import types
from pathlib import Path
from unittest import TestCase, skipIf
from unittest.mock import patch

from crm.cuenta_routes import is_cuenta_path, is_perfil_path

try:
	import frappe

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False

CUENTA = Path(__file__).resolve().parents[1] / "api" / "cuenta.py"


class TestAccountPaths(TestCase):
	def test_cuenta_with_its_tabs_and_sheets(self):
		for path in (
			"/crm/cuenta",
			"/crm/cuenta/",
			"/crm/cuenta?tab=facturacion",
			"/crm/cuenta?activar=1",
			"/crm/cuenta?tab=resumen&activar=1",
		):
			with self.subTest(path=path):
				self.assertTrue(is_cuenta_path(path))
				self.assertFalse(is_perfil_path(path))

	def test_perfil(self):
		for path in ("/crm/perfil", "/crm/perfil/", "/crm/perfil?seccion=preferencias"):
			with self.subTest(path=path):
				self.assertTrue(is_perfil_path(path))
				self.assertFalse(is_cuenta_path(path))

	def test_gate_rejects_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/cuentas",
			"/crm/cuenta/facturas/INV-1",
			"/crm/perfil/otro",
			"/crm/deals/X",
			"//evil.invalid/crm/cuenta",
			"https://evil.invalid/crm/perfil",
			"/crm/cuenta\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_cuenta_path(path))
				self.assertFalse(is_perfil_path(path))


# Who the shell boots for: staff accounts. A storefront customer is a Website User.
USER_TYPES = {"website@example.test": "Website User"}


class StubFrappe(types.ModuleType):
	def __init__(self, apps, user="owner@example.test"):
		super().__init__("frappe")
		self.apps = apps
		self.session = types.SimpleNamespace(user=user)
		self.logged = []

	def get_installed_apps(self):
		return list(self.apps)

	def get_cached_value(self, doctype, name, field):
		assert (doctype, field) == ("User", "user_type")
		return USER_TYPES.get(name, "System User")

	def logger(self, name):
		return types.SimpleNamespace(exception=lambda message: self.logged.append(message))


def stub_doco(roles, plan=None, fail=False, linked=True, legacy=False):
	"""doco.docoutils.plan_state with the role rule doco ships (PANEL_ROLES); `legacy` is a
	doco that does not answer `available` yet."""
	module = types.ModuleType("doco.docoutils.plan_state")

	def can_open_plan(user):
		return user == "Administrator" or bool(set(roles.get(user, ())) & {"System Manager", "Mi Plan"})

	def shell_account(user):
		if fail:
			raise RuntimeError("cache down")
		allowed = linked and can_open_plan(user)
		answer = {"cuenta": allowed, "plan": plan if allowed else None}
		return answer if legacy else {**answer, "available": linked}

	module.can_open_plan = can_open_plan
	module.shell_account = shell_account
	doco = types.ModuleType("doco")
	doco.__path__ = []
	docoutils = types.ModuleType("doco.docoutils")
	docoutils.__path__ = []
	docoutils.plan_state = module
	return {"doco": doco, "doco.docoutils": docoutils, "doco.docoutils.plan_state": module}


def load_cuenta(frappe_stub, doco_modules):
	modules = {"frappe": frappe_stub, **doco_modules}
	with patch.dict(sys.modules, modules):
		spec = importlib.util.spec_from_file_location("crm_api_cuenta_under_test", CUENTA)
		module = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(module)
	return module, modules


ROLES = {
	"owner@example.test": ["System Manager"],
	"books@example.test": ["Mi Plan"],
	"cashier@example.test": ["POS User", "Employee"],
}


class TestAccountPermissions(TestCase):
	def check(self, user, apps=("frappe", "crm", "doco"), doco=None, method="check_cuenta_permission"):
		stub = StubFrappe(apps, user)
		module, modules = load_cuenta(stub, stub_doco(ROLES) if doco is None else doco)
		with patch.dict(sys.modules, modules):
			return getattr(module, method)()

	def test_owner_and_mi_plan_delegate_open_cuenta_without_ventas(self):
		self.assertTrue(self.check("owner@example.test"))
		self.assertTrue(self.check("books@example.test"))
		self.assertTrue(self.check("Administrator"))

	def test_cashier_and_guest_do_not(self):
		self.assertFalse(self.check("cashier@example.test"))
		self.assertFalse(self.check("Guest"))

	def test_without_doco_there_is_no_cuenta(self):
		self.assertFalse(self.check("owner@example.test", apps=("frappe", "crm")))
		# Installed but older (no plan_state): still no account to open.
		self.assertFalse(self.check("owner@example.test", doco={}))

	def test_perfil_for_every_staff_account(self):
		for user in ("owner@example.test", "books@example.test", "cashier@example.test"):
			with self.subTest(user=user):
				self.assertTrue(self.check(user, method="check_perfil_permission"))
		self.assertTrue(self.check("cashier@example.test", apps=("crm",), method="check_perfil_permission"))

	def test_no_perfil_for_a_storefront_customer_or_a_guest(self):
		# The shell boot refuses a Website User (no module opens), so the page would never load.
		self.assertFalse(self.check("website@example.test", method="check_perfil_permission"))
		self.assertFalse(self.check("Guest", method="check_perfil_permission"))


PLAN = {"plan": "Pro", "is_trial": True, "trial_days_left": 5, "overdue_count": 0}


CLOSED = {"cuenta": False, "available": False, "plan": None}


class TestAccountBoot(TestCase):
	def account(self, user, apps=("frappe", "crm", "doco"), **doco):
		stub = StubFrappe(apps, user)
		module, modules = load_cuenta(stub, stub_doco(ROLES, plan=PLAN, **doco))
		with patch.dict(sys.modules, modules):
			return module.account(), stub

	def test_owner_gets_the_plan_summary(self):
		answer, _ = self.account("owner@example.test")
		self.assertEqual(answer, {"cuenta": True, "available": True, "plan": PLAN})

	def test_others_get_no_plan_data(self):
		self.assertEqual(
			self.account("cashier@example.test")[0], {"cuenta": False, "available": True, "plan": None}
		)
		self.assertEqual(self.account("Guest")[0], CLOSED)

	def test_a_site_without_a_platform_link_opens_no_account(self):
		# Every relay would refuse there: the doors hide and the page says it has no plan.
		self.assertEqual(self.account("owner@example.test", linked=False)[0], CLOSED)

	def test_a_doco_that_does_not_answer_available_still_opens(self):
		answer, _ = self.account("owner@example.test", legacy=True)
		self.assertEqual(answer, {"cuenta": True, "available": True, "plan": PLAN})

	def test_without_doco_or_on_failure_the_boot_still_answers(self):
		self.assertEqual(self.account("owner@example.test", apps=("crm",))[0], CLOSED)
		answer, stub = self.account("owner@example.test", fail=True)
		self.assertEqual(answer, CLOSED)
		self.assertEqual(stub.logged, ["account boot failed"])


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestAccountEntry(TestCase):
	"""The server gate: an owner without Ventas reaches Mi cuenta; anyone reaches Mi perfil."""

	def gate(self, path, cuenta=False, system_user=True, available=True):
		from crm.www import crm as entry

		flags = frappe._dict()
		with (
			patch.object(frappe, "session", frappe._dict(user="clerk@example.invalid")),
			patch.object(frappe.local, "flags", flags),
			patch("crm.api.check_app_permission", return_value=False),
			patch("crm.api.contactos.check_contactos_permission", return_value=False),
			patch("crm.api.cuenta.cuenta_available", return_value=available),
			patch("crm.api.cuenta.check_cuenta_permission", return_value=cuenta),
			patch.object(
				frappe, "get_cached_value", return_value="System User" if system_user else "Website User"
			),
			patch("crm.api.shell.first_module", return_value=None),
		):
			try:
				return entry._gate(path), None
			except frappe.Redirect:
				return None, flags.redirect_location

	def test_mi_plan_delegate_without_ventas_gets_the_neutral_boot(self):
		self.assertEqual(self.gate("/crm/cuenta?activar=1", cuenta=True), ((True, "cuenta"), None))

	def test_a_work_account_gets_the_page_guard_not_the_plan(self):
		self.assertEqual(self.gate("/crm/cuenta"), ((True, "cuenta"), None))

	def test_a_website_user_without_the_role_recovers(self):
		self.assertEqual(
			self.gate("/crm/cuenta", system_user=False),
			(None, "/crm/not-permitted?intended=%2Fcuenta"),
		)

	def test_without_doco_cuenta_does_not_exist(self):
		with self.assertRaises(frappe.DoesNotExistError):
			self.gate("/crm/cuenta", cuenta=True, available=False)

	def test_perfil_for_a_staff_account_without_any_module(self):
		self.assertEqual(self.gate("/crm/perfil"), ((True, "perfil"), None))

	def test_a_storefront_customer_on_perfil_recovers(self):
		self.assertEqual(
			self.gate("/crm/perfil", system_user=False),
			(None, "/crm/not-permitted?intended=%2Fperfil"),
		)
