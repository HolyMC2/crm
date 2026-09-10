"""Single-site native Desk proof harness. Fictional fixtures; no provider transport.

Run inside the lab backend. Credentials live only in a mode-0600 /tmp file.
Persistent maintenance/pause/mute settings must stay 1. The WSGI process alone
allows its fixed site through maintenance, with external sends/queues blocked.
"""
import argparse
import importlib
import json
import os
import secrets
import smtplib
import sys
from pathlib import Path

sys.path.insert(0, "/tmp/meta-wa-20260910")
os.chdir("/home/frappe/frappe-bench/sites")
import frappe
import frappe.app
import requests

SITES = {
    "eight": "meta-reliability-test-20260910.lab.xoloitzcuintles.com",
    "core": "crm-inquiry-test-20260909.lab.xoloitzcuintles.com",
}
parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=("setup", "serve", "inspect", "cleanup"))
parser.add_argument("--site", choices=SITES, default="eight")
parser.add_argument("--port", type=int, default=18145)
args = parser.parse_args()
SITE = SITES[args.site]
FIXTURE = Path(f"/tmp/conversation-desk-{args.site}-fixture.json")
blocked_calls = {"external": 0, "enqueue": 0, "mail": 0}


def blocked(*a, **kw):
    blocked_calls["external"] += 1
    raise RuntimeError("External transport forbidden in fictional Desk proof")


def no_queue(*a, **kw):
    blocked_calls["enqueue"] += 1


def no_mail(*a, **kw):
    blocked_calls["mail"] += 1


requests.sessions.Session.request = blocked
smtplib.SMTP.sendmail = blocked
frappe.enqueue = no_queue
frappe.sendmail = no_mail
original_init = frappe.init


def fixed_init(site=None, *a, **kw):
    if site != SITE:
        raise RuntimeError("Wrong site for fictional Desk proof")
    result = original_init(site, *a, **kw)
    if any(int(frappe.conf.get(k) or 0) != 1 for k in ("maintenance_mode", "pause_scheduler", "mute_emails")):
        raise RuntimeError("Isolated site's persistent safety flags must all be 1")
    frappe.local.conf = frappe._dict(frappe.local.conf)
    if args.mode == "serve":
        frappe.local.conf.maintenance_mode = 0  # This process only; never set_config.
    frappe.local.conf.developer_mode = 1
    return result


frappe.init = fixed_init
frappe.init(SITE)
frappe.connect()
frappe.set_user("Administrator")
apps = frappe.get_installed_apps()
expected = {"frappe", "crm"} if args.site == "core" else {
    "frappe", "erpnext", "crm", "doco", "doco_marketing", "frappe_whatsapp", "mercado", "scanner_kit"
}
assert set(apps) == expected, apps
paths = {a: importlib.import_module(a).__file__ for a in apps}
for app in expected & {"crm", "doco", "doco_marketing", "frappe_whatsapp"}:
    assert paths[app].startswith("/tmp/meta-wa-20260910/"), paths[app]
assert frappe.db.exists("Page", "customer-conversations"), "Page must be migrated by root first"
print(json.dumps({"site": SITE, "apps": paths, "persistent_flags": [1, 1, 1], "page_exists": True}), flush=True)


