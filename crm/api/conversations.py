"""Exact-account customer control. Private records; finite authenticated broker.

Internal helpers never commit, roll back, send, enqueue or impersonate an actor.
The outer dispatcher owns conversation_fence across Submitting commit and HTTP.
"""
from contextlib import contextmanager
import hashlib
import json
import re

import frappe
from frappe import _
from frappe.permissions import has_permission as has_document_permission

DOCTYPE = "CRM Conversation"
EVENT = "CRM Conversation Control Event"
PROVIDERS = {"WhatsApp", "Messenger", "Instagram", "Webchat"}
REFERENCES = {"CRM Inquiry", "CRM Lead", "CRM Deal"}
STATES = {"Human", "Bot", "Paused", "Closed"}
CONTROL_ACTIONS = {"request", "take", "transfer", "release", "pause", "close", "reopen"}
PROVIDER_ACTIONS = {"external_outbound", "own_outbound", "control_lost", "control_returned", "control_requested"}
MANAGERS = {"System Manager", "Sales Manager", "Marketing Manager"}
_SERVICE_TOKEN = object()
PUBLIC_FIELDS = (
    "name", "provider", "account_id", "peer_id", "account_record", "shop_key",
    "reference_doctype", "reference_name", "control_state", "human_owner", "generation",
    "bot_enabled", "provider_control", "modified",
)


def _deny():
    frappe.throw(_("Not permitted to access this conversation."), frappe.PermissionError)


def _conflict():
    frappe.throw(_("Conversation changed. Reload it before retrying."), frappe.TimestampMismatchError)


def _text(value, limit=140, required=True):
    if value is None and not required:
        return ""
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        frappe.throw(_("Invalid conversation command."))
    if any(ord(c) < 32 for c in value):
        frappe.throw(_("Invalid conversation command."))
    return value.strip()


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def conversation_key(provider, account_id, peer_id):
    if provider not in PROVIDERS:
        frappe.throw(_("Unsupported customer conversation provider."))
    pattern = r"[0-9a-f]{64}" if provider == "Webchat" else r"[0-9]{1,40}"
    for value in (account_id, peer_id):
        if not isinstance(value, str) or not re.fullmatch(pattern, value):
            frappe.throw(_("An exact provider account and peer are required."))
    return _digest([1, provider, account_id, peer_id])


def _lock_key(name):
    if not isinstance(name, str) or not re.fullmatch(r"[0-9a-f]{64}", name):
        frappe.throw(_("Invalid conversation identity."))
    return "crmconv:" + _digest([frappe.local.site, name])[:56]


@contextmanager
def conversation_fence(conversation_name, timeout=5):
    """Connection-owned MariaDB fence, reentrant and preserved across commit.

    Caller owns the transaction and must keep this context open across any
    durable dispatch-start commit and bounded provider attempt. Never acquire
    it while holding a run/intent lock that another conversation worker needs.
    """
    key = _lock_key(conversation_name)
    if isinstance(timeout, bool) or not isinstance(timeout, int) or not 0 <= timeout <= 30:
        frappe.throw(_("Invalid conversation lock timeout."))
    row = frappe.db.sql("SELECT GET_LOCK(%s, %s)", (key, timeout))
    if not row or row[0][0] != 1:
        _conflict()
    try:
        yield
    finally:
        # RELEASE_LOCK is connection-specific; cannot release another worker's lock.
        frappe.db.sql("SELECT RELEASE_LOCK(%s)", (key,))


def _assert_fence(name):
    row = frappe.db.sql("SELECT IS_USED_LOCK(%s) = CONNECTION_ID()", (_lock_key(name),))
    if not row or row[0][0] != 1:
        frappe.throw(_("Conversation dispatch requires its control fence."), frappe.PermissionError)


def _roles(user):
    if not user or user == "Guest":
        _deny()
    row = frappe.db.get_value("User", user, "enabled", for_update=True)
    if not row:
        _deny()
    return {r[0] for r in frappe.db.sql(
        "SELECT role FROM `tabHas Role` WHERE parent=%s AND parenttype='User' FOR UPDATE", (user,)
    )} | ({"System Manager"} if user == "Administrator" else set())


