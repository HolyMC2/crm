"""Committed multi-process native outbox proof on the dedicated paused lab.

Provider is a deterministic in-process double behind the REAL dispatch guard.
It never opens a socket. Exact fictional records remain disabled as audit evidence.
"""
from datetime import timedelta
import importlib.util
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
from unittest.mock import patch
from uuid import uuid4

os.chdir("/home/frappe/frappe-bench/sites")
spec = importlib.util.spec_from_file_location("conversation_proof", "/tmp/p5-conversation-fixture.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
frappe = base.frappe
from frappe.utils import now_datetime
from crm.api import outbox
from crm.api import conversations as control
from frappe_whatsapp import native_outbox


def init(actor="Administrator"):
    base.initialize(actor)
    frappe.local.conf = frappe._dict(frappe.conf)
    frappe.conf.maintenance_mode = 0  # process only; site remains paused/maintenance


def emit(event, **values):
    base.emit(event, **values)


def row(name):
    frappe.db.rollback()
    return frappe.db.get_value(outbox.DOCTYPE, name, ["state", "attempts", "provider_message_id", "reason_code"], as_dict=True)


def child(mode, cfg):
    init(cfg["actor"])
    with base.blocked(), patch.object(outbox, "_enqueue"):
        emit("ready", mode=mode)
        assert sys.stdin.readline().strip() == "go"
        if mode == "receipt":
            from frappe_whatsapp.webhook_receipts import record_events
            record_events([{"provider": "WhatsApp", "account_id": "9700000000999", "app_id": "9700001",
                "event_type": "proof_unrelated", "event_id": uuid4().hex, "payload": {"fictional": True}}])
            frappe.db.commit()
            emit("unrelated_receipt_committed")
        elif mode == "queue":
            result = outbox.queue_message(cfg["conversation"], cfg["generation"], cfg["request"], {"type": "text", "text": "Fictional process proof"})
            frappe.db.commit()
            emit("queued", name=result["name"])
        elif mode == "transfer":
            result = control.apply_control(cfg["conversation"], "transfer", cfg["generation"], cfg["request"], owner=cfg["target"])
            frappe.db.commit()
            emit("transferred", generation=result["generation"])
        else:
            def provider(intent, payload):
                outbox.require_dispatch(intent.name, intent.provider, intent.account_id, intent.peer_id, payload=payload)
                # The guard reads actual committed Submitting + exact claim/body.
                with open(cfg["attempt_file"], "a") as journal:
                    journal.write(intent.name + "\n"); journal.flush(); os.fsync(journal.fileno())
                emit("provider_double", intent=intent.name)
                if mode == "crash_submit":
                    os._exit(73)
                if mode == "hold":
                    assert sys.stdin.readline().strip() == "release"
                return {"state": "Accepted", "provider_message_id": "wamid.proof." + intent.name}
            original_commit = frappe.db.commit
            def commit():
                original_commit()
                if mode == "crash_claim":
                    emit("claim_committed")
                    os._exit(74)
            with patch.object(native_outbox, "send_frozen", side_effect=provider), patch.object(frappe.db, "commit", side_effect=commit):
                outbox.dispatch_intent(cfg["intent"])
            emit("settled", state=frappe.db.get_value(outbox.DOCTYPE, cfg["intent"], "state"))
    frappe.db.rollback(); frappe.destroy()


def spawn(mode, cfg):
    proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), mode, json.dumps(cfg)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0,
        cwd="/home/frappe/frappe-bench/sites")
    assert base.line(proc)["event"] == "ready"
    proc.stdin.write(b"go\n"); proc.stdin.flush()
    return proc


def finish(proc, code=0):
    stdout, stderr = proc.communicate(timeout=20)
    stdout = getattr(proc, "_proof_pending", b"") + stdout
    emit("process_result", returncode=proc.returncode, stdout=stdout.decode(), stderr=stderr.decode())
    assert proc.returncode == code, (stdout, stderr)


def queue(cfg, label):
    frappe.db.rollback(); frappe.set_user(cfg["actor"])
    result = outbox.queue_message(cfg["conversation"], cfg["generation"], label, {"type": "text", "text": "Fictional process proof"})
    frappe.db.commit()
    return result["name"]


