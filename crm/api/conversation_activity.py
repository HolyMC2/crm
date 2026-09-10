"""Trusted customer replies can retire an existing bot grant; never start one."""

import hashlib
import json
import re
from datetime import datetime, timezone

import frappe
from frappe.utils import convert_utc_to_system_timezone, get_datetime, now_datetime

from crm.api import conversations as control
from crm.conversation_scope import assert_customer_peer

_CUSTOMER_TYPES = frozenset({"text", "image", "audio", "video", "document", "sticker",
                           "location", "contacts", "interactive", "button", "order", "reaction"})


class CustomerActivityError(RuntimeError):
    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


def _require(condition, reason="customer_activity_receipt_invalid"):
    if not condition:
        raise CustomerActivityError(reason)


def _ignored(reason):
    return {"state": "Ignored", "reason_code": reason, "replayed": False}


def _live_claim(row):
    try:
        return type(row.attempts) is int and row.attempts >= 1 and bool(row.lease_until) and get_datetime(row.lease_until) > now_datetime()
    except (ValueError, TypeError, AttributeError):
        return False


def _seconds(value):
    if type(value) is int:
        value = str(value)
    _require(isinstance(value, str) and re.fullmatch(r"[0-9]{1,12}", value), "customer_activity_timestamp_invalid")
    result = int(value)
    _require(0 < result <= 253402214400, "customer_activity_timestamp_invalid")
    return result


def _receipt(receipt_name, provider, account_id, peer_id, provider_timestamp):
    _require(not getattr(frappe, "request", None) and receipt_name
             and receipt_name == frappe.flags.get("meta_webhook_receipt"), "customer_activity_worker_required")
    row = frappe.db.get_value("Meta Webhook Receipt", receipt_name,
        ["name", "provider", "account_id", "app_id", "event_type", "event_id", "event_key", "payload", "payload_hash", "state", "attempts", "lease_until"],
        as_dict=True, for_update=True)
    _require(row and row.state == "Processing" and row.provider == provider == "WhatsApp" and row.account_id == account_id)
    _require(_live_claim(row), "customer_activity_claim_required")
    _require(row.event_type == "message")
    _require(isinstance(row.payload, str) and len(row.payload.encode()) <= 128 * 1024)
    _require(hashlib.sha256(row.payload.encode()).hexdigest() == row.payload_hash)
    _require(control._digest([row.provider, row.app_id, row.account_id, row.event_type, row.event_id]) == row.event_key == row.name)
    try:
        payload = json.loads(row.payload)
        change = payload["change"]
        value = change["value"]
        _require(change["field"] == "messages" and value["messaging_product"] == "whatsapp")
        _require(value["metadata"]["phone_number_id"] == account_id)
        _require(not any(key in value for key in ("statuses", "message_echoes", "history", "state_sync", "smb_app_state_sync")))
        messages = value["messages"]
        _require(isinstance(messages, list) and len(messages) == 1 and isinstance(messages[0], dict))
        message = messages[0]
        _require(message["from"] == peer_id and message["id"] == row.event_id)
        timestamp = _seconds(message.get("timestamp"))
        _require(type(provider_timestamp) is int and timestamp == provider_timestamp)
        _require(isinstance(payload["business_id"], str) and bool(payload["business_id"]))
    except (KeyError, TypeError, ValueError, UnicodeError):
        raise CustomerActivityError("customer_activity_receipt_invalid") from None
    kind = message.get("type")
    if not isinstance(kind, str) or kind not in _CUSTOMER_TYPES:
        return row, payload, None
    content = message.get(kind)
    _require(isinstance(content, list if kind == "contacts" else dict) and bool(content))
    return row, payload, timestamp


def internal_apply_customer_activity(provider, account_id, peer_id, *, receipt_name, provider_timestamp):
    """Retire only an existing Bot grant newer customer evidence supersedes.

    No age cutoff: delayed replies newer than the grant still hold it. Provider
    seconds must be strictly newer than current control.modified and nonfuture.
    Equal-second ambiguity, replay/history and earlier evidence cannot undo a
    newer control decision. Receipt and control changes share the outer worker's
    transaction; this method has no commits, rollbacks, sends or enqueue.
    """
    name = control.conversation_key(provider, account_id, peer_id)
    row, payload, timestamp = _receipt(receipt_name, provider, account_id, peer_id, provider_timestamp)
    if timestamp is None:
        return _ignored("customer_activity_type_unsupported")
    with control.conversation_fence(name):
        _require(_live_claim(row), "customer_activity_claim_required")
        try:
            assert_customer_peer(provider, peer_id)
        except frappe.PermissionError:
            return _ignored("customer_activity_unavailable")
        accounts = frappe.db.get_values("WhatsApp Account", {"phone_id": account_id},
            ["name", "phone_id", "app_id", "business_id", "status", "mode"], as_dict=True, for_update=True)
        _require(len(accounts) == 1 and accounts[0].status == "Active" and accounts[0].mode == "Live"
                 and accounts[0].app_id == row.app_id and accounts[0].business_id == payload["business_id"],
                 "customer_activity_account_unavailable")
        if not frappe.db.get_value(control.DOCTYPE, name, "name", for_update=True):
            return _ignored("customer_activity_no_conversation")
        doc = control._load(name)
        current_account = control._account(provider, account_id)
        _require(doc.provider == provider and doc.account_id == account_id and doc.peer_id == peer_id
                 and doc.account_record == current_account.name
                 and (doc.shop_key or "") == (current_account.shop or ""), "customer_activity_account_unavailable")
        key = control._event_key(name, "Provider", receipt_name, "customer_reply")
        fingerprint = control._digest([provider, account_id, peer_id, "customer_reply", timestamp, row.payload_hash])
        replay = control._replay(key, fingerprint)
        if replay:
            return replay
        sent_at = convert_utc_to_system_timezone(datetime.fromtimestamp(timestamp, timezone.utc).replace(tzinfo=None)).replace(tzinfo=None)
        before = control._snapshot(doc)
        reason = "customer_activity_control_preserved"
        if sent_at > now_datetime():
            reason = "customer_activity_future"
        elif not doc.modified or sent_at <= get_datetime(doc.modified):
            reason = "customer_activity_precedes_control"
        elif doc.control_state == "Bot":
            doc.control_state, doc.human_owner, doc.bot_enabled = "Human", None, 0
            reason = "customer_reply_held_bot"
        return control._persist_transition(doc, before, key=key, fingerprint=fingerprint,
            origin="Provider", actor=None, action="customer_reply", reason=reason, receipt=receipt_name,
            grant={"state": "Processed", "reason_code": reason, "provider_timestamp": timestamp})
