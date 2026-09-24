"""Provider thread-owner verification and the final send gate on the real schema.

Dedicated lab only: fictional users, shop, Page and credentials inside a
savepoint that is always rolled back. Meta is replaced by `requests.get`
doubles; message POSTs, other HTTP, mail and queues are blocked or recorded.
These are native integration checks with provider doubles, not live Meta E2E.
`bench --site <lab> execute crm.tests.test_provider_control.run_native`
"""
from contextlib import contextmanager
import json
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

import frappe
import requests

from crm.api import conversations as control
from crm.api import outbox
from crm.api import provider_control

APP = "900001"


def _require(*doctypes):
    if "doco_marketing" not in frappe.get_installed_apps():
        raise unittest.SkipTest("Install doco_marketing on the isolated lab first.")
    missing = [dt for dt in doctypes if not frappe.db.exists("DocType", dt)]
    if missing:
        raise unittest.SkipTest("Install/migrate on the isolated lab first: " + ", ".join(missing))
    if not frappe.db.has_column("Messenger Page", "instagram_login_type"):
        raise unittest.SkipTest("Run the doco_marketing migration for Messenger Page.instagram_login_type first.")


class _Isolated(unittest.TestCase):
    def setUp(self):
        frappe.db.rollback()
        frappe.db.get_value("User", "Administrator", "enabled", for_update=True)
        _require(control.DOCTYPE, control.EVENT, outbox.DOCTYPE, "Messenger Page", "Messenger Settings", "Social Shop")
        from doco_marketing.tests.test_native_provider_control import Response, body
        self.Response, self.body = Response, body
        self.previous_user = frappe.session.user
        frappe.set_user("Administrator")
        self.point = "provider_control_" + uuid4().hex
        frappe.db.savepoint(self.point)
        self.addCleanup(self._restore)
        self.enterContext(patch("requests.sessions.Session.request", side_effect=AssertionError("No external requests")))
        self.get = self.enterContext(patch.object(requests, "get", side_effect=lambda *a, **k: Response(payload=body())))
        self.post = self.enterContext(patch.object(requests, "post", side_effect=AssertionError("No message sends")))
        self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("No mail")))
        self.enqueue = self.enterContext(patch("frappe.enqueue"))
        self.realtime = self.enterContext(patch("frappe.publish_realtime"))
        uid = uuid4().hex
        self.uid, self.prefix = uid, "provider-" + uid[:10]
        frappe.db.set_single_value("Messenger Settings", {"app_id": APP, "graph_api_version": "v25.0"})
        self.shop = self.new_shop()
        self.page_id = str(int(uid[:12], 16) + 10 ** 14)
        self.ig_id = str(int(uid[12:24], 16) + 2 * 10 ** 14)
        self.token = "fixture-page-token-" + uid
        self.page = frappe.get_doc({"doctype": "Messenger Page", "page_name": "Provider Fictional " + uid[:8],
            "page_id": self.page_id, "ig_account_id": self.ig_id, "enabled": 1, "shop": self.shop,
            "page_access_token": self.token, "instagram_access_token": "fixture-ig-token-" + uid,
            "instagram_login_type": "Instagram Login"}).insert(ignore_permissions=True).name
        self.manager = self.user("manager", self.shop, "Sales User", "Sales Manager")
        self.seller = self.user("seller", self.shop, "Sales User")
        self.colleague = self.user("colleague", self.shop, "Sales User")
        self.stranger = self.user("stranger", self.new_shop(), "Sales User", "Sales Manager")
        self.psid = str(int(uid[24:32], 16) + 10 ** 10)
        self.conv = control.get_or_create("Messenger", self.page_id, self.psid)
        for double in (self.get, self.enqueue, self.realtime):
            double.reset_mock()

    def _restore(self):
        frappe.set_user("Administrator")
        frappe.db.rollback(save_point=self.point)
        frappe.set_user(self.previous_user)

    def new_shop(self):
        return frappe.get_doc({"doctype": "Social Shop", "shop_name": self.prefix + "-" + uuid4().hex[:6],
                               "enabled": 1}).insert(ignore_permissions=True).name

    def user(self, label, shop, *roles):
        name = f"{self.prefix}-{label}@example.invalid"
        frappe.get_doc({"doctype": "User", "email": name, "first_name": "Fictional " + label, "enabled": 1,
                        "send_welcome_email": 0, "roles": [{"role": role} for role in roles]}).insert()
        frappe.get_doc({"doctype": "User Permission", "user": name, "allow": "Social Shop", "for_value": shop}).insert()
        return name

    @contextmanager
    def as_user(self, user):
        frappe.set_user(user)
        try:
            yield
        finally:
            frappe.set_user("Administrator")

    def answer(self, factory):
        self.get.side_effect = lambda *a, **k: factory()

    def current(self, conv=None):
        return frappe.db.get_value(control.DOCTYPE, (conv or self.conv).name,
            ["control_state", "human_owner", "bot_enabled", "provider_control", "generation"], as_dict=True)

    def seed(self, conv=None, **values):
        frappe.db.set_value(control.DOCTYPE, (conv or self.conv).name, values, update_modified=False)

    def verify(self, user, command=None, generation=None, conv=None):
        conv = conv or self.conv
        generation = generation or self.current(conv).generation
        with self.as_user(user):
            return provider_control.verify(conv.name, generation, command or "verify-" + uuid4().hex)

    def events(self, conv=None):
        return frappe.get_all(control.EVENT, filters={"conversation": (conv or self.conv).name, "action": "provider_verify"},
            fields=["origin", "actor_user", "from_generation", "to_generation", "reason", "result_json"],
            order_by="creation asc")

    def assert_nothing_sent(self):
        self.post.assert_not_called()
        self.enqueue.assert_not_called()
        self.assertFalse(frappe.get_all(outbox.DOCTYPE, filters={"conversation": self.conv.name}, limit=1))


