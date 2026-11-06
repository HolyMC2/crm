"""Event producers (doc_events) and payload builders for CRM integration webhooks.

Producers only record *that* something happened: record type, name and a version
for deduplication. Builders run later in the delivery worker as the connection's
user and reuse the inbox/outbox read policy, so an event never shows a field, a
message or a conversation that the same user could not read through the API.
"""

import json

import frappe
from frappe import _
from frappe.model import get_permitted_fields, no_value_fields, table_fields
from frappe.utils import cint, cstr, flt, get_datetime, get_time, getdate

from crm.integrations.webhooks import Skip, emit

CONVERSATION = "CRM Conversation"
CONTROL_EVENT = "CRM Conversation Control Event"
MESSAGE_DOCTYPES = ("CRM Webchat Message", "WhatsApp Message", "Messenger Message", "CRM Channel Message")
RECORD_EVENTS = {"Contact": "contact", "CRM Lead": "lead", "CRM Deal": "deal"}


# ---------------------------------------------------------------- producers


def on_conversation_insert(doc, method=None):
	emit("conversation.created", CONVERSATION, doc.name, version="created")


def on_control_event(doc, method=None):
	"""Every control command writes one immutable event row: map it to status_changed/updated."""
	try:
		before = json.loads(doc.previous_json or "{}")
		after = json.loads(doc.result_json or "{}")
	except ValueError:
		before, after = {}, {}
	if doc.from_generation == doc.to_generation and doc.action != "request":
		return  # replay or no-op command: nothing changed
	# a take moves the owner without moving the state (Human -> Human): that is a handover too
	state_changed = any(before.get(f) != after.get(f) for f in ("control_state", "human_owner"))
	context = {
		"action": doc.action,
		"origin": doc.origin,
		"actor": doc.actor_user,
		"from_state": before.get("control_state"),
		"to_state": after.get("control_state"),
		"from_owner": before.get("human_owner"),
		"to_owner": after.get("human_owner"),
		"generation": doc.to_generation,
	}
	event = "conversation.status_changed" if state_changed else "conversation.updated"
	emit(event, CONVERSATION, doc.conversation, version=doc.name, context=context)


def conversation_metadata_changed(name, fields):
	"""Broker metadata writes (team, links, automation state) skip doc hooks; the broker calls this."""
	emit(
		"conversation.updated",
		CONVERSATION,
		name,
		version=frappe.generate_hash(length=12),
		context={"action": "metadata", "fields": sorted(fields)},
	)


def on_message_insert(doc, method=None):
	if doc.doctype == "WhatsApp Message" and doc.get("type") not in ("Incoming", "Outgoing"):
		return
	if doc.doctype == "Messenger Message" and (doc.get("event_type") or "message") not in ("message", "echo"):
		return
	emit("message.created", doc.doctype, doc.name, version="created")


def on_message_update(doc, method=None):
	if doc.doctype != "WhatsApp Message" or not doc.has_value_changed("status") or doc.is_new():
		return
	emit(
		"message.updated",
		doc.doctype,
		doc.name,
		version="status:" + str(doc.status),
		context={"status": doc.status},
	)


def on_intent_update(doc, method=None):
	if not doc.has_value_changed("state"):
		return
	emit(
		"outbound.updated", doc.doctype, doc.name, version="state:" + str(doc.state) + ":" + str(doc.modified)
	)


def on_record_insert(doc, method=None):
	prefix = RECORD_EVENTS.get(doc.doctype)
	if prefix:
		emit(prefix + ".created", doc.doctype, doc.name, version="created", actor=frappe.session.user)


def on_record_update(doc, method=None):
	prefix = RECORD_EVENTS.get(doc.doctype)
	if not prefix:
		return
	before = doc.get_doc_before_save()
	if before is None:
		return
	version = str(doc.modified)
	if prefix in ("lead", "deal") and doc.has_value_changed("status"):
		emit(
			prefix + ".status_changed",
			doc.doctype,
			doc.name,
			version="status:" + version,
			context={"from_status": before.get("status"), "to_status": doc.get("status")},
			actor=frappe.session.user,
		)
	changed = changed_fields(before, doc)
	if changed:
		emit(
			prefix + ".updated",
			doc.doctype,
			doc.name,
			version=version,
			context={"fields": changed},
			actor=frappe.session.user,
		)


