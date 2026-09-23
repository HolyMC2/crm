"""Transcript sends to a natively governed customer go through the durable outbox.

frappe_whatsapp asks `governing_conversation` before any Meta request. When a
native conversation exists for the exact account and recipient, the WhatsApp
Message row stays as the transcript and `queue_transcript` freezes the payload
the legacy path would have posted into a CRM Outbound Intent. Every other send
keeps the legacy path. `project_transcript` mirrors intent state back onto the
row, and writes a row for accepted intents that had none (Conversaciones
replies, bot replies), so every thread, preview and summary sees one history.
"""

import json
from contextlib import ExitStack, contextmanager
from contextvars import ContextVar
from datetime import timedelta
from urllib.parse import unquote

import frappe
from frappe import _
from frappe.utils import now_datetime

from crm.api import conversations as control
from crm.api import outbox

ROW = "WhatsApp Message"
PROJECTED_PREFIX = "wa-native-"
# Intent state -> transcript row status. Delivered/Read and provider failures are
# written by the delivery webhook itself, with Meta's own error text.
ROW_STATUS = {
	"Queued": "Queued",
	"Claimed": "Queued",
	"Deferred": "Queued",
	"Submitting": "Sending",
	"Accepted": "Success",
	"Blocked": "failed",
	"Failed": "failed",
	"Cancelled": "failed",
	"Unknown": "unknown",
}
# How the current send was produced. Server code declares it; nothing a client
# sends can set it. Unset means an automated producer.
_SEND_MODE = ContextVar("crm_transcript_send_mode", default=None)
GENERIC_COMMANDS = {"insert", "save", "insert_many", "submit", "savedocs", "run_doc_method"}


class NativeSendRefused(frappe.ValidationError):
	reason_code = None
	native_refusal = True  # frappe_whatsapp re-raises these unchanged


def refuse(reason_code, owner=None):
	"""Raise the operator-facing refusal through the message log the client reads."""
	try:
		frappe.throw(reason_message(reason_code, owner), NativeSendRefused, title=_("Mensaje no enviado"))
	except NativeSendRefused as error:
		error.reason_code = reason_code
		raise


def reason_message(code, owner=None):
	"""What an operator can do about a refused or failed send, never a raw code."""
	if code == "conversation_owned":
		name = owner and (frappe.db.get_value("User", owner, "full_name") or owner)
		return _("{0} atiende esta conversación. Solicita el control para responder.").format(
			name or _("Otra persona")
		)
	messages = {
		"bot_in_control": _("El asistente atiende esta conversación. Toma el control para responder."),
		"conversation_paused": _("La conversación está en pausa. Toma el control para responder."),
		"conversation_closed": _("La conversación está cerrada. Reábrela para responder."),
		"provider_control_unavailable": _("Esta conversación se atiende desde la app de WhatsApp Business."),
		"customer_window_unverified": _(
			"Pasaron más de 24 horas desde el último mensaje del cliente. Envía una plantilla."
		),
		"recipient_suppressed": _("El cliente pidió no recibir mensajes por WhatsApp."),
		"account_unavailable": _("La cuenta de WhatsApp no puede enviar. Revisa su configuración."),
		"account_configuration_invalid": _("La cuenta de WhatsApp no puede enviar. Revisa su configuración."),
		"account_configuration_changed": _(
			"La cuenta de WhatsApp cambió antes del envío. Vuelve a enviarlo."
		),
		"authority_revoked": _("No tienes acceso a esta conversación o a su cuenta."),
		"frozen_payload_invalid": _("Este tipo de mensaje no se puede enviar en esta conversación."),
		"conversation_changed": _("La conversación cambió de responsable antes del envío."),
		"conversation_scope_changed": _("La conversación cambió de responsable antes del envío."),
		"reply_expired": _("El mensaje venció sin enviarse."),
		"attempts_exhausted": _("Se agotaron los intentos de envío."),
		"provider_rejected": _("WhatsApp rechazó el mensaje."),
		"provider_rate_limited": _("WhatsApp limitó los envíos. Reintenta en unos minutos."),
		"provider_response_uncertain": _(
			"No se pudo confirmar el envío. Revisa el chat del cliente antes de reenviarlo."
		),
		"submission_interrupted": _(
			"No se pudo confirmar el envío. Revisa el chat del cliente antes de reenviarlo."
		),
		"operator_cancelled": _("Envío cancelado."),
		"site_maintenance": _("El sitio está en mantenimiento. Reintenta más tarde."),
		"transcript_already_queued": _("Este mensaje ya está en la cola de envío."),
		"conversation_busy": _(
			"Se está enviando otro mensaje de esta conversación. Reintenta en unos segundos."
		),
		"transcript_not_retryable": _("Este envío ya no se puede repetir. Revisa su estado en el chat."),
	}
	return messages.get(code) or _("No se pudo enviar el mensaje.")


