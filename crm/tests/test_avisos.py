"""Avisos stream: own rows only, grouping, mark/undo, mute, targets and the gate."""

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from crm.api import avisos as api
from crm.avisos import resolve, stream

ANA = "avisos-ana@example.invalid"
BETO = "avisos-beto@example.invalid"
WEB = "avisos-web@example.invalid"


def ensure_user(email, user_type="System User"):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"user_type": user_type,
				"roles": [{"role": "Sales User"}] if user_type == "System User" else [],
			}
		).insert(ignore_permissions=True)
	return email


def log(user, subject, type="Alert", doctype=None, docname=None, read=0, link=None):
	doc = frappe.get_doc(
		{
			"doctype": "Notification Log",
			"for_user": user,
			"type": type,
			"subject": subject,
			"document_type": doctype,
			"document_name": docname,
			"link": link,
			"read": read,
		}
	)
	doc.flags.ignore_permissions = True
	doc.db_insert()
	return doc.name


def crm_notes(user, count, read=0, type="WhatsApp", seconds_ago=0):
	"""Bulk CRM Notification rows, newest first; WhatsApp rows here bind no message."""
	now = now_datetime()
	values = []
	for index in range(count):
		stamp = add_to_date(now, seconds=-(seconds_ago + index))
		values.append(
			(
				frappe.generate_hash(length=12),
				stamp,
				stamp,
				"Administrator",
				"Administrator",
				0,
				type,
				user,
				read,
				"Aviso sin acceso",
				"WhatsApp Message",
				"WAM-NOT-THERE",
			)
		)
	frappe.db.bulk_insert(
		"CRM Notification",
		fields=[
			"name",
			"creation",
			"modified",
			"owner",
			"modified_by",
			"docstatus",
			"type",
			"to_user",
			"read",
			"notification_text",
			"notification_type_doctype",
			"notification_type_doc",
		],
		values=values,
	)