def proof():
    os.chdir("/home/frappe/frappe-bench/sites")
    init()
    cfg = None
    with base.blocked(), patch.object(outbox, "_enqueue"):
        try:
            cfg = base.fixture()
            frappe.db.set_value("WhatsApp Account", cfg["account"], {"mode": "Live", "app_id": "9700001", "business_id": "9700002"})
            current = control._load(cfg["name"])
            from frappe_whatsapp.webhook_receipts import record_events
            receipt = record_events([{"provider": "WhatsApp", "account_id": current.account_id, "app_id": "9700001",
                "event_type": "message", "event_id": "proof-" + uuid4().hex,
                "payload": {"change": {"value": {"messages": [{"from": current.peer_id, "timestamp": str(int(time.time()) - 10)}]}}}}])[0]
            frappe.db.set_value("Meta Webhook Receipt", receipt, "state", "Processed")
            frappe.set_user(cfg["users"][0])
            taken = control.apply_control(current.name, "take", 1, "proof-take")
            frappe.db.commit()
            run = {"actor": cfg["users"][0], "conversation": current.name, "generation": taken["generation"],
                   "request": "same-browser-request", "attempt_file": "/tmp/p5-attempts-" + uuid4().hex}
            # Two independent browser requests return one durable intent.
            first, second = spawn("queue", run), spawn("queue", run)
            one, two = base.line(first), base.line(second)
            finish(first); finish(second)
            assert one["name"] == two["name"]
            run["intent"] = one["name"]
            pending = queue(run, "queued-before-takeover")
            # Duplicate worker and takeover cannot pass the active provider boundary.
            holder = spawn("hold", run)
            assert base.line(holder)["event"] == "provider_double"
            unrelated = spawn("receipt", {**run, "actor": "Administrator"})
            assert base.line(unrelated, timeout=3)["event"] == "unrelated_receipt_committed"
            finish(unrelated)
            duplicate = spawn("dispatch", run)
            transfer = spawn("transfer", {**run, "target": cfg["users"][1], "request": "proof-transfer"})
            for proc in (duplicate, transfer):
                with selectors.DefaultSelector() as selector:
                    selector.register(proc.stdout, selectors.EVENT_READ)
                    assert not selector.select(0.15), "Operation escaped the active conversation fence"
            holder.stdin.write(b"release\n"); holder.stdin.flush()
            finish(holder); finish(duplicate); finish(transfer)
            assert row(run["intent"]).state == "Accepted"
            stale = spawn("dispatch", {**run, "intent": pending}); finish(stale)
            assert row(pending).state == "Cancelled"
            assert Path(run["attempt_file"]).read_text().splitlines() == [run["intent"]]
            emit("race_and_takeover_pass", unique_intents=2, provider_double_attempts=1, unrelated_receipt_unblocked=True)
            # Process dies after the effect boundary. Recovery must never resubmit.
            run.update(actor=cfg["users"][1], generation=3)
            crash_intent = queue(run, "crash-after-submitting")
            crash = spawn("crash_submit", {**run, "intent": crash_intent})
            assert base.line(crash)["event"] == "provider_double"
            finish(crash, 73)
            assert row(crash_intent).state == "Submitting"
            frappe.db.set_value(outbox.DOCTYPE, crash_intent, "lease_until", now_datetime() - timedelta(seconds=1))
            frappe.db.commit()
            recovery = spawn("dispatch", {**run, "intent": crash_intent}); finish(recovery)
            again = spawn("dispatch", {**run, "intent": crash_intent}); finish(again)
            assert row(crash_intent).state == "Unknown"
            assert Path(run["attempt_file"]).read_text().splitlines().count(crash_intent) == 1
            emit("submission_crash_pass", state="Unknown", provider_double_attempts=1)
            # Crash before effect boundary is safe to reclaim exactly once.
            claim_intent = queue(run, "crash-after-claim")
            crash = spawn("crash_claim", {**run, "intent": claim_intent})
            assert base.line(crash)["event"] == "claim_committed"
            finish(crash, 74)
            assert row(claim_intent).state == "Claimed"
            frappe.db.set_value(outbox.DOCTYPE, claim_intent, "lease_until", now_datetime() - timedelta(seconds=1))
            frappe.db.commit()
            recovery = spawn("dispatch", {**run, "intent": claim_intent}); finish(recovery)
            restored = row(claim_intent)
            assert (restored.state, restored.attempts) == ("Accepted", 2)
            assert Path(run["attempt_file"]).read_text().splitlines().count(claim_intent) == 1
            emit("claim_crash_pass", state="Accepted", claims=2, provider_double_attempts=1)
        finally:
            frappe.db.rollback(); frappe.set_user("Administrator")
            if cfg:
                current = control._load(cfg["name"])
                if current.control_state != "Closed":
                    control.apply_control(current.name, "close", current.generation, "proof-cleanup", reason="Fictional outbox proof complete")
                frappe.db.set_value("WhatsApp Account", cfg["account"], "status", "Inactive")
                if cfg["shop"]:
                    frappe.db.set_value("Social Shop", cfg["shop"], "enabled", 0)
                for user in cfg["users"]:
                    frappe.db.set_value("User", user, "enabled", 0)
                    frappe.clear_document_cache("User", user)
                frappe.db.commit()
                emit("cleanup", conversation_closed=True, fictional_accounts_users_disabled=True, audit_retained=True)
            frappe.destroy()
    emit("PASS", live_provider_attempts=0)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        child(sys.argv[1], json.loads(sys.argv[2]))
    else:
        proof()
