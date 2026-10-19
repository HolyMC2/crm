"""Scripts de usuario (Shell D12): owner-only lists, words, on/off, code saves with versions."""

# ci: shell-apis

from unittest import TestCase, skipIf

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import scripts

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

EMAIL = "d12-scripts-vendedor@example.com"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestScripts(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", EMAIL):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": EMAIL,
					"first_name": "Vendedor",
					"last_name": "Scripts",
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_only_the_owner_sees_scripts(self):
		frappe.set_user(EMAIL)
		for call in (
			lambda: scripts.lista("cliente"),
			lambda: scripts.lista("campos"),
			lambda: scripts.ver("cliente", "x"),
			lambda: scripts.activar("cliente", "x", 1),
			lambda: scripts.guardar("cliente", "x", "// x"),
			lambda: scripts.crear("cliente", {"doctype": "Note"}),
		):
			with self.assertRaises(frappe.PermissionError):
				call()

	def test_lists_say_what_applies_and_paginate(self):
		answer = scripts.lista("campos", limite=1)
		self.assertIn("total", answer)
		self.assertLessEqual(len(answer["filas"]), 1)
		self.assertEqual(answer["hay_mas"], answer["total"] > 1)
		self.assertFalse(answer["puede_editar"])  # custom fields are shown, never toggled
		server = scripts.lista("servidor")
		self.assertIn("motor_activo", server)
		self.assertEqual(bool(server["nota"]), not server["motor_activo"])

	def test_a_new_client_script_starts_off_and_versions_its_code(self):
		created = scripts.crear("cliente", {"doctype": "Note", "vista": "Form", "nombre": "D12 prueba"})
		name = created["name"]
		self.assertFalse(created["activo"])
		self.assertEqual(created["codigo"], "")
		self.assertIn("Se ejecutará", created["cuando"])
		saved = scripts.guardar("cliente", name, "console.log('D12 prueba')\n")
		self.assertEqual(saved["codigo"], "console.log('D12 prueba')\n")
		self.assertTrue(any("+1" in v["texto"] for v in saved["versiones"]))
		on = scripts.activar("cliente", name, 1)
		self.assertTrue(on["activo"])
		off = scripts.activar("cliente", name, 0)
		self.assertFalse(off["activo"])
		with self.assertRaises(frappe.TimestampMismatchError):
			scripts.guardar("cliente", name, "// otra", modificado="2000-01-01 00:00:00")
		listed = scripts.lista("cliente", buscar="D12 prueba")
		self.assertIn(name, [row["name"] for row in listed["filas"]])

	def test_custom_fields_have_no_switch(self):
		with self.assertRaises(frappe.ValidationError):
			scripts.activar("campos", "x", 0)
		with self.assertRaises(frappe.ValidationError):
			scripts.guardar("campos", "x", "")
		with self.assertRaises(frappe.ValidationError):
			scripts.crear("servidor", {})

	def test_words_for_server_events(self):
		aplica, cuando = scripts.describir(
			"servidor",
			{"script_type": "DocType Event", "reference_doctype": "Note", "doctype_event": "Before Save"},
		)
		self.assertIn("antes de guardar", aplica)
		self.assertIn("va a guardarse", cuando)
		aplica, cuando = scripts.describir(
			"servidor", {"script_type": "Scheduler Event", "event_frequency": "Daily"}
		)
		self.assertIn("cada día", aplica)
		aplica, _c = scripts.describir(
			"servidor", {"script_type": "API", "api_method": "hola", "allow_guest": 1}
		)
		self.assertIn("/api/method/hola", aplica)
		self.assertIn("sin iniciar sesión", aplica)

	def test_version_summary_in_words(self):
		summary = scripts.resumen_version(
			"Client Script", {"changed": [["script", "a\nb", "a\nc\nd"], ["enabled", 0, 1]]}
		)
		self.assertIn("+2", summary["texto"])
		self.assertIn("sí", summary["texto"])
		self.assertTrue(summary["diff"])
