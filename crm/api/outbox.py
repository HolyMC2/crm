"""Durable customer replies, with a commit-before-HTTP uncertainty boundary.

The conversation fence spans every commit and the bounded provider attempt.
Only this worker can lend the exact frozen payload a submission capability.
Unknown is evidence of an uncertain effect, never a retryable failure.
"""
from contextvars import ContextVar
from datetime import timedelta
from functools import wraps
import hashlib
import json
import re
import secrets

import frappe
from frappe.utils import get_datetime, now_datetime

from crm.api import conversations as control

DOCTYPE = "CRM Outbound Intent"
_SERVICE_TOKEN = object()
_dispatch = ContextVar("crm_outbox_dispatch", default=None)
MAX_ATTEMPTS = 3
LEASE_SECONDS = 120
IMMUTABLE = ("action_key", "conversation", "conversation_generation", "provider", "account_id", "peer_id",
             "actor_user", "origin", "purpose", "source_doctype", "source_name", "source_action", "run_name", "payload")
PUBLIC = ("name", "conversation", "conversation_generation", "provider", "actor_user", "origin", "purpose",
          "state", "attempts", "reason_code", "creation", "modified", "submitted_at", "accepted_at",
          "delivered_at", "read_at", "provider_message_id", "next_attempt_at")
TRANSITIONS = {
    "Queued": {"Claimed", "Cancelled", "Blocked"},
    "Claimed": {"Claimed", "Submitting", "Blocked", "Cancelled", "Failed"},
    "Submitting": {"Accepted", "Failed", "Blocked", "Unknown"},
    "Accepted": {"Delivered", "Read", "Failed"},
    "Delivered": {"Read"}, "Read": set(),
    "Deferred": {"Queued", "Claimed", "Cancelled", "Blocked"},
    "Blocked": {"Queued", "Cancelled"}, "Failed": {"Queued", "Cancelled", "Delivered", "Read"},
    "Cancelled": set(), "Unknown": set(),
}


def automation_ready(provider):
    # Deliberately code-gated until every legacy producer uses durable intents.
    return False


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _hash(value):
    return hashlib.sha256(_canonical(value).encode()).hexdigest()


def _deny():
    frappe.throw("Not permitted to dispatch this reply.", frappe.PermissionError)


def _name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        frappe.throw("Invalid outbound intent identity.")
    return value


def _load(name):
    return frappe.get_doc(DOCTYPE, _name(name), for_update=True)


def _mark(doc):
    doc.flags.crm_outbox_service = _SERVICE_TOKEN
    return doc


def _fingerprint(doc):
    return _hash([doc.get(field) or None for field in IMMUTABLE])


def validate_intent(doc):
    if doc.name != _name(doc.action_key) or doc.payload_hash != _fingerprint(doc):
        frappe.throw("Outbound intent identity and content are immutable.")
    if doc.state not in TRANSITIONS or type(doc.attempts) is not int or not 0 <= doc.attempts <= MAX_ATTEMPTS:
        frappe.throw("Invalid outbound intent state.")
    log = json.loads(doc.state_log or "[]")
    if not isinstance(log, list) or not 1 <= len(log) <= 40:
        frappe.throw("Invalid outbound state history.")
    if log[-1].get("state") != doc.state or any(set(entry) != {"state", "at", "reason"} for entry in log):
        frappe.throw("Invalid outbound state history.")
    doc.provider_message_key = _hash([doc.provider, doc.account_id, doc.provider_message_id]) if doc.provider_message_id else None
    if not doc.is_new():
        old = frappe.db.get_value(DOCTYPE, doc.name,
            [*IMMUTABLE, "payload_hash", "expires_at", "state", "state_log", "attempts", "provider_message_id"],
            as_dict=True, for_update=True)
        if any((doc.get(f) or None) != (old.get(f) or None) for f in (*IMMUTABLE, "payload_hash", "expires_at")):
            frappe.throw("Outbound intent identity and content are immutable.")
        previous = json.loads(old.state_log)
        if len(log) != len(previous) + 1 or log[:-1] != previous or doc.state not in TRANSITIONS[old.state]:
            frappe.throw("Invalid outbound state transition.")
        if doc.attempts != old.attempts + int(doc.state == "Claimed"):
            frappe.throw("Invalid outbound claim attempt.")
        if old.provider_message_id and doc.provider_message_id != old.provider_message_id:
            frappe.throw("Provider message identity is immutable.")


