"""One shell boot for every Muelle route; providers never grant access."""

import sys
from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe

	from crm.api import shell

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestShellBoot(TestCase):
	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.defaults.clear_user_default(shell.MOBILE_SLOTS_DEFAULT)
		frappe.set_user(self.previous)

	def test_boot_reports_identity_and_module_capabilities(self):
		data = shell.boot()
		self.assertEqual(data["user"]["name"], "Administrator")
		self.assertTrue(data["user"]["is_admin"])
		self.assertIn("ventas", data["modules"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])
		self.assertEqual(data["sales_access"], data["modules"]["ventas"]["enabled"])
		self.assertIn("locale", data)

	def test_older_doco_without_contactos_turns_the_module_off_not_the_shell(self):
		with patch.dict(sys.modules, {"doco.contactos.api": None}):
			data = shell.boot()
		self.assertFalse(data["modules"]["contactos"]["enabled"])
		self.assertTrue(data["modules"]["contactos"]["reason"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_saved_bar_keeps_known_modules_once_and_at_most_four(self):
		saved = shell.save_mobile_slots(
			'["ventas", "bogus", "contactos", "ventas", "hoy", "agenda", "compras"]'
		)
		self.assertEqual(saved, ["ventas", "contactos", "hoy", "agenda"])
		self.assertEqual(shell.boot()["mobile_slots"], saved)

	def _skip_without_purchasing(self):
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Compras (doco) is not installed")
		try:
			import doco.workspaces.purchasing
		except ImportError:
			self.skipTest("This doco has no purchasing service")

	def test_compras_provider_reports_purchase_order_access(self):
		self._skip_without_purchasing()
		compras = shell.boot()["modules"]["compras"]
		self.assertTrue(compras["enabled"])
		self.assertIsNone(compras["reason"])
		self.assertEqual(compras["capabilities"], {"read": True, "create": True})

	def test_compras_needs_purchase_order_read_and_carries_its_own_reason(self):
		self._skip_without_purchasing()
		answer = {"enabled": True, "capabilities": {"orders": False, "requests": True, "create": False}}
		with patch("doco.workspaces.purchasing.bootstrap", return_value=answer):
			data = shell.boot()
		compras = data["modules"]["compras"]
		self.assertFalse(compras["enabled"])
		self.assertTrue(compras["reason"])
		self.assertFalse(compras["capabilities"]["create"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_compras_create_follows_purchase_order_create(self):
		self._skip_without_purchasing()
		answer = {"enabled": True, "capabilities": {"orders": True, "create": False}}
		with patch("doco.workspaces.purchasing.bootstrap", return_value=answer):
			compras = shell.boot()["modules"]["compras"]
		self.assertEqual(compras["capabilities"], {"read": True, "create": False})

	def test_compras_alone_opens_the_shell_without_contactos_or_ventas(self):
		self._skip_without_purchasing()

		def off(key):
			return lambda: {"key": key, "enabled": False, "reason": "off", "capabilities": {}}

		with (
			patch.object(shell, "_contactos", off("contactos")),
			patch.object(shell, "_ventas", off("ventas")),
		):
			data = shell.boot()
		self.assertTrue(data["modules"]["compras"]["enabled"])
		self.assertFalse(data["sales_access"])

	def test_older_doco_without_purchasing_turns_compras_off_not_the_shell(self):
		with patch.dict(sys.modules, {"doco.workspaces.purchasing": None}):
			data = shell.boot()
		self.assertFalse(data["modules"]["compras"]["enabled"])
		self.assertTrue(data["modules"]["compras"]["reason"])
		self.assertEqual(data["modules"]["compras"]["capabilities"], {})
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_avisos_provider_reports_staff_access_and_grouped_badge(self):
		data = shell.boot()
		avisos = data["modules"]["avisos"]
		self.assertTrue(avisos["enabled"])
		self.assertTrue(avisos["capabilities"]["read"])
		self.assertEqual(set(avisos["badge"]), {"count", "capped"})

	def test_avisos_alone_opens_the_shell_without_contactos_or_ventas(self):
		def off(key):
			return lambda: {"key": key, "enabled": False, "reason": "off", "capabilities": {}}

		with (
			patch.object(shell, "_contactos", off("contactos")),
			patch.object(shell, "_ventas", off("ventas")),
		):
			data = shell.boot()
		self.assertTrue(data["modules"]["avisos"]["enabled"])
		self.assertFalse(data["sales_access"])

	def test_refused_avisos_carries_its_own_reason(self):
		with patch("crm.avisos.stream.is_enabled", return_value=False):
			data = shell.boot()
		avisos = data["modules"]["avisos"]
		self.assertFalse(avisos["enabled"])
		self.assertTrue(avisos["reason"])
		self.assertIsNone(avisos["badge"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_avisos_provider_permission_error_leaves_the_module_absent(self):
		with patch("crm.api.avisos.get_capabilities", side_effect=frappe.PermissionError):
			data = shell.boot()
		self.assertNotIn("avisos", data["modules"])
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def _skip_without_bandeja(self):
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Archivos (doco) is not installed")
		try:
			import doco.docoutils.documents.bandeja
		except ImportError:
			self.skipTest("This doco has no Archivos service")

	def test_archivos_provider_reports_evidence_access(self):
		self._skip_without_bandeja()
		archivos = shell.boot()["modules"]["archivos"]
		self.assertTrue(archivos["enabled"])
		self.assertIsNone(archivos["reason"])
		self.assertEqual(archivos["capabilities"], {"read": True, "create": True})

	def test_archivos_refusal_carries_its_own_reason_and_leaves_others(self):
		self._skip_without_bandeja()
		answer = {"enabled": False, "reason": "Tu puesto no tiene acceso a Archivos."}
		with patch("doco.docoutils.documents.bandeja.boot", return_value=answer):
			data = shell.boot()
		archivos = data["modules"]["archivos"]
		self.assertFalse(archivos["enabled"])
		self.assertEqual(archivos["reason"], answer["reason"])
		self.assertEqual(archivos["capabilities"], {"read": False, "create": False})
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_archivos_alone_opens_the_shell_without_contactos_or_ventas(self):
		self._skip_without_bandeja()

		def off(key):
			return lambda: {"key": key, "enabled": False, "reason": "off", "capabilities": {}}

		with (
			patch.object(shell, "_contactos", off("contactos")),
			patch.object(shell, "_ventas", off("ventas")),
		):
			data = shell.boot()
		self.assertTrue(data["modules"]["archivos"]["enabled"])
		self.assertFalse(data["sales_access"])

	def test_older_doco_without_archivos_turns_it_off_not_the_shell(self):
		with patch.dict(sys.modules, {"doco.docoutils.documents.bandeja": None}):
			data = shell.boot()
		self.assertFalse(data["modules"]["archivos"]["enabled"])
		self.assertTrue(data["modules"]["archivos"]["reason"])
		self.assertEqual(data["modules"]["archivos"]["capabilities"], {})
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_guest_cannot_boot(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			shell.boot()


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestRecentResolution(TestCase):
	"""Palette recents are references; titles come back only while the user may read them."""

	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Contactos (doco) is not installed")
		self.mine = self._contact("Recent", "Visible")
		self.hidden = self._contact("Recent", "Revoked")
		self.seller = self._user("recent-seller@example.test", ["Sales User"])
		self.nobody = self._user("recent-nobody@example.test", [])

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("User Permission", {"user": self.seller})
		frappe.set_user(self.previous)
		frappe.db.rollback()

	def _contact(self, first, last):
		doc = frappe.get_doc({"doctype": "Contact", "first_name": first, "last_name": last}).insert(
			ignore_permissions=True
		)
		return doc.name

	def _user(self, email, roles):
		if not frappe.db.exists("User", email):
			user = frappe.get_doc(
				{"doctype": "User", "email": email, "first_name": "Recent", "send_welcome_email": 0}
			)
			user.flags.no_welcome_mail = True
			user.insert(ignore_permissions=True)
			user.add_roles(*roles)
		return email

	def _records(self):
		return [
			{"source": "contact", "name": self.mine},
			{"source": "contact", "name": self.hidden},
			{"source": "bogus", "name": "x"},
			{"source": "contact", "name": "does-not-exist"},
		]

	def test_titles_for_readable_records_only(self):
		frappe.set_user(self.seller)
		if not shell.boot()["modules"]["contactos"]["enabled"]:
			self.skipTest("Sales User has no Contactos directory on this site")
		rows = shell.resolve_recent(self._records())
		self.assertEqual({row["name"] for row in rows}, {self.mine, self.hidden})
		self.assertTrue(all(set(row) == {"source", "name", "title"} for row in rows))

	def test_record_level_revocation_drops_the_recent(self):
		frappe.get_doc(
			{"doctype": "User Permission", "user": self.seller, "allow": "Contact", "for_value": self.mine}
		).insert(ignore_permissions=True)
		frappe.set_user(self.seller)
		if not shell.boot()["modules"]["contactos"]["enabled"]:
			self.skipTest("Sales User has no Contactos directory on this site")
		rows = shell.resolve_recent(self._records())
		self.assertEqual([row["name"] for row in rows], [self.mine])

	def test_module_revocation_returns_nothing(self):
		frappe.set_user(self.nobody)
		self.assertEqual(shell.resolve_recent(self._records()), [])

	def test_guest_cannot_resolve(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			shell.resolve_recent(self._records())