class TestVerify(_Isolated):
    def test_manager_query_records_ours_with_audit_and_sends_nothing(self):
        result = self.verify(self.manager, "verify-" + self.uid)
        self.assertEqual((result["provider_control"], result["generation"], result["changed"], result["replayed"]),
                         ("Ours", 2, True, False))
        check = result["verification"]
        self.assertEqual((check["outcome"], check["reason_code"], check["owner_kind"], check["owner_app_id"],
                          check["app_id"], check["send_ready"]),
                         ("ours", "provider_owner_verified", "this_app", APP, APP, True))
        self.assertIn("Meta confirma", result["message"])
        args, kwargs = self.get.call_args
        self.assertEqual(self.get.call_count, 1)
        self.assertEqual(args, (f"https://graph.facebook.com/v25.0/{self.page_id}/thread_owner",))
        self.assertEqual(kwargs["params"], {"recipient": self.psid})
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer " + self.token)
        self.assertFalse(kwargs["allow_redirects"])
        self.assertEqual(self.current(), {"control_state": "Human", "human_owner": None, "bot_enabled": 0,
                                          "provider_control": "Ours", "generation": 2})
        [event] = self.events()
        self.assertEqual((event.origin, event.actor_user, event.from_generation, event.to_generation, event.reason),
                         ("Human", self.manager, 1, 2, "provider_owner_verified"))
        self.assertEqual(json.loads(event.result_json)["verification"]["outcome"], "ours")
        self.assertNotIn(self.token, event.result_json)
        self.assert_nothing_sent()

    def test_replay_returns_the_stored_answer_without_a_second_query(self):
        self.verify(self.manager, "verify-" + self.uid, generation=1)
        self.answer(lambda: self.Response(payload=self.body(app_id="263902037430900")))
        self.get.reset_mock()
        again = self.verify(self.manager, "verify-" + self.uid, generation=1)
        self.assertEqual((again["replayed"], again["provider_control"], again["generation"]), (True, "Ours", 2))
        with self.assertRaises(frappe.ValidationError):
            self.verify(self.manager, "verify-" + self.uid, generation=2)
        self.get.assert_not_called()
        self.assertEqual(self.current().provider_control, "Ours")
        self.assertEqual(len(self.events()), 1)

    def test_stale_generation_and_closed_conversation_conflict_before_any_query(self):
        with self.assertRaises(frappe.TimestampMismatchError):
            self.verify(self.manager, generation=7)
        with self.as_user(self.manager):
            control.apply_control(self.conv.name, "close", 1, "close-" + self.uid, reason="fixture")
        with self.assertRaises(frappe.TimestampMismatchError):
            self.verify(self.manager)
        self.get.assert_not_called()
        self.assertEqual(self.events(), [])

    def test_only_a_manager_or_the_current_owner_may_ask(self):
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.seller)
        with self.as_user(self.seller):
            control.apply_control(self.conv.name, "take", 1, "take-" + self.uid)
        result = self.verify(self.seller)
        self.assertEqual((result["provider_control"], result["human_owner"], result["generation"]),
                         ("Ours", self.seller, 3))
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.colleague)
        self.assertEqual(self.get.call_count, 1)

    def test_role_revocation_denies_new_commands_and_then_replays(self):
        self.verify(self.manager, "verify-" + self.uid, generation=1)
        self.get.reset_mock()
        frappe.get_doc("User", self.manager).remove_roles("Sales Manager")
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.manager)
        # Its own earlier answer stays readable while the channel role remains; nothing is re-queried.
        self.assertTrue(self.verify(self.manager, "verify-" + self.uid, generation=1)["replayed"])
        frappe.get_doc("User", self.manager).remove_roles("Sales User")
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.manager, "verify-" + self.uid, generation=1)
        self.get.assert_not_called()

    def test_shop_scope_disabled_or_remapped_account_deny_before_any_query(self):
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.stranger)
        frappe.db.set_value("Messenger Page", self.page, "enabled", 0)
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.manager)
        frappe.db.set_value("Messenger Page", self.page, "enabled", 1)
        self.seed(account_record="another-page-record")
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.manager)
        self.get.assert_not_called()

    def test_other_app_keeps_the_human_owner_and_blocks_native_replies(self):
        with self.as_user(self.seller):
            control.apply_control(self.conv.name, "take", 1, "take-" + self.uid)
        self.answer(lambda: self.Response(payload=self.body(app_id="263902037430900")))
        result = self.verify(self.manager)
        self.assertEqual((result["provider_control"], result["human_owner"], result["control_state"], result["generation"]),
                         ("Other", self.seller, "Human", 3))
        self.assertEqual((result["verification"]["owner_kind"], result["verification"]["send_ready"]), ("meta_inbox", False))
        self.assertIn(self.seller, [call.kwargs.get("user") for call in self.realtime.call_args_list])
        with self.as_user(self.seller), self.assertRaises(frappe.PermissionError):
            outbox.queue_message(self.conv.name, 3, "reply-" + self.uid, {"type": "text", "text": "Hola"})
        self.assert_nothing_sent()

    def test_losing_control_revokes_the_bot_grant_and_returns_people(self):
        self.seed(control_state="Bot", bot_enabled=1, provider_control="Ours", generation=4)
        self.answer(lambda: self.Response(payload=self.body(app_id=None)))
        result = self.verify(self.manager)
        self.assertEqual(self.current(), {"control_state": "Human", "human_owner": None, "bot_enabled": 0,
                                          "provider_control": "Other", "generation": 5})
        if frappe.db.has_column(control.DOCTYPE, "automation_state"):
            self.assertEqual(result["automation_state"], "Handed off")
        with control.conversation_fence(self.conv.name), self.assertRaises(frappe.PermissionError):
            control.assert_current_generation(self.conv.name, 5, origin="Bot", actor_user=self.manager,
                                              run_name="fixture-run")
        self.assert_nothing_sent()

    def test_inconclusive_answers_never_grant_and_retire_a_stored_ours(self):
        R, body = self.Response, self.body

        def timeout():
            raise requests.Timeout()

        cases = [
            ("unavailable", timeout),
            ("unavailable", lambda: R(302, headers={"Location": "https://evil.invalid", "Content-Type": "application/json"}, payload={})),
            ("unavailable", lambda: R(500, payload={})),
            ("denied", lambda: R(403, payload={"error": {"code": 10}})),
            ("rate_limited", lambda: R(429, payload={"error": {"code": 4}})),
            ("invalid", lambda: R(chunks=[b'{"data":[{"thread_owner":{"app_id":"900001"}}],"data":[]}'])),
            ("invalid", lambda: R(chunks=[b"{" + b" " * (64 * 1024) + b"}"])),
            ("invalid", lambda: R(payload={"data": [body()["data"][0]] * 2})),
            ("not_owner", lambda: R(payload={"data": []})),
        ]
        for outcome, factory in cases:
            self.seed(provider_control="Ours")
            generation = self.current().generation
            self.answer(factory)
            result = self.verify(self.manager)
            self.assertEqual((result["verification"]["outcome"], result["provider_control"], result["changed"],
                              result["generation"]), (outcome, "Unknown", True, generation + 1), outcome)
            again = self.verify(self.manager)
            self.assertEqual((again["provider_control"], again["changed"], again["generation"]),
                             ("Unknown", False, generation + 1), outcome)
            self.assertNotIn(self.token, frappe.as_json(result) + frappe.as_json(again))
        self.assert_nothing_sent()

    def test_instagram_login_is_unsupported_without_a_query_and_never_ours(self):
        ig = control.get_or_create("Instagram", self.ig_id, str(int(self.uid[:8], 16) + 3 * 10 ** 10))
        result = self.verify(self.manager, conv=ig)
        self.assertEqual((result["verification"]["outcome"], result["provider_control"], result["changed"]),
                         ("unsupported", "Unknown", False))
        self.assertIn("Instagram", result["message"])
        self.seed(conv=ig, provider_control="Ours")
        self.assertEqual(self.verify(self.manager, conv=ig)["provider_control"], "Unknown")
        self.get.assert_not_called()

    def test_instagram_facebook_login_uses_the_documented_page_query(self):
        frappe.db.set_value("Messenger Page", self.page, "instagram_login_type", "Facebook Login")
        igsid = str(int(self.uid[:8], 16) + 3 * 10 ** 10)
        ig = control.get_or_create("Instagram", self.ig_id, igsid)
        self.assertEqual(self.verify(self.manager, conv=ig)["provider_control"], "Ours")
        args, kwargs = self.get.call_args
        self.assertEqual((args, kwargs["params"], kwargs["headers"]["Authorization"]),
                         ((f"https://graph.facebook.com/v25.0/{self.page_id}/thread_owner",), {"recipient": igsid},
                          "Bearer " + self.token))

    def test_missing_app_identity_blocks_without_a_query(self):
        frappe.db.set_single_value("Messenger Settings", "app_id", "")
        result = self.verify(self.manager)
        self.assertEqual((result["verification"]["outcome"], result["provider_control"]), ("unconfigured", "Unknown"))
        self.assertIn("App ID", result["message"])
        self.get.assert_not_called()

    def test_account_token_or_app_rotation_during_the_query_invalidates_the_answer(self):
        from frappe.utils.password import set_encrypted_password

        def rotating(change):
            def answer(*args, **kwargs):
                change()
                return self.Response(payload=self.body())
            return answer

        for change in (lambda: set_encrypted_password("Messenger Page", self.page, "rotated-" + uuid4().hex, "page_access_token"),
                       lambda: frappe.db.set_single_value("Messenger Settings", "app_id", "900002")):
            self.get.side_effect = rotating(change)
            result = self.verify(self.manager)
            self.assertEqual((result["verification"]["outcome"], result["provider_control"], result["changed"]),
                             ("account_changed", "Unknown", False))
        # A Page moved to another shop fails the conversation's own locked reread: no answer is recorded.
        events = len(self.events())
        self.get.side_effect = rotating(lambda: frappe.db.set_value("Messenger Page", self.page, "shop", self.new_shop()))
        with self.assertRaises(frappe.PermissionError):
            self.verify(self.manager)
        self.assertEqual((len(self.events()), self.current().provider_control), (events, "Unknown"))


