"""Department queues, context links, inbound policy and pending-input continuation.

Dedicated lab only: fictional users/accounts inside a savepoint that is always
rolled back; transports, mail and workers are blocked. Adapters from other apps
are replaced by fixtures through the same hook seam CRM uses in production.
"""

import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import frappe

from crm.api import automation as automation_api
from crm.api import automation_departments as departments
from crm.api import automation_policy as policies
from crm.api import conversation_threads as threads
from crm.api import conversations as control
from crm.api import outbox


def _require(*doctypes):
	missing = [dt for dt in doctypes if not frappe.db.exists("DocType", dt)]
	if missing:
		raise unittest.SkipTest("Install/migrate on the isolated lab first: " + ", ".join(missing))


class _Isolated(unittest.TestCase):
	def setUp(self):
		frappe.db.rollback()
		frappe.db.get_value("User", "Administrator", "enabled", for_update=True)
		_require(control.DOCTYPE, control.EVENT, "CRM Automation Policy")
		if not all(frappe.db.has_column(control.DOCTYPE, f) for f in control.METADATA_FIELDS):
			raise unittest.SkipTest("Run the CRM migration for conversation automation fields first.")
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "automation_channels_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.addCleanup(self._restore)
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No external requests"))
		)
		self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("No mail")))
		self.enqueue = self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.prefix = "automation-" + uuid4().hex[:10]

	def _restore(self):
		frappe.set_user("Administrator")
		frappe.flags.meta_webhook_receipt = None
		frappe.db.rollback(save_point=self.point)
		frappe.set_user(self.previous_user)

	def user(self, label, *roles):
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
		).insert()
		return name

	@contextmanager
	def as_user(self, user):
		frappe.set_user(user)
		try:
			yield
		finally:
			frappe.set_user("Administrator")