def _value(df, value):
	"""A field's stored meaning: an unsaved "" equals NULL, "2026-01-02" equals a date."""
	if value in (None, ""):
		return None
	if df.fieldtype == "Date":
		return str(getdate(value))
	if df.fieldtype == "Datetime":
		return str(get_datetime(value))
	if df.fieldtype == "Time":
		return str(get_time(value))
	if df.fieldtype in ("Check", "Int"):
		return cint(value)
	if df.fieldtype in ("Float", "Currency", "Percent"):
		return flt(value)
	return cstr(value)


def _rows(meta, rows):
	fields = [df for df in meta.fields if df.fieldname and df.fieldtype not in no_value_fields]
	return [tuple(_value(df, row.get(df.fieldname)) for df in fields) for row in rows or []]


def changed_fields(before, doc):
	"""Fields whose stored value this save changes (child tables by their rows'
	content), never Password fields."""
	out = []
	for df in doc.meta.fields:
		if not df.fieldname or df.fieldtype == "Password":
			continue
		if df.fieldtype in table_fields:
			meta = frappe.get_meta(df.options)
			if _rows(meta, before.get(df.fieldname)) != _rows(meta, doc.get(df.fieldname)):
				out.append(df.fieldname)
		elif df.fieldtype not in no_value_fields and _value(df, before.get(df.fieldname)) != _value(
			df, doc.get(df.fieldname)
		):
			out.append(df.fieldname)
	return sorted(out)


def on_inquiry_insert(doc, method=None):
	emit("inquiry.created", doc.doctype, doc.name, version="created")


# ---------------------------------------------------------------- builders


def _permitted(fn):
	try:
		return fn()
	except (frappe.PermissionError, frappe.DoesNotExistError):
		raise Skip(_("The connection's user may not read this record.")) from None


NOTE = "CRM Conversation Note"
RATING = "CRM Conversation Rating"


def build_conversation(event, doctype, name, context):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	row = None
	if doctype == NOTE:
		row = frappe.db.get_value(
			NOTE, name, ["conversation", "author", "content", "mentions", "creation"], as_dict=True
		)
	elif doctype == RATING:
		row = frappe.db.get_value(
			RATING,
			name,
			["conversation", "status", "rating", "comment", "human_owner", "rated_at"],
			as_dict=True,
		)
	if doctype in (NOTE, RATING) and not row:
		raise Skip(_("The record is gone."))
	conversation = row.conversation if row else name

	def view():
		doc = control._load(conversation)
		control._authorize(doc)
		if threads._private_peer(doc.provider, doc.peer_id):
			control._deny()
		return threads._detail(doc)

	data = {"conversation": _permitted(view)}
	if event == "conversation.status_changed" or event == "conversation.updated":
		data["change"] = {k: v for k, v in context.items() if v is not None}
	elif event == "conversation.reply_overdue":
		data["waiting"] = {"since": context.get("waiting_since"), "goal_minutes": context.get("goal_minutes")}
	if doctype == NOTE:
		data["note"] = {
			"id": name,
			"author": row.author,
			"content": row.content,
			"mentions": json.loads(row.mentions) if row.mentions else [],
			"created_at": str(row.creation),
		}
	elif doctype == RATING:
		data["rating"] = {
			"id": name,
			"rating": row.rating,
			"comment": row.comment or "",
			"agent": row.human_owner,
			"rated_at": str(row.rated_at) if row.rated_at else None,
		}
	return data


def message_identity(doctype, name):
	"""(provider, account_id, peer_id) of one stored message, or None when it is not a customer message."""
	if doctype == "CRM Webchat Message":
		row = frappe.db.get_value(doctype, name, ["channel", "peer_id", "conversation"], as_dict=True)
		if not row:
			return None
		account = frappe.db.get_value("CRM Webchat Channel", row.channel, "account_id")
		return ("Webchat", account, row.peer_id) if account and row.peer_id else None
	if doctype == "CRM Channel Message":
		row = frappe.db.get_value(doctype, name, ["integration", "peer_id"], as_dict=True)
		account = row and frappe.db.get_value("CRM Integration", row.integration, "channel_account_id")
		return ("API", account, row.peer_id) if account else None
	if doctype == "WhatsApp Message":
		row = frappe.db.get_value(doctype, name, ["type", "from", "to", "whatsapp_account"], as_dict=True)
		if not row or not row.whatsapp_account:
			return None
		phone_id = frappe.db.get_value("WhatsApp Account", row.whatsapp_account, "phone_id")
		peer = row["from"] if row.type == "Incoming" else row.to
		return (
			("WhatsApp", phone_id, "".join(c for c in str(peer or "") if c.isdigit()))
			if phone_id and peer
			else None
		)
	if doctype == "Messenger Message":
		row = frappe.db.get_value(doctype, name, ["page_id", "psid", "platform"], as_dict=True)
		if not row or not row.psid:
			return None
		if row.platform == "Instagram":
			page = frappe.db.get_value("Messenger Page", {"page_id": row.page_id}, "ig_account_id")
			return ("Instagram", page, row.psid) if page else None
		return ("Messenger", row.page_id, row.psid)
	return None


