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
# WhatsApp addresses one customer in two spellings: an incoming `from` carries
# the provider's long form (e.g. 5216463445324) while the outgoing `to` we store
# is the short form (526463445324). Same phone, so history and the thread list
# key WhatsApp peers by their last PEER_SUFFIX digits — the phone-key contract
# shared with doco_marketing.services.dedupe.normalize_phone and the SPA's
# phoneNormalize.js. Before this, every reply lived in a second, nameless
# thread (Marco 2026-09-15: «where are our messages?»).
PEER_SUFFIX = 10


def _limit(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        frappe.throw("Invalid page size.")
    return min(max(value, 1), MAX_PAGE)


def _actor():
    """Channel staff, or a department member who may hold routed conversations.

    Department roles only pass this entry gate; every conversation, account and
    record is still authorized individually by the control broker.
    """
    actor = frappe.session.user
    roles = control._roles(actor)
    if not roles.intersection(control._channel_roles("WhatsApp")) \
            and not roles.intersection(control.departments.member_roles()):
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


def _source_allowed(row, conversation_reference=None):
    dt, name = row.get("reference_doctype"), row.get("reference_name")
    if not dt and not name:
        return True
    if dt not in REFS or not name:
        return False
    if conversation_reference and (dt, name) == conversation_reference:
        # The conversation itself was just authorized for this exact record,
        # through its read permission or the department's own linked record.
        return True
    def check():
        doc = frappe.get_doc(dt, name, for_update=control._locked())
        if not has_permission(dt, "read", doc=doc, user=frappe.session.user, print_logs=False):
            control._deny()
    return _permitted(check)


def _scope(provider, account_id, doc=None):
    """Per-provider SQL fragments. `peer` names the peer column, `peer_match` is
    the predicate (one %s) that scopes rows to a given peer. With `doc`, the
    exact conversation is authorized instead of the whole account."""
    if doc is not None:
        if (doc.provider, doc.account_id) != (provider, account_id):
            control._deny()
        _, account = control._authorize(doc)
    else:
        _, account = _account_probe(provider, account_id)
    if provider == "Webchat":
        return frappe._dict(doctype="CRM Webchat Message", table="`tabCRM Webchat Message`", peer="m.peer_id",
            peer_match="m.peer_id=%s",
            where="m.channel=%s AND m.direction IN ('Incoming','Outgoing')", args=[account.name], timestamp="m.creation")
    if provider == "WhatsApp":
        peer = "CASE WHEN m.type='Incoming' THEN m.`from` ELSE m.`to` END"
        return frappe._dict(doctype="WhatsApp Message", table="`tabWhatsApp Message`", peer=peer,
            peer_match=f"RIGHT({peer},{PEER_SUFFIX})=RIGHT(%s,{PEER_SUFFIX})",
            where="m.whatsapp_account=%s AND m.type IN ('Incoming','Outgoing')", args=[account.name],
            timestamp="COALESCE(m.external_sent_at,m.creation)" if frappe.db.has_column("WhatsApp Message", "external_sent_at") else "m.creation")
    page_id = frappe.db.get_value("Messenger Page", account.name, "page_id", for_update=control._locked())
    platform = "(m.platform='Messenger' OR m.platform IS NULL OR m.platform='')" if provider == "Messenger" else "m.platform='Instagram'"
    return frappe._dict(doctype="Messenger Message", table="`tabMessenger Message`", peer="m.psid", peer_match="m.psid=%s",
        where=f"m.page_id=%s AND {platform} AND m.direction IN ('Incoming','Outgoing')"
              " AND COALESCE(NULLIF(m.event_type,''),'message') IN ('message','echo')", args=[page_id],
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
        WHERE {scope.where} AND {scope.peer_match} AND {_reference_clause(scope)}{before}
        ORDER BY {scope.timestamp} DESC,m.name DESC LIMIT {int(limit)}{control._for_update()}""", args, as_dict=True)


def _first_visible(scope, peer):
    if scope.doctype == "CRM Webchat Message":
        rows = _metadata(scope, peer, limit=1)
        return rows[0] if rows else None
    # Permission-check distinct references before selecting the preview. A long
    # run of denied messages must not hide an older, readable customer message.
    references = frappe.db.sql(f"""SELECT DISTINCT m.reference_doctype,m.reference_name
        FROM {scope.table} m WHERE {scope.where} AND {scope.peer_match}
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
        WHERE {scope.where} AND {scope.peer_match} AND ({' OR '.join(clauses)})
        ORDER BY {scope.timestamp} DESC,m.name DESC LIMIT 1{control._for_update()}""", [*scope.args, peer, *args], as_dict=True)
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
        ["name", "is_private", "attached_to_doctype", "attached_to_name"], as_dict=True, for_update=control._locked())
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
        file_doc = frappe.get_doc("File", f.name, for_update=control._locked())
        if not has_permission("File", "read", doc=file_doc, user=frappe.session.user, print_logs=False):
            return None
    return value


def _message(scope, metadata):
    locked = control._locked()
    if scope.doctype == "CRM Webchat Message":
        row = frappe.db.get_value(scope.doctype, metadata.name, ["direction", "text"], as_dict=True, for_update=locked)
        direction, content = row.direction, row.text
        row.update({"attach": None, "content_type": "text", "status": ""})
    elif scope.doctype == "WhatsApp Message":
        fields = ["type", "message", "content_type", "attach", "status", "is_demo",
                  "template", "template_parameters", "body_param"]
        row = frappe.db.get_value(scope.doctype, metadata.name, fields, as_dict=True, for_update=locked)
        direction, content = row.type, row.message
    else:
        fields = ["direction", "content", "content_type", "attach", "status"]
        row = frappe.db.get_value(scope.doctype, metadata.name, fields, as_dict=True, for_update=locked)
        direction, content = row.direction, row.content
    attachment = _safe_attachment(row.attach, scope.doctype, metadata.name) if row.attach else None
    content_type = row.content_type or "text"
    text = str(content or "")[:20000]
    if not text and scope.doctype == "WhatsApp Message" and row.get("template"):
        # A template send stores only the template name and its parameters.
        text = _template_text(metadata.name, row)[:20000]
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
    manager = control.manager_for(roles, doc)
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
    result["display_name"] = _display_names(doc.provider, [doc.peer_id]).get(doc.peer_id, doc.peer_id)
    result["allowed_actions"], result["manager_reason_required"] = _actions(doc)
    result["actor"] = frappe.session.user
    from crm.api.outbox import channel_send_ready
    result["send_available"] = bool(doc.control_state == "Human"
        and doc.human_owner == frappe.session.user and "release" in result["allowed_actions"]
        and doc.provider_control in ("Not Applicable", "Ours") and frappe.db.exists("DocType", "CRM Outbound Intent")
        and (doc.provider in {"WhatsApp", "Webchat"} or channel_send_ready(doc.provider)))
    result["context_links"] = control.context_view(doc)
    result["automation_run"] = doc.get("automation_run") or None
    result["routed_at"] = doc.get("routed_at")
    result["control_requests"] = frappe.db.get_values(control.EVENT,
        {"conversation": doc.name, "action": "request", "to_generation": doc.generation},
        ["actor_user", "creation"], as_dict=True, order_by="creation desc", limit=20)
    return result


def _display_name(provider, peer_id):
    return "Visitante " + peer_id[:8].upper() if provider == "Webchat" else peer_id


def _display_names(provider, peers):
    """{peer: label}. A WhatsApp peer resolves to the Contact that owns the
    number (last PEER_SUFFIX digits), else the profile name the customer's own
    WhatsApp sent with an incoming message, else the raw number. Other
    providers keep their exact identity."""
    peers = [p for p in peers if p]
    names = {p: _display_name(provider, p) for p in peers}
    if provider != "WhatsApp" or not peers:
        return names
    keys = {p: p[-PEER_SUFFIX:] for p in peers}
    wanted = tuple(sorted(set(keys.values()))[:SCAN])
    found = {}
    digits = f"RIGHT(REGEXP_REPLACE(COALESCE(mobile_no,''),'[^0-9]',''),{PEER_SUFFIX})"
    for c in frappe.db.sql(f"""SELECT {digits} AS k, full_name, first_name, last_name
        FROM `tabContact` WHERE {digits} IN %(keys)s ORDER BY modified DESC""", {"keys": wanted}, as_dict=True):
        full = c.full_name or " ".join(p for p in [c.first_name, c.last_name] if p).strip()
        if full:
            found.setdefault(c.k, full)
    missing = tuple(k for k in wanted if k not in found)
    if missing:
        for row in frappe.db.sql(f"""SELECT RIGHT(m.`from`,{PEER_SUFFIX}) AS k, m.profile_name
            FROM `tabWhatsApp Message` m WHERE m.type='Incoming' AND COALESCE(m.profile_name,'')<>''
            AND RIGHT(m.`from`,{PEER_SUFFIX}) IN %(keys)s ORDER BY m.creation DESC""", {"keys": missing}, as_dict=True):
            found.setdefault(row.k, row.profile_name)
    for p, k in keys.items():
        if k in found:
            names[p] = found[k]
    return names


def _template_text(message_name, row):
    """Body of a template send: the supervised queue keeps the exact rendered
    preview (wins when present); else the template body with its stored
    parameters substituted; else the template's name."""
    if frappe.db.exists("DocType", "WhatsApp Send Review"):
        preview = frappe.db.get_value("WhatsApp Send Review", {"wa_message": message_name}, "preview")
        if preview:
            return str(preview)
    body = frappe.db.get_value("WhatsApp Templates", row.template, "template") if row.template else None
    if not body:
        return "Plantilla: " + str(row.template or "")
    values = []
    for raw in (row.get("template_parameters"), row.get("body_param")):
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            continue
        if isinstance(parsed, dict):
            values = [parsed[k] for k in sorted(parsed, key=lambda k: int(k) if str(k).isdigit() else 0)]
        elif isinstance(parsed, list):
            values = parsed
        if values:
            break

    def substitute(match):
        index = int(match.group(1)) - 1
        return str(values[index]) if 0 <= index < len(values) else match.group(0)

    return re.sub(r"\{\{(\d+)\}\}", substitute, str(body))


@frappe.whitelist()
def list_for_reference(doctype, name, cursor=None):
    """Conversations that belong to this record: the native conversations
    explicitly linked to it, plus (first page only) the threads implied by the
    record's OWN messages, i.e. WhatsApp / Messenger rows whose reference is this
    record. Nothing is inferred from a phone number and nothing is
    materialized here; an implied thread carries name=None and opens through
    open_thread like any legacy row. Every account and peer is authorized
    individually. Before this, a deal with 28 referenced WhatsApp messages
    showed «No hay conversaciones vinculadas» on production (2026-09-15)."""
    _actor()
    if doctype not in REFS or not _source_allowed({"reference_doctype": doctype, "reference_name": name}):
        control._deny()
    context = ["reference_threads", doctype, name]
    after = _cursor(cursor, context) or ""
    if not isinstance(after, str) or (after and not re.fullmatch(r"[0-9a-f]{64}", after)):
        frappe.throw("Invalid page cursor.")
    rows = frappe.get_all(control.DOCTYPE,
        filters={"reference_doctype": doctype, "reference_name": name, "name": [">", after]},
        fields=["name"], order_by="name asc", limit=SCAN + 1)
    items, seen = [], set()
    for row in rows[:SCAN]:
        doc = control._load(row.name)
        # Check the row again: a concurrent relink must not leak it.
        if doc.reference_doctype != doctype or doc.reference_name != name:
            continue
        if _permitted(lambda: control._authorize(doc)):
            items.append(_reference_item(doc.provider, doc.account_id, doc.peer_id, doc))
            seen.add(doc.name)
    if not after:
        items.extend(_implied_threads(doctype, name, seen))
    return {"items": items, "next_cursor": _next(rows[SCAN - 1].name, context) if len(rows) > SCAN else None}


def _reference_item(provider, account_id, peer, doc=None):
    """One row of list_for_reference: the conversation when materialized, else
    the exact legacy identity, plus the newest visible message as preview."""
    scope = None
    try:
        with _quiet_denial():
            scope = _scope(provider, account_id)
    except (frappe.PermissionError, frappe.DoesNotExistError):
        scope = None
    visible = _first_visible(scope, peer) if scope else None
    message = _message(scope, visible) if visible else None
    return {"name": doc.name if doc else None, "provider": provider, "account_id": account_id, "peer_id": peer,
            "display_name": _display_names(provider, [peer]).get(peer, peer),
            "materialized": bool(doc), "control_state": doc.control_state if doc else "Human",
            "human_owner": doc.human_owner if doc else None,
            "preview": message["content"][:160] if message else "",
            "last_message_at": message["timestamp"] if message else None}


def _implied_threads(doctype, name, seen):
    """(provider, account_id, peer) triples named by the record's own messages,
    one per customer (WhatsApp spellings collapsed), each authorized as the
    thread list would; already listed conversations are skipped."""
    candidates = []  # (provider, account_id, peer)
    if _channel_available("WhatsApp"):
        rows = frappe.db.sql("""SELECT m.whatsapp_account AS account,
            CASE WHEN m.type='Incoming' THEN m.`from` ELSE m.`to` END AS peer
            FROM `tabWhatsApp Message` m
            WHERE m.reference_doctype=%s AND m.reference_name=%s AND m.type IN ('Incoming','Outgoing')
            GROUP BY 1, 2""", (doctype, name), as_dict=True)
        accounts = {}
        if rows:
            accounts = {a.name: a.phone_id for a in frappe.get_all("WhatsApp Account",
                filters={"name": ["in", sorted({r.account for r in rows if r.account})]},
                fields=["name", "phone_id"], limit_page_length=0)}
        candidates.extend(("WhatsApp", accounts.get(r.account), r.peer) for r in rows)
    if _channel_available("Messenger"):
        rows = frappe.db.sql("""SELECT m.page_id, m.psid, COALESCE(m.platform,'') AS platform
            FROM `tabMessenger Message` m
            WHERE m.reference_doctype=%s AND m.reference_name=%s AND m.direction IN ('Incoming','Outgoing')
            GROUP BY 1, 2, 3""", (doctype, name), as_dict=True)
        pages = {}
        if rows:
            pages = {p.page_id: p.ig_account_id for p in frappe.get_all("Messenger Page",
                filters={"page_id": ["in", sorted({r.page_id for r in rows if r.page_id})]},
                fields=["page_id", "ig_account_id"], limit_page_length=0)}
        for r in rows:
            if r.platform == "Instagram":
                candidates.append(("Instagram", pages.get(r.page_id), r.psid))
            else:
                candidates.append(("Messenger", r.page_id, r.psid))
    items = []
    for provider, account_id, peer in sorted({c for c in candidates if c[1] and c[2]}):
        if not re.fullmatch(r"[0-9]{1,40}", str(account_id)) or not re.fullmatch(r"[0-9]{1,40}", str(peer)):
            continue
        if not _permitted(lambda: _account_probe(provider, account_id)) or _private_peer(provider, peer):
            continue
        items.append((provider, account_id, peer))
    out = []
    by_account = {}
    for provider, account_id, peer in items:
        by_account.setdefault((provider, account_id), []).append(frappe._dict(peer_id=peer))
    for (provider, account_id), peers in by_account.items():
        for row in _collapse_spellings(provider, account_id, peers):
            peer = row.peer_id
            key = control.conversation_key(provider, account_id, peer)
            doc = control._load(key) if frappe.db.get_value(control.DOCTYPE, key, "name") else None
            if doc and (doc.name in seen or not _permitted(lambda: control._authorize(doc))):
                continue
            item = _reference_item(provider, account_id, peer, doc)
            if doc or item["preview"] or item["last_message_at"]:
                out.append(item)
    return out


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
        for row in frappe.db.get_values(doctype, {}, ["name", field, label, status], as_dict=True, for_update=control._locked()):
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
    for row in _collapse_spellings(provider, account_id, peers[:SCAN]):
        peer, position = row.peer_id, row.position
        if _private_peer(provider, peer):
            continue
        name = control.conversation_key(provider, account_id, peer)
        exists = frappe.db.get_value(control.DOCTYPE, name, "name", for_update=control._locked())
        doc = control._load(name) if exists else None
        if doc and not _permitted(lambda: control._authorize(doc)):
            continue
        visible = _first_visible(scope, peer)
        if not doc and not visible:
            continue
        message = _message(scope, visible) if visible else None
        item = {"name": name if doc else None, "provider": provider, "account_id": account_id, "peer_id": peer,
                "display_name": peer,
                "materialized": bool(doc), "control_state": doc.control_state if doc else "Human",
                "human_owner": doc.human_owner if doc else None,
                "preview": message["content"][:160] if message else "", "last_message_at": message["timestamp"] if message else None}
        items.append(item)
        if len(items) == size:
            break
    names = _display_names(provider, [item["peer_id"] for item in items])
    for item in items:
        item["display_name"] = names.get(item["peer_id"], item["peer_id"])
    more = bool(position and any(row.peer_id > position for row in peers))
    return {"items": items, "next_cursor": _next(position, context) if more else None}


def _collapse_spellings(provider, account_id, rows):
    """One thread per phone. WhatsApp rows that share their last PEER_SUFFIX
    digits are one customer; the group is represented by the spelling that
    already has a materialized conversation, else by the longest one (the
    provider's own form). Every member still advances the page cursor."""
    if provider != "WhatsApp":
        return [frappe._dict(peer_id=r.peer_id, position=r.peer_id) for r in rows]
    groups = {}
    for r in rows:
        groups.setdefault(r.peer_id[-PEER_SUFFIX:], []).append(r.peer_id)
    keys = {control.conversation_key(provider, account_id, p): p
            for members in groups.values() if len(members) > 1 for p in members}
    known = set()
    if keys:
        known = {keys[n] for n in frappe.get_all(control.DOCTYPE, filters={"name": ["in", list(keys)]}, pluck="name")}
    out = []
    for members in groups.values():
        chosen = [p for p in members if p in known] or sorted(members, key=len, reverse=True)
        out.append(frappe._dict(peer_id=chosen[0], position=max(members)))
    out.sort(key=lambda r: r.position)
    return out


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
    scope = _scope(doc.provider, doc.account_id, doc=doc)
    context = ["history", doc.name]
    position = _cursor(cursor, context)
    rows = _metadata(scope, doc.peer_id, cursor=position, limit=SCAN + 1)
    size, items, last = _limit(limit), [], None
    same = (doc.reference_doctype, doc.reference_name) if doc.reference_doctype else None
    for row in rows[:SCAN]:
        last = [str(row.timestamp), row.name]
        if _source_allowed(row, same):
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
