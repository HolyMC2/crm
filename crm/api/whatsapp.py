import json

import frappe
from frappe import _
from frappe.permissions import add_permission, update_permission_property

from crm.api.doc import _assigned_users_for_document as get_assigned_users
from crm.api.outbox_bridge import assert_send_account, person_reply
from crm.fcrm.doctype.crm_notification.crm_notification import notify_user

try:
	# The one answer to «what fills {{n}} for this record», shared with the API send.
	from frappe_whatsapp import template_vars
except ImportError:  # a CRM without frappe_whatsapp has no templates to fill
	template_vars = None

# Marketing Manager added 2026-08-03: they hold _APPROVER_ROLES on the review
# queues (manager-eyes policy) — approving an Inbox Auto Reply whatsapp draft
# routes through inbox.send_message -> validate_access, which threw for a
# Marketing-Manager-only approver.
ALLOWED_WHATSAPP_ROLES = ["System Manager", "Sales Manager", "Marketing Manager", "Sales User"]


def validate_access(reference_doctype=None, reference_name=None, permtype="read"):
	if not any(role in ALLOWED_WHATSAPP_ROLES for role in frappe.get_roles()):
		frappe.throw(_("Only sales users can access WhatsApp features."), frappe.PermissionError)

	if reference_doctype and reference_name:
		if not frappe.db.exists(reference_doctype, reference_name):
			frappe.throw(
				_("Reference document {0} {1} does not exist.").format(reference_doctype, reference_name),
				frappe.DoesNotExistError,
			)
		reference_doc = frappe.get_doc(reference_doctype, reference_name)
		if not reference_doc.has_permission(permtype):
			frappe.throw(
				_("Not permitted to access reference document {0} {1}.").format(
					reference_doctype, reference_name
				),
				frappe.PermissionError,
			)
		return reference_doc

	return None


def validate(doc, method):
	from crm.api.whatsapp_routing import (
		resolve_inbound_reference,
		resolve_reference_for_number,
		verified_receipt_reference,
	)

	ref_type, ref_name = doc.get("reference_doctype"), doc.get("reference_name")
	verified_name, verified_type = verified_receipt_reference(doc)
	if ref_type or ref_name:
		if not ref_type or not ref_name:
			frappe.throw(_("Select both a reference type and record."), frappe.ValidationError)
		if (ref_name, ref_type) != (verified_name, verified_type):
			frappe.get_doc(ref_type, ref_name).check_permission("read")
		return
	if doc.get("type") == "Incoming":
		if verified_type and verified_name:
			doc.reference_doctype, doc.reference_name = verified_type, verified_name
			return
		# Catalog carts/orders bind only to their authenticated receipt's conversation.
		if doc.get("content_type") == "order" or not doc.get("from"):
			return
		# Everything else auto-attaches to the customer's current work (product decision).
		try:
			name, doctype = resolve_inbound_reference(doc.get("from"))
			if doctype and name:
				doc.reference_doctype, doc.reference_name = doctype, name
		except Exception:
			frappe.log_error(frappe.get_traceback(), "CRM WhatsApp: failed to resolve contact from number")
		return
	phone_number = doc.get("to")
	if phone_number:
		try:
			name, doctype = resolve_reference_for_number(phone_number)
			if doctype and name:
				doc.reference_doctype, doc.reference_name = doctype, name
		except Exception:
			frappe.log_error(frappe.get_traceback(), "CRM WhatsApp: failed to resolve contact from number")


def on_update(doc, method):
	from functools import partial

	from crm.permissions.whatsapp_read import publish_message

	# Capture only the technical ID; authorization and binding are re-read after commit.
	frappe.db.after_commit.add(partial(publish_message, doc.name))

	notify_agent(doc)


