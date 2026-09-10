"""Core Webchat ownership, staff broker and atomic local outbox SQL integration.

Visitor protocol tests live separately. These fixtures use its private storage
service directly; worker checkpoints use SQL savepoints and final fixture rollback.
"""
from datetime import timedelta
import secrets
import unittest
from unittest.mock import patch

import frappe
from frappe.utils import now_datetime

from crm.api import conversations as control, conversation_threads as threads, outbox, webchat


class TestWebchatOutbox(unittest.TestCase):
    def setUp(self):
        self.addCleanup(frappe.db.rollback)
        self.enterContext(patch.object(frappe.local, "conf", frappe._dict(frappe.conf)))
        frappe.conf.maintenance_mode = 0
        self.enterContext(patch.object(frappe, "session", frappe._dict(user="Administrator")))
        self.account, self.peer = secrets.token_hex(32), secrets.token_hex(32)
        profile, origin = "outbox-webchat-" + self.account[:10], "https://webchat.example.invalid"
        self.channel = webchat._mark(frappe.get_doc({"doctype": webchat.CHANNEL,
            "name": self.account, "account_id": self.account, "label": "Fictional Webchat",
            "profile": profile, "public_origin": origin, "binding_key": webchat._key(profile, origin), "enabled": 1})).insert(ignore_permissions=True, set_name=self.account)
        created = now_datetime()
        session_name = secrets.token_hex(32)
        self.session = webchat._mark(frappe.get_doc({"doctype": webchat.SESSION,
            "name": session_name, "channel": self.account, "peer_id": self.peer,
            "capability_hash": secrets.token_hex(32), "creation": created,
            "expires_at": created + timedelta(hours=24), "revoked": 0})).insert(ignore_permissions=True, set_name=session_name)
        self.conversation = control.get_or_create("Webchat", self.account, self.peer)
        control.apply_control(self.conversation.name, "take", 1, secrets.token_hex(16))

    def queue(self, text="Fictional support reply", request_id=None):
        return outbox.queue_message(self.conversation.name, 2, request_id or secrets.token_hex(16),
                                    {"type": "text", "text": text})

    def worker(self, name, on_commit=None):
        original = frappe.db.rollback
        checkpoints = []
        count = 0
        def rollback(*args, **kwargs):
            nonlocal count
            if args or kwargs:
                return original(*args, **kwargs)
            count += 1
            if count == 1:
                frappe.db.savepoint("webchat_worker_fixture")
            else:
                original(save_point="webchat_worker_fixture")
        def commit():
            checkpoints.append(frappe.db.get_value(outbox.DOCTYPE, name, "state"))
            if on_commit:
                on_commit()
        with patch.object(frappe.db, "rollback", side_effect=rollback), patch.object(frappe.db, "commit", side_effect=commit):
            outbox.dispatch_intent(name)
        return checkpoints

    def test_one_local_commit_contains_message_and_accepted_intent(self):
        request = secrets.token_hex(16)
        first = self.queue("<b>Visible as plain text</b>", request)
        self.assertEqual(first["name"], self.queue("<b>Visible as plain text</b>", request)["name"])
        def committed():
            self.assertEqual(frappe.db.count(webchat.MESSAGE, {"conversation": self.conversation.name}), 1)
        self.assertEqual(self.worker(first["name"], committed), ["Accepted"])
        doc = outbox._load(first["name"])
        self.assertTrue(doc.provider_message_id.startswith("webchat."))
        self.assertEqual(doc.source_doctype, webchat.CHANNEL)
        self.assertEqual(self.worker(doc.name), [])
        history = threads.get_history(self.conversation.name)
        self.assertEqual(history["messages"][0]["content"], "<b>Visible as plain text</b>")
        self.assertEqual(history["messages"][0]["direction"], "out")
        self.assertIsNone(history["messages"][0]["attach"])
        self.assertTrue(history["conversation"]["send_available"])
        public = webchat._history(self.session, self.conversation.name)
        self.assertEqual(set(public["messages"][0]), {"id", "text", "direction", "created_at"})

    def test_local_failure_rolls_back_transcript_and_exposes_safe_retry(self):
        name = self.queue()["name"]
        original = webchat.deliver_local
        def fail_after_insert(*args):
            original(*args)
            raise RuntimeError("fictional storage failure")
        with patch.object(webchat, "deliver_local", side_effect=fail_after_insert):
            self.assertEqual(self.worker(name), ["Blocked"])
        doc = outbox._load(name)
        self.assertEqual((doc.reason_code, doc.attempts), ("webchat_storage_unavailable", 1))
        self.assertEqual(frappe.db.count(webchat.MESSAGE, {"conversation": self.conversation.name}), 0)
        self.assertEqual(outbox.retry_intent(name)["state"], "Queued")
        self.assertEqual(self.worker(name), ["Accepted"])
        self.assertEqual(outbox._load(name).attempts, 2)

    def test_lost_local_commit_acknowledgement_preserves_accepted(self):
        name = self.queue()["name"]
        # Model a commit which completed before its acknowledgement failed:
        # rollback has no remaining transaction to erase. Real crash proof is separate.
        with patch.object(frappe.db, "rollback"), patch.object(frappe.db, "commit", side_effect=RuntimeError("lost ack")):
            outbox.dispatch_intent(name)
        self.assertEqual(outbox._load(name).state, "Accepted")
        self.assertEqual(frappe.db.count(webchat.MESSAGE, {"conversation": self.conversation.name}), 1)

    def test_released_owner_cannot_deliver_queued_message(self):
        name = self.queue()["name"]
        control.apply_control(self.conversation.name, "release", 2, secrets.token_hex(16))
        self.assertEqual(self.worker(name), ["Cancelled"])
        self.assertEqual(frappe.db.count(webchat.MESSAGE, {"conversation": self.conversation.name}), 0)

    def test_disabled_channel_and_expired_session_block(self):
        first = self.queue()["name"]
        frappe.db.set_value(webchat.CHANNEL, self.account, "enabled", 0)
        self.assertEqual(self.worker(first), ["Blocked"])
        frappe.db.set_value(webchat.CHANNEL, self.account, "enabled", 1)
        second = self.queue()["name"]
        with patch.object(webchat, "now_datetime", return_value=now_datetime() + timedelta(hours=25)):
            self.assertEqual(self.worker(second), ["Blocked"])
        self.assertEqual(outbox._load(second).reason_code, "webchat_session_unavailable")

    def test_revocation_and_direct_delivery_do_not_publish(self):
        name = self.queue()["name"]
        with self.assertRaises(frappe.PermissionError):
            webchat.deliver_local(outbox._load(name), {"type": "text", "text": "Fictional support reply"})
        self.session.revoked = 1
        webchat._mark(self.session).save(ignore_permissions=True)
        self.assertEqual(self.worker(name), ["Blocked"])
        self.assertEqual(frappe.db.count(webchat.MESSAGE, {"conversation": self.conversation.name}), 0)

    def test_staff_channel_assignment_is_current_and_explicit(self):
        user = frappe.get_doc({"doctype": "User", "email": "webchat-" + secrets.token_hex(6) + "@example.invalid",
            "first_name": "Webchat operator", "send_welcome_email": 0,
            "roles": [{"role": "Sales User"}]}).insert(ignore_permissions=True)
        with patch.object(frappe, "session", frappe._dict(user=user.name)):
            self.assertNotIn(self.account, {a["account_id"] for a in threads.list_accounts()["accounts"]})
            with self.assertRaises(frappe.PermissionError):
                threads.get_history(self.conversation.name)
        permission = frappe.get_doc({"doctype": "User Permission", "user": user.name,
            "allow": webchat.CHANNEL, "for_value": self.account, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
        with patch.object(frappe, "session", frappe._dict(user=user.name)):
            self.assertIn(self.account, {a["account_id"] for a in threads.list_accounts()["accounts"]})
            self.assertEqual(threads.get_history(self.conversation.name)["conversation"]["name"], self.conversation.name)
        frappe.delete_doc("User Permission", permission.name, ignore_permissions=True)
        with patch.object(frappe, "session", frappe._dict(user=user.name)), self.assertRaises(frappe.PermissionError):
            threads.get_history(self.conversation.name)

    def test_only_exact_webchat_identities_and_plain_payloads_are_accepted(self):
        with self.assertRaises(frappe.ValidationError):
            control.conversation_key("Webchat", self.account, "5215550100999")
        with self.assertRaises(frappe.ValidationError):
            self.queue("a" * 2001)
        self.assertEqual(frappe.get_list(webchat.SESSION), [])
        self.assertEqual(frappe.get_list(webchat.MESSAGE), [])
