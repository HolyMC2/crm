"""Current SQL/fence guards; all fixtures roll back and every HTTP is doubled."""

import json
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import now_datetime

from crm.api import conversations as control, outbox, outbox_legacy as legacy


class LegacyGuardFixture(unittest.TestCase):
    def setUp(self):
        self.point = "legacy_guard_" + uuid4().hex
        frappe.db.savepoint(self.point)
        self.addCleanup(frappe.db.rollback, save_point=self.point)
        self.addCleanup(frappe.set_user, frappe.session.user)
        frappe.set_user("Administrator")
        self.enterContext(patch.object(frappe.local, "conf", frappe._dict(frappe.conf)))
        frappe.conf.maintenance_mode = 0
        self.enterContext(patch.object(frappe, "request", None))
        self.enterContext(patch.object(frappe, "enqueue", side_effect=AssertionError("No enqueue")))
        self.enterContext(patch.object(frappe, "publish_realtime"))
        self.account_id = "94" + str(int(uuid4().hex[:12], 16))
        self.peer = "52" + str(int(uuid4().hex[:12], 16))
        self.account = frappe.get_doc({"doctype": "WhatsApp Account", "account_name": "legacy-" + uuid4().hex,
            "phone_id": self.account_id, "status": "Active", "mode": "Live", "app_id": "994001", "business_id": "994002",
            "version": "v23.0", "url": "https://graph.facebook.com", "token": "fictional-never-live"}).insert(ignore_permissions=True)
        self.payload = {"messaging_product": "whatsapp", "to": self.peer, "type": "text", "text": {"body": "Fictional guarded reply"}}
        self.name = control.conversation_key("WhatsApp", self.account_id, self.peer)

    def guard(self, **kwargs):
        return legacy.guard_legacy_send("WhatsApp", kwargs.get("account", self.account_id),
            kwargs.get("peer", self.peer), payload=kwargs.get("payload", self.payload))

    def open(self):
        return control.get_or_create("WhatsApp", self.account_id, self.peer)

    def native_intent(self):
        from frappe_whatsapp.webhook_receipts import record_events
        self.open()
        control.apply_control(self.name, "take", 1, uuid4().hex)
        receipt = record_events([{"provider": "WhatsApp", "account_id": self.account_id,
            "app_id": self.account.app_id, "event_type": "message", "event_id": uuid4().hex,
            "payload": {"change": {"value": {"messages": [{"from": self.peer, "timestamp": str(int(time.time()) - 10)}]}}}}])[0]
        frappe.db.set_value("Meta Webhook Receipt", receipt, "state", "Processed")
        return outbox.queue_message(self.name, 2, uuid4().hex, {"type": "text", "text": self.payload["text"]["body"]})["name"]

    def private_identity(self, peer=None):
        if not frappe.db.exists("DocType", "Asistente Canal"):
            self.skipTest("The eight-app fixture includes private principal schema")
        frappe.get_doc({"doctype": "Asistente Canal", "name": "legacy-private-" + uuid4().hex,
            "channel": "WhatsApp", "external_id": peer or self.peer, "role": "Staff", "enabled": 1,
            "owner": "Administrator", "modified_by": "Administrator", "creation": now_datetime(), "modified": now_datetime(),
            "docstatus": 0, "idx": 0}).db_insert()


