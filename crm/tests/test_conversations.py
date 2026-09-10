"""SQL-backed ownership, exact account and provider replay contracts.

Dedicated lab only: fictional fixture accounts/users, outbound and enqueue blocked.
No commits: two-process commit/fence proofs belong to the outer integration driver.
"""
from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import conversations as api


class TestConversations(IntegrationTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        for name in (api.DOCTYPE, api.EVENT, "WhatsApp Account", "Meta Webhook Receipt"):
            if not frappe.db.exists("DocType", name):
                raise RuntimeError("Install controlled conversation schemas on the isolated lab first: " + name)
        cls.prefix = "conversation-" + uuid4().hex[:10]
        cls.users = {}
        with patch("frappe.sendmail"):
            for label, role in (("one", "Sales User"), ("two", "Sales User"), ("manager", "Sales Manager"), ("outsider", "Sales User")):
                name = f"{cls.prefix}-{label}@example.invalid"
                frappe.get_doc({"doctype": "User", "email": name, "first_name": "Fictional " + label,
                                "enabled": 1, "send_welcome_email": 0, "roles": [{"role": role}]}).insert()
                cls.users[label] = name
        cls.shop = None
        if frappe.db.has_column("WhatsApp Account", "doco_shop"):
            cls.shop = frappe.get_doc({"doctype": "Social Shop", "shop_name": cls.prefix, "enabled": 1}).insert().name
            for label in ("one", "two", "manager"):
                frappe.get_doc({"doctype": "User Permission", "user": cls.users[label],
                                "allow": "Social Shop", "for_value": cls.shop}).insert()

    def setUp(self):
        super().setUp()
        frappe.set_user("Administrator")
        self.point = "conversation_" + uuid4().hex
        frappe.db.savepoint(self.point)
        self.enterContext(patch("requests.sessions.Session.request", side_effect=AssertionError("No external requests")))
        self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("No mail")))
        self.enterContext(patch("frappe.enqueue", side_effect=AssertionError("No worker dispatch")))
        self.realtime = self.enterContext(patch("frappe.publish_realtime"))
        self.account_id = "98" + str(int(uuid4().hex[:12], 16))
        self.peer = "5215550100999"
        self.account = frappe.get_doc({"doctype": "WhatsApp Account", "account_name": self.prefix + uuid4().hex[:8],
                                      "phone_id": self.account_id, "status": "Active", "mode": "Demo",
                                      "doco_shop": self.shop, "is_default_incoming": 0, "is_default_outgoing": 0}).insert()
        self.doc = api.get_or_create("WhatsApp", self.account_id, self.peer)
        frappe.set_user(self.users["one"])

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.flags.meta_webhook_receipt = None
        frappe.flags.meta_webhook_replay = False
        frappe.db.rollback(save_point=self.point)
        super().tearDown()

    def command(self, action="take", generation=1, command=None, **kwargs):
        return api.apply_control(self.doc.name, action, generation, command or uuid4().hex, **kwargs)

    def seed_bot(self):
        # Only the fixture sets Bot directly; no public activation API exists yet.
        frappe.db.set_value(api.DOCTYPE, self.doc.name, {"control_state": "Bot", "bot_enabled": 1, "human_owner": None})

    def receipt(self, event_type="smb_message_echoes", account_id=None):
        from frappe_whatsapp.webhook_receipts import record_events
        return record_events([{"provider": "WhatsApp", "account_id": account_id or self.account_id,
            "app_id": "9800001", "event_type": event_type, "event_id": uuid4().hex, "payload": {}}])[0]

    @contextmanager
    def receipt_context(self, name, replay=False):
        before = frappe.flags.get("meta_webhook_receipt"), frappe.flags.get("meta_webhook_replay")
        frappe.flags.meta_webhook_receipt, frappe.flags.meta_webhook_replay = name, replay
        try:
            yield
        finally:
            frappe.flags.meta_webhook_receipt, frappe.flags.meta_webhook_replay = before

    def observation(self, action="external_outbound", historical=False):
        return api.internal_apply_provider_event("WhatsApp", self.account_id, self.peer, action, historical=historical)

    def test_identity_and_safe_defaults(self):
        self.assertEqual(self.doc.name, api.conversation_key("WhatsApp", self.account_id, self.peer))
        self.assertNotEqual(self.doc.name, api.conversation_key("WhatsApp", self.account_id + "1", self.peer))
        self.assertNotEqual(self.doc.name, api.conversation_key("Messenger", self.account_id, self.peer))
        self.assertEqual((self.doc.control_state, self.doc.generation, self.doc.bot_enabled), ("Human", 1, 0))
        self.assertFalse(self.doc.human_owner)
        for invalid in (None, 123, " 123", "+123", "None", "１２３"):
            with self.subTest(invalid=invalid), self.assertRaises(frappe.ValidationError):
                api.conversation_key("WhatsApp", self.account_id, invalid)
        self.assertEqual(self.doc.name, api.get_or_create("WhatsApp", self.account_id, self.peer).name)

    def test_take_conflict_and_stable_command_replay_after_transfer(self):
        command = uuid4().hex
        first = self.command(command=command)
        self.assertEqual((first["generation"], first["human_owner"]), (2, self.users["one"]))
        frappe.set_user(self.users["two"])
        with self.assertRaises(frappe.TimestampMismatchError):
            self.command()
        frappe.set_user(self.users["one"])
        transferred = self.command("transfer", 2, owner=self.users["two"])
        self.assertEqual(transferred["generation"], 3)
        replay = self.command(command=command)
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["generation"], 2)
        self.assertEqual(api.get_conversation(self.doc.name)["generation"], 3)
        self.assertEqual(frappe.db.count(api.EVENT, {"conversation": self.doc.name}), 2)
        with self.assertRaises(frappe.ValidationError):
            self.command(command=command, reason="changed input")

    def test_owner_transfer_manager_reason_and_release_never_bot(self):
        self.command()
        frappe.set_user(self.users["two"])
        with self.assertRaises(frappe.PermissionError):
            self.command(generation=2)
        frappe.set_user(self.users["manager"])
        with self.assertRaises(frappe.PermissionError):
            self.command(generation=2)
        taken = self.command(generation=2, reason="Fictional manager transfer")
        self.assertEqual(taken["generation"], 3)
        released = self.command("release", 3)
        self.assertEqual((released["control_state"], released["bot_enabled"], released["generation"]), ("Human", 0, 4))
        self.assertFalse(released["human_owner"])

    def test_request_is_audit_only_and_does_not_take_authority(self):
        self.command()
        frappe.set_user(self.users["two"])
        requested = self.command("request", 2)
        self.assertEqual((requested["generation"], requested["human_owner"]), (2, self.users["one"]))
        with api.conversation_fence(self.doc.name), self.assertRaises(frappe.PermissionError):
            api.assert_current_generation(self.doc.name, 2)

    def test_close_reopen_and_no_public_bot_activation(self):
        self.command()
        closed = self.command("close", 2)
        self.assertEqual(closed["control_state"], "Closed")
        with self.assertRaises(frappe.TimestampMismatchError):
            self.command(generation=3)
        reopened = self.command("reopen", 3)
        self.assertEqual((reopened["control_state"], reopened["bot_enabled"], reopened["generation"]), ("Human", 0, 4))
        self.assertFalse(reopened["human_owner"])
        with self.assertRaises(frappe.ValidationError):
            self.command("start_bot", 4)

    def test_generic_models_and_forged_json_capability_are_private(self):
        changed = frappe.get_doc(api.DOCTYPE, self.doc.name)
        changed.control_state = "Bot"
        changed.flags.crm_conversation_service = {"trusted": True}
        with self.assertRaises(frappe.PermissionError):
            changed.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):
            frappe.get_list(api.DOCTYPE)
        self.command()
        event_name = frappe.db.get_value(api.EVENT, {"conversation": self.doc.name}, "name")
        event = frappe.get_doc(api.EVENT, event_name)
        event.reason = "forged"
        with self.assertRaises(frappe.PermissionError):
            event.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):
            frappe.delete_doc(api.EVENT, event_name, ignore_permissions=True)
        self.assertNotIn(api.get_or_create, frappe.whitelisted)
        self.assertNotIn(api.internal_apply_provider_event, frappe.whitelisted)
        self.assertNotIn(api.assert_current_generation, frappe.whitelisted)

    def test_dispatch_requires_fence_current_owner_and_active_account(self):
        self.command()
        with self.assertRaises(frappe.PermissionError):
            api.assert_current_generation(self.doc.name, 2)
        with api.conversation_fence(self.doc.name):
            with api.conversation_fence(self.doc.name):
                self.assertEqual(api.assert_current_generation(self.doc.name, 2).name, self.doc.name)
            self.assertEqual(api.assert_current_generation(self.doc.name, 2).name, self.doc.name)
            with self.assertRaises(frappe.TimestampMismatchError):
                api.assert_current_generation(self.doc.name, 1)
            with self.assertRaises(frappe.PermissionError):
                api.assert_current_generation(self.doc.name, 2, origin="Bot")
            frappe.db.set_value("WhatsApp Account", self.account.name, "status", "Inactive")
            with self.assertRaises(frappe.PermissionError):
                api.assert_current_generation(self.doc.name, 2)

    def test_reference_permission_not_inherited_from_account(self):
        from crm.api.inquiries import create_inquiry
        inquiry = create_inquiry({"title": "Fictional scoped conversation", "source_type": "Manual",
                                  "client_request_id": uuid4().hex})
        linked = api.get_or_create("WhatsApp", self.account_id, self.peer + "1",
                                  reference_doctype="CRM Inquiry", reference_name=inquiry["name"])
        self.assertEqual(api.get_conversation(linked.name)["reference_name"], inquiry["name"])
        frappe.set_user(self.users["two"])
        with self.assertRaises(frappe.PermissionError):
            api.get_conversation(linked.name)
        with self.assertRaises(frappe.PermissionError):
            api.apply_control(linked.name, "take", 1, uuid4().hex)

    def test_current_shop_scope_and_target_owner(self):
        if not self.shop:
            self.skipTest("Optional shop dimension absent; bare CRM covered separately")
        frappe.set_user(self.users["outsider"])
        with self.assertRaises(frappe.PermissionError):
            api.get_conversation(self.doc.name)
        frappe.set_user(self.users["one"])
        self.command()
        with self.assertRaises(frappe.PermissionError):
            self.command("transfer", 2, owner=self.users["outsider"])
        frappe.db.delete("User Permission", {"user": self.users["one"], "allow": "Social Shop", "for_value": self.shop})
        with self.assertRaises(frappe.PermissionError):
            api.get_conversation(self.doc.name)
        with self.assertRaises(frappe.PermissionError):
            self.command(generation=2)

    def test_no_nested_transaction_boundary_or_sensitive_realtime(self):
        with patch.object(frappe.db, "commit", side_effect=AssertionError("nested commit")), \
             patch.object(frappe.db, "rollback", side_effect=AssertionError("nested rollback")):
            self.command()
        args, kwargs = self.realtime.call_args
        self.assertEqual(set(args[1]), {"name", "generation"})
        self.assertEqual(kwargs["user"], self.users["one"])
        self.assertTrue(kwargs["after_commit"])
        projected = api.get_conversation(self.doc.name)
        for forbidden in ("token", "app_secret", "notes", "transcript", "payload"):
            self.assertNotIn(forbidden, projected)

    def test_external_echo_is_deduplicated_and_normal_retry_still_holds(self):
        self.seed_bot()
        receipt = self.receipt()
        with self.receipt_context(receipt, replay=True):
            first = self.observation()
            again = self.observation()
        self.assertEqual((first["control_state"], first["generation"], first["bot_enabled"]), ("Human", 2, 0))
        self.assertTrue(again["replayed"])
        self.assertEqual(frappe.db.count(api.EVENT, {"conversation": self.doc.name}), 1)

    def test_provider_first_attempt_rollback_then_retry_applies_hold(self):
        self.seed_bot()
        receipt = self.receipt()
        point = "provider_attempt_" + uuid4().hex
        frappe.db.savepoint(point)
        with self.receipt_context(receipt):
            self.observation()
        frappe.db.rollback(save_point=point)
        self.assertEqual(frappe.db.get_value(api.DOCTYPE, self.doc.name, "control_state"), "Bot")
        with self.receipt_context(receipt, replay=True):
            retried = self.observation()
        self.assertFalse(retried["replayed"])
        self.assertEqual((retried["control_state"], retried["generation"]), ("Human", 2))

    def test_history_and_correlated_echo_never_change_authority(self):
        self.seed_bot()
        for kind, action, explicit in (("history", "external_outbound", False),
                                       ("smb_message_echoes", "external_outbound", True),
                                       ("smb_message_echoes", "own_outbound", False)):
            with self.subTest(kind=kind, action=action), self.receipt_context(self.receipt(kind)):
                result = self.observation(action, historical=explicit)
                self.assertEqual((result["control_state"], result["generation"]), ("Bot", 1))

    def test_provider_loss_and_return_never_resume_bot(self):
        self.seed_bot()
        with self.receipt_context(self.receipt()):
            lost = self.observation("control_lost")
        with self.receipt_context(self.receipt()):
            returned = self.observation("control_returned")
        self.assertEqual((lost["control_state"], lost["provider_control"]), ("Paused", "Other"))
        self.assertEqual((returned["control_state"], returned["provider_control"], returned["bot_enabled"]), ("Paused", "Ours", 0))
        self.assertGreater(returned["generation"], lost["generation"])

    def test_external_echo_cannot_reopen_closed_conversation(self):
        self.command()
        self.command("close", 2)
        with self.receipt_context(self.receipt()):
            result = self.observation()
        self.assertEqual((result["control_state"], result["bot_enabled"]), ("Closed", 0))

    def test_provider_observation_rejects_untrusted_and_foreign_account(self):
        with self.assertRaises(frappe.PermissionError):
            self.observation()
        with self.receipt_context(self.receipt(account_id=self.account_id + "1")):
            with self.assertRaises(frappe.PermissionError):
                self.observation()
        self.assertEqual(frappe.db.count(api.EVENT, {"conversation": self.doc.name}), 0)

    def test_current_role_and_enabled_user_revocation(self):
        # Cache population cannot preserve a revoked role in a later command.
        frappe.get_roles(self.users["one"])
        self.command()
        frappe.db.delete("Has Role", {"parent": self.users["one"], "parenttype": "User", "role": "Sales User"})
        with self.assertRaises(frappe.PermissionError):
            self.command(generation=2)
        frappe.set_user(self.users["two"])
        frappe.db.set_value("User", self.users["two"], "enabled", 0)
        with self.assertRaises(frappe.PermissionError):
            api.get_conversation(self.doc.name)

    def test_account_rebinding_and_shop_movement_cannot_redirect(self):
        if self.shop:
            frappe.db.set_value("WhatsApp Account", self.account.name, "doco_shop", None)
            with self.assertRaises(frappe.PermissionError):
                api.get_conversation(self.doc.name)
            frappe.db.set_value("WhatsApp Account", self.account.name, "doco_shop", self.shop)
        frappe.db.set_value("WhatsApp Account", self.account.name, "phone_id", self.account_id + "1")
        frappe.set_user("Administrator")
        frappe.get_doc({"doctype": "WhatsApp Account", "account_name": self.prefix + uuid4().hex[:8],
                        "phone_id": self.account_id, "status": "Active", "mode": "Demo", "doco_shop": self.shop}).insert()
        for action in (lambda: api.get_conversation(self.doc.name),
                       lambda: api.get_or_create("WhatsApp", self.account_id, self.peer)):
            with self.assertRaises(frappe.PermissionError):
                action()

    def test_broker_list_never_exposes_another_reference(self):
        from crm.api.inquiries import create_inquiry
        inquiry = create_inquiry({"title": "Fictional private inquiry", "source_type": "Manual", "client_request_id": uuid4().hex})
        linked = api.get_or_create("WhatsApp", self.account_id, self.peer + "2",
                                  reference_doctype="CRM Inquiry", reference_name=inquiry["name"])
        frappe.set_user(self.users["two"])
        rows = api.list_conversations("WhatsApp", self.account_id)
        self.assertEqual([row["name"] for row in rows], [self.doc.name])
        self.assertNotIn(linked.name, str(rows))
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            api.list_conversations("WhatsApp", self.account_id)

    def test_messenger_send_roles_stay_narrow(self):
        if "doco_marketing" not in frappe.get_installed_apps():
            self.skipTest("Optional Messenger adapter absent")
        frappe.set_user("Administrator")
        page_id = self.account_id + "2"
        frappe.get_doc({"doctype": "Messenger Page", "page_name": self.prefix,
                        "page_id": page_id, "enabled": 1, "shop": self.shop}).insert()
        doc = api.get_or_create("Messenger", page_id, self.peer)
        frappe.set_user(self.users["manager"])
        with self.assertRaises(frappe.PermissionError):
            api.apply_control(doc.name, "take", 1, uuid4().hex)
        frappe.set_user(self.users["one"])
        result = api.apply_control(doc.name, "take", 1, uuid4().hex)
        self.assertEqual(result["generation"], 2)
        with api.conversation_fence(doc.name), self.assertRaises(frappe.PermissionError):
            api.assert_current_generation(doc.name, 2)  # Provider control is still Unknown.