def governing_conversation(account, peer):
	"""The native conversation that governs this send, else None (legacy path).

	Demo accounts keep their simulated transport. Recipients are matched exactly,
	like the transport fence, so no two customers can share a conversation.
	"""
	if not isinstance(peer, str) or not account or (account.get("mode") or "Live") != "Live":
		return None
	if not all(frappe.db.exists("DocType", d) for d in (control.DOCTYPE, outbox.DOCTYPE)):
		return None
	if not frappe.db.has_column(outbox.DOCTYPE, "transcript_message"):
		return None
	try:
		name = control.conversation_key("WhatsApp", account.phone_id, peer)
	except frappe.ValidationError:
		return None
	return name if frappe.db.exists(control.DOCTYPE, name) else None


@contextmanager
def person_reply():
	"""Wrap a composer endpoint: its send is a person's reply and follows ownership.

	An outer declaration wins, so an approval flow that reuses a composer
	function stays an automated notice.
	"""
	token = _SEND_MODE.set("person") if _SEND_MODE.get() is None else None
	try:
		yield
	finally:
		if token:
			_SEND_MODE.reset(token)


@contextmanager
def automated_send():
	"""Wrap a reviewed or automated producer: its notice skips ownership."""
	token = _SEND_MODE.set("automation") if _SEND_MODE.get() is None else None
	try:
		yield
	finally:
		if token:
			_SEND_MODE.reset(token)


def _generic_message_write():
	"""A client writing WhatsApp Message itself through the generic document API."""
	request = getattr(frappe.local, "request", None)
	if not request:
		return False
	path = unquote(str(getattr(request, "path", "") or ""))
	if "/api/resource/WhatsApp Message" in path or "/api/v2/document/WhatsApp Message" in path:
		return True
	form = frappe.local.form_dict or {}
	command = str(form.get("cmd") or path.rstrip("/").rsplit("/", 1)[-1])
	if command.rsplit(".", 1)[-1] not in GENERIC_COMMANDS:
		return False
	named = {form.get("doctype"), form.get("dt")}
	for key in ("doc", "docs"):
		value = form.get(key)
		try:
			value = json.loads(value) if isinstance(value, str) else value
		except ValueError:
			value = None
		for item in value if isinstance(value, list) else [value]:
			if isinstance(item, dict):
				named.add(item.get("doctype"))
	return "WhatsApp Message" in named


def _origin():
	"""A person's reply follows ownership; automated and approved notices do not.

	Provenance fields are ignored: they default to Human and a client can write
	them. A generic write of the message itself is always a person's reply.
	"""
	user = frappe.session.user
	if user not in (None, "", "Guest") and (_generic_message_write() or _SEND_MODE.get() == "person"):
		return "Human", user
	# Automated producers act with system authority; the row keeps who triggered it.
	return "Automation", "Administrator"


def _strip_nulls(value):
	"""Legacy producers leave empty optional fields as null; Meta ignores them."""
	if isinstance(value, dict):
		return {k: _strip_nulls(v) for k, v in value.items() if v is not None}
	if isinstance(value, list):
		return [_strip_nulls(v) for v in value]
	return value


def _control_refusal(conversation, origin, actor):
	if conversation.provider_control not in {"Ours", "Not Applicable"}:
		return "provider_control_unavailable"
	if origin == "Automation":
		return None
	state, owner = conversation.control_state, conversation.human_owner
	if state == "Human":
		return None if owner == actor else ("take" if not owner else "conversation_owned")
	return {"Bot": "bot_in_control", "Paused": "conversation_paused", "Closed": "conversation_closed"}.get(
		state, "authority_revoked"
	)


