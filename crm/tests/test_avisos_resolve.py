"""Avisos resolver: every known source opens where it is settled, and only for who may open it."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import avisos as api
from crm.avisos import kinds, resolve, stream
from crm.tests.test_avisos import ANA, BETO, ensure_user, log
from crm.tests.test_avisos_kinds import RECORDLESS_NOTICES

NO_RECORD = "This aviso has no linked record. Mark it as read when you have handled it."


def opens(target):
	return bool(target["route"] or target["href"] or target["desk"])


class TestAvisosResolve(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		ensure_user(ANA)
		ensure_user(BETO)

	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Notification Log", {"for_user": ["in", [ANA, BETO, "Administrator"]]})
		if frappe.db.table_exists("CRM Notification"):
			frappe.db.delete("CRM Notification", {"to_user": ["in", [ANA, BETO, "Administrator"]]})
		for user in (ANA, BETO, "Administrator"):
			frappe.defaults.clear_user_default(stream.PREFS_DEFAULT, user)

	def tearDown(self):
		frappe.set_user("Administrator")

	def targets(self, user):
		frappe.set_user(user)
		data = api.get_stream(limit=100)
		frappe.set_user("Administrator")
		return {g["title"]: g for g in data["groups"]}

	def one(self, user, title):
		"""The group a test wrote; site fixtures may notify the same user about other things."""
		return self.targets(user)[title]

	def test_every_notice_names_a_known_tool(self):
		self.assertLessEqual({key for _pattern, key in kinds.NOTICES}, set(resolve.TOOLS))

	def test_every_recordless_producer_opens_somewhere_for_someone_who_may(self):
		fiscal = "erpnext_mexico_compliance" in frappe.get_installed_apps()
		marketing = "doco_marketing" in frappe.get_installed_apps()
		for subject, key in RECORDLESS_NOTICES.items():
			frappe.db.delete("Notification Log", {"for_user": "Administrator"})
			log("Administrator", subject)
			group = self.one("Administrator", kinds.display(subject, 240))
			target = group["target"]
			with self.subTest(subject=subject):
				self.assertNotEqual(target["reason"], NO_RECORD)
				if key.startswith("contador_") and not fiscal:
					self.assertFalse(opens(target))
					self.assertTrue(target["reason"])
				elif key == "ventas_hygiene" and not marketing:
					self.assertTrue(target["reason"])
				else:
					self.assertTrue(opens(target), target)
					self.assertTrue(target["action"])
				# Internal dedupe tags never reach the worker.
				self.assertNotIn("[", group["title"])

	def test_a_tool_the_reader_cannot_open_is_a_reason_not_a_link(self):
		# A Sales User: no fiscal role, no Error Log read.
		for subject in (
			"⏰ Factura global 2026-08 NO emitida: 422 venta(s) [PEND-GLOBAL Grupo Doco 2026-09-16]",
			"412 errors in 15 min",
		):
			log(ANA, subject)
		groups = self.targets(ANA)
		for title in ("⏰ Factura global 2026-08 NO emitida: 422 venta(s)", "412 errors in 15 min"):
			group = groups[title]
			with self.subTest(title=title):
				self.assertFalse(opens(group["target"]))
				self.assertIn("cannot open", group["target"]["reason"])

	def test_the_contador_tool_carries_the_global_invoice_page(self):
		if "erpnext_mexico_compliance" not in frappe.get_installed_apps():
			self.skipTest("Contador is not installed")
		log("Administrator", "⏰ Factura global 2026-08 NO emitida [PEND-GLOBAL Grupo Doco 2026-09-16]")
		group = self.one("Administrator", "⏰ Factura global 2026-08 NO emitida")
		self.assertEqual(group["target"]["href"], "/contador/global")
		self.assertEqual(group["target"]["where"], "Contador")

	def test_a_drift_digest_lists_exactly_its_deals(self):
		subject = (
			"💱 Valor de trato desfasado en 38 tratos — Casa Matriz: 38. Revisar: CRM-DEAL-2026-00248, "
			"CRM-DEAL-2026-00390 (+30 más). El valor se corrige al guardar el trato."
		)
		log("Administrator", subject)
		group = self.one("Administrator", subject)
		url = urlsplit(group["target"]["route"])
		self.assertEqual(url.path, "/deals")
		self.assertEqual(
			parse_qs(url.query),
			{"report": ["avisos"], "deal": ["CRM-DEAL-2026-00248", "CRM-DEAL-2026-00390"]},
		)

	def test_tomorrows_shift_opens_the_agenda_day_or_its_desk_view(self):
		log(ANA, "Mañana: Jennifer 14-22", link="/app/asistencia?v=turnos")
		group = self.one(ANA, "Mañana: Jennifer 14-22")
		target = group["target"]
		self.assertTrue(opens(target))
		if target["route"]:
			query = parse_qs(urlsplit(target["route"]).query)
			self.assertEqual(query["view"], ["day"])
			self.assertEqual(query["cal"], ["Event,Turno"])
		else:
			self.assertEqual(target["desk"], "/app/asistencia?v=turnos")

	def crm_task(self, title="Avisar equipo listo"):
		task = frappe.get_doc({"doctype": "CRM Task", "title": title, "status": "Todo"})
		task.insert(ignore_permissions=True)
		return task

	def test_a_task_assignment_reads_as_the_task_and_opens_it(self):
		if not frappe.db.table_exists("CRM Notification"):
			self.skipTest("CRM Notification is not installed")
		task = self.crm_task()
		frappe.get_doc(
			{
				"doctype": "CRM Notification",
				"from_user": BETO,
				"to_user": "Administrator",
				"type": "Assignment",
				"notification_text": f"<b>Beto</b> assigned a new task {task.title} to you",
				"message": f"Beto assigned a CRM Task {task.name} to you",
				"notification_type_doctype": "CRM Task",
				"notification_type_doc": task.name,
			}
		).insert(ignore_permissions=True)
		full_name = frappe.utils.get_fullname(BETO)
		group = self.one("Administrator", f"{full_name} assigned you «Avisar equipo listo»")
		self.assertNotIn(f"CRM Task {task.name}", frappe.as_json(group))
		self.assertEqual(group["doctype"], "CRM Task")
		target = group["target"]
		self.assertTrue(opens(target))
		self.assertEqual(target["label"], "Avisar equipo listo")
		if target["route"]:
			self.assertEqual(target["route"], f"/pendientes/crm-task/{task.name}")

	def test_a_workshop_follow_up_opens_its_order_only_when_readable(self):
		task = self.crm_task()
		group = {
			"doctype": "CRM Task",
			"docname": task.name,
			"title": "Avisar equipo listo",
			"category": "direct",
		}
		with (
			patch.object(resolve, "_task_source", return_value=("Repair Order", "RO-00202")),
			patch.object(resolve.Access, "app", return_value=True),
		):
			readable = {"CRM Task": True, "Repair Order": True}
			with patch.object(resolve, "_readable", side_effect=lambda dt, _name: readable[dt]):
				target = resolve.target(group, resolve.Access())
				self.assertEqual(target["href"], "/taller/orders/RO-00202")
				self.assertEqual(target["where"], "Taller")
				readable["Repair Order"] = False
				target = resolve.target(group, resolve.Access())
				# No Repair Order read: the task itself, never the order.
				self.assertIsNone(target["href"])
				self.assertNotIn("RO-00202", frappe.as_json(target))
				self.assertTrue(target["route"] or target["desk"])

	def test_unmapped_records_open_their_desk_form_and_unreadable_ones_explain(self):
		todo = frappe.get_doc(
			{"doctype": "ToDo", "description": "De Beto", "allocated_to": BETO, "owner": BETO}
		).insert(ignore_permissions=True)
		log(ANA, "Nota interna de Beto", "Mention", "ToDo", todo.name)
		log("Administrator", "Stock Balance report is ready.", doctype="Report", docname="Stock Balance")
		beto = self.one(ANA, "Nota interna de Beto")
		self.assertFalse(opens(beto["target"]))
		self.assertTrue(beto["target"]["reason"])
		report = self.one("Administrator", "Stock Balance report is ready.")
		self.assertEqual(report["target"]["desk"], "/app/report/Stock%20Balance")
		self.assertEqual(report["target"]["where"], "Desk")

	def test_an_event_opens_its_day_in_the_agenda_or_desk(self):
		event = frappe.get_doc(
			{
				"doctype": "Event",
				"subject": "Cambio de precio",
				"starts_on": "2026-10-09 10:00:00",
				"event_type": "Private",
			}
		).insert(ignore_permissions=True)
		log("Administrator", "Te asignaron un evento", "Assignment", "Event", event.name)
		group = self.one("Administrator", "Te asignaron un evento")
		target = group["target"]
		self.assertTrue(opens(target))
		if target["route"]:
			query = parse_qs(urlsplit(target["route"]).query)
			self.assertEqual(query["date"], ["2026-10-09"])
			self.assertEqual(query["event"], [f"Event:{event.name}"])