def notify_agent(doc):
	if doc.type == "Incoming":
		if not doc.reference_doctype or not doc.reference_name:
			return
		doctype = doc.reference_doctype
		if doctype and doctype.startswith("CRM "):
			doctype = doctype[4:].lower()
		safe_reference_name = frappe.utils.escape_html(doc.reference_name)
		notification_text = f"""
            <div class="mb-2 leading-5 text-ink-gray-5">
                <span class="font-medium text-ink-gray-9">{_("You")}</span>
                <span>{_("received a whatsapp message in {0}").format(doctype)}</span>
                <span class="font-medium text-ink-gray-9">{safe_reference_name}</span>
            </div>
        """
		assigned_users = get_assigned_users(doc.reference_doctype, doc.reference_name)
		for user in assigned_users:
			notify_user(
				{
					"owner": doc.owner,
					"assigned_to": user,
					"notification_type": "WhatsApp",
					"message": "",
					"notification_text": notification_text,
					"reference_doctype": "WhatsApp Message",
					"reference_docname": doc.name,
					"redirect_to_doctype": doc.reference_doctype,
					"redirect_to_docname": doc.reference_name,
				}
			)


@frappe.whitelist()
def is_whatsapp_enabled():
	if not frappe.db.exists("DocType", "WhatsApp Settings"):
		return False
	default_outgoing = frappe.get_cached_value(
		"WhatsApp Settings", "WhatsApp Settings", "default_outgoing_account"
	)
	if not default_outgoing:
		return False
	status = frappe.get_cached_value("WhatsApp Account", default_outgoing, "status")
	return status == "Active"


@frappe.whitelist()
def is_whatsapp_installed():
	if not frappe.db.exists("DocType", "WhatsApp Settings"):
		return False
	return True


@frappe.whitelist()
def get_deal_whatsapp_contacts(doctype: str, name: str):
	"""One chat tab per number of an authorized Deal/Lead, owned by CRM.

	The whatsapp_chat extension's copy is retired once native conversations
	exist, which left the Deal conversation without its number switcher.
	"""
	if doctype not in ("CRM Deal", "CRM Lead"):
		frappe.throw(_("Unsupported doctype"), frappe.PermissionError)
	validate_access(doctype, name)
	from crm.api.whatsapp_contacts import list_numbers

	return list_numbers(doctype, name)


@frappe.whitelist()
def get_whatsapp_messages(reference_doctype: str, reference_name: str):
	reference_doc = validate_access(reference_doctype, reference_name)
	# twilio integration app is not compatible with crm app
	# crm has its own twilio integration in built
	if "twilio_integration" in frappe.get_installed_apps():
		return []
	if not frappe.db.exists("DocType", "WhatsApp Message"):
		return []
	from crm.permissions.whatsapp_read import (
		MESSAGE_FIELDS,
		ReadScope,
		readable_field,
		require_reference,
		rows,
	)

	require_reference(reference_doctype, reference_name)
	scope = ReadScope()
	references = [(reference_doctype, reference_name)]
	if reference_doctype == "CRM Deal" and readable_field("CRM Deal", "lead"):
		lead = reference_doc.get("lead")
		if lead and scope.reference("CRM Lead", lead, frappe.session.user):
			references.insert(0, ("CRM Lead", lead))
	messages = []
	for doctype, name in references:
		allowed = []
		for row in rows(
			"WhatsApp Message",
			[["reference_doctype", "=", doctype], ["reference_name", "=", name]],
			MESSAGE_FIELDS,
		):
			if scope.message(row):
				allowed.append(row.name)
		for offset in range(0, len(allowed), 200):
			messages.extend(
				frappe.get_all(
					"WhatsApp Message",
					filters={"name": ["in", allowed[offset : offset + 200]]},
					fields=_wa_message_fields(),
				)
			)

	return enrich_whatsapp_messages(messages)


