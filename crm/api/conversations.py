"""Exact-account customer control. Private records; finite authenticated broker.

Internal helpers never commit, roll back, send, enqueue or impersonate an actor.
The outer dispatcher owns conversation_fence across Submitting commit and HTTP.
"""

import hashlib
import json
import re
import secrets
from contextlib import contextmanager
from urllib.parse import quote

import frappe
from frappe import _
from frappe.permissions import has_permission as has_document_permission
from frappe.utils import now_datetime

from crm.api import automation_departments as departments

DOCTYPE = "CRM Conversation"
EVENT = "CRM Conversation Control Event"
PROVIDERS = {"WhatsApp", "Messenger", "Instagram", "Webchat"}
REFERENCES = {"CRM Inquiry", "CRM Lead", "CRM Deal"}
STATES = {"Human", "Bot", "Paused", "Closed"}
CONTROL_ACTIONS = {"request", "take", "transfer", "release", "pause", "close", "reopen"}
PROVIDER_ACTIONS = {
	"external_outbound",
	"own_outbound",
	"control_lost",
	"control_returned",
	"control_requested",
}
MANAGERS = {"System Manager", "Sales Manager", "Marketing Manager"}
_SERVICE_TOKEN = object()
PUBLIC_FIELDS = (
	"name",
	"provider",
	"account_id",
	"peer_id",
	"account_record",
	"shop_key",
	"reference_doctype",
	"reference_name",
	"control_state",
	"human_owner",
	"generation",
	"bot_enabled",
	"provider_control",
	"modified",
	"department",
	"automation_state",
)
# Additive metadata written without a control generation: routing and links
# change who can work the queue, never who controls the customer's replies.
METADATA_FIELDS = ("department", "routed_at", "context_links", "automation_run", "automation_state")
AUTOMATION_STATES = {None, "Running", "Waiting input", "Waiting event", "Blocked", "Handed off", "Done"}


def _deny():
	frappe.throw(_("Not permitted to access this conversation."), frappe.PermissionError)


def _conflict():
	frappe.throw(_("Conversation changed. Reload it before retrying."), frappe.TimestampMismatchError)


def _text(value, limit=140, required=True):
	if value is None and not required:
		return ""
	if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
		frappe.throw(_("Invalid conversation command."))
	if any(ord(c) < 32 for c in value):
		frappe.throw(_("Invalid conversation command."))
	return value.strip()


def _digest(value):
	return hashlib.sha256(
		json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
	).hexdigest()


def conversation_key(provider, account_id, peer_id):
	if provider not in PROVIDERS:
		frappe.throw(_("Unsupported customer conversation provider."))
	pattern = r"[0-9a-f]{64}" if provider == "Webchat" else r"[0-9]{1,40}"
	for value in (account_id, peer_id):
		if not isinstance(value, str) or not re.fullmatch(pattern, value):
			frappe.throw(_("An exact provider account and peer are required."))
	return _digest([1, provider, account_id, peer_id])


def _lock_key(name):
	if not isinstance(name, str) or not re.fullmatch(r"[0-9a-f]{64}", name):
		frappe.throw(_("Invalid conversation identity."))
	return "crmconv:" + _digest([frappe.local.site, name])[:56]


def _locked():
	"""True inside a conversation_fence, i.e. while a command mutates state:
	authorization and state reads then take row locks so the command decides
	on current committed rows. Plain list/history reads never lock. Locking
	reads in two concurrent page requests (thread list vs. history/outbox) took
	the account and conversation rows in opposite order and deadlocked, which
	the Inbox surfaced as «No se pudo cargar la conversación» (2026-09-15)."""
	return bool(getattr(frappe.local, "crm_conversation_locking", 0))


def _for_update():
	return " FOR UPDATE" if _locked() else ""


@contextmanager
def conversation_fence(conversation_name, timeout=5):
	"""Connection-owned MariaDB fence, reentrant and preserved across commit.

	Caller owns the transaction and must keep this context open across any
	durable dispatch-start commit and bounded provider attempt. Never acquire
	it while holding a run/intent lock that another conversation worker needs.
	Reads inside the fence lock their rows (see _locked).
	"""
	key = _lock_key(conversation_name)
	if isinstance(timeout, bool) or not isinstance(timeout, int) or not 0 <= timeout <= 30:
		frappe.throw(_("Invalid conversation lock timeout."))
	row = frappe.db.sql("SELECT GET_LOCK(%s, %s)", (key, timeout))
	if not row or row[0][0] != 1:
		_conflict()
	frappe.local.crm_conversation_locking = getattr(frappe.local, "crm_conversation_locking", 0) + 1
	try:
		yield
	finally:
		frappe.local.crm_conversation_locking = max(
			getattr(frappe.local, "crm_conversation_locking", 1) - 1, 0
		)
		# RELEASE_LOCK is connection-specific; cannot release another worker's lock.
		frappe.db.sql("SELECT RELEASE_LOCK(%s)", (key,))


def _assert_fence(name):
	row = frappe.db.sql("SELECT IS_USED_LOCK(%s) = CONNECTION_ID()", (_lock_key(name),))
	if not row or row[0][0] != 1:
		frappe.throw(_("Conversation dispatch requires its control fence."), frappe.PermissionError)


def _roles(user):
	if not user or user == "Guest":
		_deny()
	row = frappe.db.get_value("User", user, "enabled", for_update=_locked())
	if not row:
		_deny()
	return {
		r[0]
		for r in frappe.db.get_values(
			"Has Role", {"parent": user, "parenttype": "User"}, ["role"], for_update=_locked()
		)
	} | ({"System Manager"} if user == "Administrator" else set())


def _channel_roles(provider):
	if provider in {"WhatsApp", "Webchat"}:
		from crm.api.whatsapp import ALLOWED_WHATSAPP_ROLES

		return set(ALLOWED_WHATSAPP_ROLES)
	return {"System Manager", "Sales User"}


