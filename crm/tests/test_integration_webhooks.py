"""Signed integration webhooks: emission, visibility as the connection user, delivery and retries.

Isolated lab only: fictional users/accounts, no network (the HTTP seam is patched),
commits inside the delivery worker are suppressed so every test rolls back.
"""

import base64
import hashlib
import hmac
import json
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from crm.api import conversations as control
from crm.api import integration as api
from crm.integrations import events, webhooks


class FakeResponse:
	def __init__(self, status_code=200, text="ok"):
		self.status_code, self.text = status_code, text


class TestIntegrationWebhooks(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.prefix = "integ-" + uuid4().hex[:10]
		cls.users = {}
		cls.shop = None
		has_shop = frappe.db.has_column("WhatsApp Account", "doco_shop")
		if has_shop:
			cls.shop = (
				frappe.get_doc({"doctype": "Social Shop", "shop_name": cls.prefix, "enabled": 1})
				.insert()
				.name
			)
		with patch("frappe.sendmail"):
			for label, roles in (("agent", ["Sales User"]), ("admin", ["System Manager"]), ("outsider", [])):
				name = f"{cls.prefix}-{label}@example.invalid"
				frappe.get_doc(
					{
						"doctype": "User",
						"email": name,
						"first_name": "Fictional " + label,
						"enabled": 1,
						"send_welcome_email": 0,
						"user_type": "System User",
						"roles": [{"role": r} for r in roles],
					}
				).insert()
				cls.users[label] = name
				if has_shop and label == "agent":
					frappe.get_doc(
						{
							"doctype": "User Permission",
							"user": name,
							"allow": "Social Shop",
							"for_value": cls.shop,
						}
					).insert()

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.point = "integration_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No external requests"))
		)
		self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("No mail")))
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(patch.object(frappe.db, "commit"))
		webhooks.clear_subscriber_cache()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point=self.point)
		webhooks.clear_subscriber_cache()
		super().tearDown()

	def connection(
		self, events_=("lead.created",), user="admin", enabled=1, url="https://hooks.example.com/n8n"
	):
		doc = frappe.get_doc(
			{
				"doctype": webhooks.INTEGRATION,
				"title": "Fictional n8n " + uuid4().hex[:6],
				"integration_user": self.users[user],
				"webhook_url": url,
				"subscriptions": [{"event": e} for e in events_],
			}
		).insert()
		if enabled:
			doc.enabled = 1
			doc.save()
		webhooks.clear_subscriber_cache()
		return doc

	def deliveries(self, connection, event=None):
		filters = {"integration": connection.name}
		if event:
			filters["event"] = event
		return frappe.get_all(webhooks.DELIVERY, filters=filters, pluck="name", order_by="creation")

	def lead(self):
		return frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Fictional",
				"last_name": uuid4().hex[:8],
				"email": f"{uuid4().hex[:8]}@example.invalid",
			}
		).insert(ignore_permissions=True)

	# ------------------------------------------------------------ contract basics

	def test_signature_matches_standard_webhooks_reference(self):
		# Published Standard Webhooks example (github.com/standard-webhooks/standard-webhooks).
		signature = webhooks.sign(
			"whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
			"msg_p5jXN8AQM9LWM0D4loKWxJek",
			"1614265330",
			'{"test": 2432232314}',
		)
		self.assertEqual(signature, "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=")

	def test_url_rules_explain_how_to_fix(self):
		webhooks.validate_url("https://n8n.example.com/webhook/abc")
		for bad in ("http://n8n.example.com/webhook", "ftp://x", "https://user:pw@n8n.example.com/x", "n8n"):
			with self.subTest(bad=bad), self.assertRaises(frappe.ValidationError):
				webhooks.validate_url(bad)
		with patch.dict(frappe.conf, {"crm_integration_allowed_hosts": ["n8n.lan"]}):
			webhooks.validate_url("http://n8n.lan:5678/webhook/abc")

	def test_new_connection_is_disabled_and_enabling_names_the_missing_step(self):
		doc = frappe.get_doc(
			{"doctype": webhooks.INTEGRATION, "title": "Fictional", "integration_user": self.users["admin"]}
		).insert()
		self.assertEqual(doc.enabled, 0)
		self.assertTrue(doc.get_password("signing_secret").startswith("whsec_"))
		doc.enabled = 1
		with self.assertRaisesRegex(frappe.ValidationError, "webhook URL"):
			doc.save()
		doc.reload()
		doc.webhook_url = "https://hooks.example.com/n8n"
		doc.enabled = 1
		with self.assertRaisesRegex(frappe.ValidationError, "at least one event"):
			doc.save()
		doc.reload()
		doc.webhook_url = "https://hooks.example.com/n8n"
		doc.append("subscriptions", {"event": "lead.created"})
		doc.integration_user = "Administrator"
		doc.enabled = 1
		with self.assertRaisesRegex(frappe.ValidationError, "dedicated user"):
			doc.save()

	def test_emit_reaches_only_enabled_subscribers_once_per_version(self):
		subscribed = self.connection(["lead.created"])
		other = self.connection(["deal.created"])
		disabled = self.connection(["lead.created"], enabled=0)
		lead = self.lead()
		self.assertEqual(len(self.deliveries(subscribed, "lead.created")), 1)
		self.assertEqual(self.deliveries(other), [])
		self.assertEqual(self.deliveries(disabled), [])
		events.on_record_insert(lead)  # a hook firing twice is the same change
		self.assertEqual(len(self.deliveries(subscribed, "lead.created")), 1)
		frappe.flags.in_import = True
		try:
			self.lead()
		finally:
			frappe.flags.in_import = False
		self.assertEqual(len(self.deliveries(subscribed, "lead.created")), 1)

	def test_lead_status_change_emits_status_and_update(self):
		connection = self.connection(["lead.status_changed", "lead.updated"])
		lead = self.lead()
		statuses = set(frappe.get_all("CRM Lead Status", pluck="name"))
		# Junk/Unqualified need a lost reason; pick an open stage.
		target = next(
			(s for s in ("Contacted", "Nurture", "Qualified") if s in statuses and s != lead.status), None
		)
		if not target:
			self.skipTest("Needs two lead statuses on the template site.")
		lead.status = target
		lead.save(ignore_permissions=True)
		self.assertEqual(len(self.deliveries(connection, "lead.status_changed")), 1)
		row = frappe.get_doc(webhooks.DELIVERY, self.deliveries(connection, "lead.updated")[0])
		self.assertIn("status", json.loads(row.context_json)["fields"])

	# ------------------------------------------------------------ delivery

	def test_delivery_is_signed_frozen_and_verifiable(self):
		connection = self.connection(["lead.created"])
		lead = self.lead()
		name = self.deliveries(connection)[0]
		with patch.object(webhooks, "_post", return_value=FakeResponse(204)) as post:
			result = webhooks.deliver(name)
		self.assertEqual(result.status, "Delivered")
		_, body, headers = post.call_args.args
		payload = json.loads(body)
		self.assertEqual((payload["id"], payload["type"]), (name, "lead.created"))
		self.assertEqual(payload["data"]["record"]["name"], lead.name)
		secret = base64.b64decode(connection.get_password("signing_secret").removeprefix("whsec_"))
		expected = base64.b64encode(
			hmac.new(
				secret, f"{name}.{headers['webhook-timestamp']}.{body}".encode(), hashlib.sha256
			).digest()
		).decode()
		self.assertEqual(headers["webhook-signature"], "v1," + expected)
		self.assertEqual(frappe.db.get_value(webhooks.DELIVERY, name, "payload"), body)
		health = frappe.db.get_value(
			webhooks.INTEGRATION,
			connection.name,
			["last_delivery_status", "consecutive_failures"],
			as_dict=True,
		)
		self.assertTrue(health.last_delivery_status.startswith("Delivered"))
		self.assertEqual(health.consecutive_failures, 0)

	def test_failures_back_off_then_stop_and_410_stops_at_once(self):
		connection = self.connection(["lead.created"])
		self.lead()
		name = self.deliveries(connection)[0]
		with patch.object(webhooks, "_post", return_value=FakeResponse(500, "boom")):
			first = webhooks.deliver(name)
			self.assertEqual((first.status, first.attempts, first.response_code), ("Failed", 1, 500))
			self.assertIsNotNone(first.next_attempt_at)
			body = frappe.db.get_value(webhooks.DELIVERY, name, "payload")
			for _ in range(webhooks.MAX_ATTEMPTS - 1):
				frappe.db.set_value(webhooks.DELIVERY, name, "next_attempt_at", frappe.utils.now_datetime())
				last = webhooks.deliver(name)
		self.assertEqual((last.status, last.attempts), ("Dead", webhooks.MAX_ATTEMPTS))
		self.assertEqual(frappe.db.get_value(webhooks.DELIVERY, name, "payload"), body)
		self.assertEqual(
			frappe.db.get_value(webhooks.INTEGRATION, connection.name, "consecutive_failures"),
			webhooks.MAX_ATTEMPTS,
		)
		self.lead()
		gone = self.deliveries(connection)[-1]
		with patch.object(webhooks, "_post", return_value=FakeResponse(410)):
			self.assertEqual(webhooks.deliver(gone).status, "Dead")

	def test_records_the_user_cannot_read_are_skipped_not_sent(self):
		connection = self.connection(["lead.created"], user="outsider")
		self.lead()
		name = self.deliveries(connection)[0]
		with patch.object(webhooks, "_post", side_effect=AssertionError("must not send")):
			result = webhooks.deliver(name)
		self.assertEqual(result.status, "Skipped")
		self.assertIn("may not read", result.last_error)

	def test_disabled_connection_or_user_skips_queued_events(self):
		connection = self.connection(["lead.created"])
		self.lead()
		name = self.deliveries(connection)[0]
		frappe.db.set_value(webhooks.INTEGRATION, connection.name, "enabled", 0)
		with patch.object(webhooks, "_post", side_effect=AssertionError("must not send")):
			self.assertEqual(webhooks.deliver(name).status, "Skipped")

	def test_send_test_and_redeliver(self):
		connection = self.connection(["lead.created"], enabled=0)
		with patch.object(webhooks, "_post", return_value=FakeResponse(200)) as post:
			result = api.send_test(connection.name)
		self.assertEqual(result.status, "Delivered")
		self.assertEqual(json.loads(post.call_args.args[1])["type"], "ping")
		connection.reload()
		connection.enabled = 1
		connection.save()
		webhooks.clear_subscriber_cache()
		self.lead()
		name = self.deliveries(connection, "lead.created")[0]
		with patch.object(webhooks, "_post", return_value=FakeResponse(410)):
			webhooks.deliver(name)
		again = api.redeliver(name)
		self.assertEqual(again.status, "Pending")
		frappe.set_user(self.users["agent"])
		with self.assertRaises(frappe.PermissionError):
			api.redeliver(name)

	def test_whoami_lists_the_callers_connections(self):
		connection = self.connection(["lead.created"])
		frappe.set_user(self.users["admin"])
		me = api.whoami()
		self.assertEqual(me["user"], self.users["admin"])
		self.assertIn(connection.name, [c.name for c in me["connections"]])
		self.assertIn("message.created", me["events"])

	def test_every_catalog_event_can_be_chosen_on_a_connection(self):
		options = frappe.get_meta("CRM Integration Subscription").get_field("event").options.split("\n")
		self.assertEqual(sorted(options), sorted(e["event"] for e in webhooks.catalog()))

	# ------------------------------------------------------------ any record type

	def documents(self, *events_, doctype="ToDo", user="admin"):
		doc = frappe.get_doc(
			{
				"doctype": webhooks.INTEGRATION,
				"title": "Fictional n8n " + uuid4().hex[:6],
				"integration_user": self.users[user],
				"webhook_url": "https://hooks.example.com/n8n",
				"subscriptions": [{"event": e, "document_type": doctype} for e in events_],
			}
		).insert()
		doc.enabled = 1
		doc.save()
		webhooks.clear_subscriber_cache()
		return doc

	def test_document_events_follow_the_chosen_record_type(self):
		connection = self.documents("document.created", "document.updated", "document.deleted")
		self.assertIn("ToDo", webhooks.document_types())
		todo = frappe.get_doc({"doctype": "ToDo", "description": "Fictional call back"}).insert()
		self.assertEqual(len(self.deliveries(connection, "document.created")), 1)
		self.assertEqual(self.deliveries(connection, "document.updated"), [], "an insert is not an update")
		todo.description = "Fictional call back tomorrow"
		todo.save()
		updated = self.deliveries(connection, "document.updated")
		self.assertEqual(len(updated), 1)
		frappe.get_doc({"doctype": "CRM Lead", "first_name": "Fictional"}).insert(ignore_permissions=True)
		self.assertEqual(len(self.deliveries(connection)), 2, "other record types are not sent")
		row = frappe.get_doc(webhooks.DELIVERY, updated[0])
		body = json.loads(webhooks.build_payload(row, connection))
		self.assertEqual(body["data"]["record"]["description"], "Fictional call back tomorrow")
		self.assertIn("description", body["data"]["change"]["fields"])
		self.assertNotIn("date", body["data"]["change"]["fields"], "an unset date is not a change")
		self.assertEqual(body["api_version"], webhooks.API_VERSION)
		frappe.delete_doc("ToDo", todo.name)
		gone = frappe.get_doc(webhooks.DELIVERY, self.deliveries(connection, "document.deleted")[0])
		data = json.loads(webhooks.build_payload(gone, connection))["data"]
		self.assertEqual((data["doctype"], data["name"]), ("ToDo", todo.name))

	def test_changed_fields_compare_stored_values_and_table_rows(self):
		changed_fields = events.changed_fields

		def deal(**values):
			return frappe.get_doc(
				{"doctype": "CRM Deal", "products": [{"product_name": "Fictional", "rate": 10}]} | values
			)

		self.assertEqual(changed_fields(deal(expected_closure_date=None), deal(expected_closure_date="")), [])
		self.assertEqual(
			changed_fields(
				deal(expected_closure_date="2026-01-02"), deal(expected_closure_date=getdate("2026-01-02"))
			),
			[],
		)
		self.assertEqual(changed_fields(deal(probability=50), deal(probability="50.0")), [])
		after = deal()
		after.products[0].rate = 12
		self.assertEqual(changed_fields(deal(), after), ["products"])

	def test_document_subscriptions_explain_what_cannot_be_sent(self):
		for doctype in ("User", "CRM Integration Delivery", "CRM Service Day", None):
			with self.assertRaises(frappe.ValidationError, msg=doctype):
				self.documents("document.created", doctype=doctype)
		with self.assertRaises(frappe.ValidationError):
			self.documents("document.created", doctype="CRM Deal", user="outsider")
		names = {row["name"] for row in api.document_types("todo")}
		self.assertIn("ToDo", names)
		self.assertNotIn("User", {row["name"] for row in api.document_types("user")})

	def test_a_connection_does_not_hear_its_own_changes(self):
		connection = self.connection(["lead.created"])
		frappe.set_user(self.users["admin"])
		self.lead()
		self.assertEqual(self.deliveries(connection), [])
		frappe.set_user("Administrator")
		frappe.db.set_value(webhooks.INTEGRATION, connection.name, "skip_own_changes", 0)
		frappe.set_user(self.users["admin"])
		self.lead()
		self.assertEqual(len(self.deliveries(connection)), 1)

	# ------------------------------------------------------------ conversations and messages

	def whatsapp(self):
		account_id = "97" + str(int(uuid4().hex[:12], 16))
		account = frappe.get_doc(
			{
				"doctype": "WhatsApp Account",
				"account_name": self.prefix + uuid4().hex[:8],
				"phone_id": account_id,
				"status": "Active",
				"mode": "Demo",
				"doco_shop": self.shop,
				"is_default_incoming": 0,
				"is_default_outgoing": 0,
			}
		).insert()
		return account, account_id

	def test_control_change_events_carry_what_changed(self):
		if not frappe.db.exists("DocType", "WhatsApp Account"):
			self.skipTest("Needs frappe_whatsapp.")
		_, account_id = self.whatsapp()
		connection = self.connection(
			["conversation.created", "conversation.status_changed", "conversation.updated"], user="agent"
		)
		doc = control.get_or_create("WhatsApp", account_id, "5215550100777")
		self.assertEqual(len(self.deliveries(connection, "conversation.created")), 1)
		frappe.set_user(self.users["agent"])
		control.apply_control(doc.name, "take", 1, uuid4().hex)
		control.apply_control(doc.name, "close", 2, uuid4().hex)
		frappe.set_user("Administrator")
		changes = [
			json.loads(frappe.db.get_value(webhooks.DELIVERY, n, "context_json"))
			for n in self.deliveries(connection, "conversation.status_changed")
		] + [
			json.loads(frappe.db.get_value(webhooks.DELIVERY, n, "context_json"))
			for n in self.deliveries(connection, "conversation.updated")
		]
		self.assertIn(("take", self.users["agent"]), [(c["action"], c["to_owner"]) for c in changes])
		closed = [c for c in changes if c["action"] == "close"]
		self.assertEqual((closed[0]["from_state"], closed[0]["to_state"]), ("Human", "Closed"))
		name = self.deliveries(connection, "conversation.status_changed")[-1]
		with patch.object(webhooks, "_post", return_value=FakeResponse(200)) as post:
			self.assertEqual(webhooks.deliver(name).status, "Delivered")
		data = json.loads(post.call_args.args[1])["data"]
		self.assertEqual((data["conversation"]["name"], data["change"]["to_state"]), (doc.name, "Closed"))

	def test_message_created_is_built_with_inbox_policy(self):
		if not frappe.db.exists("DocType", "WhatsApp Account"):
			self.skipTest("Needs frappe_whatsapp.")
		account, account_id = self.whatsapp()
		peer = "5215550100778"
		agent = self.connection(["message.created"], user="agent")
		outsider = self.connection(["message.created"], user="outsider")
		control.get_or_create("WhatsApp", account_id, peer)
		message = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"name": uuid4().hex,
				"type": "Incoming",
				"from": peer,
				"whatsapp_account": account.name,
				"message": "Hola, ¿tienen la pieza?",
				"content_type": "text",
			}
		)
		message.db_insert()
		events.on_message_insert(message)
		with patch.object(webhooks, "_post", return_value=FakeResponse(200)) as post:
			self.assertEqual(webhooks.deliver(self.deliveries(agent)[0]).status, "Delivered")
		data = json.loads(post.call_args.args[1])["data"]
		self.assertEqual(data["message"]["content"], "Hola, ¿tienen la pieza?")
		self.assertEqual((data["message"]["direction"], data["thread"]["provider"]), ("in", "WhatsApp"))
		self.assertTrue(data["conversation"]["name"])
		with patch.object(webhooks, "_post", side_effect=AssertionError("must not send")):
			self.assertEqual(webhooks.deliver(self.deliveries(outsider)[0]).status, "Skipped")

	# ------------------------------------------------------------ API inbox channel

	def channel(self, events_=()):
		doc = frappe.get_doc(
			{
				"doctype": webhooks.INTEGRATION,
				"title": "Fictional email bridge",
				"integration_user": self.users["agent"],
				"webhook_url": "https://hooks.example.com/bridge",
				"api_channel": 1,
				"subscriptions": [{"event": e} for e in events_],
			}
		).insert()
		doc.enabled = 1
		doc.save()
		webhooks.clear_subscriber_cache()
		return doc

	def test_api_channel_round_trip_through_inbox_and_outbox(self):
		from crm.api import conversation_threads as threads
		from crm.api import outbox

		connection = self.channel()
		self.assertRegex(connection.channel_account_id, r"^[0-9a-f]{64}$")
		frappe.set_user(self.users["agent"])
		first = api.channel_message(
			"ana@example.invalid", "Hola, ¿abren el sábado?", "mail-1", "Ana Ficticia"
		)
		again = api.channel_message(
			"ana@example.invalid", "Hola, ¿abren el sábado?", "mail-1", "Ana Ficticia"
		)
		self.assertEqual((again["conversation"], again["replayed"]), (first["conversation"], True))
		with self.assertRaisesRegex(frappe.ValidationError, "different text"):
			api.channel_message("ana@example.invalid", "Otro texto", "mail-1")
		self.assertIn(
			("API", connection.channel_account_id),
			[(a["provider"], a["account_id"]) for a in threads.list_accounts()["accounts"]],
		)
		history = threads.get_history(first["conversation"])
		self.assertEqual(history["conversation"]["display_name"], "Ana Ficticia")
		self.assertEqual(
			[(m["direction"], m["content"]) for m in history["messages"]], [("in", "Hola, ¿abren el sábado?")]
		)
		self.assertTrue(history["conversation"]["send_available"] is False)  # nobody owns it yet
		taken = control.apply_control(
			first["conversation"], "take", history["conversation"]["generation"], uuid4().hex
		)
		intent = outbox.queue_message(
			first["conversation"],
			taken["generation"],
			uuid4().hex,
			{"type": "text", "text": "Sí, de 10 a 14 h."},
		)
		frappe.set_user("Administrator")
		with patch.object(frappe.db, "rollback"):
			outbox.dispatch_intent(intent["name"])
		state = frappe.db.get_value(
			outbox.DOCTYPE, intent["name"], ["state", "provider_message_id"], as_dict=True
		)
		self.assertEqual(state.state, "Accepted")
		self.assertTrue(state.provider_message_id.startswith("api."))
		reply = frappe.get_all(
			"CRM Channel Message",
			filters={"integration": connection.name, "direction": "Outgoing"},
			fields=["name", "text", "status"],
		)
		self.assertEqual([(r.text, r.status) for r in reply], [("Sí, de 10 a 14 h.", "sent")])
		# The channel's own webhook gets the reply although it subscribed to nothing.
		out = self.deliveries(connection, "message.created")
		self.assertEqual(len(out), 1)
		with patch.object(webhooks, "_post", return_value=FakeResponse(200)) as post:
			self.assertEqual(webhooks.deliver(out[0]).status, "Delivered")
		data = json.loads(post.call_args.args[1])["data"]
		self.assertEqual(
			(data["message"]["direction"], data["message"]["content"], data["thread"]["peer_id"]),
			("out", "Sí, de 10 a 14 h.", "ana@example.invalid"),
		)
		frappe.set_user(self.users["agent"])
		self.assertEqual(api.channel_status(reply[0].name, "delivered")["status"], "delivered")
		with self.assertRaises(frappe.ValidationError):
			api.channel_status(reply[0].name, "teleported")

	def test_api_channel_refuses_callers_and_states_it_cannot_serve(self):
		connection = self.channel()
		frappe.set_user(self.users["admin"])
		with self.assertRaisesRegex(frappe.PermissionError, "Acts as user"):
			api.channel_message("ana@example.invalid", "Hola", "mail-2")
		frappe.set_user("Administrator")
		frappe.db.set_value(webhooks.INTEGRATION, connection.name, "enabled", 0)
		frappe.set_user(self.users["agent"])
		with self.assertRaisesRegex(frappe.ValidationError, "disabled"):
			api.channel_message("ana@example.invalid", "Hola", "mail-3")
		frappe.set_user("Administrator")
		frappe.db.set_value(webhooks.INTEGRATION, connection.name, "enabled", 1)
		frappe.set_user(self.users["agent"])
		for bad in ("", " lead", "a" * 129, "ana smith"):
			with self.subTest(contact=bad), self.assertRaises(frappe.ValidationError):
				api.channel_message(bad, "Hola", "mail-" + uuid4().hex[:6])
