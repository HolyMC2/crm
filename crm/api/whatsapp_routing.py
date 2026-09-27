# Copyright (c) 2026, Grupo Doco and contributors
# For license information, please see license.txt
"""Actor-scoped attribution; ambiguous identities/parents remain for human review."""

import json

import frappe
from frappe.utils import add_days, get_datetime, now_datetime

from crm.integrations.api import (
	_PHONE_CANDIDATE_LIMIT as _LINK_LIMIT,
)
from crm.integrations.api import (
	_phone_deals,
	_phone_fields,
	_phone_rows,
	get_contact_by_phone_number,
)

POST_SALE_GRACE_DAYS = 14
_TERMINAL_STATUS_TYPES = {"Won", "Lost", "Junk"}


def resolve_reference_for_number(number: str):
	"""Worker lookup. No private provider authority is inferred from the actor role."""
	contact = get_contact_by_phone_number(number)
	if contact.get("lead"):
		return contact["lead"], "CRM Lead"
	if not contact.get("name"):
		return None, None
	deals = _phone_deals(contact["name"])
	statuses = _phone_rows(
		"CRM Deal Status", {row.status for row in deals if row.get("status")}, ["name", "type"]
	)
	types = {row.name: row.get("type") for row in statuses}
	opened = [
		row
		for row in deals
		if types.get(row.get("status")) and types[row.status] not in _TERMINAL_STATUS_TYPES
	]
	if opened:
		return (opened[0].name, "CRM Deal") if len(opened) == 1 else (None, None)
	grace_floor = add_days(now_datetime(), -POST_SALE_GRACE_DAYS)
	eligible = [
		row
		for row in deals
		if types.get(row.get("status")) in _TERMINAL_STATUS_TYPES
		and (
			(row.get("modified") and get_datetime(row.modified) >= grace_floor)
			or _deal_has_active_warranty(row.name)
		)
	]
	return (eligible[0].name, "CRM Deal") if len(eligible) == 1 else (None, None)


def _deal_has_active_warranty(deal_name):
	if "taller" not in frappe.get_installed_apps() or not (
		"repair_orders" in _phone_fields("CRM Deal")
		and "repair_order" in _phone_fields("CRM Deal Repair Order", parenttype="CRM Deal")
	):
		return False
	links = frappe.get_all(
		"CRM Deal Repair Order",
		filters={"parent": deal_name, "parenttype": "CRM Deal", "parentfield": "repair_orders"},
		fields=["repair_order"],
		limit_page_length=_LINK_LIMIT + 1,
	)
	if len(links) > _LINK_LIMIT:
		return False
	rows = _phone_rows("Repair Order", {row.repair_order for row in links}, ["name", "warranty_expires_on"])
	return any(
		row.get("warranty_expires_on")
		and get_datetime(row.warranty_expires_on).date() >= now_datetime().date()
		for row in rows
	)


def verified_receipt_reference(doc):
	"""Use an existing account/peer conversation only under its verified worker receipt.

	Generic Incoming text, Guest/Admin roles and client document flags grant no authority.
	The native receipt consumer has already recorded customer_reply before this hook.
	Unbound conversations stay unresolved rather than matching arbitrary site-wide phones.
	"""
	receipt_name = frappe.flags.get("meta_webhook_receipt")
	if not receipt_name or getattr(frappe, "request", None) or doc.get("type") != "Incoming":
		return None, None
	if not doc.get("whatsapp_account") or not doc.get("message_id") or not doc.get("from"):
		return None, None
	if not all(frappe.db.exists("DocType", name) for name in ("Meta Webhook Receipt", "WhatsApp Account")):
		return None, None
	from crm.api import conversation_activity
	from crm.api import conversations as control

	try:
		payload = frappe.db.get_value("Meta Webhook Receipt", receipt_name, "payload")
		if not isinstance(payload, str) or len(payload.encode()) > 128 * 1024:
			return None, None
		message = json.loads(payload)["change"]["value"]["messages"][0]
		if message.get("id") != doc.message_id or message.get("from") != doc.get("from"):
			return None, None
		account = frappe.get_doc("WhatsApp Account", doc.whatsapp_account)
		row, envelope, _ = conversation_activity._receipt(
			receipt_name, "WhatsApp", account.phone_id, doc.get("from"), int(message["timestamp"])
		)
		if not (
			account.status == "Active"
			and (account.mode or "Live") == "Live"
			and account.app_id == row.app_id
			and account.business_id == envelope["business_id"]
		):
			return None, None
		name = control.conversation_key("WhatsApp", account.phone_id, doc.get("from"))
		if not frappe.db.exists(
			control.EVENT, {"conversation": name, "source_receipt": receipt_name, "action": "customer_reply"}
		):
			return None, None
		conversation = control._load(name)
		if not (
			conversation.provider == "WhatsApp"
			and conversation.account_id == account.phone_id
			and conversation.account_record == account.name
			and conversation.peer_id == doc.get("from")
			and (conversation.shop_key or "") == (account.get("shop") or "")
			and conversation.reference_doctype in {"CRM Lead", "CRM Deal"}
			and conversation.reference_name
			and frappe.db.exists(conversation.reference_doctype, conversation.reference_name)
		):
			return None, None
		return conversation.reference_name, conversation.reference_doctype
	except (
		ValueError,
		TypeError,
		KeyError,
		IndexError,
		frappe.DoesNotExistError,
		conversation_activity.CustomerActivityError,
	):
		return None, None
