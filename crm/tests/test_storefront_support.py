"""Native order proof → existing conversation context, without money effects."""

import json
from unittest.mock import patch
from uuid import uuid4

import frappe
from doco.docoutils.test_order_checkout_native import OrderCheckoutFixture
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from crm.api import conversations as control
from crm.api import webchat
from crm.tests import test_webchat as protocol


class TestStorefrontSupport(OrderCheckoutFixture, IntegrationTestCase):
	request = protocol.TestWebchat.request
	rpc = protocol.TestWebchat.rpc
	failure = protocol.TestWebchat.failure
	session = protocol.TestWebchat.session
	conversation = protocol.TestWebchat.conversation

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
		order_before = self.order.as_dict()
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
		control.link_record(doc.name, "Sales Order", self.order.name, uuid4().hex, remove=True)
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
		self.assertTrue(any(row["name"] == self.order.name for row in control.context_view(doc)))
		self.assertEqual(control.context_view(doc, user="Guest"), [])

	def test_context_label_respects_native_title_field_mask(self):
		self.share()
		doc = frappe.get_doc(control.DOCTYPE, self.conversation())
		title = frappe.get_meta("Sales Order").get_title_field()
		self.assertTrue(title and title != "name", "ERP Sales Order must supply its native title field")
		make_property_setter("Sales Order", title, "mask", 1, "Check")
		self.permission_doctypes.append("Sales Order")
		frappe.clear_cache(doctype="Sales Order")
		links = control.context_view(doc)
		self.assertEqual(links[0]["label"], self.order.name)

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
