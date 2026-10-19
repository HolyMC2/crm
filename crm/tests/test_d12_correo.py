# ci: shell-apis
"""Correo (Shell D12): noise folding, addresses and templates as pure logic; permissions, rendered
templates, the record's thread, the queue and idempotent sending against the database."""

from unittest import TestCase, skipIf

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import correo

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


def _row(i, subject, sender=None, kind="Communication", received=True, seen=0):
	return {
		"name": f"c{i}",
		"subject": subject,
		"sender": sender,
		"communication_type": kind,
		"sent_or_received": "Received" if received else "Sent",
		"seen": seen,
		# newest first, as the queue reads them
		"communication_date": f"2026-10-18 12:{59 - (i % 60):02d}:00",
	}


@skipIf(not HAS_FRAPPE, "Frappe is not installed")
class TestCorreoPuro(TestCase):
	"""No database: the rules the queue and the compose sheet are made of."""

	def test_alerts_fold_into_one_system_row_and_people_stay_rows(self):
		rows = [_row(i, f"⚠️ Saldo TAECEL bajo en {1 + i % 3} bolsa(s)", received=False) for i in range(424)]
		rows += [
			_row(500 + i, f"MAT-MR-2026-0000{i} has been received", "compras@tienda.mx", "Automated Message")
			for i in range(3)
		]
		rows += [_row(600, "¿Me mandas la factura?", "Ana López <ana@cliente.mx>")]
		rows += [_row(601, "Cotización de mesas", "beto@cliente.mx")]
		categorias, filas = correo.agrupar(rows)
		self.assertEqual([c["clave"] for c in categorias], ["sistema"])
		self.assertEqual(len(categorias[0]["filas"]), 427)
		self.assertEqual([r["name"] for r in filas], ["c600", "c601"])

	def test_a_subject_repeated_three_times_by_others_becomes_its_own_category(self):
		rows = [_row(i, f"Tu pedido PED-2026-00{i} está listo", "ventas@proveedor.mx") for i in range(4)]
		rows += [
			_row(10 + i, f"Factura ACC-SINV-2026-000{i} de Grupo Doco", "yo@tienda.mx", received=False)
			for i in range(5)
		]
		rows += [_row(20, "Hola", "ana@cliente.mx")]
		categorias, filas = correo.agrupar(rows, propios={"yo@tienda.mx"})
		self.assertEqual(len(categorias), 1)
		self.assertTrue(categorias[0]["clave"].startswith("asunto:"))
		self.assertEqual(len(categorias[0]["filas"]), 4)
		# What the worker wrote is never folded away, however alike.
		self.assertEqual(len([r for r in filas if r["sender"] == "yo@tienda.mx"]), 5)
		opened = correo.en_categoria(rows, categorias[0]["clave"], propios={"yo@tienda.mx"})
		self.assertEqual([r["name"] for r in opened], ["c0", "c1", "c2", "c3"])
		# Two alike are a conversation, not noise.
		self.assertEqual(correo.agrupar(rows[:2])[0], [])

	def test_subject_families_and_noise_senders(self):
		self.assertEqual(
			correo.clave_asunto("⚠️ Saldo TAECEL bajo en 2 bolsa(s)"),
			correo.clave_asunto("Re: ⚠️ Saldo TAECEL bajo en 3 bolsa(s)"),
		)
		self.assertEqual(
			correo.clave_asunto("Factura ACC-SINV-2026-00012"),
			correo.clave_asunto("Factura ACC-SINV-2026-00013"),
		)
		self.assertNotEqual(correo.clave_asunto("Factura 12"), correo.clave_asunto("Cotización 12"))
		for sender in ("no-reply@docomexico.com", "Avisos <noreply@x.mx>", "mailer-daemon@x.mx", "", None):
			self.assertTrue(correo.es_ruido({"sender": sender}), sender)
		self.assertTrue(correo.es_ruido({"sender": "ana@x.mx", "communication_type": "Automated Message"}))
		self.assertFalse(correo.es_ruido({"sender": "Ana <ana@cliente.mx>"}))
		self.assertFalse(correo.es_ruido({"sender": "noreply@tienda.mx"}, propios={"noreply@tienda.mx"}))

	def test_addresses(self):
		self.assertEqual(
			correo.separar_correos('Ana <Ana@Cliente.mx>, beto@x.mx; ana@cliente.mx\n["no"]'),
			["ana@cliente.mx", "beto@x.mx", '["no"]'],
		)
		self.assertEqual(correo.separar_correos('["a@x.mx", {"email": "b@x.mx"}]'), ["a@x.mx", "b@x.mx"])
		self.assertTrue(correo.correo_valido("ana@cliente.mx"))
		for bad in ("ana", "ana@", "ana@cliente", "a b@x.mx", "Ana <ana@x.mx>"):
			self.assertFalse(correo.correo_valido(bad), bad)

	def test_bodies_never_show_tags_or_template_code(self):
		text = correo.texto_plano(
			"<style>p{color:red}</style><p>Hola&nbsp;Ana</p><p>Va <b>tu</b> factura</p>"
		)
		self.assertEqual(text, "Hola Ana\n\nVa tu factura")
		self.assertEqual(correo.texto_plano("<p>" + "a" * 300 + "</p>", limite=20), "a" * 19 + "…")
		self.assertEqual(correo.sin_jinja("Hola {{ lead_name }}{% if x %}!{% endif %}"), "Hola !")
		html = correo.html_de_texto("Hola <Ana>,\n\nTe mando\nla factura")
		self.assertEqual(html, "<p>Hola &lt;Ana&gt;,</p><p>Te mando<br>la factura</p>")

	def test_template_fit_reads_the_fields_it_needs(self):
		self.assertEqual(
			correo.variables(
				"{{ doc.customer_name }} {{ grand_total | round(2) }} {% for i in items %}{{ i.qty }}{% endfor %} {{ _('Hola') }}"
			),
			{"customer_name", "grand_total", "items"},
		)
		fields = {"customer_name", "grand_total", "items"}
		self.assertTrue(correo.encaja("Hola {{ customer_name }} ({{ name }})", fields))
		self.assertFalse(correo.encaja("Hola {{ lead_name }}", fields))
		# The picker: no English previews, no templates made for other documents.
		self.assertTrue(
			correo.plantilla_visible(
				"Factura ACC-SINV-1 de Grupo Doco",
				"Hola Ana, te mando tu factura.",
				"{{ customer_name }}",
				fields,
			)
		)
		self.assertFalse(
			correo.plantilla_visible(
				"Interview Feedback Reminder", "Please submit your feedback for the interview.", "", fields
			)
		)
		self.assertFalse(
			correo.plantilla_visible(
				"Aviso de permiso", "Hola, tu permiso quedó listo.", "{{ leave_type }}", fields
			)
		)
		self.assertTrue(
			correo.plantilla_visible(
				"Aviso de permiso", "Hola, tu permiso quedó listo.", "{{ leave_type }}", fields, 3
			)
		)
		self.assertEqual(correo.articulo("factura"), "la")
		self.assertEqual(correo.articulo("pedido"), "el")
		self.assertEqual(correo.articulo("orden de compra"), "la")
		self.assertEqual(correo.articulo("solicitud de material"), "la")


