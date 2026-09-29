"""Customer values of a CRM Deal / Lead for WhatsApp template variables.

Registered with frappe_whatsapp's template contract (``template_vars``) so the
composer preview, the Cloud API send and the manual wa.me prefill agree. A
Deal's primary Contact wins over the names copied onto the Deal; a Lead uses
its own. Vertical apps add their own keys for the same doctypes (Taller: the
Deal's repair order).
"""

import frappe

KEYS = {
	"customer_first_name": "Customer first name",
	"customer_name": "Customer full name",
}


def _names(first, last, full):
	full = (full or " ".join(p for p in (first, last) if p)).strip()
	first = (first or "").strip() or (full.split()[0] if full else "")
	return first, full


def _resolve_deal(doc, keys):
	contact = next((c.contact for c in doc.get("contacts") or [] if c.is_primary), None) or doc.get("contact")
	row = {}
	if contact:
		row = frappe.db.get_value("Contact", contact, ["first_name", "last_name", "full_name"], as_dict=True) or {}
	first, full = _names(row.get("first_name"), row.get("last_name"), row.get("full_name"))
	if not full:
		first, full = _names(doc.get("first_name"), doc.get("last_name"), doc.get("lead_name"))
	return {"customer_first_name": first, "customer_name": full}


def _resolve_lead(doc, keys):
	first, full = _names(doc.get("first_name"), doc.get("last_name"), doc.get("lead_name"))
	return {"customer_first_name": first, "customer_name": full}


CRM_DEAL = {"keys": KEYS, "resolve": _resolve_deal}
CRM_LEAD = {"keys": KEYS, "resolve": _resolve_lead}