def enrich_whatsapp_messages(messages: list[dict]) -> list[dict]:
	"""Resolve Template bodies, attach reactions, thread replies, and stamp `from_name`
	on a list of raw WhatsApp Message rows (fields per `_wa_message_fields`). Shared by
	the per-reference thread (`get_whatsapp_messages`) and the reference-less orphan
	thread (doco_marketing `get_unassigned_thread`) so both render templates/replies
	identically — an unresolved Template row has `message=None`, so without this it
	renders as an empty bubble. Reaction rows are folded into their target and dropped
	from the returned list."""
	from frappe.model import get_permitted_fields

	from crm.permissions.whatsapp_read import BATCH_SIZE, MESSAGE_FIELDS, ReadScope, readable_field

	read_scope = ReadScope()
	for offset in range(0, len(messages), BATCH_SIZE):
		ids = [row["name"] for row in messages[offset : offset + BATCH_SIZE]]
		if not ids:
			continue
		for row in frappe.db.get_values(
			"WhatsApp Message", {"name": ["in", ids]}, MESSAGE_FIELDS, as_dict=True
		):
			read_scope.messages[row.name] = row
	messages = [row for row in messages if read_scope.message(read_scope.load_message(row["name"]))]
	# get_all callers include old optional-app brokers. Project their supplied
	# rows using native field levels/masks before enrichment can derive labels.
	permitted = set(get_permitted_fields("WhatsApp Message", permission_type="read"))
	masked = {df.fieldname for df in frappe.get_meta("WhatsApp Message").get_masked_fields()}
	for row in messages:
		for field in tuple(row):
			if field not in permitted or field in masked:
				row[field] = None
	body_readable = readable_field("WhatsApp Message", "message")
	template_messages = [
		message
		for message in messages
		if body_readable and message["message_type"] == "Template" and message.get("template")
	]

	# Iterate through template messages
	for template_message in template_messages:
		# Find the template that this message is using
		if not frappe.db.exists("WhatsApp Templates", template_message["template"]):
			continue
		template = frappe.get_doc("WhatsApp Templates", template_message["template"])

		if template:
			template_message["template_name"] = template.template_name
			# Corrupt stored params must not 500 the WHOLE thread (deal AND
			# orphan views share this enricher) — skip substitution, keep the
			# raw template body as the bubble.
			if template_message["template_parameters"]:
				try:
					parameters = json.loads(template_message["template_parameters"])
					template.template = parse_template_parameters(template.template, parameters)
				except (ValueError, TypeError):
					pass

			template_message["template"] = template.template
			if template_message["template_header_parameters"]:
				try:
					header_parameters = json.loads(template_message["template_header_parameters"])
					template.header = parse_template_parameters(template.header, header_parameters)
				except (ValueError, TypeError):
					pass
			template_message["header"] = template.header
			template_message["footer"] = template.footer

	# Filter messages to get only reaction messages
	reaction_messages = [message for message in messages if message["content_type"] == "reaction"]
	reaction_messages.reverse()

	# Iterate through reaction messages
	for reaction_message in reaction_messages:
		# Find the message that this reaction is reacting to
		reacted_message = next(
			(m for m in messages if m["message_id"] == reaction_message["reply_to_message_id"]),
			None,
		)

		# If the reacted message is found, add the reaction to it
		if reacted_message:
			reacted_message["reaction"] = reaction_message["message"]

	for message in messages:
		from_name = (
			get_from_name(message, read_scope=read_scope) if message["type"] == "Incoming" else _("You")
		)
		message["from_name"] = from_name
	# Filter messages to get only replies
	reply_messages = [message for message in messages if message["is_reply"]]

	# Iterate through reply messages
	for reply_message in reply_messages:
		# Find the message that this message is replying to
		replied_message = next(
			(m for m in messages if m["message_id"] == reply_message["reply_to_message_id"]),
			None,
		)

		# If the replied message is found, add the reply details to the reply message
		if replied_message:
			# reply_to_from labels the REPLIED-TO sender — derive it from the
			# replied-to message, not the replying one.
			from_name = (
				get_from_name(replied_message, read_scope=read_scope)
				if replied_message["type"] == "Incoming"
				else _("You")
			)
			message = replied_message["message"]
			if replied_message["message_type"] == "Template":
				message = replied_message["template"]
			reply_message["reply_message"] = message
			reply_message["header"] = replied_message.get("header") or ""
			reply_message["footer"] = replied_message.get("footer") or ""
			reply_message["reply_to"] = replied_message["name"]
			reply_message["reply_to_type"] = replied_message["type"]
			reply_message["reply_to_from"] = from_name

	from crm.api.outbox_bridge import native_states

	return native_states([message for message in messages if message["content_type"] != "reaction"])


