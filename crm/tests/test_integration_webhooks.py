"""Signed integration webhooks: emission, visibility as the connection user, delivery and retries.

Isolated lab only: fictional users/accounts, no network (the HTTP seam is patched),
commits inside the delivery worker are suppressed so every test rolls back.
"""

import base64
import hashlib
import hmac
import io
import json
import socket
from unittest.mock import patch
from uuid import uuid4

import frappe
import requests
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from crm.api import conversations as control
from crm.api import integration as api
from crm.integrations import events, webhooks

# setUp blocks the network; the real-path tests put the real method back and fake
# only DNS and the transport below the pinned adapter.
REAL_REQUEST = requests.sessions.Session.request


def addresses(*ips):
	return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, 443)) for ip in ips]


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
		frappe.local.crm_integration_pending = None  # commits are suppressed, so nothing flushes it

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

	def test_send_test_through_the_real_post_pins_the_checked_address(self):
		connection = self.connection(["lead.created"], enabled=0, url="https://hooks.example.com/n8n?x=1")
		sent = []

		def transport(adapter, request, **kwargs):
			sent.append(
				(request.url, dict(request.headers), dict(adapter.poolmanager.connection_pool_kw), kwargs)
			)
			response = requests.Response()
			response.status_code, response.raw, response.url = 204, io.BytesIO(b""), request.url
			return response

		with (
			patch("requests.sessions.Session.request", REAL_REQUEST),
			patch("socket.getaddrinfo", return_value=addresses("93.184.215.14")),
			patch("requests.adapters.HTTPAdapter.send", transport),
		):
			result = api.send_test(connection.name)
		self.assertEqual((result.status, result.response_code), ("Delivered", 204))
		url, headers, pool, kwargs = sent[0]
		self.assertEqual(url, "https://93.184.215.14/n8n?x=1")
		self.assertEqual(headers["Host"], "hooks.example.com")
		self.assertEqual((pool["server_hostname"], pool["assert_hostname"]), ("hooks.example.com",) * 2)
		self.assertEqual(kwargs["timeout"], webhooks.TIMEOUT_SECONDS)
		self.assertEqual(headers["webhook-id"], result.name)
		self.assertTrue(headers["webhook-signature"].startswith("v1,"))

	def test_an_endless_answer_is_read_only_as_far_as_the_error_snippet(self):
		connection = self.connection(["lead.created"], enabled=0)

		class Endless(io.RawIOBase):
			served = 0

			def readable(self):
				return True

			def read(self, size=-1):
				size = 64 * 1024 if size is None or size < 0 else size
				Endless.served += size
				return b"x" * size

		def transport(adapter, request, **kwargs):
			response = requests.Response()
			response.status_code, response.raw, response.url = 500, Endless(), request.url
			return response

		with (
			patch("requests.sessions.Session.request", REAL_REQUEST),
			patch("socket.getaddrinfo", return_value=addresses("93.184.215.14")),
			patch("requests.adapters.HTTPAdapter.send", transport),
		):
			result = api.send_test(connection.name)
		self.assertEqual((result.status, result.response_code), ("Dead", 500))
		self.assertTrue(result.last_error.startswith("HTTP 500 xxx"))
		self.assertLessEqual(Endless.served, webhooks.MAX_ANSWER_BYTES)

	def test_send_test_through_the_real_post_explains_what_went_wrong(self):
		connection = self.connection(["lead.created"], enabled=0)
		cases = (
			({"side_effect": socket.gaierror(-2, "Name or service not known")}, None, "could not be found"),
			({"return_value": addresses("10.0.0.7")}, None, "private address"),
			(
				{"return_value": addresses("93.184.215.14")},
				requests.ConnectionError("refused"),
				"Could not connect",
			),
			({"return_value": addresses("93.184.215.14")}, requests.ConnectTimeout("slow"), "No answer"),
		)
		for dns, failure, words in cases:
			with (
				self.subTest(words=words),
				patch("requests.sessions.Session.request", REAL_REQUEST),
				patch("socket.getaddrinfo", **dns),
				patch("requests.adapters.HTTPAdapter.send", side_effect=failure or AssertionError("no send")),
			):
				result = api.send_test(connection.name)
				self.assertEqual((result.status, result.response_code), ("Dead", 0))
				self.assertIn(words, result.last_error)

	def test_a_queued_event_with_no_answer_retries_later(self):
		connection = self.connection(["lead.created"])
		self.lead()
		name = self.deliveries(connection)[0]
		with (
			patch("requests.sessions.Session.request", REAL_REQUEST),
			patch(
				"socket.getaddrinfo", side_effect=socket.gaierror(-3, "Temporary failure in name resolution")
			),
		):
			result = webhooks.deliver(name)
		self.assertEqual((result.status, result.attempts, result.response_code), ("Failed", 1, 0))
		self.assertIsNotNone(result.next_attempt_at)
		self.assertIn("could not be found", result.last_error)

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

	def documents(self, *events_, doctype="ToDo", user="admin", only=None):
		doc = frappe.get_doc(
			{
				"doctype": webhooks.INTEGRATION,
				"title": "Fictional n8n " + uuid4().hex[:6],
				"integration_user": self.users[user],
				"webhook_url": "https://hooks.example.com/n8n",
				"subscriptions": [
					{
						"event": e,
						"document_type": doctype,
						"only_fields": only if e.endswith(".updated") else None,
					}
					for e in events_
				],
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
		self.assertRegex(
			body["timestamp"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$", "ISO 8601 UTC, as documented"
		)
		frappe.delete_doc("ToDo", todo.name)
		gone = frappe.get_doc(webhooks.DELIVERY, self.deliveries(connection, "document.deleted")[0])
		data = json.loads(webhooks.build_payload(gone, connection))["data"]
		self.assertEqual((data["doctype"], data["name"]), ("ToDo", todo.name))

	def test_child_rows_carry_only_fields_the_user_may_read(self):
		connection = self.documents("document.created", doctype="CRM Deal")
		real = events.get_permitted_fields

		def without_rate(doctype, *args, **kwargs):
			fields = real(doctype, *args, **kwargs)
			return [f for f in fields if f != "rate"] if doctype == "CRM Products" else fields

		# the CRM's own currency: another one would look up an exchange rate online
		currency = frappe.db.get_single_value("FCRM Settings", "currency") or "USD"
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"currency": currency,
				"products": [{"product_name": "Fictional", "rate": 10, "qty": 2}],
			}
		).insert(ignore_permissions=True)
		row = frappe.get_doc(webhooks.DELIVERY, self.deliveries(connection, "document.created")[0])
		with patch.object(events, "get_permitted_fields", side_effect=without_rate):
			record = json.loads(webhooks.build_payload(row, connection))["data"]["record"]
		self.assertEqual(record["name"], deal.name)
		product = record["products"][0]
		self.assertEqual((product["product_name"], product["qty"]), ("Fictional", 2))
		self.assertNotIn("rate", product, "a child field the user may not read stays out")

	def test_a_record_deleted_before_sending_says_so(self):
		connection = self.documents("document.updated")
		todo = frappe.get_doc({"doctype": "ToDo", "description": "Fictional"}).insert()
		todo.description = "Fictional, edited"
		todo.save()
		name = self.deliveries(connection, "document.updated")[0]
		frappe.db.delete("ToDo", {"name": todo.name})
		with patch.object(webhooks, "_post", side_effect=AssertionError("must not send")):
			result = webhooks.deliver(name)
		self.assertEqual(result.status, "Skipped")
		self.assertIn("deleted before", result.last_error)

	def test_rotation_signs_with_both_secrets_for_a_day(self):
		connection = self.connection(["lead.created"])
		old = connection.get_password("signing_secret")
		frappe.set_user(self.users["admin"])
		new = api.rotate_secret(connection.name)["secret"]
		frappe.set_user("Administrator")
		self.assertNotEqual(old, new)
		self.lead()
		name = self.deliveries(connection)[0]
		with patch.object(webhooks, "_post", return_value=FakeResponse(204)) as post:
			webhooks.deliver(name)
		_, body, headers = post.call_args.args
		sent = headers["webhook-signature"].split(" ")
		ts = headers["webhook-timestamp"]
		self.assertEqual(sent, [webhooks.sign(new, name, ts, body), webhooks.sign(old, name, ts, body)])
		frappe.db.set_value(
			webhooks.INTEGRATION,
			connection.name,
			"previous_secret_until",
			frappe.utils.add_to_date(frappe.utils.now_datetime(), hours=-1),
		)
		self.lead()
		later = self.deliveries(connection)[-1]
		with patch.object(webhooks, "_post", return_value=FakeResponse(204)) as post:
			webhooks.deliver(later)
		_, body, headers = post.call_args.args
		self.assertEqual(
			headers["webhook-signature"], webhooks.sign(new, later, headers["webhook-timestamp"], body)
		)

	def test_envelope_timestamp_is_utc(self):
		with patch("crm.integrations.webhooks.get_system_timezone", return_value="America/Mazatlan"):
			self.assertEqual(webhooks.utc_iso("2026-11-06 13:02:41.171421"), "2026-11-06T20:02:41Z")
		with patch("crm.integrations.webhooks.get_system_timezone", return_value="Europe/Berlin"):
			self.assertEqual(webhooks.utc_iso("2026-07-01 12:00:00"), "2026-07-01T10:00:00Z")

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
		self.assertNotIn(
			"CRM Deal",
			{row["name"] for row in api.document_types("deal", user=self.users["outsider"])},
			"the picker offers what the connection's user can read",
		)
		self.assertNotIn("User", {row["name"] for row in api.document_types("user")})

	def test_a_connection_does_not_hear_its_own_changes(self):
		connection = self.connection(["lead.created"])
		frappe.set_user(self.users["admin"])
		self.lead()
		self.assertEqual(self.deliveries(connection), [])
		frappe.set_user("Administrator")
		frappe.db.set_value(webhooks.INTEGRATION, connection.name, "skip_own_changes", 0)
		webhooks.clear_subscriber_cache()  # a raw write skips the form, which clears it
		frappe.set_user(self.users["admin"])
		self.lead()
		self.assertEqual(len(self.deliveries(connection)), 1)

	# ------------------------------------------------------------ cost: filters, batches, storage

	def test_an_update_waits_for_the_chosen_fields_and_says_what_they_were(self):
		connection = self.documents("document.updated", only="status")
		self.assertEqual(connection.subscriptions[0].only_fields, "status")
		todo = frappe.get_doc({"doctype": "ToDo", "description": "Fictional", "status": "Open"}).insert()
		todo.description = "Fictional, reworded"
		todo.save()
		self.assertEqual(self.deliveries(connection), [], "a change to another field is not sent")
		todo.status = "Closed"
		todo.save()
		[name] = self.deliveries(connection, "document.updated")
		row = frappe.get_doc(webhooks.DELIVERY, name)
		change = json.loads(webhooks.build_payload(row, connection))["data"]["change"]
		self.assertEqual((change["fields"], change["previous"]), (["status"], {"status": "Open"}))
		real = events.get_permitted_fields

		def without_status(doctype, *args, **kwargs):
			fields = real(doctype, *args, **kwargs)
			return [f for f in fields if f != "status"] if doctype == "ToDo" else fields

		with patch.object(events, "get_permitted_fields", side_effect=without_status):
			change = json.loads(webhooks.build_payload(row, connection))["data"]["change"]
		self.assertEqual(change["previous"], {}, "an earlier value the user may not read stays out")

	def test_watched_fields_are_checked_and_written_back_clean(self):
		connection = self.documents("document.updated", only=" status,\npriority status ")
		self.assertEqual(connection.subscriptions[0].only_fields, "priority, status")
		with self.assertRaisesRegex(frappe.ValidationError, "no_such_field"):
			self.documents("document.updated", only="status, no_such_field")
		for row in (
			{"event": "document.created", "document_type": "ToDo"},
			{"event": "conversation.updated"},
		):
			connection = frappe.get_doc(
				{
					"doctype": webhooks.INTEGRATION,
					"title": "Fictional",
					"integration_user": self.users["admin"],
					"subscriptions": [{**row, "only_fields": "status"}],
				}
			)
			with self.assertRaisesRegex(frappe.ValidationError, "can wait for chosen fields"):
				connection.insert()
		watchable = {row["event"] for row in webhooks.catalog() if row.get("watches_fields")}
		self.assertEqual(watchable, webhooks.WATCHABLE)

	def test_nobody_listening_costs_no_diff(self):
		lead = self.lead()
		lead.first_name = "Fictional, renamed"
		with patch.object(events, "changed_fields", side_effect=AssertionError("no connection listens")):
			lead.save(ignore_permissions=True)
			todo = frappe.get_doc({"doctype": "ToDo", "description": "Fictional"}).insert()
			todo.description = "Fictional, edited"
			todo.save()

	def test_one_transaction_starts_one_job_per_connection(self):
		connection = self.connection(["lead.created"])
		other = self.connection(["lead.created"])
		self.lead()
		self.lead()
		webhooks._flush_pending()
		calls = [
			c.kwargs
			for c in frappe.enqueue.call_args_list
			if c.args == ("crm.integrations.webhooks.deliver_batch",)
		]
		self.assertEqual(
			sorted(sorted(c["deliveries"]) for c in calls),
			sorted([sorted(self.deliveries(connection)), sorted(self.deliveries(other))]),
		)
		self.assertIsNone(frappe.local.crm_integration_pending)

	def test_a_change_another_transaction_queued_first_still_reaches_the_other_connections(self):
		first = self.connection(["lead.created"])
		other = self.connection(["lead.created"])
		lead = self.lead()
		(kept,) = self.deliveries(first)
		frappe.db.delete(webhooks.DELIVERY, {"integration": other.name})
		# the repeat check runs before the other transaction's row is visible
		with (
			patch.object(frappe, "get_all", return_value=[]),
			patch.object(frappe, "log_error", side_effect=AssertionError("must not fail")),
		):
			queued = webhooks.emit("lead.created", "CRM Lead", lead.name, version="created")
		self.assertEqual(self.deliveries(first), [kept])
		self.assertEqual(queued, self.deliveries(other))
		self.assertEqual(len(queued), 1)

	def test_a_batch_stops_when_the_receiver_fails_and_the_sweep_sends_the_rest(self):
		connection = self.connection(["lead.created"])
		self.lead()
		self.lead()
		first, second = self.deliveries(connection)
		with patch.object(webhooks, "_post", return_value=FakeResponse(503, "busy")) as post:
			webhooks.deliver_batch([first, second])
		self.assertEqual(post.call_count, 1, "a failing receiver gets one attempt per job")
		self.assertEqual(frappe.db.get_value(webhooks.DELIVERY, first, "status"), "Failed")
		self.assertEqual(frappe.db.get_value(webhooks.DELIVERY, second, "status"), "Pending")
		self.assertEqual(
			frappe.db.get_value(webhooks.INTEGRATION, connection.name, "consecutive_failures"), 1
		)
		with patch.object(webhooks, "_post", return_value=FakeResponse(204)) as post:
			webhooks.deliver_batch([first, second])
		self.assertEqual(post.call_count, 1, "the failed one waits for its retry time")
		self.assertEqual(frappe.db.get_value(webhooks.DELIVERY, second, "status"), "Delivered")
		health = frappe.db.get_value(
			webhooks.INTEGRATION,
			connection.name,
			["last_delivery_status", "consecutive_failures"],
			as_dict=True,
		)
		self.assertTrue(health.last_delivery_status.startswith("Delivered"))
		self.assertEqual(health.consecutive_failures, 0)

	def test_a_batch_opens_one_connection_to_the_receiver(self):
		connection = self.connection(["lead.created"])
		self.lead()
		self.lead()
		sent = []

		class Answered(io.RawIOBase):
			"""A short answer with urllib3's bookkeeping: read to the end, its connection can go
			back to the pool; closed before that, the connection is dropped."""

			kept = dropped = 0

			def __init__(self, body):
				self.body, self.held = body, True

			def readable(self):
				return True

			def read(self, size=-1):
				size = len(self.body) if size is None or size < 0 else size
				out, self.body = self.body[:size], self.body[size:]
				return out

			@property
			def closed(self):
				return not self.body

			def release_conn(self):
				if self.held:
					Answered.kept += 1
					self.held = False

			def close(self):
				if self.held:
					Answered.dropped += 1
					self.held = False

		def transport(adapter, request, **kwargs):
			sent.append(request.headers["webhook-id"])
			response = requests.Response()
			response.status_code, response.raw, response.url = 200, Answered(b'{"ok":true}'), request.url
			return response

		with (
			patch("requests.sessions.Session.request", REAL_REQUEST),
			patch("socket.getaddrinfo", return_value=addresses("93.184.215.14")) as dns,
			patch("requests.adapters.HTTPAdapter.send", transport),
		):
			webhooks.deliver_batch(self.deliveries(connection))
		self.assertEqual(sent, self.deliveries(connection))
		self.assertEqual(dns.call_count, 1, "one checked address for the whole job")
		self.assertEqual((Answered.kept, Answered.dropped), (2, 0), "each connection is kept for the next")

	def test_delivered_bodies_are_dropped_after_a_few_days_and_the_row_stays(self):
		connection = self.connection(["lead.created"])
		self.lead()
		name = self.deliveries(connection)[0]
		with patch.object(webhooks, "_post", return_value=FakeResponse(204)):
			webhooks.deliver(name)
		old = frappe.utils.add_days(frappe.utils.now_datetime(), -(webhooks.KEEP_DELIVERED_BODY_DAYS + 1))
		frappe.db.sql("UPDATE `tabCRM Integration Delivery` SET modified=%s WHERE name=%s", (old, name))
		webhooks.purge()
		row = frappe.db.get_value(webhooks.DELIVERY, name, ["status", "payload"], as_dict=True)
		self.assertEqual((row.status, row.payload), ("Delivered", None))

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
		]
		# take keeps the state (Human) and moves the owner: still a status change
		self.assertIn(("take", self.users["agent"]), [(c["action"], c["to_owner"]) for c in changes])
		self.assertNotIn(
			"take",
			[
				json.loads(frappe.db.get_value(webhooks.DELIVERY, n, "context_json"))["action"]
				for n in self.deliveries(connection, "conversation.updated")
			],
		)
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
			with self.subTest(contact=bad), self.assertRaisesRegex(frappe.ValidationError, "contact_id"):
				api.channel_message(bad, "Hola", "mail-" + uuid4().hex[:6])