def _account(provider, account_id, active=True):
	"""Current safe metadata only; never load account tokens or fallback settings."""
	apps = frappe.get_installed_apps()
	if provider == "Webchat":
		if not frappe.db.exists("DocType", "CRM Webchat Channel"):
			_deny()
		row = frappe.db.get_value(
			"CRM Webchat Channel", account_id, ["name", "enabled"], as_dict=True, for_update=_locked()
		)
		if not row or (active and row.enabled != 1):
			_deny()
		return frappe._dict(name=row.name, shop=None, scoped=False)
	if provider == "WhatsApp" and "frappe_whatsapp" in apps:
		doctype, identity, status, enabled = "WhatsApp Account", "phone_id", "status", "Active"
		shop = "doco_shop" if frappe.db.has_column(doctype, "doco_shop") else None
	elif provider in {"Messenger", "Instagram"} and "doco_marketing" in apps:
		doctype = "Messenger Page"
		identity = "page_id" if provider == "Messenger" else "ig_account_id"
		status, enabled, shop = "enabled", 1, "shop"
	else:
		_deny()
	fields = ["name", identity, status] + ([shop] if shop else [])
	rows = frappe.db.get_values(doctype, {identity: account_id}, fields, as_dict=True, for_update=_locked())
	if len(rows) != 1 or (active and rows[0].get(status) != enabled):
		_deny()
	return frappe._dict(name=rows[0].name, shop=rows[0].get(shop) if shop else None, scoped=bool(shop))


def _authorize(doc, user=None, write=False):
	from crm.conversation_scope import assert_customer_peer

	if doc.get("peer_id"):
		assert_customer_peer(doc.provider, doc.peer_id)
	user = user or frappe.session.user
	roles = _roles(user)
	# Department routing makes its members eligible for this conversation only;
	# it never lends them a sales/channel role for any other conversation.
	department = doc.get("department") or None
	member = bool(department) and departments.is_member(roles, department)
	if not roles.intersection(_channel_roles(doc.provider)) and not member:
		_deny()
	account = _account(doc.provider, doc.account_id, active=write)
	if doc.provider == "Webchat" and not roles.intersection({"System Manager", "Sales Manager"}):
		# Public visitors never acquire a staff role. Channel operators have an
		# explicit current assignment even on core-only/multi-store installs.
		if not frappe.db.get_values(
			"User Permission",
			{"user": user, "allow": "CRM Webchat Channel", "for_value": account.name},
			["name"],
			for_update=_locked(),
		):
			_deny()
	if doc.get("name") and (
		doc.account_record != account.name or (doc.shop_key or "") != (account.shop or "")
	):
		# Reconfiguration cannot silently move a conversation's authority.
		_deny()
	if account.scoped:
		if "doco_marketing" not in frappe.get_installed_apps():
			_deny()
		# Same manager/assignment policy as social.shops.get_allowed_shops,
		# with current locking reads instead of role/scope/snapshot caches.
		unrestricted = user == "Administrator" or bool(roles & {"System Manager", "Marketing Manager"})
		allowed = {
			r[0]
			for r in frappe.db.get_values(
				"User Permission",
				{"user": user, "allow": "Social Shop"},
				["for_value"],
				for_update=_locked(),
			)
		}
		if account.shop and not frappe.db.get_value(
			"Social Shop", account.shop, "enabled", for_update=_locked()
		):
			_deny()
		if not unrestricted and (not account.shop or account.shop not in allowed):
			_deny()
	permission = "write" if write else "read"
	if bool(doc.reference_doctype) != bool(doc.reference_name):
		_deny()
	if doc.reference_doctype:
		if doc.reference_doctype not in REFERENCES:
			_deny()
		reference = frappe.get_doc(doc.reference_doctype, doc.reference_name, for_update=_locked())
		if not has_document_permission(
			doc.reference_doctype, permission, doc=reference, user=user, print_logs=False
		):
			# A technician need not read the sales Deal: their own department's
			# linked record (e.g. the Repair Order) is the app-owned authority.
			if not (member and _department_record(doc, user, department)):
				_deny()
	elif not has_document_permission("CRM Deal", "read", user=user, print_logs=False) and not member:
		_deny()
	return roles, account


def _department_record(doc, user, department):
	"""True when a context link owned by this department is readable by the user.

	Plain reads, not row locks: the owning app's record is evidence here, and
	locking it inside the conversation fence would invert that app's lock order.
	"""
	allowed = set(departments.record_doctypes(department))
	for link in departments.parse_links(doc.get("context_links")):
		if link["doctype"] not in allowed or not frappe.db.exists("DocType", link["doctype"]):
			continue
		try:
			record = frappe.get_doc(link["doctype"], link["name"])
		except frappe.DoesNotExistError:
			continue
		if has_document_permission(link["doctype"], "read", doc=record, user=user, print_logs=False):
			return True
	return False


def manager_for(roles, doc):
	"""Conversation-control manager: site managers, or this department's manager."""
	return bool(roles & MANAGERS) or departments.is_manager(roles, doc.get("department") or None)


def _projection(doc):
	return {field: doc.get(field) for field in PUBLIC_FIELDS}


def _mark(doc):
	doc.flags.crm_conversation_service = _SERVICE_TOKEN
	return doc


def _load(name):
	_lock_key(name)
	return frappe.get_doc(DOCTYPE, name, for_update=_locked())


def get_or_create(provider, account_id, peer_id, *, reference_doctype=None, reference_name=None):
	"""Internal trusted-ingest entry point; no automatic bot or user authority."""
	name = conversation_key(provider, account_id, peer_id)
	from crm.conversation_scope import assert_customer_peer

	with conversation_fence(name):
		assert_customer_peer(provider, peer_id)
		existing = frappe.db.get_value(DOCTYPE, name, "name", for_update=True)
		account = _account(provider, account_id)
		if existing:
			doc = _load(name)
			if doc.account_record != account.name or (doc.shop_key or "") != (account.shop or ""):
				_deny()
			return doc
		doc = frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"name": name,
				"identity_version": 1,
				"provider": provider,
				"account_id": account_id,
				"peer_id": peer_id,
				"account_record": account.name,
				"shop_key": account.shop,
				"reference_doctype": reference_doctype,
				"reference_name": reference_name,
				"control_state": "Human",
				"human_owner": None,
				"generation": 1,
				"bot_enabled": 0,
				"provider_control": "Not Applicable" if provider in {"WhatsApp", "Webchat"} else "Unknown",
			}
		)
		if reference_doctype or reference_name:
			_authorize(doc, write=True)
		return _mark(doc).insert(ignore_permissions=True)