@frappe.whitelist()
def create_whatsapp_message(
	reference_doctype: str,
	reference_name: str,
	message: str,
	to: str,
	attach: str,
	reply_to: str,
	content_type: str = "text",
	canned: str = "",
	whatsapp_account: str = "",
):
	validate_access(reference_doctype, reference_name)

	doc = frappe.new_doc("WhatsApp Message")
	# Reply from the business number the customer wrote to; default account otherwise.
	doc.whatsapp_account = assert_send_account(whatsapp_account)

	if reply_to:
		if not frappe.db.exists("WhatsApp Message", reply_to):
			frappe.throw(_("Referenced WhatsApp message does not exist."), frappe.DoesNotExistError)
		reply_doc = frappe.get_doc("WhatsApp Message", reply_to)
		if not reply_doc.has_permission("read"):
			frappe.throw(
				_("Not permitted to access the referenced WhatsApp message."), frappe.PermissionError
			)
		validate_access(reply_doc.reference_doctype, reply_doc.reference_name)
		doc.update(
			{
				"is_reply": True,
				"reply_to_message_id": reply_doc.message_id,
			}
		)

	doc.update(
		{
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"message": message or attach,
			"to": to,
			"attach": attach,
			"content_type": content_type,
			# Provenance (Phase 1): a human typed this from the inbox.
			"doco_sent_by_type": "Human",
			"doco_actor_user": frappe.session.user,
		}
	)
	if canned:
		# Sent verbatim from a saved quick reply — still Human, but tagged canned.
		doc.doco_automation_source = f"canned:{canned}"
	with person_reply():
		doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist()
def send_whatsapp_template(
	reference_doctype: str,
	reference_name: str,
	template: str,
	to: str,
	body_param: dict | str | None = None,
	attach: str | None = None,
	whatsapp_account: str = "",
):
	validate_access(reference_doctype, reference_name)

	doc = frappe.new_doc("WhatsApp Message")
	doc.whatsapp_account = assert_send_account(whatsapp_account)
	doc.update(
		{
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"message_type": "Template",
			"message": "Template message",
			"content_type": "text",
			"use_template": True,
			"template": template,
			"to": to,
			# Provenance (Phase 1): a human picked + sent this template.
			"doco_sent_by_type": "Human",
			"doco_actor_user": frappe.session.user,
		}
	)
	# Media header: frappe_whatsapp's send_template() fills the template's IMAGE/
	# DOCUMENT header component from doc.attach when the template's header_type is set.
	# Lets a (window-independent) template carry a photo.
	if attach:
		doc.attach = attach
	# Reviewed/edited variable values from the composer's template review step.
	# frappe_whatsapp's send_template() consumes `body_param` verbatim (its values in
	# {{1}},{{2}}… order) instead of re-resolving the mapped ref-doc fields, so what the
	# agent reviewed is exactly what Meta receives — still a compliant template send.
	if body_param:
		if isinstance(body_param, str):
			try:
				body_param = json.loads(body_param)
			except (ValueError, TypeError):
				frappe.throw(_("Invalid template parameters."))
		if not isinstance(body_param, dict):
			frappe.throw(_("Template parameters must be a mapping."))
		doc.body_param = json.dumps({str(k): ("" if v is None else str(v)) for k, v in body_param.items()})
	with person_reply():
		doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist()
