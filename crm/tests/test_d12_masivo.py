"""Ediciones masivas (Shell D12): options by role, per-document permission checks, the undo log."""

# ci: shell-apis

from unittest import TestCase, skipIf

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import masivo

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

ROLE = "D12 Masivo Test"
EMAIL = "d12-masivo@example.com"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestMasivo(IntegrationTestCase):
	"""Notes stand in for any document: System Manager writes all, a desk user only their own."""

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
					"last_name": "Masivo",
					"send_welcome_email": 0,
					"user_type": "System User",
					"roles": [{"role": ROLE}],
				}
			).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _note(self, title):
		return frappe.get_doc({"doctype": "Note", "title": title}).insert().name

	def test_options_follow_the_role(self):
		answer = masivo.opciones("Note")
		keys = [a["clave"] for a in answer["acciones"]]
		for key in ("campo", "asignar", "etiquetar", "imprimir", "exportar"):
			self.assertIn(key, keys)
		campo = next(a for a in answer["acciones"] if a["clave"] == "campo")
		fields = {c["fieldname"]: c for c in campo["campos"]}
		self.assertIn("title", fields)
		self.assertNotIn("content", fields)  # Text Editor: not a simple field
		self.assertNotIn("public", fields)  # a Check outside the list and its filters
		self.assertEqual(answer["max"], masivo.MAX_DOCS)

	def test_change_a_field_and_undo_newest_first(self):
		names = [self._note("D12 prueba uno"), self._note("D12 prueba dos")]
		result = masivo.aplicar("Note", names, "campo", {"campo": "title", "valor": "D12 prueba cambiada"})
		self.assertEqual(result["hechos"], 2)
		self.assertEqual(result["rechazados"], [])
		self.assertTrue(result["deshacer"])
		for name in names:
			self.assertEqual(frappe.db.get_value("Note", name, "title"), "D12 prueba cambiada")
		undone = masivo.deshacer(result["deshacer"])
		self.assertEqual(undone["revertidos"], 2)
		self.assertEqual(undone["fallidos"], [])
		self.assertEqual(frappe.db.get_value("Note", names[0], "title"), "D12 prueba uno")
		self.assertEqual(frappe.db.get_value("Note", names[1], "title"), "D12 prueba dos")
		# a second undo of the same token reverts nothing (the cache token is gone; D9 says
		# «nada que deshacer»)
		if result["deshacer"].startswith(masivo.TOKEN_PREFIX):
			with self.assertRaises(frappe.ValidationError):
				masivo.deshacer(result["deshacer"])
		else:
			self.assertEqual(masivo.deshacer(result["deshacer"])["revertidos"], 0)

	def test_an_unchanged_value_is_not_logged(self):
		name = self._note("D12 prueba igual")
		result = masivo.aplicar("Note", [name], "campo", {"campo": "title", "valor": "D12 prueba igual"})
		self.assertEqual(result["hechos"], 0)
		self.assertEqual(result["sin_cambio"], [name])
		self.assertIsNone(result["deshacer"])

	def test_refused_documents_are_reported_in_words(self):
		others = self._note("D12 prueba ajena")
		frappe.set_user(EMAIL)
		mine = self._note("D12 prueba mía")
		result = masivo.aplicar("Note", [others, mine], "campo", {"campo": "title", "valor": "D12 prueba x"})
		self.assertEqual(result["nombres"], [mine])
		self.assertEqual([r["name"] for r in result["rechazados"]], [others])
		refused = result["rechazados"][0]
		# a private Note of someone else: the worker cannot read its title, so the ID stands in
		self.assertEqual(refused["titulo"], others)
		self.assertTrue(refused["motivo"])
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Note", others, "title"), "D12 prueba ajena")

	def test_undo_refuses_a_record_changed_since(self):
		name = self._note("D12 prueba antes")
		result = masivo.aplicar("Note", [name], "campo", {"campo": "title", "valor": "D12 prueba después"})
		doc = frappe.get_doc("Note", name)
		doc.title = "D12 prueba otra mano"
		doc.save()
		undone = masivo.deshacer(result["deshacer"])
		self.assertEqual(undone["revertidos"], 0)
		self.assertEqual([f["name"] for f in undone["fallidos"]], [name])
		self.assertEqual(frappe.db.get_value("Note", name, "title"), "D12 prueba otra mano")

	def test_assign_records_only_new_assignments_and_undo_removes_them(self):
		names = [self._note("D12 prueba asignar"), self._note("D12 prueba asignar 2")]
		result = masivo.aplicar("Note", names, "asignar", {"usuarios": [EMAIL]})
		self.assertEqual(result["hechos"], 2)
		again = masivo.aplicar("Note", names, "asignar", {"usuarios": [EMAIL]})
		self.assertEqual(again["hechos"], 0)
		self.assertEqual(sorted(again["sin_cambio"]), sorted(names))
		masivo.deshacer(result["deshacer"])
		for name in names:
			self.assertFalse(
				frappe.db.exists(
					"ToDo",
					{
						"reference_type": "Note",
						"reference_name": name,
						"allocated_to": EMAIL,
						"status": "Open",
					},
				)
			)

	def test_tags_and_untag(self):
		from frappe.desk.doctype.tag.tag import DocTags

		name = self._note("D12 prueba etiqueta")
		result = masivo.aplicar("Note", [name], "etiquetar", {"etiquetas": ["D12 prueba", "d12 PRUEBA"]})
		self.assertEqual(result["hechos"], 1)
		self.assertIn("D12 prueba", DocTags("Note").get_tags(name))
		self.assertTrue(result["deshacer"])  # Asistente Accion when doco has `untag`, else the cache
		masivo.deshacer(result["deshacer"])
		self.assertNotIn("D12 prueba", DocTags("Note").get_tags(name))

	def test_limits_and_bad_input(self):
		with self.assertRaises(frappe.ValidationError):
			masivo.aplicar(
				"Note", [f"n{i}" for i in range(masivo.MAX_DOCS + 1)], "asignar", {"usuarios": [EMAIL]}
			)
		name = self._note("D12 prueba campo")
		with self.assertRaises(frappe.ValidationError):
			masivo.aplicar("Note", [name], "campo", {"campo": "content", "valor": "x"})
		with self.assertRaises(frappe.ValidationError):
			masivo.aplicar("Note", [name], "borrar", {})
		with self.assertRaises(frappe.ValidationError):
			masivo.aplicar("Note", [name], "asignar", {"usuarios": ["Guest"]})

	def test_a_retry_with_the_same_request_id_does_not_apply_twice(self):
		name = self._note("D12 prueba reintento")
		args = ("Note", [name], "campo", {"campo": "title", "valor": "D12 prueba reintento 2"})
		first = masivo.aplicar(*args, request_id="d12-test-retry-1")
		second = masivo.aplicar(*args, request_id="d12-test-retry-1")
		self.assertEqual(first["deshacer"], second["deshacer"])

	def test_value_coercion(self):
		meta = frappe.get_meta("Note")
		title = meta.get_field("title")
		with self.assertRaises(frappe.ValidationError):
			masivo.valor_campo(title, "  ")
		self.assertEqual(masivo.valor_campo(title, " Hola "), "Hola")

	def test_line_format_matches_d9(self):
		name = self._note("D12 prueba formato")
		lines = masivo._campo(
			"Note",
			name,
			{"df": frappe.get_meta("Note").get_field("title"), "label": "Título", "value": "D12 prueba f2"},
			"D12 prueba formato",
		)
		self.assertEqual(len(lines), 1)
		line = lines[0]
		self.assertEqual(set(line), {"doctype", "name", "label", "receipt", "undo"})
		self.assertEqual(line["undo"]["kind"], "set")
		self.assertEqual(line["undo"]["before"], {"title": "D12 prueba formato"})
		self.assertTrue(line["undo"]["modified"])