@frappe.whitelist()
def get_conversation(name: str):
	doc = _load(name)
	_authorize(doc)
	return _projection(doc)


@frappe.whitelist()
def list_conversations(
	provider: str | None, account_id: str | None, limit: int | str = 50, start: int | str = 0
):
	conversation_key(provider, account_id, "0" * 64 if provider == "Webchat" else "1")
	probe = frappe._dict(
		provider=provider, account_id=account_id, shop_key=None, reference_doctype=None, reference_name=None
	)
	_authorize(probe)
	limit, start = min(max(int(limit), 1), 100), max(int(start), 0)
	rows = frappe.get_all(
		DOCTYPE,
		filters={"provider": provider, "account_id": account_id},
		fields=["name"],
		order_by="modified desc, name desc",
		start=start,
		page_length=limit,
	)
	result = []
	for row in rows:
		doc = _load(row.name)
		try:
			_authorize(doc)
		except frappe.PermissionError:
			continue
		result.append(_projection(doc))
	return result


def _generation(value):
	if isinstance(value, bool) or not re.fullmatch(r"[1-9][0-9]{0,17}", str(value)):
		frappe.throw(_("A current conversation generation is required."))
	return int(value)


def assert_current_generation(name, generation, *, origin="Human", actor_user=None, run_name=None):
	"""P5 final check: caller already owns the same fence as control commands."""
	_assert_fence(name)
	doc = _load(name)
	if doc.generation != _generation(generation):
		_conflict()
	if origin not in {"Human", "Bot"}:
		_deny()
	actor_user = actor_user or frappe.session.user
	_authorize(doc, actor_user, write=True)
	if origin == "Human":
		if doc.control_state != "Human" or doc.human_owner != actor_user:
			_deny()
	else:
		_assert_bot_grant(doc, actor_user, run_name)
	if doc.provider_control not in {"Ours", "Not Applicable"}:
		_deny()
	return doc


def _event_key(name, origin, actor, command_id):
	return _digest([1, name, origin, actor, command_id])


def _replay(key, fingerprint):
	row = frappe.db.get_value(EVENT, key, ["input_hash", "result_json"], as_dict=True, for_update=True)
	if not row:
		return None
	if row.input_hash != fingerprint:
		frappe.throw(_("Command ID was already used for different input."))
	result = json.loads(row.result_json)
	result["replayed"] = True
	return result


def _snapshot(doc):
	return {
		f: doc.get(f)
		for f in ("control_state", "human_owner", "generation", "bot_enabled", "provider_control")
	}


def _persist_transition(
	doc,
	before,
	*,
	key,
	fingerprint,
	origin,
	actor,
	action,
	reason="",
	receipt=None,
	grant=None,
	notify_actor=True,
):
	changed = any(doc.get(f) != before[f] for f in before if f != "generation")
	doc.generation = before["generation"] + int(changed)
	if changed:
		_mark(doc).save(ignore_permissions=True)
	result = _projection(doc)
	if grant:
		result.update(grant)
	result["replayed"] = False
	event = frappe.get_doc(
		{
			"doctype": EVENT,
			"name": key,
			"command_key": key,
			"conversation": doc.name,
			"input_hash": fingerprint,
			"origin": origin,
			"actor_user": actor,
			"action": action,
			"reason": reason,
			"from_generation": before["generation"],
			"to_generation": doc.generation,
			"previous_json": json.dumps(before),
			"result_json": json.dumps(result, default=str),
			"source_receipt": receipt,
		}
	)
	_mark(event).insert(ignore_permissions=True)
	if action == "request" and doc.human_owner:
		# A request does not advance ownership, but its current owner must see it.
		try:
			_authorize(doc, doc.human_owner)
		except frappe.PermissionError:
			pass
		else:
			frappe.publish_realtime(
				"crm_conversation_updated",
				{"name": doc.name, "generation": doc.generation},
				user=doc.human_owner,
				after_commit=True,
			)
	if changed and notify_actor:
		# ID/generation only, and only the acting operator: no phone, text or note broadcast.
		if actor and actor != "Guest":
			frappe.publish_realtime(
				"crm_conversation_updated",
				{"name": doc.name, "generation": doc.generation},
				user=actor,
				after_commit=True,
			)
	return result


def internal_take_for_reply(name, actor, send_key):
	"""A person's reply to an unowned conversation takes it, recorded as `take`.

	Only the transcript bridge calls this, inside its fence, for the send that
	needs it. It never takes from a current owner, a bot run, a pause or a
	closed conversation; those stay explicit commands.
	"""
	send_key = _text(send_key)
	with conversation_fence(name):
		doc = _load(name)
		key = _event_key(name, "Human", actor, "reply:" + send_key)
		fingerprint = _digest(["take_for_reply", send_key])
		replay = _replay(key, fingerprint)
		if replay:
			return doc
		_authorize(doc, actor, write=True)
		if (
			doc.control_state != "Human"
			or doc.human_owner
			or doc.provider_control not in {"Ours", "Not Applicable"}
		):
			_conflict()
		before = _snapshot(doc)
		doc.human_owner, doc.bot_enabled = actor, 0
		_persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action="take",
			reason="first_reply",
		)
		return doc