def get_template_preview(reference_doctype: str, reference_name: str, template: str):
	"""Resolve an approved WhatsApp template against the reference doc for the
	composer's review step: the body, each {{n}} placeholder with the ref-doc field it
	maps to and that field's current value, plus footer/header. The agent reviews and
	may override any value before the (still-compliant) template send."""
	validate_access(reference_doctype, reference_name)
	tpl = frappe.get_doc("WhatsApp Templates", template)
	body = tpl.template or ""

	# frappe_whatsapp's template contract resolves the mapping (field_names, or the
	# template's shipped default) against the record exactly as the send will. A
	# slot it cannot fill stays empty for the agent — Meta sample values are
	# never offered as if they were the customer's data.
	result = template_vars.resolve(template, frappe.get_doc(reference_doctype, reference_name))
	variables = [
		{
			"index": i,
			"field": result.tokens[i - 1] if i - 1 < len(result.tokens) else "",
			"label": result.labels.get(str(i)) or _("Variable {0}").format(i),
			"value": result.values.get(str(i), ""),
		}
		for i in template_vars.placeholders(body)
	]
	return {
		"name": tpl.name,
		"body": body,
		"rendered": template_vars.render(body, result.values),
		"footer": tpl.get("footer") or "",
		"header_type": tpl.get("header_type") or "",
		"language_code": tpl.get("language_code") or "",
		"variables": variables,
		"missing": [m["label"] for m in result.missing],
	}


# Field types worth offering as a template-variable source in the mapping dropdown
# (scalars that render as a short string). Tables/HTML/attachments are excluded.
_MAPPABLE_FIELDTYPES = {
	"Data",
	"Select",
	"Link",
	"Small Text",
	"Text",
	"Read Only",
	"Phone",
	"Int",
	"Float",
	"Currency",
	"Percent",
	"Date",
	"Datetime",
	"Time",
}


# Curation (ROADMAP #7): the raw meta dump offered ~83 options — reviewers only
# ever map person/identity fields. Own fields must match one of these substrings
# to appear; tokens already SAVED on any template stay visible so editing an
# existing map never loses its selection. Resolution (`_token_allowed`) is
# unchanged — this only trims the picker.
_CURATED_FIELD_HINTS = (
	"name",
	"mobile",
	"phone",
	"email",
	"status",
	"source",
	"device",
	"folio",
	"organization",
	"territory",
)


def _tokens_in_use() -> set:
	"""Every token currently saved on a template's field_names (CSV)."""
	used = set()
	for csv in frappe.get_all(
		"WhatsApp Templates", filters={"field_names": ["is", "set"]}, pluck="field_names"
	):
		used.update(t.strip() for t in str(csv or "").split(",") if t.strip())
	return used


@frappe.whitelist()
def get_template_field_options(reference_doctype: str):
	"""Candidate ERPNext fields for the template-variable mapping dropdown: the
	reference doctype's CURATED scalar fields plus one level of dotted Link
	traversal for the obvious links (so e.g. a Deal can map {{1}} to its
	contact's name). [{value, label, group}] — value is the field_names token."""
	validate_access()
	if not frappe.db.exists("DocType", reference_doctype):
		return []
	meta = frappe.get_meta(reference_doctype)
	in_use = _tokens_in_use()
	# Values the apps compute for this record (first name, repair folio, tracking
	# link…) — the same keys the automatic sends use.
	opts = [
		{"value": key, "label": label, "group": _("Automatic")}
		for key, label in (template_vars.context_keys(reference_doctype) if template_vars else {}).items()
	]
	for df in meta.fields:
		if (
			df.fieldtype in _MAPPABLE_FIELDTYPES
			and not df.get("hidden")
			and (df.fieldname in in_use or any(h in df.fieldname for h in _CURATED_FIELD_HINTS))
		):
			opts.append(
				{"value": df.fieldname, "label": _(df.label or df.fieldname), "group": reference_doctype}
			)
	# one-level dotted for Link fields → that target's name-ish + phone-ish fields
	for df in meta.fields:
		if df.fieldtype == "Link" and df.options and frappe.db.exists("DocType", df.options):
			try:
				sub = frappe.get_meta(df.options)
			except Exception:
				continue
			for sdf in sub.fields:
				if (
					sdf.fieldtype in ("Data", "Phone", "Read Only", "Select")
					and not sdf.get("hidden")
					and (
						"name" in (sdf.fieldname or "")
						or "mobile" in (sdf.fieldname or "")
						or "phone" in (sdf.fieldname or "")
						or "email" in (sdf.fieldname or "")
					)
				):
					opts.append(
						{
							"value": f"{df.fieldname}.{sdf.fieldname}",
							"label": f"{_(df.label or df.fieldname)} → {_(sdf.label or sdf.fieldname)}",
							"group": _(df.label or df.fieldname),
						}
					)
	# resurrect any saved token the hints missed (edited legacy maps) — but only
	# resolution-whitelisted ones; the picker must never widen _token_allowed
	have = {o["value"] for o in opts}
	for tok in sorted(in_use - have):
		if _token_allowed(reference_doctype, tok):
			opts.append({"value": tok, "label": tok, "group": _("En uso")})
	return opts