class TestLegacyGuardSql(LegacyGuardFixture):
    def test_absent_public_peer_keeps_fence_without_creating_or_committing(self):
        todo = frappe.get_doc({"doctype": "ToDo", "description": "Prior legacy request work"}).insert()
        with patch.object(frappe.db, "commit") as commit, patch.object(frappe.db, "rollback") as rollback:
            with self.guard():
                control._assert_fence(self.name)
                self.assertFalse(frappe.db.get_value(control.DOCTYPE, self.name, "name", for_update=True))
                self.assertTrue(frappe.db.exists("ToDo", todo.name))
            commit.assert_not_called()
            rollback.assert_not_called()
        self.assertFalse(frappe.db.exists(control.DOCTYPE, self.name))

    def test_any_control_state_denies_legacy_even_to_current_owner(self):
        self.open()
        for state in ("Human", "Bot", "Paused", "Closed"):
            frappe.db.set_value(control.DOCTYPE, self.name, {"control_state": state, "human_owner": "Administrator"})
            with self.subTest(state=state), self.assertRaisesRegex(legacy.LegacySendBlocked, "^native_outbound_intent_required$"):
                with self.guard():
                    self.fail("legacy HTTP authorized")

    def test_private_registration_without_customer_row_preserves_staff_route(self):
        self.private_identity()
        with self.guard():
            control._assert_fence(self.name)
        self.assertFalse(frappe.db.exists(control.DOCTYPE, self.name))

    def test_private_registration_is_not_an_exemption_for_existing_control(self):
        self.open()
        self.private_identity()
        with self.assertRaises(legacy.LegacySendBlocked):
            with self.guard():
                self.fail("private evidence overrode an existing control")

    def test_exact_other_account_and_peer_do_not_borrow_control(self):
        self.open()
        for kwargs in ({"account": self.account_id + "1"}, {"peer": self.peer + "1"}):
            with self.guard(**kwargs):
                pass

    def test_flags_roles_and_forged_context_do_not_grant_authority(self):
        self.open()
        with patch.object(frappe, "flags", frappe._dict(native_outbox=True, ignore_permissions=True, assistant_private=True)):
            with self.assertRaises(legacy.LegacySendBlocked):
                with self.guard():
                    self.fail("caller flags authorized HTTP")
        for grant in (("fake", "WhatsApp", self.account_id, self.peer, outbox._canonical(self.payload).encode(), "fake"),
                      ("fake", "WhatsApp", self.account_id, self.peer)):
            token = outbox._dispatch.set(grant)
            try:
                with self.assertRaises(legacy.LegacySendBlocked):
                    with self.guard():
                        self.fail("forged grant authorized HTTP")
            finally:
                outbox._dispatch.reset(token)

    def test_real_dispatch_capability_checks_exact_body_and_is_revoked_afterward(self):
        name = self.native_intent()
        from frappe_whatsapp import native_outbox
        def provider(intent, payload):
            with self.guard(payload=payload):
                control._assert_fence(self.name)
            with self.assertRaises(legacy.LegacySendBlocked):
                with self.guard(payload={**payload, "text": {"body": "Changed"}}):
                    self.fail("substituted payload passed")
            return {"state": "Accepted", "provider_message_id": "wamid.legacy-real-grant"}
        with patch.object(frappe.db, "rollback"), patch.object(native_outbox, "send_frozen", side_effect=provider):
            outbox.dispatch_intent(name)
        self.assertEqual(outbox._load(name).state, "Accepted")
        with self.assertRaises(legacy.LegacySendBlocked):
            with self.guard():
                self.fail("expired grant survived dispatch")

    def test_missing_schema_and_current_read_error_are_static_holds(self):
        real_exists = frappe.db.exists
        with patch.object(frappe.db, "exists", side_effect=lambda dt, key, **kw: False if key == control.DOCTYPE else real_exists(dt, key, **kw)):
            with self.assertRaisesRegex(legacy.LegacySendBlocked, "^legacy_control_unavailable$"):
                with self.guard():
                    pass
        with patch.object(frappe.db, "get_value", side_effect=RuntimeError("private DB secret")):
            with self.assertRaisesRegex(legacy.LegacySendBlocked, "^legacy_control_unavailable$"):
                with self.guard():
                    pass

    def test_http_failure_does_not_mask_exception_or_rollback_prior_writes(self):
        todo = frappe.get_doc({"doctype": "ToDo", "description": "Preserved after HTTP double fails"}).insert()
        with self.assertRaisesRegex(TimeoutError, "fictional timeout"), self.guard():
            raise TimeoutError("fictional timeout")
        self.assertTrue(frappe.db.exists("ToDo", todo.name))
        owned = frappe.db.sql("SELECT IS_USED_LOCK(%s)", control._lock_key(self.name))[0][0]
        self.assertIsNone(owned)

    def test_current_read_conflict_is_static_and_does_not_rollback_caller(self):
        with patch.object(frappe.db, "get_value", side_effect=frappe.QueryDeadlockError("private SQL details")), \
                patch.object(frappe.db, "rollback") as rollback, patch.object(frappe.db, "commit") as commit:
            with self.assertRaisesRegex(legacy.LegacySendBlocked, "^legacy_control_conflict$"):
                with self.guard():
                    pass
            rollback.assert_not_called()
            commit.assert_not_called()

    def test_tampered_row_scope_holds_without_remapping_identity(self):
        self.open()
        frappe.db.set_value(control.DOCTYPE, self.name, "peer_id", self.peer + "1")
        with self.assertRaisesRegex(legacy.LegacySendBlocked, "legacy_conversation_scope_invalid"):
            with self.guard():
                pass
