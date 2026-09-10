"""Actual SQL customer-reply holds, temporal ordering and receipt authority."""

import json
import time
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import convert_utc_to_system_timezone, now_datetime

from crm.api import conversation_activity as activity
from crm.api import conversations as control


def system_time(seconds):
    return convert_utc_to_system_timezone(datetime.fromtimestamp(seconds, timezone.utc).replace(tzinfo=None)).replace(tzinfo=None)


class TestConversationActivitySql(unittest.TestCase):
    def setUp(self):
        self.point = "customer_activity_" + uuid4().hex
        frappe.db.savepoint(self.point)
        self.addCleanup(frappe.db.rollback, save_point=self.point)
        self.addCleanup(frappe.set_user, frappe.session.user)
        frappe.set_user("Administrator")
        self.account_id = "96" + str(int(uuid4().hex[:12], 16))
        self.peer = "52" + str(int(uuid4().hex[:12], 16))
        self.now = int(time.time()) - 2
        self.account = frappe.get_doc({"doctype": "WhatsApp Account", "account_name": "activity-" + uuid4().hex,
            "phone_id": self.account_id, "status": "Active", "mode": "Live", "app_id": "999101", "business_id": "999102",
            "version": "v23.0", "url": "https://graph.facebook.com", "token": "fictional-unused"}).insert(ignore_permissions=True)
        self.doc = control.get_or_create("WhatsApp", self.account_id, self.peer)
        self.seed("Bot")
        for target in ("frappe_whatsapp.transport.raw", "frappe_whatsapp.transport.api", "frappe.enqueue",
                       "frappe.sendmail", "crm.api.whatsapp_routing.resolve_reference_for_number"):
            self.enterContext(patch(target, side_effect=AssertionError("customer activity invoked unrelated side effect")))
        self.enterContext(patch.object(frappe, "request", None))
        self.enterContext(patch.object(control, "get_or_create", side_effect=AssertionError("activity created identity")))

    def seed(self, state, *, boundary=None, generation=7, owner=None):
        frappe.db.set_value(control.DOCTYPE, self.doc.name, {"control_state": state, "bot_enabled": int(state == "Bot"),
            "human_owner": owner, "generation": generation, "modified": boundary or system_time(self.now - 60)}, update_modified=False)
        self.doc.reload()

    def receipt(self, *, timestamp=None, peer=None, event_type="message", kind="text", account=None):
        from frappe_whatsapp.webhook_receipts import record_events
        account = account or self.account
        message = {"from": peer or self.peer, "id": "wamid." + uuid4().hex,
                   "timestamp": str(self.now if timestamp is None else timestamp), "type": kind, kind: {"body": "private raw reply"}}
        payload = {"business_id": account.business_id, "change": {"field": "messages", "value": {
            "messaging_product": "whatsapp", "metadata": {"phone_number_id": account.phone_id}, "messages": [message]}}}
        name = record_events([{"provider": "WhatsApp", "account_id": account.phone_id, "app_id": account.app_id,
            "event_type": event_type, "event_id": message["id"], "payload": payload}])[0]
        frappe.db.set_value("Meta Webhook Receipt", name, {"state": "Processing", "attempts": 1,
            "lease_until": now_datetime() + timedelta(minutes=5)}, update_modified=False)
        return frappe.get_doc("Meta Webhook Receipt", name)

    @contextmanager
    def context(self, receipt, replay=False):
        before = frappe.flags.get("meta_webhook_receipt"), frappe.flags.get("meta_webhook_replay")
        frappe.flags.meta_webhook_receipt, frappe.flags.meta_webhook_replay = receipt.name, replay
        try:
            yield
        finally:
            frappe.flags.meta_webhook_receipt, frappe.flags.meta_webhook_replay = before

    def apply(self, receipt, timestamp=None, **kwargs):
        return activity.internal_apply_customer_activity("WhatsApp", self.account_id, self.peer,
            receipt_name=receipt.name, provider_timestamp=self.now if timestamp is None else timestamp, **kwargs)

    def test_guest_fresh_reply_holds_bot_and_invalidates_old_followup_generation(self):
        receipt = self.receipt()
        frappe.set_user("Guest")
        with self.context(receipt):
            result = self.apply(receipt)
        self.assertEqual((result["control_state"], result["generation"], result["bot_enabled"]), ("Human", 8, 0))
        self.assertEqual(result["reason_code"], "customer_reply_held_bot")
        self.assertFalse(result["human_owner"])
        with control.conversation_fence(self.doc.name), self.assertRaises(frappe.TimestampMismatchError):
            control.assert_current_generation(self.doc.name, 7, origin="Bot", actor_user="Guest", run_name="pending-followup")
        event = frappe.db.get_value(control.EVENT, {"source_receipt": receipt.name}, ["action", "origin", "actor_user", "result_json"], as_dict=True)
        self.assertEqual((event.action, event.origin), ("customer_reply", "Provider"))
        self.assertFalse(event.actor_user)
        self.assertNotIn("private raw reply", event.result_json)

    def test_replayed_reply_cannot_revoke_a_newer_bot_grant(self):
        receipt = self.receipt()
        with self.context(receipt):
            self.apply(receipt)
        self.seed("Bot", generation=9, boundary=system_time(self.now + 1))
        with self.context(receipt, replay=True):
            replay = self.apply(receipt)
        self.assertTrue(replay["replayed"])
        self.doc.reload()
        self.assertEqual((self.doc.control_state, self.doc.generation), ("Bot", 9))
        self.assertEqual(frappe.db.count(control.EVENT, {"source_receipt": receipt.name}), 1)

    def test_retry_flag_does_not_skip_first_valid_hold(self):
        receipt = self.receipt()
        with self.context(receipt, replay=True):
            self.assertEqual(self.apply(receipt)["reason_code"], "customer_reply_held_bot")

    def test_delayed_reply_newer_than_grant_has_no_arbitrary_age_cutoff(self):
        self.seed("Bot", boundary=system_time(self.now - 7200))
        receipt = self.receipt(timestamp=self.now - 3600)
        with self.context(receipt):
            self.assertEqual(self.apply(receipt, self.now - 3600)["reason_code"], "customer_reply_held_bot")

    def test_old_same_second_and_microsecond_boundary_do_not_revoke_control(self):
        for boundary in (system_time(self.now + 1), system_time(self.now), system_time(self.now) + timedelta(microseconds=1)):
            self.seed("Bot", boundary=boundary)
            receipt = self.receipt()
            with self.context(receipt):
                self.assertEqual(self.apply(receipt)["reason_code"], "customer_activity_precedes_control")
            self.doc.reload()
            self.assertEqual((self.doc.control_state, self.doc.generation, self.doc.bot_enabled), ("Bot", 7, 1))

    def test_future_message_and_its_later_replay_never_become_a_new_command(self):
        timestamp = self.now + 3600
        receipt = self.receipt(timestamp=timestamp)
        with self.context(receipt):
            self.assertEqual(self.apply(receipt, timestamp)["reason_code"], "customer_activity_future")
            frappe.db.set_value("Meta Webhook Receipt", receipt.name, {"attempts": 2,
                "lease_until": system_time(timestamp + 300)}, update_modified=False)
            with patch.object(activity, "now_datetime", return_value=system_time(timestamp + 1)):
                result = self.apply(receipt, timestamp)
        self.assertTrue(result["replayed"])
        self.doc.reload()
        self.assertEqual(self.doc.control_state, "Bot")

    def test_receipt_arrival_time_is_not_activity_time(self):
        receipt = self.receipt(timestamp=self.now - 120)
        frappe.db.set_value("Meta Webhook Receipt", receipt.name, "received_at", now_datetime() + timedelta(days=1), update_modified=False)
        with self.context(receipt):
            self.assertEqual(self.apply(receipt, self.now - 120)["reason_code"], "customer_activity_precedes_control")

    def test_human_owner_paused_and_closed_are_preserved(self):
        for state in ("Human", "Paused", "Closed"):
            self.seed(state, owner="Administrator")
            receipt = self.receipt()
            with self.context(receipt):
                result = self.apply(receipt)
            self.assertEqual((result["control_state"], result["human_owner"], result["generation"], result["bot_enabled"]),
                             (state, "Administrator", 7, 0))

    def test_fresh_or_stale_reply_never_materializes_missing_conversation(self):
        other = self.peer + "1"
        for timestamp in (self.now, self.now - 86400):
            receipt = self.receipt(peer=other, timestamp=timestamp)
            with self.context(receipt):
                result = activity.internal_apply_customer_activity("WhatsApp", self.account_id, other,
                    receipt_name=receipt.name, provider_timestamp=timestamp)
            self.assertEqual(result["reason_code"], "customer_activity_no_conversation")
            self.assertFalse(frappe.db.exists(control.DOCTYPE, control.conversation_key("WhatsApp", self.account_id, other)))

    def test_history_and_noncustomer_system_messages_cannot_hold_or_create(self):
        for kind in ("history", "smb_app_state_sync"):
            receipt = self.receipt(event_type=kind)
            with self.context(receipt), self.assertRaises(activity.CustomerActivityError):
                self.apply(receipt)
        receipt = self.receipt(kind="system")
        with self.context(receipt):
            self.assertEqual(self.apply(receipt)["reason_code"], "customer_activity_type_unsupported")
        self.doc.reload()
        self.assertEqual(self.doc.control_state, "Bot")

    def test_actual_private_assistant_principal_is_excluded(self):
        if not frappe.db.exists("DocType", "Asistente Canal"):
            self.skipTest("Eight-app fixture includes the Doco private principal schema")
        private = frappe.get_doc({"doctype": "Asistente Canal", "name": "activity-private-" + uuid4().hex,
            "channel": "WhatsApp", "external_id": self.peer, "role": "Staff", "enabled": 0,
            "owner": "Administrator", "modified_by": "Administrator", "creation": now_datetime(), "modified": now_datetime(),
            "docstatus": 0, "idx": 0})
        private.db_insert()  # Explicit isolated fixture; no principal provisioning hooks.
        receipt = self.receipt()
        with self.context(receipt):
            self.assertEqual(self.apply(receipt)["reason_code"], "customer_activity_unavailable")
        self.doc.reload()
        self.assertEqual((self.doc.control_state, self.doc.generation), ("Bot", 7))
        self.assertEqual(frappe.db.count(control.EVENT, {"source_receipt": receipt.name}), 0)

    def test_forged_context_claimed_timestamp_and_peer_are_denied(self):
        receipt = self.receipt()
        with self.assertRaises(activity.CustomerActivityError):
            self.apply(receipt)
        with self.context(receipt):
            for timestamp in (self.now + 1, True, str(self.now)):
                with self.assertRaises(activity.CustomerActivityError):
                    self.apply(receipt, timestamp)
            with self.assertRaises(activity.CustomerActivityError):
                activity.internal_apply_customer_activity("WhatsApp", self.account_id, self.peer + "1",
                    receipt_name=receipt.name, provider_timestamp=self.now)
            with patch.object(frappe, "request", object()), self.assertRaises(activity.CustomerActivityError):
                self.apply(receipt)

    def test_nonprocessing_and_tampered_actual_receipts_are_denied(self):
        for field, value in (("state", "Processed"), ("payload_hash", "0" * 64), ("event_key", "0" * 64)):
            receipt = self.receipt()
            frappe.db.set_value("Meta Webhook Receipt", receipt.name, field, value, update_modified=False)
            with self.context(receipt), self.assertRaises(activity.CustomerActivityError):
                self.apply(receipt)

    def test_processing_flag_without_live_claim_cannot_mutate_control(self):
        for values in ({"attempts": 0}, {"lease_until": None}, {"lease_until": now_datetime() - timedelta(seconds=1)}):
            receipt = self.receipt()
            frappe.db.set_value("Meta Webhook Receipt", receipt.name, values, update_modified=False)
            with self.context(receipt), self.assertRaisesRegex(activity.CustomerActivityError, "customer_activity_claim_required"):
                self.apply(receipt)
        self.doc.reload()
        self.assertEqual((self.doc.control_state, self.doc.generation), ("Bot", 7))

    def test_current_revoked_demo_app_and_business_scope_are_denied(self):
        receipt = self.receipt()
        for field, value in (("status", "Inactive"), ("mode", "Demo"), ("app_id", "different"), ("business_id", "different")):
            original = self.account.get(field)
            frappe.db.set_value("WhatsApp Account", self.account.name, field, value, update_modified=False)
            with self.context(receipt), self.assertRaisesRegex(activity.CustomerActivityError, "customer_activity_account_unavailable"):
                self.apply(receipt)
            frappe.db.set_value("WhatsApp Account", self.account.name, field, original, update_modified=False)

    def test_account_record_reassignment_cannot_hold_wrong_conversation(self):
        frappe.db.set_value(control.DOCTYPE, self.doc.name, "account_record", "other-account", update_modified=False)
        receipt = self.receipt()
        with self.context(receipt), self.assertRaisesRegex(activity.CustomerActivityError, "customer_activity_account_unavailable"):
            self.apply(receipt)

    def test_hold_and_audit_share_outer_rollback_and_prior_request_work_survives(self):
        receipt = self.receipt()
        frappe.db.set_value("WhatsApp Account", self.account.name, "version", "v24.0", update_modified=False)
        point = "activity_outer_" + uuid4().hex
        frappe.db.savepoint(point)
        original = control._persist_transition
        def fail_after_projection(*args, **kwargs):
            original(*args, **kwargs)
            raise RuntimeError("fictional later projection failure")
        with self.context(receipt), patch.object(control, "_persist_transition", side_effect=fail_after_projection):
            with self.assertRaises(RuntimeError):
                self.apply(receipt)
        self.assertEqual(frappe.db.get_value("WhatsApp Account", self.account.name, "version"), "v24.0")
        self.assertEqual(frappe.db.get_value(control.DOCTYPE, self.doc.name, "control_state"), "Human")
        frappe.db.rollback(save_point=point)  # Only the outer receipt owner rolls back.
        self.doc.reload()
        self.assertEqual((self.doc.control_state, self.doc.generation), ("Bot", 7))
        self.assertEqual(frappe.db.count(control.EVENT, {"source_receipt": receipt.name}), 0)
        self.assertEqual(frappe.db.get_value("WhatsApp Account", self.account.name, "version"), "v24.0")
