"""Current eligibility for the first native manual-reply slice.

Window evidence comes from authenticated, processed provider timestamps. A
backlogged receipt or newly inserted message never restarts the customer window.
"""
import time
import hashlib
import json

import frappe


def account_revision(account):
    values = [account.name, account.app_id, account.business_id]
    return "manual_reply:" + hashlib.sha256(json.dumps(values, separators=(",", ":")).encode()).hexdigest()


def manual_reply_reason(intent):
    if intent.provider != "WhatsApp" or intent.origin != "Human" or intent.purpose != "manual":
        return "producer_not_ready"
    if frappe.conf.get("maintenance_mode"):
        return "site_maintenance"
    rows = frappe.db.get_values("WhatsApp Account", {"phone_id": intent.account_id},
        ["name", "status", "mode", "app_id", "business_id"], as_dict=True, for_update=True)
    if len(rows) != 1 or rows[0].status != "Active" or (rows[0].mode or "Live") != "Live":
        return "account_unavailable"
    if not rows[0].app_id:
        return "account_configuration_invalid"
    if intent.source_doctype != "WhatsApp Account" or intent.source_name != rows[0].name or intent.source_action != account_revision(rows[0]):
        return "account_configuration_changed"
    # Preserve the existing explicit opt-out policy without treating a missing
    # newsletter confirmation as a ban on a requested service conversation.
    if "doco_marketing" in frappe.get_installed_apps():
        if not frappe.db.exists("DocType", "Marketing Suppression"):
            return "suppression_unavailable"
        tail = intent.peer_id[-10:]
        if frappe.db.sql("""SELECT name FROM `tabMarketing Suppression`
            WHERE channel IN ('WhatsApp','All')
              AND (party=%s OR (%s=1 AND REGEXP_REPLACE(party,'[^0-9]','') LIKE %s))
            LIMIT 1 FOR UPDATE""", (intent.peer_id, int(len(intent.peer_id) >= 10), "%" + tail)):
            return "recipient_suppressed"
    if not frappe.db.exists("DocType", "Meta Webhook Receipt"):
        return "customer_window_unverified"
    now = int(time.time())
    # Discover without locks, then revalidate ONE primary-key row with a current
    # read. A JSON predicate FOR UPDATE over the whole ledger would otherwise
    # hold unrelated inbound receipts through the provider HTTP attempt.
    predicate = """provider='WhatsApp' AND account_id=%s AND app_id=%s
          AND event_type='message' AND state='Processed'
          AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].from'))=%s
          AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].timestamp')) REGEXP '^[0-9]{1,12}$'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].timestamp')) AS UNSIGNED)>%s
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].timestamp')) AS UNSIGNED)<=%s
    """
    params = (intent.account_id, rows[0].app_id, intent.peer_id, now - 86400, now)
    candidate = frappe.db.sql("SELECT name FROM `tabMeta Webhook Receipt` WHERE " + predicate + " LIMIT 1", params)
    incoming = candidate and frappe.db.sql("SELECT name FROM `tabMeta Webhook Receipt` WHERE name=%s AND " +
        predicate + " LIMIT 1 FOR UPDATE", (candidate[0][0], *params))
    return None if incoming else "customer_window_unverified"
