"""Finite visitor capabilities over the existing customer conversation runtime.

Capabilities authorize only one channel/session. No staff impersonation, identity
merge, consent claim, model, remote transport or transaction boundary lives here.
"""
from contextlib import contextmanager
from datetime import timedelta, timezone
from functools import wraps
import hashlib
import hmac
import json
import re
import secrets
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from werkzeug.exceptions import HTTPException
from werkzeug.wrappers import Response

import frappe
from frappe.utils import get_datetime, get_system_timezone, now_datetime

CHANNEL = "CRM Webchat Channel"
SESSION = "CRM Webchat Session"
MESSAGE = "CRM Webchat Message"
MAX_BODY_BYTES = 16 * 1024
PAGE_SIZE = 50
_WRITE_TOKEN = object()
_PUBLIC_METHODS = frozenset({"get_channel", "bootstrap", "history", "send", "revoke"})
_AUTHENTICATED_METHODS = frozenset({"history", "send", "revoke"})
_VISITOR_PATHS = {prefix + "crm.api.webchat." + method: method
    for prefix in ("/api/method/", "/api/v1/method/") for method in _PUBLIC_METHODS}
_RATE_SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n"


class _RequestAuthority:
    __slots__ = ("request", "path", "digest")

    def __init__(self, request, digest):
        self.request, self.path, self.digest = request, request.path, digest

    def __repr__(self):
        return "<private Webchat request authority>"


def _require(condition, message="Invalid Webchat request."):
    if not condition:
        raise frappe.ValidationError(message)


def _deny():
    raise frappe.PermissionError("Webchat session or channel is unavailable.")


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _key(*values):
    return _hash(_canonical(list(values)))


def _hex(value):
    _require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value))
    return value


def _short(value, maximum=140):
    _require(isinstance(value, str) and 0 < len(value) <= maximum and value == value.strip())
    _require(not any(ord(char) < 32 for char in value))
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise frappe.ValidationError("Invalid Webchat request.") from None
    return value


def _text(value):
    _require(isinstance(value, str) and bool(value.strip()) and len(value) <= 2000)
    _require(not any(ord(char) < 32 and char not in "\n\r\t" for char in value))
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise frappe.ValidationError("Invalid Webchat text.") from None
    return value  # Plain text; never parse/render HTML or normalize frozen text.


def _request_id(value):
    _require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value))
    return value


def _origin(value):
    _short(value, 512)
    try:
        parsed = urlsplit(value)
        _require(parsed.scheme == "https" and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment and parsed.path in {"", "/"})
        host = parsed.hostname.encode("idna").decode("ascii").lower()
        _require(len(host) <= 253 and re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host) and ".." not in host)
        port = parsed.port
        _require(port is None or 1 <= port <= 65535)
        return "https://" + host + (":" + str(port) if port and port != 443 else "")
    except (ValueError, AttributeError, UnicodeError):
        raise frappe.ValidationError("A canonical HTTPS public origin is required.") from None


def _no_store():
    if getattr(frappe.local, "response_headers", None) is None:
        frappe.local.response_headers = {}
    frappe.local.response_headers.update({"Cache-Control": "private, no-store", "Pragma": "no-cache"})


def _public_time(value):
    return get_datetime(value).replace(tzinfo=ZoneInfo(get_system_timezone())).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _expiry(value):
    zone = ZoneInfo(get_system_timezone())
    start = get_datetime(value).replace(tzinfo=zone).astimezone(timezone.utc)
    return (start + timedelta(hours=24)).astimezone(zone).replace(tzinfo=None)


def _scrub_diagnostics():
    """Discard visitor request material after validation, including cached JSON.

    Frappe's error sanitizer does not recognize 'capability'. This does not
    replace raw validation or claim to protect failures before RPC dispatch.
    """
    form = getattr(frappe.local, "form_dict", None)
    if form is not None:
        for key in tuple(form):
            if key != "cmd":
                form[key] = "[redacted]"
    request = getattr(frappe.local, "request", None)
    if request is not None:
        request.__dict__["_cached_data"] = b"{}"
        request.__dict__["_cached_json"] = ({}, {})
        request.__dict__.pop("form", None)