class TestAvisos(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		ensure_user(ANA)
		ensure_user(BETO)
		ensure_user(WEB, "Website User")

	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Notification Log", {"for_user": ["in", [ANA, BETO, "Administrator"]]})
		if frappe.db.table_exists("CRM Notification"):
			frappe.db.delete("CRM Notification", {"to_user": ["in", [ANA, BETO]]})
		for user in (ANA, BETO):
			frappe.defaults.clear_user_default(stream.PREFS_DEFAULT, user)
		self.todo = frappe.get_doc(
			{"doctype": "ToDo", "description": "Llamar a Juan", "allocated_to": ANA, "owner": ANA}
		).insert(ignore_permissions=True)
		self.private = frappe.get_doc(
			{"doctype": "ToDo", "description": "Privado de Beto", "allocated_to": BETO, "owner": BETO}
		).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def group(self, data, category):
		return [g for g in data["groups"] if g["category"] == category]

	def test_repeats_collapse_and_quiet_system_alerts_skip_the_badge(self):
		for count in (651, 652, 653):
			log(ANA, f"{count} every-tick job(s) run without failure logging")
		log(ANA, "Ana te mencionó", "Mention", "ToDo", self.todo.name)
		log(ANA, "Ana te mencionó otra vez", "Mention", "ToDo", self.todo.name)
		frappe.set_user(ANA)
		data = api.get_stream()
		system = self.group(data, "system")
		direct = self.group(data, "direct")
		self.assertEqual([g["count"] for g in system], [3])
		self.assertEqual([g["count"] for g in direct], [2])
		self.assertEqual(direct[0]["title"], "Ana te mencionó otra vez")
		self.assertEqual(data["badge"], 1)  # system is «List only» by default
		self.assertEqual(api.get_badge()["count"], 1)
		self.assertEqual(data["counts"]["system"], 1)

	def test_only_own_rows_are_listed_or_written(self):
		mine = log(ANA, "Para Ana", doctype="ToDo", docname=self.todo.name)
		theirs = log(BETO, "Para Beto", doctype="ToDo", docname=self.private.name)
		frappe.set_user("Administrator")
		self.assertEqual(api.get_stream()["groups"], [])
		frappe.set_user(ANA)
		keys = [g["key"] for g in api.get_stream()["groups"]]
		self.assertEqual(len(keys), 1)
		api.mark_read(category="all")
		self.assertEqual(frappe.db.get_value("Notification Log", mine, "read"), 1)
		self.assertEqual(frappe.db.get_value("Notification Log", theirs, "read"), 0)
		# Undo cannot reach another person's rows either.
		frappe.db.set_value("Notification Log", theirs, "read", 1)
		api.mark_unread(native=[theirs, mine])
		self.assertEqual(frappe.db.get_value("Notification Log", mine, "read"), 0)
		self.assertEqual(frappe.db.get_value("Notification Log", theirs, "read"), 1)

	def test_mark_group_read_then_undo_restores_exactly_those_rows(self):
		a = log(ANA, "POS sale did not post: S-1", doctype="ToDo", docname=self.todo.name)
		b = log(ANA, "POS sale did not post: S-1", doctype="ToDo", docname=self.todo.name)
		other = log(ANA, "Otro aviso", "Mention")
		frappe.set_user(ANA)
		alerts = self.group(api.get_stream(), "alerts")
		result = api.mark_read(keys=[alerts[0]["key"]])
		self.assertEqual(sorted(result["native"]), sorted([a, b]))
		self.assertEqual(frappe.db.get_value("Notification Log", other, "read"), 0)
		self.assertEqual(self.group(api.get_stream(view="history"), "alerts")[0]["count"], 2)
		api.mark_unread(native=result["native"], crm=result["crm"])
		self.assertEqual(frappe.db.get_value("Notification Log", a, "read"), 0)
		# A forged key matches nothing.
		self.assertEqual(api.mark_read(keys=["direct|native|Mention|User|x"])["native"], [])

	def test_mute_moves_a_kind_out_of_the_inbox_and_badge(self):
		log(ANA, "Stock Balance report is ready", doctype="ToDo", docname=self.todo.name)
		log(ANA, "Te asignaron", "Assignment", "ToDo", self.todo.name)
		frappe.set_user(ANA)
		data = api.get_stream()
		alert = self.group(data, "alerts")[0]
		direct = self.group(data, "direct")[0]
		self.assertTrue(alert["mutable"])
		self.assertFalse(direct["mutable"])
		with self.assertRaises(frappe.ValidationError):
			api.set_muted(direct["kind"], 1)
		api.set_muted(alert["kind"], 1)
		data = api.get_stream()
		self.assertEqual(self.group(data, "alerts"), [])
		self.assertEqual(data["badge"], 1)
		muted = api.get_stream(view="muted")
		self.assertEqual([g["key"] for g in muted["groups"]], [alert["key"]])
		self.assertEqual([k["kind"] for k in muted["muted_kinds"]], [alert["kind"]])
		api.set_muted(alert["kind"], 0)
		self.assertEqual(len(self.group(api.get_stream(), "alerts")), 1)

	def test_preferences_change_the_badge(self):
		log(ANA, "Te asignaron", "Assignment", "ToDo", self.todo.name)
		log(ANA, "Algo del sistema")
		frappe.set_user(ANA)
		api.save_preferences({"direct": "quiet", "system": "badge"})
		self.assertEqual(api.get_badge()["count"], 1)
		prefs = api.save_preferences('{"system": "off", "direct": "off"}')
		self.assertEqual(prefs["categories"]["direct"], "quiet")
		self.assertEqual(api.get_badge()["count"], 0)
		self.assertEqual(self.group(api.get_stream(view="muted"), "system")[0]["count"], 1)

	def test_targets_are_reauthorized_with_a_reason_instead_of_a_dead_link(self):
		log(ANA, "Tuyo", "Mention", "ToDo", self.todo.name)
		log(ANA, "De Beto", "Mention", "ToDo", self.private.name)
		log(ANA, "Borrado", "Mention", "ToDo", "TODO-DOES-NOT-EXIST")
		log(ANA, "Sin registro", "Alert")
		log(ANA, "Con enlace", "Alert", link="/app/scheduled-job-log")
		frappe.set_user(ANA)
		targets = {g["title"]: g["target"] for g in api.get_stream()["groups"]}
		# The Pendientes page when that module is on for the reader (doco installed), else Desk.
		pendientes = resolve.Access().module("pendientes")
		self.assertEqual(
			targets["Tuyo"]["route"], f"/pendientes/todo/{self.todo.name}" if pendientes else None
		)
		self.assertEqual(targets["Tuyo"]["desk"], f"/app/todo/{self.todo.name}")
		for title in ("De Beto", "Borrado", "Sin registro"):
			with self.subTest(title=title):
				self.assertIsNone(targets[title]["route"])
				self.assertIsNone(targets[title]["desk"])
				self.assertTrue(targets[title]["reason"])
		self.assertEqual(targets["Con enlace"]["desk"], "/app/scheduled-job-log")

	def test_crm_mentions_join_the_same_stream(self):
		if not frappe.db.table_exists("CRM Notification"):
			self.skipTest("CRM Notification is not installed")
		note = frappe.get_doc(
			{
				"doctype": "CRM Notification",
				"from_user": BETO,
				"to_user": ANA,
				"type": "Mention",
				"notification_text": "<b>Beto</b> te mencionó",
				"reference_doctype": "ToDo",
				"reference_name": self.todo.name,
			}
		).insert(ignore_permissions=True)
		frappe.set_user(ANA)
		direct = self.group(api.get_stream(), "direct")
		self.assertEqual(direct[0]["source"], "crm")
		# Re-worded in the reader's language around the record's title.
		self.assertEqual(
			direct[0]["title"], f"{frappe.utils.get_fullname(BETO)} mentioned you in «Llamar a Juan»"
		)
		result = api.mark_read(keys=[direct[0]["key"]])
		self.assertEqual(result["crm"], [note.name])
		self.assertEqual(frappe.db.get_value("CRM Notification", note.name, "read"), 1)

	def protected_title(self, prop, value):
		"""A readable CRM Organization whose title field is then masked or levelled."""
		frappe.set_user("Administrator")
		point = "avisos_title_" + frappe.generate_hash(length=8)
		frappe.db.savepoint(point)

		def restore():
			frappe.set_user("Administrator")
			frappe.db.rollback(save_point=point)
			frappe.clear_cache(doctype="CRM Organization")

		self.addCleanup(restore)
		for setting, setting_value, fieldtype in (
			("autoname", "hash", "Data"),
			("title_field", "organization_name", "Data"),
		):
			make_property_setter(
				"CRM Organization", None, setting, setting_value, fieldtype, for_doctype=True
			)
		frappe.clear_cache(doctype="CRM Organization")
		name = "avisos-org-" + frappe.generate_hash(length=12)
		organization = frappe.get_doc(
			{"doctype": "CRM Organization", "organization_name": "Título privado " + name, "currency": "USD"}
		).insert(set_name=name, ignore_permissions=True)
		log(ANA, "Te mencionaron en la empresa", "Mention", "CRM Organization", organization.name)
		frappe.set_user(ANA)
		label = self.group(api.get_stream(), "direct")[0]["target"]["label"]
		self.assertEqual(label, organization.organization_name)
		frappe.set_user("Administrator")
		make_property_setter(
			"CRM Organization", "organization_name", prop, value, "Check" if prop == "mask" else "Int"
		)
		frappe.clear_cache(doctype="CRM Organization")
		frappe.set_user(ANA)
		self.assertTrue(frappe.has_permission("CRM Organization", "read", organization.name))
		return organization

	def assert_title_withheld(self, organization):
		frappe.db.value_cache.clear()
		data = api.get_stream()
		target = self.group(data, "direct")[0]["target"]
		self.assertEqual(target["label"], organization.name)
		self.assertTrue(target["route"] or target["desk"])
		self.assertNotIn(organization.organization_name, frappe.as_json(data))

	def test_masked_title_field_is_not_disclosed_as_the_record_label(self):
		self.assert_title_withheld(self.protected_title("mask", 1))

	def test_title_field_above_the_readers_level_is_not_disclosed(self):
		self.assert_title_withheld(self.protected_title("permlevel", 9))

	def test_rejected_rows_cannot_bury_older_direct_work(self):
		if not frappe.db.table_exists("CRM Notification"):
			self.skipTest("CRM Notification is not installed")
		for user in (ANA, "Administrator"):
			with self.subTest(user=user):
				frappe.set_user("Administrator")
				frappe.db.delete("CRM Notification", {"to_user": user})
				crm_notes(user, stream.UNREAD_LIMIT + 5)
				crm_notes(user, 1, type="Mention", seconds_ago=3600)
				frappe.set_user(user)
				data = api.get_stream()
				self.assertEqual([g["type"] for g in self.group(data, "direct")], ["Mention"])
				self.assertEqual(data["counts"]["direct"], 1)
				self.assertEqual(data["badge"], 1)
				self.assertEqual(api.get_badge()["count"], 1)
				frappe.set_user("Administrator")
				frappe.db.delete("CRM Notification", {"to_user": user})

	def test_rejected_history_rows_cannot_hide_older_read_work(self):
		if not frappe.db.table_exists("CRM Notification"):
			self.skipTest("CRM Notification is not installed")
		crm_notes(ANA, stream.HISTORY_LIMIT + 5, read=1)
		crm_notes(ANA, 1, read=1, type="Assignment", seconds_ago=3600)
		frappe.set_user(ANA)
		history = api.get_stream(view="history")
		self.assertEqual([g["type"] for g in self.group(history, "direct")], ["Assignment"])

	def test_gate_refuses_guests_and_website_users(self):
		frappe.set_user(WEB)
		self.assertFalse(api.check_avisos_permission())
		self.assertFalse(api.get_capabilities()["enabled"])
		with self.assertRaises(frappe.PermissionError):
			api.get_stream()
		frappe.set_user(ANA)
		self.assertTrue(api.get_capabilities()["enabled"])