def internal_webchat_customer_reply(conversation_name, message_key):
	"""An immutable local customer message can retire its current bot grant.

	The visitor service calls this after insertion in the same transaction and
	fence. It is not whitelisted and never accepts customer-supplied authority,
	a Meta receipt marker, or a staff principal.
	"""
	from crm.api.webchat import current_session

	with conversation_fence(conversation_name):
		doc = _load(conversation_name)
		if doc.provider != "Webchat":
			_deny()
		message = frappe.db.get_value(
			"CRM Webchat Message",
			message_key,
			[
				"name",
				"channel",
				"session",
				"conversation",
				"direction",
				"text",
				"text_hash",
				"control_generation",
				"creation",
			],
			as_dict=True,
			for_update=True,
		)
		session = current_session(doc.account_id, doc.peer_id)
		if (
			not message
			or message.direction != "Incoming"
			or message.conversation != doc.name
			or message.channel != doc.account_id
			or message.session != session.name
		):
			_deny()
		key = _event_key(doc.name, "System", "Webchat", message.name)
		fingerprint = _digest(
			[
				doc.provider,
				doc.account_id,
				doc.peer_id,
				message.name,
				message.text_hash,
				message.control_generation,
			]
		)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		evidence = {
			"kind": "webchat",
			"provider": doc.provider,
			"account_id": doc.account_id,
			"peer_id": doc.peer_id,
			"message": message.name,
			"text": message.text,
			"received_at": str(message.creation),
			"generation": message.control_generation,
		}
		before = _snapshot(doc)
		reason, grant = "webchat_control_preserved", None
		if doc.control_state == "Bot" and message.control_generation == doc.generation:
			reason, grant = customer_reply_control(doc, evidence)
			if reason != "customer_input_accepted":
				reason = "webchat_customer_held_bot"
		result = _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="System",
			actor=None,
			action="customer_reply",
			reason=reason,
			grant=grant,
		)
		if before["control_state"] != "Bot":
			started = _policy_start(doc, evidence, "inbound:webchat:" + message.name)
			if started:
				result = {**result, **started}
		return result


def customer_reply_control(doc, evidence):
	"""Trusted customer reply while Bot holds control: continue or fall back.

	The caller holds the fence, loaded `doc` and verified the evidence (a
	capability-bound Webchat message or a claimed Meta receipt). Only the exact
	run holding the current grant may accept it, for its pending input step.
	Anything else (no adapter, unmatched text, a request for a person, stale
	authority, an error) keeps the documented human fallback. Mutates control
	fields in memory only; the caller persists one transition.
	"""
	accepted, reason, detail = _customer_input(doc, evidence)
	if accepted:
		return "customer_input_accepted", detail
	doc.control_state, doc.human_owner, doc.bot_enabled = "Human", None, 0
	if all(frappe.db.has_column(DOCTYPE, field) for field in METADATA_FIELDS):
		doc.automation_state = "Handed off"
		# The pinned flow's department receives the returned conversation.
		if detail and detail.get("department") and not doc.get("department"):
			doc.department, doc.routed_at = detail["department"], now_datetime()
	return "customer_reply_held_bot", {"automation_reason": reason}


def _claimed_receipt(receipt_name, provider, account_id):
	if (
		getattr(frappe.local, "request", None) is not None
		or not receipt_name
		or receipt_name != frappe.flags.get("meta_webhook_receipt")
	):
		_deny()
	row = frappe.db.get_value(
		"Meta Webhook Receipt",
		receipt_name,
		["provider", "account_id", "event_type", "state", "attempts", "lease_until"],
		as_dict=True,
		for_update=True,
	)
	if (
		not row
		or row.state != "Processing"
		or row.provider != provider
		or row.account_id != account_id
		or not row.attempts
		or not row.lease_until
		or frappe.utils.get_datetime(row.lease_until) <= now_datetime()
	):
		_deny()
	if row.event_type not in {"message", "postback"}:
		_deny()
	return row


def internal_customer_message(
	provider, account_id, peer_id, *, receipt_name, text=None, received_at=None, continuation=True
):
	"""Claimed Meta receipt for an authenticated customer message.

	With `continuation`, a Bot-held conversation continues only for the exact
	pending input step, else takes the human fallback (WhatsApp already does
	this in conversation_activity before projection, so its hook passes False).
	An idle conversation may then start its account's published policy. A
	conversation is materialized here only when such a policy exists.
	"""
	_claimed_receipt(receipt_name, provider, account_id)
	name = conversation_key(provider, account_id, peer_id)
	text = text if isinstance(text, str) else ""
	evidence = {
		"kind": "meta",
		"provider": provider,
		"account_id": account_id,
		"peer_id": peer_id,
		"message": receipt_name,
		"text": text[:4096],
		"received_at": str(received_at or now_datetime()),
		"generation": None,
	}
	with conversation_fence(name):
		from crm.conversation_scope import assert_customer_peer

		assert_customer_peer(provider, peer_id)
		if not frappe.db.get_value(DOCTYPE, name, "name", for_update=True):
			policy_exists = frappe.db.exists("DocType", "CRM Automation Policy") and frappe.db.get_value(
				"CRM Automation Policy",
				{"provider": provider, "account_id": account_id, "status": "Published"},
				"name",
			)
			if not policy_exists:
				return {"state": "Ignored", "reason_code": "customer_message_no_conversation"}
			doc = get_or_create(provider, account_id, peer_id)
		else:
			doc = _load(name)
		evidence["generation"] = doc.generation
		key = _event_key(name, "Provider", receipt_name, "customer_message")
		fingerprint = _digest([provider, account_id, peer_id, "customer_message", _digest(text)])
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		before = _snapshot(doc)
		reason, grant = "customer_message_observed", None
		if continuation and doc.control_state == "Bot" and doc.bot_enabled:
			reason, grant = customer_reply_control(doc, evidence)
		result = _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Provider",
			actor=None,
			action="customer_reply",
			reason=reason,
			receipt=receipt_name,
			grant=grant,
		)
		if before["control_state"] != "Bot":
			started = _policy_start(doc, evidence, "inbound:meta:" + receipt_name)
			if started:
				result = {**result, **started}
		return result


def _bot_adapter():
	try:
		from crm.api.outbox import bot_adapter

		return bot_adapter()
	except Exception:
		return None