def queue_transcript(row, account, payload):
	"""Freeze one transcript send into an intent; refuse with an actionable reason.

	Runs in the producer's transaction, after the row has its name. A refusal
	raises, which aborts the row exactly like a failed legacy send did.
	"""
	name = governing_conversation(account, payload.get("to"))
	if not name:
		return None
	from frappe_whatsapp.native_outbox import validate_payload

	from crm.api.outbox_policy import account_revision, automation_reason, manual_reply_reason

	origin, actor = _origin()
	payload = _strip_nulls(payload)
	intent_name = outbox._hash([1, name, "transcript", row.name])
	with ExitStack() as stack:
		try:
			stack.enter_context(control.conversation_fence(name))
		except frappe.TimestampMismatchError:
			# The dispatcher holds the fence through a Meta request.
			refuse("conversation_busy")
		current = control._load(name)
		try:
			control._authorize(current, actor, write=True)
		except frappe.PermissionError:
			refuse("authority_revoked")
		refusal = _control_refusal(current, origin, actor)
		if refusal == "take":
			try:
				current = control.internal_take_for_reply(name, actor, row.name)
			except (frappe.PermissionError, frappe.TimestampMismatchError):
				refuse("conversation_changed")
		elif refusal:
			refuse(refusal, owner=current.human_owner)
		try:
			frozen = validate_payload(
				payload, account_id=current.account_id, peer_id=current.peer_id
			).decode()
		except ValueError:
			refuse("frozen_payload_invalid")
		if frappe.db.get_value(outbox.DOCTYPE, intent_name, "name", for_update=True):
			refuse("transcript_already_queued")
		source = frappe.db.get_value(
			"WhatsApp Account",
			current.account_record,
			["name", "app_id", "business_id"],
			as_dict=True,
			for_update=True,
		)
		if not source:
			refuse("account_unavailable")
		kind = payload.get("type")
		purpose = "automation" if origin == "Automation" else "service" if kind == "template" else "manual"
		doc = frappe.get_doc(
			{
				"doctype": outbox.DOCTYPE,
				"name": intent_name,
				"action_key": intent_name,
				"conversation": name,
				"conversation_generation": current.generation,
				"provider": "WhatsApp",
				"account_id": current.account_id,
				"peer_id": current.peer_id,
				"actor_user": actor,
				"origin": origin,
				"purpose": purpose,
				"payload": frozen,
				"source_doctype": "WhatsApp Account",
				"source_name": source.name,
				"source_action": account_revision(source),
				"transcript_message": row.name,
				"state": "Queued",
				"attempts": 0,
				"expires_at": now_datetime() + timedelta(hours=24),
				"state_log": outbox._canonical(
					[{"state": "Queued", "at": str(now_datetime()), "reason": ""}]
				),
			}
		)
		doc.payload_hash = outbox._fingerprint(doc)
		# The dispatcher runs these same checks again right before delivery.
		if origin == "Human":
			try:
				control.assert_current_generation(name, current.generation, actor_user=actor)
			except (frappe.PermissionError, frappe.TimestampMismatchError):
				refuse("conversation_changed")
			reason = manual_reply_reason(doc)
		else:
			reason = automation_reason(doc)
		if reason:
			refuse(reason)
		outbox._mark(doc).insert(ignore_permissions=True)
		outbox._after_commit(doc.name)
		outbox._notify(doc)
		return doc.name


def requeue_transcript(row):
	"""Send an existing transcript row again through its own intent.

	Returns False when the row has no intent yet. A send that may already have
	reached the customer (accepted, unknown) or was cancelled is not repeated.
	"""
	name = (
		frappe.db.get_value(outbox.DOCTYPE, {"transcript_message": row.name}, "name")
		if _bridge_ready()
		else None
	)
	if not name:
		return False
	conversation = frappe.db.get_value(outbox.DOCTYPE, name, "conversation")
	with control.conversation_fence(conversation):
		doc = outbox._load(name)
		if doc.state in {"Queued", "Claimed"}:
			return True
		if not outbox._projection(doc)["can_retry"]:
			refuse("transcript_not_retryable")
		reason = outbox._eligibility(doc)
		if reason:
			refuse(reason, owner=frappe.db.get_value(control.DOCTYPE, conversation, "human_owner"))
		outbox._transition(doc, "Queued", "transcript_retry", next_attempt_at=None, lease_until=None)
		outbox._after_commit(doc.name)
	return True


