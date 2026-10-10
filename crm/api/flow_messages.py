"""A published WhatsApp Flow sent inside the customer conversation.

A person sends it from the inbox; delivery is the core outbox's manual reply
(same fence, 24h window, suppression and account checks as a text reply). This
module only freezes the interactive payload for one Published flow bound to the
conversation's own WhatsApp account.
"""

import hashlib

import frappe
from frappe import _

BODY_LIMIT = 1024
CTA_LIMIT = 30
TOKEN_PREFIX_MAX = 120
# The choices a flow lists from its send (`${data.key}` fields, e.g. free times).
DATA_LIMIT = 16384


def flow_token(prefix, conversation, request_id):
	"""Deterministic per request, so a replayed request freezes the same bytes."""
	digest = hashlib.sha256(f"{conversation}\0{request_id}".encode()).hexdigest()[:32]
	return f"{prefix}.{digest}" if prefix else digest


def _first_screen(flow):
	screens = sorted(flow.screens or [], key=lambda row: row.idx)
	if not screens:
		frappe.throw(_("This WhatsApp Flow has no screens."))
	return screens[0].screen_id


def freeze(payload, conversation):
	"""payload = {"flow": WhatsApp Flow name, "body": text, "token_prefix": str, "data": {key: [{id, title}]}}."""
	if conversation.provider != "WhatsApp":
		frappe.throw(_("Forms can be sent only in WhatsApp conversations."))
	if not isinstance(payload, dict) or set(payload) - {"flow", "body", "token_prefix", "request_id", "data"}:
		frappe.throw(_("Invalid form message."))
	name = payload.get("flow")
	if not isinstance(name, str) or not frappe.db.exists("WhatsApp Flow", name):
		frappe.throw(_("Choose a WhatsApp Flow."))
	flow = frappe.get_doc("WhatsApp Flow", name)
	if flow.status != "Published" or not flow.flow_id:
		frappe.throw(_("Publish this WhatsApp Flow on Meta before sending it."))
	if flow.whatsapp_account != conversation.account_record:
		frappe.throw(_("This WhatsApp Flow belongs to another WhatsApp number."))
	body = payload.get("body")
	if not isinstance(body, str) or not body.strip() or len(body) > BODY_LIMIT:
		frappe.throw(_("Enter a message of at most {0} characters.").format(BODY_LIMIT))
	data = payload.get("data")
	if data is not None and (
		not isinstance(data, dict) or len(frappe.as_json(data, indent=None)) > DATA_LIMIT
	):
		frappe.throw(_("Invalid form message."))
	action_payload = {"screen": _first_screen(flow)}
	if data:
		action_payload["data"] = data
	prefix = payload.get("token_prefix") or ""
	if not isinstance(prefix, str) or len(prefix) > TOKEN_PREFIX_MAX or any(c.isspace() for c in prefix):
		frappe.throw(_("Invalid form message."))
	frozen = {
		"messaging_product": "whatsapp",
		"recipient_type": "individual",
		"to": conversation.peer_id,
		"type": "interactive",
		"interactive": {
			"type": "flow",
			"body": {"text": body},
			"action": {
				"name": "flow",
				"parameters": {
					"flow_message_version": "3",
					"flow_id": str(flow.flow_id),
					"flow_cta": (flow.flow_cta or _("Open form"))[:CTA_LIMIT],
					"flow_action": "navigate",
					"flow_action_payload": action_payload,
					"flow_token": flow_token(prefix, conversation.name, payload.get("request_id") or ""),
				},
			},
		},
	}
	from frappe_whatsapp.native_outbox import validate_payload

	try:
		return validate_payload(
			frozen, account_id=conversation.account_id, peer_id=conversation.peer_id
		).decode()
	except ValueError:
		frappe.throw(_("Invalid form message."))


def is_flow_payload(payload):
	return (
		isinstance(payload, dict)
		and payload.get("type") == "interactive"
		and isinstance(payload.get("interactive"), dict)
		and payload["interactive"].get("type") == "flow"
	)


def sent_with_token(token, peer_id):
	"""The accepted outbox intent that carried `token` to this peer, or None.

	Evidence for an inbound flow reply: only a flow we sent to this number can
	name its token. Matches the peer on its last 10 digits (Meta may answer with
	the country's mobile prefix variant)."""
	if not token or not peer_id:
		return None
	tail = "".join(ch for ch in str(peer_id) if ch.isdigit())[-10:]
	if len(tail) < 7:
		return None
	like = "%" + token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
	rows = frappe.db.sql(
		"""SELECT name, conversation, actor_user, peer_id, payload FROM `tabCRM Outbound Intent`
		WHERE provider='WhatsApp' AND state IN ('Accepted','Delivered','Read')
		AND payload LIKE %s AND RIGHT(peer_id, 10)=%s
		ORDER BY creation DESC LIMIT 2""",
		(like, tail),
		as_dict=True,
	)
	for row in rows:
		try:
			parameters = frappe.parse_json(row.payload)["interactive"]["action"]["parameters"]
		except (KeyError, TypeError, ValueError):
			continue
		if parameters.get("flow_token") == token:
			return frappe._dict(
				name=row.name,
				conversation=row.conversation,
				actor_user=row.actor_user,
				flow_id=parameters.get("flow_id"),
			)
	return None