def _projection(doc):
    result = {field: doc.get(field) for field in PUBLIC}
    payload = json.loads(doc.payload)
    result["text"] = (payload.get("text") or {}).get("body", "") if doc.provider == "WhatsApp" else payload.get("text", "") if doc.provider == "Webchat" else ""
    result["can_retry"] = doc.state in {"Blocked", "Failed", "Deferred"} and not doc.provider_message_id and doc.attempts < MAX_ATTEMPTS
    result["can_cancel"] = doc.state in {"Queued", "Claimed", "Blocked", "Deferred", "Failed"} and not doc.provider_message_id
    return result


def _notify(doc):
    frappe.publish_realtime("crm_outbox_updated", {"name": doc.name, "conversation": doc.conversation},
                            user=doc.actor_user, after_commit=True)


def _transition(doc, state, reason="", **values):
    if reason and not re.fullmatch(r"[a-z0-9_]{1,100}", reason):
        frappe.throw("Invalid outbound reason.")
    for key, value in values.items():
        doc.set(key, value)
    doc.state, doc.reason_code = state, reason
    log = json.loads(doc.state_log)
    log.append({"state": state, "at": str(now_datetime()), "reason": reason})
    doc.state_log = _canonical(log)
    _mark(doc).save(ignore_permissions=True)
    _notify(doc)
    return doc


def _payload(payload, conversation):
    if isinstance(payload, str):
        if len(payload.encode()) > 20000:
            frappe.throw("Reply is too large.")
        payload = frappe.parse_json(payload)
    if not isinstance(payload, dict) or set(payload) != {"type", "text"} or payload.get("type") != "text":
        frappe.throw("This reply action requires plain text.")
    body = payload["text"]
    max_length = 2000 if conversation.provider == "Webchat" else 4096
    if not isinstance(body, str) or not body.strip() or len(body) > max_length:
        frappe.throw("Enter a reply of at most {0} characters.".format(max_length))
    if conversation.provider == "Webchat":
        from crm.api.webchat import validate_payload
        try:
            return validate_payload(payload, account_id=conversation.account_id, peer_id=conversation.peer_id).decode()
        except ValueError:
            frappe.throw("Invalid reply content.")
    if conversation.provider != "WhatsApp":
        frappe.throw("Native sending is not ready for this channel.")
    frozen = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": conversation.peer_id,
              "type": "text", "text": {"body": body, "preview_url": False}}
    from frappe_whatsapp.native_outbox import validate_payload
    try:
        return validate_payload(frozen, account_id=conversation.account_id, peer_id=conversation.peer_id).decode()
    except ValueError:
        frappe.throw("Invalid reply content.")


def _enqueue(names):
    for name in names:
        try:
            frappe.enqueue("crm.api.outbox.dispatch_intent", intent_name=name, queue="short", timeout=90,
                           job_id="crm-outbox-" + name, deduplicate=True)
        except Exception:
            # The committed row is the queue. The periodic sweep recovers Redis failures.
            pass


def _after_commit(name):
    frappe.db.after_commit.add(lambda: _enqueue((name,)))


class ReplyRequestPending(frappe.ValidationError):
    """The whole request must end before its frozen identity is checked again."""
    http_status_code = 409


