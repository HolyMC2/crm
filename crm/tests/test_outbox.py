"""SQL/native gateway integration. No live requests and no committed fixtures."""
from datetime import timedelta
import json
import time
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import now_datetime

from crm.api import outbox as api
from crm.api import conversations as control
from crm.tests import test_conversations


class TestOutbox(test_conversations.TestConversations):
    def setUp(self):
        super().setUp()
        if not self._testMethodName.startswith("test_outbox_"):
            return
        self.enterContext(patch.object(frappe.local, "conf", frappe._dict(frappe.conf)))
        frappe.conf.maintenance_mode = 0
        frappe.db.set_value("WhatsApp Account", self.account.name,
            {"mode": "Live", "app_id": "9800001", "business_id": "9800002"})
        self.command()
        self.inbound()

    def inbound(self, *, timestamp=None, account=None, peer=None, app="9800001", kind="message", state="Processed"):
        from frappe_whatsapp.webhook_receipts import record_events
        timestamp = int(time.time()) - 10 if timestamp is None else timestamp
        name = record_events([{"provider": "WhatsApp", "account_id": account or self.account_id,
            "app_id": app, "event_type": kind, "event_id": uuid4().hex,
            "payload": {"change": {"value": {"messages": [{"from": peer or self.peer, "timestamp": str(timestamp)}]}}}}])[0]
        frappe.db.set_value("Meta Webhook Receipt", name, "state", state)
        return name

    def queue(self, text="Fictional manual reply", request_id=None, generation=2):
        return api.queue_message(self.doc.name, generation, request_id or uuid4().hex, {"type": "text", "text": text})

    def worker(self, name):
        # This SQL suite models transaction checkpoints; the process proof uses real rollback/commit.
        with patch.object(frappe.db, "rollback"):
            api.dispatch_intent(name)

    def dispatch(self, name, result=None):
        with patch.object(api, "_gateway", return_value=result or {"state": "Accepted", "provider_message_id": "wamid.fictional"}) as send:
            self.worker(name)
        return api._load(name), send

    def test_outbox_exact_replay_after_lost_response_and_new_owner(self):
        request = uuid4().hex
        first = self.queue(request_id=request)
        self.command("transfer", 2, owner=self.users["two"])
        replay = self.queue(request_id=request)
        self.assertEqual(first["name"], replay["name"])
        self.assertEqual(frappe.db.count(api.DOCTYPE, {"conversation": self.doc.name}), 1)
        with self.assertRaises(frappe.ValidationError):
            self.queue("Changed", request_id=request)

    def test_outbox_requires_owner_and_exact_generation(self):
        with self.assertRaises(frappe.TimestampMismatchError):
            self.queue(generation=1)
        frappe.set_user(self.users["two"])
        with self.assertRaises(frappe.PermissionError):
            self.queue()

    def test_outbox_takeover_cancels_before_transport(self):
        name = self.queue()["name"]
        self.command("transfer", 2, owner=self.users["two"])
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.reason_code), ("Cancelled", "conversation_changed"))
        send.assert_not_called()

    def test_outbox_role_and_account_revocation_block(self):
        name = self.queue()["name"]
        frappe.db.set_value("User", self.users["one"], "enabled", 0)
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.reason_code), ("Blocked", "authority_revoked"))
        send.assert_not_called()

    def test_outbox_app_reconfiguration_cannot_redirect_pending_reply(self):
        name = self.queue()["name"]
        frappe.db.set_value("WhatsApp Account", self.account.name, "app_id", "9800999")
        self.inbound(app="9800999")
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.reason_code), ("Blocked", "account_configuration_changed"))
        send.assert_not_called()

    def test_outbox_submitting_committed_before_exact_native_gateway(self):
        name = self.queue()["name"]
        from frappe_whatsapp import native_outbox
        commits = []
        def checkpoint():
            commits.append(frappe.db.get_value(api.DOCTYPE, name, "state"))
        def provider(intent, payload):
            self.assertEqual(commits, ["Claimed", "Submitting"])
            api.require_dispatch(name, "WhatsApp", self.account_id, self.peer, payload=payload)
            self.assertEqual(payload["to"], self.peer)
            with self.assertRaises(frappe.PermissionError):
                api.require_dispatch(name, "WhatsApp", self.account_id, self.peer,
                    payload={**payload, "text": {"body": "substituted"}})
            return {"state": "Accepted", "provider_message_id": "wamid.frozen"}
        with patch.object(frappe.db, "commit", side_effect=checkpoint), patch.object(native_outbox, "send_frozen", side_effect=provider):
            self.worker(name)
        self.assertEqual(commits, ["Claimed", "Submitting", "Accepted"])
        self.assertIsNone(api._dispatch.get())
        doc = api._load(name)
        self.assertEqual(doc.provider_message_id, "wamid.frozen")
        with self.assertRaises(frappe.PermissionError):
            api.require_dispatch(name, "WhatsApp", self.account_id, self.peer, payload=json.loads(doc.payload))

    def test_outbox_unknown_timeout_never_retries(self):
        name = self.queue()["name"]
        doc, send = self.dispatch(name, {"state": "Unknown", "reason_code": "provider_response_uncertain"})
        self.assertEqual(doc.state, "Unknown")
        with patch.object(api, "_gateway") as second:
            self.worker(name)
            second.assert_not_called()
        with self.assertRaises(frappe.ValidationError):
            api.retry_intent(name)
        self.assertFalse(api.get_intent(name)["can_retry"])

    def test_outbox_real_gateway_and_core_guard_share_exact_transport_body(self):
        from frappe.utils.password import set_encrypted_password
        from frappe_whatsapp import transport
        set_encrypted_password("WhatsApp Account", self.account.name, "fictional-test-token", fieldname="token")
        frappe.db.set_value("WhatsApp Account", self.account.name, "version", "v23.0")
        name = self.queue()["name"]
        body = api._canonical({"messaging_product": "whatsapp", "contacts": [{"input": self.peer, "wa_id": self.peer}],
                              "messages": [{"id": "wamid.actual-chain-double"}]}).encode()
        class Response:
            status_code = 200
            headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
            def iter_content(self, chunk_size):
                yield body
            def close(self):
                pass
        with patch.object(transport, "raw", return_value=Response()) as http:
            self.worker(name)
        doc = api._load(name)
        self.assertEqual((doc.state, doc.provider_message_id), ("Accepted", "wamid.actual-chain-double"))
        http.assert_called_once()
        self.assertEqual(http.call_args.kwargs["data"], doc.payload.encode())
        self.assertEqual(http.call_args.args[2], f"https://graph.facebook.com/v23.0/{self.account_id}/messages")
        self.assertFalse(http.call_args.kwargs["allow_redirects"])

    def test_outbox_expired_submission_recovers_unknown_without_send(self):
        name = self.queue()["name"]
        frappe.db.set_value(api.DOCTYPE, name, {"state": "Submitting", "attempts": 1,
            "lease_until": now_datetime() - timedelta(seconds=1),
            "state_log": api._canonical([{"state": "Submitting", "at": str(now_datetime()), "reason": ""}])})
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.reason_code, doc.attempts), ("Unknown", "submission_interrupted", 1))
        send.assert_not_called()

    def test_outbox_expired_claim_reclaimed_once(self):
        name = self.queue()["name"]
        frappe.db.set_value(api.DOCTYPE, name, {"state": "Claimed", "attempts": 1,
            "lease_until": now_datetime() - timedelta(seconds=1),
            "state_log": api._canonical([{"state": "Claimed", "at": str(now_datetime()), "reason": ""}])})
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.attempts), ("Accepted", 2))
        send.assert_called_once()

    def test_outbox_current_claim_cannot_be_stolen(self):
        name = self.queue()["name"]
        frappe.db.set_value(api.DOCTYPE, name, {"state": "Claimed", "attempts": 1,
            "lease_until": now_datetime() + timedelta(minutes=1)})
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.attempts), ("Claimed", 1))
        send.assert_not_called()

    def test_outbox_definitive_rejection_manual_retry_keeps_identity(self):
        name = self.queue()["name"]
        doc, _ = self.dispatch(name, {"state": "Failed", "reason_code": "provider_rejected"})
        self.assertEqual(doc.state, "Failed")
        self.assertEqual(api.retry_intent(name)["name"], name)
        self.assertEqual(api.retry_intent(name)["state"], "Queued")
        doc, _ = self.dispatch(name)
        self.assertEqual((doc.state, doc.attempts), ("Accepted", 2))

    def test_outbox_malformed_success_is_unknown(self):
        name = self.queue()["name"]
        doc, _ = self.dispatch(name, {"state": "Accepted", "provider_message_id": "demo-fake"})
        self.assertEqual(doc.state, "Unknown")

    def test_outbox_provider_identity_cannot_belong_to_two_intents(self):
        first, _ = self.dispatch(self.queue()["name"])
        second, send = self.dispatch(self.queue("Another fictional reply")["name"])
        self.assertEqual((second.state, second.reason_code, second.provider_message_id),
                         ("Unknown", "provider_identity_conflict", None))
        self.assertEqual(api._load(first.name).state, "Accepted")
        self.assertEqual(first.provider_message_key,
                         api._hash([first.provider, first.account_id, first.provider_message_id]))
        self.assertFalse(api.get_intent(second.name)["can_retry"])
        self.worker(second.name)
        send.assert_called_once()

    def test_outbox_older_provider_identity_is_also_reserved(self):
        first, _ = self.dispatch(self.queue()["name"])
        # Additive rollout: a pre-column Accepted row still reserves its ID.
        frappe.db.set_value(api.DOCTYPE, first.name, "provider_message_key", None)
        second, _ = self.dispatch(self.queue()["name"])
        self.assertEqual((second.state, second.reason_code), ("Unknown", "provider_identity_conflict"))

    def test_outbox_unique_provider_key_and_synthetic_success_hold(self):
        indexes = frappe.db.sql("SHOW INDEX FROM `tabCRM Outbound Intent`", as_dict=True)
        self.assertTrue(any(row.Column_name == "provider_message_key" and row.Non_unique == 0 for row in indexes))
        doc, _ = self.dispatch(self.queue()["name"], {"state": "Accepted", "provider_message_id": "wamid.demo-fake"})
        self.assertEqual(doc.state, "Unknown")

    def test_outbox_cancel_idempotent_and_no_transport(self):
        name = self.queue()["name"]
        self.assertEqual(api.cancel_intent(name)["state"], "Cancelled")
        self.assertEqual(api.cancel_intent(name)["state"], "Cancelled")
        _, send = self.dispatch(name)
        send.assert_not_called()

    def test_outbox_window_rejects_stale_future_wrong_account_and_pending(self):
        frappe.db.set_value("Meta Webhook Receipt", {"account_id": self.account_id, "event_type": "message"}, "state", "Ignored")
        now = int(time.time())
        self.inbound(timestamp=now - 86401)
        self.inbound(timestamp=now + 10)
        self.inbound(account=self.account_id + "1")
        self.inbound(peer=self.peer + "1")
        self.inbound(app="9800999")
        self.inbound(kind="history")
        self.inbound(state="Pending")
        name = self.queue()["name"]
        doc, send = self.dispatch(name)
        self.assertEqual((doc.state, doc.reason_code), ("Blocked", "customer_window_unverified"))
        send.assert_not_called()
        self.inbound()
        self.assertEqual(api.retry_intent(name)["state"], "Queued")

    def test_outbox_explicit_suppression_blocks_service_reply(self):
        if not frappe.db.exists("DocType", "Marketing Suppression"):
            self.skipTest("Optional marketing not installed")
        frappe.get_doc({"doctype": "Marketing Suppression", "party": "+52 1 555 010 0999", "party_type": "Phone",
                        "channel": "All", "reason": "Manual"}).insert(ignore_permissions=True)
        name = self.queue()["name"]
        doc, send = self.dispatch(name)
        self.assertEqual(doc.reason_code, "recipient_suppressed")
        send.assert_not_called()

    def test_outbox_generic_and_immutable_fields_denied(self):
        name = self.queue()["name"]
        doc = api._load(name)
        doc.payload = "{}"
        with self.assertRaises(frappe.PermissionError):
            doc.save(ignore_permissions=True)
        api._mark(doc)
        with self.assertRaises(frappe.ValidationError):
            doc.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):
            frappe.delete_doc(api.DOCTYPE, name, ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):
            frappe.get_list(api.DOCTYPE)

    def test_outbox_sweeper_recovers_committed_unenqueued(self):
        name = self.queue()["name"]
        with patch.object(api, "_enqueue") as enqueue:
            api.recover_intents()
        self.assertIn(name, enqueue.call_args.args[0])
        self.assertEqual(api._load(name).state, "Queued")

    def test_outbox_automation_and_http_dispatch_remain_closed(self):
        self.assertFalse(api.automation_ready("WhatsApp"))
        name = self.queue()["name"]
        with patch.object(frappe.local, "request", object(), create=True), self.assertRaises(frappe.PermissionError):
            self.worker(name)
        with self.receipt_context("not-an-authority"), self.assertRaises(frappe.PermissionError):
            self.worker(name)

    def test_outbox_private_projection_and_keyset_history(self):
        names = [self.queue()["name"] for _ in range(3)]
        first = api.list_intents(self.doc.name, limit=2)
        second = api.list_intents(self.doc.name, limit=2, before=first[-1]["name"])
        self.assertEqual({r["name"] for r in first + second}, set(names))
        self.assertFalse(set(first[0]) & {"payload", "claim_token", "state_log", "account_id", "peer_id"})
