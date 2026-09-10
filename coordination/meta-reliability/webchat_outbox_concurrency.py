"""Actual Webchat SQL/commit/SIGKILL proof on the dedicated paused Meta lab.

No runtime replacement: real queue/control/fence/dispatch/local delivery. Only
checkpoint wrappers, external egress blocking and deterministic worker wakeups.
Fictional immutable evidence remains closed/disabled/revoked after completion.
"""
from contextlib import ExitStack, contextmanager
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time
import traceback
from unittest.mock import patch
from uuid import uuid4

CANDIDATE = Path("/tmp/meta-wa-20260910")
SITE = "meta-reliability-test-20260910.lab.xoloitzcuintles.com"
os.chdir("/home/frappe/frappe-bench/sites")
sys.path.insert(0, str(CANDIDATE))
import frappe
from crm.api import conversations as control, outbox, webchat

CHILDREN = []


def emit(event, **values):
    print(json.dumps({"event": event, **values}, sort_keys=True, default=str), flush=True)


def initialize(actor="Administrator"):
    frappe.init(site=SITE)
    frappe.connect()
    assert frappe.local.site == SITE
    assert frappe.conf.maintenance_mode and frappe.conf.pause_scheduler and frappe.conf.mute_emails
    assert frappe.db.get_single_value("System Settings", "enable_scheduler") == 0
    for module in (control, outbox, webchat):
        assert Path(module.__file__).resolve().is_relative_to(CANDIDATE), module.__file__
    frappe.set_user(actor)
    frappe.local.conf = frappe._dict(frappe.conf)
    frappe.conf.developer_mode = 1
    frappe.conf.maintenance_mode = 0  # Process only; persisted site holds remain1.


@contextmanager
def blocked():
    def deny(*args, **kwargs):
        raise AssertionError("External transport is forbidden in Webchat process proof")
    def fixture_queue(method, *args, **kwargs):
        if method == "frappe.core.doctype.user.user.create_contact":
            return None
        raise AssertionError("Unexpected worker enqueue in Webchat process proof")
    with ExitStack() as stack:
        for name in ("requests.sessions.Session.request", "urllib.request.urlopen", "smtplib.SMTP.sendmail", "frappe.sendmail"):
            stack.enter_context(patch(name, side_effect=deny))
        stack.enter_context(patch.object(outbox, "_enqueue"))
        stack.enter_context(patch("frappe.enqueue", side_effect=fixture_queue))
        stack.enter_context(patch("frappe.publish_realtime"))
        yield


def text(label):
    return "Fictional Webchat atomicity proof: " + label


def child(mode, cfg):
    initialize(cfg.get("actor", "Administrator"))
    try:
        with blocked():
            emit("ready", mode=mode, pid=os.getpid())
            assert sys.stdin.readline().strip() == "go"
            if mode == "queue":
                try:
                    result = outbox.queue_message(cfg["conversation"], cfg["generation"], cfg["request"],
                        {"type": "text", "text": text(cfg["request"])})
                except outbox.ReplyRequestPending as pending:
                    assert str(pending) == "Request could not be confirmed. Check the same request again."
                    assert pending.http_status_code == 409
                    frappe.db.rollback()  # Real whole-request caller boundary.
                    emit("request_pending", exc_type=type(pending).__name__, caller_rolled_back=True)
                else:
                    frappe.db.commit()
                    emit("queued", intent=result["name"])
            elif mode == "transfer":
                result = control.apply_control(cfg["conversation"], "transfer", cfg["generation"],
                    cfg["request"], owner=cfg["target"])
                frappe.db.commit()
                emit("transferred", generation=result["generation"])
            elif mode == "forge":
                doc = outbox._load(cfg["intent"])
                payload = json.loads(doc.payload)
                # Client-like document/flags are not the private dispatch grant.
                doc.state, doc.claim_token = "Submitting", "forged-public-claim"
                frappe.flags.crm_outbox_dispatch = {"intent": doc.name, "provider": "Webchat", "claim_token": doc.claim_token}
                try:
                    webchat.deliver_local(doc, payload)
                except frappe.PermissionError:
                    emit("forgery_denied")
                else:
                    raise AssertionError("Forged document/flags acquired dispatch authority")
            else:
                real_deliver, real_commit = webchat.deliver_local, frappe.db.commit
                def deliver(intent, payload):
                    result = real_deliver(intent, payload)
                    emit("local_insert_returned", intent=intent.name)
                    if mode == "hold_insert":
                        assert sys.stdin.readline().strip() == "release"
                    return result
                def commit():
                    real_commit()
                    if mode == "hold_commit":
                        assert frappe.db.get_value(outbox.DOCTYPE, cfg["intent"], "state") == "Accepted"
                        control._assert_fence(cfg["conversation"])
                        emit("accepted_commit_returned", intent=cfg["intent"])
                        assert sys.stdin.readline().strip() == "release"
                with patch.object(webchat, "deliver_local", side_effect=deliver), patch.object(frappe.db, "commit", side_effect=commit):
                    outbox.dispatch_intent(cfg["intent"])
                emit("settled", state=frappe.db.get_value(outbox.DOCTYPE, cfg["intent"], "state"))
    except Exception:
        emit("child_error", traceback=traceback.format_exc())
        raise
    finally:
        frappe.db.rollback()
        frappe.destroy()