def _customer_input(doc, evidence):
	adapter = _bot_adapter()
	accept = getattr(adapter, "accept_customer_input", None) if adapter else None
	if not callable(accept):
		return False, "customer_input_unavailable", None
	point = "crm_customer_input_" + secrets.token_hex(8)
	messages = list(getattr(frappe.local, "message_log", []) or [])
	frappe.db.savepoint(point)
	try:
		result = accept(doc, dict(evidence))
		if not isinstance(result, dict) or result.get("accepted") is not True:
			code = result.get("reason_code") if isinstance(result, dict) else None
			department = result.get("department") if isinstance(result, dict) else None
			frappe.db.release_savepoint(point)
			code = (
				code
				if isinstance(code, str) and re.fullmatch(r"[a-z0-9_]{1,80}", code)
				else "customer_input_unmatched"
			)
			return (
				False,
				code,
				{"department": department} if department in departments.customer_ids() else None,
			)
		run_name = _text(result.get("run"))
		run_actor = frappe.db.get_value("Chatflow Run", run_name, "actor_user", for_update=True)
		# The accepting run must be the one holding this exact current grant.
		_assert_bot_grant(doc, run_actor, run_name)
		frappe.db.release_savepoint(point)
	except Exception:
		# Discard any partial input bookkeeping; the reply falls back to people.
		frappe.db.rollback(save_point=point)
		frappe.local.message_log = messages
		return False, "customer_input_rejected", None
	node = result.get("node") if isinstance(result.get("node"), str) else None
	return True, "customer_input_accepted", {"automation_run": run_name, "automation_node": node}


def _policy_start(doc, evidence, command_id):
	"""Published inbound policy may start one run for an idle conversation.

	Never raises into the customer's ingress transaction: any refusal or error
	leaves the message stored and the conversation with people.
	"""
	if (
		doc.control_state != "Human"
		or doc.human_owner
		or doc.provider_control not in {"Ours", "Not Applicable"}
	):
		return None
	if not frappe.db.exists("DocType", "CRM Automation Policy"):
		return None
	from crm.api import automation_policy as policies

	try:
		policy = policies.published_for(doc.provider, doc.account_id)
	except frappe.ValidationError:
		return None
	adapter = _bot_adapter()
	start = getattr(adapter, "start_policy_run", None) if adapter else None
	if not policy or not callable(start):
		return None
	point = "crm_policy_start_" + secrets.token_hex(8)
	messages = list(getattr(frappe.local, "message_log", []) or [])
	frappe.db.savepoint(point)
	try:
		if policies.grant_reason(policy, doc) or policies.cooldown_reason(policy, doc):
			frappe.db.release_savepoint(point)
			return None
		result = start(doc, policy.name, command_id, dict(evidence))
		frappe.db.release_savepoint(point)
	except Exception:
		frappe.db.rollback(save_point=point)
		frappe.local.message_log = messages
		frappe.log_error(
			title="CRM automation policy start refused",
			message=f"policy={policy.name} conversation={doc.name}",
		)
		return None
	if isinstance(result, dict) and result.get("run"):
		return {"automation_run": result.get("run"), "automation_policy": policy.name}
	return None


def _verify_ingress(doc, command_id, generation):
	"""The start command names durable, current, trusted customer evidence."""
	kind, _sep, evidence = command_id.partition(":")[2].partition(":")
	if not command_id.startswith("inbound:") or not evidence:
		_deny()
	if kind == "webchat":
		row = frappe.db.get_value(
			"CRM Webchat Message",
			evidence,
			["conversation", "direction", "channel", "control_generation"],
			as_dict=True,
			for_update=True,
		)
		if (
			not row
			or doc.provider != "Webchat"
			or row.direction != "Incoming"
			or row.conversation != doc.name
			or row.channel != doc.account_id
			or row.control_generation != generation
		):
			_deny()
		return
	if kind == "meta":
		_claimed_receipt(evidence, doc.provider, doc.account_id)
		return
	_deny()


def begin_policy_bot(name, expected_generation, command_id, *, run_name, policy_name):
	"""Automatic grant authorized only by the current published policy for this exact account.

	Called by the Chatflow adapter from trusted customer ingress, inside the
	caller's transaction; never whitelisted. The accountable publisher's current
	manager authority, the bot route and the pinned flow are rechecked here and
	again before every bot dispatch.
	"""
	from crm.api import automation_policy as policies

	expected_generation = _generation(expected_generation)
	command_id, run_name, policy_name = _text(command_id, 200), _text(run_name), _text(policy_name)
	key = _event_key(name, "System", "policy:" + policy_name, command_id)
	fingerprint = _digest(["policy_start_bot", expected_generation, run_name, policy_name])
	with conversation_fence(name):
		doc = _load(name)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		_verify_ingress(doc, command_id, expected_generation)
		if doc.generation != expected_generation:
			_conflict()
		if (
			doc.control_state != "Human"
			or doc.human_owner
			or doc.provider_control not in {"Ours", "Not Applicable"}
		):
			_deny()
		policy = policies.published_for(doc.provider, doc.account_id)
		if (
			not policy
			or policy.name != policy_name
			or policies.grant_reason(policy, doc)
			or policies.cooldown_reason(policy, doc)
		):
			_deny()
		_automation_allowed(doc.provider)
		run = frappe.db.get_value(
			"Chatflow Run",
			run_name,
			["flow", "automation_policy", "source_hash"],
			as_dict=True,
			for_update=True,
		)
		if (
			not run
			or run.flow != policy.flow
			or run.automation_policy != policy.name
			or run.source_hash != policy.flow_hash
		):
			_deny()
		snapshot_hash, run_actor = _native_run(
			run_name, doc, expected_generation, policy.published_by, starting=True
		)
		before = _snapshot(doc)
		doc.control_state, doc.human_owner, doc.bot_enabled = "Bot", None, 1
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="System",
			actor=policy.published_by,
			action="policy_start_bot",
			reason="published_inbound_policy",
			notify_actor=False,
			grant={
				"bot_run": run_name,
				"bot_snapshot_hash": snapshot_hash,
				"bot_actor_user": run_actor,
				"bot_requested_by": policy.published_by,
				"bot_policy": policy.name,
				"bot_policy_hash": policy.published_hash,
			},
		)


