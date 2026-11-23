"""Explicit visitor order (or signed-in account) context on the existing conversation owner.

No person merge, message, routing/control change or financial effect. Staff
continue to read linked records through the owning app's native permissions.
"""

import json

import frappe
from frappe import get_installed_apps
from frappe.utils import now_datetime

from crm.api import automation_departments as departments
from crm.api import conversations as control
from crm.api import webchat


def share(session, conversation, order_token):
	control._assert_fence(conversation)
	webchat._require("doco" in get_installed_apps(), "Storefront support is unavailable.")
	try:
		from doco.docoutils.storefront.support_context import resolve_order
	except ImportError:
		# Companion lanes may be deployed in different orders. An absent adapter
		# is a definitive refusal before any context mutation, not a lost result.
		raise frappe.ValidationError("Storefront support is unavailable.") from None

	channel = webchat._channel(session.channel)
	record = resolve_order(order_token, channel.profile)
	return _attach(
		session,
		conversation,
		record,
		source="storefront_order_proof",
		action="storefront_order_share",
		reason="Customer shared an existing storefront order for support.",
	)


def share_account(session, conversation, account_token):
	"""The signed-in customer of this channel's shop opened the chat from their account: the
	Customer doco proves for that session becomes a context link (no identity merge, no money)."""
	control._assert_fence(conversation)
	webchat._require("doco" in get_installed_apps(), "Storefront support is unavailable.")
	try:
		from doco.docoutils.storefront_support import resolve_customer
	except ImportError:
		raise frappe.ValidationError("Storefront support is unavailable.") from None

	channel = webchat._channel(session.channel)
	record = resolve_customer(account_token, channel.profile)
	return _attach(
		session,
		conversation,
		record,
		source="storefront_account_proof",
		action="storefront_account_share",
		reason="Customer opened the chat from their storefront account.",
	)


def _attach(session, conversation, record, *, source, action, reason):
	doc = control.get_or_create("Webchat", session.channel, session.peer_id)
	webchat._require(doc.name == conversation)
	links = departments.parse_links(doc.get("context_links"))
	linked = any((row["doctype"], row["name"]) == (record["doctype"], record["name"]) for row in links)
	command = control._digest([action, session.name, record["name"]])
	key = control._event_key(doc.name, "System", "Storefront", command)
	fingerprint = control._digest([session.name, record["profile"], record["doctype"], record["name"]])
	if control._replay(key, fingerprint):
		# A later staff unlink is intentional; an old retry cannot restore it.
		webchat._require(linked, "The shared context was removed. Ask the team for help.")
		return {"shared": True, "replayed": True}
	webchat._require(doc.control_state != "Closed", "This conversation is closed.")
	if not linked:
		webchat._require(len(links) < departments.MAX_LINKS, "This conversation has too many linked records.")
		links.append(
			{
				"doctype": record["doctype"],
				"name": record["name"],
				"department": "sales",
				"added_by": "Guest",
				"added_at": str(now_datetime()),
				"source": source,
			}
		)
	before = control._snapshot(doc)
	control._write_metadata(doc, {"context_links": json.dumps(links, sort_keys=True, separators=(",", ":"))})
	control._persist_transition(
		doc,
		before,
		key=key,
		fingerprint=fingerprint,
		origin="System",
		actor=None,
		action=action,
		reason=reason,
	)
	webchat._notify_message(conversation)
	return {"shared": True, "replayed": False}
