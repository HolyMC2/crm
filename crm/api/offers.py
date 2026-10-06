"""Standalone offers; optional ERP code is imported only by explicit handoff actions."""

import frappe

from crm.offers import service


@frappe.whitelist()
def get_offers(deal: str, offset: int = 0, limit: int = 20):
	return service.get_offers(deal, offset, limit)


@frappe.whitelist()
def get_offer(name: str):
	return service.dto(service._load(name))


@frappe.whitelist(methods=["POST"])
def save_draft(
	deal: str,
	values: dict | str,
	name: str | None = None,
	modified: str | None = None,
	request_id: str | None = None,
):
	return service.save_draft(deal, values, name, modified, request_id)


@frappe.whitelist(methods=["POST"])
def issue(name: str, modified: str):
	return service.issue(name, modified)


@frappe.whitelist(methods=["POST"])
def record_decision(name: str, decision: str, channel: str, evidence: str, modified: str):
	return service.record_decision(name, decision, channel, evidence, modified)


@frappe.whitelist(methods=["POST"])
def revise(name: str, request_id: str):
	return service.revise(name, request_id)


@frappe.whitelist(methods=["POST"])
def expire(name: str, modified: str):
	return service.expire(name, modified)


@frappe.whitelist()
def preview(name: str):
	return service.preview(name)


@frappe.whitelist(methods=["POST"])
def preview_erp(name: str):
	from crm.integrations.erpnext.offers import preview_erp

	return preview_erp(name)


@frappe.whitelist(methods=["POST"])
def create_erp_quotation(name: str, review_hash: str, review_note: str = ""):
	from crm.integrations.erpnext.offers import create_erp_quotation

	return create_erp_quotation(name, review_hash, review_note)


@frappe.whitelist()
def get_share_state(name: str):
	from crm.offers import share

	return share.link_state(name)


@frappe.whitelist(methods=["POST"])
def share_link(name: str, rotate: bool = False):
	from crm.offers import share

	return share.share(name, frappe.utils.sbool(rotate))


@frappe.whitelist(methods=["POST"])
def reply_to_customer(name: str, message: str):
	from crm.offers import share

	return share.reply(name, message)


# Customer page actions: the token is the capability; see crm.offers.share.
@frappe.whitelist(allow_guest=True, methods=["POST"])
def customer_decide(token: str, decision: str, terms_hash: str, signer_name: str = "", note: str = ""):
	from crm.offers import share

	return share.decide(token, decision, terms_hash, signer_name, note)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def customer_message(token: str, message: str):
	from crm.offers import share

	return share.post_message(token, message)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def customer_viewed(token: str):
	from crm.offers import share

	return share.record_view(token)
