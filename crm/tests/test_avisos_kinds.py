"""Avisos grouping and gate paths without a bench."""

from unittest import TestCase

from crm.avisos import kinds
from crm.avisos_routes import is_avisos_path


def row(**values):
	base = {"source": "native", "name": "N1", "type": "Alert", "title": "", "doctype": None, "docname": None}
	base.update(values)
	return base


class TestAvisosKinds(TestCase):
	def test_categories(self):
		self.assertEqual(kinds.category(row(type="Mention")), "direct")
		self.assertEqual(kinds.category(row(type="Assignment", doctype="ToDo", docname="T")), "direct")
		self.assertEqual(kinds.category(row(source="crm", type="Task")), "direct")
		self.assertEqual(kinds.category(row(source="crm", type="WhatsApp")), "messages")
		self.assertEqual(kinds.category(row(source="crm", type="Form")), "messages")
		self.assertEqual(kinds.category(row(doctype="Sales Order", docname="SO-1")), "alerts")
		self.assertEqual(kinds.category(row(link="/app/scan-task")), "alerts")
		self.assertEqual(kinds.category(row()), "system")
		self.assertEqual(kinds.category(row(type="Energy Point")), "system")

	def test_repeating_system_alerts_fold_into_one_group(self):
		first = row(title="651 every-tick job(s) run without failure logging")
		second = row(name="N2", title="12 every-tick job(s) run without failure logging")
		self.assertEqual(kinds.group_key(first), kinds.group_key(second))
		drift = row(title="💱 Valor de trato desfasado en 38 tratos — Centro: 20, Norte: 18. Revisar: D-1")
		drift2 = row(name="N3", title="💱 Valor de trato desfasado en 451 tratos — Centro: 400. Revisar: D-9")
		self.assertEqual(kinds.group_key(drift), kinds.group_key(drift2))
		self.assertNotEqual(kinds.group_key(first), kinds.group_key(drift))

	def test_alerts_group_per_record_and_kind(self):
		a = row(title="POS sale did not post: SINV-1", doctype="POS Ledger", docname="L1")
		b = row(name="N2", title="POS sale did not post: SINV-1", doctype="POS Ledger", docname="L1")
		c = row(name="N3", title="POS sale did not post: SINV-2", doctype="POS Ledger", docname="L2")
		self.assertEqual(kinds.group_key(a), kinds.group_key(b))
		self.assertNotEqual(kinds.group_key(a), kinds.group_key(c))
		self.assertEqual(kinds.kind_key(a), kinds.kind_key(c))

	def test_direct_without_record_stays_alone(self):
		a = row(type="Mention", name="M1")
		b = row(type="Mention", name="M2")
		self.assertNotEqual(kinds.group_key(a), kinds.group_key(b))

	def test_whatsapp_groups_per_conversation(self):
		a = row(source="crm", type="WhatsApp", doctype="CRM Deal", docname="D1", name="C1")
		b = row(source="crm", type="WhatsApp", doctype="CRM Deal", docname="D1", name="C2")
		c = row(source="crm", type="WhatsApp", doctype="CRM Deal", docname="D2", name="C3")
		self.assertEqual(kinds.group_key(a), kinds.group_key(b))
		self.assertNotEqual(kinds.group_key(a), kinds.group_key(c))

	def test_separator_in_record_name_cannot_forge_a_category(self):
		key = kinds.group_key(row(doctype="ToDo", docname="x|direct", title="t"))
		self.assertEqual(kinds.key_category(key), "alerts")
		self.assertIsNone(kinds.key_category("evil|native|Alert"))

	def test_prefs_normalize_and_never_hide_direct(self):
		prefs = kinds.normalize_prefs(
			{
				"categories": {"direct": "off", "system": "badge", "bogus": "badge", "alerts": "loud"},
				"muted": ["direct|native|Mention||", "system|native|Alert||x", "system|native|Alert||x", 5],
			}
		)
		self.assertEqual(prefs["categories"]["direct"], "quiet")
		self.assertEqual(prefs["categories"]["system"], "badge")
		self.assertEqual(prefs["categories"]["alerts"], "badge")
		self.assertNotIn("bogus", prefs["categories"])
		self.assertEqual(prefs["muted"], ["system|native|Alert||x"])
		self.assertEqual(kinds.normalize_prefs(None)["categories"], kinds.DEFAULT_MODES)

	def test_visibility(self):
		prefs = kinds.normalize_prefs({"muted": ["alerts|native|Alert|SO|x"]})
		self.assertEqual(kinds.visibility("alerts", "alerts|native|Alert|SO|x", prefs), "off")
		self.assertEqual(kinds.visibility("system", "system|native|Alert||y", prefs), "quiet")
		self.assertEqual(kinds.visibility("direct", "direct|native|Mention||", prefs), "badge")

	def test_plain_text_never_keeps_markup(self):
		self.assertEqual(kinds.plain("<b>Hola</b> &amp; <script>x</script>adiós"), "Hola & x adiós")
		self.assertEqual(kinds.plain("abcdef", limit=4), "abc…")

	def test_kind_label(self):
		self.assertEqual(kinds.kind_label("system|native|Alert||# every-tick"), "# every-tick")
		self.assertEqual(kinds.kind_label("messages|crm|WhatsApp|CRM Deal|"), "WhatsApp · CRM Deal")