class TestDepartmentQueues(_Isolated):
	def setUp(self):
		super().setUp()
		_require("WhatsApp Account", "Issue")
		if not frappe.db.exists("Role", "Support Team"):
			raise unittest.SkipTest("The Support Team role is not installed on this site.")
		self.sales = self.user("sales", "Sales User")
		self.support = self.user("support", "Support Team")
		self.shop = None
		if frappe.db.has_column("WhatsApp Account", "doco_shop"):
			self.shop = (
				frappe.get_doc({"doctype": "Social Shop", "shop_name": self.prefix, "enabled": 1})
				.insert()
				.name
			)
			for user in (self.sales, self.support):
				frappe.get_doc(
					{
						"doctype": "User Permission",
						"user": user,
						"allow": "Social Shop",
						"for_value": self.shop,
					}
				).insert()
		self.account_id = "97" + str(int(uuid4().hex[:12], 16))
		frappe.get_doc(
			{
				"doctype": "WhatsApp Account",
				"account_name": self.prefix,
				"phone_id": self.account_id,
				"status": "Active",
				"mode": "Demo",
				"doco_shop": self.shop,
				"is_default_incoming": 0,
				"is_default_outgoing": 0,
			}
		).insert()
		self.doc = control.get_or_create("WhatsApp", self.account_id, "5215550100901")
		self.other = control.get_or_create("WhatsApp", self.account_id, "5215550100902")

	def test_routing_grants_department_eligibility_without_sales_roles(self):
		with self.as_user(self.support):
			with self.assertRaises(frappe.PermissionError):
				control.get_conversation(self.doc.name)
		before = frappe.db.get_value(control.DOCTYPE, self.doc.name, ["generation", "modified"], as_dict=True)
		with self.as_user(self.sales):
			routed = control.route(self.doc.name, "support", 1, "route-" + self.prefix)
			replay = control.route(self.doc.name, "support", 1, "route-" + self.prefix)
		self.assertEqual((routed["department"], routed["generation"]), ("support", 1))
		self.assertTrue(replay["replayed"])
		after = frappe.db.get_value(control.DOCTYPE, self.doc.name, ["generation", "modified"], as_dict=True)
		self.assertEqual(before, after, "routing is not a control change")
		with self.as_user(self.support):
			self.assertEqual(control.get_conversation(self.doc.name)["department"], "support")
			taken = control.apply_control(self.doc.name, "take", 1, "take-" + self.prefix)
			self.assertEqual(taken["human_owner"], self.support)
			with self.assertRaises(frappe.PermissionError):
				control.get_conversation(self.other.name)  # never a sales-wide grant
			with self.assertRaises(frappe.PermissionError):
				threads.list_threads("WhatsApp", self.account_id)
			queue = automation_api.list_queue("support")
			item = next(item for item in queue["items"] if item["name"] == self.doc.name)
			self.assertEqual(
				(item["state"], item["next_action"], item["department"]), ("Mine", "reply", "support")
			)
			self.assertNotIn(self.other.name, [row["name"] for row in queue["items"]])
		self.assertIn("Support Team", departments.member_roles())

	def test_hr_is_never_a_customer_queue(self):
		with self.as_user(self.sales), self.assertRaises(frappe.ValidationError):
			control.route(self.doc.name, "hr", 1, "hr-" + self.prefix)

	def test_owned_conversation_routes_only_by_owner_or_manager(self):
		with self.as_user(self.sales):
			control.apply_control(self.doc.name, "take", 1, "take-" + self.prefix)
		second = self.user("second", "Sales User")
		if self.shop:
			frappe.get_doc(
				{"doctype": "User Permission", "user": second, "allow": "Social Shop", "for_value": self.shop}
			).insert()
		with self.as_user(second), self.assertRaises(frappe.PermissionError):
			control.route(self.doc.name, "support", 2, "steal-" + self.prefix)

	def test_department_record_link_replaces_unreadable_sales_reference(self):
		from crm.api.inquiries import create_inquiry

		inquiry = create_inquiry(
			{
				"title": "Fictional inquiry " + self.prefix,
				"source_type": "Manual",
				"people": [],
				"client_request_id": self.prefix,
			}
		)
		referenced = control.get_or_create(
			"WhatsApp",
			self.account_id,
			"5215550100903",
			reference_doctype="CRM Inquiry",
			reference_name=inquiry["name"],
		)
		control.route(referenced.name, "support", 1, "route-ref-" + self.prefix)
		with self.as_user(self.support), self.assertRaises(frappe.PermissionError):
			control.get_conversation(referenced.name)
		issue = frappe.get_doc(
			{"doctype": "Issue", "subject": "Fictional support case " + self.prefix}
		).insert()
		control.link_record(referenced.name, "Issue", issue.name, "link-" + self.prefix)
		with self.assertRaises(frappe.ValidationError):
			control.link_record(referenced.name, "User", "Administrator", "link-user-" + self.prefix)
		with self.as_user(self.support):
			self.assertEqual(control.get_conversation(referenced.name)["name"], referenced.name)
			links = control.context_view(control._load(referenced.name))
			self.assertEqual([(link["doctype"], link["name"]) for link in links], [("Issue", issue.name)])
			self.assertTrue(links[0]["url"].startswith("/app/issue/"))
		control.link_record(referenced.name, "Issue", issue.name, "unlink-" + self.prefix, remove=True)
		with self.as_user(self.support), self.assertRaises(frappe.PermissionError):
			control.get_conversation(referenced.name)


