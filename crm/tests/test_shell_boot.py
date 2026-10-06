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

	def _contactos_on(self):
		return {"key": "contactos", "enabled": True, "reason": None, "capabilities": {"read": True}}

	def test_ventas_enabled_for_a_crm_user(self):
		ventas = shell.boot()["modules"]["ventas"]
		self.assertEqual(
			ventas, {"key": "ventas", "enabled": True, "reason": None, "capabilities": {"read": True}}
		)

	def test_ventas_refused_keeps_its_own_reason_and_the_other_modules(self):
		with (
			patch("crm.api.check_app_permission", return_value=False),
			patch.object(shell, "_contactos", self._contactos_on),
		):
			data = shell.boot()
		self.assertFalse(data["modules"]["ventas"]["enabled"])
		self.assertTrue(data["modules"]["ventas"]["reason"])
		self.assertEqual(data["modules"]["ventas"]["capabilities"], {"read": False})
		self.assertFalse(data["sales_access"])
		self.assertTrue(data["modules"]["contactos"]["enabled"])

	def test_ventas_absent_when_its_provider_refuses(self):
		with (
			patch("crm.api.check_app_permission", side_effect=frappe.PermissionError),
			patch.object(shell, "_contactos", self._contactos_on),
		):
			data = shell.boot()
		self.assertNotIn("ventas", data["modules"])
		self.assertFalse(data["sales_access"])

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

	def _skip_without_pendientes(self):
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Pendientes (doco) is not installed")
		try:
			import doco.pendientes.api
		except ImportError:
			self.skipTest("This doco has no Pendientes service")

	def test_pendientes_provider_reports_queue_access_and_context(self):
		self._skip_without_pendientes()
		pendientes = shell.boot()["modules"]["pendientes"]
		self.assertTrue(pendientes["enabled"])
		self.assertIsNone(pendientes["reason"])
		self.assertTrue(pendientes["capabilities"]["read"])
		self.assertEqual(pendientes["user"], "Administrator")
		self.assertTrue(pendientes["today"])
		self.assertIn("ToDo", pendientes["sources"])

	def test_refused_pendientes_carries_its_own_reason_and_no_actions(self):
		self._skip_without_pendientes()
		answer = {
			"enabled": False,
			"reason": "Pide permiso para leer tus pendientes.",
			"capabilities": {"create": True, "create_crm": True, "team": True},
		}
		with patch("doco.pendientes.api.bootstrap", return_value=answer):
			data = shell.boot()
		pendientes = data["modules"]["pendientes"]
		self.assertFalse(pendientes["enabled"])
		self.assertEqual(pendientes["reason"], answer["reason"])
		self.assertFalse(any(pendientes["capabilities"].values()))
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_pendientes_alone_opens_the_shell_and_is_the_first_module(self):
		self._skip_without_pendientes()

		def off(key):
			return lambda: {"key": key, "enabled": False, "reason": "off", "capabilities": {}}

		with (
			patch.object(shell, "_contactos", off("contactos")),
			patch.object(shell, "_ventas", off("ventas")),
		):
			data = shell.boot()
			first = shell.first_module()
		self.assertTrue(data["modules"]["pendientes"]["enabled"])
		self.assertFalse(data["sales_access"])
		self.assertEqual(first, "pendientes")

	def test_older_doco_without_pendientes_turns_it_off_not_the_shell(self):
		with patch.dict(sys.modules, {"doco.pendientes.api": None}):
			data = shell.boot()
		self.assertFalse(data["modules"]["pendientes"]["enabled"])
		self.assertTrue(data["modules"]["pendientes"]["reason"])
		self.assertEqual(data["modules"]["pendientes"]["capabilities"], {})
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def _skip_without_agenda(self):
		if "doco" not in frappe.get_installed_apps():
			self.skipTest("Agenda (doco) is not installed")
		try:
			import doco.agenda.api
		except ImportError:
			self.skipTest("This doco has no Agenda service")

	def test_agenda_provider_reports_event_access(self):
		self._skip_without_agenda()
		from crm.api.agenda import get_capabilities

		# Which sources open depends on the site's setup; the provider mirrors the answer.
		expected = get_capabilities()
		agenda = shell.boot()["modules"]["agenda"]
		self.assertEqual(agenda["enabled"], bool(expected["enabled"]))
		self.assertEqual(agenda["capabilities"]["read"], agenda["enabled"])
		if agenda["enabled"]:
			self.assertIsNone(agenda["reason"])
		else:
			self.assertTrue(agenda["reason"])

	def test_refused_agenda_carries_its_own_reason_and_leaves_others(self):
		answer = {"enabled": False, "reason": "Tu cuenta no puede abrir la Agenda.", "sources": []}
		with patch("crm.api.agenda.get_capabilities", return_value=answer):
			data = shell.boot()
		agenda = data["modules"]["agenda"]
		self.assertFalse(agenda["enabled"])
		self.assertEqual(agenda["reason"], answer["reason"])
		self.assertEqual(agenda["capabilities"], {"read": False, "create": False})
		self.assertTrue(data["modules"]["ventas"]["enabled"])

	def test_agenda_create_follows_a_source_that_can_create(self):
		answer = {"enabled": True, "sources": [{"key": "events", "enabled": True, "canCreate": False}]}
		with patch("crm.api.agenda.get_capabilities", return_value=answer):
			agenda = shell.boot()["modules"]["agenda"]
		self.assertEqual(agenda["capabilities"], {"read": True, "create": False})

	def test_older_doco_without_agenda_turns_it_off_not_the_shell(self):
		with patch.dict(sys.modules, {"doco.agenda.api": None}):
			data = shell.boot()
		self.assertFalse(data["modules"]["agenda"]["enabled"])
		self.assertTrue(data["modules"]["agenda"]["reason"])
		self.assertEqual(data["modules"]["agenda"]["capabilities"], {"read": False, "create": False})
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


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestRecentDeals(TestCase):
	"""Ventas deals in the palette recents follow the same read checks as Contactos records."""

	def setUp(self):
		from crm.tests.test_next_activity import open_deal_status

		self.previous = frappe.session.user
		frappe.set_user("Administrator")
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": open_deal_status(),
				"deal_owner": "Administrator",
				"lead_name": "Recent Deal",
				"expected_deal_value": 100,
				"expected_closure_date": frappe.utils.add_to_date(frappe.utils.nowdate(), days=30),
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.deal = deal.name

	def tearDown(self):
		frappe.set_user(self.previous)
		frappe.db.rollback()

	def _records(self):
		return [{"source": "deal", "name": self.deal}, {"source": "deal", "name": "does-not-exist"}]

	def test_readable_deal_comes_back_with_its_title(self):
		rows = shell.resolve_recent(self._records())
		self.assertEqual(rows, [{"source": "deal", "name": self.deal, "title": "Recent Deal"}])

	def test_ventas_refused_drops_deals(self):
		with patch("crm.api.check_app_permission", return_value=False):
			self.assertEqual(shell.resolve_recent(self._records()), [])

	def test_record_level_revocation_drops_the_deal(self):
		with patch("frappe.model.document.Document.has_permission", return_value=False):
			self.assertEqual(shell.resolve_recent(self._records()), [])