ROLE = "Correo D12 Lectora"
TEMPLATE = "D12 prueba nota"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestCorreoAcceso(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.flags.mute_emails = True  # never sends: queued only
		if not frappe.db.exists("Role", ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		self.email = "correo-d12-lectora@example.com"
		if not frappe.db.exists("User", self.email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": self.email,
					"first_name": "Lectora",
					"last_name": "Correo",
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", self.email)
		user.set("roles", [{"role": ROLE}])
		user.set("block_modules", [])
		user.save(ignore_permissions=True)
		from frappe.permissions import add_permission

		add_permission("Note", ROLE, 0)  # read only: no «email» right
		frappe.clear_cache(doctype="Note")
		self.note = frappe.get_doc({"doctype": "Note", "title": "Pedido especial D12", "public": 1}).insert()
		if not frappe.db.exists("Email Template", TEMPLATE):
			frappe.get_doc(
				{
					"doctype": "Email Template",
					"name": TEMPLATE,
					"subject": "Nota {{ title }}",
					"response": "<p>Hola, va la nota {{ doc.title }}.</p>",
				}
			).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_a_reader_without_email_right_is_refused_with_a_reason(self):
		frappe.set_user(self.email)
		draft = correo.borrador("Note", self.note.name)
		self.assertFalse(draft["puede_enviar"])
		self.assertTrue(draft["motivo"])
		with self.assertRaises(frappe.PermissionError):
			correo.enviar("Note", self.note.name, ["d12-prueba@example.com"], "Hola", "Texto", adjuntar_pdf=0)

	def test_a_template_is_filled_with_the_record(self):
		draft = correo.borrador("Note", self.note.name, plantilla=TEMPLATE)
		self.assertEqual(draft["asunto"], "Nota Pedido especial D12")
		self.assertIn("va la nota Pedido especial D12", draft["cuerpo"])
		self.assertNotIn("{{", draft["asunto"] + draft["cuerpo"])
		listed = next(p for p in draft["plantillas"] if p["name"] == TEMPLATE)
		self.assertNotIn("{{", listed["vista"])
		self.assertTrue(listed["encaja"])
		self.assertTrue(draft["puede_enviar"])

	def test_sending_twice_with_one_request_id_sends_once_and_shows_in_thread_and_queue(self):
		args = {
			"doctype": "Note",
			"name": self.note.name,
			"para": '["d12-prueba@example.com"]',
			"asunto": "Nota D12",
			"cuerpo": "Hola,\n\nva la nota.",
			"adjuntar_pdf": 0,
			"request_id": f"d12-{self.note.name}",
		}
		first = correo.enviar(**args)
		second = correo.enviar(**args)
		self.assertEqual(first["comunicacion"], second["comunicacion"])
		self.assertEqual(
			frappe.db.count("Communication", {"reference_doctype": "Note", "reference_name": self.note.name}),
			1,
		)
		self.assertEqual(first["para"], ["d12-prueba@example.com"])
		thread = correo.hilo("Note", self.note.name)["correos"]
		self.assertEqual([c["name"] for c in thread], [first["comunicacion"]])
		self.assertEqual(thread[0]["direccion"], "enviado")
		self.assertNotIn("<", thread[0]["snippet"])
		queue = correo.bandeja(vista="enviados", buscar="Nota D12")
		row = next(r for r in queue["filas"] if r["name"] == first["comunicacion"])
		self.assertEqual(row["documento"]["titulo"], "Pedido especial D12")
		message = correo.mensaje(first["comunicacion"])
		self.assertEqual(message["documento"]["titulo"], "Pedido especial D12")
		self.assertNotIn("<script", message["html"])

	def test_bad_recipients_and_empty_messages_are_refused(self):
		with self.assertRaises(frappe.ValidationError):
			correo.enviar("Note", self.note.name, "no-es-correo", "Hola", "Texto", adjuntar_pdf=0)
		with self.assertRaises(frappe.ValidationError):
			correo.enviar("Note", self.note.name, "d12-prueba@example.com", "", "Texto", adjuntar_pdf=0)
