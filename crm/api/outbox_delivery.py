"""Verified provider delivery evidence folds only an exact native send intent."""

import hashlib
import json
import re
import time
from datetime import datetime, timezone

import frappe
from frappe.utils import convert_utc_to_system_timezone, get_datetime, now_datetime

from crm.api import conversations as control
from crm.api import outbox
from crm.api.outbox_policy import account_revision
from crm.conversation_scope import assert_customer_peer


class DeliveryError(RuntimeError):
    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


def _require(condition, reason="native_delivery_receipt_invalid"):
    if not condition:
        raise DeliveryError(reason)


def _missing(reason="native_delivery_target_missing"):
    return {"matched": False, "reason_code": reason}


def _live_claim(row):
    try:
        return type(row.attempts) is int and row.attempts >= 1 and bool(row.lease_until) and get_datetime(row.lease_until) > now_datetime()
    except (ValueError, TypeError, AttributeError):
        return False


def _timestamp(value):
    if type(value) is int:
        value = str(value)
    _require(isinstance(value, str) and re.fullmatch(r"[0-9]{1,12}", value), "native_delivery_timestamp_invalid")
    seconds = int(value)
    # Broad plausibility floor, before WhatsApp existed; reject units mistakes,
    # uninitialized device clocks and future evidence rather than invent time.
    _require(946684800 <= seconds <= int(time.time()), "native_delivery_timestamp_invalid")
    return convert_utc_to_system_timezone(datetime.fromtimestamp(seconds, timezone.utc).replace(tzinfo=None)).replace(tzinfo=None)


def _receipt(receipt_name, expected_entry):
    _require(not getattr(frappe, "request", None) and receipt_name
             and receipt_name == frappe.flags.get("meta_webhook_receipt"), "native_delivery_worker_required")
    row = frappe.db.get_value("Meta Webhook Receipt", receipt_name,
        ["name", "provider", "account_id", "app_id", "event_type", "event_id", "event_key", "payload", "payload_hash", "state", "attempts", "lease_until"],
        as_dict=True, for_update=True)
    _require(row and row.state == "Processing" and row.provider == "WhatsApp" and row.event_type == "status")
    _require(_live_claim(row), "native_delivery_claim_required")
    _require(isinstance(row.payload, str) and len(row.payload.encode()) <= 128 * 1024)
    _require(hashlib.sha256(row.payload.encode()).hexdigest() == row.payload_hash)
    _require(control._digest([row.provider, row.app_id, row.account_id, row.event_type, row.event_id]) == row.event_key == row.name)
    try:
        payload = json.loads(row.payload)
        change, business = payload["change"], payload["business_id"]
        value = change["value"]
        _require(change["field"] == "messages" and value["messaging_product"] == "whatsapp")
        _require(value["metadata"]["phone_number_id"] == row.account_id)
        _require(not any(key in value for key in ("messages", "contacts", "message_echoes", "history", "state_sync", "smb_app_state_sync")))
        statuses = value["statuses"]
        _require(isinstance(statuses, list) and len(statuses) == 1 and isinstance(statuses[0], dict))
        entry = statuses[0]
        _require(expected_entry is None or outbox._canonical(expected_entry) == outbox._canonical(entry))
        _require(isinstance(entry["id"], str) and re.fullmatch(r"wamid\.[^\s]{1,249}", entry["id"])
                 and not entry["id"].startswith("wamid.demo-"))
        _require(entry["status"] in {"sent", "delivered", "read", "failed"})
        _require(isinstance(entry["recipient_id"], str) and re.fullmatch(r"[0-9]{1,40}", entry["recipient_id"]))
        _require(isinstance(business, str) and bool(business))
        _require(control._digest([entry["id"], entry["status"], entry.get("timestamp")]) == row.event_id)
        observed_at = _timestamp(entry.get("timestamp"))
    except (KeyError, TypeError, ValueError, UnicodeError):
        raise DeliveryError("native_delivery_receipt_invalid") from None
    return row, business, entry, observed_at


def apply_delivery_receipt(receipt_name, *, expected_entry=None, account_records=None):
    """No authorization renewal: delivery remains evidence after an owner changes.

    Caller supplied scope is checked against immutable receipt evidence. This
    method never creates an intent/identity, guesses Unknown correlation, sends,
    commits or rolls back. Missing targets remain recoverable at the receipt edge.
    """
    row, business, entry, observed_at = _receipt(receipt_name, expected_entry)
    name = control.conversation_key("WhatsApp", row.account_id, entry["recipient_id"])
    with control.conversation_fence(name):
        _require(_live_claim(row), "native_delivery_claim_required")
        accounts = frappe.db.get_values("WhatsApp Account", {"phone_id": row.account_id},
            ["name", "status", "mode", "app_id", "business_id"], as_dict=True, for_update=True)
        _require(len(accounts) == 1 and accounts[0].status == "Active" and accounts[0].mode == "Live"
                 and accounts[0].app_id == row.app_id and accounts[0].business_id == business,
                 "native_delivery_account_unavailable")
        account = accounts[0]
        _require(account_records is None or isinstance(account_records, (tuple, list)) and tuple(account_records) == (account.name,),
                 "native_delivery_account_unavailable")
        if not frappe.db.exists("DocType", outbox.DOCTYPE):
            return _missing("native_delivery_schema_unavailable")
        matches = frappe.db.get_values(outbox.DOCTYPE,
            {"provider": "WhatsApp", "account_id": row.account_id, "peer_id": entry["recipient_id"], "provider_message_id": entry["id"]},
            ["name"], as_dict=True, for_update=True, limit=2)
        if not matches:
            return _missing()
        _require(len(matches) == 1, "native_delivery_target_ambiguous")
        doc = outbox._load(matches[0].name)
        _require((doc.provider, doc.account_id, doc.peer_id, doc.provider_message_id, doc.conversation) ==
                 ("WhatsApp", row.account_id, entry["recipient_id"], entry["id"], name), "native_delivery_scope_changed")
        _require(doc.source_doctype == "WhatsApp Account" and doc.source_name == account.name
                 and doc.source_action == account_revision(account), "native_delivery_account_changed")
        current = control._load(name)
        scoped_account = control._account("WhatsApp", row.account_id)
        _require(current.account_record == scoped_account.name and (current.shop_key or "") == (scoped_account.shop or ""),
                 "native_delivery_account_changed")
        try:
            assert_customer_peer("WhatsApp", entry["recipient_id"])
        except frappe.PermissionError:
            raise DeliveryError("native_delivery_scope_unavailable") from None
        _require(doc.state in {"Accepted", "Delivered", "Read", "Failed"}, "native_delivery_state_unavailable")
        wanted = {"sent": "Accepted", "delivered": "Delivered", "read": "Read", "failed": "Failed"}[entry["status"]]
        rank = {"Accepted": 1, "Delivered": 2, "Read": 3}
        unchanged = doc.state == wanted or (doc.state in {"Delivered", "Read"} and
                    rank.get(wanted, 0) < rank[doc.state]) or (doc.state == "Failed" and wanted == "Accepted")
        reason = "native_delivery_already_recorded"
        if not unchanged:
            values = {"delivered_at": observed_at} if wanted == "Delivered" else {"read_at": observed_at} if wanted == "Read" else {}
            outbox._transition(doc, wanted, "provider_delivery_failed" if wanted == "Failed" else "", **values)
            reason = "native_delivery_applied"
        return {"matched": True, "intent_name": doc.name, "intent_state": doc.state, "reason_code": reason}