def _token_allowed(reference_doctype: str, token: str) -> bool:
	"""Whitelist a field_names token against exactly what get_template_field_options
	offers: the ref doctype's own mappable scalar fields, and one-level dotted
	traversal only into a Link target's name/mobile/phone/email-ish Data-like fields.
	Prevents resolve_field_value from being turned into an arbitrary-column reader
	(e.g. `deal_owner.api_key`) on any Link-reachable doctype."""
	try:
		meta = frappe.get_meta(reference_doctype)
	except Exception:
		return False
	if template_vars and token.partition(":")[0] in template_vars.context_keys(reference_doctype):
		return True
	if "." in token:
		link_field, sub = token.split(".", 1)
		df = meta.get_field(link_field)
		if not df or df.fieldtype != "Link" or not df.options:
			return False
		if not frappe.db.exists("DocType", df.options):
			return False
		try:
			sdf = frappe.get_meta(df.options).get_field(sub)
		except Exception:
			return False
		if not sdf or sdf.get("hidden"):
			return False
		if sdf.fieldtype not in ("Data", "Phone", "Read Only", "Select"):
			return False
		return any(k in (sub or "") for k in ("name", "mobile", "phone", "email"))
	df = meta.get_field(token)
	return bool(df and df.fieldtype in _MAPPABLE_FIELDTYPES and not df.get("hidden"))


def _resolve_dotted(reference_doctype: str, reference_name: str, token: str) -> str:
	"""Resolve a field_names token (plain or one-level dotted) to a formatted value."""
	if not _token_allowed(reference_doctype, token):
		return ""
	doc = frappe.get_doc(reference_doctype, reference_name)
	if template_vars and token.partition(":")[0] in template_vars.context_keys(reference_doctype):
		return template_vars.value_of(doc, token)
	if "." in token:
		link_field, sub = token.split(".", 1)
		df = doc.meta.get_field(link_field)
		link_name = doc.get(link_field)
		if df and df.options and link_name:
			try:
				return str(frappe.db.get_value(df.options, link_name, sub) or "")
			except Exception:
				return ""
		return ""
	try:
		return str(doc.get_formatted(token) or "")
	except Exception:
		return str(doc.get(token) or "")


@frappe.whitelist()
def resolve_field_value(reference_doctype: str, reference_name: str, fieldname: str):
	"""Value for a single mapping choice — used when the dropdown changes the source
	field, to re-prefill the variable from the live reference doc."""
	validate_access(reference_doctype, reference_name)
	return {"value": _resolve_dotted(reference_doctype, reference_name, fieldname)}


@frappe.whitelist()
def set_template_field_map(template: str, field_names: str = ""):
	"""Persist the template's default variable→field mapping (field_names CSV). Uses
	db.set_value so it does NOT trigger frappe_whatsapp's on_update → Meta edit (a
	mapping change is local metadata, not a template-body resubmit). Gated to the
	roles that own template config."""
	if not set(frappe.get_roles()).intersection(["System Manager", "Sales Manager"]):
		frappe.throw(_("Solo un gestor puede guardar el mapeo predeterminado."), frappe.PermissionError)
	if not frappe.db.exists("WhatsApp Templates", template):
		frappe.throw(_("Plantilla no encontrada."))
	frappe.db.set_value("WhatsApp Templates", template, "field_names", (field_names or "").strip())
	return {"ok": True}