class TestAvisosPaths(TestCase):
	def test_avisos_and_legacy_notifications_are_neutral(self):
		for path in ("/crm/avisos", "/crm/avisos?view=history", "/crm/notifications", "/crm/avisos/"):
			with self.subTest(path=path):
				self.assertTrue(is_avisos_path(path))

	def test_other_paths_are_not(self):
		for path in (
			"/crm",
			"/crm/avisos/extra",
			"/crm/avisos-x",
			"//evil.invalid/crm/avisos",
			"https://evil.invalid/crm/avisos",
			"/crm/avisos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_avisos_path(path))


# Subjects seen on doco prod and doco-mirror (2026-10-08), one per producer that
# writes a Notification Log without a record, and the tool that settles each.
RECORDLESS_NOTICES = {
	"⏰ Factura global 2026-08 NO emitida: 422 venta(s) público general ($157,091.00) "
	"[PEND-GLOBAL Grupo Doco 2026-09-16]": "contador_global",
	"📅 Opinión de cumplimiento (propia y de proveedores clave) — vence HOY (2026-10-05) "
	"[CAL opinion_32d 2026-10-05 T-0 Grupo Doco]": "contador_obligaciones",
	"DOF 2026-08-28: 3 aviso(s) fiscal(es) relevantes [DOF-DIGEST 2026-08-28 n3]": "contador_obligaciones",
	"⚙ DOF: cambia un dato del motor fiscal o una regla": "contador_obligaciones",
	"⚠ Buzón tributario sin verificar — Grupo Doco [C0 Grupo Doco buzon-sin-verificar 2026-09-13]": (
		"contador_cartera"
	),
	"⚠ Opinión de cumplimiento sin verificar (propia) — Grupo Doco "
	"[C0 Grupo Doco opinion-sin-verificar 2026-09-13]": "contador_cartera",
	"⚠ 2 proveedor(es) clave sin opinión verificada — Grupo Doco "
	"[C0 Grupo Doco proveedores-sin-opinion 2026-08]": "contador_cartera",
	"⚠ Periodo vencido sin declarar: Grupo Doco [CSD Grupo Doco 2026-09-27]": "contador_declaracion",
	"Recordatorio día 15: la declaración de Grupo Doco 2026-07 aún no está pagada.": "contador_declaracion",
	"Recordatorio vence hoy 2026-08-18: la declaración de Grupo Doco 2026-07 aún no está pagada.": (
		"contador_declaracion"
	),
	"⚖ Conciliación 2026-08 Grupo Doco: revisar libros vs SAT": "contador_cfdis",
	"REP pendientes 2026-09 [PEND-REP Grupo Doco 2026-10-01]": "contador_pendientes",
	"Vigencias [VIGENCIA 2026-W40]": "contador_credenciales",
	"Tope RESICO [RESICO-CLIFF Grupo Doco 2026 80]": "contador_regimen",
	"Deriva del cierre [DERIVA Grupo Doco 2026-08 IVA]": "contador_cierre",
	"Plataformas [PLAT-17 Grupo Doco 2026-10-01]": "contador_plataforma",
	"Cancelación pendiente [CANCELPEND 0000-AAAA 2026-10-01]": "contador_cfdis",
	"Higiene CRM: 39 trato(s) con pendientes — Casa Matriz: 39": "ventas_hygiene",
	"Higiene CRM: 4 de tus tratos con pendientes — sin propietario: 4": "ventas_hygiene",
	"💱 Valor de trato desfasado en 38 tratos — Casa Matriz: 38. Revisar: CRM-DEAL-2026-00248, "
	"CRM-DEAL-2026-00390 (+30 más). El valor se corrige al guardar el trato.": "ventas_drift",
	"💱 Valor desfasado en 12 de tus tratos: CRM-DEAL-2026-00390. El valor se corrige al guardar el trato.": (
		"ventas_drift"
	),
	"6 every-tick job(s) run without failure logging": "desk_dark_jobs",
	"412 errors in 15 min": "desk_error_log",
	"2 scheduled job type(s) failing every run": "desk_failed_jobs",
	"30 scheduled job failures in 60 min": "desk_failed_jobs",
	"Scheduler last logged 45 min ago": "desk_job_log",
	"marcoantonioponcevaldez@gmail.com just impersonated as you. They will be able to see": (
		"desk_impersonation"
	),
}


class TestAvisosNotices(TestCase):
	def test_every_recordless_producer_maps_to_its_tool(self):
		for subject, key in RECORDLESS_NOTICES.items():
			with self.subTest(subject=subject):
				self.assertEqual(kinds.notice(subject), key)

	def test_record_notices_keep_their_record(self):
		for subject in (
			"Anticipo pendiente de facturar — RO-00202",
			"Nuevo pedido de tienda SAL-ORD-2026-00024 — total 950",
			"Mañana: Jennifer 14-22, Andrés descansa",
			"Se te asignó una tarea de conteo en Almacén: SCT-202608-4984",
		):
			with self.subTest(subject=subject):
				self.assertIsNone(kinds.notice(subject))

	def test_worker_text_drops_internal_tags_and_the_mail_hold_note(self):
		self.assertEqual(
			kinds.display(
				"📅 Opinión de cumplimiento — vence HOY (2026-10-05) [CAL opinion_32d 2026-10-05 T-0 Grupo Doco]"
			),
			"📅 Opinión de cumplimiento — vence HOY (2026-10-05)",
		)
		self.assertEqual(
			kinds.display(
				"Avisar equipo listo<p>La notificación está disponible aquí. Su copia por correo no se envió: "
				'el correo de Muelle está reservado. <a href="/app/email-account">Conectar</a></p>'
			),
			"Avisar equipo listo",
		)
		# Brackets that are content stay.
		for text in ("Batería [iPhone 12] lista", "Nota [NUEVO]", "Pedido [A]"):
			self.assertEqual(kinds.display(text), text)

	def test_a_drift_digest_lists_its_deals_once_in_order(self):
		self.assertEqual(
			kinds.deal_names(
				"Revisar: CRM-DEAL-2026-00248, CRM-DEAL-2026-00390, CRM-DEAL-2026-00248 (+30 más)"
			),
			["CRM-DEAL-2026-00248", "CRM-DEAL-2026-00390"],
		)
