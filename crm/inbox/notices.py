"""Notices the inbox sends by itself: away message, rating request, a macro's reply.

Each notice is an ordinary outbox intent with origin «Automation»: it is frozen,
queued and dispatched by the same worker as a person's reply, on every native
channel, and obeys the same account, window and provider-control rules
(crm.api.outbox_policy.automation_reason). It carries no ownership, so closing or
transferring the conversation does not cancel it. One notice per (conversation,
kind, key): queueing the same notice twice returns the first intent.
"""

import re
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import now_datetime

KINDS = {"away", "csat", "macro"}


def queue_notice(conversation, *, kind, key, text, actor="Administrator"):
	"""Queue one notice; returns (intent name, None) or (None, refusal reason code)."""
	from crm.api import conversations as control
	from crm.api import outbox
	from crm.api.outbox_policy import automation_reason

	if kind not in KINDS or not isinstance(key, str) or not key:
		frappe.throw(_("Invalid inbox notice."))
	name = outbox._hash([1, conversation, "notice", kind, key])
	with control.conversation_fence(conversation):
		if frappe.db.get_value(outbox.DOCTYPE, name, "name", for_update=True):
			return name, None
		current = control._load(conversation)
		if current.provider_control not in {"Ours", "Not Applicable"}:
			return None, "provider_control_unavailable"
		try:
			frozen = outbox._payload({"type": "text", "text": text}, current)
			source, source_name, revision = outbox.account_source(current)
		except frappe.ValidationError:
			return None, "channel_not_ready"
		doc = frappe.get_doc(
			{
				"doctype": outbox.DOCTYPE,
				"name": name,
				"action_key": name,
				"conversation": conversation,
				"conversation_generation": current.generation,
				"provider": current.provider,
				"account_id": current.account_id,
				"peer_id": current.peer_id,
				"actor_user": actor,
				"origin": "Automation",
				"purpose": "automation",
				"payload": frozen,
				"source_doctype": source,
				"source_name": source_name,
				"source_action": revision,
				"state": "Queued",
				"attempts": 0,
				"expires_at": now_datetime() + timedelta(hours=24),
				"state_log": outbox._canonical(
					[{"state": "Queued", "at": str(now_datetime()), "reason": ""}]
				),
			}
		)
		doc.payload_hash = outbox._fingerprint(doc)
		reason = automation_reason(doc)
		if reason:
			return None, reason
		outbox._mark(doc).insert(ignore_permissions=True)
		outbox._after_commit(doc.name)
		outbox._notify(doc)
		return doc.name, None


def render(text, conversation_doc, display_name=None):
	"""Fill the few placeholders a saved text may carry."""
	name = display_name or ""
	if not name:
		from crm.api import conversation_threads as threads

		name = threads._display_names(conversation_doc.provider, [conversation_doc.peer_id]).get(
			conversation_doc.peer_id, ""
		)
		if name == conversation_doc.peer_id:
			name = ""
	return re.sub(r"\{\{\s*(?:nombre|contact\.name|name)\s*\}\}", name, text or "").strip()
