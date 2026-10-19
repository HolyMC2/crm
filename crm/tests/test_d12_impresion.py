"""Impresión (Shell D12): print formats, preview, the owner's Jinja editor, permissions."""

# ci: shell-apis

from unittest import TestCase, skipIf

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import impresion

	HAS_FRAPPE = True
except ImportError:  # bench-free run: nothing here runs without Frappe
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

ROLE = "Impresion Test Reader"
SELLER = "impresion-vendedora@example.com"
FORMAT = "D12 prueba nota"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestImpresionPure(TestCase):
	def test_kinds_follow_how_printview_renders(self):
		self.assertEqual(impresion.kind_of("Standard"), "standard")
		self.assertEqual(impresion.kind_of(None), "standard")
		self.assertEqual(impresion.kind_of(frappe._dict(print_designer=1, custom_format=1)), "pd")
		self.assertEqual(impresion.kind_of(frappe._dict(print_format_type="JS", custom_format=1)), "js")
		self.assertEqual(impresion.kind_of(frappe._dict(raw_printing=1)), "raw")
		self.assertEqual(impresion.kind_of(frappe._dict(custom_format=1)), "jinja")
		self.assertEqual(impresion.kind_of(frappe._dict(standard="Yes")), "jinja")
		self.assertEqual(impresion.kind_of(frappe._dict(format_data="[]", standard="No")), "builder")
		self.assertEqual(impresion.kind_of(frappe._dict(print_format_builder_beta=1)), "builder")

	def test_untranslated_english_field_labels_stay_out_of_campos(self):
		lang = getattr(frappe.local, "lang", None)
		frappe.local.lang = "es"
		try:
			self.assertIsNone(impresion.etiqueta_campo("Stamp generation of the D12 test", "mx_d12_stamp"))
			self.assertIsNone(impresion.etiqueta_campo("Original CFDI document for D12"))
			self.assertEqual(impresion.etiqueta_campo("Nombre del cliente"), "Nombre del cliente")
			self.assertEqual(impresion.etiqueta_campo("", "consolidado"), "consolidado")
		finally:
			frappe.local.lang = lang

	def test_a_print_designer_format_without_its_design_is_broken(self):
		self.assertTrue(impresion.is_broken(frappe._dict(print_designer=1, print_designer_body="[]")))
		self.assertFalse(
			impresion.is_broken(
				frappe._dict(print_designer=1, print_designer_body="[]", print_designer_settings="{}")
			)
		)
		self.assertFalse(impresion.is_broken(frappe._dict(custom_format=1)))

	def test_version_summary_in_words(self):
		data = {"changed": [["html", "<p>a</p>", "<p>a</p>\n<p>b</p>"], ["css", "", ".x{}"]]}
		summary = impresion.version_summary(frappe.as_json(data))
		self.assertIn("+1", summary)
		self.assertIn("los estilos", summary)
		self.assertTrue(impresion.version_summary("not json"))

	def test_jinja_errors_carry_the_line_never_a_traceback(self):
		from jinja2 import TemplateSyntaxError

		try:
			frappe.get_jenv().from_string("<p>\n{% if doc.x %}\nhola")
		except TemplateSyntaxError as exc:
			error = impresion.jinja_error(exc)
		# Jinja points at the block left open (line 2) or the end (line 3), by version.
		self.assertIn(error["line"], (2, 3))
		self.assertIn(str(error["line"]), error["message"])
		self.assertNotIn("Traceback", error["message"])


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestImpresion(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("User", SELLER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": SELLER,
					"first_name": "Vendedora",
					"last_name": "Impresión",
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", SELLER)
		user.set("roles", [])
		user.append("roles", {"role": ROLE})
		user.save(ignore_permissions=True)
		self.note = frappe.get_doc({"doctype": "Note", "title": "Nota D12 impresión", "public": 1}).insert()
		self._drop_formats()
		self.pf = frappe.get_doc(
			{
				"doctype": "Print Format",
				"name": FORMAT,
				"doc_type": "Note",
				"standard": "No",
				"custom_format": 1,
				"print_format_type": "Jinja",
				"html": "<h1>{{ doc.title }}</h1>",
			}
		).insert()

	def tearDown(self):
		frappe.set_user("Administrator")
		self._drop_formats()
		frappe.db.delete("Property Setter", {"doc_type": "Note", "property": "default_print_format"})
		frappe.clear_cache(doctype="Note")

	def _drop_formats(self):
		for name in frappe.get_all("Print Format", filters={"name": ["like", "D12 prueba%"]}, pluck="name"):
			frappe.db.set_value("Print Format", name, "standard", "No")
			frappe.delete_doc("Print Format", name, force=True, ignore_permissions=True)

	def test_owner_endpoints_refuse_a_non_manager_in_spanish(self):
		frappe.set_user(SELLER)
		calls = (
			lambda: impresion.formatos(),
			lambda: impresion.formato(FORMAT),
			lambda: impresion.predeterminar("Note", FORMAT),
			lambda: impresion.probar("Note", self.note.name, "<p>{{ doc.title }}</p>"),
			lambda: impresion.guardar(FORMAT, "<p>x</p>"),
			lambda: impresion.duplicar(FORMAT, "D12 prueba copia"),
			lambda: impresion.versiones(FORMAT),
		)
		for call in calls:
			with self.assertRaises(frappe.PermissionError):
				call()
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Print Format", FORMAT, "html"), "<h1>{{ doc.title }}</h1>")
		self.assertFalse(frappe.db.exists("Print Format", "D12 prueba copia"))

	def test_formatos_groups_by_document_type_with_the_default(self):
		groups = impresion.formatos("Note")["groups"]
		self.assertEqual([g["doctype"] for g in groups], ["Note"])
		names = {f["name"]: f for f in groups[0]["formats"]}
		self.assertEqual(names[FORMAT]["kind"], "jinja")
		self.assertTrue(names[FORMAT]["editable"])
		self.assertTrue(names["Standard"]["default"])
		impresion.predeterminar("Note", FORMAT)
		self.assertEqual(frappe.get_meta("Note").default_print_format, FORMAT)
		formats = impresion.formatos("Note")["groups"][0]["formats"]
		self.assertEqual(formats[0]["name"], FORMAT)
		self.assertTrue(formats[0]["default"])

	def test_probar_renders_the_record_without_raw_jinja(self):
		out = impresion.probar(
			"Note", self.note.name, "<h1>{{ doc.title }}</h1>\n<p>{{ frappe.utils.cstr(doc.name) }}</p>"
		)
		self.assertIsNone(out["error"])
		self.assertIn("Nota D12 impresión", out["html"])
		self.assertNotIn("{{", out["html"])
		self.assertTrue(out["style"])
		# Nothing was saved.
		self.assertEqual(frappe.db.get_value("Print Format", FORMAT, "html"), "<h1>{{ doc.title }}</h1>")
		self.assertFalse(frappe.db.exists("Print Format", impresion.PROBE))

	def test_probar_maps_jinja_errors_to_a_line(self):
		out = impresion.probar("Note", self.note.name, "<p>\n\n{{ doc.nada.otra }}</p>")
		self.assertIsNone(out["html"])
		self.assertEqual(out["error"]["line"], 3)
		self.assertIn("nada", out["error"]["message"])
		out = impresion.probar("Note", self.note.name, "<p>{% if doc.title %}hola")
		self.assertEqual(out["error"]["line"], 1)
		self.assertNotIn("Traceback", out["error"]["message"])

	def test_vista_previa_returns_html_and_a_spanish_pdf_link(self):
		out = impresion.vista_previa("Note", self.note.name, FORMAT, membrete=0)
		self.assertIsNone(out["error"])
		self.assertIn("Nota D12 impresión", out["html"])
		self.assertIn("language=es-MX", out["pdf_url"])
		self.assertIn("no_letterhead=1", out["pdf_url"])
		with self.assertRaises(frappe.DoesNotExistError):
			impresion.vista_previa("Note", self.note.name, "D12 prueba que no existe")

	def test_a_failing_format_comes_back_as_damaged_with_a_short_detail(self):
		frappe.db.set_value("Print Format", FORMAT, "html", "<p>{{ doc.nada.otra }}</p>")
		frappe.clear_document_cache("Print Format", FORMAT)
		out = impresion.vista_previa("Note", self.note.name, FORMAT)
		self.assertIsNone(out["html"])
		self.assertIn("dañado", out["error"]["message"])
		self.assertIn("nada", out["error"]["detalle"])
		self.assertNotIn("Traceback", out["error"]["detalle"])

	def test_standard_formats_are_read_only_and_duplicate_as_custom(self):
		frappe.db.set_value("Print Format", FORMAT, "standard", "Yes")
		with self.assertRaises(frappe.ValidationError):
			impresion.guardar(FORMAT, "<p>{{ doc.title }}</p>")
		self.assertFalse(impresion.formato(FORMAT)["editable"])
		copy = impresion.duplicar(FORMAT, "D12 prueba copia")
		self.assertEqual(copy["kind"], "jinja")
		new = frappe.get_doc("Print Format", "D12 prueba copia")
		self.assertEqual(new.standard, "No")
		self.assertIn("doc.title", new.html)
		with self.assertRaises(frappe.DuplicateEntryError):
			impresion.duplicar(FORMAT, "D12 prueba copia")

	def test_guardar_saves_checks_syntax_and_keeps_versions(self):
		with self.assertRaises(frappe.ValidationError):
			impresion.guardar(FORMAT, "<p>{% if doc.title %}")
		saved = impresion.guardar(FORMAT, "<h2>{{ doc.title }}</h2>", ".x { color: red }")
		self.assertEqual(frappe.db.get_value("Print Format", FORMAT, "html"), "<h2>{{ doc.title }}</h2>")
		with self.assertRaises(frappe.TimestampMismatchError):
			impresion.guardar(FORMAT, "<h3>x</h3>", modified="2000-01-01 00:00:00")
		self.assertTrue(saved["modified"])
		versions = impresion.versiones(FORMAT)
		self.assertTrue(versions)
		self.assertIn("código", versions[0]["summary"])

	def test_formato_lists_fields_and_a_sample(self):
		data = impresion.formato(FORMAT)
		self.assertEqual(data["doc_type"], "Note")
		self.assertIn("{{ doc.title }}", data["html"])
		self.assertIn("title", [f["fieldname"] for f in data["fields"]])
		self.assertIsNone(data["designer_url"])
		self.assertTrue(data["sample"]["name"])
