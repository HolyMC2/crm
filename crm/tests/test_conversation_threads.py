"""Isolated SQL broker contracts; fictional records, no sends/SMTP/dispatch."""
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import conversation_threads as api
from crm.api import conversations as control
from crm.conversation_scope import assert_customer_peer


class TestConversationThreads(IntegrationTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        cls.prefix = "customer-thread-" + uuid4().hex[:10]
        cls.actor = cls.prefix + "@example.invalid"
        with patch("frappe.sendmail"), patch("frappe.enqueue"):
            frappe.get_doc({"doctype": "User", "email": cls.actor, "first_name": "Fictional operator",
                "enabled": 1, "send_welcome_email": 0, "roles": [{"role": "Sales User"}]}).insert()
        cls.shop = frappe.get_doc({"doctype": "Social Shop", "shop_name": cls.prefix, "enabled": 1}).insert().name
        frappe.get_doc({"doctype": "User Permission", "user": cls.actor, "allow": "Social Shop", "for_value": cls.shop}).insert()

    def setUp(self):
        super().setUp()
        frappe.set_user("Administrator")
        self.point = "customer_" + uuid4().hex
        frappe.db.savepoint(self.point)
        for target in ("requests.sessions.Session.request", "frappe.sendmail", "frappe.enqueue"):
            self.enterContext(patch(target, side_effect=AssertionError("External action forbidden")))
        self.enterContext(patch("frappe.publish_realtime"))
        self.account_id = "97" + str(int(uuid4().hex[:12], 16))
        self.peer = "5215550198765"
        self.account = frappe.get_doc({"doctype": "WhatsApp Account", "account_name": self.prefix + uuid4().hex[:6],
            "phone_id": self.account_id, "status": "Active", "mode": "Demo", "doco_shop": self.shop,
            "is_default_incoming": 0, "is_default_outgoing": 0}).insert()
        frappe.set_user(self.actor)

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.rollback(save_point=self.point)
        super().tearDown()

    def message(self, text="Customer message", peer=None, **fields):
        doc = frappe.get_doc({"doctype": "WhatsApp Message", "name": uuid4().hex,
            "type": "Incoming", "from": peer or self.peer, "whatsapp_account": self.account.name,
            "message": text, "content_type": "text", "creation": "2026-01-01 12:00:00", **fields})
        doc.db_insert()
        return doc

    def inquiry(self):
        name = uuid4().hex
        frappe.get_doc({"doctype": "CRM Inquiry", "name": name, "title": "Fictional inquiry", "status": "New"}).db_insert()
        return name

    def test_account_metadata_and_explicit_legacy_open(self):
        self.message()
        before = frappe.db.count(control.DOCTYPE)
        account = next(a for a in api.list_accounts()["accounts"] if a["account_id"] == self.account_id)
        self.assertEqual(set(account), {"provider", "account_id", "label", "active"})
        item = api.list_threads("WhatsApp", self.account_id)["items"][0]
        self.assertFalse(item["materialized"])
        self.assertEqual(frappe.db.count(control.DOCTYPE), before)
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        self.assertEqual((opened["control_state"], opened["bot_enabled"], opened["generation"]), ("Human", 0, 1))
        self.assertFalse(opened["reference_name"])
        self.assertEqual(api.open_thread("WhatsApp", self.account_id, self.peer)["name"], opened["name"])
        history = api.get_history(opened["name"])
        self.assertEqual(history["messages"][0]["content"], "Customer message")
        self.assertFalse(history["conversation"]["send_available"])

    def test_exact_account_peer_no_phone_suffix_or_default_fallback(self):
        self.message(peer="5215550198766")
        self.message(peer=self.peer, whatsapp_account=None, message="Default account secret")
        with self.assertRaises(frappe.PermissionError):
            api.open_thread("WhatsApp", self.account_id, self.peer)
        self.assertEqual([r["peer_id"] for r in api.list_threads("WhatsApp", self.account_id)["items"]], ["5215550198766"])
        for value in ("+" + self.peer, self.peer[-10:], "not-a-peer"):
            with self.subTest(value=value), self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
                api.open_thread("WhatsApp", self.account_id, value)

    def test_denied_sources_never_supply_preview_body_attachment_or_count(self):
        inquiry = self.inquiry()
        self.message("Readable older")
        self.message("CLINICAL SECRET", reference_doctype="Patient", reference_name="private-chart",
            attach="https://private.invalid/chart", creation="2026-03-01 12:00:00")
        for i in range(205):
            self.message("DENIED SECRET", reference_doctype="CRM Inquiry", reference_name=inquiry,
                creation=f"2026-02-01 12:00:{i % 60:02}")
        with patch.object(api, "has_permission", return_value=False):
            result = api.list_threads("WhatsApp", self.account_id)
            self.assertEqual(result["items"][0]["preview"], "Readable older")
            self.assertNotIn("count", result)
            opened = api.open_thread("WhatsApp", self.account_id, self.peer)
            page, messages = api.get_history(opened["name"]), []
            while True:
                messages.extend(page["messages"])
                if not page["next_cursor"]:
                    break
                page = api.get_history(opened["name"], cursor=page["next_cursor"])
            self.assertEqual([m["content"] for m in messages], ["Readable older"])

    def test_only_denied_history_does_not_materialize(self):
        self.message("CLINICAL SECRET", reference_doctype="Patient", reference_name="private-chart")
        self.assertEqual(api.list_threads("WhatsApp", self.account_id)["items"], [])
        with self.assertRaises(frappe.PermissionError):
            api.open_thread("WhatsApp", self.account_id, self.peer)

    def test_private_disabled_principal_and_historical_assistant_are_excluded(self):
        self.message()
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        frappe.get_doc({"doctype": "Asistente Canal", "name": uuid4().hex, "channel": "WhatsApp",
            "external_id": self.peer, "enabled": 0, "user": self.actor, "role": "Asistente"}).db_insert()
        self.assertEqual(api.list_threads("WhatsApp", self.account_id)["items"], [])
        with self.assertRaises(frappe.PermissionError):
            api.get_history(opened["name"])
        with self.assertRaises(frappe.PermissionError):
            assert_customer_peer("WhatsApp", self.peer)
        history_peer = "5215550198767"
        frappe.get_doc({"doctype": "Books Chat Log", "name": uuid4().hex, "chat_id": "wa:" + history_peer}).db_insert()
        with self.assertRaises(frappe.PermissionError):
            assert_customer_peer("WhatsApp", history_peer)
        assert_customer_peer("WhatsApp", history_peer + "1")

    def test_current_shop_revocation_and_moved_account_deny(self):
        self.message()
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        frappe.db.delete("User Permission", {"user": self.actor, "allow": "Social Shop"})
        self.assertNotIn(self.account_id, [a["account_id"] for a in api.list_accounts()["accounts"]])
        with self.assertRaises(frappe.PermissionError):
            api.get_history(opened["name"])

    def test_denied_core_reference_never_reappears_as_legacy_thread(self):
        self.message()
        doc = control.get_or_create("WhatsApp", self.account_id, self.peer)
        frappe.db.set_value(control.DOCTYPE, doc.name, {"reference_doctype": "Patient", "reference_name": "private-chart"})
        self.assertEqual(api.list_threads("WhatsApp", self.account_id)["items"], [])
        with self.assertRaises(frappe.PermissionError):
            api.open_thread("WhatsApp", self.account_id, self.peer)

    def test_cursors_are_account_user_bound_and_history_has_no_duplicates(self):
        for i in range(4):
            self.message(str(i), creation=f"2026-01-01 12:00:0{i}")
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        first = api.get_history(opened["name"], limit=2)
        second = api.get_history(opened["name"], cursor=first["next_cursor"], limit=2)
        self.assertEqual([m["content"] for m in second["messages"] + first["messages"]], ["0", "1", "2", "3"])
        self.assertIsNone(second["next_cursor"])
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            api.get_history(opened["name"], cursor=first["next_cursor"])

    def test_remote_attachment_is_withheld_and_html_stays_plain_text(self):
        self.message('<img src=x onerror="alert(1)">', attach="https://provider.invalid/secret", content_type="image")
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        message = api.get_history(opened["name"])["messages"][0]
        self.assertIsNone(message["attach"])
        self.assertTrue(message["attachment_restricted"])
        self.assertEqual(message["content"], '<img src=x onerror="alert(1)">')

    def test_messenger_and_instagram_keep_exact_page_platform_and_peer(self):
        page_id, ig_id = self.account_id + "1", self.account_id + "2"
        page = frappe.get_doc({"doctype": "Messenger Page", "name": uuid4().hex,
            "page_name": "Fictional page", "page_id": page_id, "ig_account_id": ig_id,
            "enabled": 1, "shop": self.shop})
        page.db_insert()
        for platform in ("Messenger", "Instagram"):
            frappe.get_doc({"doctype": "Messenger Message", "name": uuid4().hex,
                "direction": "Incoming", "platform": platform, "page_id": page_id,
                "psid": self.peer, "content": platform + " exact", "content_type": "text"}).db_insert()
        for provider, identity in (("Messenger", page_id), ("Instagram", ig_id)):
            with self.subTest(provider=provider):
                result = api.list_threads(provider, identity)
                self.assertEqual(result["items"][0]["preview"], provider + " exact")
                opened = api.open_thread(provider, identity, self.peer)
                self.assertEqual([m["content"] for m in api.get_history(opened["name"])["messages"]], [provider + " exact"])

    def test_actions_and_requests_are_safe_projections(self):
        self.message()
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        self.assertIn("take", opened["allowed_actions"])
        control.apply_control(opened["name"], "take", 1, uuid4().hex)
        self.assertTrue(api.get_history(opened["name"])["conversation"]["send_available"])
        frappe.set_user("Administrator")
        control.apply_control(opened["name"], "request", 2, uuid4().hex, reason="PRIVATE REASON")
        detail = api.get_history(opened["name"])["conversation"]
        self.assertEqual(detail["control_requests"][0]["actor_user"], "Administrator")
        self.assertNotIn("reason", detail["control_requests"][0])

    def test_native_reply_response_loss_reuses_one_durable_row(self):
        from crm.api import outbox
        self.message()
        opened = api.open_thread("WhatsApp", self.account_id, self.peer)
        control.apply_control(opened["name"], "take", 1, uuid4().hex)
        request = uuid4().hex
        body = {"type": "text", "text": "Fictional customer reply <script>inert</script>"}
        first = outbox.queue_message(opened["name"], 2, request, body)
        # Simulate loss of the first response: client repeats the exact frozen request.
        second = outbox.queue_message(opened["name"], 2, request, body)
        self.assertEqual(first["name"], second["name"])
        self.assertEqual(frappe.db.count(outbox.DOCTYPE, {"conversation": opened["name"]}), 1)
        self.assertEqual(first["state"], "Queued")
        control.apply_control(opened["name"], "release", 2, uuid4().hex)
        self.assertFalse(api.get_history(opened["name"])["conversation"]["send_available"])
        replay = outbox.queue_message(opened["name"], 2, request, body)
        self.assertEqual(replay["name"], first["name"])
        with self.assertRaises((frappe.PermissionError, frappe.TimestampMismatchError)):
            outbox.queue_message(opened["name"], 2, uuid4().hex, body)
        self.assertEqual(frappe.db.count(outbox.DOCTYPE, {"conversation": opened["name"]}), 1)


class TestConversationThreadsCore(IntegrationTestCase):
    def test_absent_optional_apps_returns_empty_capability(self):
        frappe.set_user("Administrator")
        with patch.object(api, "_channel_available", return_value=False):
            self.assertEqual(api.list_accounts()["accounts"], [])
            assert_customer_peer("WhatsApp", "5215550100000")

    def test_real_core_only_capability_when_optional_apps_absent(self):
        frappe.set_user("Administrator")
        if not {"frappe_whatsapp", "doco_marketing"}.intersection(frappe.get_installed_apps()):
            self.assertEqual(api.list_accounts()["accounts"], [])

    def test_guest_is_denied(self):
        frappe.set_user("Guest")
        try:
            with self.assertRaises(frappe.PermissionError):
                api.list_accounts()
        finally:
            frappe.set_user("Administrator")
