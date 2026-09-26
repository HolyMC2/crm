"""Catalog governance through native SQL and the actual catalog adapter.

Isolated full-graph suite. Item eligibility is never mocked. Provider responses
and processed-receipt evidence are controlled doubles; no network effects or
real commit/fence-concurrency claim is made by these transaction fixtures.
"""

import hashlib
import json
import time
import unittest
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import frappe
from doco_meta_catalog.tests.test_commerce import CatalogFixture
from frappe.utils import now_datetime
from frappe_whatsapp import native_outbox
from frappe_whatsapp.webhook_receipts import record_events

from crm.api import catalog_commerce, conversations, outbox, outbox_delivery


class TestCatalogOutbox(CatalogFixture, unittest.TestCase):
	def queue(self, request_id=None, generation=2, **selection):
		return catalog_commerce.queue_catalog(
			self.conversation.name, generation, request_id or uuid4().hex, **self.selection(**selection)
		)

	def worker(self, name):
		# Native SQL/state transitions; transaction checkpoints stay inside the test savepoint.
		with patch.object(frappe.db, "rollback"):
			outbox.dispatch_intent(name)

	def accepted(self, name):
		def provider(intent_name, payload):
			outbox.require_dispatch(
				intent_name, "WhatsApp", self.account.phone_id, self.peer, payload=payload
			)
			return {"state": "Accepted", "provider_message_id": "wamid.catalog-" + uuid4().hex}

		with patch.object(native_outbox, "send_frozen", side_effect=provider) as send:
			self.worker(name)
		send.assert_called_once()
		intent = outbox._load(name)
		self.assertEqual(intent.state, "Accepted")
		return intent

	def assert_blocked_before_provider(self, name, reason):
		with patch.object(
			native_outbox, "send_frozen", side_effect=AssertionError("Provider reached")
		) as send:
			self.worker(name)
		send.assert_not_called()
		intent = outbox._load(name)
		self.assertEqual((intent.state, intent.reason_code), ("Blocked", reason))

	def test_catalog_and_text_request_namespaces_are_distinct(self):
		request = uuid4().hex
		text = outbox.queue_message(self.conversation.name, 2, request, {"type": "text", "text": "Reply"})
		catalog = self.queue(request_id=request)
		self.assertNotEqual(text["name"], catalog["name"])
		self.assertEqual(frappe.db.count(outbox.DOCTYPE, {"conversation": self.conversation.name}), 2)

	def test_exact_request_replay_creates_one_intent_and_one_provider_attempt(self):
		request = uuid4().hex
		first = self.queue(request_id=request)
		self.assertEqual(self.queue(request_id=request)["name"], first["name"])
		self.accepted(first["name"])
		self.assertEqual(self.queue(request_id=request)["state"], "Accepted")
		with patch.object(native_outbox, "send_frozen") as send:
			self.worker(first["name"])
		send.assert_not_called()
		self.assertEqual(frappe.db.count(outbox.DOCTYPE, {"conversation": self.conversation.name}), 1)
		with self.assertRaises(frappe.ValidationError):
			self.queue(request_id=request, body="Different message")

	def test_exact_replay_survives_current_unpublication_and_missing_adapter(self):
		request = uuid4().hex
		name = self.queue(request_id=request)["name"]
		self.accepted(name)
		frappe.db.set_value("Item", self.item.name, "publish_on_web", 0)
		with patch.object(catalog_commerce, "adapter", return_value=None):
			replay = self.queue(request_id=request)
		self.assertEqual((replay["name"], replay["state"]), (name, "Accepted"))

	def test_stale_generation_and_non_owner_cannot_create_catalog_intent(self):
		with self.assertRaises(frappe.TimestampMismatchError):
			self.queue(generation=1)
		other = frappe.get_doc(
			{
				"doctype": "User",
				"email": "catalog-owner-" + self.key + "@example.invalid",
				"first_name": "Catalog owner",
				"send_welcome_email": 0,
				"roles": [{"role": "System Manager"}],
			}
		).insert()
		conversations.apply_control(self.conversation.name, "transfer", 2, uuid4().hex, owner=other.name)
		with self.assertRaises(frappe.PermissionError):
			self.queue(generation=3)
		self.assertEqual(frappe.db.count(outbox.DOCTYPE, {"conversation": self.conversation.name}), 0)

	def test_unavailable_adapter_is_explicit_and_new_request_fails(self):
		with patch.object(catalog_commerce, "adapter", return_value=None):
			context = catalog_commerce.get_context(self.conversation.name)
			self.assertEqual((context["available"], context["reason_code"]), (False, "adapter_unavailable"))
			self.assertFalse(any(context["capabilities"].values()))
			with self.assertRaises(frappe.ValidationError):
				self.queue()

	def test_control_generation_change_cancels_before_catalog_transport(self):
		name = self.queue()["name"]
		conversations.apply_control(self.conversation.name, "release", 2, uuid4().hex)
		with patch.object(native_outbox, "send_frozen") as send:
			self.worker(name)
		send.assert_not_called()
		intent = outbox._load(name)
		self.assertEqual((intent.state, intent.reason_code), ("Cancelled", "conversation_changed"))

	def test_unpublished_item_blocks_native_dispatch(self):
		name = self.queue()["name"]
		frappe.db.set_value("Item", self.item.name, "publish_on_web", 0)
		self.assert_blocked_before_provider(name, "catalog_item_unavailable")

	def test_changed_catalog_blocks_native_dispatch(self):
		name = self.queue()["name"]
		frappe.db.set_single_value("Meta Catalog Settings", "catalog_id", "9900098765")
		self.assert_blocked_before_provider(name, "catalog_configuration_changed")

	def test_missing_adapter_blocks_native_dispatch(self):
		name = self.queue()["name"]
		with patch.object(catalog_commerce, "adapter", return_value=None):
			self.assert_blocked_before_provider(name, "catalog_adapter_unavailable")

	def test_expired_service_window_blocks_catalog_even_when_item_is_available(self):
		name = self.queue()["name"]
		frappe.db.set_value("Meta Webhook Receipt", self.inbound_name, "state", "Failed")
		self.inbound(timestamp=int(time.time()) - 86401)
		self.assert_blocked_before_provider(name, "customer_window_unverified")

	def test_gateway_guard_rechecks_item_and_binding_after_worker_eligibility(self):
		other = self.new_account()
		for field, value in (
			("publish_on_web", 0),
			("catalog_id", "9900098765"),
			("whatsapp_account", other.name),
		):
			with self.subTest(field=field):
				name = self.queue()["name"]

				def provider(intent_name, payload):
					if field == "publish_on_web":
						frappe.db.set_value("Item", self.item.name, field, value)
					else:
						frappe.db.set_single_value("Meta Catalog Settings", field, value)
					with self.assertRaises(frappe.PermissionError):
						outbox.require_dispatch(
							intent_name, "WhatsApp", self.account.phone_id, self.peer, payload=payload
						)
					return {"state": "Blocked", "reason_code": "catalog_changed_before_http"}

				with patch.object(native_outbox, "send_frozen", side_effect=provider):
					self.worker(name)
				self.assertEqual(outbox._load(name).state, "Blocked")
				frappe.db.set_value("Item", self.item.name, "publish_on_web", 1)
				frappe.db.set_single_value(
					"Meta Catalog Settings",
					{"catalog_id": "9900012345", "whatsapp_account": self.account.name},
				)

	def test_uncertain_provider_outcome_is_unknown_and_never_retryable(self):
		name = self.queue()["name"]
		with patch.object(native_outbox, "send_frozen", side_effect=TimeoutError("Response lost")) as send:
			self.worker(name)
			self.worker(name)
		send.assert_called_once()
		self.assertEqual(outbox._load(name).state, "Unknown")
		self.assertFalse(outbox.get_intent(name)["can_retry"])
		with self.assertRaises(frappe.ValidationError):
			outbox.retry_intent(name)

	def receipt(self, intent, *, account_id=None, app_id=None):
		entry = {
			"id": intent.provider_message_id,
			"status": "delivered",
			"recipient_id": self.peer,
			"timestamp": str(int(time.time())),
		}
		phone_id = account_id or self.account.phone_id
		name = record_events(
			[
				{
					"provider": "WhatsApp",
					"account_id": phone_id,
					"app_id": app_id or self.account.app_id,
					"event_type": "status",
					"event_id": conversations._digest([entry["id"], entry["status"], entry["timestamp"]]),
					"payload": {
						"business_id": self.account.business_id,
						"change": {
							"field": "messages",
							"value": {
								"messaging_product": "whatsapp",
								"metadata": {"phone_number_id": phone_id},
								"statuses": [entry],
							},
						},
					},
				}
			]
		)[0]
		frappe.db.set_value(
			"Meta Webhook Receipt",
			name,
			{
				"state": "Processing",
				"attempts": 1,
				"lease_until": now_datetime() + timedelta(minutes=5),
			},
		)
		return name

	def fold(self, receipt):
		before = frappe.flags.get("meta_webhook_receipt")
		frappe.flags.meta_webhook_receipt = receipt
		try:
			return outbox_delivery.apply_delivery_receipt(receipt)
		finally:
			frappe.flags.meta_webhook_receipt = before

	def test_delivery_evidence_survives_later_catalog_and_item_changes(self):
		intent = self.accepted(self.queue()["name"])
		frappe.db.set_value("Item", self.item.name, "publish_on_web", 0)
		frappe.db.set_single_value("Meta Catalog Settings", {"catalog_id": "9900098765", "enabled": 0})
		with patch.object(catalog_commerce, "adapter", return_value=None):
			result = self.fold(self.receipt(intent))
		self.assertEqual((result["matched"], result["intent_state"]), (True, "Delivered"))

	def test_delivery_rejects_wrong_account_app_and_current_app_rebinding(self):
		intent = self.accepted(self.queue()["name"])
		for kwargs in ({"account_id": "9900000000"}, {"app_id": "9909999"}):
			with self.subTest(kwargs=kwargs), self.assertRaises(outbox_delivery.DeliveryError):
				self.fold(self.receipt(intent, **kwargs))
		frappe.db.set_value("WhatsApp Account", self.account.name, "app_id", "9909999")
		with self.assertRaises(outbox_delivery.DeliveryError):
			self.fold(self.receipt(intent, app_id="9909999"))
		self.assertEqual(outbox._load(intent.name).state, "Accepted")

	def test_existing_text_intent_fingerprint_contract_does_not_change(self):
		name = outbox.queue_message(
			self.conversation.name, 2, uuid4().hex, {"type": "text", "text": "Old text"}
		)["name"]
		intent = outbox._load(name)
		# Explicit pre-catalog field order is an external compatibility fixture, not
		# a re-export of IMMUTABLE which would silently bless a breaking addition.
		fields = (
			"action_key",
			"conversation",
			"conversation_generation",
			"provider",
			"account_id",
			"peer_id",
			"actor_user",
			"origin",
			"purpose",
			"source_doctype",
			"source_name",
			"source_action",
			"run_name",
			"payload",
		)
		body = json.dumps(
			[intent.get(field) or None for field in fields],
			ensure_ascii=False,
			sort_keys=True,
			separators=(",", ":"),
		)
		self.assertEqual(intent.payload_hash, hashlib.sha256(body.encode()).hexdigest())
		self.assertTrue(intent.source_action.startswith("manual_reply:"))
		self.accepted(name)