def _pending_on_queue_contention(function):
    @wraps(function)
    def protected(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except frappe.QueryDeadlockError:
            # Never discard another operation's writes inside a request. The
            # HTTP/caller boundary rolls back; retry keeps the same UUID/body.
            raise ReplyRequestPending("Request could not be confirmed. Check the same request again.") from None
    return protected


@frappe.whitelist(methods=["POST"])
@_pending_on_queue_contention
def queue_message(conversation, expected_generation, request_id, payload):
    actor = frappe.session.user
    request_id = control._text(request_id, 140)
    generation = control._generation(expected_generation)
    name = _hash([1, conversation, actor, "manual_reply", request_id])
    with control.conversation_fence(conversation):
        current = control._load(conversation)
        control._authorize(current)
        frozen = _payload(payload, current)
        if frappe.db.get_value(DOCTYPE, name, "name", for_update=True):
            existing = _load(name)
            if existing.payload != frozen or existing.conversation_generation != generation:
                frappe.throw("Reply request ID was already used for different content.")
            return _projection(existing)
        control.assert_current_generation(conversation, generation, actor_user=actor)
        from crm.api.outbox_policy import account_revision, webchat_revision
        source = "CRM Webchat Channel" if current.provider == "Webchat" else "WhatsApp Account"
        fields = ["name", "profile", "public_origin"] if current.provider == "Webchat" else ["name", "app_id", "business_id"]
        account = frappe.db.get_value(source, current.account_record, fields, as_dict=True, for_update=True)
        revision = webchat_revision(account) if current.provider == "Webchat" else account_revision(account)
        doc = frappe.get_doc({"doctype": DOCTYPE, "name": name, "action_key": name,
            "conversation": conversation, "conversation_generation": generation,
            "provider": current.provider, "account_id": current.account_id, "peer_id": current.peer_id,
            "actor_user": actor, "origin": "Human", "purpose": "manual", "payload": frozen,
            "source_doctype": source, "source_name": account.name, "source_action": revision,
            "state": "Queued", "attempts": 0, "expires_at": now_datetime() + timedelta(hours=24),
            "state_log": _canonical([{"state": "Queued", "at": str(now_datetime()), "reason": ""}])})
        doc.payload_hash = _fingerprint(doc)
        _mark(doc).insert(ignore_permissions=True)
        _after_commit(doc.name)
        _notify(doc)
        return _projection(doc)


@frappe.whitelist()
def get_intent(name):
    conversation = frappe.db.get_value(DOCTYPE, _name(name), "conversation")
    with control.conversation_fence(conversation):
        control._authorize(control._load(conversation))
        return _projection(_load(name))


@frappe.whitelist()
def list_intents(conversation, limit=50, before=None):
    with control.conversation_fence(conversation):
        return _list_intents(conversation, limit, before)


def _list_intents(conversation, limit, before):
    control._authorize(control._load(conversation))
    limit = min(max(int(limit), 1), 100)
    params = [conversation]
    clause = ""
    if before:
        anchor = _load(before)
        if anchor.conversation != conversation:
            _deny()
        clause = " AND (creation<%s OR (creation=%s AND name<%s))"
        params += [anchor.creation, anchor.creation, anchor.name]
    rows = frappe.db.sql("SELECT name FROM `tabCRM Outbound Intent` WHERE conversation=%s" + clause +
        " ORDER BY creation DESC,name DESC LIMIT %s", (*params, limit), as_dict=True)
    return [_projection(_load(row.name)) for row in rows]


def _worker_only():
    if getattr(frappe.local, "request", None) is not None or frappe.flags.get("meta_webhook_receipt"):
        _deny()


def _eligibility(doc):
    from crm.api.outbox_policy import manual_reply_reason
    if doc.expires_at and get_datetime(doc.expires_at) <= now_datetime():
        return "reply_expired"
    try:
        current = control.assert_current_generation(doc.conversation, doc.conversation_generation,
            origin=doc.origin, actor_user=doc.actor_user, run_name=doc.run_name)
        if (doc.provider, doc.account_id, doc.peer_id) != (current.provider, current.account_id, current.peer_id):
            return "conversation_scope_changed"
    except frappe.TimestampMismatchError:
        return "conversation_changed"
    except (frappe.PermissionError, frappe.DoesNotExistError):
        return "authority_revoked"
    return manual_reply_reason(doc)


def require_dispatch(intent_name, provider, account_id, peer_id, *, payload):
    """Gateway's first operation. A row/name/HTTP flag cannot forge this grant."""
    _worker_only()
    grant = _dispatch.get()
    body = _canonical(payload).encode()
    if not grant or grant[:4] != (intent_name, provider, account_id, peer_id) or grant[4] != body:
        _deny()
    doc = _load(intent_name)
    control._assert_fence(doc.conversation)
    if doc.state != "Submitting" or doc.claim_token != grant[5] or doc.payload.encode() != body:
        _deny()
    if _eligibility(doc):
        _deny()


def _gateway(doc):
    if doc.provider == "Webchat":
        from crm.api.webchat import deliver_local as send_frozen
    elif doc.provider == "WhatsApp":
        from frappe_whatsapp.native_outbox import send_frozen
    else:
        return {"state": "Blocked", "reason_code": "channel_not_ready"}
    payload = json.loads(doc.payload)
    token = _dispatch.set((doc.name, doc.provider, doc.account_id, doc.peer_id, doc.payload.encode(), doc.claim_token))
    try:
        return send_frozen(doc, payload)
    finally:
        _dispatch.reset(token)


def _result(doc, result):
    if not isinstance(result, dict):
        return _transition(doc, "Unknown", "provider_response_uncertain")
    state = result.get("state")
    if state == "Accepted":
        message_id = result.get("provider_message_id")
        pattern = r"webchat\.[0-9a-f]{64}" if doc.provider == "Webchat" else r"wamid\.[^\s]{1,249}"
        if isinstance(message_id, str) and re.fullmatch(pattern, message_id) and not message_id.startswith("wamid.demo-"):
            return _accept_provider_id(doc, message_id)
    elif state in {"Blocked", "Failed", "Unknown"}:
        reason = result.get("reason_code")
        if isinstance(reason, str) and re.fullmatch(r"[a-z0-9_]{1,100}", reason):
            return _transition(doc, state, reason)
    return _transition(doc, "Unknown", "provider_response_uncertain")


def _accept_provider_id(doc, message_id):
    # Include older rows that predate the additive unique-key column. The unique
    # constraint independently arbitrates concurrent acceptance across peers.
    existing = frappe.db.get_value(DOCTYPE, {"provider": doc.provider, "account_id": doc.account_id,
        "provider_message_id": message_id, "name": ["!=", doc.name]}, "name", for_update=True)
    if existing:
        return _transition(doc, "Unknown", "provider_identity_conflict")
    key = _hash([doc.provider, doc.account_id, message_id])
    savepoint = "outbox_provider_" + secrets.token_hex(8)
    frappe.db.savepoint(savepoint)
    messages = list(getattr(frappe.local, "message_log", []) or [])
    try:
        return _transition(doc, "Accepted", provider_message_id=message_id, accepted_at=now_datetime())
    except frappe.UniqueValidationError:
        frappe.db.rollback(save_point=savepoint)
        # Recover only the exact provider-identity collision, never another
        # validation error or a transaction failure after the effect boundary.
        if not frappe.db.get_value(DOCTYPE, {"provider_message_key": key, "name": ["!=", doc.name]}, "name", for_update=True):
            raise
        frappe.local.message_log = messages
        return _transition(_load(doc.name), "Unknown", "provider_identity_conflict")
    finally:
        frappe.db.release_savepoint(savepoint)


def dispatch_intent(intent_name):
    """Worker owns commits; never called inside a request/receipt transaction."""
    _worker_only()
    # Scope hint only; the row is reloaded after acquiring the conversation fence.
    conversation = frappe.db.get_value(DOCTYPE, _name(intent_name), "conversation")
    if not conversation:
        return
    with control.conversation_fence(conversation):
        # This worker owns the transaction. Discard its read-only scope hint
        # snapshot after waiting for the fence: MariaDB may otherwise raise
        # 1020 when another worker committed this intent while we waited.
        frappe.db.rollback()
        doc = _load(intent_name)
        now = now_datetime()
        if doc.provider == "Webchat":
            # A local transcript insert and Accepted can commit together. There
            # is no remote effect to create an ambiguous Submitting window.
            return _dispatch_local(doc, now)
        if doc.state == "Submitting":
            if doc.lease_until and get_datetime(doc.lease_until) <= now:
                _transition(doc, "Unknown", "submission_interrupted")
                frappe.db.commit()
            return
        if doc.state not in {"Queued", "Deferred", "Claimed"}:
            return
        if doc.state == "Claimed" and doc.lease_until and get_datetime(doc.lease_until) > now:
            return
        if doc.next_attempt_at and get_datetime(doc.next_attempt_at) > now:
            return
        if doc.attempts >= MAX_ATTEMPTS:
            _transition(doc, "Blocked", "attempts_exhausted")
            frappe.db.commit()
            return
        _transition(doc, "Claimed", attempts=doc.attempts + 1, claim_token=secrets.token_hex(32),
                    lease_until=now + timedelta(seconds=LEASE_SECONDS))
        frappe.db.commit()
        doc = _load(intent_name)
        try:
            reason = _eligibility(doc)
        except Exception:
            reason = "eligibility_unavailable"
        if reason:
            _transition(doc, "Cancelled" if reason == "conversation_changed" else "Blocked", reason)
            frappe.db.commit()
            return
        _transition(doc, "Submitting", submitted_at=now_datetime(), lease_until=now_datetime() + timedelta(seconds=LEASE_SECONDS))
        frappe.db.commit()  # irreversible-effect boundary: crash from here is Unknown
        try:
            result = _gateway(doc)
        except Exception:
            result = {"state": "Unknown", "reason_code": "provider_response_uncertain"}
        _result(_load(intent_name), result)
        frappe.db.commit()


def _dispatch_local(doc, now):
    if doc.state != "Queued":
        return
    if doc.attempts >= MAX_ATTEMPTS:
        _transition(doc, "Blocked", "attempts_exhausted")
        frappe.db.commit()
        return
    try:
        reason = _eligibility(doc)
    except Exception:
        reason = "eligibility_unavailable"
    if reason:
        _transition(doc, "Cancelled" if reason == "conversation_changed" else "Blocked", reason)
        frappe.db.commit()
        return
    _transition(doc, "Claimed", attempts=doc.attempts + 1, claim_token=secrets.token_hex(32),
                lease_until=now + timedelta(seconds=LEASE_SECONDS))
    _transition(doc, "Submitting", submitted_at=now)
    try:
        result = _gateway(doc)
        if not isinstance(result, dict) or result.get("state") != "Accepted":
            raise ValueError("local_delivery_unavailable")
        accepted = _result(_load(doc.name), result)
        if accepted.state != "Accepted":
            raise ValueError("local_delivery_unavailable")
        frappe.db.commit()
    except Exception:
        # No HTTP is possible in this branch. Discard the transcript insert and
        # claim together, then durably expose a safe failure for operator review.
        frappe.db.rollback()
        failed = _load(doc.name)
        if failed.state != "Queued":
            # A commit acknowledgement can be lost after the DB committed.
            # Its durable state decides the outcome; never erase Accepted.
            return
        _transition(failed, "Claimed", attempts=failed.attempts + 1,
                    claim_token=secrets.token_hex(32), lease_until=None)
        _transition(failed, "Blocked", "webchat_storage_unavailable")
        frappe.db.commit()


@frappe.whitelist(methods=["POST"])
def cancel_intent(name):
    conversation = frappe.db.get_value(DOCTYPE, _name(name), "conversation")
    with control.conversation_fence(conversation):
        doc = _load(name)
        current = control._load(doc.conversation)
        control._authorize(current, write=True)
        if current.human_owner != frappe.session.user:
            _deny()
        if doc.state == "Cancelled":
            return _projection(doc)
        if not _projection(doc)["can_cancel"]:
            frappe.throw("This reply can no longer be cancelled.")
        _transition(doc, "Cancelled", "operator_cancelled")
        return _projection(doc)


@frappe.whitelist(methods=["POST"])
def retry_intent(name):
    conversation = frappe.db.get_value(DOCTYPE, _name(name), "conversation")
    with control.conversation_fence(conversation):
        doc = _load(name)
        if doc.actor_user != frappe.session.user:
            _deny()
        control.assert_current_generation(conversation, doc.conversation_generation, actor_user=doc.actor_user)
        if doc.state in {"Queued", "Claimed"}:
            return _projection(doc)
        if not _projection(doc)["can_retry"] or _eligibility(doc):
            frappe.throw("This reply cannot be retried. Review its current status.")
        _transition(doc, "Queued", "operator_retry", next_attempt_at=None, lease_until=None)
        _after_commit(doc.name)
        return _projection(doc)


def recover_intents():
    _worker_only()
    if not frappe.db.exists("DocType", DOCTYPE) or frappe.conf.get("maintenance_mode"):
        return
    names = frappe.db.sql("""SELECT name FROM `tabCRM Outbound Intent`
        WHERE state='Queued' OR (state='Deferred' AND next_attempt_at<=%s)
          OR (state IN ('Claimed','Submitting') AND lease_until<=%s)
        ORDER BY modified,name LIMIT 100""", (now_datetime(), now_datetime()))
    _enqueue(tuple(row[0] for row in names))