def _publish(row):
	# Activities subscribes to this record's permission-checked document room.
	# Unlinked/native-only threads already have their conversation refresh path.
	if not row or row.reference_doctype not in control.REFERENCES or not row.reference_name:
		return
	frappe.publish_realtime(
		"whatsapp_message",
		{
			"reference_doctype": row.reference_doctype,
			"reference_name": row.reference_name,
			"phone": row.to,
		},
		doctype=row.reference_doctype,
		docname=row.reference_name,
		after_commit=True,
	)


def project_transcript(doc):
	"""Mirror an intent's state onto its transcript row, creating it on acceptance."""
	if not frappe.db.exists("DocType", ROW):
		return
	linked = doc.get("transcript_message")
	projected = PROJECTED_PREFIX + doc.name
	if linked and not frappe.db.exists(ROW, linked):
		# Someone deleted the transcript row; the intent's own lifecycle continues.
		return
	target = linked or (projected if frappe.db.exists(ROW, projected) else None)
	if not target:
		if doc.state == "Accepted":
			_insert_projection(doc, projected)
		return
	status = ROW_STATUS.get(doc.state)
	if not status or (doc.state == "Failed" and doc.reason_code == "provider_delivery_failed"):
		return
	values = {"status": status}
	if doc.state == "Accepted":
		values.update(message_id=doc.provider_message_id, failure_reason=None)
	elif status in {"failed", "unknown"}:
		values["failure_reason"] = reason_message(doc.reason_code)
	else:
		values["failure_reason"] = None
	frappe.db.set_value(ROW, target, values)
	_publish(frappe.db.get_value(ROW, target, ["reference_doctype", "reference_name", "to"], as_dict=True))


def _insert_projection(doc, name):
	import json

	from frappe_whatsapp.native_outbox import project_accepted

	conversation = control._load(doc.conversation)
	reference = (conversation.reference_doctype, conversation.reference_name)
	if not all(reference):
		from crm.api.whatsapp_routing import resolve_reference_for_number

		try:
			found, doctype = resolve_reference_for_number(doc.peer_id)
			reference = (doctype, found) if doctype and found else (None, None)
		except Exception:
			reference = (None, None)
	sent_by = {"Human": "Human", "Bot": "Bot"}.get(doc.origin, "Automation")
	row = project_accepted(
		doc,
		json.loads(doc.payload),
		name=name,
		whatsapp_account=conversation.account_record,
		reference_doctype=reference[0],
		reference_name=reference[1],
		sent_by=sent_by,
		actor=doc.actor_user,
	)
	if row:
		_publish(row)


def native_states(rows):
	"""Intent state for transcript rows still in flight or refused, one query.

	Rows are the thread's own WhatsApp Message dicts; each matching row gets a
	`native` entry the composer uses for its status, Reintentar and Cancelar.
	"""
	if not rows or not _bridge_ready():
		return rows
	pending = {"Queued", "Sending", "failed", "unknown"}
	candidates = {r["name"]: r for r in rows if r.get("type") == "Outgoing" and r.get("status") in pending}
	if not candidates:
		return rows
	projected = {
		name[len(PROJECTED_PREFIX) :]: name for name in candidates if name.startswith(PROJECTED_PREFIX)
	}
	# A plain read: the thread reloads while the dispatcher holds this intent's
	# lock, and a locking read here deadlocks against it (09-15 inbox lesson).
	intents = frappe.db.sql(
		"""SELECT i.name, i.transcript_message, i.state, i.reason_code, i.attempts,
            i.provider_message_id, i.origin, i.actor_user, c.human_owner
        FROM `tabCRM Outbound Intent` i LEFT JOIN `tabCRM Conversation` c ON c.name = i.conversation
        WHERE i.transcript_message IN %(rows)s OR i.name IN %(intents)s""",
		{"rows": tuple(candidates), "intents": tuple(projected) or ("",)},
		as_dict=True,
	)
	user = frappe.session.user
	manager = bool(set(frappe.get_roles(user)) & control.MANAGERS)
	for intent in intents:
		row = candidates.get(intent.transcript_message) or candidates.get(projected.get(intent.name))
		if not row:
			continue
		unsent = not intent.provider_message_id
		# Offer only what the server will allow this user (retry_intent / cancel_intent).
		may_retry = intent.origin == "Automation" or intent.actor_user == user
		may_cancel = (
			intent.human_owner == user
			or manager
			or (intent.origin == "Human" and intent.actor_user == user)
			or (intent.origin == "Automation" and not intent.human_owner)
		)
		row["native"] = {
			"intent": intent.name,
			"state": intent.state,
			"reason": reason_message(intent.reason_code) if intent.reason_code else "",
			"can_retry": bool(
				may_retry
				and unsent
				and intent.state in {"Blocked", "Failed", "Deferred"}
				and intent.attempts < outbox.MAX_ATTEMPTS
			),
			"can_cancel": bool(
				may_cancel
				and unsent
				and intent.state in {"Queued", "Claimed", "Blocked", "Deferred", "Failed"}
			),
		}
	return rows


