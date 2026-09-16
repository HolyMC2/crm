# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, get_datetime, nowdate

from crm.pipeline.constants import NEXT_ACTIVITY_FIELDS, OPEN_TASK_STATUSES
from crm.pipeline.services import follow_up
from crm.tests.test_next_activity import open_deal_status

RULE = "quote_followup"


class FollowUpTestCase(IntegrationTestCase):
	"""Fixtures are owned by the test: tasks are removed before the records they
	point at, or the dynamic links from CRM Task block those deletes.

	The source of an event is a ToDo here. It stands in for taller's Repair Order:
	the service is source-agnostic and crm must not depend on the repair app being
	installed to test it.
	"""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.deals: list[str] = []
		self.sources: list[str] = []
		self.users: list[str] = []

	def tearDown(self):
		frappe.set_user("Administrator")
		for deal in self.deals:
			for name in frappe.get_all(
				"CRM Task", filters={"reference_doctype": "CRM Deal", "reference_docname": deal}, pluck="name"
			):
				frappe.delete_doc("CRM Task", name, force=True, ignore_missing=True)
		for name in self.sources:
			frappe.delete_doc("ToDo", name, force=True, ignore_missing=True)
		for name in self.deals:
			frappe.delete_doc("CRM Deal", name, force=True, ignore_missing=True)
		for name in self.users:
			frappe.delete_doc("User", name, force=True, ignore_missing=True)
		super().tearDown()

	# -- fixtures ---------------------------------------------------------

	def make_deal(self) -> str:
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": open_deal_status(),
				"deal_owner": "Administrator",
				# Sites with FCRM forecasting enabled hard-require these.
				"expected_deal_value": 100,
				"expected_closure_date": add_to_date(nowdate(), days=30),
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.deals.append(deal.name)
		return deal.name

	def make_source(self) -> str:
		todo = frappe.get_doc({"doctype": "ToDo", "description": "ZZ follow-up source"})
		todo.flags.ignore_permissions = True
		todo.insert()
		self.sources.append(todo.name)
		return todo.name

	def make_user(self, enabled: bool = True, role: str = "Sales User") -> str:
		"""A staff owner: enabled, System User, holding a desk role.

		The role is what makes the user type stick. Frappe downgrades a user with
		no desk-access role to Website User (User.set_system_user), so a fixture
		that only asks for "System User" silently produces an owner this service
		must refuse -- which passes or fails with the site's default role rather
		than with the code. The assertion keeps that from going unnoticed again.
		"""
		email = f"zz-followup-{frappe.generate_hash(length=8)}@example.invalid"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "ZZ Follow Up",
				"user_type": "System User",
				"send_welcome_email": 0,
				"roles": [{"role": role}] if role else [],
			}
		)
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		self.users.append(email)
		if role:
			self.assertEqual(
				frappe.db.get_value("User", email, "user_type"),
				"System User",
				f"{role} must grant desk access for this fixture to model a staff owner",
			)
		if not enabled:
			frappe.db.set_value("User", email, "enabled", 0)
		return email

	def slot(self, source: str, rule: str = RULE) -> str:
		return f"ToDo:{source}:{rule}"

	def upsert(
		self, deal: str, source: str, *, occurrence: str, title="Confirmar cotizacion", days=2, **kwargs
	):
		return follow_up.upsert(
			reference_doctype="CRM Deal",
			reference_name=deal,
			slot=kwargs.pop("slot", self.slot(source)),
			occurrence=occurrence,
			title=title,
			due=add_to_date(get_datetime(), days=days) if days is not None else None,
			source_doctype="ToDo",
			source_name=source,
			**kwargs,
		)

	def open_of(self, slot: str) -> list[str]:
		return [
			str(name)
			for name in frappe.get_all(
				"CRM Task",
				filters={"automation_slot": slot, "status": ["in", OPEN_TASK_STATUSES]},
				pluck="name",
			)
		]

	def task(self, name: str) -> dict:
		return frappe.db.get_value(
			"CRM Task",
			name,
			[
				"title",
				"status",
				"due_date",
				"assigned_to",
				"activity_type",
				"automation_slot",
				"automation_occurrence",
				"automation_values",
				"description",
			],
			as_dict=True,
		)

	def stored(self, deal: str) -> dict:
		return frappe.db.get_value("CRM Deal", deal, NEXT_ACTIVITY_FIELDS, as_dict=True)

	def lock_holder(self, key: str) -> int:
		row = frappe.db.sql("SELECT IS_USED_LOCK(%s) = CONNECTION_ID()", (key,))
		return int(row[0][0] or 0)

	# -- slot and occurrence identity -------------------------------------

	def test_retrying_one_occurrence_keeps_a_single_task(self):
		deal, source = self.make_deal(), self.make_source()

		created = self.upsert(deal, source, occurrence="evt-1")
		retried = self.upsert(deal, source, occurrence="evt-1", title="Confirmar cotizacion revisada")

		self.assertEqual(created["action"], "created")
		self.assertEqual(retried["action"], "updated")
		self.assertEqual(retried["name"], created["name"])
		self.assertEqual(retried["superseded"], [])
		self.assertEqual(self.open_of(self.slot(source)), [created["name"]])
		self.assertEqual(self.task(created["name"]).title, "Confirmar cotizacion revisada")

	def test_identical_reconciliation_does_not_resave_the_task(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-fixed", days=None)
		before = frappe.db.get_value("CRM Task", created["name"], "modified")
		retried = self.upsert(deal, source, occurrence="evt-fixed", days=None)
		self.assertEqual(retried["action"], "reused")
		self.assertFalse(retried["human_edited"])
		self.assertEqual(frappe.db.get_value("CRM Task", created["name"], "modified"), before)

	def test_a_new_occurrence_supersedes_the_open_task(self):
		deal, source = self.make_deal(), self.make_source()

		first = self.upsert(deal, source, occurrence="evt-1")
		second = self.upsert(deal, source, occurrence="evt-2", title="Confirmar cotizacion v2")

		self.assertEqual(second["action"], "superseded")
		self.assertEqual(second["superseded"], [first["name"]])
		self.assertNotEqual(second["name"], first["name"])
		self.assertEqual(self.open_of(self.slot(source)), [second["name"]])

		cancelled = self.task(first["name"])
		self.assertEqual(cancelled.status, "Canceled")
		# Provenance survives the supersession: the audit trail is the point.
		self.assertEqual(cancelled.automation_slot, self.slot(source))
		self.assertEqual(cancelled.automation_occurrence, "evt-1")

	def test_two_sources_on_one_deal_stay_independent(self):
		deal = self.make_deal()
		first_source, second_source = self.make_source(), self.make_source()

		first = self.upsert(deal, first_source, occurrence="evt-1", title="Confirmar refaccion", days=1)
		second = self.upsert(deal, second_source, occurrence="evt-2", title="Confirmar cotizacion", days=3)

		self.assertNotEqual(first["name"], second["name"])
		self.assertEqual(self.open_of(self.slot(first_source)), [first["name"]])
		self.assertEqual(self.open_of(self.slot(second_source)), [second["name"]])

		follow_up.complete(slot=self.slot(first_source))

		self.assertEqual(self.open_of(self.slot(first_source)), [])
		self.assertEqual(self.open_of(self.slot(second_source)), [second["name"]])

	def test_a_settled_task_is_never_reopened(self):
		deal, source = self.make_deal(), self.make_source()
		first = self.upsert(deal, source, occurrence="evt-1")
		follow_up.complete(slot=self.slot(source))

		again = self.upsert(deal, source, occurrence="evt-1")

		self.assertEqual(again["action"], "created")
		self.assertNotEqual(again["name"], first["name"])
		self.assertEqual(self.task(first["name"]).status, "Done")

	# -- human edits ------------------------------------------------------

	def test_a_human_edited_task_keeps_its_values(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-1")

		doc = frappe.get_doc("CRM Task", created["name"])
		doc.title = "Hablar con el cliente el viernes"
		doc.due_date = add_to_date(get_datetime(), days=9)
		doc.save(ignore_permissions=True)

		reused = self.upsert(deal, source, occurrence="evt-1", title="Confirmar cotizacion", days=2)

		self.assertEqual(reused["action"], "reused")
		self.assertTrue(reused["human_edited"])
		self.assertEqual(reused["name"], created["name"])
		row = self.task(created["name"])
		self.assertEqual(row.title, "Hablar con el cliente el viernes")
		self.assertEqual(get_datetime(row.due_date), get_datetime(doc.due_date))

	def test_reassign_moves_an_untouched_task_and_is_refused_after_a_human_edit(self):
		deal, source = self.make_deal(), self.make_source()
		owner, other = self.make_user(), self.make_user()
		created = self.upsert(deal, source, occurrence="evt-1", owner=owner)

		moved = follow_up.reassign(slot=self.slot(source), owner=other)

		self.assertEqual(moved["reassigned"], [created["name"]])
		self.assertEqual(moved["kept"], [])
		self.assertEqual(self.task(created["name"]).assigned_to, other)

		doc = frappe.get_doc("CRM Task", created["name"])
		doc.assigned_to = owner
		doc.save(ignore_permissions=True)

		refused = follow_up.reassign(slot=self.slot(source), owner=other)

		self.assertEqual(refused["reassigned"], [])
		self.assertEqual(refused["kept"], [created["name"]])
		self.assertEqual(self.task(created["name"]).assigned_to, owner)

	# -- completion -------------------------------------------------------

	def test_complete_marks_done_and_keeps_the_note(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-1")

		closed = follow_up.complete(slot=self.slot(source), note="Cliente autorizo por telefono")

		self.assertEqual(closed["closed"], [created["name"]])
		row = self.task(created["name"])
		self.assertEqual(row.status, "Done")
		self.assertIn("Cliente autorizo por telefono", row.description)

	def test_complete_with_outcome_canceled_marks_canceled(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-1")

		closed = follow_up.complete(slot=self.slot(source), outcome="Canceled")

		self.assertEqual(closed["closed"], [created["name"]])
		self.assertEqual(self.task(created["name"]).status, "Canceled")

	def test_complete_of_one_occurrence_leaves_the_others(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-1")

		untouched = follow_up.complete(slot=self.slot(source), occurrence="evt-other")

		self.assertEqual(untouched["closed"], [])
		self.assertEqual(self.open_of(self.slot(source)), [created["name"]])

	def test_an_unknown_outcome_is_rejected(self):
		deal, source = self.make_deal(), self.make_source()
		self.upsert(deal, source, occurrence="evt-1")

		with self.assertRaises(frappe.ValidationError):
			follow_up.complete(slot=self.slot(source), outcome="Archivada")

	# -- listing ----------------------------------------------------------

	def test_open_tasks_answers_per_source(self):
		deal = self.make_deal()
		first_source, second_source = self.make_source(), self.make_source()
		first = self.upsert(deal, first_source, occurrence="evt-1", title="Confirmar refaccion")
		self.upsert(deal, second_source, occurrence="evt-2")

		listed = follow_up.open_tasks(source_doctype="ToDo", source_name=first_source)

		self.assertEqual([row["name"] for row in listed], [first["name"]])
		self.assertEqual(listed[0]["slot"], self.slot(first_source))
		self.assertEqual(listed[0]["occurrence"], "evt-1")
		self.assertEqual(listed[0]["title"], "Confirmar refaccion")
		self.assertFalse(listed[0]["human_edited"])

		doc = frappe.get_doc("CRM Task", first["name"])
		doc.title = "Confirmar refaccion con el proveedor"
		doc.save(ignore_permissions=True)

		self.assertTrue(
			follow_up.open_tasks(source_doctype="ToDo", source_name=first_source)[0]["human_edited"]
		)

	def test_open_tasks_ignores_settled_and_human_tasks(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-1")
		human = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": "Tarea escrita a mano",
				"status": "Todo",
				"reference_doctype": "CRM Deal",
				"reference_docname": deal,
			}
		)
		human.flags.ignore_permissions = True
		human.insert()

		listed = follow_up.open_tasks(source_doctype="ToDo", source_name=source)
		self.assertEqual([row["name"] for row in listed], [created["name"]])

		follow_up.complete(slot=self.slot(source))
		self.assertEqual(follow_up.open_tasks(source_doctype="ToDo", source_name=source), [])

	# -- projection -------------------------------------------------------

	def test_the_deal_next_activity_follows_the_automated_task(self):
		deal, source = self.make_deal(), self.make_source()

		created = self.upsert(
			deal, source, occurrence="evt-1", title="Avisar equipo listo", activity_type="WhatsApp"
		)

		stored = self.stored(deal)
		self.assertEqual(stored.next_activity_task, created["name"])
		self.assertEqual(stored.next_activity_title, "Avisar equipo listo")
		self.assertEqual(stored.next_activity_type, "WhatsApp")

		follow_up.complete(slot=self.slot(source))

		self.assertEqual(dict(self.stored(deal)), dict.fromkeys(NEXT_ACTIVITY_FIELDS, None))

	def test_superseding_moves_the_projection_to_the_new_task(self):
		deal, source = self.make_deal(), self.make_source()
		self.upsert(deal, source, occurrence="evt-1", days=1)

		second = self.upsert(deal, source, occurrence="evt-2", title="Confirmar cotizacion v2", days=4)

		self.assertEqual(self.stored(deal).next_activity_task, second["name"])

	# -- validation -------------------------------------------------------

	def test_an_invalid_owner_is_skipped_not_assigned(self):
		deal, source = self.make_deal(), self.make_source()

		unknown = self.upsert(deal, source, occurrence="evt-1", owner="zz-nobody@example.invalid")

		self.assertEqual(unknown["owner_skipped"], "zz-nobody@example.invalid")
		self.assertIsNone(self.task(unknown["name"]).assigned_to)

		disabled = self.make_user(enabled=False)
		second = self.upsert(deal, source, occurrence="evt-2", owner=disabled)

		self.assertEqual(second["owner_skipped"], disabled)
		self.assertIsNone(self.task(second["name"]).assigned_to)
		self.assertEqual(
			follow_up.reassign(slot=self.slot(source), owner=disabled)["owner_skipped"], disabled
		)

	def test_a_portal_user_never_receives_a_staff_follow_up(self):
		"""A Website User is a customer account: it must not hold staff work.

		The type is written directly because what Frappe derives from roles on
		insert depends on the site's own data: the same role-less user is a
		Website User on a fresh site and a System User on the retail mirror. The
		service reads the stored type, so the stored type is what this pins.
		"""
		deal, source = self.make_deal(), self.make_source()
		portal = self.make_user(role="")
		frappe.db.set_value("User", portal, "user_type", "Website User")

		created = self.upsert(deal, source, occurrence="evt-1", owner=portal)

		self.assertEqual(created["owner_skipped"], portal)
		self.assertIsNone(self.task(created["name"]).assigned_to)

	def test_a_skipped_owner_does_not_drop_the_current_assignee(self):
		deal, source = self.make_deal(), self.make_source()
		owner = self.make_user()
		created = self.upsert(deal, source, occurrence="evt-1", owner=owner)

		self.upsert(deal, source, occurrence="evt-1", owner="zz-nobody@example.invalid")

		self.assertEqual(self.task(created["name"]).assigned_to, owner)

	def test_a_reference_outside_lead_and_deal_is_rejected(self):
		source = self.make_source()
		with self.assertRaises(frappe.ValidationError):
			follow_up.upsert(
				reference_doctype="Contact",
				reference_name="whoever",
				slot=self.slot(source),
				occurrence="evt-1",
				title="Confirmar cotizacion",
			)

	def test_an_unknown_activity_type_is_rejected(self):
		deal, source = self.make_deal(), self.make_source()
		with self.assertRaises(frappe.ValidationError):
			self.upsert(deal, source, occurrence="evt-1", activity_type="Telepatia")

	def test_a_caller_without_write_access_is_refused_unless_it_is_trusted(self):
		deal, source = self.make_deal(), self.make_source()
		outsider = self.make_user()

		frappe.set_user(outsider)
		try:
			with self.assertRaises(frappe.PermissionError):
				self.upsert(deal, source, occurrence="evt-1")
			trusted = self.upsert(deal, source, occurrence="evt-1", ignore_permissions=True)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(trusted["action"], "created")

	def test_the_written_values_are_recorded_for_edit_detection(self):
		deal, source = self.make_deal(), self.make_source()
		created = self.upsert(deal, source, occurrence="evt-1", title="Confirmar cotizacion")

		written = json.loads(self.task(created["name"]).automation_values)

		self.assertEqual(written["title"], "Confirmar cotizacion")
		self.assertEqual(written["activity_type"], "Task")
		self.assertIsNone(written["assigned_to"])

	# -- concurrency ------------------------------------------------------

	def test_the_slot_lock_is_held_for_the_whole_call(self):
		"""GET_LOCK is per connection, so one process cannot run two real callers.
		What is provable here is that the slot is held while the work happens and
		released after it, which is what makes the second caller wait.
		"""
		deal, source = self.make_deal(), self.make_source()
		slot = self.slot(source)
		key = follow_up._lock_key(slot)

		self.assertEqual(self.lock_holder(key), 0)
		with follow_up.slot_lock(slot):
			self.assertEqual(self.lock_holder(key), 1)
		self.assertEqual(self.lock_holder(key), 0)

		self.upsert(deal, source, occurrence="evt-1")
		self.assertEqual(self.lock_holder(key), 0)

	def test_a_slot_held_elsewhere_refuses_instead_of_duplicating(self):
		deal, source = self.make_deal(), self.make_source()
		real_sql = frappe.db.sql

		def busy(query, *args, **kwargs):
			if isinstance(query, str) and query.startswith("SELECT GET_LOCK"):
				return ((0,),)
			return real_sql(query, *args, **kwargs)

		with patch.object(frappe.db, "sql", side_effect=busy):
			with self.assertRaises(frappe.TimestampMismatchError):
				self.upsert(deal, source, occurrence="evt-1")

		self.assertEqual(self.open_of(self.slot(source)), [])