def line(proc, timeout=15):
    pending = getattr(proc, "_proof_pending", b"")
    while b"\n" not in pending:
        with selectors.DefaultSelector() as selector:
            selector.register(proc.stdout, selectors.EVENT_READ)
            assert selector.select(timeout), ("child timeout", proc.pid)
        value = os.read(proc.stdout.fileno(), 4096)
        assert value, ("child exited", proc.pid, proc.poll(), proc.stderr.read() if proc.poll() is not None else "")
        pending += value
    value, proc._proof_pending = pending.split(b"\n", 1)
    result = json.loads(value)
    emit("process_output", pid=proc.pid, value=result)
    return result


def start(mode, cfg, *, go=True):
    proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), mode, json.dumps(cfg)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
    CHILDREN.append(proc)
    assert line(proc)["event"] == "ready"
    if go:
        release(proc, "go")
    return proc


def release(proc, message="release"):
    proc.stdin.write((message + "\n").encode())
    proc.stdin.flush()


def finish(proc, expected=0):
    stdout, stderr = proc.communicate(timeout=15)
    stdout = getattr(proc, "_proof_pending", b"") + stdout
    emit("process_result", pid=proc.pid, returncode=proc.returncode,
        stdout=stdout.decode(), stderr=stderr.decode())
    assert proc.returncode == expected, (proc.pid, proc.returncode, stdout, stderr)


def waiting(proc):
    assert proc.poll() is None
    assert not getattr(proc, "_proof_pending", b"")
    with selectors.DefaultSelector() as selector:
        selector.register(proc.stdout, selectors.EVENT_READ)
        assert not selector.select(0.2), "Competing operation escaped the conversation fence"


def durable(intent):
    # Independent parent connection discards its previous observation snapshot.
    frappe.db.rollback()
    row = frappe.db.get_value(outbox.DOCTYPE, intent,
        ["state", "attempts", "provider_message_id", "reason_code", "conversation_generation"], as_dict=True)
    count = frappe.db.count(webchat.MESSAGE, {"request_id": intent, "direction": "Outgoing"})
    return {**row, "messages": count}


def queued(cfg, label):
    frappe.db.rollback()
    frappe.set_user(cfg["actor"])
    result = outbox.queue_message(cfg["conversation"], cfg["generation"], label, {"type": "text", "text": text(label)})
    frappe.db.commit()
    return result["name"]


