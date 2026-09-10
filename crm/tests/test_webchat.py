"""Private visitor protocol: isolated SQL, rollback-only fixtures, no transport."""
from contextlib import contextmanager
from datetime import datetime, timedelta
import json
import unittest
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import now_datetime
from werkzeug.exceptions import HTTPException
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from crm.api import webchat as api
from crm.api import conversations as control
REAL_RATE = api._rate


class TestWebchat(unittest.TestCase):
    def setUp(self):
        self.point = "webchat_" + uuid4().hex
        frappe.db.savepoint(self.point)
        self.addCleanup(lambda: frappe.db.rollback(save_point=self.point))
        self.enterContext(patch.object(frappe.local, "session", frappe._dict(user="Administrator")))
        self.enterContext(patch("requests.sessions.Session.request", side_effect=AssertionError("Transport forbidden")))
        self.enterContext(patch("frappe.sendmail", side_effect=AssertionError("Mail forbidden")))
        self.enterContext(patch("frappe.enqueue", side_effect=AssertionError("Queue forbidden")))
        self.realtime = self.enterContext(patch("frappe.publish_realtime"))
        self.rate = self.enterContext(patch.object(api, "_rate"))
        self.channel = self.configure()
        self.other = self.configure()
        self.first = self.rpc("bootstrap", channel_id=self.channel["account_id"])
        self.capability = self.first["capability"]
        self.realtime.reset_mock()

    def configure(self, **overrides):
        return api.configure_channel(**{"label": "Fictional Webchat", "profile": "fictional-" + uuid4().hex,
            "public_origin": "https://fictional.example.invalid", "enabled": 1, **overrides})

    @contextmanager
    def request(self, body, *, raw=None, method="POST", query_string="", mimetype="application/json", endpoint="history", capability=None):
        request = Request(EnvironBuilder(path="/api/method/crm.api.webchat." + endpoint, method=method,
            headers={"Authorization": "Bearer " + capability} if capability else {},
            data=raw if raw is not None else json.dumps(body).encode(), content_type=mimetype,
            query_string=query_string, environ_base={"REMOTE_ADDR": "192.0.2.88"}).get_environ())
        with patch.object(frappe.local, "request", request, create=True), \
                patch.object(frappe.local, "form_dict", frappe._dict(body), create=True), \
                patch.object(frappe.local, "response_headers", {}, create=True), \
                patch.object(frappe.local, "session", frappe._dict(user="Guest")), \
                patch.object(frappe.local, "webchat_authority", None, create=True):
            yield request

    def rpc(self, method, **arguments):
        capability = arguments.pop("capability", None)
        with self.request(arguments, endpoint=method, capability=capability):
            api.prepare_request()
            return getattr(api, method)(**arguments)

    def send(self, text="Fictional customer text", request_id=None, **overrides):
        return self.rpc("send", **{"capability": self.capability, "channel_id": self.channel["account_id"],
            "text": text, "request_id": request_id or uuid4().hex, **overrides})

    def failure(self, status, callback):
        with self.assertRaises(HTTPException) as caught:
            callback()
        response = caught.exception.get_response()
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        self.assertNotIn(self.capability, response.get_data(as_text=True))
        return response.get_json()

    def session(self):
        return frappe.get_doc(api.SESSION, {"capability_hash": api._hash(self.capability)})

    def conversation(self):
        session = self.session()
        return control.conversation_key("Webchat", session.channel, session.peer_id)

    def test_bootstrap_private_random_identity_and_no_conversation(self):
        session = self.session()
        self.assertEqual(len(self.capability), 43)
        self.assertEqual(len(session.peer_id), 64)
        self.assertNotEqual(session.peer_id, session.name)
        self.assertNotIn(self.capability, json.dumps(session.as_dict(), default=str))
        self.assertTrue(self.first["expires_at"].endswith("Z"))
        self.assertEqual(session.expires_at - session.creation, timedelta(hours=24))
        self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))
        self.assertEqual(self.rpc("history", capability=self.capability, channel_id=session.channel),
            {"messages": [], "next_cursor": None, "control_state": None})

    def test_expiry_is_twenty_four_elapsed_hours_across_dst(self):
        with patch.object(api, "get_system_timezone", return_value="America/New_York"):
            created = datetime(2026, 3, 7, 12)
            expiry = api._expiry(created)
            self.assertEqual(expiry, datetime(2026, 3, 8, 13))
            self.assertEqual(api._public_time(expiry), "2026-03-08T17:00:00Z")

    def test_first_message_replay_plain_text_and_no_identity_side_effect(self):
        before = {dt: frappe.db.count(dt) for dt in ("CRM Inquiry", "CRM Lead", "Contact")}
        original = "<script>alert('literal')</script> & plain\ntext"
        first = self.send(original, "same")
        second = self.send(original, "same")
        self.assertFalse(first["replayed"])
        self.assertTrue(second["replayed"])
        self.assertEqual(first["message"], second["message"])
        self.assertEqual(first["message"]["text"], original)
        self.assertEqual(set(first["message"]), {"id", "text", "direction", "created_at"})
        doc = frappe.get_doc(control.DOCTYPE, self.conversation())
        self.assertEqual((doc.control_state, doc.bot_enabled, doc.human_owner), ("Human", 0, None))
        self.assertFalse(doc.reference_doctype or doc.reference_name)
        self.assertEqual(frappe.db.count(api.MESSAGE, {"session": self.session().name}), 1)
        self.assertEqual(before, {dt: frappe.db.count(dt) for dt in before})
        self.failure(417, lambda: self.send("changed", "same"))

    def test_channel_and_session_isolation(self):
        first = self.send()
        self.failure(403, lambda: self.rpc("history", capability=self.capability, channel_id=self.other["account_id"]))
        another = self.rpc("bootstrap", channel_id=self.channel["account_id"])
        empty = self.rpc("history", capability=another["capability"], channel_id=self.channel["account_id"])
        self.assertEqual(empty["messages"], [])
        self.failure(417, lambda: self.rpc("history", capability=another["capability"],
            channel_id=self.channel["account_id"], cursor=first["message"]["id"]))

    def test_expired_revoked_and_disabled_fail_closed(self):
        session = self.session()
        with patch.object(api, "now_datetime", return_value=session.expires_at):
            self.failure(403, lambda: self.send())
        args = {"capability": self.capability, "channel_id": session.channel}
        self.assertEqual(self.rpc("revoke", **args), {"revoked": True})
        self.assertEqual(self.rpc("revoke", **args), {"revoked": True})
        self.failure(403, lambda: self.rpc("history", **args))
        frappe.db.set_value(api.CHANNEL, self.other["account_id"], "enabled", 0)
        self.failure(403, lambda: self.rpc("bootstrap", channel_id=self.other["account_id"]))

    def test_closed_prior_replay_allowed_new_send_refused_paused_preserved(self):
        first = self.send(request_id="old")
        name = self.conversation()
        frappe.db.set_value(control.DOCTYPE, name, "control_state", "Closed")
        self.assertTrue(self.send(request_id="old")["replayed"])
        self.failure(417, lambda: self.send(request_id="new"))
        frappe.db.set_value(control.DOCTYPE, name, "control_state", "Paused")
        self.assertEqual(self.send()["control_state"], "Paused")
        self.assertEqual(first["message"]["direction"], "Incoming")

    def test_customer_message_retires_only_current_bot_and_replay_is_inert(self):
        self.send()
        name = self.conversation()
        frappe.db.set_value(control.DOCTYPE, name, {"control_state": "Bot", "bot_enabled": 1})
        first = self.send(request_id="reply")
        self.assertEqual(first["control_state"], "Human")
        current = frappe.db.get_value(control.DOCTYPE, name, ["generation", "bot_enabled"], as_dict=True)
        self.assertEqual(current.bot_enabled, 0)
        count = frappe.db.count(control.EVENT, {"conversation": name})
        self.send(request_id="reply")
        self.assertEqual(frappe.db.count(control.EVENT, {"conversation": name}), count)
        self.assertEqual(frappe.db.get_value(control.DOCTYPE, name, "generation"), current.generation)

    def test_message_and_control_failure_rollback_together(self):
        point = "atomic_" + uuid4().hex
        frappe.db.savepoint(point)
        with patch.object(control, "internal_webchat_customer_reply", side_effect=RuntimeError("fictional database failure")):
            result = self.failure(503, lambda: self.send())
        self.assertEqual(result["reason"], "temporarily_unavailable")
        # HTTP application owns rollback; the service performs no transaction boundary.
        self.assertTrue(frappe.db.exists(control.DOCTYPE, self.conversation()))
        frappe.db.rollback(save_point=point)
        self.assertFalse(frappe.db.exists(control.DOCTYPE, self.conversation()))
        self.assertEqual(frappe.db.count(api.MESSAGE, {"session": self.session().name}), 0)

    def test_history_keyset_traverses_more_than_fifty_without_duplicates(self):
        ids = {self.send(request_id="page-" + str(index))["message"]["id"] for index in range(53)}
        first = self.rpc("history", capability=self.capability, channel_id=self.channel["account_id"])
        self.assertEqual(len(first["messages"]), 50)
        second = self.rpc("history", capability=self.capability, channel_id=self.channel["account_id"], cursor=first["next_cursor"])
        self.assertEqual(len(second["messages"]), 3)
        self.assertIsNone(second["next_cursor"])
        self.assertEqual({row["id"] for row in first["messages"] + second["messages"]}, ids)

    def test_generic_read_and_mutation_denial_including_administrator(self):
        message = self.send()["message"]["id"]
        for user in ("Guest", "Administrator"):
            with patch.object(frappe.local, "session", frappe._dict(user=user)):
                for dt, name in ((api.SESSION, self.session().name), (api.MESSAGE, message)):
                    self.assertFalse(frappe.get_doc(dt, name).has_permission("read"))
                    from frappe.client import get
                    with self.assertRaises(frappe.PermissionError):
                        get(dt, name)
                    try:
                        self.assertEqual(frappe.get_list(dt), [])
                    except frappe.PermissionError:
                        pass
                    with self.assertRaises(frappe.PermissionError):
                        frappe.get_doc(dt, name).check_permission("read")
        doc = frappe.get_doc(api.MESSAGE, message)
        doc.flags.crm_webchat_service = "forged"
        doc.text = "changed"
        with self.assertRaises(frappe.PermissionError):
            doc.save(ignore_permissions=True)
        session = self.session()
        session.revoked = 1
        with self.assertRaises(frappe.PermissionError):
            session.save(ignore_permissions=True)

    def test_generic_list_api_uses_actual_production_mode_privacy_hooks(self):
        from frappe.client import get_list
        self.send()
        with patch.object(frappe.local, "conf", frappe._dict(frappe.conf)):
            frappe.conf.developer_mode = 0
            hooks = frappe.get_hooks("permission_query_conditions")
            for doctype in (api.SESSION, api.MESSAGE):
                self.assertTrue(hooks.get(doctype), "Privacy hooks must be published before guest rollout")
                self.assertEqual(get_list(doctype), [])

    def test_manager_binding_immutable_current_revision_default_off(self):
        new = self.configure(enabled=0)
        self.assertFalse(self.rpc("get_channel", profile=new["profile"], public_origin=new["public_origin"])["available"])
        with self.assertRaises(frappe.ValidationError):
            self.configure(profile=new["profile"], public_origin=new["public_origin"])
        args = {"label": new["label"], "profile": new["profile"], "public_origin": new["public_origin"],
            "enabled": "1", "channel_id": new["account_id"], "expected_modified": new["modified"]}
        result = api.configure_channel(**args)
        self.assertEqual(result["enabled"], 1)
        with self.assertRaises(frappe.ValidationError):
            api.configure_channel(**{**args, "expected_modified": "stale"})
        with self.assertRaises(frappe.ValidationError):
            api.configure_channel(**{**args, "expected_modified": result["modified"], "public_origin": "https://different.example.invalid"})
        with patch.object(frappe.local, "session", frappe._dict(user="Guest")), self.assertRaises(frappe.PermissionError):
            api.configure_channel(**args)

    def test_manager_saved_channel_listing_safe_bounded_and_current(self):
        listed = api.list_channels()
        self.assertLessEqual(len(listed["channels"]), 100)
        self.assertIsInstance(listed["has_more"], bool)
        own = next(row for row in listed["channels"] if row["account_id"] == self.channel["account_id"])
        self.assertEqual(set(own), {"account_id", "label", "profile", "public_origin", "enabled", "modified"})
        changed = api.configure_channel(label="Updated fictional label", profile=own["profile"],
            public_origin=own["public_origin"], enabled=0, channel_id=own["account_id"], expected_modified=own["modified"])
        self.assertEqual(changed["enabled"], 0)
        with patch.object(frappe.local, "session", frappe._dict(user="Guest")), self.assertRaises(frappe.PermissionError):
            api.list_channels()
        with patch.object(frappe.db, "get_value", return_value=0), self.assertRaises(frappe.PermissionError):
            api.list_channels()

    def test_core_private_document_reads_denied_and_native_mutations_still_work(self):
        from crm.api import outbox
        from frappe.client import get
        self.send()
        name = self.conversation()
        with patch.object(frappe.local, "conf", frappe._dict(frappe.conf)):
            frappe.conf.maintenance_mode = 0
            control.apply_control(name, "take", 1, uuid4().hex)
            intent = outbox.queue_message(name, 2, uuid4().hex, {"type": "text", "text": "Private fictional reply"})
        event = frappe.db.get_value(control.EVENT, {"conversation": name}, "name")
        for dt, key in ((control.DOCTYPE, name), (control.EVENT, event), (outbox.DOCTYPE, intent["name"])):
            doc = frappe.get_doc(dt, key)  # Trusted broker loads remain available.
            self.assertFalse(doc.has_permission("read"))
            with self.assertRaises(frappe.PermissionError):
                get(dt, key)
            self.assertEqual(frappe.get_list(dt), [])
        outbox.cancel_intent(intent["name"])
        self.assertEqual(frappe.db.get_value(outbox.DOCTYPE, intent["name"], "state"), "Cancelled")

    def test_message_refresh_is_after_commit_exact_authorized_user_id_only(self):
        self.send(request_id="unowned")
        self.realtime.assert_not_called()
        name = self.conversation()
        control.apply_control(name, "take", 1, uuid4().hex)
        self.realtime.reset_mock()
        self.send(request_id="owned")
        self.realtime.assert_called_once_with("crm_conversation_updated", {"name": name},
            user="Administrator", after_commit=True)
        self.realtime.reset_mock()
        self.send(request_id="owned")
        self.realtime.assert_not_called()
        with patch.object(control, "_authorize", side_effect=frappe.PermissionError):
            self.send(request_id="revoked-listener")
        self.realtime.assert_not_called()

    def test_raw_boundary_rejects_extra_duplicate_query_size_and_nonfinite(self):
        args = {"channel_id": self.channel["account_id"]}
        cases = [dict(raw=json.dumps({**args, "peer_id": "a" * 64}).encode()),
            dict(raw=b'{"capability":"one","capability":"two"}'), dict(query_string="capability=forbidden"),
            dict(raw=b" " * (api.MAX_BODY_BYTES + 1)), dict(raw=b'{"capability":NaN}'),
            dict(method="GET"), dict(mimetype="text/plain")]
        for options in cases:
            with self.subTest(options=list(options)), self.request(args, capability=self.capability, **options):
                self.failure(417, lambda: (api.prepare_request(), api.history(**args)))
        self.failure(417, lambda: self.send("x" * 2001))
        self.failure(417, lambda: self.send("\x00"))

    def test_unexpected_failure_scrubs_diagnostics_and_never_exposes_exception(self):
        args = {"channel_id": self.channel["account_id"]}
        with self.request(args, capability=self.capability) as request, patch.object(api, "_public_rate", side_effect=RuntimeError("private diagnostic")):
            api.prepare_request()
            request.get_json()  # Exercise both Werkzeug raw and JSON caches.
            result = self.failure(503, lambda: api.history(**args))
            self.assertEqual(request.get_json(), {})
            self.assertNotIn(self.capability, request.get_data(as_text=True))
            self.assertNotIn(self.capability, repr(frappe.form_dict))
            self.assertNotIn("private diagnostic", repr(result))

    def test_header_is_consumed_before_frappe_auth_and_authority_is_request_bound(self):
        from frappe.auth import validate_auth
        args = {"channel_id": self.channel["account_id"]}
        with self.request(args, capability=self.capability) as request:
            api.prepare_request()
            self.assertIsNone(request.headers.get("Authorization"))
            validate_auth()
            self.assertEqual(frappe.session.user, "Guest")
            first = api._request_authority()
            self.assertNotIn(self.capability, repr(first))
        with self.request(args), patch.object(frappe.local, "webchat_authority", first):
            self.failure(403, lambda: api.history(**args))
        self.failure(403, lambda: self.rpc("history", **args))
        with self.request({**args, "capability": "forbidden-in-json"}, capability=self.capability):
            api.prepare_request()
            self.failure(417, lambda: api.history(**args))

    def test_actual_recorder_captured_metadata_is_excluded_without_global_change(self):
        from frappe.recorder import Recorder
        args = {"channel_id": self.channel["account_id"]}
        with self.request(args, capability=self.capability) as request:
            recorder = object.__new__(Recorder)
            recorder.headers, recorder.form_dict = dict(request.headers), frappe.form_dict
            recorder.calls, recorder.events = [], []
            recorder.profiler, recorder.patched_databases, recorder._recording = None, [], True
            with patch.object(frappe.local, "_recorder", recorder, create=True), \
                    patch.object(frappe.cache, "hset") as persist, \
                    patch.object(frappe.client_cache, "set_value") as global_config:
                api.prepare_request()
                self.assertFalse(recorder._recording)
                self.assertNotIn(self.capability, json.dumps({"headers": recorder.headers, "form": recorder.form_dict}))
                recorder.dump()  # Actual installed Recorder.dump exits before persistence.
                persist.assert_not_called(); global_config.assert_not_called()
                self.assertEqual(api.history(**args)["messages"], [])

    def test_recorder_exclusion_failure_refuses_request_with_static_error(self):
        from unittest.mock import Mock
        recorder = Mock(headers={}, form_dict={}, calls=[], events=[])
        recorder.cleanup.side_effect = RuntimeError("debug cleanup unavailable")
        with self.request({"channel_id": self.channel["account_id"]}, capability=self.capability), \
                patch.object(frappe.local, "_recorder", recorder, create=True):
            self.failure(503, api.prepare_request)
            self.assertEqual(recorder.headers, {})

    def test_malformed_json_normal_snapshot_and_sentry_headers_omit_capability(self):
        from frappe.app import make_form_dict
        from frappe.utils.error import get_error_metadata
        from sentry_sdk.integrations.wsgi import _make_wsgi_event_processor
        with self.request({}, capability=self.capability, raw=b'{"channel_id":') as request:
            try:
                make_form_dict(request)
            except frappe.DataError:
                snapshot = frappe.get_traceback(with_context=True)
                metadata = get_error_metadata()
            else:
                self.fail("Malformed JSON must be rejected before endpoint dispatch")
            self.assertNotIn(self.capability, snapshot)
            self.assertNotIn(self.capability, metadata)
            event = _make_wsgi_event_processor(request.environ, False)({}, {})
            self.assertNotIn(self.capability, json.dumps(event, default=str))

    def test_redis_quota_and_outage_are_fail_closed_hashed(self):
        with patch.object(frappe.cache, "eval", return_value=1) as counter:
            REAL_RATE("visitor", self.capability, 30)
            self.assertNotIn(self.capability, repr(counter.call_args))
        for result in (31, None, "1"):
            with patch.object(frappe.cache, "eval", return_value=result), self.assertRaises(frappe.RateLimitExceededError):
                REAL_RATE("visitor", self.capability, 30)
        with patch.object(frappe.cache, "eval", side_effect=RuntimeError("Redis unavailable")), \
                self.assertRaises(frappe.RateLimitExceededError):
            REAL_RATE("visitor", self.capability, 30)

    def test_shared_egress_budget_does_not_replace_tighter_channel_limit(self):
        channel = self.channel["account_id"]
        with self.request({"channel_id": channel}, endpoint="bootstrap"):
            self.rate.reset_mock()
            api._public_rate(channel, "bootstrap")
            from unittest.mock import call
            self.assertEqual(self.rate.call_args_list, [call("ip", "192.0.2.88", 6000),
                call("channel", channel, 600), call("bootstrap_ip", "192.0.2.88", 3000, 3600),
                call("bootstrap_channel", channel, 300, 3600)])
            def bounded(kind, identity, limit, seconds=60):
                if kind == "bootstrap_channel":
                    raise frappe.RateLimitExceededError("Channel limit reached")
            self.rate.side_effect = bounded
            with self.assertRaises(frappe.RateLimitExceededError):
                api._public_rate(channel, "bootstrap")

    def test_payload_and_local_dispatch_guard_first(self):
        session = self.session()
        expected = b'{"text":"literal <b>","type":"text"}'
        self.assertEqual(api.validate_payload({"type": "text", "text": "literal <b>"},
            account_id=session.channel, peer_id=session.peer_id), expected)
        with self.assertRaises(ValueError):
            api.validate_payload({"type": "text", "text": "x", "reference_name": "secret"},
                account_id=session.channel, peer_id=session.peer_id)
        from crm.api import outbox
        intent = frappe._dict(name=uuid4().hex, provider="Webchat", account_id=session.channel,
            peer_id=session.peer_id, conversation=self.conversation(), conversation_generation=1)
        with patch.object(outbox, "require_dispatch", side_effect=frappe.PermissionError), \
                patch.object(api, "current_session") as lookup:
            with self.assertRaises(frappe.PermissionError):
                api.deliver_local(intent, {"type": "text", "text": "guarded"})
            lookup.assert_not_called()

    def test_local_delivery_is_stable_one_row_and_has_no_transaction_boundary(self):
        self.send()
        session = self.session()
        intent = frappe._dict(name=uuid4().hex, provider="Webchat", account_id=session.channel,
            peer_id=session.peer_id, conversation=self.conversation(), conversation_generation=1)
        from crm.api import outbox
        with patch.object(outbox, "require_dispatch") as guard, patch.object(frappe.db, "commit") as commit, \
                patch.object(frappe.db, "rollback") as rollback:
            first = api.deliver_local(intent, {"type": "text", "text": "Fictional staff reply"})
            second = api.deliver_local(intent, {"type": "text", "text": "Fictional staff reply"})
            self.assertEqual(first, second)
            self.assertEqual(first["state"], "Accepted")
            self.assertEqual(guard.call_count, 2)
            commit.assert_not_called(); rollback.assert_not_called()
        self.assertEqual(frappe.db.count(api.MESSAGE, {"session": session.name, "direction": "Outgoing"}), 1)

    def test_queue_contention_has_distinct_static_pending_without_transaction_reset(self):
        from crm.api import outbox
        self.send()
        name = self.conversation()
        with patch.object(control, "_load", side_effect=frappe.QueryDeadlockError("private SQL diagnostic")), \
                patch.object(frappe.db, "commit") as commit, patch.object(frappe.db, "rollback") as rollback:
            with self.assertRaises(outbox.ReplyRequestPending) as pending:
                outbox.queue_message(name, 1, "unchanged-id", {"type": "text", "text": "Fictional frozen reply"})
            self.assertEqual(str(pending.exception), "Request could not be confirmed. Check the same request again.")
            self.assertEqual(pending.exception.http_status_code, 409)
            commit.assert_not_called(); rollback.assert_not_called()
        with patch.object(control, "_load", side_effect=frappe.TimestampMismatchError("generation changed")):
            with self.assertRaises(frappe.TimestampMismatchError):
                outbox.queue_message(name, 1, "unchanged-id", {"type": "text", "text": "Fictional frozen reply"})