def _existing_conversation(provider, account_id, peer_id):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	if provider == "WhatsApp":
		rows = frappe.get_all(
			CONVERSATION,
			filters={
				"provider": provider,
				"account_id": account_id,
				"peer_id": ["like", "%" + peer_id[-threads.PEER_SUFFIX :]],
			},
			pluck="name",
			order_by="modified desc",
			limit=1,
		)
		return rows[0] if rows else None
	try:
		name = control.conversation_key(provider, account_id, peer_id)
	except frappe.ValidationError:
		return None
	return name if frappe.db.exists(CONVERSATION, name) else None


def build_message(event, doctype, name, context):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	identity = message_identity(doctype, name)
	if not identity:
		raise Skip(_("Not a customer message."))
	provider, account_id, peer_id = identity
	conversation = _existing_conversation(provider, account_id, peer_id)

	def view():
		doc = control._load(conversation) if conversation else None
		if threads._private_peer(provider, peer_id):
			control._deny()
		scope = threads._scope(provider, account_id, doc=doc)
		row = threads.message_metadata(scope, name)
		if not row:
			control._deny()
		same = (doc.reference_doctype, doc.reference_name) if doc and doc.reference_doctype else None
		if not threads._source_allowed(row, same):
			control._deny()
		return threads._message(scope, row), (threads._detail(doc) if doc else None)

	message, detail = _permitted(view)
	message.update({"provider": provider, "doctype": doctype})
	data = {
		"message": message,
		"conversation": detail,
		"thread": {"provider": provider, "account_id": account_id, "peer_id": peer_id},
	}
	if event == "message.updated":
		data["change"] = context
	return data


def build_outbound(event, doctype, name, context):
	from crm.api import outbox

	return {"intent": _permitted(lambda: outbox.get_intent(name))}


def _record(doctype, name):
	def view():
		doc = frappe.get_doc(doctype, name)
		if not frappe.has_permission(doctype, "read", doc=doc, user=frappe.session.user):
			raise frappe.PermissionError
		return doc

	doc = _permitted(view)
	allowed = set(get_permitted_fields(doctype, user=frappe.session.user) or [])
	allowed |= {"name", "creation", "modified", "owner", "modified_by"}
	allowed -= {f.fieldname for f in doc.meta.fields if f.fieldtype == "Password"}
	out = {}
	for key, value in doc.as_dict(no_nulls=True).items():
		if key not in allowed or key.startswith("_"):
			continue
		if isinstance(value, list):
			value = [
				{
					k: v
					for k, v in row.items()
					if not k.startswith("_") and k not in ("doctype", "parent", "parentfield", "parenttype")
				}
				for row in value
			]
		out[key] = value
	return out


def build_record(event, doctype, name, context):
	data = {"record": _record(doctype, name), "doctype": doctype}
	if context:
		data["change"] = context
	return data


def build_assistant(event, doctype, name, context):
	builder = frappe.get_hooks("crm_integration_assistant_payload")
	if not builder:
		raise Skip(_("The business assistant is not installed."))
	return frappe.get_attr(builder[-1])(event, doctype, name, context)


def build_document(event, doctype, name, context):
	from crm.integrations import documents

	return documents.build(event, doctype, name, context)


BUILDERS = {
	"document": build_document,
	"conversation": build_conversation,
	"message": build_message,
	"outbound": build_outbound,
	"contact": build_record,
	"lead": build_record,
	"deal": build_record,
	"inquiry": build_record,
	"assistant": build_assistant,
}
