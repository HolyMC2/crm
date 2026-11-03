"""Customer inbox work around the conversation broker: labels, notes, snooze, office
hours, assignment, ratings, macros, queue views, performance and help articles.

Dedicated lab only: fictional users and a fictional Webchat channel inside a savepoint
that is always rolled back; transports, mail, workers and commits are blocked.
"""

import json
import re
import secrets
import unittest
from contextlib import contextmanager
from datetime import datetime, time, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import frappe
from frappe.utils import get_datetime, now_datetime

from crm import inbox
from crm.api import conversations as control
from crm.api import inbox as inbox_api
from crm.api import outbox, webchat
from crm.inbox import (
	assignment,
	csat,
	customer_message,
	help,
	labels,
	macros,
	notes,
	notices,
	office_hours,
	queue,
	report,
	snooze,
)

DOCTYPES = (
	inbox.SETTINGS,
	labels.LABEL,
	notes.NOTE,
	csat.RATING,
	macros.MACRO,
	control.DOCTYPE,
	outbox.DOCTYPE,
	webchat.CHANNEL,
)
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class _Inbox(unittest.TestCase):
	def setUp(self):
		missing = [dt for dt in DOCTYPES if not frappe.db.exists("DocType", dt)]
		if missing or not frappe.db.has_column(control.DOCTYPE, "snoozed_until"):
			raise unittest.SkipTest("Migrate the isolated lab first: " + ", ".join(missing or ["fields"]))
		frappe.db.rollback()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "inbox_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.addCleanup(self._restore)
		self.enterContext(patch.object(frappe.local, "conf", frappe._dict(frappe.conf)))
		frappe.conf.maintenance_mode = 0
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No external requests"))
		)
		self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("No mail")))
		self.enqueue = self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(patch.object(frappe.db, "commit"))
		self.prefix = "inbox-" + uuid4().hex[:10]
		self.account = secrets.token_hex(32)
		profile, origin = "inbox-" + self.account[:10], "https://inbox.example.invalid"
		webchat._mark(
			frappe.get_doc(
				{
					"doctype": webchat.CHANNEL,
					"name": self.account,
					"account_id": self.account,
					"label": "Fictional Webchat",
					"profile": profile,
					"public_origin": origin,
					"binding_key": webchat._key(profile, origin),
					"enabled": 1,
				}
			)
		).insert(ignore_permissions=True, set_name=self.account)
		self.one = self.user("one", "Sales User")
		self.two = self.user("two", "Sales User")
		self.outsider = self.user("outsider", "Sales User", channel=False)
		self.peer, self.session = self.visitor()
		self.conversation = control.get_or_create("Webchat", self.account, self.peer).name

	def _restore(self):
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point=self.point)
		frappe.clear_document_cache(inbox.SETTINGS, inbox.SETTINGS)
		frappe.set_user(self.previous_user)

	def user(self, label, *roles, channel=True):
		name = f"{self.prefix}-{label}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": name,
				"first_name": "Fictional " + label,
				"enabled": 1,
				"send_welcome_email": 0,
				"roles": [{"role": role} for role in roles],
			}
		).insert(ignore_permissions=True)
		if channel:
			frappe.get_doc(
				{
					"doctype": "User Permission",
					"user": name,
					"allow": webchat.CHANNEL,
					"for_value": self.account,
				}
			).insert(ignore_permissions=True)
		return name

	def visitor(self):
		peer, name, created = secrets.token_hex(32), secrets.token_hex(32), now_datetime()
		session = webchat._mark(
			frappe.get_doc(
				{
					"doctype": webchat.SESSION,
					"name": name,
					"channel": self.account,
					"peer_id": peer,
					"capability_hash": secrets.token_hex(32),
					"creation": created,
					"expires_at": created + timedelta(hours=24),
					"revoked": 0,
				}
			)
		).insert(ignore_permissions=True, set_name=name)
		return peer, session

	@contextmanager
	def as_user(self, user):
		frappe.set_user(user)
		try:
			yield
		finally:
			frappe.set_user("Administrator")

	def doc(self, name=None):
		return control._load(name or self.conversation)

	def take(self, user, name=None):
		name = name or self.conversation
		with self.as_user(user):
			return control.apply_control(name, "take", self.doc(name).generation, secrets.token_hex(16))

	def configure(self, **values):
		settings = frappe.get_single(inbox.SETTINGS)
		settings.update(values)
		settings.save(ignore_permissions=True)
		frappe.clear_document_cache(inbox.SETTINGS, inbox.SETTINGS)
		return inbox.settings()

	def label(self, name, color="blue"):
		return frappe.get_doc({"doctype": labels.LABEL, "label_name": name, "color": color}).insert().name

	def notices(self):
		return frappe.get_all(
			outbox.DOCTYPE,
			filters={"conversation": self.conversation, "origin": "Automation"},
			fields=["name", "payload", "actor_user", "state", "purpose"],
			order_by="creation asc",
		)

	def incoming(self, text="Fictional customer question"):
		return webchat._insert(
			self.session, self.conversation, "Incoming", secrets.token_hex(16), text, self.doc().generation
		)