def save_fixture(data):
    fd = os.open(FIXTURE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump(data, file)


if args.mode == "setup":
    assert not FIXTURE.exists(), "Keep the existing owned fixture manifest; do not overwrite"
    tag = "desk-proof-" + secrets.token_hex(5)
    actor = tag + "@example.invalid"
    password = secrets.token_urlsafe(32)
    frappe.get_doc({"doctype": "User", "email": actor, "first_name": "Fictional Desk operator",
        "enabled": 1, "send_welcome_email": 0, "user_type": "System User", "language": "en",
        "roles": [{"role": "Sales User"}]}).insert()
    from frappe.utils.password import update_password
    update_password(actor, password)
    data = {"site": SITE, "actor": actor, "password": password, "tag": tag}
    if args.site == "eight":
        account_id = "978" + str(int(secrets.token_hex(5), 16))
        peers = ["521555" + str(int(secrets.token_hex(3), 16)).zfill(8) + str(i) for i in range(3)]
        shop = frappe.get_doc({"doctype": "Social Shop", "shop_name": tag, "enabled": 1}).insert()
        denied_shop = frappe.get_doc({"doctype": "Social Shop", "shop_name": tag + " denied", "enabled": 1}).insert()
        frappe.get_doc({"doctype": "User Permission", "user": actor, "allow": "Social Shop", "for_value": shop.name}).insert()
        account = frappe.get_doc({"doctype": "WhatsApp Account", "account_name": tag,
            "phone_id": account_id, "status": "Active", "mode": "Demo", "doco_shop": shop.name,
            "is_default_incoming": 0, "is_default_outgoing": 0}).insert()
        denied_account = frappe.get_doc({"doctype": "WhatsApp Account", "account_name": tag + " denied",
            "phone_id": account_id + "9", "status": "Active", "mode": "Demo", "doco_shop": denied_shop.name,
            "is_default_incoming": 0, "is_default_outgoing": 0}).insert()
        messages = []
        samples = [
            (peers[0], account.name, 'Fictional customer <img src=x onerror="window.fixtureAttack=1"> ' + "LongWord" * 30, {}),
            (peers[0], account.name, "CLINICAL_MIXED_SECRET", {"reference_doctype": "Patient", "reference_name": tag}),
            (peers[1], account.name, "PRIVATE_ASSISTANT_SECRET", {}),
            (peers[2], account.name, "CLINICAL_ONLY_SECRET", {"reference_doctype": "Patient", "reference_name": tag}),
            (peers[0], denied_account.name, "OTHER_SCOPE_SECRET", {}),
        ]
        for peer, account_name, body, extra in samples:
            message = frappe.get_doc({"doctype": "WhatsApp Message", "name": secrets.token_hex(16),
                "type": "Incoming", "from": peer, "whatsapp_account": account_name, "message": body,
                "content_type": "text", **extra})
            message.db_insert()
            messages.append(message.name)
        private = frappe.get_doc({"doctype": "Asistente Canal", "name": secrets.token_hex(16),
            "channel": "WhatsApp", "external_id": peers[1], "enabled": 0, "user": actor, "role": "Asistente"})
        private.db_insert()
        data.update(account_id=account_id, account=account.name, denied_account=denied_account.name,
            denied_account_id=account_id + "9", shop=shop.name, denied_shop=denied_shop.name,
            peer=peers[0], private_peer=peers[1], clinical_peer=peers[2], private=private.name, messages=messages)
    frappe.db.commit()
    save_fixture(data)
    print(json.dumps({"fixture": str(FIXTURE), "actor": actor, "fictional_only": True, "blocked_calls": blocked_calls}), flush=True)
elif args.mode in {"inspect", "cleanup"}:
    data = json.loads(FIXTURE.read_text())
    assert data["site"] == SITE
    result = {"site": SITE, "actor": data["actor"], "user_enabled": frappe.db.get_value("User", data["actor"], "enabled")}
    if args.site == "eight":
        from crm.api import conversations as control
        from crm.api import outbox
        name = control.conversation_key("WhatsApp", data["account_id"], data["peer"])
        intents = frappe.get_all(outbox.DOCTYPE, filters={"conversation": name},
            fields=["name", "state", "attempts", "provider_message_id", "actor_user"])
        result.update(conversation=name, intents=intents, intent_count=len(intents),
            conversation_state=frappe.db.get_value(control.DOCTYPE, name, ["control_state", "generation", "bot_enabled"], as_dict=True),
            accounts=[frappe.db.get_value("WhatsApp Account", value, ["name", "status", "mode"], as_dict=True)
                for value in (data["account"], data["denied_account"])],
            shops=[frappe.db.get_value("Social Shop", value, ["name", "enabled"], as_dict=True)
                for value in (data["shop"], data["denied_shop"])],
            events=frappe.get_all("CRM Conversation Control Event", filters={"conversation": name},
                fields=["action", "from_generation", "to_generation", "actor_user"]))
        if args.mode == "cleanup":
            if frappe.db.exists(control.DOCTYPE, name):
                frappe.set_user(data["actor"])
                for intent in intents:
                    if intent.state in {"Queued", "Claimed", "Blocked", "Deferred", "Failed"}:
                        outbox.cancel_intent(intent.name)
                doc = control.get_conversation(name)
                if doc["control_state"] != "Closed":
                    if doc["human_owner"] != data["actor"]:
                        doc = control.apply_control(name, "take", doc["generation"], secrets.token_hex(16))
                    control.apply_control(name, "close", doc["generation"], secrets.token_hex(16))
                frappe.set_user("Administrator")
            for account in (data["account"], data["denied_account"]):
                frappe.db.set_value("WhatsApp Account", account, "status", "Inactive")
            for shop in (data["shop"], data["denied_shop"]):
                frappe.db.set_value("Social Shop", shop, "enabled", 0)
    if args.mode == "cleanup":
        user = frappe.get_doc("User", data["actor"])
        user.enabled = 0
        user.save()
        frappe.db.commit()
        result["cleanup"] = "Audit and fictional messages retained; conversations closed, users/accounts/shops disabled"
        data.pop("password", None)
        save_fixture(data)
    print(json.dumps(result, default=str, sort_keys=True), flush=True)
else:
    assert FIXTURE.exists(), "Set up the exact owned fixtures first"
    frappe.destroy()
    frappe.is_setup_complete = lambda: True
    frappe.app._site = SITE
    from werkzeug.serving import run_simple
    from werkzeug.middleware.shared_data import SharedDataMiddleware
    app = SharedDataMiddleware(frappe.app.application, {"/assets": "/home/frappe/frappe-bench/sites/assets"})
    print(json.dumps({"serving": args.port, "fixed_site": SITE, "transport": "requests/SMTP blocked; sendmail/enqueue suppressed"}), flush=True)
    run_simple("0.0.0.0", args.port, app, use_reloader=False, use_debugger=False, threaded=True)
    sys.exit(0)
frappe.db.rollback()
frappe.destroy()
