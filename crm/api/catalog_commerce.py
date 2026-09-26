"""Optional catalog commerce inside the canonical customer conversation.

CRM owns access and durable delivery; one installed catalog adapter owns items,
catalog binding and reviewed ERP orders. Absence never breaks standalone sales.
"""

import base64
import hashlib
import json
import re

import frappe
from frappe import _

from crm.api import conversations as control

CATALOG_KINDS = frozenset({"catalog_message", "product", "product_list"})
SOURCE_PATTERN = r"cat1:([A-Za-z0-9_-]{43}):([A-Za-z0-9_-]{43}):([A-Za-z0-9_-]{43})"


def compact_digest(value):
	encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
	return base64.urlsafe_b64encode(hashlib.sha256(encoded.encode()).digest()).decode().rstrip("=")


def catalog_request_fingerprint(selection):
	"""Bound pure caller input so a replay never needs today's optional adapter."""
	if not isinstance(selection, dict) or set(selection) != {"kind", "products", "body", "header", "footer"}:
		frappe.throw(_("Invalid catalog selection."))
	if not isinstance(selection["kind"], str) or selection["kind"] not in CATALOG_KINDS:
		frappe.throw(_("Invalid catalog message type."))
	products = selection["products"]
	if (
		not isinstance(products, list)
		or len(products) > 30
		or not all(isinstance(code, str) and 0 < len(code) <= 140 for code in products)
	):
		frappe.throw(_("Invalid catalog selection."))
	for key, maximum in (("body", 1024), ("header", 60), ("footer", 60)):
		if not isinstance(selection[key], str) or len(selection[key]) > maximum:
			frappe.throw(_("Catalog message text is too long."))
	return compact_digest(selection)


def request_matches(intent, fingerprint):
	match = re.fullmatch(SOURCE_PATTERN, intent.source_action or "")
	return bool(match and match[3] == fingerprint)


def adapter():
	from crm.api.outbox import _adapter_module

	paths = frappe.get_hooks("crm_catalog_commerce") or []
	paths = [paths] if isinstance(paths, str) else paths
	if not isinstance(paths, list) or len(set(paths)) != 1:
		return None
	return _adapter_module(paths[0])


def _require_adapter():
	module = adapter()
	if module is None:
		frappe.throw(_("Catalog commerce is not configured on this site."))
	return module


def _conversation(name, *, write=False):
	doc = control._load(control._text(name, 140))
	control._authorize(doc, write=write)
	if doc.provider != "WhatsApp":
		frappe.throw(_("Catalog messages are available only in supported WhatsApp conversations."))
	return doc


@frappe.whitelist()
def get_context(conversation):
	with control.conversation_fence(conversation):
		doc = control._load(control._text(conversation, 140))
		control._authorize(doc)
		module = adapter()
		if doc.provider != "WhatsApp" or module is None:
			return {
				"available": False,
				"reason_code": "provider_not_supported"
				if doc.provider != "WhatsApp"
				else "adapter_unavailable",
				"capabilities": dict.fromkeys(CATALOG_KINDS, False),
				"carts": [],
			}
		return module.get_context(doc)


@frappe.whitelist()
def get_products(conversation, query="", offset=0):
	with control.conversation_fence(conversation):
		return _require_adapter().get_products(_conversation(conversation), query=query, offset=offset)


@frappe.whitelist(methods=["POST"])
def queue_catalog(
	conversation, expected_generation, request_id, kind, products=None, body="", header="", footer=""
):
	from crm.api import outbox

	if isinstance(products, str):
		if len(products) > 10000:
			frappe.throw(_("Product selection is too large."))
		products = frappe.parse_json(products)
	return outbox.queue_catalog_message(
		conversation,
		expected_generation,
		request_id,
		{"kind": kind, "products": products or [], "body": body, "header": header, "footer": footer},
	)


def freeze(payload, conversation):
	if conversation.provider != "WhatsApp":
		frappe.throw(_("Choose a supported WhatsApp conversation."))
	return _require_adapter().freeze(payload, conversation)


def is_catalog_payload(payload):
	if not isinstance(payload, dict):
		return False
	return payload.get("type") == "interactive" and (
		isinstance(payload.get("interactive"), dict) and payload["interactive"].get("type") in CATALOG_KINDS
	)


def delivery_source_matches(intent, account):
	"""A status proves past delivery even if current items/catalog later change.

	Only the frozen account identity is relevant here. Never re-run send
	eligibility (ownership, window, price or stock) when recording a receipt.
	"""
	from crm.api.outbox_policy import account_revision

	match = re.fullmatch(SOURCE_PATTERN, intent.source_action or "")
	if not match or match[1] != compact_digest(account_revision(account)):
		return False
	try:
		return is_catalog_payload(json.loads(intent.payload))
	except (ValueError, TypeError):
		return False


def dispatch_reason(intent, account):
	"""Also called from require_dispatch, under the existing ownership fence."""
	try:
		payload = json.loads(intent.payload)
	except (ValueError, TypeError):
		return "catalog_payload_invalid"
	if not is_catalog_payload(payload):
		return "catalog_payload_invalid"
	module = adapter()
	if module is None:
		return "catalog_adapter_unavailable"
	try:
		return module.dispatch_reason(intent, account, payload)
	except (frappe.PermissionError, frappe.ValidationError, frappe.DoesNotExistError, ValueError):
		return "catalog_configuration_changed"


@frappe.whitelist()
def get_cart(name):
	# The adapter derives/authorizes the conversation from the immutable receipt;
	# caller-supplied conversation ids cannot lend access to another intake.
	return _require_adapter().get_cart(name)


@frappe.whitelist(methods=["POST"])
def review_cart(name, customer, company, warehouse, deal=None):
	return _require_adapter().review_cart(name, customer, company, warehouse, deal=deal)


@frappe.whitelist(methods=["POST"])
def create_order(name, review_token, request_id, customer, company, warehouse, deal=None):
	return _require_adapter().create_order(
		name, review_token, request_id, customer, company, warehouse, deal=deal
	)