def _channel_roles(provider):
    if provider in {"WhatsApp", "Webchat"}:
        from crm.api.whatsapp import ALLOWED_WHATSAPP_ROLES
        return set(ALLOWED_WHATSAPP_ROLES)
    return {"System Manager", "Sales User"}


def _account(provider, account_id, active=True):
    """Current safe metadata only; never load account tokens or fallback settings."""
    apps = frappe.get_installed_apps()
    if provider == "Webchat":
        if not frappe.db.exists("DocType", "CRM Webchat Channel"):
            _deny()
        row = frappe.db.get_value("CRM Webchat Channel", account_id,
            ["name", "enabled"], as_dict=True, for_update=True)
        if not row or (active and row.enabled != 1):
            _deny()
        return frappe._dict(name=row.name, shop=None, scoped=False)
    if provider == "WhatsApp" and "frappe_whatsapp" in apps:
        doctype, identity, status, enabled = "WhatsApp Account", "phone_id", "status", "Active"
        shop = "doco_shop" if frappe.db.has_column(doctype, "doco_shop") else None
    elif provider in {"Messenger", "Instagram"} and "doco_marketing" in apps:
        doctype = "Messenger Page"
        identity = "page_id" if provider == "Messenger" else "ig_account_id"
        status, enabled, shop = "enabled", 1, "shop"
    else:
        _deny()
    fields = ["name", identity, status] + ([shop] if shop else [])
    rows = frappe.db.get_values(doctype, {identity: account_id}, fields, as_dict=True, for_update=True)
    if len(rows) != 1 or (active and rows[0].get(status) != enabled):
        _deny()
    return frappe._dict(name=rows[0].name, shop=rows[0].get(shop) if shop else None, scoped=bool(shop))


def _authorize(doc, user=None, write=False):
    from crm.conversation_scope import assert_customer_peer
    if doc.get("peer_id"):
        assert_customer_peer(doc.provider, doc.peer_id)
    user = user or frappe.session.user
    roles = _roles(user)
    if not roles.intersection(_channel_roles(doc.provider)):
        _deny()
    account = _account(doc.provider, doc.account_id, active=write)
    if doc.provider == "Webchat" and not roles.intersection({"System Manager", "Sales Manager"}):
        # Public visitors never acquire a staff role. Channel operators have an
        # explicit current assignment even on core-only/multi-store installs.
        if not frappe.db.sql("""SELECT name FROM `tabUser Permission`
            WHERE user=%s AND allow='CRM Webchat Channel' AND for_value=%s FOR UPDATE""", (user, account.name)):
            _deny()
    if doc.get("name") and (doc.account_record != account.name or (doc.shop_key or "") != (account.shop or "")):
        # Reconfiguration cannot silently move a conversation's authority.
        _deny()
    if account.scoped:
        if "doco_marketing" not in frappe.get_installed_apps():
            _deny()
        # Same manager/assignment policy as social.shops.get_allowed_shops,
        # with current locking reads instead of role/scope/snapshot caches.
        unrestricted = user == "Administrator" or bool(roles & {"System Manager", "Marketing Manager"})
        allowed = {r[0] for r in frappe.db.sql(
            "SELECT for_value FROM `tabUser Permission` WHERE user=%s AND allow='Social Shop' FOR UPDATE", (user,)
        )}
        if account.shop and not frappe.db.get_value("Social Shop", account.shop, "enabled", for_update=True):
            _deny()
        if not unrestricted and (not account.shop or account.shop not in allowed):
            _deny()
    permission = "write" if write else "read"
    if bool(doc.reference_doctype) != bool(doc.reference_name):
        _deny()
    if doc.reference_doctype:
        if doc.reference_doctype not in REFERENCES:
            _deny()
        reference = frappe.get_doc(doc.reference_doctype, doc.reference_name, for_update=True)
        if not has_document_permission(doc.reference_doctype, permission, doc=reference, user=user, print_logs=False):
            _deny()
    elif not has_document_permission("CRM Deal", "read", user=user, print_logs=False):
        _deny()
    return roles, account


def _projection(doc):
    return {field: doc.get(field) for field in PUBLIC_FIELDS}


def _mark(doc):
    doc.flags.crm_conversation_service = _SERVICE_TOKEN
    return doc


