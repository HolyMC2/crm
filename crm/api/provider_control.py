"""Read-only provider thread-ownership verification for one exact social conversation.

A conversation-control manager or the current human owner asks the owning
channel adapter to query the provider now. Only that live answer, obtained with
the exact account's current credential and app identity, records `Ours`; a
config flag, inbound message, webhook time, echo, operator assertion or old
handover event never does. Nothing takes, passes or requests provider control
and nothing is sent. Inconclusive answers never grant and retire a stored
`Ours`. The owning transport re-queries the owner before every final send too.
"""

import re

import frappe
from frappe import _
from frappe.utils import now_datetime

from crm.api import conversations as control

SOCIAL = {"Messenger", "Instagram"}
# Only these outcomes carry a provider state; every other one is inconclusive.
PROVES = {"ours": "Ours", "other_app": "Other"}
OUTCOMES = {
	"ours",
	"other_app",
	"not_owner",
	"unsupported",
	"unconfigured",
	"account_invalid",
	"account_changed",
	"denied",
	"rate_limited",
	"invalid",
	"unavailable",
}
OWNER_KINDS = {None, "this_app", "meta_inbox", "other_app"}
_UNAVAILABLE = (
	"unavailable",
	"provider_control_unavailable",
	"No se pudo confirmar con Meta ahora. Vuelve a verificar en unos minutos; "
	"mientras tanto responde desde la bandeja de Meta.",
)
_NO_ADAPTER = (
	"unsupported",
	"provider_control_unsupported",
	"Este canal no tiene una verificación del control de Meta. Responde desde la bandeja de Meta.",
)


def _inconclusive(outcome, reason, guidance):
	return {
		"outcome": outcome,
		"provider_control": None,
		"reason_code": reason,
		"owner_kind": None,
		"owner_app_id": None,
		"expiration": None,
		"app_id": None,
		"account_fingerprint": None,
		"checked_at": str(now_datetime()),
		"guidance": guidance,
	}


def _clean(result):
	"""Only finite, credential-free fields leave the adapter; anything else is inconclusive."""
	if not isinstance(result, dict) or result.get("outcome") not in OUTCOMES:
		return _inconclusive(*_UNAVAILABLE)
	outcome = result["outcome"]
	values = {
		key: result.get(key)
		for key in (
			"provider_control",
			"reason_code",
			"owner_kind",
			"owner_app_id",
			"expiration",
			"app_id",
			"account_fingerprint",
			"checked_at",
			"guidance",
		)
	}

	def digits(value):
		return value is None or (isinstance(value, str) and re.fullmatch(r"[0-9]{1,32}", value))

	valid = (
		values["provider_control"] == PROVES.get(outcome)
		and isinstance(values["reason_code"], str)
		and re.fullmatch(r"[a-z0-9_]{1,100}", values["reason_code"])
		and values["owner_kind"] in OWNER_KINDS
		and digits(values["owner_app_id"])
		and digits(values["app_id"])
		and (
			values["expiration"] is None
			or (type(values["expiration"]) is int and 0 <= values["expiration"] < 10**13)
		)
		and (
			values["account_fingerprint"] is None
			or (
				isinstance(values["account_fingerprint"], str)
				and re.fullmatch(r"[0-9a-f]{64}", values["account_fingerprint"])
			)
		)
		and isinstance(values["checked_at"], str)
		and 0 < len(values["checked_at"]) <= 40
		and isinstance(values["guidance"], str)
		and 0 < len(values["guidance"]) <= 600
		and not any(ord(char) < 32 for char in values["guidance"])
	)
	return {"outcome": outcome, **values} if valid else _inconclusive(*_UNAVAILABLE)


def _query(doc):
	from crm.api.outbox import channel_adapter

	adapter = channel_adapter(doc.provider)
	verify_owner = getattr(adapter, "verify_provider_control", None) if adapter else None
	if not callable(verify_owner):
		return _inconclusive(*_NO_ADAPTER)
	# The adapter sees an immutable copy of the exact identity, never the document.
	scope = frappe._dict(
		name=doc.name,
		provider=doc.provider,
		account_id=doc.account_id,
		peer_id=doc.peer_id,
		account_record=doc.account_record,
	)
	messages = list(getattr(frappe.local, "message_log", []) or [])
	try:
		return _clean(verify_owner(scope))
	except (frappe.QueryDeadlockError, frappe.QueryTimeoutError):
		raise
	except Exception:
		# Never surface provider/credential text; the answer is simply unknown.
		frappe.local.message_log = messages
		return _inconclusive(*_UNAVAILABLE)


def _allowed(doc, actor, expected_generation):
	roles, _account = control._authorize(doc, actor, write=True)
	if doc.provider not in SOCIAL:
		frappe.throw(_("Provider control applies only to Messenger and Instagram conversations."))
	if doc.generation != expected_generation or doc.control_state == "Closed":
		control._conflict()
	if not (control.manager_for(roles, doc) or doc.human_owner == actor):
		control._deny()


def _apply(doc, target):
	"""Provider state from this answer; never enables a bot or changes a human owner."""
	current = doc.provider_control
	new = target or ("Unknown" if current == "Ours" else current)
	if new == current:
		return False
	doc.provider_control, doc.bot_enabled = new, 0
	if doc.control_state == "Bot":
		# Its grant was bound to the previous generation: people get the conversation back.
		doc.control_state, doc.human_owner = "Human", None
		if frappe.db.has_column(control.DOCTYPE, "automation_state"):
			doc.automation_state = "Handed off"
	return True


def _notify_owner(doc, actor):
	owner = doc.human_owner
	if not owner or owner == actor:
		return
	try:
		control._authorize(doc, owner)
	except frappe.PermissionError:
		return
	frappe.publish_realtime(
		"crm_conversation_updated",
		{"name": doc.name, "generation": doc.generation},
		user=owner,
		after_commit=True,
	)


@frappe.whitelist(methods=["POST"])
def verify(name: str, expected_generation: bool | int | float | str, command_id: str):
	"""Ask the provider who owns this thread now and record only that answer."""
	actor = frappe.session.user
	command_id = control._text(command_id)
	expected_generation = control._generation(expected_generation)
	key = control._event_key(name, "Human", actor, "provider_control:" + command_id)
	fingerprint = control._digest(["provider_verify", expected_generation])
	with control.conversation_fence(name):
		doc = control._load(name)
		control._authorize(doc, actor)
		replay = control._replay(key, fingerprint)
		if replay:
			return replay
		_allowed(doc, actor, expected_generation)
		verification = _query(doc)
		# Current locked rereads after the provider round trip.
		doc = control._load(name)
		_allowed(doc, actor, expected_generation)
		before = control._snapshot(doc)
		changed = _apply(doc, verification["provider_control"])
		public = {
			key_: verification[key_]
			for key_ in (
				"outcome",
				"reason_code",
				"owner_kind",
				"owner_app_id",
				"expiration",
				"app_id",
				"account_fingerprint",
				"checked_at",
			)
		}
		public.update(
			provider_control_target=verification["provider_control"],
			send_ready=doc.provider_control == "Ours",
		)
		result = control._persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action="provider_verify",
			reason=verification["reason_code"],
			grant={"changed": changed, "message": verification["guidance"], "verification": public},
		)
		if changed:
			_notify_owner(doc, actor)
		return result