@frappe.whitelist()
def react_on_whatsapp_message(emoji: str, reply_to_name: str):
	validate_access()
	if not frappe.db.exists("WhatsApp Message", reply_to_name):
		frappe.throw(_("Referenced WhatsApp message does not exist."), frappe.DoesNotExistError)
	reply_to_doc = frappe.get_doc("WhatsApp Message", reply_to_name)

	if not reply_to_doc.has_permission("read"):
		frappe.throw(_("Not permitted to access the referenced WhatsApp message."), frappe.PermissionError)

	validate_access(reply_to_doc.reference_doctype, reply_to_doc.reference_name)

	to = (reply_to_doc.type == "Incoming" and reply_to_doc.get("from")) or reply_to_doc.to
	doc = frappe.new_doc("WhatsApp Message")
	doc.update(
		{
			"reference_doctype": reply_to_doc.reference_doctype,
			"reference_name": reply_to_doc.reference_name,
			"message": emoji,
			"to": to,
			"reply_to_message_id": reply_to_doc.message_id,
			"content_type": "reaction",
			# A reaction belongs to the conversation of the message it reacts to.
			"whatsapp_account": reply_to_doc.whatsapp_account,
		}
	)
	with person_reply():
		doc.insert(ignore_permissions=True)
	return doc.name


QUICK_REPLY_SETTINGS_FIELD = "quick_replies"
QUICK_TEMPLATE_LIMIT = 6


@frappe.whitelist()
def get_quick_replies():
	"""Team-shared canned WhatsApp replies, stored as JSON on FCRM Settings."""
	validate_access()
	raw = frappe.db.get_single_value("FCRM Settings", QUICK_REPLY_SETTINGS_FIELD)
	if not raw:
		return []
	try:
		data = json.loads(raw)
	except (ValueError, TypeError):
		return []
	replies = []
	for item in data if isinstance(data, list) else []:
		if not isinstance(item, dict):
			continue
		text = (item.get("text") or "").strip()
		if not text:
			continue
		label = (item.get("label") or "").strip() or text[:24]
		replies.append({"label": label, "text": text})
	return replies


@frappe.whitelist()
def save_quick_replies(quick_replies):
	"""Replace the team quick-reply list. Editable by any WhatsApp-enabled CRM role."""
	if not set(frappe.get_roles()).intersection(ALLOWED_WHATSAPP_ROLES):
		frappe.throw(_("Not permitted to edit quick replies."), frappe.PermissionError)

	if isinstance(quick_replies, str):
		try:
			quick_replies = json.loads(quick_replies)
		except (ValueError, TypeError):
			frappe.throw(_("Invalid quick replies payload."))

	cleaned = []
	for item in quick_replies if isinstance(quick_replies, list) else []:
		if not isinstance(item, dict):
			continue
		text = (item.get("text") or "").strip()
		if not text:
			continue
		label = (item.get("label") or "").strip() or text[:24]
		cleaned.append({"label": label[:60], "text": text[:1000]})
		if len(cleaned) >= 50:
			break

	frappe.db.set_single_value("FCRM Settings", QUICK_REPLY_SETTINGS_FIELD, json.dumps(cleaned))
	return cleaned


@frappe.whitelist()
def get_quick_templates(reference_doctype: str = ""):
	"""Approved templates for quick access: all when few, else the most-used."""
	validate_access()
	if not frappe.db.exists("DocType", "WhatsApp Templates"):
		return []

	templates = frappe.get_all(
		"WhatsApp Templates",
		filters={"status": "APPROVED", "for_doctype": ["in", [reference_doctype, ""]]},
		fields=["name", "template", "footer"],
	)
	if len(templates) <= QUICK_TEMPLATE_LIMIT:
		return sorted(templates, key=lambda t: (t.name or "").lower())

	# Raw SQL for the aggregate: newer frappe rejects "count(name) as uses" passed as a
	# field STRING to get_all (SQL-function-in-string guard) -> ValidationError that broke
	# fcrm load once there were more approved templates than the limit.
	usage = dict(
		frappe.db.sql(
			"""SELECT template, COUNT(name) FROM `tabWhatsApp Message`
			   WHERE use_template = 1 AND COALESCE(template, '') != ''
			   GROUP BY template"""
		)
	)
	templates.sort(key=lambda t: (usage.get(t.name, 0), (t.name or "").lower()), reverse=True)
	return templates[:QUICK_TEMPLATE_LIMIT]