class TestInboundPolicy(_Isolated):
	def setUp(self):
		super().setUp()
		_require("WhatsApp Account")
		self.account_id = "96" + str(int(uuid4().hex[:12], 16))
		frappe.get_doc(
			{
				"doctype": "WhatsApp Account",
				"account_name": self.prefix,
				"phone_id": self.account_id,
				"status": "Active",
				"mode": "Demo",
				"is_default_incoming": 0,
				"is_default_outgoing": 0,
			}
		).insert()
		self.doc = control.get_or_create("WhatsApp", self.account_id, "5215550100911")

	def test_policy_is_service_owned_reviewed_and_manager_only(self):
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				{
					"doctype": policies.DOCTYPE,
					"title": "Forged",
					"provider": "WhatsApp",
					"account_id": self.account_id,
					"flow": "x",
					"status": "Published",
					"revision": 1,
					"cooldown_minutes": 0,
				}
			).insert(ignore_permissions=True)
		policy = policies.save_policy(
			{
				"title": "Fictional inbound",
				"provider": "WhatsApp",
				"account_id": self.account_id,
				"flow": "Fictional missing flow",
				"department": "support",
			}
		)
		self.assertEqual((policy["status"], policy["revision"]), ("Draft", 1))
		reviewed = policies.review_policy(policy["name"])["review"]
		self.assertTrue(reviewed["blockers"])
		with self.assertRaises(frappe.ValidationError):
			policies.publish_policy(policy["name"], 1, reviewed["review_hash"], "Fictional approval")
		self.assertIsNone(policies.published_for("WhatsApp", self.account_id))
		self.assertEqual(policies.pause_policy(policy["name"])["status"], "Draft")
		with self.as_user(self.user("seller", "Sales User")), self.assertRaises(frappe.PermissionError):
			policies.save_policy(
				{"title": "Seller policy", "provider": "WhatsApp", "account_id": self.account_id, "flow": "x"}
			)
		with self.assertRaises(frappe.TimestampMismatchError):
			policies.save_policy({"cooldown_minutes": 5}, policy["name"], expected_revision=7)

	def test_policy_grant_requires_trusted_ingress_and_published_policy(self):
		for command in ("manual:1", "inbound:meta:" + "a" * 64, "inbound:webchat:missing"):
			with self.subTest(command=command), self.assertRaises(frappe.PermissionError):
				control.begin_policy_bot(
					self.doc.name, 1, command, run_name="fictional-run", policy_name="fictional"
				)
		self.assertEqual(control._load(self.doc.name).control_state, "Human")

	def test_customer_message_without_claimed_receipt_is_refused(self):
		with self.assertRaises(frappe.PermissionError):
			control.internal_customer_message(
				"WhatsApp", self.account_id, "5215550100911", receipt_name="b" * 64, text="hola"
			)


class TestWebchatContinuation(_Isolated):
	"""Real capability-bound visitor sends; the Chatflow adapter is a fixture."""

	def setUp(self):
		super().setUp()
		_require("CRM Webchat Channel", "CRM Webchat Session", "CRM Webchat Message", "Chatflow Run")
		from crm.api import webchat

		self.webchat = webchat
		self.enterContext(patch.object(webchat, "_rate"))
		self.channel = webchat.configure_channel(
			label="Fictional Webchat",
			profile="fictional-" + uuid4().hex,
			public_origin="https://fictional.example.invalid",
			enabled=1,
		)
		self.capability = self.rpc("bootstrap", channel_id=self.channel["account_id"])["capability"]
		self.send("hola", "first-" + self.prefix)
		session = frappe.get_doc(webchat.SESSION, {"capability_hash": webchat._hash(self.capability)})
		self.name = control.conversation_key("Webchat", session.channel, session.peer_id)
		frappe.db.set_value(
			control.DOCTYPE,
			self.name,
			{"control_state": "Bot", "bot_enabled": 1, "human_owner": None},
			update_modified=False,
		)
		self.adapter = SimpleNamespace()
		self.enterContext(patch.object(outbox, "bot_adapter", return_value=self.adapter))

	@contextmanager
	def request(self, body, endpoint, capability=None):
		import json

		from werkzeug.test import EnvironBuilder
		from werkzeug.wrappers import Request

		request = Request(
			EnvironBuilder(
				path="/api/method/crm.api.webchat." + endpoint,
				method="POST",
				headers={"Authorization": "Bearer " + capability} if capability else {},
				data=json.dumps(body).encode(),
				content_type="application/json",
				environ_base={"REMOTE_ADDR": "192.0.2.89"},
			).get_environ()
		)
		with (
			patch.object(frappe.local, "request", request, create=True),
			patch.object(frappe.local, "form_dict", frappe._dict(body), create=True),
			patch.object(frappe.local, "response_headers", {}, create=True),
			patch.object(frappe.local, "session", frappe._dict(user="Guest")),
			patch.object(frappe.local, "webchat_authority", None, create=True),
		):
			yield request

	def rpc(self, method, **arguments):
		capability = arguments.pop("capability", None)
		with self.request(arguments, method, capability):
			self.webchat.prepare_request()
			return getattr(self.webchat, method)(**arguments)

	def send(self, text, request_id):
		return self.rpc(
			"send",
			capability=self.capability,
			channel_id=self.channel["account_id"],
			text=text,
			request_id=request_id,
		)

	def test_unmatched_reply_keeps_human_fallback_and_routes_flow_department(self):
		self.adapter.accept_customer_input = lambda doc, evidence: {
			"accepted": False,
			"reason_code": "customer_requested_person",
			"department": "support",
		}
		generation = control._load(self.name).generation
		self.send("quiero hablar con un asesor", "second-" + self.prefix)
		doc = control._load(self.name)
		self.assertEqual(
			(doc.control_state, doc.bot_enabled, doc.department, doc.automation_state),
			("Human", 0, "support", "Handed off"),
		)
		self.assertEqual(doc.generation, generation + 1)
		events = frappe.get_all(
			control.EVENT,
			filters={"conversation": self.name, "action": "customer_reply"},
			fields=["reason", "result_json"],
			order_by="creation desc",
			limit=1,
		)
		self.assertEqual(events[0].reason, "webchat_customer_held_bot")
		self.assertIn("customer_requested_person", events[0].result_json)

	def test_accepted_input_keeps_bot_only_for_the_run_holding_the_grant(self):
		marker = "Fictional adapter write " + self.prefix

		def accept(doc, evidence):
			frappe.get_doc({"doctype": "ToDo", "description": marker}).insert(ignore_permissions=True)
			return {"accepted": True, "run": "fictional-run", "node": "topic"}

		self.adapter.accept_customer_input = accept
		# No grant event names this run: the adapter's writes are rolled back and people take over.
		self.send("1", "third-" + self.prefix)
		self.assertEqual(control._load(self.name).control_state, "Human")
		self.assertFalse(frappe.db.exists("ToDo", {"description": marker}))
		# With the exact grant, the reply continues the run and control is unchanged.
		frappe.db.set_value(
			control.DOCTYPE, self.name, {"control_state": "Bot", "bot_enabled": 1}, update_modified=False
		)
		generation = control._load(self.name).generation
		with patch.object(control, "_assert_bot_grant") as grant:
			self.send("1", "fourth-" + self.prefix)
		grant.assert_called_once()
		doc = control._load(self.name)
		self.assertEqual((doc.control_state, doc.generation), ("Bot", generation))
		self.assertTrue(frappe.db.exists("ToDo", {"description": marker}))

	def test_policy_start_failure_never_loses_the_customer_message(self):
		frappe.db.set_value(
			control.DOCTYPE, self.name, {"control_state": "Human", "bot_enabled": 0}, update_modified=False
		)
		self.adapter.start_policy_run = lambda *args: (_ for _ in ()).throw(
			RuntimeError("fictional start failure")
		)
		fake = SimpleNamespace(name="fictional-policy")
		with (
			patch.object(policies, "published_for", return_value=fake),
			patch.object(policies, "grant_reason", return_value=None),
			patch.object(policies, "cooldown_reason", return_value=None),
		):
			result = self.send("hola de nuevo", "fifth-" + self.prefix)
		self.assertFalse(result["replayed"])
		self.assertEqual(control._load(self.name).control_state, "Human")