def _automation_allowed(provider):
	if "doco_marketing" not in frappe.get_installed_apps():
		_deny()
	for doctype, field in (
		("FCRM Settings", "conversation_automation_enabled"),
		("Marketing Settings", "enable_automation"),
	):
		value = frappe.db.sql(
			"SELECT value FROM `tabSingles` WHERE doctype=%s AND field=%s FOR UPDATE", (doctype, field)
		)
		if not value or str(value[0][0]) != "1":
			_deny()
	try:
		from crm.api.outbox import automation_ready

		ready = automation_ready(provider)
	except Exception:
		ready = False
	if ready is not True:
		_deny()


def _native_run(run_name, doc, generation, actor, *, starting=False):
	"""Fixed current-row validator; callers cannot supply a capability object."""
	run_name = _text(run_name)
	try:
		from doco_marketing.services.chatflow_native import validate_native_run
	except ImportError:
		_deny()
	snapshot_hash = validate_native_run(run_name, doc.name, generation, actor, starting=starting)
	if not isinstance(snapshot_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", snapshot_hash):
		_deny()
	run_actor = frappe.db.get_value("Chatflow Run", run_name, "actor_user", for_update=True)
	if not isinstance(run_actor, str) or not run_actor:
		_deny()
	_authorize(doc, run_actor, write=True)
	return snapshot_hash, run_actor


def begin_bot(name, expected_generation, command_id, *, run_name, actor_user=None):
	"""Internal explicit manager grant, only after a durable pinned run exists.

	The marketing caller binds the returned generation to its run in the SAME
	outer transaction. Missing policy, validator or P5 readiness denies the grant.
	"""
	actor = actor_user or frappe.session.user
	if actor != frappe.session.user:
		_deny()
	expected_generation = _generation(expected_generation)
	command_id, run_name = _text(command_id), _text(run_name)
	fingerprint = _digest(["start_bot", expected_generation, run_name])
	key = _event_key(name, "Human", actor, command_id)
	with conversation_fence(name):
		doc = _load(name)
		_authorize(doc, actor)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		roles, _account_row = _authorize(doc, actor, write=True)
		if not roles.intersection(MANAGERS):
			_deny()
		if doc.generation != expected_generation:
			_conflict()
		if doc.control_state != "Human" or doc.human_owner:
			_deny()
		if doc.provider_control not in {"Ours", "Not Applicable"}:
			_deny()
		_automation_allowed(doc.provider)
		snapshot_hash, run_actor = _native_run(run_name, doc, expected_generation, actor, starting=True)
		before = _snapshot(doc)
		doc.control_state, doc.human_owner, doc.bot_enabled = "Bot", None, 1
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action="start_bot",
			grant={
				"bot_run": run_name,
				"bot_snapshot_hash": snapshot_hash,
				"bot_actor_user": run_actor,
				"bot_requested_by": actor,
			},
		)


def _assert_bot_grant(doc, actor, run_name):
	if doc.control_state != "Bot" or not doc.bot_enabled or not run_name:
		_deny()
	_automation_allowed(doc.provider)
	events = frappe.db.get_values(
		EVENT,
		{
			"conversation": doc.name,
			"to_generation": doc.generation,
			"action": ["in", ["start_bot", "policy_start_bot"]],
		},
		["result_json", "actor_user", "action", "origin"],
		as_dict=True,
		for_update=True,
	)
	if len(events) != 1:
		_deny()
	event = events[0]
	grant = json.loads(event.result_json)
	if grant.get("bot_run") != run_name or grant.get("bot_actor_user") != actor:
		_deny()
	if grant.get("bot_requested_by") != event.actor_user:
		_deny()
	if event.action == "start_bot":
		# Revoking the initiating manager also revokes its outstanding bot grant.
		roles, _account_row = _authorize(doc, event.actor_user, write=True)
		if event.origin != "Human" or not roles.intersection(MANAGERS):
			_deny()
	else:
		# Pausing/editing the policy, a changed route or the publisher losing
		# authority revokes every grant it made, including queued replies.
		from crm.api import automation_policy as policies

		name = grant.get("bot_policy")
		if (
			event.origin != "System"
			or not isinstance(name, str)
			or not frappe.db.exists(policies.DOCTYPE, name)
		):
			_deny()
		policy = frappe.get_doc(policies.DOCTYPE, name, for_update=True)
		if (
			policy.published_hash != grant.get("bot_policy_hash")
			or policy.published_by != event.actor_user
			or policies.grant_reason(policy, doc)
		):
			_deny()
	snapshot_hash, run_actor = _native_run(run_name, doc, doc.generation, actor)
	if grant.get("bot_snapshot_hash") != snapshot_hash or run_actor != actor:
		_deny()


def handoff_bot(
	name,
	generation,
	run_name,
	command_id,
	*,
	actor_user,
	step_id,
	owner=None,
	department=None,
	finished=False,
):
	"""Execute only a currently due pinned handoff; no assignment/send side effects.

	A pinned department routes the returned conversation to that work queue in
	the same transition; the owner, when pinned, must be eligible after routing.
	"""
	actor_user, step_id = _text(actor_user), _text(step_id)
	command_id, run_name = _text(command_id), _text(run_name)
	owner = _text(owner, required=False) or None
	department = departments.department(department or None)
	generation = _generation(generation)
	key = _event_key(name, "System", actor_user, command_id)
	fingerprint = _digest(
		["bot_handoff", generation, run_name, step_id, owner]
		+ ([department, bool(finished)] if department or finished else [])
	)
	with conversation_fence(name):
		doc = _load(name)
		_authorize(doc, actor_user)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		doc = assert_current_generation(
			name, generation, origin="Bot", actor_user=actor_user, run_name=run_name
		)
		try:
			from doco_marketing.services.chatflow_native import validate_native_handoff
		except ImportError:
			_deny()
		extra = {"department": department, "finished": bool(finished)} if department or finished else {}
		if (
			validate_native_handoff(run_name, name, generation, actor_user, step_id, owner, **extra)
			is not True
		):
			_deny()
		if department:
			if not frappe.db.has_column(DOCTYPE, "department"):
				frappe.throw(_("Run the CRM migration before routing conversations to departments."))
			doc.department, doc.routed_at = department, now_datetime()
		if owner:
			_authorize(doc, owner, write=True)
		before = _snapshot(doc)
		doc.control_state, doc.human_owner, doc.bot_enabled = "Human", owner, 0
		if frappe.db.has_column(DOCTYPE, "automation_state"):
			doc.automation_state = "Done" if finished else "Handed off"
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="System",
			actor=actor_user,
			action="bot_handoff",
			reason="pinned_run_finished" if finished else "pinned_run_handoff",
		)


