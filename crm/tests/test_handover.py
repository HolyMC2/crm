# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Entrega de turno (crm.handover): what Hoy hands over, and who sees it."""

import datetime
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, nowdate

from crm import handover


class HandoverCase(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.users = []
		self.closer = self.user("cierra")
		self.next = self.user("abre")
		self.settings = patch.object(handover, "_stored", return_value={})
		self.settings.start()
		self.addCleanup(self.settings.stop)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("CRM Shift Note", {"handed_by": ["in", self.users]})
		frappe.db.delete("ToDo", {"allocated_to": ["in", self.users]})
		frappe.db.delete("CRM Task", {"assigned_to": ["in", self.users]})
		for user in self.users:
			frappe.delete_doc("User", user, force=True, ignore_missing=True)
		super().tearDown()

	def user(self, label):
		email = f"zz-turno-{label}-{frappe.generate_hash(length=6)}@example.invalid"
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": label.title(),
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		)
		doc.flags.no_welcome_mail = True
		doc.insert(ignore_permissions=True)
		self.users.append(email)
		return email

	def todo(self, user, text, days=0):
		return frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": text,
				"allocated_to": user,
				"date": add_days(nowdate(), days),
				"status": "Open",
			}
		).insert(ignore_permissions=True)

	def task(self, user, title, days):
		due = datetime.datetime.combine(getdate(add_days(nowdate(), days)), datetime.time(11, 0))
		return frappe.get_doc(
			{"doctype": "CRM Task", "title": title, "status": "Todo", "assigned_to": user, "due_date": due}
		).insert(ignore_permissions=True)


class TestHandoverSections(HandoverCase):
	def test_the_closer_sees_their_open_pendientes_and_tomorrows_follow_ups(self):
		self.todo(self.closer, "Llamar al proveedor de pantallas")
		self.todo(self.closer, "Mañana no cuenta", days=1)
		self.task(self.closer, "Confirmar recogida", days=0)
		self.task(self.next, "Avisar equipo listo", days=1)
		frappe.set_user(self.closer)
		with patch.object(handover, "_paths", return_value=[]):
			built = {section["key"]: section for section in handover.sections()}
		mine = [row["title"] for row in built["pendientes"]["rows"]]
		self.assertIn("Llamar al proveedor de pantallas", mine)
		self.assertIn("Confirmar recogida", mine)
		self.assertNotIn("Mañana no cuenta", mine)
		self.assertIn("Avisar equipo listo", built["manana"]["rows"][0]["title"])

	def test_an_app_that_fails_costs_only_its_own_section(self):
		self.todo(self.closer, "Cerrar caja")
		frappe.set_user(self.closer)

		def broken(user):
			raise RuntimeError("boom")

		with (
			patch.object(handover, "_paths", return_value=["tests.broken"]),
			patch.object(handover, "_load", return_value=broken),
		):
			built = handover.sections()
		self.assertEqual([section["key"] for section in built], ["pendientes"])


class TestHandingOver(HandoverCase):
	def test_the_next_person_sees_the_note_until_they_say_got_it(self):
		self.todo(self.closer, "Cobrar a Juan el anticipo")
		frappe.set_user(self.closer)
		with patch.object(handover, "_paths", return_value=[]):
			given = handover.hand_over("El proveedor viene a las 11")
		self.assertTrue(given["message"])
		self.assertIsNone(handover.pending_for(self.closer))
		frappe.set_user(self.next)
		pending = handover.hoy_state()["pending"]
		self.assertEqual(pending["note"], "El proveedor viene a las 11")
		self.assertEqual(pending["by"], self.closer)
		self.assertTrue(pending["when"])
		self.assertIn("Cobrar a Juan el anticipo", json.dumps(pending["sections"], ensure_ascii=False))
		handover.acknowledge(pending["name"])
		self.assertIsNone(handover.hoy_state()["pending"])

	def test_a_handover_older_than_a_day_is_not_shown(self):
		frappe.set_user(self.closer)
		with patch.object(handover, "_paths", return_value=[]):
			given = handover.hand_over("")
		frappe.db.set_value(
			"CRM Shift Note",
			given["last"]["name"],
			"handed_at",
			datetime.datetime.now() - datetime.timedelta(hours=handover.VISIBLE_HOURS + 1),
		)
		frappe.set_user(self.next)
		self.assertIsNone(handover.hoy_state()["pending"])

	def test_the_owner_can_switch_it_off(self):
		self.settings.stop()
		with patch.object(handover, "_stored", return_value={"handover": False}):
			frappe.set_user(self.closer)
			self.assertFalse(handover.hoy_state()["available"])
			with self.assertRaises(frappe.ValidationError):
				handover.hand_over("nota")
			with self.assertRaises(frappe.PermissionError):
				handover.save_settings({"handover": True})
		self.settings.start()

	def test_a_note_has_a_length_limit(self):
		frappe.set_user(self.closer)
		with patch.object(handover, "_paths", return_value=[]), self.assertRaises(frappe.ValidationError):
			handover.hand_over("x" * (handover.NOTE_LIMIT + 1))