class TestHookedChannels(_Isolated):
	def test_hooked_transport_requires_exactly_one_installed_adapter(self):
		with patch.object(frappe, "get_hooks", return_value={}):
			self.assertIsNone(outbox.channel_adapter("Messenger"))
			self.assertFalse(outbox.automation_ready("Messenger"))
			self.assertFalse(outbox.channel_send_ready("Instagram"))
		with patch.object(
			frappe, "get_hooks", return_value={"Messenger": ["frappe.utils", "frappe.utils.data"]}
		):
			self.assertIsNone(outbox.channel_adapter("Messenger"))
		with patch.object(frappe, "get_hooks", return_value={"Messenger": ["frappe.utils"]}):
			self.assertIsNotNone(outbox.channel_adapter("Messenger"))
			self.assertIsNone(outbox.channel_adapter("WhatsApp"))


def run_native():
	"""Bounded lab runner: `bench --site <lab> execute crm.tests.test_automation_channels.run_native`.

	Each test rolls back its own savepoint; the final rollback leaves nothing
	for bench's closing commit. No test-record bootstrapping is triggered.
	"""
	import sys

	if not (frappe.local.site or "").endswith(".lab.xoloitzcuintles.com"):
		raise RuntimeError("Dedicated lab only")
	suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
	try:
		with patch.object(frappe.db, "commit"):
			result = unittest.TextTestRunner(verbosity=2).run(suite)
	finally:
		frappe.db.rollback()
	return {
		"ran": result.testsRun,
		"failures": len(result.failures),
		"errors": len(result.errors),
		"skipped": len(result.skipped),
	}