class TestFinalDispatch(_Isolated):
    @contextmanager
    def worker(self):
        """Dispatcher-owned commits/rollbacks are no-ops inside the fixture savepoint."""
        conf = frappe._dict(frappe.local.conf or {})
        conf.maintenance_mode = 0  # lab maintenance windows are not what this test is about
        with patch.object(frappe.db, "commit"), patch.object(frappe.db, "rollback"), patch.object(frappe, "conf", conf), \
                patch("doco_marketing.services.automation_gateway.reply_reason", return_value=None):
            yield

    def queue(self, generation):
        with self.as_user(self.seller):
            return outbox.queue_message(self.conv.name, generation, "reply-" + uuid4().hex,
                                        {"type": "text", "text": "Tu equipo está listo"})["name"]

    def test_final_send_rechecks_the_owner_and_denial_never_posts(self):
        self.verify(self.manager)
        with self.as_user(self.seller):
            control.apply_control(self.conv.name, "take", 2, "take-" + self.uid)
        stale = self.queue(3)
        # Meta moved the thread to its inbox after our stored `Ours`.
        self.answer(lambda: self.Response(payload=self.body(app_id="263902037430900")))
        self.get.reset_mock()
        with self.worker():
            outbox.dispatch_intent(stale)
        state = frappe.db.get_value(outbox.DOCTYPE, stale, ["state", "reason_code", "provider_message_id"], as_dict=True)
        self.assertEqual((state.state, state.reason_code, state.provider_message_id),
                         ("Blocked", "provider_owner_other_app", None))
        self.assertEqual(self.get.call_count, 1)
        self.post.assert_not_called()

        current = self.queue(3)
        calls = Mock()
        calls.attach_mock(self.get, "get")
        calls.attach_mock(self.post, "post")
        self.answer(lambda: self.Response(payload=self.body()))
        mid = "mid.fixture-" + uuid4().hex
        self.post.side_effect = None
        self.post.return_value = self.Response(payload={"recipient_id": self.psid, "message_id": mid})
        with self.worker():
            outbox.dispatch_intent(current)
        self.assertEqual(frappe.db.get_value(outbox.DOCTYPE, current, ["state", "provider_message_id"]), ("Accepted", mid))
        self.assertEqual([call[0] for call in calls.mock_calls if call[0] in {"get", "post"}], ["get", "post"])
        self.assertEqual(self.post.call_args.args, (f"https://graph.facebook.com/v25.0/{self.page_id}/messages",))


def run_native():
    """Bounded lab runner. Each test rolls back its own savepoint; the final
    rollback leaves nothing for bench's closing commit. No test-record bootstrap."""
    import sys
    if not (frappe.local.site or "").endswith(".lab.xoloitzcuintles.com"):
        raise RuntimeError("Dedicated lab only")
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    try:
        with patch.object(frappe.db, "commit"):
            result = unittest.TextTestRunner(verbosity=2).run(suite)
    finally:
        frappe.db.rollback()
    return {"ran": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
            "skipped": len(result.skipped)}