def _guest(fn=None, *, scrub_after=True):
    """Static HTTP errors preserve request rollback without secret snapshots.

    Frappe handles HTTPException directly, skipping generic Error Log/Sentry
    traceback snapshots (which otherwise include RPC argument frame locals).
    """
    if fn is None:
        return lambda function: _guest(function, scrub_after=scrub_after)
    @wraps(fn)
    def protected(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as error:
            _scrub_diagnostics()
            if isinstance(error, frappe.PermissionError):
                status, reason, message = 403, "session_unavailable", "Webchat session or channel is unavailable."
            elif isinstance(error, frappe.RateLimitExceededError):
                status, reason, message = 429, "rate_limited", "Webchat is temporarily unavailable. Try again later."
            elif isinstance(error, frappe.ValidationError):
                status, reason, message = 417, "request_invalid", "Invalid Webchat request."
            else:
                status, reason, message = 503, "temporarily_unavailable", "Webchat is temporarily unavailable. Try again later."
        finally:
            if scrub_after:
                _scrub_diagnostics()
        # Raise outside the except block: no chained provider/SQL message or
        # traceback can enter the public response, including developer mode.
        response = Response(_canonical({"message": message, "reason": reason}), status=status,
            content_type="application/json", headers={"Cache-Control": "private, no-store", "Pragma": "no-cache"})
        raise HTTPException(response=response) from None
    return protected


@_guest(scrub_after=False)
def prepare_request():
    """Fixed before-request hook, before Frappe's OAuth/API authentication.

    Normal RPC JSON contains no credential. Keep only its hash in an opaque,
    exact-request context; never create a staff principal or accept body tokens.
    """
    request = getattr(frappe.local, "request", None)
    method = _VISITOR_PATHS.get(getattr(request, "path", None))
    if not method:
        return
    _no_store()
    token = request.environ.pop("HTTP_AUTHORIZATION", "")
    # Recorder runs earlier in Frappe's before_request list. Exclude only this
    # request, including any header/form copy already captured. No global flag.
    recorder = getattr(frappe.local, "_recorder", None)
    if recorder is not None:
        recorder.headers, recorder.form_dict = {}, {}
        recorder.calls, recorder.events = [], []
        recorder.cleanup()
        recorder._recording = False
    _require(request.method == "POST" and not request.args)
    if frappe.session.user != "Guest":
        _deny()
    digest = None
    if method in _AUTHENTICATED_METHODS:
        if not isinstance(token, str) or not re.fullmatch(r"Bearer [A-Za-z0-9_-]{43}", token):
            _deny()
        digest = _hash(token[7:])
    elif token:
        _deny()
    frappe.local.webchat_authority = _RequestAuthority(request, digest)


def _request_authority():
    context = getattr(frappe.local, "webchat_authority", None)
    request = getattr(frappe.local, "request", None)
    if type(context) is not _RequestAuthority or context.request is not request or context.path != request.path:
        _deny()
    return context


def _post(arguments, optional=()):
    _no_store()
    _request_authority()
    request = getattr(frappe, "request", None)
    _require(request and request.method == "POST" and request.mimetype == "application/json")
    _require(not request.args)  # Capabilities/routing values never accepted in URLs.
    _require(request.content_length is None or 0 < request.content_length <= MAX_BODY_BYTES)
    raw = request.get_data()
    _require(isinstance(raw, bytes) and 0 < len(raw) <= MAX_BODY_BYTES)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _require(key not in result)
            result[key] = value
        return result
    def nonfinite(_):
        raise ValueError()
    try:
        body = json.loads(raw, object_pairs_hook=unique, parse_constant=nonfinite)
        _require(isinstance(body, dict) and set(arguments) - set(optional) <= set(body) <= set(arguments))
        _require(all(body.get(key) == value for key, value in arguments.items()))
    except (ValueError, TypeError, RecursionError, UnicodeError):
        raise frappe.ValidationError("Invalid Webchat request body.") from None
    _scrub_diagnostics()


def _rate(kind, identity, limit, seconds=60):
    # Atomic first-increment expiry. The general decorator uses a caller form key
    # and forwarded request_ip; neither is appropriate for this bearer protocol.
    try:
        key = frappe.cache.make_key("webchat:" + _key(kind, identity))
        count = frappe.cache.eval(_RATE_SCRIPT, 1, key, seconds)
        if type(count) is not int or count < 1:
            raise ValueError()
    except Exception:
        raise frappe.RateLimitExceededError("Webchat is temporarily unavailable.") from None
    if count > limit:
        raise frappe.RateLimitExceededError("Webchat request limit reached. Try again later.")


def _public_rate(channel_id, action):
    remote = getattr(frappe.request, "remote_addr", None)
    _require(isinstance(remote, str) and 0 < len(remote) <= 80)
    # Shared BFF egress/channel budgets, not a claim of per-visitor IP identity.
    _rate("ip", remote, 6000)
    _rate("channel", channel_id, 600)
    if action == "bootstrap":
        _rate("bootstrap_ip", remote, 3000, 3600)
        _rate("bootstrap_channel", channel_id, 300, 3600)


def _mark(doc):
    doc.flags.crm_webchat_service = _WRITE_TOKEN
    return doc


def _guard(doc):
    if doc.flags.get("crm_webchat_service") is not _WRITE_TOKEN:
        raise frappe.PermissionError("Use the Webchat service.")


def validate_channel(doc):
    _guard(doc)
    _require(_hex(doc.name) == _hex(doc.account_id))
    _short(doc.label); _short(doc.profile)
    _require(doc.public_origin == _origin(doc.public_origin) and doc.binding_key == _key(doc.profile, doc.public_origin))
    _require(doc.enabled in (0, 1))
    if not doc.is_new():
        old = frappe.db.get_value(CHANNEL, doc.name, ["account_id", "profile", "public_origin", "binding_key"], as_dict=True, for_update=True)
        _require(old and all(doc.get(field) == old.get(field) for field in old), "Webchat channel binding is immutable.")


def validate_session(doc):
    _guard(doc)
    _hex(doc.name); _hex(doc.channel); _hex(doc.peer_id); _hex(doc.capability_hash)
    _require(doc.name != doc.peer_id and doc.revoked in (0, 1))
    if doc.is_new():
        # Frappe assigns the authoritative creation timestamp before validate.
        # Expiry is server-derived, never a caller-provided extension.
        doc.expires_at = _expiry(doc.creation)
    _require(get_datetime(doc.expires_at) == _expiry(doc.creation))
    if not doc.is_new():
        old = frappe.db.get_value(SESSION, doc.name,
            ["channel", "peer_id", "capability_hash", "expires_at", "creation", "revoked"], as_dict=True, for_update=True)
        _require(old and all(str(doc.get(field)) == str(old.get(field)) for field in old if field != "revoked")
            and old.revoked == 0 and doc.revoked == 1, "Webchat sessions may only be revoked.")


def validate_message(doc):
    _guard(doc)
    _require(doc.is_new(), "Webchat transcript is immutable.")
    for field in ("name", "message_key", "channel", "session", "peer_id", "conversation"):
        _hex(doc.get(field))
    _require(doc.direction in {"Incoming", "Outgoing"})
    _request_id(doc.request_id)
    _require(doc.text_hash == _hash(_text(doc.text)) and type(doc.control_generation) is int and doc.control_generation >= 1)
    _require(doc.name == doc.message_key == _key(1, doc.channel, doc.peer_id, doc.direction, doc.request_id))
    session = current_session(doc.channel, doc.peer_id)
    _require(doc.session == session.name)
    from crm.api.conversations import conversation_key
    _require(doc.conversation == conversation_key("Webchat", doc.channel, doc.peer_id))


def _manager():
    user = frappe.session.user
    if not user or user == "Guest" or frappe.db.get_value("User", user, "enabled", for_update=True) != 1:
        raise frappe.PermissionError("System Manager access is required.")
    roles = frappe.db.get_values("Has Role", {"parent": user, "parenttype": "User", "parentfield": "roles", "role": "System Manager"}, "name", for_update=True)
    if user != "Administrator" and not roles:
        raise frappe.PermissionError("System Manager access is required.")


def _channel(channel_id, active=True):
    _hex(channel_id)
    row = frappe.db.get_value(CHANNEL, channel_id,
        ["name", "account_id", "enabled", "label", "profile", "public_origin", "binding_key", "modified"], as_dict=True, for_update=True)
    if not row or row.account_id != channel_id or (active and row.enabled != 1):
        _deny()
    return row


def _config_projection(row):
    return {key: str(row.get(key)) if key == "modified" else row.get(key)
        for key in ("account_id", "label", "profile", "public_origin", "enabled", "modified")}


@frappe.whitelist(methods=["POST"])
def list_channels():
    """Bounded current-manager configuration projection; no visitor records."""
    _no_store(); _manager()
    rows = frappe.db.sql("""SELECT account_id,label,profile,public_origin,enabled,modified
        FROM `tabCRM Webchat Channel` ORDER BY label,name LIMIT 101""", as_dict=True)
    return {"channels": [_config_projection(row) for row in rows[:100]], "has_more": len(rows) > 100}


@frappe.whitelist(methods=["POST"])
def configure_channel(label, profile, public_origin, enabled=0, channel_id=None, expected_modified=None):
    _no_store(); _manager()
    label, profile, public_origin = _short(label), _short(profile), _origin(public_origin)
    _require((type(enabled) in {bool, int} and enabled in (0, 1)) or (type(enabled) is str and enabled in {"0", "1"}))
    creating = channel_id is None
    if creating:
        _require(expected_modified is None)
        _require(not frappe.db.get_value(CHANNEL, {"binding_key": _key(profile, public_origin)}, "name"),
            "This binding already exists. Use its saved channel and revision.")
        channel_id = secrets.token_hex(32)
        doc = frappe.get_doc({"doctype": CHANNEL, "name": channel_id, "account_id": channel_id,
            "binding_key": _key(profile, public_origin), "profile": profile, "public_origin": public_origin})
    else:
        _channel(channel_id, active=False)
        doc = frappe.get_doc(CHANNEL, channel_id, for_update=True)
        _require(isinstance(expected_modified, str) and str(doc.modified) == expected_modified,
            "Webchat channel changed. Reload before saving.")
        _require(doc.profile == profile and doc.public_origin == public_origin, "Webchat channel binding is immutable.")
    doc.label, doc.enabled = label, int(enabled)
    if creating:
        _mark(doc).insert(ignore_permissions=True, set_name=doc.name)
    else:
        _mark(doc).save(ignore_permissions=True)
    return _config_projection(doc)


@frappe.whitelist(allow_guest=True, xss_safe=True, methods=["POST"])
@_guest
def get_channel(profile, public_origin):
    _post({"profile": profile, "public_origin": public_origin})
    profile, public_origin = _short(profile), _origin(public_origin)
    _public_rate(_key(profile, public_origin), "availability")
    name = frappe.db.get_value(CHANNEL, {"binding_key": _key(profile, public_origin)}, "name")
    if not name:
        return {"available": False}
    row = _channel(name, active=False)
    if row.enabled != 1 or row.profile != profile or row.public_origin != public_origin:
        return {"available": False}
    return {"available": True, "channel_id": row.name, "label": row.label}


@frappe.whitelist(allow_guest=True, xss_safe=True, methods=["POST"])
@_guest
def bootstrap(channel_id):
    _post({"channel_id": channel_id}); _hex(channel_id); _public_rate(channel_id, "bootstrap")
    _channel(channel_id)
    capability, peer, name = secrets.token_urlsafe(32), secrets.token_hex(32), secrets.token_hex(32)
    created = now_datetime()
    doc = _mark(frappe.get_doc({"doctype": SESSION, "name": name, "owner": "Guest", "creation": created,
        "channel": channel_id, "peer_id": peer, "capability_hash": _hash(capability),
        "expires_at": created + timedelta(hours=24), "revoked": 0})).insert(ignore_permissions=True, set_name=name)
    return {"capability": capability, "expires_at": _public_time(doc.expires_at)}


def current_session(channel_id, peer_id, *, allow_revoked=False):
    """Internal current eligibility for core dispatch; never a visitor endpoint."""
    _channel(channel_id); _hex(peer_id)
    name = frappe.db.get_value(SESSION, {"channel": channel_id, "peer_id": peer_id}, "name", for_update=True)
    if not name:
        _deny()
    doc = frappe.get_doc(SESSION, name, for_update=True)
    if doc.channel != channel_id or doc.peer_id != peer_id or (doc.revoked and not allow_revoked) or get_datetime(doc.expires_at) <= now_datetime():
        _deny()
    return doc


@contextmanager
def _visitor(channel_id, *, allow_revoked=False):
    _hex(channel_id)
    digest = _request_authority().digest
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        _deny()
    # Nonlocking routing hint only. Acquire the core fence before any account or
    # session lock; outbound dispatch uses the same lock order.
    hint = frappe.db.get_value(SESSION, {"channel": channel_id, "capability_hash": digest}, ["name", "peer_id"], as_dict=True)
    if not hint:
        _deny()
    from crm.api import conversations as control
    name = control.conversation_key("Webchat", channel_id, hint.peer_id)
    with control.conversation_fence(name):
        doc = current_session(channel_id, hint.peer_id, allow_revoked=allow_revoked)
        if doc.name != hint.name or not hmac.compare_digest(doc.capability_hash, digest):
            _deny()
        _rate("session", doc.name, 90)
        yield doc, name


def _message_projection(row):
    return {"id": row.name, "text": row.text, "direction": row.direction, "created_at": _public_time(row.creation)}


def _history(session, conversation, cursor=None):
    values = [session.channel, session.name, session.peer_id]
    boundary = ""
    if cursor is not None:
        _hex(cursor)
        anchor = frappe.db.get_value(MESSAGE, cursor, ["channel", "session", "peer_id", "creation"], as_dict=True, for_update=True)
        _require(anchor and (anchor.channel, anchor.session, anchor.peer_id) == tuple(values), "Invalid Webchat history cursor.")
        boundary = " AND (creation < %s OR (creation=%s AND name < %s))"
        values.extend([anchor.creation, anchor.creation, cursor])
    rows = frappe.db.sql(f"""SELECT name,text,direction,creation FROM `tabCRM Webchat Message`
        WHERE channel=%s AND session=%s AND peer_id=%s {boundary}
        ORDER BY creation DESC,name DESC LIMIT 51 FOR UPDATE""", tuple(values), as_dict=True)
    selected = rows[:PAGE_SIZE]
    state = frappe.db.get_value("CRM Conversation", conversation, "control_state", for_update=True)
    return {"messages": [_message_projection(row) for row in reversed(selected)],
        "next_cursor": selected[-1].name if len(rows) > PAGE_SIZE else None,
        "control_state": state if state in {"Human", "Bot", "Paused", "Closed"} else None}


@frappe.whitelist(allow_guest=True, xss_safe=True, methods=["POST"])
@_guest
def history(channel_id, cursor=None):
    _post({"channel_id": channel_id, "cursor": cursor}, optional={"cursor"})
    _hex(channel_id); _public_rate(channel_id, "history")
    with _visitor(channel_id) as (session, conversation):
        return _history(session, conversation, cursor)


def _existing(key, session, direction, request_id, text):
    row = frappe.db.get_value(MESSAGE, key,
        ["name", "channel", "session", "peer_id", "direction", "request_id", "text", "text_hash", "creation"], as_dict=True, for_update=True)
    if row:
        _require((row.channel, row.session, row.peer_id, row.direction, row.request_id, row.text, row.text_hash) ==
            (session.channel, session.name, session.peer_id, direction, request_id, text, _hash(text)),
            "This Webchat message request already has different text.")
    return row


def _insert(session, conversation, direction, request_id, text, generation):
    key = _key(1, session.channel, session.peer_id, direction, request_id)
    doc = frappe.get_doc({"doctype": MESSAGE, "name": key, "message_key": key, "channel": session.channel,
        "session": session.name, "peer_id": session.peer_id, "conversation": conversation, "direction": direction,
        "request_id": request_id, "text": text, "text_hash": _hash(text), "control_generation": generation})
    if direction == "Incoming":
        doc.owner = "Guest"
    return _mark(doc).insert(ignore_permissions=True, set_name=doc.name)


def _notify_message(conversation, actor=None):
    """ID-only after-commit hint to current authorized owner/execution actor.

    Unowned staff queues keep their bounded authorized polling fallback; there
    is no account/global room broadcast or enumeration of potential listeners.
    """
    from crm.api import conversations as control
    doc = control._load(conversation)
    for user in {doc.human_owner, actor} - {None, "", "Guest"}:
        try:
            control._authorize(doc, user)
        except frappe.PermissionError:
            continue
        frappe.publish_realtime("crm_conversation_updated", {"name": doc.name}, user=user, after_commit=True)


@frappe.whitelist(allow_guest=True, xss_safe=True, methods=["POST"])
@_guest
def send(channel_id, request_id, text):
    _post({"channel_id": channel_id, "request_id": request_id, "text": text})
    _hex(channel_id); _request_id(request_id); _text(text); _public_rate(channel_id, "send")
    with _visitor(channel_id) as (session, conversation):
        _rate("send", session.name, 30)
        key = _key(1, channel_id, session.peer_id, "Incoming", request_id)
        existing = _existing(key, session, "Incoming", request_id, text)
        if existing:
            return {**_history(session, conversation), "message": _message_projection(existing), "replayed": True}
        from crm.api import conversations as control
        doc = control.get_or_create("Webchat", channel_id, session.peer_id)
        _require(doc.control_state != "Closed", "This conversation is closed.")
        message = _insert(session, conversation, "Incoming", request_id, text, doc.generation)
        control.internal_webchat_customer_reply(conversation, message.name)
        _notify_message(conversation)
        return {**_history(session, conversation), "message": _message_projection(message), "replayed": False}


@frappe.whitelist(allow_guest=True, xss_safe=True, methods=["POST"])
@_guest
def revoke(channel_id):
    _post({"channel_id": channel_id}); _hex(channel_id); _public_rate(channel_id, "revoke")
    with _visitor(channel_id, allow_revoked=True) as (session, _):
        if not session.revoked:
            session.revoked = 1
            _mark(session).save(ignore_permissions=True)
        return {"revoked": True}


def validate_payload(payload, *, account_id, peer_id):
    """Pure finite local text payload; canonical bytes shared with native outbox."""
    try:
        _hex(account_id); _hex(peer_id)
        _require(isinstance(payload, dict) and set(payload) == {"type", "text"} and payload["type"] == "text")
        _text(payload["text"])
        return _canonical(payload).encode("utf-8")
    except Exception:
        raise ValueError("frozen_payload_invalid") from None


def deliver_local(intent, payload):
    """One local transcript effect under core authority; outer worker commits it."""
    from crm.api.outbox import require_dispatch
    require_dispatch(intent.name, intent.provider, intent.account_id, intent.peer_id, payload=payload)
    _require(intent.provider == "Webchat")
    frozen = json.loads(validate_payload(payload, account_id=intent.account_id, peer_id=intent.peer_id))
    session = current_session(intent.account_id, intent.peer_id)
    from crm.api import conversations as control
    conversation = control.conversation_key("Webchat", intent.account_id, intent.peer_id)
    _require(conversation == intent.conversation)
    key = _key(1, intent.account_id, intent.peer_id, "Outgoing", intent.name)
    if not _existing(key, session, "Outgoing", intent.name, frozen["text"]):
        _insert(session, conversation, "Outgoing", intent.name, frozen["text"], intent.conversation_generation)
        _notify_message(conversation, intent.get("actor_user"))
    return {"state": "Accepted", "provider_message_id": "webchat." + key}