def _wa_message_fields():
	"""WhatsApp Message fields for the thread. The doco_* provenance columns are
	custom (added by a crm patch) — guard on has_column so the read endpoint
	survives a code-before-migrate window or a site where the patch hasn't run."""
	fields = [
		"name",
		"type",
		"to",
		"from",
		"content_type",
		"message_type",
		"attach",
		"template",
		"use_template",
		"message_id",
		"is_reply",
		"reply_to_message_id",
		"creation",
		"message",
		"status",
		"reference_doctype",
		"reference_name",
		"template_parameters",
		"template_header_parameters",
	]
	if frappe.db.has_column("WhatsApp Message", "doco_sent_by_type"):
		fields += ["doco_sent_by_type", "doco_actor_user", "doco_automation_source", "doco_bot"]
	# Meta's async failure explanation (webhook errors[] — e.g. "131047 ·
	# Re-engagement message"); fork field, guarded for pre-migrate windows.
	if frappe.db.has_column("WhatsApp Message", "failure_reason"):
		fields += ["failure_reason"]
	return fields


def parse_template_parameters(string, parameters):
	for i, parameter in enumerate(parameters, start=1):
		placeholder = "{{" + str(i) + "}}"
		string = string.replace(placeholder, str(parameter))

	return string


def get_from_name(message, *, read_scope=None):
	from crm.permissions.whatsapp_read import ReadScope, readable_field, readable_reference_fields

	read_scope = read_scope or ReadScope()
	metadata = read_scope.load_message(message.get("name"))
	if not read_scope.message(metadata):
		return ""
	fallback = (metadata.get("from") or "") if readable_field("WhatsApp Message", "from") else ""
	ref_dt, ref_dn = metadata.reference_doctype, metadata.reference_name
	if not readable_reference_fields() or not ref_dt or not ref_dn:
		return fallback
	key = (ref_dt, ref_dn)
	if key not in read_scope.records:
		read_scope.records[key] = frappe.get_doc(ref_dt, ref_dn)
	doc = read_scope.records[key]
	if ref_dt == "CRM Deal":
		from crm.fcrm.doctype.crm_deal.api import get_deal_contacts

		if ref_dn not in read_scope.contacts:
			read_scope.contacts[ref_dn] = get_deal_contacts(ref_dn)
		for contact in read_scope.contacts[ref_dn]:
			if not contact.get("is_primary"):
				continue
			for field in ("full_name", "mobile_no"):
				if readable_field("CRM Contacts", field, parenttype=ref_dt) and contact.get(field):
					return contact[field]
		if not doc.get("contacts") and readable_field(ref_dt, "lead_name") and doc.get("lead_name"):
			return doc.lead_name
		return fallback
	return (
		" ".join(
			doc.get(field)
			for field in ("first_name", "last_name")
			if readable_field(ref_dt, field) and doc.get(field)
		)
		or fallback
	)


def after_app_install(app_name):
	# CRM can precede the optional connector. Its own after_install handles the
	# opposite order; both use the same tenant-customizable native role defaults.
	if app_name == "frappe_whatsapp":
		add_roles()


def add_roles():
	if "frappe_whatsapp" not in frappe.get_installed_apps():
		return

	role_list = ["Sales Manager", "Sales User"]
	doctypes = ["WhatsApp Message", "WhatsApp Templates", "WhatsApp Settings"]
	for doctype in doctypes:
		for role in role_list:
			if frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role}):
				continue
			add_permission(doctype, role, 0, "write")
			if doctype == "WhatsApp Message":
				update_permission_property(doctype, role, 0, "read", 1)
			update_permission_property(doctype, role, 0, "create", 1)
			update_permission_property(doctype, role, 0, "delete", 1)
			update_permission_property(doctype, role, 0, "share", 1)
			update_permission_property(doctype, role, 0, "email", 1)
			update_permission_property(doctype, role, 0, "print", 1)
			update_permission_property(doctype, role, 0, "report", 1)
			update_permission_property(doctype, role, 0, "export", 1)