class TestConversationCore(IntegrationTestCase):
    """Runs with frappe+crm only: optional channels never become hard imports."""
    def setUp(self):
        super().setUp()
        frappe.set_user("Administrator")

    def test_private_schema_has_no_optional_doctype_links(self):
        allowed = {"CRM Conversation", "User"}
        for name in (api.DOCTYPE, api.EVENT):
            meta = frappe.get_meta(name)
            self.assertFalse(meta.permissions)
            for field in meta.fields:
                if field.fieldtype == "Link":
                    self.assertIn(field.options, allowed)
        self.assertEqual(frappe.get_meta(api.DOCTYPE).get_field("control_state").default, "Human")
        self.assertEqual(frappe.get_meta(api.DOCTYPE).get_field("bot_enabled").default, "0")

    def test_absent_channel_adapter_is_denied_without_import(self):
        if set(frappe.get_installed_apps()) != {"frappe", "crm"}:
            self.skipTest("Run adapter absence on the actual Frappe+CRM site; installed hooks must agree")
        for provider in ("WhatsApp", "Messenger", "Instagram"):
            with self.subTest(provider=provider), self.assertRaises(frappe.PermissionError):
                api.get_or_create(provider, "980000111", "5215550100888")
        with self.assertRaises(frappe.ValidationError):
            api.get_or_create("Web", "980000111", "visitor-opaque")
        with self.assertRaises(frappe.ValidationError):
            api.get_or_create("Desk", "980000111", "Administrator")

    def test_administrator_generic_create_cannot_forge_service(self):
        doc = frappe.get_doc({"doctype": api.DOCTYPE, "provider": "WhatsApp", "account_id": "980000112",
                              "peer_id": "5215550100777", "account_record": "fictional",
                              "control_state": "Bot", "bot_enabled": 1})
        with self.assertRaises(frappe.PermissionError):
            doc.insert(ignore_permissions=True)
