"""Native order proof → existing conversation context, without money effects."""

import json
import sys
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from crm.api import automation, conversation_threads, webchat
from crm.api import conversations as control
from crm.tests import test_webchat as protocol
from crm.tests.companion import fixture, skip_if_missing

OrderCheckoutFixture, MISSING_CHECKOUT = fixture(
	"doco.docoutils.test_order_checkout_native", "OrderCheckoutFixture"
)


@skip_if_missing(MISSING_CHECKOUT)
class TestStorefrontSupport(OrderCheckoutFixture, IntegrationTestCase):
	request = protocol.TestWebchat.request
	rpc = protocol.TestWebchat.rpc
	failure = protocol.TestWebchat.failure
	session = protocol.TestWebchat.session
	conversation = protocol.TestWebchat.conversation

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Canonical schema setup owns DDL/commits, before any per-test savepoint.
		# Fresh Doco installs may only carry Meta's Item publication flag.
		from doco.docoutils import storefront_schema

		if not storefront_schema.schema_ok():
			result = storefront_schema.ensure(force=True, repair=True)
			if result.get("failed") or not storefront_schema.schema_ok():
				raise RuntimeError("Storefront schema setup is incomplete")

	def setUp(self):
		super().setUp()
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("No mail")))
		self.enterContext(patch("frappe.enqueue", side_effect=AssertionError("No queue")))
		self.enterContext(patch.object(webchat, "_rate"))
		self.shop = frappe.get_doc(
			{
				"doctype": "Storefront Profile",
				"storefront_name": "Support " + self.tag,
				"company": self.company.name,
				"enabled": 1,
				"webshop_enabled": 0,
			}
		).insert()
		self.channel = webchat.configure_channel(
			label="Order support",
			profile=self.shop.name,
			public_origin="https://fictional.example.invalid",
			enabled=1,
		)
		self.capability = self.rpc("bootstrap", channel_id=self.channel["account_id"])["capability"]
		self.order = self.make_order()
		self.token = frappe.generate_hash(length=36)
		self.order.update(
			{
				"is_storefront_order": 1,
				"storefront_order_token": self.token,
				"storefront_profile": self.shop.name,
			}
		)
		self.order.save()

	def share(self, **overrides):
		return self.rpc(
			"share_order",
			**{
				"capability": self.capability,
				"channel_id": self.channel["account_id"],
				"order_token": self.token,
				**overrides,
			},
		)

	def test_ordinary_profile_save_does_not_commit_the_order_transaction(self):
		with patch.object(frappe.db, "commit", side_effect=AssertionError("Profile save committed")):
			self.shop.save()
		self.assertEqual(self.order.reload().storefront_profile, self.shop.name)

	def staff(self, company=None):
		"""Real channel-assigned Sales User; no permission result is mocked."""
		# Native User setup schedules contact creation. Isolate only this fixture
		# step; the strict enqueue guard remains active for every support action.
		with patch("frappe.enqueue") as fixture_jobs:
			actor = frappe.get_doc(
				{
					"doctype": "User",
					"email": f"support-{uuid4().hex}@example.invalid",
					"first_name": "Order support",
					"send_welcome_email": 0,
					"roles": [{"role": "Sales User"}],
				}
			).insert()
		for call in fixture_jobs.call_args_list:
			self.assertEqual(call.args[0], "frappe.core.doctype.user.user.create_contact")
		for allow, value in (
			("CRM Webchat Channel", self.session().channel),
			("Company", company or self.company.name),
		):
			frappe.get_doc(
				{"doctype": "User Permission", "user": actor.name, "allow": allow, "for_value": value}
			).insert()
		self.addCleanup(lambda: frappe.clear_cache(user=actor.name))
		return actor.name

	def test_explicit_share_replay_and_inquiry_preserve_order_and_identity(self):
		before = {
			dt: frappe.db.count(dt)
			for dt in (
				"Sales Order",
				"Sales Invoice",
				"Payment Entry",
				"Payment Request",
				"Customer",
				"Contact",
				"CRM Deal",
				"CRM Lead",
			)
		}
		order_before = self.order.reload().as_dict()
		self.assertEqual(self.share(), {"shared": True, "replayed": False})
		self.assertEqual(self.share(), {"shared": True, "replayed": True})
		doc = frappe.get_doc(control.DOCTYPE, self.conversation())
		self.assertEqual((doc.control_state, doc.bot_enabled, doc.generation), ("Human", 0, 1))
		self.assertFalse(doc.reference_doctype or doc.reference_name or doc.human_owner or doc.department)
		links = json.loads(doc.context_links)
		self.assertEqual(len(links), 1)
		self.assertEqual((links[0]["doctype"], links[0]["name"]), ("Sales Order", self.order.name))
		self.assertEqual(links[0]["source"], "storefront_order_proof")
		self.assertFalse(frappe.db.exists(webchat.MESSAGE, {"conversation": doc.name}))
		self.rpc(
			"send",
			capability=self.capability,
			channel_id=doc.account_id,
			request_id=uuid4().hex,
			text="Necesito ayuda con mi pedido.",
		)
		self.assertEqual(frappe.db.count(webchat.MESSAGE, {"conversation": doc.name}), 1)
		self.assertEqual(self.order.reload().as_dict(), order_before)
		self.assertEqual(before, {dt: frappe.db.count(dt) for dt in before})
		self.assertEqual(
			frappe.db.count(control.EVENT, {"conversation": doc.name, "action": "storefront_order_share"}), 1
		)
		for event in frappe.get_all(control.EVENT, filters={"conversation": doc.name}, fields=["*"]):
			self.assertNotIn(self.token, json.dumps(event, default=str))
			self.assertNotIn(self.capability, json.dumps(event, default=str))

	def test_foreign_profile_and_company_cannot_attach(self):
		for changes in (
			{"storefront_profile": "Foreign shop"},
			{"company": "Foreign company"},
			{"is_storefront_order": 0},
		):
			with self.subTest(changes=changes):
				frappe.db.set_value("Sales Order", self.order.name, changes)
				self.failure(417, self.share)
				self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))
				frappe.db.set_value(
					"Sales Order",
					self.order.name,
					{
						"storefront_profile": self.shop.name,
						"company": self.company.name,
						"is_storefront_order": 1,
					},
				)

	def test_missing_unknown_malformed_token_has_no_context_effect(self):
		for token in (None, 123, "", "x" * 35, "x" * 37, "../" * 12, uuid4().hex + "abcd"):
			with self.subTest(token_type=type(token).__name__):
				self.failure(417, lambda: self.share(order_token=token))
		self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))

	def test_disabled_profile_and_rotated_proof_fail_on_replay(self):
		self.share()
		frappe.db.set_value("Storefront Profile", self.shop.name, "enabled", 0)
		self.failure(417, self.share)
		frappe.db.set_value("Storefront Profile", self.shop.name, "enabled", 1)
		frappe.db.set_value(
			"Sales Order", self.order.name, "storefront_order_token", frappe.generate_hash(length=36)
		)
		self.failure(417, self.share)

	def test_expired_revoked_and_wrong_channel_have_no_effect(self):
		with patch.object(webchat, "now_datetime", return_value=self.session().expires_at):
			self.failure(403, self.share)
		other = webchat.configure_channel(
			label="Other", profile=self.shop.name, public_origin="https://other.example.invalid", enabled=1
		)
		self.failure(403, lambda: self.share(channel_id=other["account_id"]))
		self.rpc("revoke", capability=self.capability, channel_id=self.channel["account_id"])
		self.failure(403, self.share)
		self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))

	def test_paused_bot_control_and_staff_unlink_are_preserved(self):
		session = self.session()
		doc = control.get_or_create("Webchat", session.channel, session.peer_id)
		frappe.db.set_value(control.DOCTYPE, doc.name, {"control_state": "Paused", "generation": 9})
		self.share()
		self.assertEqual((doc.reload().control_state, doc.generation), ("Paused", 9))
		frappe.set_user(self.staff())
		automation.unlink_record(doc.name, "Sales Order", self.order.name, uuid4().hex)
		self.failure(417, self.share)
		self.assertEqual(json.loads(doc.reload().context_links), [])

	def test_closed_new_share_refused_existing_receipt_can_be_read(self):
		session = self.session()
		doc = control.get_or_create("Webchat", session.channel, session.peer_id)
		frappe.db.set_value(control.DOCTYPE, doc.name, "control_state", "Closed")
		self.failure(417, self.share)
		frappe.db.set_value(control.DOCTYPE, doc.name, "control_state", "Human")
		self.share()
		frappe.db.set_value(control.DOCTYPE, doc.name, "control_state", "Closed")
		self.assertTrue(self.share()["replayed"])

	def test_cancelled_order_remains_shareable_without_reactivation(self):
		frappe.db.set_value("Sales Order", self.order.name, {"docstatus": 2, "status": "Cancelled"})
		self.assertTrue(self.share()["shared"])
		self.assertEqual(self.order.reload().docstatus, 2)

	def test_staff_projection_still_requires_native_order_permission(self):
		self.share()
		doc = frappe.get_doc(control.DOCTYPE, self.conversation())
		other_company = frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": "Other support " + self.tag,
				"abbr": "S" + self.tag[:5].upper(),
				"default_currency": "MXN",
				"country": "Mexico",
				"chart_of_accounts": "Standard",
			}
		).insert()
		denied, allowed = self.staff(other_company.name), self.staff()
		frappe.set_user(denied)
		control._authorize(doc)  # Channel access does not lend Sales Order access.
		self.assertFalse(frappe.has_permission("Sales Order", "read", doc=self.order))
		self.assertEqual(control.context_view(doc), [])
		self.assertEqual(conversation_threads._detail(doc)["context_links"], [])
		frappe.set_user(allowed)
		control._authorize(doc)
		self.assertTrue(frappe.has_permission("Sales Order", "read", doc=self.order))
		links = control.context_view(doc)
		self.assertEqual([row["name"] for row in links], [self.order.name])
		self.assertEqual(conversation_threads._detail(doc)["context_links"], links)

	def test_guest_proof_never_labels_customer_or_supplies_staff_authority(self):
		self.share()
		doc = frappe.get_doc(control.DOCTYPE, self.conversation())
		title = frappe.get_meta("Sales Order").get_title_field()
		self.assertTrue(self.order.get(title) and self.order.get(title) != self.order.name)
		frappe.set_user(self.staff())
		self.assertTrue(frappe.has_permission("Sales Order", "read", doc=self.order))
		links = control.context_view(doc)
		self.assertEqual(links[0]["label"], self.order.name)
		self.assertEqual(links[0]["source"], "storefront_order_proof")
		self.assertFalse(control._department_record(doc, frappe.session.user, "sales"))

	def test_context_label_respects_native_title_field_mask(self):
		self.share()
		doc = frappe.get_doc(control.DOCTYPE, self.conversation())
		# Ordinary staff links may use a title, but still honor native masking.
		links = json.loads(doc.context_links)
		links[0]["source"] = "person"
		doc.context_links = json.dumps(links)
		title = frappe.get_meta("Sales Order").get_title_field()
		self.assertTrue(title and title != "name", "ERP Sales Order must supply its native title field")
		make_property_setter("Sales Order", title, "mask", 1, "Check")
		self.permission_doctypes.append("Sales Order")
		frappe.clear_cache(doctype="Sales Order")
		frappe.set_user(self.staff())
		links = control.context_view(doc)
		self.assertEqual(links[0]["label"], self.order.name)

	def test_older_doco_without_adapter_refuses_before_any_context_effect(self):
		with patch.dict(sys.modules, {"doco.docoutils.storefront.support_context": None}):
			self.failure(417, self.share)
		self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))
		self.assertTrue(self.share()["shared"])

	def test_busy_fence_keeps_retryable_outcome_and_original_receipt(self):
		self.share()
		with patch.object(control, "conversation_fence", side_effect=frappe.TimestampMismatchError):
			self.assertEqual(self.failure(503, self.share)["reason"], "conflict_retry")
		self.assertTrue(self.share()["replayed"])
		self.assertEqual(
			frappe.db.count(
				control.EVENT, {"conversation": self.conversation(), "action": "storefront_order_share"}
			),
			1,
		)

	def test_exact_request_shape_and_post_only(self):
		body = {"channel_id": self.channel["account_id"], "order_token": self.token}
		for raw in (
			json.dumps({**body, "profile": self.shop.name}),
			json.dumps(body)[:-1] + ',"order_token":"' + self.token + '"}',
		):
			with self.request(body, raw=raw.encode(), endpoint="share_order", capability=self.capability):
				webchat.prepare_request()
				self.failure(417, lambda: webchat.share_order(**body))
		with self.request(body, endpoint="share_order", method="GET", capability=self.capability):
			self.failure(417, webchat.prepare_request)
		self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))
