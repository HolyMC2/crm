"""Signed receipt to actual native intent: monotonic SQL delivery evidence."""

import json
import time
import unittest
from contextlib import contextmanager
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import now_datetime

from crm.api import conversations as control
from crm.api import outbox, outbox_delivery as delivery
from frappe_whatsapp.utils import signature, webhook


class TestOutboxDeliverySql(unittest.TestCase):
    def setUp(self):
        self.point = "outbox_delivery_" + uuid4().hex
        frappe.db.savepoint(self.point)
        self.addCleanup(frappe.db.rollback, save_point=self.point)
        self.addCleanup(frappe.set_user, frappe.session.user)
        frappe.set_user("Administrator")
        self.account = self.new_account()
        self.peer = "52" + str(int(uuid4().hex[:12], 16))
        self.now = int(time.time()) - 5
        self.mid = "wamid.delivery-" + uuid4().hex
        self.enterContext(patch.object(frappe, "request", None))
        for target in ("frappe_whatsapp.transport.raw", "frappe_whatsapp.transport.api", "frappe.enqueue", "frappe.sendmail"):
            self.enterContext(patch(target, side_effect=AssertionError("delivery invoked outbound side effect")))
        self.realtime = self.enterContext(patch.object(frappe, "publish_realtime"))
        self.conversation = control.get_or_create("WhatsApp", self.account.phone_id, self.peer)
        control.apply_control(self.conversation.name, "take", 1, uuid4().hex)
        self.intent = self.new_intent(self.mid)

    def new_account(self):
        return frappe.get_doc({"doctype": "WhatsApp Account", "account_name": "delivery-" + uuid4().hex,
            "phone_id": "97" + str(int(uuid4().hex[:12], 16)), "app_id": "998801", "business_id": "998802",
            "status": "Active", "mode": "Live", "version": "v23.0", "url": "https://graph.facebook.com",
            "token": "fictional-never-used", "app_secret": "fictional-delivery-secret"}).insert(ignore_permissions=True)

    def new_intent(self, mid=None, *, state="Accepted"):
        name = outbox.queue_message(self.conversation.name, 2, uuid4().hex, {"type": "text", "text": "Frozen native reply"})["name"]
        with control.conversation_fence(self.conversation.name):
            doc = outbox._load(name)
            outbox._transition(doc, "Claimed", attempts=1, claim_token=uuid4().hex)
            outbox._transition(doc, "Submitting", submitted_at=delivery._timestamp(self.now - 10))
            if state == "Accepted":
                outbox._transition(doc, "Accepted", provider_message_id=mid, accepted_at=delivery._timestamp(self.now - 9))
            else:
                outbox._transition(doc, state, "fixture_uncertain")
        return doc

    def receipt(self, status="delivered", *, timestamp=None, mid=None, peer=None, account=None):
        account = account or self.account
        entry = {"id": mid or self.mid, "status": status, "recipient_id": peer or self.peer,
                 "timestamp": str(self.now if timestamp is None else timestamp)}
        if status == "failed":
            entry["errors"] = [{"code": 131000, "message": "private provider text and fake secret"}]
        body = json.dumps({"object": "whatsapp_business_account", "entry": [{"id": account.business_id, "changes": [{
            "field": "messages", "value": {"messaging_product": "whatsapp", "metadata": {"phone_number_id": account.phone_id}, "statuses": [entry]}}]}]}).encode()
        request = SimpleNamespace(method="POST", get_data=lambda: body,
            headers={"X-Hub-Signature-256": signature.expected_signature("fictional-delivery-secret", body)})
        with patch.object(frappe, "request", request), patch.object(signature, "_accounts", return_value=[account]):
            name = webhook.post()[0]  # Actual HMAC verifier, atomizer and SQL receipt writer.
        frappe.db.set_value("Meta Webhook Receipt", name, {"state": "Processing", "attempts": 1,
            "lease_until": now_datetime() + timedelta(minutes=5)}, update_modified=False)
        return frappe.get_doc("Meta Webhook Receipt", name), entry

    @contextmanager
    def context(self, receipt):
        before = frappe.flags.get("meta_webhook_receipt")
        frappe.flags.meta_webhook_receipt = receipt.name
        try:
            yield
        finally:
            frappe.flags.meta_webhook_receipt = before

    def apply(self, receipt, **kwargs):
        with self.context(receipt):
            return delivery.apply_delivery_receipt(receipt.name, **kwargs)

    def test_signed_guest_receipt_updates_native_intent_without_legacy_message(self):
        receipt, entry = self.receipt()
        self.assertFalse(frappe.db.exists("WhatsApp Message", {"message_id": self.mid}))
        frappe.set_user("Guest")
        result = self.apply(receipt, expected_entry=entry, account_records=(self.account.name,))
        self.assertTrue(result["matched"])
        self.assertEqual((result["intent_name"], result["intent_state"]), (self.intent.name, "Delivered"))
        self.intent.reload()
        self.assertEqual(self.intent.delivered_at, delivery._timestamp(self.now))
        self.assertFalse(self.intent.read_at)
        self.assertEqual(self.intent.provider_message_id, self.mid)

    def test_real_wa_bridge_validates_and_folds_without_existing_legacy_row(self):
        from frappe_whatsapp.delivery import fold_native_delivery
        receipt, entry = self.receipt()
        with self.context(receipt):
            result = fold_native_delivery(entry, (self.account.name,))
        self.assertTrue(result["matched"])
        self.assertEqual(result["intent_state"], "Delivered")
        self.assertFalse(frappe.db.exists("WhatsApp Message", {"message_id": self.mid}))

    def test_delivered_then_read_uses_provider_times_and_does_not_downgrade(self):
        delivered, _ = self.receipt()
        read, _ = self.receipt("read", timestamp=self.now + 1)
        self.apply(delivered)
        self.apply(read)
        self.intent.reload()
        self.assertEqual((self.intent.state, self.intent.delivered_at, self.intent.read_at),
                         ("Read", delivery._timestamp(self.now), delivery._timestamp(self.now + 1)))
        before = self.intent.state_log
        for status in ("sent", "delivered", "failed"):
            receipt, _ = self.receipt(status, timestamp=self.now + 2)
            self.assertEqual(self.apply(receipt)["intent_state"], "Read")
        self.intent.reload()
        self.assertEqual(self.intent.state_log, before)

    def test_read_before_delivered_preserves_stronger_evidence_without_inventing_time(self):
        receipt, _ = self.receipt("read")
        self.apply(receipt)
        receipt, _ = self.receipt("delivered", timestamp=self.now - 1)
        self.apply(receipt)
        self.intent.reload()
        self.assertEqual(self.intent.state, "Read")
        self.assertIsNone(self.intent.delivered_at)
        self.assertEqual(self.intent.read_at, delivery._timestamp(self.now))

    def test_same_status_duplicate_is_idempotent_without_new_state_log_entry(self):
        receipt, _ = self.receipt()
        self.apply(receipt)
        self.intent.reload()
        before = self.intent.state_log
        self.assertEqual(self.apply(receipt)["reason_code"], "native_delivery_already_recorded")
        another, _ = self.receipt(timestamp=self.now + 1)
        self.apply(another)
        self.intent.reload()
        self.assertEqual(self.intent.state_log, before)
        self.assertEqual(self.intent.delivered_at, delivery._timestamp(self.now))

    def test_failed_async_is_static_not_retryable_and_can_upgrade_positive_evidence(self):
        failed, _ = self.receipt("failed")
        self.apply(failed)
        self.intent.reload()
        self.assertEqual((self.intent.state, self.intent.reason_code), ("Failed", "provider_delivery_failed"))
        self.assertFalse(outbox._projection(self.intent)["can_retry"])
        self.assertNotIn("private provider", self.intent.state_log)
        receipt, _ = self.receipt("sent")
        self.assertEqual(self.apply(receipt)["intent_state"], "Failed")
        delivered, _ = self.receipt("delivered", timestamp=self.now + 1)
        self.assertEqual(self.apply(delivered)["intent_state"], "Delivered")
        self.intent.reload()
        self.assertFalse(self.intent.reason_code)

    def test_failed_with_id_can_upgrade_directly_to_read(self):
        failed, _ = self.receipt("failed")
        self.apply(failed)
        read, _ = self.receipt("read")
        self.assertEqual(self.apply(read)["intent_state"], "Read")

    def test_pending_unknown_without_id_never_correlates_by_body_or_time(self):
        unknown = self.new_intent(state="Unknown")
        receipt, _ = self.receipt(mid="wamid.unrecorded")
        result = self.apply(receipt)
        self.assertEqual(result, {"matched": False, "reason_code": "native_delivery_target_missing"})
        unknown.reload()
        self.assertEqual(unknown.state, "Unknown")
        self.assertFalse(unknown.provider_message_id)
        self.assertFalse(frappe.db.exists("WhatsApp Message", {"message_id": "wamid.unrecorded"}))

    def test_foreign_account_or_peer_with_same_message_id_does_not_match(self):
        foreign = self.new_account()
        for options in ({"account": foreign}, {"peer": self.peer + "1"}):
            receipt, _ = self.receipt(**options)
            self.assertFalse(self.apply(receipt)["matched"])
        self.intent.reload()
        self.assertEqual(self.intent.state, "Accepted")
        self.assertFalse(frappe.db.exists(control.DOCTYPE, control.conversation_key("WhatsApp", self.account.phone_id, self.peer + "1")))

    def test_legacy_unkeyed_duplicate_targets_are_ambiguous_and_unchanged(self):
        # Pre-column historical rows have no provider key; the additive migration
        # does not backfill them. New keyed rows must still retain the DB constraint.
        frappe.db.set_value(outbox.DOCTYPE, self.intent.name, "provider_message_key", None, update_modified=False)
        other = self.new_intent(self.mid)
        receipt, _ = self.receipt()
        with self.assertRaisesRegex(delivery.DeliveryError, "native_delivery_target_ambiguous"):
            self.apply(receipt)
        self.intent.reload()
        other.reload()
        self.assertEqual((self.intent.state, other.state), ("Accepted", "Accepted"))

    def test_http_flag_only_nonprocessing_and_tampered_receipts_are_rejected(self):
        receipt, _ = self.receipt()
        with self.assertRaises(delivery.DeliveryError):
            delivery.apply_delivery_receipt(receipt.name)
        with self.context(receipt), patch.object(frappe, "request", object()), self.assertRaises(delivery.DeliveryError):
            delivery.apply_delivery_receipt(receipt.name)
        for field, value in (("state", "Processed"), ("payload_hash", "0" * 64), ("event_key", "0" * 64)):
            receipt, _ = self.receipt(timestamp=self.now - len(field))
            frappe.db.set_value("Meta Webhook Receipt", receipt.name, field, value, update_modified=False)
            with self.assertRaises(delivery.DeliveryError):
                self.apply(receipt)

    def test_mismatched_entry_or_scoped_account_cannot_grant_legacy_absence_success(self):
        receipt, entry = self.receipt()
        with self.assertRaises(delivery.DeliveryError):
            self.apply(receipt, expected_entry={**entry, "id": "wamid.other"})
        with self.assertRaises(delivery.DeliveryError):
            self.apply(receipt, account_records=("other-account",))

    def test_processing_without_attempt_or_live_lease_is_not_worker_authority(self):
        for values in ({"attempts": 0}, {"lease_until": None}, {"lease_until": now_datetime() - timedelta(seconds=1)}):
            receipt, _ = self.receipt()
            frappe.db.set_value("Meta Webhook Receipt", receipt.name, values, update_modified=False)
            with self.assertRaisesRegex(delivery.DeliveryError, "native_delivery_claim_required"):
                self.apply(receipt)
        self.intent.reload()
        self.assertEqual(self.intent.state, "Accepted")

    def test_future_millisecond_and_uninitialized_timestamps_are_rejected(self):
        for timestamp in (int(time.time()) + 600, int(time.time()) * 1000, 0, 1):
            receipt, _ = self.receipt(timestamp=timestamp)
            with self.assertRaisesRegex(delivery.DeliveryError, "native_delivery_timestamp_invalid"):
                self.apply(receipt)

    def test_lost_human_authority_does_not_erase_provider_delivery(self):
        control.apply_control(self.conversation.name, "release", 2, uuid4().hex)
        receipt, _ = self.receipt()
        with patch.object(outbox, "_eligibility", side_effect=AssertionError("Delivery must not reauthorize a send")), \
             patch.object(control, "_authorize", side_effect=AssertionError("Delivery must not require current actor rights")):
            self.assertEqual(self.apply(receipt)["intent_state"], "Delivered")

    def test_current_and_frozen_account_revision_mismatch_hold_evidence(self):
        receipt, _ = self.receipt()
        frappe.db.set_value("WhatsApp Account", self.account.name, "app_id", "998899", update_modified=False)
        with self.assertRaisesRegex(delivery.DeliveryError, "native_delivery_account_unavailable"):
            self.apply(receipt)
        self.account.reload()
        current_receipt, _ = self.receipt(account=self.account)
        with self.assertRaisesRegex(delivery.DeliveryError, "native_delivery_account_changed"):
            self.apply(current_receipt)

    def test_fence_is_owned_before_intent_lock_and_transition(self):
        receipt, _ = self.receipt()
        original = outbox._load
        def guarded(name):
            control._assert_fence(self.conversation.name)
            return original(name)
        with patch.object(outbox, "_load", side_effect=guarded):
            self.assertTrue(self.apply(receipt)["matched"])

    def test_outer_rollback_preserves_previous_work_and_reverts_delivery(self):
        receipt, _ = self.receipt()
        frappe.db.set_value("WhatsApp Account", self.account.name, "version", "v24.0", update_modified=False)
        point = "delivery_outer_" + uuid4().hex
        frappe.db.savepoint(point)
        self.apply(receipt)
        self.assertEqual(frappe.db.get_value(outbox.DOCTYPE, self.intent.name, "state"), "Delivered")
        frappe.db.rollback(save_point=point)
        self.intent.reload()
        self.assertEqual(self.intent.state, "Accepted")
        self.assertIsNone(self.intent.delivered_at)
        self.assertEqual(frappe.db.get_value("WhatsApp Account", self.account.name, "version"), "v24.0")