class TestLabelsAndNotes(_Inbox):
	def test_labels_are_metadata_and_filter_the_queue(self):
		vip, late = self.label("VIP"), self.label("Pago pendiente", "amber")
		self.take(self.one)
		generation = self.doc().generation
		with self.as_user(self.one):
			labels.set_labels(self.conversation, [late, vip, vip], secrets.token_hex(16))
			with self.assertRaises(frappe.ValidationError):
				labels.set_labels(self.conversation, ["Nunca creada"], secrets.token_hex(16))
			mine = queue.list_queue("mine", label=vip)
		doc = self.doc()
		self.assertEqual(labels.parse(doc.labels), ["Pago pendiente", "VIP"])
		self.assertEqual(doc.generation, generation, "labels never cancel the owner's queued replies")
		self.assertEqual([i["name"] for i in mine["items"]], [self.conversation])
		self.assertEqual(mine["items"][0]["labels"], ["Pago pendiente", "VIP"])
		with self.as_user(self.one):
			labels.change_labels(self.conversation, secrets.token_hex(16), remove=[vip])
			self.assertEqual(queue.list_queue("mine", label=vip)["items"], [])
		frappe.delete_doc(labels.LABEL, late)
		self.assertEqual(labels.parse(self.doc().labels), [])

	def test_a_person_without_the_channel_cannot_label(self):
		self.label("VIP")
		with self.as_user(self.outsider), self.assertRaises(frappe.PermissionError):
			labels.set_labels(self.conversation, ["VIP"], secrets.token_hex(16))

	def test_private_note_mentions_only_people_who_can_open_the_conversation(self):
		self.take(self.one)
		with patch("crm.integrations.webhooks.emit") as emit, self.as_user(self.one):
			command = secrets.token_hex(16)
			notes.add_note(self.conversation, "Cliente pide factura", command, mentions=[self.two])
			notes.add_note(self.conversation, "Cliente pide factura", command, mentions=[self.two])
			with self.assertRaises(frappe.ValidationError):
				notes.add_note(self.conversation, "Otra", secrets.token_hex(16), mentions=[self.outsider])
			listed = notes.list_notes(self.conversation)
			people = {p["name"] for p in notes.mentionable(self.conversation, "")}
		self.assertEqual(
			[n["content"] for n in listed], ["Cliente pide factura"], "a retried command adds once"
		)
		self.assertEqual(listed[0]["mentions"], [self.two])
		self.assertIn(self.two, people)
		self.assertNotIn(self.outsider, people)
		alert = frappe.get_all(
			"CRM Notification",
			filters={"to_user": self.two, "reference_name": self.conversation},
			fields=["type", "reference_doctype", "notification_type_doc"],
		)
		self.assertEqual(alert[0].type, "Mention")
		self.assertEqual(alert[0].reference_doctype, "CRM Conversation")
		self.assertEqual(alert[0].notification_type_doc, listed[0]["name"])
		emit.assert_called_once_with(
			"conversation.note_created", notes.NOTE, listed[0]["name"], version="created"
		)

	def test_notes_and_ratings_refuse_direct_writes(self):
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				{"doctype": notes.NOTE, "conversation": self.conversation, "content": "forged"}
			).insert(ignore_permissions=True)
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc({"doctype": csat.RATING, "conversation": self.conversation}).insert(
				ignore_permissions=True
			)

	def test_note_webhook_payload_names_the_note_and_its_conversation(self):
		from crm.integrations import events

		self.take(self.one)
		with self.as_user(self.one):
			notes.add_note(self.conversation, "Revisar garantía", secrets.token_hex(16))
		note = frappe.get_all(notes.NOTE, filters={"conversation": self.conversation}, pluck="name")[0]
		data = events.build_conversation("conversation.note_created", notes.NOTE, note, {})
		self.assertEqual(data["conversation"]["name"], self.conversation)
		self.assertEqual(data["note"]["content"], "Revisar garantía")

	def test_conversation_notes_join_the_lead_timeline_and_lead_notes_join_the_inbox(self):
		from crm.api import activities

		lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Fictional",
				"lead_owner": self.one,
				"email": self.prefix + "-lead@example.invalid",
			}
		).insert(ignore_permissions=True)
		# The outsider reads the lead (assigned) but cannot open the conversation.
		frappe.get_doc(
			{
				"doctype": "ToDo",
				"allocated_to": self.outsider,
				"reference_type": "CRM Lead",
				"reference_name": lead.name,
				"status": "Open",
				"description": "Fictional follow-up",
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value(
			control.DOCTYPE,
			self.conversation,
			{"reference_doctype": "CRM Lead", "reference_name": lead.name},
			update_modified=False,
		)
		self.take(self.one)
		with patch("crm.integrations.webhooks.emit"), self.as_user(self.one):
			notes.add_note(self.conversation, "Pide factura\nA nombre de la empresa", secrets.token_hex(16))
			timeline = activities.conversation_notes("CRM Lead", lead.name)
			notes.add_record_note(self.conversation, "CRM Lead", lead.name, "Llamar el lunes")
			panel = notes.record_notes(self.conversation)
			with self.assertRaises(frappe.PermissionError):
				notes.add_record_note(self.conversation, "CRM Deal", "not-linked", "Otra")
		self.assertEqual([n["source"] for n in timeline], ["conversation"])
		self.assertEqual(timeline[0]["conversation"], self.conversation)
		self.assertIn("Pide factura<br>A nombre de la empresa", timeline[0]["content"])
		self.assertEqual([r["name"] for r in panel["records"]], [lead.name])
		self.assertEqual([n["content"] for n in panel["notes"]], ["Llamar el lunes"])
		self.assertEqual(panel["notes"][0]["author"], self.one)
		self.assertTrue(
			frappe.db.exists(
				"FCRM Note", {"reference_doctype": "CRM Lead", "reference_docname": lead.name}
			)
		)
		with self.as_user(self.outsider):
			self.assertTrue(frappe.has_permission("CRM Lead", "read", lead.name))
			self.assertEqual(activities.conversation_notes("CRM Lead", lead.name), [])

	def test_a_person_linked_record_finds_its_conversation_notes(self):
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Linked_100%", "email": self.prefix + "-l2@example.invalid"}
		).insert(ignore_permissions=True)
		links = [{"doctype": "CRM Lead", "name": lead.name, "source": "person"}]
		frappe.db.set_value(
			control.DOCTYPE,
			self.conversation,
			"context_links",
			json.dumps(links, sort_keys=True, separators=(",", ":")),
			update_modified=False,
		)
		self.assertEqual(
			[d.name for d in notes.record_conversations("CRM Lead", lead.name)], [self.conversation]
		)
		self.assertEqual(notes.record_conversations("CRM Lead", lead.name[:-1] + "%"), [])

	def test_a_conversation_aviso_opens_the_inbox(self):
		from crm.avisos.resolve import record_target

		target = record_target({"doctype": "CRM Conversation", "docname": self.conversation}, None)
		self.assertIn("/inbox?conversation=", target["route"])


class TestSnoozeAndQueue(_Inbox):
	def test_snooze_hides_until_its_time_then_tells_the_person(self):
		self.take(self.one)
		generation = self.doc().generation
		with self.as_user(self.one):
			snooze.snooze(self.conversation, now_datetime() + timedelta(hours=2), secrets.token_hex(16))
			self.assertEqual(queue.list_queue("mine")["items"], [])
			self.assertEqual([i["name"] for i in queue.list_queue("snoozed")["items"]], [self.conversation])
		self.assertEqual(self.doc().generation, generation)
		frappe.db.set_value(
			control.DOCTYPE, self.conversation, "snoozed_until", now_datetime() - timedelta(minutes=1)
		)
		snooze.wake_due()
		doc = self.doc()
		self.assertIsNone(doc.snoozed_until)
		self.assertTrue(
			frappe.db.exists(
				"CRM Notification",
				{"to_user": self.one, "reference_name": self.conversation, "type": "Assignment"},
			)
		)
		self.assertTrue(
			frappe.db.exists(control.EVENT, {"conversation": self.conversation, "action": "wake"})
		)

	def test_snooze_rejects_past_and_closed(self):
		self.take(self.one)
		with self.as_user(self.one):
			with self.assertRaises(frappe.ValidationError):
				snooze.snooze(self.conversation, now_datetime() - timedelta(hours=1), secrets.token_hex(16))
			control.apply_control(self.conversation, "close", self.doc().generation, secrets.token_hex(16))
			with self.assertRaises(frappe.ValidationError):
				snooze.snooze(self.conversation, now_datetime() + timedelta(hours=1), secrets.token_hex(16))

	def test_snooze_presets_come_back_when_the_team_opens(self):
		tomorrow = (now_datetime() + timedelta(days=1)).date()
		day = tomorrow.strftime("%A")
		self.configure(
			working_hours=[
				{"workday": day, "start_time": "10:30:00", "end_time": "18:00:00"},
				{"workday": day, "start_time": "08:15:00", "end_time": "12:00:00"},
			]
		)
		self.assertEqual(snooze.preset_until("tomorrow"), datetime.combine(tomorrow, time(8, 15)))
		monday = now_datetime().date() + timedelta(days=7 - now_datetime().weekday())
		opening = time(8, 15) if monday == tomorrow else snooze.DEFAULT_OPENING
		self.assertEqual(snooze.preset_until("next_week"), datetime.combine(monday, opening))
		with self.assertRaises(frappe.ValidationError):
			snooze.preset_until("someday")
		self.take(self.one)
		before = now_datetime().replace(microsecond=0)
		with self.as_user(self.one):
			inbox_api.snooze_conversation(self.conversation, secrets.token_hex(16), preset="3h")
		until = get_datetime(self.doc().snoozed_until)
		self.assertTrue(before + timedelta(hours=3) <= until <= now_datetime() + timedelta(hours=3))

	def test_queue_views_split_mine_unassigned_and_all(self):
		other = control.get_or_create("Webchat", self.account, self.visitor()[0]).name
		self.take(self.one, other)
		with self.as_user(self.one):
			self.assertEqual([i["name"] for i in queue.list_queue("mine")["items"]], [other])
			unassigned = [i["name"] for i in queue.list_queue("unassigned", limit=50)["items"]]
			everything = {i["name"] for i in queue.list_queue("all", limit=50)["items"]}
		self.assertIn(self.conversation, unassigned)
		self.assertNotIn(other, unassigned)
		self.assertTrue({self.conversation, other} <= everything)
		with self.as_user(self.outsider):
			hidden = {i["name"] for i in queue.list_queue("all", limit=50)["items"]}
		self.assertFalse({self.conversation, other} & hidden)


class TestCustomerMessage(_Inbox):
	def closed_today(self):
		today = now_datetime().strftime("%A")
		other = WEEKDAYS[(WEEKDAYS.index(today) + 1) % 7]
		return [{"workday": other, "start_time": "09:00:00", "end_time": "18:00:00"}]

	def test_a_customer_message_queues_the_follow_up_job_after_commit(self):
		self.enqueue.reset_mock()
		with patch.object(frappe.db, "after_commit", MagicMock()) as later:
			message = self.incoming()
		follow_up = [
			c.args[0]
			for c in later.add.call_args_list
			if getattr(c.args[0], "func", None) is customer_message.queue_follow_up
		]
		self.assertEqual(len(follow_up), 1)
		self.assertFalse(
			[c for c in self.enqueue.call_args_list if c.args[:1] == ("crm.inbox.customer_message.handle",)],
			"nothing touches the queue before the message commits",
		)
		follow_up[0]()
		calls = [
			c for c in self.enqueue.call_args_list if c.args[:1] == ("crm.inbox.customer_message.handle",)
		]
		self.assertEqual(len(calls), 1)
		self.assertEqual(calls[0].kwargs["name"], message.name)

	def test_outside_office_hours_the_customer_gets_one_away_message(self):
		self.configure(
			office_hours_enabled=1,
			working_hours=self.closed_today(),
			away_message="Hola {{nombre}}, abrimos mañana a las 9.",
			away_repeat_hours=12,
		)
		self.assertFalse(office_hours.is_open(inbox.settings(), now_datetime()))
		customer_message.handle(webchat.MESSAGE, self.incoming().name)
		customer_message.handle(webchat.MESSAGE, self.incoming("¿Siguen ahí?").name)
		sent = self.notices()
		self.assertEqual(len(sent), 1, "the away message repeats only after away_repeat_hours")
		payload = json.loads(sent[0].payload)
		self.assertTrue(payload["text"].endswith("abrimos mañana a las 9."))
		self.assertNotIn("{{", payload["text"])
		self.assertEqual((sent[0].purpose, sent[0].state), ("automation", "Queued"))
		self.assertIsNotNone(self.doc().away_notice_at)
		self.assertIsNotNone(self.doc().last_customer_message_at)

	def test_inside_office_hours_nothing_is_sent(self):
		today = now_datetime().strftime("%A")
		self.configure(
			office_hours_enabled=1,
			working_hours=[{"workday": today, "start_time": "00:00:00", "end_time": "23:59:59"}],
			away_message="Fuera de horario",
		)
		customer_message.handle(webchat.MESSAGE, self.incoming().name)
		self.assertEqual(self.notices(), [])

	def test_a_customer_message_wakes_a_snoozed_conversation(self):
		self.take(self.one)
		with self.as_user(self.one):
			snooze.snooze(self.conversation, now_datetime() + timedelta(days=2), secrets.token_hex(16))
		customer_message.handle(webchat.MESSAGE, self.incoming().name)
		self.assertIsNone(self.doc().snoozed_until)

	def test_auto_assignment_balances_open_conversations(self):
		self.configure(
			auto_assign_enabled=1,
			assignment_agents=[
				{"user": self.one, "active": 1},
				{"user": self.two, "active": 1},
				{"user": self.outsider, "active": 1},
			],
		)
		other = control.get_or_create("Webchat", self.account, self.visitor()[0]).name
		before = self.doc().generation
		first = assignment.assign(self.conversation, inbox.settings(), "m1")
		second = assignment.assign(other, inbox.settings(), "m2")
		self.assertEqual({first, second}, {self.one, self.two}, "the outsider cannot work this channel")
		self.assertEqual(self.doc().human_owner, first)
		self.assertEqual(self.doc().generation, before + 1)
		self.assertIsNone(assignment.assign(self.conversation, inbox.settings(), "m3"), "already owned")
		event = frappe.get_all(
			control.EVENT,
			filters={"conversation": self.conversation, "action": "auto_assign"},
			fields=["origin", "actor_user"],
		)
		self.assertEqual((event[0].origin, event[0].actor_user), ("System", first))

	def test_auto_assignment_respects_the_open_limit(self):
		self.configure(
			auto_assign_enabled=1, auto_assign_max_open=1, assignment_agents=[{"user": self.one, "active": 1}]
		)
		other = control.get_or_create("Webchat", self.account, self.visitor()[0]).name
		self.take(self.one, other)
		self.assertIsNone(assignment.assign(self.conversation, inbox.settings(), "m1"))


class TestRatings(_Inbox):
	def close(self, user):
		with self.as_user(user):
			control.apply_control(self.conversation, "close", self.doc().generation, secrets.token_hex(16))
		return frappe.get_all(
			control.EVENT,
			filters={"conversation": self.conversation, "action": "close"},
			order_by="creation desc",
			pluck="name",
			limit=1,
		)[0]

	def test_closing_sends_one_rating_link_and_the_first_answer_counts(self):
		self.configure(
			csat_enabled=1, csat_message="¿Qué tal te atendimos, {{nombre}}? {link}", csat_valid_days=7
		)
		self.take(self.one)
		self.enqueue.reset_mock()
		event = self.close(self.one)
		queued = [c for c in self.enqueue.call_args_list if c.args[:1] == ("crm.inbox.csat.send_request",)]
		self.assertEqual(queued[0].kwargs["event"], event)
		rating = csat.send_request(event)
		self.assertEqual(csat.send_request(event), "already_sent")
		row = frappe.db.get_value(csat.RATING, rating, ["status", "human_owner", "token_hash"], as_dict=True)
		self.assertEqual((row.status, row.human_owner), ("Sent", self.one))
		text = json.loads(self.notices()[0].payload)["text"]
		token = re.search(r"/rate/([A-Za-z0-9_-]+)", text).group(1)
		self.assertNotIn(token, row.token_hash, "only the hash is stored")
		with patch("crm.integrations.webhooks.emit") as emit:
			self.assertEqual(csat.submit(token, 5, "Muy amables")["status"], "Rated")
			self.assertEqual(csat.submit(token, 1, "otra vez")["status"], "Rated")
		saved = frappe.db.get_value(csat.RATING, rating, ["rating", "comment"], as_dict=True)
		self.assertEqual((saved.rating, saved.comment), (5, "Muy amables"))
		emit.assert_called_once_with("conversation.rated", csat.RATING, rating, version="rated")
		with self.assertRaises(frappe.DoesNotExistError):
			csat.submit("x" * 32, 4)
		with self.assertRaises(frappe.ValidationError):
			csat.submit(token, 9)

	def test_an_expired_link_no_longer_takes_a_rating(self):
		self.configure(csat_enabled=1, csat_message="Califícanos: {link}")
		self.take(self.one)
		rating = csat.send_request(self.close(self.one))
		token = re.search(r"/rate/([A-Za-z0-9_-]+)", json.loads(self.notices()[0].payload)["text"]).group(1)
		frappe.db.set_value(csat.RATING, rating, "expires_at", now_datetime() - timedelta(minutes=1))
		self.assertEqual(csat.resolve(token).status, "Expired")
		self.assertEqual(csat.submit(token, 5)["status"], "Expired")

	def test_a_quick_reclose_does_not_ask_twice(self):
		self.configure(csat_enabled=1, csat_message="Califícanos: {link}")
		self.take(self.one)
		self.assertTrue(frappe.db.exists(csat.RATING, csat.send_request(self.close(self.one))))
		with self.as_user(self.one):
			control.apply_control(self.conversation, "reopen", self.doc().generation, secrets.token_hex(16))
		self.take(self.one)
		self.assertEqual(csat.send_request(self.close(self.one)), "asked_recently")

	def test_the_rating_notice_stays_sendable_after_close(self):
		self.configure(csat_enabled=1, csat_message="Califícanos: {link}")
		self.take(self.one)
		csat.send_request(self.close(self.one))
		name = self.notices()[0].name
		self.assertIsNone(outbox._base_eligibility(outbox._load(name)), "a closed conversation still gets it")

	def test_settings_require_the_link_placeholder(self):
		with self.assertRaises(frappe.ValidationError):
			self.configure(csat_enabled=1, csat_message="Gracias por escribir")


class TestMacros(_Inbox):
	def macro(self, steps, shared=1, title=None):
		return (
			frappe.get_doc(
				{
					"doctype": macros.MACRO,
					"title": title or "Cerrar con gracias",
					"shared": shared,
					"actions": [{"action": a, "value": v} for a, v in steps],
				}
			)
			.insert()
			.name
		)

	def test_a_macro_runs_every_step_once_as_the_person(self):
		self.label("Resuelto")
		name = self.macro(
			[
				(macros.ADD_LABEL, "Resuelto"),
				(macros.NOTE, "Cerrado con macro"),
				(macros.REPLY, "Gracias por escribirnos, {{nombre}}."),
				(macros.CLOSE, ""),
			]
		)
		self.take(self.one)
		command, generation = secrets.token_hex(16), self.doc().generation
		with self.as_user(self.one):
			self.assertIn(name, [m["name"] for m in macros.list_macros()])
			macros.run_macro(self.conversation, name, generation, command)
			again = macros.run_macro(self.conversation, name, generation, command)
		doc = self.doc()
		self.assertEqual(doc.control_state, "Closed")
		self.assertEqual(labels.parse(doc.labels), ["Resuelto"])
		self.assertEqual(frappe.db.count(notes.NOTE, {"conversation": self.conversation}), 1)
		sent = self.notices()
		self.assertEqual(len(sent), 1)
		self.assertEqual(sent[0].actor_user, self.one)
		self.assertTrue(again["conversation"]["replayed"])
		self.assertEqual(again["steps"], [])

	def test_a_failed_step_explains_which_one(self):
		name = self.macro([(macros.SNOOZE, "4")], title="Posponer")
		self.take(self.one)
		with self.as_user(self.one):
			control.apply_control(self.conversation, "close", self.doc().generation, secrets.token_hex(16))
			with self.assertRaisesRegex(frappe.ValidationError, "Step 1"):
				macros.run_macro(self.conversation, name, self.doc().generation, secrets.token_hex(16))

	def test_someone_elses_conversation_needs_a_manager(self):
		name = self.macro([(macros.NOTE, "hola")])
		self.take(self.two)
		with self.as_user(self.one), self.assertRaises(frappe.PermissionError):
			macros.run_macro(self.conversation, name, self.doc().generation, secrets.token_hex(16))

	def test_macro_validation(self):
		self.label("VIP")
		with self.assertRaises(frappe.ValidationError):
			self.macro([(macros.CLOSE, ""), (macros.NOTE, "after close")])
		with self.assertRaises(frappe.ValidationError):
			self.macro([(macros.ADD_LABEL, "Desconocida")])
		with self.assertRaises(frappe.ValidationError):
			self.macro([(macros.SNOOZE, "0")])
		with self.as_user(self.one), self.assertRaises(frappe.ValidationError):
			self.macro([(macros.ADD_LABEL, "VIP")], shared=1)
		with self.as_user(self.one):
			private = self.macro([(macros.ADD_LABEL, "VIP")], shared=0, title="Mía")
		with self.as_user(self.two):
			self.assertNotIn(private, [m["name"] for m in macros.list_macros()])


class TestPerformanceAndHelp(_Inbox):
	def test_performance_counts_first_response_resolution_and_rating(self):
		self.configure(csat_enabled=1, csat_message="Califícanos: {link}", first_response_minutes=15)
		self.take(self.one)
		with self.as_user(self.one):
			reply = outbox.queue_message(
				self.conversation,
				self.doc().generation,
				secrets.token_hex(16),
				{"type": "text", "text": "Hola"},
			)
		frappe.db.set_value(outbox.DOCTYPE, reply["name"], "state", "Accepted")
		with self.as_user(self.one):
			control.apply_control(self.conversation, "close", self.doc().generation, secrets.token_hex(16))
		event = frappe.get_all(
			control.EVENT, filters={"conversation": self.conversation, "action": "close"}, pluck="name"
		)[0]
		csat.send_request(event)
		token = re.search(r"/rate/([A-Za-z0-9_-]+)", json.loads(self.notices()[0].payload)["text"]).group(1)
		csat.submit(token, 4)
		result = report.performance()
		row = next(r for r in result["rows"] if r["person"] == self.one)
		self.assertEqual((row["first_responses"], row["closed"], row["ratings"]), (1, 1, 1))
		self.assertEqual(row["avg_rating"], 4)
		self.assertEqual(row["first_response_met_pct"], 100)
		with self.as_user(self.one), self.assertRaises(frappe.PermissionError):
			report.performance()

	def test_episodes_pair_each_close_with_its_start(self):
		t = now_datetime()
		episodes = report._episodes(
			[t, t + timedelta(hours=2)], [(t + timedelta(hours=1), "a"), (t + timedelta(hours=3), "b")]
		)
		self.assertEqual([e[2] for e in episodes], ["a", "b"])
		self.assertEqual(report._episodes([t], []), [(t, None, None)])

	def test_help_search_finds_published_articles_only(self):
		if not frappe.db.exists("DocType", help.ARTICLE):
			raise unittest.SkipTest("Help Article is not installed.")
		category = frappe.get_doc(
			{"doctype": "Help Category", "category_name": self.prefix, "published": 1}
		).insert(ignore_permissions=True)
		for title, published in (("Garantía de pantallas", 1), ("Garantía interna", 0)):
			frappe.get_doc(
				{
					"doctype": help.ARTICLE,
					"title": f"{title} {self.prefix}",
					"category": category.name,
					"published": published,
					"content": "<p>Cubre <b>defectos</b> de fábrica por 90 días.</p>",
				}
			).insert(ignore_permissions=True)
		found = help.search_help(f"garantía defectos {self.prefix}")
		self.assertEqual([f["title"] for f in found], [f"Garantía de pantallas {self.prefix}"])
		self.assertTrue(found[0]["url"])
		self.assertNotIn("<b>", found[0]["snippet"])


class TestNoticeChannels(unittest.TestCase):
	def test_hooked_channels_accept_automation_notices(self):
		from types import SimpleNamespace

		adapter = SimpleNamespace(reply_reason=lambda intent: None)
		intent = SimpleNamespace(origin="Automation", purpose="automation", provider="API")
		with patch.object(outbox, "channel_adapter", return_value=adapter):
			self.assertIsNone(outbox._channel_reply_reason(intent))
			intent.purpose = "marketing"
			self.assertEqual(outbox._channel_reply_reason(intent), "producer_not_ready")

	def test_render_fills_the_name_placeholders(self):
		doc = frappe._dict(provider="Webchat", peer_id="ab" * 32)
		self.assertEqual(notices.render("Hola {{ nombre }}!", doc, display_name="Ana"), "Hola Ana!")
		self.assertEqual(notices.render("Hola {{contact.name}}", doc, display_name="Ana"), "Hola Ana")
