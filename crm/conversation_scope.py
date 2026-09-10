"""Keep private staff assistant identities outside customer conversation brokers.

Doco's current WhatsApp principal/history keys have no account dimension. Exact
private peer evidence therefore excludes that peer across WhatsApp accounts.
Only identity existence is read; no transcript, private settings or resolver call.
"""
import frappe


def assert_customer_peer(provider, peer_id):
    if provider != "WhatsApp":
        return
    if not isinstance(peer_id, str) or not peer_id:
        frappe.throw("Invalid customer conversation identity.", frappe.PermissionError)
    if frappe.db.exists("DocType", "Asistente Canal"):
        private = frappe.db.sql("""SELECT name FROM `tabAsistente Canal`
            WHERE channel='WhatsApp' AND (external_id=%s OR address IN (%s,%s))
            LIMIT 1 FOR UPDATE""", (peer_id, peer_id, "wa:" + peer_id))
        if private:
            _deny()
    for doctype in ("Books Assistant Chat", "Books Chat Log"):
        if frappe.db.exists("DocType", doctype) and frappe.db.get_value(
            doctype, {"chat_id": "wa:" + peer_id}, "name", for_update=True
        ):
            _deny()


def _deny():
    # The response does not reveal whether the identity is a current principal,
    # a disabled registration or historical private staff evidence.
    frappe.throw("This identity is unavailable for customer conversations.", frappe.PermissionError)
