"""Automatizaciones nativas (Shell D12): avisos, reglas, repetir y aprobaciones en palabras,
pickers only (never code from the client), owner-only writes, refusals in Spanish."""

# ci: shell-apis

import json
from unittest import TestCase, skipIf

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import automatizaciones as auto

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

ROLE = "D12 Automatizaciones Test"
EMAIL = "d12-automatizaciones@example.com"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestPalabras(IntegrationTestCase):
	"""The words and the generated expressions, without writing anything."""

	def test_events_read_as_sentences(self):
		self.assertEqual(auto.frase_evento("New", "Sales Invoice"), "Al crear una factura")
		self.assertEqual(auto.frase_evento("Submit", "Sales Order"), "Al confirmar un pedido")
		self.assertEqual(
			auto.frase_evento("Days Before", "Sales Invoice", "Fecha de vencimiento", 3),
			"3 días antes de la fecha de vencimiento",
		)
		self.assertEqual(
			auto.frase_evento("Days After", "Sales Invoice", "Entrega", 1),
			"1 día después de la fecha «Entrega»",
		)
		self.assertEqual(auto.frase_evento("Value Change", "Note", "Estado"), "Cuando cambia estado")
		self.assertEqual(auto.frase_evento("Value Change", "Note", "RFC"), "Cuando cambia RFC")

	def test_english_subjects_read_as_the_event_sentence(self):
		cuando = "Al confirmar un resultado de capacitación"
		for subject in (
			"{{ doc.name }} has been received",
			"Número has been received",
			"Training Scheduled",
			"New {{ doc.doctype }} #{{ doc.name }}",
			"Expense Claim Approved",
			"New Fiscal Year {{ doc.name }} - Review Required",
		):
			with self.subTest(subject=subject):
				self.assertTrue(auto.parece_ingles(subject))
				self.assertEqual(auto.titulo_aviso(subject, subject, cuando), (cuando, subject))
		for subject in (
			"Factura vencida de {{ doc.customer }}",
			"Nueva factura",
			"Retención por pagar",
			"Hola",
		):
			with self.subTest(subject=subject):
				self.assertFalse(auto.parece_ingles(subject))
				self.assertEqual(auto.titulo_aviso(subject, subject, cuando), (subject, None))
		# A subject `_()` translated keeps the translation; no subject reads as the event.
		self.assertEqual(auto.titulo_aviso("New Lead", "Nuevo prospecto", cuando), ("Nuevo prospecto", None))
		self.assertEqual(auto.titulo_aviso("", "", cuando), (cuando, None))
		# A tag and a placeholder only says nothing: the event sentence.
		self.assertEqual(
			auto.titulo_aviso("[Error] {{ doc.title }}", "[Error] {{ doc.title }}", cuando), (cuando, None)
		)
		self.assertEqual(
			auto.titulo_aviso("[Aviso] Factura vencida", "[Aviso] Factura vencida", cuando)[0],
			"[Aviso] Factura vencida",
		)
		# The owner's «Asunto:» line only when it reads in Spanish and has no «…».
		self.assertFalse(auto.asunto_legible("Número has been received"))
		self.assertFalse(auto.asunto_legible("Factura … vencida"))
		self.assertTrue(auto.asunto_legible("Factura vencida de Cliente"))

	def test_rules_read_as_sentences(self):
		self.assertEqual(
			auto.frase_regla("Warranty Claim", "Round Robin", ["Ana", "Beto"]),
			"Las garantías se reparten por turnos entre Ana y Beto",
		)
		self.assertEqual(
			auto.frase_regla("Sales Order", "Load Balancing", ["Ana"], "Estado es Abierto"),
			"Los pedidos cuando Estado es Abierto se reparten al que tenga menos pendientes entre Ana",
		)

	def test_the_condition_is_one_comparison_with_an_escaped_literal(self):
		hostile = 'x" or __import__("os").system("id") or "'
		expression = auto.condicion_python("status", hostile)
		self.assertEqual(auto.leer_condicion(expression), ("status", hostile))
		# It stays a comparison of the field with that exact text.
		self.assertTrue(frappe.safe_eval(expression, None, {"status": hostile}))
		self.assertFalse(frappe.safe_eval(expression, None, {"status": "x"}))
		self.assertEqual(auto.condicion_python("public", 1), "public == 1")
		for fieldname in ("__import__('os')", "a b", "Status", "", None):
			with self.subTest(fieldname=fieldname), self.assertRaises(frappe.ValidationError):
				auto.condicion_python(fieldname, "x")
		with self.assertRaises(frappe.ValidationError):
			auto.condicion_python("status", ["x"])

	def test_a_message_becomes_jinja_only_from_known_fields(self):
		meta = frappe.get_meta("Note")
		text = auto._plantilla(meta, "Hola {{ frappe.db.sql('x') }} {% if 1 %} [title] [nada]")
		self.assertNotIn("{{ frappe", text)
		self.assertNotIn("{%", text)
		self.assertIn('{{ doc.title or "" }}', text)
		self.assertIn("[nada]", text)

	def test_jinja_is_shown_as_words(self):
		meta = frappe.get_meta("Note")
		words = auto._texto_plantilla(meta, "Nota {{ doc.title }} {% if x %}lista{% endif %}")
		self.assertEqual(words, "Nota {0} lista".format(auto._label(meta, "title")))
		self.assertNotIn("{", words)

	def test_workflow_rows_open_the_shell_record(self):
		self.assertEqual(
			auto.ruta("Purchase Order", "PUR-ORD 1/2"),
			"/crm/documentos/tipo/Purchase%20Order/PUR-ORD%201%2F2",
		)
		self.assertEqual(auto.tono("Aprobar"), "filled")
		self.assertEqual(auto.tono("Reject"), "danger")
		self.assertEqual(auto.tono("Revisar"), "tonal")

	def test_pending_row_names_each_action(self):
		self.assertEqual(auto.acciones_texto(["Aprobar", "Rechazar"]), "Acciones: Aprobar · Rechazar")
		self.assertEqual(auto.acciones_texto(["Aprobar"]), "Acciones: Aprobar")
		self.assertEqual(auto.acciones_texto([]), "")


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestAutomatizaciones(IntegrationTestCase):
	"""Notes stand in for any document; the owner writes, a desk user is refused in Spanish."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("User", EMAIL):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": EMAIL,
					"first_name": "Beto",
					"last_name": "Automatizaciones",
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", EMAIL)
		user.set("roles", [])
		user.append("roles", {"role": ROLE})
		user.save(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _aviso(self, **extra):
		datos = {
			"doctype": "Note",
			"evento": "New",
			"condicion": {"campo": "public", "valor": "1"},
			"destinatarios": {"roles": ["System Manager"], "dueno": 1},
			"canal": "System Notification",
			"asunto": "D12 prueba [title]",
			"mensaje": "Nota nueva: [title]",
		}
		datos.update(extra)
		return datos

	def test_the_owner_creates_an_aviso_from_pickers_and_turns_it_off(self):
		row = auto.crear_aviso(json.dumps(self._aviso()))
		self.assertEqual(row["cuando"], "Al crear una nota")
		self.assertEqual(row["por_donde"], "Aviso en Muelle")
		self.assertIn("el dueño del documento", row["a_quien"])
		doc = frappe.get_doc("Notification", row["name"])
		self.assertEqual(doc.condition_type, "Filters")
		self.assertFalse(doc.condition)
		self.assertEqual(json.loads(doc.filters), [["Note", "public", "=", 1]])
		self.assertIn("doc.title", doc.subject)
		self.assertEqual(doc.notification_title, doc.subject)
		off = auto.activar_aviso(doc.name, 0)
		self.assertFalse(off["activo"])
		self.assertEqual(frappe.db.get_value("Notification", doc.name, "enabled"), 0)
		self.assertIn(doc.name, [a["name"] for a in auto.avisos()["avisos"]])

	def test_pickers_refuse_what_the_doctype_does_not_have(self):
		cases = (
			{"evento": "Submit"},  # a Note is never confirmed
			{"evento": "Method"},
			{"canal": "Slack"},
			{"condicion": {"campo": "public", "valor": "maybe"}},
			{"condicion": {"campo": "no_such_field", "valor": "1"}},
			{"destinatarios": {"roles": ["Guest"]}},
			{"destinatarios": {}},
			{"evento": "Days Before", "campo": "title", "dias": 2},  # not a date
			{"asunto": ""},
		)
		for extra in cases:
			with self.subTest(extra=extra), self.assertRaises(frappe.ValidationError):
				auto.crear_aviso(self._aviso(**extra))

	def test_the_owner_creates_a_rule_with_a_generated_condition(self):
		row = auto.crear_regla(
			{
				"doctype": "Note",
				"modo": "Round Robin",
				"usuarios": [EMAIL],
				"condicion": {"campo": "public", "valor": "1"},
			}
		)
		rule = frappe.get_doc("Assignment Rule", row["name"])
		self.assertEqual(rule.assign_condition, "public == 1")
		self.assertEqual(len(rule.assignment_days), 7)
		self.assertIn("por turnos entre Beto Automatizaciones", row["frase"])
		self.assertFalse(auto.activar_regla(rule.name, 0)["activo"])
		with self.assertRaises(frappe.ValidationError):
			auto.crear_regla({"doctype": "ToDo", "modo": "Round Robin", "usuarios": [EMAIL]})
		with self.assertRaises(frappe.ValidationError):
			auto.crear_regla({"doctype": "Note", "modo": "Round Robin", "usuarios": []})

	def test_a_desk_user_sees_why_and_cannot_write(self):
		frappe.set_user(EMAIL)
		self.assertFalse(auto.avisos()["manager"])
		self.assertTrue(auto.avisos()["motivo"])
		self.assertFalse(auto.reglas()["manager"])
		self.assertFalse(auto.repeticiones()["puede_ver"])
		for call in (
			lambda: auto.crear_aviso(self._aviso()),
			lambda: auto.crear_regla({"doctype": "Note", "modo": "Round Robin", "usuarios": [EMAIL]}),
			lambda: auto.permitir_repeticion("Note"),
			lambda: auto.tipos(),
		):
			with self.assertRaises(frappe.PermissionError):
				call()

	def test_a_doctype_that_does_not_repeat_says_so(self):
		note = frappe.get_doc({"doctype": "Note", "title": "D12 prueba repetir"}).insert()
		answer = auto.repeticion("Note", note.name)
		if frappe.get_meta("Note").allow_auto_repeat:
			self.skipTest("this site lets Notes repeat")
		self.assertFalse(answer["permitido"])
		self.assertIn("todavía no se pueden repetir", answer["motivo"])
		self.assertTrue(answer["puede_permitir"])
		self.assertIsNone(answer["actual"])
		with self.assertRaises(frappe.PermissionError):
			auto.repetir("Note", note.name, "Monthly")

	def test_a_reader_without_write_is_told_why_without_a_permission_message(self):
		# The record page asks motivo_repetir on every open; a «no tiene acceso» toast is not an answer.
		from copy import copy
		from unittest.mock import PropertyMock, patch

		from frappe.permissions import add_permission, update_permission_property

		for doctype in ("Note", "Auto Repeat"):
			add_permission(doctype, ROLE, 0)
			frappe.clear_cache(doctype=doctype)
		update_permission_property("Auto Repeat", ROLE, 0, "create", 1)
		frappe.clear_cache(doctype="Auto Repeat")
		note = frappe.get_doc({"doctype": "Note", "title": "D12 repetir sin escribir", "public": 1}).insert()
		repeatable = copy(frappe.get_meta("Note"))
		repeatable.allow_auto_repeat = 1
		frappe.set_user(EMAIL)
		doc = frappe.get_doc("Note", note.name)
		with patch.object(type(doc), "meta", new_callable=PropertyMock, return_value=repeatable):
			frappe.clear_messages()
			reason = auto.motivo_repetir(doc)
		self.assertEqual(reason, "Tu usuario no puede cambiar este documento.")
		self.assertEqual(frappe.local.message_log, [])

	def test_records_without_a_workflow_have_no_actions(self):
		note = frappe.get_doc({"doctype": "Note", "title": "D12 prueba flujo"}).insert()
		self.assertEqual(auto.transiciones("Note", note.name)["acciones"], [])
		with self.assertRaises(frappe.ValidationError):
			auto.aplicar_transicion("Note", note.name, "Aprobar")