def fixture():
    prefix = "webchat-commit-" + uuid4().hex[:12]
    channel = webchat.configure_channel(prefix, prefix, "https://" + prefix + ".example.invalid", enabled=1)
    import secrets
    session_name, peer = secrets.token_hex(32), secrets.token_hex(32)
    # No visitor capability is generated/printed: private fixture stores random
    # hash-shaped evidence, never a live credential or staff cookie.
    session = webchat._mark(frappe.get_doc({"doctype": webchat.SESSION, "name": session_name,
        "channel": channel["account_id"], "peer_id": peer, "capability_hash": secrets.token_hex(32), "revoked": 0}))
    session.insert(ignore_permissions=True, set_name=session_name)
    target = prefix + "@example.invalid"
    frappe.get_doc({"doctype": "User", "email": target, "first_name": "Fictional Webchat process proof",
        "enabled": 1, "send_welcome_email": 0, "roles": [{"role": "Sales User"}]}).insert(ignore_permissions=True)
    frappe.get_doc({"doctype": "User Permission", "user": target, "allow": webchat.CHANNEL,
        "for_value": channel["account_id"], "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
    conversation = control.get_or_create("Webchat", channel["account_id"], peer)
    owned = control.apply_control(conversation.name, "take", 1, prefix + "-take")
    frappe.db.commit()
    cfg = {"prefix": prefix, "account": channel["account_id"], "session": session.name, "peer": peer,
        "conversation": conversation.name, "generation": owned["generation"], "actor": "Administrator", "target": target}
    emit("fixtures_committed", **cfg)
    return cfg


def cleanup(cfg):
    for proc in CHILDREN:
        if proc.poll() is None:
            proc.kill()
            finish(proc, -signal.SIGKILL)
    frappe.db.rollback()
    current = control._load(cfg["conversation"])
    frappe.set_user(current.human_owner or "Administrator")
    for name in frappe.get_all(outbox.DOCTYPE, filters={"conversation": current.name,
            "state": ["in", ["Queued", "Blocked", "Deferred", "Failed"]]}, pluck="name"):
        outbox.cancel_intent(name)
    frappe.set_user("Administrator")
    current = control._load(cfg["conversation"])
    if current.control_state != "Closed":
        control.apply_control(current.name, "close", current.generation, cfg["prefix"] + "-close",
            reason="Fictional Webchat separate-process proof complete")
    session = frappe.get_doc(webchat.SESSION, cfg["session"], for_update=True)
    if not session.revoked:
        session.revoked = 1
        webchat._mark(session).save(ignore_permissions=True)
    channel = frappe.get_doc(webchat.CHANNEL, cfg["account"], for_update=True)
    webchat.configure_channel(channel.label, channel.profile, channel.public_origin, enabled=0,
        channel_id=channel.name, expected_modified=str(channel.modified))
    frappe.db.set_value("User", cfg["target"], "enabled", 0)
    frappe.db.commit()
    assert frappe.db.get_value(control.DOCTYPE, current.name, "control_state") == "Closed"
    assert frappe.db.get_value(webchat.CHANNEL, channel.name, "enabled") == 0
    assert frappe.db.get_value(webchat.SESSION, session.name, "revoked") == 1
    assert frappe.db.get_value("User", cfg["target"], "enabled") == 0
    assert frappe.db.count(outbox.DOCTYPE, {"conversation": current.name, "state": ["in", ["Queued", "Claimed", "Submitting"]]}) == 0
    emit("cleanup", closed=True, channel_disabled=True, session_revoked=True, fictional_user_disabled=True,
        immutable_evidence_retained=True, account=channel.name, conversation=current.name)


def proof():
    initialize()
    cfg = None
    try:
        with blocked():
            try:
                cfg = fixture()
                skip_race = os.environ.get("WEBCHAT_PROOF_SKIP_QUEUE_RACE") == "1"
                if skip_race:
                    one = {"intent": queued(cfg, "single-intent-for-independent-scenarios")}
                    emit("same_request_race_not_run", reason="Independently continue remaining scenarios after retained race failure")
                else:
                    same = {**cfg, "request": "same-request-race"}
                    first, second = start("queue", same, go=False), start("queue", same, go=False)
                    release(first, "go"); release(second, "go")
                    one, two = line(first), line(second)
                    finish(first); finish(second)
                    results = [one, two]
                    successes = [result for result in results if result["event"] == "queued"]
                    pending = [result for result in results if result["event"] == "request_pending"]
                    assert successes and len(pending) <= 1 and len(successes) + len(pending) == 2
                    one = successes[0]
                    assert all(result["intent"] == one["intent"] for result in successes)
                    frappe.db.rollback()
                    assert frappe.db.count(outbox.DOCTYPE, {"conversation": cfg["conversation"]}) == 1
                    # A completely new request/connection checks the identical
                    # frozen UUID/body after the failed transaction has ended.
                    retry = start("queue", same)
                    resolved = line(retry); finish(retry)
                    assert resolved["event"] == "queued" and resolved["intent"] == one["intent"]
                    frappe.db.rollback()
                    assert frappe.db.count(outbox.DOCTYPE, {"conversation": cfg["conversation"]}) == 1
                    emit("same_request_race_pass", intents=1, pending_responses=len(pending),
                        fresh_request_same_intent=True)

                run = {**cfg, "intent": one["intent"]}
                holder = start("hold_insert", run)
                assert line(holder)["event"] == "local_insert_returned"
                duplicate = start("dispatch", run)
                waiting(duplicate)
                assert durable(run["intent"])["state"] == "Queued" and durable(run["intent"])["messages"] == 0
                release(holder); finish(holder); finish(duplicate)
                row = durable(run["intent"])
                assert (row["state"], row["attempts"], row["messages"]) == ("Accepted", 1, 1)
                emit("two_workers_pass", durable=row)

                before = queued(cfg, "kill-before-commit")
                crash = start("hold_insert", {**cfg, "intent": before})
                assert line(crash)["event"] == "local_insert_returned"
                observed = durable(before)
                assert (observed["state"], observed["attempts"], observed["messages"]) == ("Queued", 0, 0)
                crash.kill(); finish(crash, -signal.SIGKILL)
                assert durable(before) == observed
                recovery = start("dispatch", {**cfg, "intent": before}); finish(recovery)
                row = durable(before)
                assert (row["state"], row["attempts"], row["messages"]) == ("Accepted", 1, 1)
                emit("precommit_sigkill_pass", before_recovery=observed, after_recovery=row)

                after = queued(cfg, "kill-after-commit")
                crash = start("hold_commit", {**cfg, "intent": after})
                assert line(crash)["event"] == "local_insert_returned"
                assert line(crash)["event"] == "accepted_commit_returned"
                accepted = durable(after)
                assert (accepted["state"], accepted["attempts"], accepted["messages"]) == ("Accepted", 1, 1)
                crash.kill(); finish(crash, -signal.SIGKILL)
                replay = start("dispatch", {**cfg, "intent": after}); finish(replay)
                assert durable(after) == accepted
                emit("postcommit_sigkill_pass", durable=accepted, additional_messages=0)

                winner, stale = queued(cfg, "takeover-winner"), queued(cfg, "takeover-stale")
                holder = start("hold_insert", {**cfg, "intent": winner})
                assert line(holder)["event"] == "local_insert_returned"
                takeover = start("transfer", {**cfg, "request": "proof-owner-transfer"})
                waiting(takeover)
                assert durable(winner)["state"] == "Queued"
                release(holder); finish(holder)
                changed = line(takeover); finish(takeover)
                assert changed["generation"] == cfg["generation"] + 1
                cfg.update(actor=cfg["target"], generation=changed["generation"])
                cancelled = start("dispatch", {**cfg, "intent": stale}); finish(cancelled)
                assert durable(winner)["state"] == "Accepted"
                row = durable(stale)
                assert (row["state"], row["reason_code"], row["messages"]) == ("Cancelled", "conversation_changed", 0)
                emit("takeover_wait_and_stale_cancel_pass", stale=row)

                forged = queued(cfg, "direct-forged-capability")
                attacker = start("forge", {**cfg, "intent": forged})
                assert line(attacker)["event"] == "forgery_denied"; finish(attacker)
                row = durable(forged)
                assert (row["state"], row["attempts"], row["messages"]) == ("Queued", 0, 0)
                emit("direct_forgery_pass", durable=row)
                assert frappe.db.count(outbox.DOCTYPE, {"conversation": cfg["conversation"], "state": "Submitting"}) == 0
                emit("PARTIAL_PASS" if skip_race else "PASS", scenarios=5 if skip_race else 6,
                    real_commits=True, sigkill_checkpoints=2, live_provider_attempts=0)
            finally:
                if cfg:
                    cleanup(cfg)
    finally:
        frappe.db.rollback()
        frappe.destroy()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        child(sys.argv[1], json.loads(sys.argv[2]))
    else:
        proof()