@frappe.whitelist(methods=["POST"])
def apply_control(
	name: str,
	action: str,
	expected_generation: bool | int | float | str,
	command_id: str,
	owner: str | None = None,
	reason: str | None = None,
):
	if action not in CONTROL_ACTIONS:
		frappe.throw(_("Unsupported conversation control action."))
	command_id, reason = _text(command_id), _text(reason, 500, required=False)
	owner = _text(owner, required=False) or None
	if action != "transfer" and owner:
		frappe.throw(_("Only transfer accepts a target owner."))
	expected_generation = _generation(expected_generation)
	actor = frappe.session.user
	fingerprint = _digest([action, expected_generation, owner, reason])
	key = _event_key(name, "Human", actor, command_id)
	with conversation_fence(name):
		doc = _load(name)
		_authorize(doc, actor)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		roles, account = _authorize(doc, actor, write=True)
		if doc.generation != expected_generation:
			_conflict()
		before = _snapshot(doc)
		manager = manager_for(roles, doc)
		current_owner = doc.human_owner
		if action == "request":
			if doc.control_state != "Human" or not current_owner or current_owner == actor:
				_conflict()
		elif action == "take":
			if doc.control_state == "Closed":
				_conflict()
			if current_owner and current_owner != actor and not (manager and reason):
				_deny()
			doc.control_state, doc.human_owner, doc.bot_enabled = "Human", actor, 0
		elif action == "transfer":
			if doc.control_state != "Human" or (current_owner != actor and not (manager and reason)):
				_deny()
			if not owner:
				frappe.throw(_("An eligible target owner is required."))
			_authorize(doc, owner, write=True)
			doc.human_owner, doc.bot_enabled = owner, 0
		elif action == "release":
			if current_owner != actor and not (manager and reason):
				_deny()
			if doc.control_state != "Human":
				_conflict()
			doc.human_owner, doc.bot_enabled = None, 0
		elif action in {"pause", "close"}:
			if (
				current_owner != actor
				and not (manager and reason)
				and not (action == "pause" and doc.control_state == "Bot")
			):
				_deny()
			doc.control_state = "Paused" if action == "pause" else "Closed"
			doc.bot_enabled = 0
		elif action == "reopen":
			if doc.control_state != "Closed" or (current_owner != actor and not (manager and reason)):
				_deny()
			doc.control_state, doc.human_owner, doc.bot_enabled = "Human", None, 0
		if (
			before["control_state"] == "Bot"
			and doc.control_state != "Bot"
			and frappe.db.has_column(DOCTYPE, "automation_state")
		):
			# Takeover parks the pinned run; it resumes only by an explicit start.
			doc.automation_state = "Handed off"
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action=action,
			reason=reason,
		)


def _require_metadata():
	if not all(frappe.db.has_column(DOCTYPE, field) for field in METADATA_FIELDS):
		frappe.throw(_("Run the CRM migration before routing conversations to departments."))


def _write_metadata(doc, values):
	"""Broker-only metadata write: no generation and no `modified` change.

	Routing/links are not control; advancing the generation would cancel the
	owner's queued replies, and touching `modified` would move the clock that
	customer activity compares with provider timestamps.
	"""
	_require_metadata()
	frappe.db.set_value(DOCTYPE, doc.name, values, update_modified=False)
	doc.update(values)


def route(name, department, expected_generation, command_id, reason=None):
	"""Move a conversation to a department queue; the person must already hold it or manage it."""
	actor = frappe.session.user
	department = departments.department(department or None)
	command_id, reason = _text(command_id), _text(reason, 500, required=False)
	expected_generation = _generation(expected_generation)
	key = _event_key(name, "Human", actor, command_id)
	fingerprint = _digest(["route", expected_generation, department, reason])
	with conversation_fence(name):
		doc = _load(name)
		_authorize(doc, actor)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		roles, _account_row = _authorize(doc, actor, write=True)
		if doc.generation != expected_generation:
			_conflict()
		if doc.control_state == "Closed":
			_conflict()
		manager = manager_for(roles, doc) or departments.is_manager(roles, department)
		unowned = doc.control_state in {"Human", "Paused"} and not doc.human_owner
		if not (doc.human_owner == actor or unowned or manager):
			_deny()
		before = _snapshot(doc)
		previous = doc.get("department") or None
		_write_metadata(doc, {"department": department, "routed_at": now_datetime() if department else None})
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action="route",
			reason=reason,
			grant={"previous_department": previous},
		)


def _linkable(doctype, docname, user):
	if (
		not isinstance(doctype, str)
		or doctype not in departments.record_doctypes()
		or not frappe.db.exists("DocType", doctype)
	):
		frappe.throw(_("This record type cannot be linked to customer conversations."))
	docname = _text(docname)
	try:
		record = frappe.get_doc(doctype, docname)
	except frappe.DoesNotExistError:
		_deny()
	if not has_document_permission(doctype, "read", doc=record, user=user, print_logs=False):
		_deny()
	return record


def _owning_department(doctype, preferred=None):
	if preferred and doctype in departments.record_doctypes(preferred):
		return preferred
	return next(
		(key for key in departments.customer_ids() if doctype in departments.record_doctypes(key)), None
	)