def _load(name):
    _lock_key(name)
    return frappe.get_doc(DOCTYPE, name, for_update=True)


def get_or_create(provider, account_id, peer_id, *, reference_doctype=None, reference_name=None):
    """Internal trusted-ingest entry point; no automatic bot or user authority."""
    name = conversation_key(provider, account_id, peer_id)
    from crm.conversation_scope import assert_customer_peer
    with conversation_fence(name):
        assert_customer_peer(provider, peer_id)
        existing = frappe.db.get_value(DOCTYPE, name, "name", for_update=True)
        account = _account(provider, account_id)
        if existing:
            doc = _load(name)
            if doc.account_record != account.name or (doc.shop_key or "") != (account.shop or ""):
                _deny()
            return doc
        doc = frappe.get_doc({
            "doctype": DOCTYPE, "name": name, "identity_version": 1,
            "provider": provider, "account_id": account_id, "peer_id": peer_id,
            "account_record": account.name, "shop_key": account.shop,
            "reference_doctype": reference_doctype, "reference_name": reference_name,
            "control_state": "Human", "human_owner": None, "generation": 1,
            "bot_enabled": 0, "provider_control": "Not Applicable" if provider in {"WhatsApp", "Webchat"} else "Unknown",
        })
        if reference_doctype or reference_name:
            _authorize(doc, write=True)
        return _mark(doc).insert(ignore_permissions=True)


@frappe.whitelist()
def get_conversation(name):
    doc = _load(name)
    _authorize(doc)
    return _projection(doc)


@frappe.whitelist()
def list_conversations(provider, account_id, limit=50, start=0):
    conversation_key(provider, account_id, "0" * 64 if provider == "Webchat" else "1")
    probe = frappe._dict(provider=provider, account_id=account_id, shop_key=None,
                         reference_doctype=None, reference_name=None)
    _authorize(probe)
    limit, start = min(max(int(limit), 1), 100), max(int(start), 0)
    rows = frappe.get_all(DOCTYPE, filters={"provider": provider, "account_id": account_id},
                         fields=["name"], order_by="modified desc, name desc", start=start, page_length=limit)
    result = []
    for row in rows:
        doc = _load(row.name)
        try:
            _authorize(doc)
        except frappe.PermissionError:
            continue
        result.append(_projection(doc))
    return result


def _generation(value):
    if isinstance(value, bool) or not re.fullmatch(r"[1-9][0-9]{0,17}", str(value)):
        frappe.throw(_("A current conversation generation is required."))
    return int(value)


def assert_current_generation(name, generation, *, origin="Human", actor_user=None, run_name=None):
    """P5 final check: caller already owns the same fence as control commands."""
    _assert_fence(name)
    doc = _load(name)
    if doc.generation != _generation(generation):
        _conflict()
    if origin not in {"Human", "Bot"}:
        _deny()
    actor_user = actor_user or frappe.session.user
    _authorize(doc, actor_user, write=True)
    if origin == "Human":
        if doc.control_state != "Human" or doc.human_owner != actor_user:
            _deny()
    else:
        _assert_bot_grant(doc, actor_user, run_name)
    if doc.provider_control not in {"Ours", "Not Applicable"}:
        _deny()
    return doc


def _event_key(name, origin, actor, command_id):
    return _digest([1, name, origin, actor, command_id])


def _replay(key, fingerprint):
    row = frappe.db.get_value(EVENT, key, ["input_hash", "result_json"], as_dict=True, for_update=True)
    if not row:
        return None
    if row.input_hash != fingerprint:
        frappe.throw(_("Command ID was already used for different input."))
    result = json.loads(row.result_json)
    result["replayed"] = True
    return result


def _snapshot(doc):
    return {f: doc.get(f) for f in ("control_state", "human_owner", "generation", "bot_enabled", "provider_control")}