def _bridge_ready():
	return frappe.db.exists("DocType", outbox.DOCTYPE) and frappe.db.has_column(
		outbox.DOCTYPE, "transcript_message"
	)


@frappe.whitelist()
def thread_control(
	reference_doctype: str, reference_name: str, phone: str, whatsapp_account: str | None = None
):
	"""Who handles this customer's native conversation, for the thread's strip.

	None when no native conversation governs the number: sends then use the
	legacy path and there is no ownership to show.
	"""
	from crm.api.conversation_threads import _detail
	from crm.api.whatsapp import validate_access

	validate_access(reference_doctype, reference_name)
	account = _send_account(whatsapp_account)
	peer = "".join(c for c in str(phone or "") if c.isdigit())
	if reference_doctype not in ("CRM Deal", "CRM Lead") or not _record_number(
		reference_doctype, reference_name, peer
	):
		return None  # only this record's own numbers; never a probe for arbitrary phones
	name = account and peer and governing_conversation(account, peer)
	if not name:
		return None
	doc = control._load(name)
	try:
		control._authorize(doc)
	except frappe.PermissionError:
		return {"name": None, "denied": True}
	detail = _detail(doc)
	owner = detail.get("human_owner")
	return {
		key: detail.get(key)
		for key in (
			"name",
			"control_state",
			"human_owner",
			"generation",
			"provider_control",
			"allowed_actions",
			"manager_reason_required",
			"actor",
			"control_requests",
		)
	} | {
		"owner_name": owner and (frappe.db.get_value("User", owner, "full_name") or owner),
		"account_id": doc.account_id,
	}


def _record_number(doctype, name, peer):
	from crm.api.conversation_threads import PEER_SUFFIX
	from crm.api.whatsapp_contacts import list_numbers

	return bool(peer) and any(n["peer_key"] == peer[-PEER_SUFFIX:] for n in list_numbers(doctype, name))


def usable_send_account(whatsapp_account):
	"""Whether the current user may send from this account right now."""
	try:
		return bool(assert_send_account(whatsapp_account))
	except (frappe.PermissionError, frappe.ValidationError):
		return False


def _send_account(whatsapp_account=None):
	"""The account a send from the thread uses: the chosen one, else the default outgoing."""
	if whatsapp_account:
		return frappe.db.get_value(
			"WhatsApp Account", whatsapp_account, ["name", "phone_id", "mode", "status"], as_dict=True
		)
	from frappe_whatsapp.utils import get_whatsapp_account

	default = get_whatsapp_account(account_type="outgoing")
	return default and frappe.db.get_value(
		"WhatsApp Account", default.name, ["name", "phone_id", "mode", "status"], as_dict=True
	)


def assert_send_account(whatsapp_account):
	"""A thread may choose the account its customer wrote to, within the sender's scope."""
	if not whatsapp_account:
		return None
	account = _send_account(whatsapp_account)
	if not account or account.status != "Active" or not account.phone_id:
		frappe.throw(_("La cuenta de WhatsApp elegida no está disponible."), frappe.ValidationError)
	probe = frappe._dict(
		provider="WhatsApp",
		account_id=account.phone_id,
		shop_key=None,
		reference_doctype=None,
		reference_name=None,
	)
	try:
		control._authorize(probe)
	except frappe.PermissionError:
		frappe.throw(_("No tienes acceso a la cuenta de WhatsApp elegida."), frappe.PermissionError)
	return account.name