def link_record(name, doctype, docname, command_id, remove=False):
	"""Link/unlink an owning-app record the acting person can read to this conversation."""
	actor = frappe.session.user
	command_id = _text(command_id)
	remove = remove is True or str(remove).strip().lower() in {"1", "true"}
	key = _event_key(name, "Human", actor, command_id)
	fingerprint = _digest(["unlink" if remove else "link", doctype, docname])
	with conversation_fence(name):
		doc = _load(name)
		_authorize(doc, actor)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		_authorize(doc, actor, write=True)
		if doc.control_state == "Closed":
			_conflict()
		links = departments.parse_links(doc.get("context_links"))
		if remove:
			kept = [link for link in links if (link["doctype"], link["name"]) != (doctype, docname)]
			if len(kept) == len(links):
				frappe.throw(_("This record is not linked to the conversation."))
			links = kept
		else:
			record = _linkable(doctype, docname, actor)
			if any((link["doctype"], link["name"]) == (record.doctype, record.name) for link in links):
				return _projection(doc) | {"replayed": False}
			if len(links) >= departments.MAX_LINKS:
				frappe.throw(_("A conversation can link at most {0} records.").format(departments.MAX_LINKS))
			links.append(
				{
					"doctype": record.doctype,
					"name": record.name,
					"department": _owning_department(record.doctype, doc.get("department")),
					"added_by": actor,
					"added_at": str(now_datetime()),
					"source": "person",
				}
			)
		before = _snapshot(doc)
		_write_metadata(doc, {"context_links": json.dumps(links, sort_keys=True, separators=(",", ":"))})
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action="unlink" if remove else "link",
			reason=f"{doctype}:{docname}"[:500],
		)


def internal_automation_link(name, generation, run_name, *, actor_user, doctype, docname):
	"""The pinned run links the record its own capability created or verified.

	Requires the current bot grant for this exact run; the execution user must
	be able to read the record through its owning app's permissions.
	"""
	with conversation_fence(name):
		doc = assert_current_generation(
			name, generation, origin="Bot", actor_user=actor_user, run_name=run_name
		)
		record = _linkable(doctype, docname, actor_user)
		links = departments.parse_links(doc.get("context_links"))
		if any((link["doctype"], link["name"]) == (record.doctype, record.name) for link in links):
			return links
		if len(links) >= departments.MAX_LINKS:
			frappe.throw(_("A conversation can link at most {0} records.").format(departments.MAX_LINKS))
		links.append(
			{
				"doctype": record.doctype,
				"name": record.name,
				"department": _owning_department(record.doctype, doc.get("department")),
				"added_by": actor_user,
				"added_at": str(now_datetime()),
				"source": "automation:" + run_name[:100],
			}
		)
		_write_metadata(doc, {"context_links": json.dumps(links, sort_keys=True, separators=(",", ":"))})
		return links


def internal_automation_state(name, run_name, state):
	"""Queue hint written by the run owner inside its fence; never authority."""
	if state not in AUTOMATION_STATES:
		frappe.throw(_("Invalid automation state."))
	if not all(frappe.db.has_column(DOCTYPE, field) for field in ("automation_run", "automation_state")):
		return
	_assert_fence(name)
	frappe.db.set_value(
		DOCTYPE, name, {"automation_run": _text(run_name), "automation_state": state}, update_modified=False
	)


def context_view(doc, user=None):
	"""Linked records the viewer can read, with Desk/CRM routes; others are omitted."""
	user = user or frappe.session.user
	out = []
	for link in departments.parse_links(doc.get("context_links")):
		doctype, docname = link["doctype"], link["name"]
		if not frappe.db.exists("DocType", doctype):
			continue
		try:
			record = frappe.get_doc(doctype, docname)
		except frappe.DoesNotExistError:
			continue
		if not has_document_permission(doctype, "read", doc=record, user=user, print_logs=False):
			continue
		title_field = frappe.get_meta(doctype).get_title_field()
		label = record.get(title_field) if title_field and title_field != "name" else None
		out.append(
			{
				"doctype": doctype,
				"name": docname,
				"label": str(label or docname)[:140],
				"department": link.get("department"),
				"source": (link.get("source") or "person").split(":")[0],
				"url": record_url(doctype, docname),
			}
		)
	return out


def record_url(doctype, docname):
	crm = {"CRM Deal": "/crm/deals/", "CRM Lead": "/crm/leads/"}
	if doctype in crm:
		return crm[doctype] + quote(docname, safe="")
	return "/app/" + frappe.scrub(doctype).replace("_", "-") + "/" + quote(docname, safe="")


def internal_apply_provider_event(
	provider, account_id, peer_id, action, *, receipt_name=None, historical=False
):
	"""Trusted receipt observation, including retry after a rolled-back attempt.

	meta_webhook_replay also means attempt > 1, so it cannot suppress holds.
	Only explicit history/source kind does. No observation ever enables a bot.
	"""
	if action not in PROVIDER_ACTIONS:
		frappe.throw(_("Unsupported provider control observation."))
	receipt_name = receipt_name or frappe.flags.get("meta_webhook_receipt")
	if not receipt_name or receipt_name != frappe.flags.get("meta_webhook_receipt"):
		_deny()
	receipt = frappe.db.get_value(
		"Meta Webhook Receipt",
		receipt_name,
		["provider", "account_id", "event_type"],
		as_dict=True,
		for_update=True,
	)
	if not receipt or receipt.provider != provider or receipt.account_id != account_id:
		_deny()
	historical = (
		historical
		or receipt.event_type in {"history", "smb_app_state_sync"}
		or receipt.event_type.startswith("history:")
	)
	name = conversation_key(provider, account_id, peer_id)
	key = _event_key(name, "Provider", receipt_name, action)
	fingerprint = _digest([provider, account_id, peer_id, action])
	with conversation_fence(name):
		doc = get_or_create(provider, account_id, peer_id)
		replay = _replay(key, fingerprint)
		if replay:
			return replay
		before = _snapshot(doc)
		if not historical:
			if action == "external_outbound":
				# Closed remains closed; external evidence cannot reopen it.
				if doc.control_state != "Closed":
					doc.control_state = "Human"
				doc.human_owner, doc.bot_enabled = None, 0
			elif action == "control_lost":
				doc.provider_control = "Other"
				if doc.control_state != "Closed":
					doc.control_state = "Paused"
				doc.bot_enabled = 0
			elif action == "control_returned":
				doc.provider_control = "Ours"
		return _persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Provider",
			actor=None,
			action=action,
			reason="historical_evidence_only" if historical else "provider_observation",
			receipt=receipt_name,
		)
