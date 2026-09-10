"""Fixed isolated-site Webchat browser proof; no provider calls or production config.

Only the landing's four read projections are fictional. Guest Webchat, staff
authentication, broker/control/outbox and their commits use actual Frappe/CRM.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import smtplib
import sys

sys.path.insert(0, "/tmp/meta-wa-20260910")
os.chdir("/home/frappe/frappe-bench/sites")
import frappe
import frappe.app
import requests
from werkzeug.wrappers import Response

SITE = "meta-reliability-test-20260910.lab.xoloitzcuintles.com"
FIXTURE = Path("/tmp/webchat-chain-fixture.json")
ORIGIN = "https://127.0.0.1:46833"
parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=("setup", "serve", "worker", "manager", "inspect", "cleanup"))
args = parser.parse_args()
counts = {"external": 0, "mail": 0, "enqueue": 0}


def blocked(*a, **kw):
    counts["external"] += 1
    raise RuntimeError("External transport forbidden in isolated Webchat proof")


def no_queue(*a, **kw):
    counts["enqueue"] += 1


def no_mail(*a, **kw):
    counts["mail"] += 1


requests.sessions.Session.request = blocked
smtplib.SMTP.sendmail = blocked
frappe.enqueue = no_queue
frappe.sendmail = no_mail
original_init = frappe.init


def fixed_init(site=None, *a, **kw):
    if site != SITE:
        raise RuntimeError("Wrong site for isolated Webchat proof")
    result = original_init(site, *a, **kw)
    assert all(int(frappe.conf.get(key) or 0) == 1 for key in ("maintenance_mode", "pause_scheduler", "mute_emails"))
    frappe.local.conf = frappe._dict(frappe.local.conf)
    if args.mode in {"serve", "worker"}:
        frappe.local.conf.maintenance_mode = 0
    return result


frappe.init = fixed_init
frappe.init(SITE)
frappe.connect()
frappe.set_user("Administrator")
assert set(frappe.get_installed_apps()) == {
    "frappe", "erpnext", "crm", "doco", "doco_marketing", "frappe_whatsapp", "mercado", "scanner_kit"
}
from crm.api import conversations as control, outbox, webchat
assert webchat.__file__.startswith("/tmp/meta-wa-20260910/")
assert "crm.api.webchat.prepare_request" in frappe.get_hooks("before_request")


def save(data):
    fd = os.open(FIXTURE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump(data, file)


def snapshot(data):
    scope = {"provider": "Webchat", "account_id": data["channel_id"]}
    return {
        "site": SITE, "channel_id": data["channel_id"],
        "channel_enabled": frappe.db.get_value(webchat.CHANNEL, data["channel_id"], "enabled"),
        "actor_enabled": frappe.db.get_value("User", data["actor"], "enabled"),
        "conversations": frappe.get_all(control.DOCTYPE, filters=scope,
            fields=["name", "control_state", "generation", "human_owner", "bot_enabled"]),
        "intents": frappe.get_all(outbox.DOCTYPE, filters=scope,
            fields=["name", "state", "attempts", "provider_message_id", "reason_code"]),
        "messages": frappe.get_all(webchat.MESSAGE, filters={"channel": data["channel_id"]},
            fields=["name", "direction", "request_id", "conversation"]),
        "sessions": frappe.db.count(webchat.SESSION, {"channel": data["channel_id"]}),
        "active_sessions": frappe.db.count(webchat.SESSION, {"channel": data["channel_id"], "revoked": 0}),
        "persistent_holds": [int(frappe.conf.get(k) or 0) for k in ("maintenance_mode", "pause_scheduler", "mute_emails")],
        "blocked": counts,
    }


if args.mode == "setup":
    assert not FIXTURE.exists(), "Preserve the existing private proof manifest"
    tag = "webchat-chain-" + secrets.token_hex(5)
    actor, password = tag + "@example.invalid", secrets.token_urlsafe(32)
    frappe.get_doc({"doctype": "User", "email": actor, "first_name": "Fictional Webchat operator",
        "enabled": 1, "send_welcome_email": 0, "user_type": "System User", "language": "en",
        "roles": [{"role": "Sales User"}]}).insert()
    from frappe.utils.password import update_password
    update_password(actor, password)
    channel = webchat.configure_channel("Equipo de Tienda Demo", "chat-fixture", ORIGIN, enabled=1)
    frappe.get_doc({"doctype": "User Permission", "user": actor, "allow": webchat.CHANNEL,
        "for_value": channel["account_id"], "apply_to_all_doctypes": 1}).insert()
    data = {"site": SITE, "actor": actor, "password": password, "channel_id": channel["account_id"], "origin": ORIGIN}
    frappe.db.commit()
    save(data)
    print(json.dumps({"event": "setup", "manifest": str(FIXTURE), "site": SITE, "channel_id": data["channel_id"], "blocked": counts}), flush=True)
elif args.mode == "serve":
    assert FIXTURE.exists()
    frappe.destroy()
    frappe.is_setup_complete = lambda: True
    import frappe.sessions
    original_boot = frappe.sessions.get

    def fixture_boot():
        boot = original_boot()
        boot["setup_complete"] = True
        boot["sysdefaults"]["setup_complete"] = 1
        return boot  # Response projection only; no settings/cache write.

    frappe.sessions.get = fixture_boot
    frappe.app._site = SITE
    from werkzeug.middleware.shared_data import SharedDataMiddleware
    from werkzeug.serving import run_simple
    app = SharedDataMiddleware(frappe.app.application, {"/assets": "/home/frappe/frappe-bench/sites/assets"})
    reads = {
        "bootstrap": {"shop_info": {"company": "Tienda Demo", "landing": {}}, "nav": {"nav": []}, "collections": {"collections": []}},
        "catalog": {"items": [], "page": 1, "page_size": 24, "has_more": False, "total": 0},
        "sucursales": [], "testimonials": [],
    }

    def proof_app(environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path == "/healthz":
            return Response("ok")(environ, start_response)
        prefix = "/api/method/doco.docoutils.storefront."
        if environ.get("REQUEST_METHOD") == "GET" and path.startswith(prefix) and path[len(prefix):] in reads:
            return Response(json.dumps({"message": reads[path[len(prefix):]]}), content_type="application/json")(environ, start_response)
        return app(environ, start_response)

    print(json.dumps({"event": "serve", "port": 18155, "site": SITE, "persistent_holds": [1, 1, 1]}), flush=True)
    run_simple("0.0.0.0", 18155, proof_app, use_reloader=False, use_debugger=False, threaded=True)
    sys.exit(0)
else:
    data = json.loads(FIXTURE.read_text())
    assert data["site"] == SITE
    if args.mode == "manager":
        user = frappe.get_doc("User", data["actor"])
        if not any(row.role == "System Manager" for row in user.roles):
            user.append("roles", {"role": "System Manager"})
            user.save()
            frappe.db.commit()
        frappe.cache.hdel("bootinfo", data["actor"])
    elif args.mode == "worker":
        names = frappe.get_all(outbox.DOCTYPE, filters={"provider": "Webchat", "account_id": data["channel_id"], "state": "Queued"}, pluck="name")
        frappe.db.rollback()
        for name in names:
            outbox.dispatch_intent(name)
    elif args.mode == "cleanup":
        rows = frappe.get_all(control.DOCTYPE, filters={"provider": "Webchat", "account_id": data["channel_id"]}, fields=["name", "generation", "control_state"])
        for row in rows:
            if row.control_state != "Closed":
                control.apply_control(row.name, "close", row.generation, secrets.token_hex(16), reason="Close fictional browser proof")
        for session in frappe.get_all(webchat.SESSION, filters={"channel": data["channel_id"], "revoked": 0}, pluck="name"):
            doc = frappe.get_doc(webchat.SESSION, session)
            doc.revoked = 1
            webchat._mark(doc).save(ignore_permissions=True)
        row = webchat._channel(data["channel_id"], active=False)
        webchat.configure_channel(row.label, row.profile, row.public_origin, enabled=0, channel_id=row.name, expected_modified=str(row.modified))
        user = frappe.get_doc("User", data["actor"])
        user.enabled = 0
        user.save()
        frappe.db.commit()
        data.pop("password", None)
        save(data)
    print(json.dumps({"event": args.mode, **snapshot(data)}, default=str), flush=True)
frappe.db.rollback()
frappe.destroy()
