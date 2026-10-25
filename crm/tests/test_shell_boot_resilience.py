"""A module whose builder raises degrades to «unavailable»; the shell still boots."""

from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe

	from crm.api import shell

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


def _off(key):
	return lambda: {"key": key, "enabled": False, "reason": "off", "capabilities": {}}


def _taller():
	"""A `muelle_shell_modules` hook provider of another app that raises before naming its module."""
	raise RuntimeError("taller is broken")


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestShellBootResilience(TestCase):
	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user(self.previous)

	def _logs(self, key):
		return frappe.get_all(
			"Error Log", filters={"method": f"shell boot {key}"}, fields=["error"], order_by="creation desc"
		)

	def test_contactos_builder_error_degrades_contactos_only_and_is_logged(self):
		logged = len(self._logs("contactos"))
		with patch.object(shell, "_contactos", side_effect=RuntimeError("tienda setting has no column")):
			data = shell.boot()
		contactos = data["modules"]["contactos"]
		self.assertEqual(contactos["state"], "unavailable")
		self.assertFalse(contactos["enabled"])
		self.assertEqual(contactos["reason_code"], "error")
		self.assertTrue(contactos["retry"])
		self.assertIn("Contactos", contactos["reason_text"])
		self.assertEqual(contactos["reason"], contactos["reason_text"])
		self.assertIsNone(contactos["resolve"])
		self.assertEqual(contactos["capabilities"], {})
		self.assertFalse(data["capabilities"]["directory"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])
		self.assertEqual(data["modules"]["ventas"]["state"], "ready")
		logs = self._logs("contactos")
		self.assertEqual(len(logs), logged + 1)
		self.assertIn("tienda setting has no column", logs[0]["error"])

	def test_contactos_settings_read_error_leaves_contactos_unavailable_not_the_shell(self):
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Contactos (doco) is not installed")
		with patch(
			"doco.contactos.api.bootstrap", side_effect=Exception("Contactos Settings: unknown column")
		):
			data = shell.boot()
			landing = shell.first_module()
		self.assertEqual(data["modules"]["contactos"]["state"], "unavailable")
		self.assertEqual(data["modules"]["contactos"]["reason_code"], "error")
		self.assertTrue(data["modules"]["ventas"]["enabled"])
		self.assertNotEqual(landing, "contactos")

	def test_permission_error_names_the_owner_and_keeps_the_module_closed(self):
		logged = len(self._logs("contactos"))
		with (
			patch.object(shell, "_contactos", side_effect=frappe.PermissionError),
			patch.object(shell, "_owner_name", return_value="Marco Pérez"),
		):
			data = shell.boot()
		contactos = data["modules"]["contactos"]
		self.assertEqual(contactos["state"], "unavailable")
		self.assertFalse(contactos["enabled"])
		self.assertEqual(contactos["reason_code"], "permission")
		self.assertTrue(contactos["retry"])
		self.assertIn("Contactos", contactos["reason_text"])
		self.assertIn("Marco Pérez", contactos["reason_text"])
		self.assertEqual(contactos["capabilities"], {})
		self.assertFalse(data["capabilities"]["directory"])
		self.assertEqual(len(self._logs("contactos")), logged + 1)

	def test_permission_error_without_an_owner_still_says_who_to_ask(self):
		with (
			patch.object(shell, "_contactos", side_effect=frappe.PermissionError),
			patch.object(shell, "_owner_name", return_value=None),
		):
			contactos = shell.boot()["modules"]["contactos"]
		self.assertEqual(contactos["reason_code"], "permission")
		self.assertIn("Contactos", contactos["reason_text"])

	def test_missing_app_says_the_shop_does_not_have_the_module_yet(self):
		with patch.object(shell, "_inmobiliaria", side_effect=ImportError("No module named 'inmobiliaria'")):
			entry = shell.boot()["modules"]["inmobiliaria"]
		self.assertEqual(entry["state"], "unavailable")
		self.assertEqual(entry["reason_code"], "missing_app")
		self.assertFalse(entry["retry"])
		self.assertIn("Inmobiliaria", entry["reason_text"])

	def test_error_detail_is_for_admins_only(self):
		with patch.object(shell, "_contactos", side_effect=RuntimeError("secret column name")):
			as_admin = shell.boot()["modules"]["contactos"]
			with patch.object(frappe, "get_roles", return_value=["Sales User", "Sales Manager"]):
				as_worker = shell.boot()["modules"]["contactos"]
		self.assertEqual(as_admin["detail"], "RuntimeError: secret column name")
		self.assertNotIn("detail", as_worker)
		self.assertNotIn("secret column name", as_worker["reason_text"])

	def test_ready_and_off_entries_carry_their_state(self):
		with patch.object(shell, "_contactos", _off("contactos")):
			data = shell.boot()
		self.assertEqual(data["modules"]["contactos"]["state"], "off")
		self.assertEqual(data["modules"]["contactos"]["reason_text"], "off")
		self.assertFalse(data["modules"]["contactos"]["retry"])
		self.assertIsNone(data["modules"]["contactos"]["reason_code"])
		self.assertEqual(data["modules"]["ventas"]["state"], "ready")
		self.assertIsNone(data["modules"]["ventas"]["reason_text"])

	def test_first_module_skips_a_module_whose_builder_raises(self):
		with patch.object(shell, "_hoy", side_effect=RuntimeError("hoy is broken")):
			landing = shell.first_module()
		self.assertNotEqual(landing, "hoy")

	def test_a_raising_hook_provider_is_unavailable_under_its_own_name(self):
		real_hooks = frappe.get_hooks

		def hooks(hook=None, *args, **kwargs):
			if hook == "muelle_shell_modules":
				return ["crm.tests.test_shell_boot_resilience._taller"]
			return real_hooks(hook, *args, **kwargs)

		with patch.object(frappe, "get_hooks", side_effect=hooks):
			entry = shell.boot()["modules"]["taller"]
		self.assertEqual(entry["state"], "unavailable")
		self.assertEqual(entry["reason_code"], "error")

	def test_two_hook_providers_with_the_same_function_name_both_boot(self):
		real_hooks, real_attr = frappe.get_hooks, frappe.get_attr
		paths = {
			"doco.taller.shell._shell": lambda: {"key": "taller", "enabled": True, "capabilities": {}},
			"mercado.shell._shell": lambda: {"key": "mercado", "enabled": True, "capabilities": {}},
		}

		def hooks(hook=None, *args, **kwargs):
			return list(paths) if hook == "muelle_shell_modules" else real_hooks(hook, *args, **kwargs)

		with (
			patch.object(frappe, "get_hooks", side_effect=hooks),
			patch.object(frappe, "get_attr", side_effect=lambda path: paths.get(path) or real_attr(path)),
		):
			modules = shell.boot()["modules"]
		self.assertEqual(modules["taller"]["state"], "ready")
		self.assertEqual(modules["mercado"]["state"], "ready")

	def test_the_boot_endpoints_own_errors_still_raise(self):
		with patch.object(shell, "_palette", side_effect=RuntimeError("palette is broken")):
			with self.assertRaises(RuntimeError):
				shell.boot()

	def test_when_only_a_failed_module_could_open_the_error_names_that_module_not_permissions(self):
		hosted = {key: _off(key) for key in shell.MODULE_KEYS if key != "contactos"}
		with (
			patch.object(shell, "_builtin_providers", return_value={**hosted, "contactos": lambda: 1 / 0}),
			patch.object(frappe, "get_hooks", return_value=[]),
		):
			with self.assertRaises(frappe.ValidationError) as caught:
				shell.boot()
		self.assertNotIsInstance(caught.exception, frappe.PermissionError)
		self.assertIn("Contactos", str(caught.exception))

	def test_palette_recents_survive_a_raising_contactos_builder(self):
		with patch.object(shell, "_contactos", side_effect=RuntimeError("tienda setting has no column")):
			rows = shell.resolve_recent([{"source": "deal", "name": "nope"}])
		self.assertEqual(rows, [])
