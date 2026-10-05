"""Transcript producers to governed customers go through the native outbox.

Fictional accounts, users and rows; no request leaves the process and nothing
is committed (inherits the outbox suite's guards).
"""

import json
from contextlib import contextmanager, nullcontext
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import frappe

from crm.api import outbox as api
from crm.api import outbox_bridge as bridge
from crm.tests import test_outbox

GUARD_CALLS = []


def _needs_window(case):
	"""The 52/521 alias and window predicate ship with frappe_whatsapp.window."""
	try:
		import frappe_whatsapp.window
	except ImportError:
		case.skipTest("frappe_whatsapp without window.py (older companion pin)")


def refuse_transcript(intent):
	"""A producer whose business authority was revoked after queueing."""
	GUARD_CALLS.append(intent.transcript_message)
	return "revoked"


class TestOutboxBridge(test_outbox.TestOutbox):
	@contextmanager
	def person(
		self, user=None, cmd="crm.api.whatsapp.create_whatsapp_message", path=None, form=None, reply=True
	):
		"""A logged-in request; `reply` is what the composer endpoints declare."""
		user = user or self.users["one"]
		frappe.set_user(user)
		request = SimpleNamespace(path=path or "/api/method/" + cmd)
		with (
			patch.object(frappe.local, "request", request, create=True),
			patch.dict(frappe.local.form_dict, {"cmd": cmd, **(form or {})}),
			bridge.person_reply() if reply else nullcontext(),
		):
			yield

	def row(self, text="Fictional reply", **fields):
		doc = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Outgoing",
				"to": self.peer,
				"whatsapp_account": self.account.name,
				"message": text,
				"content_type": "text",
				"doco_sent_by_type": "Human",
				**fields,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc

	def intent_for(self, row):
		return frappe.db.get_value(api.DOCTYPE, {"transcript_message": row.name}, "name")

	def status(self, row):
		return frappe.db.get_value(
			"WhatsApp Message", row.name, ["status", "message_id", "failure_reason"], as_dict=True
		)

	def test_outbox_bridge_reply_to_unowned_takes_control_then_delivers_on_its_row(self):
		self.command("release", 2)
		with self.person():
			row = self.row()
		self.assertEqual(self.status(row).status, "Queued")
		name = self.intent_for(row)
		doc = api._load(name)
		self.assertEqual(
			(doc.origin, doc.purpose, doc.actor_user, doc.state),
			("Human", "manual", self.users["one"], "Queued"),
		)
		owner = frappe.db.get_value(
			"CRM Conversation", self.doc.name, ["human_owner", "generation"], as_dict=True
		)
		self.assertEqual(
			(owner.human_owner, owner.generation), (self.users["one"], doc.conversation_generation)
		)
		self.assertTrue(
			frappe.db.exists(
				"CRM Conversation Control Event",
				{"conversation": self.doc.name, "action": "take", "reason": "first_reply"},
			)
		)
		frappe.set_user("Administrator")
		doc, send = self.dispatch(name, {"state": "Accepted", "provider_message_id": "wamid.bridged"})
		self.assertEqual(doc.state, "Accepted")
		self.assertEqual(send.call_args.args[0].name, name)
		self.assertEqual((self.status(row).status, self.status(row).message_id), ("Success", "wamid.bridged"))

	def test_outbox_bridge_refuses_what_ownership_forbids_without_writing(self):
		before = frappe.db.count("WhatsApp Message", {"to": self.peer})
		with self.person(self.users["two"]):
			with self.assertRaises(bridge.NativeSendRefused) as refused:
				self.row()
		self.assertEqual(refused.exception.reason_code, "conversation_owned")
		# A generic document client cannot forge automation provenance past ownership.
		forged = {"doc": json.dumps({"doctype": "WhatsApp Message", "doco_sent_by_type": "Automation"})}
		with self.person(self.users["two"], cmd="frappe.client.insert", form=forged, reply=False):
			with self.assertRaises(bridge.NativeSendRefused):
				self.row(doco_sent_by_type="Automation", doco_automation_source="forged")
		with self.person(self.users["two"], path="/api/resource/WhatsApp%20Message", cmd="", reply=False):
			with self.assertRaises(bridge.NativeSendRefused):
				self.row(doco_sent_by_type="Automation")
		for state, reason in (
			("Bot", "bot_in_control"),
			("Paused", "conversation_paused"),
			("Closed", "conversation_closed"),
		):
			frappe.db.set_value(
				"CRM Conversation", self.doc.name, {"control_state": state, "human_owner": None}
			)
			with self.subTest(state=state), self.person():
				with self.assertRaises(bridge.NativeSendRefused) as refused:
					self.row()
				self.assertEqual(refused.exception.reason_code, reason)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.count("WhatsApp Message", {"to": self.peer}), before)
		self.assertFalse(
			frappe.db.exists(
				api.DOCTYPE, {"transcript_message": ["is", "set"], "conversation": self.doc.name}
			)
		)

	def test_outbox_bridge_closed_window_refuses_free_form_but_queues_a_template(self):
		frappe.db.set_value(
			"Meta Webhook Receipt",
			{"account_id": self.account_id, "event_type": "message"},
			"state",
			"Ignored",
		)
		with self.person():
			with self.assertRaises(bridge.NativeSendRefused) as refused:
				self.row()
		self.assertEqual(refused.exception.reason_code, "customer_window_unverified")
		frappe.set_user("Administrator")
		template = frappe.get_doc(
			{
				"doctype": "WhatsApp Templates",
				"template_name": "fictional_notice_" + uuid4().hex[:6],
				"actual_name": "fictional_notice",
				"language_code": "es_MX",
				"category": "UTILITY",
				"template": "Fictional notice",
				"whatsapp_account": self.account.name,
				"status": "APPROVED",
				"creation": frappe.utils.now_datetime(),
				"modified": frappe.utils.now_datetime(),
				"owner": "Administrator",
			}
		)
		template.db_insert()  # insert() would register the template with Meta
		with self.person():
			row = self.row(text="", message_type="Template", template=template.name)
		doc = api._load(self.intent_for(row))
		self.assertEqual((doc.origin, doc.purpose), ("Human", "service"))
		frappe.set_user("Administrator")
		doc, send = self.dispatch(doc.name)
		self.assertEqual(doc.state, "Accepted")

	def test_outbox_bridge_notice_ignores_owner_and_survives_a_control_change(self):
		frappe.set_user(self.users["two"])
		row = self.row(
			text="Fictional repair notice",
			doco_sent_by_type="Automation",
			doco_automation_source="tracker_notify:fictional",
			doco_actor_user=self.users["two"],
		)
		name = self.intent_for(row)
		self.assertEqual(
			(api._load(name).origin, api._load(name).actor_user), ("Automation", "Administrator")
		)
		frappe.set_user(self.users["one"])
		self.command("transfer", 2, owner=self.users["manager"])
		frappe.set_user("Administrator")
		doc, send = self.dispatch(name)
		self.assertEqual(doc.state, "Accepted")
		self.assertEqual(self.status(row).status, "Success")

	def test_outbox_bridge_failure_is_visible_on_the_row_and_retry_requeues_it(self):
		with self.person():
			row = self.row()
		name = self.intent_for(row)
		frappe.set_user("Administrator")
		doc, _ = self.dispatch(name, {"state": "Failed", "reason_code": "provider_rejected"})
		failed = self.status(row)
		self.assertEqual(failed.status, "failed")
		self.assertEqual(failed.failure_reason, bridge.reason_message("provider_rejected"))
		frappe.set_user(self.users["one"])
		self.assertEqual(api.retry_intent(name)["state"], "Queued")
		self.assertEqual(self.status(row).status, "Queued")
		frappe.set_user("Administrator")
		doc, _ = self.dispatch(name)
		self.assertEqual((doc.state, self.status(row).status), ("Accepted", "Success"))

	def test_outbox_bridge_uncertain_send_is_marked_unknown_and_never_retried(self):
		with self.person():
			row = self.row()
		name = self.intent_for(row)
		frappe.set_user("Administrator")
		self.dispatch(name, {"state": "Unknown", "reason_code": "provider_response_uncertain"})
		self.assertEqual(self.status(row).status, "unknown")
		frappe.set_user(self.users["one"])
		with self.assertRaises(frappe.ValidationError):
			api.retry_intent(name)

	def test_outbox_native_reply_without_a_row_is_projected_into_the_transcript(self):
		name = self.queue("Fictional Conversaciones reply")["name"]
		frappe.set_user("Administrator")
		doc, _ = self.dispatch(name, {"state": "Accepted", "provider_message_id": "wamid.projected"})
		provenance = frappe.db.has_column("WhatsApp Message", "doco_sent_by_type")
		row = frappe.db.get_value(
			"WhatsApp Message",
			bridge.PROJECTED_PREFIX + name,
			[
				"type",
				"to",
				"message",
				"status",
				"message_id",
				"whatsapp_account",
				*(["doco_sent_by_type"] if provenance else []),
			],
			as_dict=True,
		)
		self.assertEqual(
			(row.type, row.to, row.message, row.status, row.message_id, row.whatsapp_account),
			(
				"Outgoing",
				self.peer,
				"Fictional Conversaciones reply",
				"Success",
				"wamid.projected",
				self.account.name,
			),
		)
		if provenance:
			self.assertEqual(row.doco_sent_by_type, "Human")
		# A replayed transition updates the same row instead of adding another.
		bridge.project_transcript(api._load(name))
		self.assertEqual(frappe.db.count("WhatsApp Message", {"message_id": "wamid.projected"}), 1)

	def test_outbox_bridge_leaves_demo_accounts_and_other_recipients_on_the_legacy_path(self):
		account = frappe.get_doc("WhatsApp Account", self.account.name)
		self.assertEqual(bridge.governing_conversation(account, self.peer), self.doc.name)
		self.assertIsNone(bridge.governing_conversation(account, "5215550100000"))
		account.mode = "Demo"
		self.assertIsNone(bridge.governing_conversation(account, self.peer))

	def test_outbox_bridge_resending_an_existing_row_requeues_its_own_intent(self):
		with self.person():
			row = self.row()
		name = self.intent_for(row)
		frappe.set_user("Administrator")
		self.dispatch(name, {"state": "Failed", "reason_code": "provider_rejected"})
		existing = frappe.get_doc("WhatsApp Message", row.name)
		with self.person():
			existing.send_outgoing()
		self.assertTrue(existing.flags.get("native_deferred"))
		self.assertEqual(api._load(name).state, "Queued")
		self.assertEqual(frappe.db.count(api.DOCTYPE, {"transcript_message": row.name}), 1)
		frappe.set_user("Administrator")
		self.dispatch(name, {"state": "Unknown", "reason_code": "provider_response_uncertain"})
		with self.person(), self.assertRaises(bridge.NativeSendRefused) as refused:
			frappe.get_doc("WhatsApp Message", row.name).send_outgoing()
		self.assertIn(refused.exception.reason_code, {"transcript_not_retryable"})

	def test_outbox_bridge_declared_producers_decide_origin_not_provenance_or_desk_clicks(self):
		# An approval flow reusing a composer function stays an automated notice.
		with self.person(self.users["two"], reply=False), bridge.automated_send(), bridge.person_reply():
			approved = self.row(text="Fictional approved reply")
		self.assertEqual(api._load(self.intent_for(approved)).origin, "Automation")
		# A Desk save of another document that sends a notice is automated too,
		# even though the provenance field defaults to Human.
		repair = {"doc": json.dumps({"doctype": "Fictional Repair Order", "name": "RO-1"})}
		with self.person(self.users["two"], cmd="frappe.desk.form.save.savedocs", form=repair, reply=False):
			notice = self.row(text="Fictional repair ready")
		self.assertEqual(api._load(self.intent_for(notice)).origin, "Automation")

	def test_outbox_bridge_normalizes_recipient_and_survives_a_deleted_row(self):
		with self.person():
			row = self.row(to="+" + self.peer)
		self.assertEqual(frappe.db.get_value("WhatsApp Message", row.name, "to"), self.peer)
		name = self.intent_for(row)
		frappe.db.delete("WhatsApp Message", {"name": row.name})
		frappe.set_user("Administrator")
		doc, _ = self.dispatch(name, {"state": "Accepted", "provider_message_id": "wamid.orphaned-row"})
		self.assertEqual(doc.state, "Accepted")

	def test_outbox_bridge_busy_conversation_asks_to_retry_in_spanish(self):
		from crm.api import conversations as control

		def busy(name, timeout=5):
			control._conflict()

		with self.person(), patch.object(control, "conversation_fence", side_effect=busy):
			with self.assertRaises(bridge.NativeSendRefused) as refused:
				self.row()
		self.assertEqual(refused.exception.reason_code, "conversation_busy")

	def test_outbox_bridge_preview_and_dispatch_agree_on_the_mexican_alias(self):
		_needs_window(self)
		account = frappe.get_doc("WhatsApp Account", self.account.name)
		national = self.peer[3:]
		self.assertEqual(bridge.governing_peer(account, "52" + national), (self.doc.name, self.peer))
		self.assertEqual(bridge.governing_peer(account, self.peer), (self.doc.name, self.peer))
		# National input is the caller's to internationalize; never a ten-digit suffix match.
		self.assertEqual(bridge.governing_peer(account, national), (None, None))
		self.assertEqual(bridge.governing_peer(account, "1" + national), (None, None))

	def test_outbox_window_evidence_is_per_account_app_and_exact_peer(self):
		_needs_window(self)
		from frappe_whatsapp import window

		frappe.set_user("Administrator")
		now = int(__import__("time").time())
		account = frappe.db.get_value(
			"WhatsApp Account", self.account.name, ["name", "phone_id", "app_id", "status"], as_dict=True
		)
		opened = window.is_open(account, "52" + self.peer[3:])
		self.assertTrue(opened.open)
		self.assertEqual(opened.peer, self.peer)
		other_id = "97" + str(int(uuid4().hex[:12], 16))
		other = frappe.get_doc(
			{
				"doctype": "WhatsApp Account",
				"account_name": self.prefix + "-b-" + uuid4().hex[:6],
				"phone_id": other_id,
				"status": "Active",
				"mode": "Live",
				"app_id": "9800001",
				"is_default_incoming": 0,
				"is_default_outgoing": 0,
			}
		).insert()
		self.assertEqual(window.is_open(other.name, self.peer).reason, "closed")
		for label, kwargs in (
			("other app", {"app": "1234567"}),
			("future", {"timestamp": now + 120}),
			("exactly 24 h", {"timestamp": now - window.WINDOW_SECONDS}),
			("unprocessed", {"state": "Failed"}),
		):
			with self.subTest(label=label):
				self.inbound(account=other_id, **kwargs)
				self.assertFalse(window.is_open(other.name, self.peer, now=now).open)
		self.inbound(account=other_id, timestamp=now - window.WINDOW_SECONDS + 60)
		self.assertTrue(window.is_open(other.name, self.peer, now=now).open)

	def test_outbox_bridge_control_preview_never_takes_the_conversation(self):
		self.command("release", 2)
		preview = bridge.control_preview(self.doc.name, self.users["one"])
		self.assertEqual((preview["state"], preview["owner"], preview["action"]), ("Human", None, "take"))
		self.assertIsNone(frappe.db.get_value("CRM Conversation", self.doc.name, "human_owner"))
		self.command("take", 3)
		self.assertIsNone(bridge.control_preview(self.doc.name, self.users["one"])["action"])
		self.assertEqual(
			bridge.control_preview(self.doc.name, self.users["two"])["action"], "conversation_owned"
		)
		if self.shop:
			# Without the shop's User Permission the account is out of scope.
			self.assertEqual(
				bridge.control_preview(self.doc.name, self.users["outsider"])["action"],
				"authority_revoked",
			)

	def test_outbox_bridge_producer_guard_rechecks_at_dispatch_and_retry(self):
		with self.person():
			row = self.row()
		name = self.intent_for(row)
		frappe.set_user("Administrator")
		hooks = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			if hook == "crm_transcript_dispatch_guard":
				return ["crm.tests.test_outbox_bridge.refuse_transcript"]
			return hooks(hook, *args, **kwargs)

		GUARD_CALLS.clear()
		with patch.object(frappe, "get_hooks", side_effect=get_hooks):
			doc, send = self.dispatch(name)
		send.assert_not_called()
		self.assertEqual((doc.state, doc.reason_code), ("Blocked", "producer_authority_changed"))
		self.assertEqual(GUARD_CALLS, [row.name])
		self.assertIn("ya no está autorizado", bridge.reason_message("producer_authority_changed"))

	def test_outbox_bridge_two_alias_conversations_are_both_offered(self):
		_needs_window(self)
		account = frappe.get_doc("WhatsApp Account", self.account.name)
		other = "52" + self.peer[3:]
		from crm.api import conversations as control

		second = control.get_or_create("WhatsApp", self.account_id, other)
		self.assertEqual(
			bridge.governing_peers(account, other), [(second.name, other), (self.doc.name, self.peer)]
		)