def _persist_transition(doc, before, *, key, fingerprint, origin, actor, action, reason="", receipt=None, grant=None):
    changed = any(doc.get(f) != before[f] for f in before if f != "generation")
    doc.generation = before["generation"] + int(changed)
    if changed:
        _mark(doc).save(ignore_permissions=True)
    result = _projection(doc)
    if grant:
        result.update(grant)
    result["replayed"] = False
    event = frappe.get_doc({
        "doctype": EVENT, "name": key, "command_key": key, "conversation": doc.name,
        "input_hash": fingerprint, "origin": origin, "actor_user": actor, "action": action,
        "reason": reason, "from_generation": before["generation"], "to_generation": doc.generation,
        "previous_json": json.dumps(before), "result_json": json.dumps(result, default=str), "source_receipt": receipt,
    })
    _mark(event).insert(ignore_permissions=True)
    if action == "request" and doc.human_owner:
        # A request does not advance ownership, but its current owner must see it.
        try:
            _authorize(doc, doc.human_owner)
        except frappe.PermissionError:
            pass
        else:
            frappe.publish_realtime("crm_conversation_updated", {"name": doc.name, "generation": doc.generation},
                                    user=doc.human_owner, after_commit=True)
    if changed:
        # ID/generation only, and only the acting operator: no phone, text or note broadcast.
        if actor and actor != "Guest":
            frappe.publish_realtime("crm_conversation_updated", {"name": doc.name, "generation": doc.generation},
                                    user=actor, after_commit=True)
    return result


def internal_webchat_customer_reply(conversation_name, message_key):
    """An immutable local customer message can retire its current bot grant.

    The visitor service calls this after insertion in the same transaction and
    fence. It is not whitelisted and never accepts customer-supplied authority,
    a Meta receipt marker, or a staff principal.
    """
    from crm.api.webchat import current_session
    with conversation_fence(conversation_name):
        doc = _load(conversation_name)
        if doc.provider != "Webchat":
            _deny()
        message = frappe.db.get_value("CRM Webchat Message", message_key,
            ["name", "channel", "session", "conversation", "direction", "text_hash", "control_generation"],
            as_dict=True, for_update=True)
        session = current_session(doc.account_id, doc.peer_id)
        if not message or message.direction != "Incoming" or message.conversation != doc.name \
                or message.channel != doc.account_id or message.session != session.name:
            _deny()
        key = _event_key(doc.name, "System", "Webchat", message.name)
        fingerprint = _digest([doc.provider, doc.account_id, doc.peer_id,
                               message.name, message.text_hash, message.control_generation])
        replay = _replay(key, fingerprint)
        if replay:
            return replay
        before = _snapshot(doc)
        reason = "webchat_control_preserved"
        if doc.control_state == "Bot" and message.control_generation == doc.generation:
            doc.control_state, doc.human_owner, doc.bot_enabled = "Human", None, 0
            reason = "webchat_customer_held_bot"
        return _persist_transition(doc, before, key=key, fingerprint=fingerprint,
            origin="System", actor=None, action="customer_reply", reason=reason)


def _automation_allowed(provider):
    if "doco_marketing" not in frappe.get_installed_apps():
        _deny()
    for doctype, field in (("FCRM Settings", "conversation_automation_enabled"),
                           ("Marketing Settings", "enable_automation")):
        value = frappe.db.sql("SELECT value FROM `tabSingles` WHERE doctype=%s AND field=%s FOR UPDATE", (doctype, field))
        if not value or str(value[0][0]) != "1":
            _deny()
    try:
        from crm.api.outbox import automation_ready
        ready = automation_ready(provider)
    except Exception:
        ready = False
    if ready is not True:
        _deny()


