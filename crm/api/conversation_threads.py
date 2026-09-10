"""Customer Inbox/Desk broker: exact identities, finite projections, no sending.

Private assistant and non-CRM source history is excluded before previews/content.
Only an explicit authorized open may materialize a historical customer thread.
"""
from contextlib import contextmanager
import json
import re
from urllib.parse import urlsplit

import frappe
from frappe.permissions import has_permission
from frappe.utils.password import decrypt, encrypt

from crm.api import conversations as control
from crm.conversation_scope import assert_customer_peer

MAX_PAGE = 50
SCAN = 200
REFS = tuple(sorted(control.REFERENCES))


def _limit(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        frappe.throw("Invalid page size.")
    return min(max(value, 1), MAX_PAGE)


def _actor():
    actor = frappe.session.user
    if not control._roles(actor).intersection(control._channel_roles("WhatsApp")):
        control._deny()
    return actor


@contextmanager
def _quiet_denial():
    messages = list(getattr(frappe.local, "message_log", []) or [])
    try:
        yield
    finally:
        frappe.local.message_log = messages


def _permitted(check):
    try:
        with _quiet_denial():
            check()
        return True
    except (frappe.PermissionError, frappe.DoesNotExistError):
        return False


def _account_probe(provider, account_id, *, write=False):
    control.conversation_key(provider, account_id, "0" * 64 if provider == "Webchat" else "1")
    probe = frappe._dict(provider=provider, account_id=account_id, name=None,
                        reference_doctype=None, reference_name=None, shop_key=None)
    roles, account = control._authorize(probe, write=write)
    return roles, account


def _channel_available(provider):
    apps = frappe.get_installed_apps()
    if provider == "Webchat":
        return all(frappe.db.exists("DocType", dt) for dt in ("CRM Webchat Channel", "CRM Webchat Message", "CRM Webchat Session"))
    if provider == "WhatsApp":
        return "frappe_whatsapp" in apps and frappe.db.exists("DocType", "WhatsApp Account") and frappe.db.exists("DocType", "WhatsApp Message")
    return "doco_marketing" in apps and frappe.db.exists("DocType", "Messenger Page") and frappe.db.exists("DocType", "Messenger Message")


def _cursor(value, context):
    if not value:
        return None
    if not isinstance(value, str) or len(value) > 3000:
        frappe.throw("Invalid page cursor.")
    try:
        payload = json.loads(decrypt(value))
        if payload["context"] != [frappe.session.user, *context]:
            raise ValueError()
        return payload["position"]
    except Exception:
        frappe.throw("Invalid page cursor.")


def _next(position, context):
    # Encryption also prevents cursors disclosing skipped/private peer IDs.
    return encrypt(json.dumps({"context": [frappe.session.user, *context], "position": position}, default=str))


def _private_peer(provider, peer):
    return not _permitted(lambda: assert_customer_peer(provider, peer))


def _source_allowed(row):
    dt, name = row.get("reference_doctype"), row.get("reference_name")
    if not dt and not name:
        return True
    if dt not in REFS or not name:
        return False
    def check():
        doc = frappe.get_doc(dt, name, for_update=True)
        if not has_permission(dt, "read", doc=doc, user=frappe.session.user, print_logs=False):
            control._deny()
    return _permitted(check)


def _scope(provider, account_id):
    _, account = _account_probe(provider, account_id)
    if provider == "Webchat":
        return frappe._dict(doctype="CRM Webchat Message", table="`tabCRM Webchat Message`", peer="m.peer_id",
            where="m.channel=%s AND m.direction IN ('Incoming','Outgoing')", args=[account.name], timestamp="m.creation")
    if provider == "WhatsApp":
        return frappe._dict(doctype="WhatsApp Message", table="`tabWhatsApp Message`",
            peer="CASE WHEN m.type='Incoming' THEN m.`from` ELSE m.`to` END",
            where="m.whatsapp_account=%s AND m.type IN ('Incoming','Outgoing')", args=[account.name],
            timestamp="COALESCE(m.external_sent_at,m.creation)" if frappe.db.has_column("WhatsApp Message", "external_sent_at") else "m.creation")
    page_id = frappe.db.get_value("Messenger Page", account.name, "page_id", for_update=True)
    platform = "(m.platform='Messenger' OR m.platform IS NULL OR m.platform='')" if provider == "Messenger" else "m.platform='Instagram'"
    return frappe._dict(doctype="Messenger Message", table="`tabMessenger Message`", peer="m.psid",
        where=f"m.page_id=%s AND {platform} AND m.direction IN ('Incoming','Outgoing')", args=[page_id],
        timestamp="COALESCE(m.sent_ts,m.creation)")


def _reference_clause(scope=None):
    # Never even fetch Chart/Patient/non-CRM content or attachment columns.
    if scope and scope.doctype == "CRM Webchat Message":
        return "1=1"  # This private transcript has no source-document/attachment fields.
    return "(COALESCE(m.reference_doctype,'')='' OR m.reference_doctype IN ('CRM Inquiry','CRM Lead','CRM Deal'))"


def _metadata(scope, peer, *, cursor=None, limit=SCAN):
    args = [*scope.args, peer]
    before = ""
    if cursor:
        if not isinstance(cursor, list) or len(cursor) != 2 or not all(isinstance(v, str) for v in cursor):
            frappe.throw("Invalid history cursor.")
        before = f" AND ({scope.timestamp}<%s OR ({scope.timestamp}=%s AND m.name<%s))"
        args.extend([cursor[0], cursor[0], cursor[1]])
    references = "NULL AS reference_doctype, NULL AS reference_name" if scope.doctype == "CRM Webchat Message" else "m.reference_doctype, m.reference_name"
    return frappe.db.sql(f"""SELECT m.name, {references},
        {scope.timestamp} AS timestamp FROM {scope.table} m
        WHERE {scope.where} AND {scope.peer}=%s AND {_reference_clause(scope)}{before}
        ORDER BY {scope.timestamp} DESC,m.name DESC LIMIT {int(limit)} FOR UPDATE""", args, as_dict=True)


def _first_visible(scope, peer):
    if scope.doctype == "CRM Webchat Message":
        rows = _metadata(scope, peer, limit=1)
        return rows[0] if rows else None
    # Permission-check distinct references before selecting the preview. A long
    # run of denied messages must not hide an older, readable customer message.
    references = frappe.db.sql(f"""SELECT DISTINCT m.reference_doctype,m.reference_name
        FROM {scope.table} m WHERE {scope.where} AND {scope.peer}=%s
        AND {_reference_clause()}""", [*scope.args, peer], as_dict=True)
    clauses, args = [], []
    for row in references:
        if _source_allowed(row):
            clauses.append("(COALESCE(m.reference_doctype,'')=%s AND COALESCE(m.reference_name,'')=%s)")
            args.extend([row.reference_doctype or "", row.reference_name or ""])
    if not clauses:
        return None
    rows = frappe.db.sql(f"""SELECT m.name,m.reference_doctype,m.reference_name,
        {scope.timestamp} AS timestamp FROM {scope.table} m
        WHERE {scope.where} AND {scope.peer}=%s AND ({' OR '.join(clauses)})
        ORDER BY {scope.timestamp} DESC,m.name DESC LIMIT 1 FOR UPDATE""", [*scope.args, peer, *args], as_dict=True)
    return rows[0] if rows else None


def _safe_attachment(value, doctype, message_name):
    if not isinstance(value, str) or len(value) > 1000:
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or not parsed.path.startswith(("/files/", "/private/files/")):
        return None
    if any(part in {".", ".."} for part in parsed.path.split("/")) or "%" in value or "\\" in value:
        return None
    files = frappe.db.get_values("File", {"file_url": value},
        ["name", "is_private", "attached_to_doctype", "attached_to_name"], as_dict=True, for_update=True)
    if len(files) != 1:
        return None
    f = files[0]
    if f.attached_to_doctype == doctype and f.attached_to_name == message_name:
        pass
    elif f.attached_to_doctype in REFS and _source_allowed({"reference_doctype": f.attached_to_doctype, "reference_name": f.attached_to_name}):
        pass
    else:
        return None
    # Protected downloads still require Frappe's actual File permission. This
    # broker does not create public copies or proxy arbitrary provider URLs.
    if f.is_private:
        file_doc = frappe.get_doc("File", f.name, for_update=True)
        if not has_permission("File", "read", doc=file_doc, user=frappe.session.user, print_logs=False):
            return None
    return value


def _message(scope, metadata):
    if scope.doctype == "CRM Webchat Message":
        row = frappe.db.get_value(scope.doctype, metadata.name, ["direction", "text"], as_dict=True, for_update=True)
        direction, content = row.direction, row.text
        row.update({"attach": None, "content_type": "text", "status": ""})
    elif scope.doctype == "WhatsApp Message":
        fields = ["type", "message", "content_type", "attach", "status", "is_demo"]
        row = frappe.db.get_value(scope.doctype, metadata.name, fields, as_dict=True, for_update=True)
        direction, content = row.type, row.message
    else:
        fields = ["direction", "content", "content_type", "attach", "status"]
        row = frappe.db.get_value(scope.doctype, metadata.name, fields, as_dict=True, for_update=True)
        direction, content = row.direction, row.content
    attachment = _safe_attachment(row.attach, scope.doctype, metadata.name) if row.attach else None
    content_type = row.content_type or "text"
    text = str(content or "")[:20000]
    if content_type != "text" and not text:
        text = {"image": "Imagen", "video": "Video", "audio": "Audio", "document": "Documento"}.get(content_type, "Mensaje sin texto")
    return {"id": metadata.name, "direction": "out" if direction == "Outgoing" else "in",
            "content": text, "content_type": content_type, "attach": attachment,
            "attachment_restricted": bool(row.attach and not attachment), "timestamp": str(metadata.timestamp),
            "status": row.status or "", "is_demo": bool(row.get("is_demo"))}


def _actions(doc):
    if not _permitted(lambda: control._authorize(doc, write=True)):
        return [], False
    actor = frappe.session.user
    roles = control._roles(actor)
    manager = bool(roles & control.MANAGERS)
    owns = doc.human_owner == actor
    actions = []
    if doc.control_state != "Closed" and (not doc.human_owner or owns or manager):
        actions.append("take")
    if doc.control_state == "Human" and doc.human_owner and not owns:
        actions.append("request")
    if doc.control_state == "Human" and (owns or manager):
        actions.extend(["transfer", "release"])
    if doc.control_state != "Closed" and (owns or manager or doc.control_state == "Bot"):
        actions.append("pause")
    if owns or manager:
        actions.append("close" if doc.control_state != "Closed" else "reopen")
    return actions, manager and not owns


def _detail(doc):
    result = control._projection(doc)
    result["display_name"] = _display_name(doc.provider, doc.peer_id)
    result["allowed_actions"], result["manager_reason_required"] = _actions(doc)
    result["actor"] = frappe.session.user
    result["send_available"] = bool(doc.provider in {"WhatsApp", "Webchat"} and doc.control_state == "Human"
        and doc.human_owner == frappe.session.user and "release" in result["allowed_actions"]
        and doc.provider_control in ("Not Applicable", "Ours") and frappe.db.exists("DocType", "CRM Outbound Intent"))
    result["control_requests"] = frappe.db.get_values(control.EVENT,
        {"conversation": doc.name, "action": "request", "to_generation": doc.generation},
        ["actor_user", "creation"], as_dict=True, order_by="creation desc", limit=20)
    return result


def _display_name(provider, peer_id):
    return "Visitante " + peer_id[:8].upper() if provider == "Webchat" else peer_id


@frappe.whitelist()
def list_accounts():
    _actor()
    result = []
    for provider in ("WhatsApp", "Messenger", "Instagram", "Webchat"):
        if not _channel_available(provider):
            continue
        if provider == "Webchat":
            doctype, field, label, status = "CRM Webchat Channel", "account_id", "label", "enabled"
        elif provider == "WhatsApp":
            doctype, field, label, status = "WhatsApp Account", "phone_id", "account_name", "status"
        else:
            doctype, field, label, status = "Messenger Page", "page_id" if provider == "Messenger" else "ig_account_id", "page_name", "enabled"
        for row in frappe.db.get_values(doctype, {}, ["name", field, label, status], as_dict=True, for_update=True):
            identity = row.get(field)
            pattern = r"[0-9a-f]{64}" if provider == "Webchat" else r"[0-9]{1,40}"
            if not isinstance(identity, str) or not re.fullmatch(pattern, identity):
                continue
            if _permitted(lambda: _account_probe(provider, identity)):
                result.append({"provider": provider, "account_id": identity, "label": row.get(label) or identity,
                               "active": row.get(status) in ("Active", 1)})
    return {"available": bool(result), "accounts": result, "actor": frappe.session.user, "send_available": False}


@frappe.whitelist()
def list_threads(provider, account_id, cursor=None, limit=30):
    _actor()
    scope = _scope(provider, account_id)
    context = ["threads", provider, account_id]
    after = _cursor(cursor, context) or ""
    pattern = r"[0-9a-f]{64}" if provider == "Webchat" else r"[0-9]{1,40}"
    if not isinstance(after, str) or (after and not re.fullmatch(pattern, after)):
        frappe.throw("Invalid page cursor.")
    size = _limit(limit)
    # Metadata-only union: materialized controls plus exact historical peers.
    peers = frappe.db.sql(f"""SELECT peer_id FROM (
        SELECT peer_id FROM `tabCRM Conversation` WHERE provider=%s AND account_id=%s
        UNION SELECT {scope.peer} AS peer_id FROM {scope.table} m
            WHERE {scope.where} AND {_reference_clause(scope)}
        ) AS candidates WHERE peer_id REGEXP %s AND peer_id>%s
        ORDER BY peer_id LIMIT {SCAN + 1}""", [provider, account_id, *scope.args, "^" + pattern + "$", after], as_dict=True)
    items, position = [], None
    for index, row in enumerate(peers[:SCAN]):
        peer, position = row.peer_id, row.peer_id
        if _private_peer(provider, peer):
            continue
        name = control.conversation_key(provider, account_id, peer)
        exists = frappe.db.get_value(control.DOCTYPE, name, "name", for_update=True)
        doc = control._load(name) if exists else None
        if doc and not _permitted(lambda: control._authorize(doc)):
            continue
        visible = _first_visible(scope, peer)
        if not doc and not visible:
            continue
        message = _message(scope, visible) if visible else None
        item = {"name": name if doc else None, "provider": provider, "account_id": account_id, "peer_id": peer,
                "display_name": _display_name(provider, peer),
                "materialized": bool(doc), "control_state": doc.control_state if doc else "Human",
                "human_owner": doc.human_owner if doc else None,
                "preview": message["content"][:160] if message else "", "last_message_at": message["timestamp"] if message else None}
        items.append(item)
        if len(items) == size:
            break
    more = bool(position and any(row.peer_id > position for row in peers))
    return {"items": items, "next_cursor": _next(position, context) if more else None}


@frappe.whitelist(methods=["POST"])
def open_thread(provider, account_id, peer_id):
    _actor()
    name = control.conversation_key(provider, account_id, peer_id)
    if _private_peer(provider, peer_id):
        control._deny()
    with control.conversation_fence(name):
        _account_probe(provider, account_id, write=True)
        if frappe.db.get_value(control.DOCTYPE, name, "name", for_update=True):
            doc = control._load(name)
            control._authorize(doc)
            return _detail(doc)
        scope = _scope(provider, account_id)
        if not _first_visible(scope, peer_id):
            control._deny()
        # Explicit historical open is the sole mutation: no inferred reference,
        # Lead/person creation, bot policy copy, reply or mark-read provider call.
        return _detail(control.get_or_create(provider, account_id, peer_id))


@frappe.whitelist()
def get_history(conversation, cursor=None, limit=50):
    _actor()
    doc = control._load(conversation)
    control._authorize(doc)
    if _private_peer(doc.provider, doc.peer_id):
        control._deny()
    scope = _scope(doc.provider, doc.account_id)
    context = ["history", doc.name]
    position = _cursor(cursor, context)
    rows = _metadata(scope, doc.peer_id, cursor=position, limit=SCAN + 1)
    size, items, last = _limit(limit), [], None
    for row in rows[:SCAN]:
        last = [str(row.timestamp), row.name]
        if _source_allowed(row):
            items.append(_message(scope, row))
        if len(items) == size:
            break
    more = bool(last and any((str(row.timestamp), row.name) < tuple(last) for row in rows))
    return {"conversation": _detail(doc), "messages": list(reversed(items)),
            "next_cursor": _next(last, context) if more else None}


@frappe.whitelist()
def list_operators(conversation, query=""):
    _actor()
    doc = control._load(conversation)
    control._authorize(doc, write=True)
    if _private_peer(doc.provider, doc.peer_id) or "transfer" not in _actions(doc)[0]:
        control._deny()
    query = control._text(query, 80, required=False)
    candidates = frappe.db.sql("""SELECT name, full_name FROM `tabUser`
        WHERE enabled=1 AND user_type='System User' AND name NOT IN ('Guest','Administrator')
        AND (name LIKE %s OR full_name LIKE %s) ORDER BY full_name,name LIMIT 100""", ("%" + query + "%", "%" + query + "%"), as_dict=True)
    return [{"name": row.name, "label": row.full_name or row.name} for row in candidates
            if _permitted(lambda: control._authorize(doc, row.name, write=True))][:30]