def _native_run(run_name, doc, generation, actor, *, starting=False):
    """Fixed current-row validator; callers cannot supply a capability object."""
    run_name = _text(run_name)
    try:
        from doco_marketing.services.chatflow_native import validate_native_run
    except ImportError:
        _deny()
    snapshot_hash = validate_native_run(run_name, doc.name, generation, actor, starting=starting)
    if not isinstance(snapshot_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", snapshot_hash):
        _deny()
    run_actor = frappe.db.get_value("Chatflow Run", run_name, "actor_user", for_update=True)
    if not isinstance(run_actor, str) or not run_actor:
        _deny()
    _authorize(doc, run_actor, write=True)
    return snapshot_hash, run_actor


def begin_bot(name, expected_generation, command_id, *, run_name, actor_user=None):
    """Internal explicit manager grant, only after a durable pinned run exists.

    The marketing caller binds the returned generation to its run in the SAME
    outer transaction. Missing policy, validator or P5 readiness denies the grant.
    """
    actor = actor_user or frappe.session.user
    if actor != frappe.session.user:
        _deny()
    expected_generation = _generation(expected_generation)
    command_id, run_name = _text(command_id), _text(run_name)
    fingerprint = _digest(["start_bot", expected_generation, run_name])
    key = _event_key(name, "Human", actor, command_id)
    with conversation_fence(name):
        doc = _load(name)
        _authorize(doc, actor)
        replay = _replay(key, fingerprint)
        if replay:
            return replay
        roles, _account_row = _authorize(doc, actor, write=True)
        if not roles.intersection(MANAGERS):
            _deny()
        if doc.generation != expected_generation:
            _conflict()
        if doc.control_state != "Human" or doc.human_owner:
            _deny()
        if doc.provider_control not in {"Ours", "Not Applicable"}:
            _deny()
        _automation_allowed(doc.provider)
        snapshot_hash, run_actor = _native_run(run_name, doc, expected_generation, actor, starting=True)
        before = _snapshot(doc)
        doc.control_state, doc.human_owner, doc.bot_enabled = "Bot", None, 1
        return _persist_transition(doc, before, key=key, fingerprint=fingerprint,
            origin="Human", actor=actor, action="start_bot", grant={
                "bot_run": run_name, "bot_snapshot_hash": snapshot_hash,
                "bot_actor_user": run_actor, "bot_requested_by": actor,
            })


def _assert_bot_grant(doc, actor, run_name):
    if doc.control_state != "Bot" or not doc.bot_enabled or not run_name:
        _deny()
    _automation_allowed(doc.provider)
    events = frappe.db.get_values(EVENT, {"conversation": doc.name, "to_generation": doc.generation,
        "action": "start_bot", "origin": "Human"}, ["result_json", "actor_user"], as_dict=True, for_update=True)
    if len(events) != 1:
        _deny()
    grant = json.loads(events[0].result_json)
    if grant.get("bot_run") != run_name or grant.get("bot_actor_user") != actor:
        _deny()
    # Revoking the initiating manager also revokes its outstanding bot grant.
    roles, _account_row = _authorize(doc, events[0].actor_user, write=True)
    if not roles.intersection(MANAGERS) or grant.get("bot_requested_by") != events[0].actor_user:
        _deny()
    snapshot_hash, run_actor = _native_run(run_name, doc, doc.generation, actor)
    if grant.get("bot_snapshot_hash") != snapshot_hash or run_actor != actor:
        _deny()


def handoff_bot(name, generation, run_name, command_id, *, actor_user, step_id, owner=None):
    """Execute only a currently due pinned handoff; no assignment/send side effects."""
    actor_user, step_id = _text(actor_user), _text(step_id)
    command_id, run_name = _text(command_id), _text(run_name)
    owner = _text(owner, required=False) or None
    generation = _generation(generation)
    key = _event_key(name, "System", actor_user, command_id)
    fingerprint = _digest(["bot_handoff", generation, run_name, step_id, owner])
    with conversation_fence(name):
        doc = _load(name)
        _authorize(doc, actor_user)
        replay = _replay(key, fingerprint)
        if replay:
            return replay
        doc = assert_current_generation(name, generation, origin="Bot", actor_user=actor_user, run_name=run_name)
        try:
            from doco_marketing.services.chatflow_native import validate_native_handoff
        except ImportError:
            _deny()
        if validate_native_handoff(run_name, name, generation, actor_user, step_id, owner) is not True:
            _deny()
        if owner:
            _authorize(doc, owner, write=True)
        before = _snapshot(doc)
        doc.control_state, doc.human_owner, doc.bot_enabled = "Human", owner, 0
        return _persist_transition(doc, before, key=key, fingerprint=fingerprint,
            origin="System", actor=actor_user, action="bot_handoff", reason="pinned_run_handoff")


@frappe.whitelist(methods=["POST"])
def apply_control(name, action, expected_generation, command_id, owner=None, reason=None):
    if action not in CONTROL_ACTIONS:
        frappe.throw(_("Unsupported conversation control action."))
    command_id, reason = _text(command_id), _text(reason, 500, required=False)
    owner = _text(owner, required=False) or None
    if action != "transfer" and owner:
        frappe.throw(_("Only transfer accepts a target owner."))
    expected_generation = _generation(expected_generation)
    actor = frappe.session.user
    fingerprint = _digest([action, expected_generation, owner, reason])
    key = _event_key(name, "Human", actor, command_id)
    with conversation_fence(name):
        doc = _load(name)
        _authorize(doc, actor)
        replay = _replay(key, fingerprint)
        if replay:
            return replay
        roles, account = _authorize(doc, actor, write=True)
        if doc.generation != expected_generation:
            _conflict()
        before = _snapshot(doc)
        manager = bool(roles & MANAGERS)
        current_owner = doc.human_owner
        if action == "request":
            if doc.control_state != "Human" or not current_owner or current_owner == actor:
                _conflict()
        elif action == "take":
            if doc.control_state == "Closed":
                _conflict()
            if current_owner and current_owner != actor and not (manager and reason):
                _deny()
            doc.control_state, doc.human_owner, doc.bot_enabled = "Human", actor, 0
        elif action == "transfer":
            if doc.control_state != "Human" or (current_owner != actor and not (manager and reason)):
                _deny()
            if not owner:
                frappe.throw(_("An eligible target owner is required."))
            _authorize(doc, owner, write=True)
            doc.human_owner, doc.bot_enabled = owner, 0
        elif action == "release":
            if current_owner != actor and not (manager and reason):
                _deny()
            if doc.control_state != "Human":
                _conflict()
            doc.human_owner, doc.bot_enabled = None, 0
        elif action in {"pause", "close"}:
            if current_owner != actor and not (manager and reason) and not (action == "pause" and doc.control_state == "Bot"):
                _deny()
            doc.control_state = "Paused" if action == "pause" else "Closed"
            doc.bot_enabled = 0
        elif action == "reopen":
            if doc.control_state != "Closed" or (current_owner != actor and not (manager and reason)):
                _deny()
            doc.control_state, doc.human_owner, doc.bot_enabled = "Human", None, 0
        return _persist_transition(doc, before, key=key, fingerprint=fingerprint,
                                   origin="Human", actor=actor, action=action, reason=reason)


def internal_apply_provider_event(provider, account_id, peer_id, action, *, receipt_name=None, historical=False):
    """Trusted receipt observation, including retry after a rolled-back attempt.

    meta_webhook_replay also means attempt > 1, so it cannot suppress holds.
    Only explicit history/source kind does. No observation ever enables a bot.
    """
    if action not in PROVIDER_ACTIONS:
        frappe.throw(_("Unsupported provider control observation."))
    receipt_name = receipt_name or frappe.flags.get("meta_webhook_receipt")
    if not receipt_name or receipt_name != frappe.flags.get("meta_webhook_receipt"):
        _deny()
    receipt = frappe.db.get_value("Meta Webhook Receipt", receipt_name,
                                 ["provider", "account_id", "event_type"], as_dict=True, for_update=True)
    if not receipt or receipt.provider != provider or receipt.account_id != account_id:
        _deny()
    historical = historical or receipt.event_type in {"history", "smb_app_state_sync"} or receipt.event_type.startswith("history:")
    name = conversation_key(provider, account_id, peer_id)
    key = _event_key(name, "Provider", receipt_name, action)
    fingerprint = _digest([provider, account_id, peer_id, action])
    with conversation_fence(name):
        doc = get_or_create(provider, account_id, peer_id)
        replay = _replay(key, fingerprint)
        if replay:
            return replay
        before = _snapshot(doc)
        if not historical:
            if action == "external_outbound":
                # Closed remains closed; external evidence cannot reopen it.
                if doc.control_state != "Closed":
                    doc.control_state = "Human"
                doc.human_owner, doc.bot_enabled = None, 0
            elif action == "control_lost":
                doc.provider_control = "Other"
                if doc.control_state != "Closed":
                    doc.control_state = "Paused"
                doc.bot_enabled = 0
            elif action == "control_returned":
                doc.provider_control = "Ours"
        return _persist_transition(doc, before, key=key, fingerprint=fingerprint,
                                   origin="Provider", actor=None, action=action,
                                   reason="historical_evidence_only" if historical else "provider_observation",
                                   receipt=receipt_name)
