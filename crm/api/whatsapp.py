import json

import frappe
from frappe import _
from frappe.permissions import add_permission, update_permission_property

from crm.api.doc import get_assigned_users
from crm.fcrm.doctype.crm_notification.crm_notification import notify_user
from crm.integrations.api import get_contact_lead_or_deal_from_number

ALLOWED_WHATSAPP_ROLES = ["System Manager", "Sales Manager", "Sales User"]


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
	phone_number = doc.get("from") if doc.type == "Incoming" else doc.get("to")
	if phone_number:
		try:
			name, doctype = get_contact_lead_or_deal_from_number(phone_number)
			if doctype and name is not None:
				doc.reference_doctype = doctype
				doc.reference_name = name
		except Exception:
			frappe.log_error(frappe.get_traceback(), "CRM WhatsApp: failed to resolve contact from number")


def on_update(doc, method):
	# after_commit so the frontend's refetch (triggered by this event) reads the
	# COMMITTED row — without it the publish races the transaction and the UI shows
	# stale data until a manual F5.
	frappe.publish_realtime(
		"whatsapp_message",
		{
			"reference_doctype": doc.reference_doctype,
			"reference_name": doc.reference_name,
		},
		after_commit=True,
	)

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
					"message": doc.message,
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
def get_whatsapp_messages(reference_doctype: str, reference_name: str):
	reference_doc = validate_access(reference_doctype, reference_name)
	# twilio integration app is not compatible with crm app
	# crm has its own twilio integration in built
	if "twilio_integration" in frappe.get_installed_apps():
		return []
	if not frappe.db.exists("DocType", "WhatsApp Message"):
		return []
	messages = []
	wa_fields = _wa_message_fields()

	if reference_doctype == "CRM Deal":
		lead = reference_doc.get("lead")
		if lead:
			validate_access("CRM Lead", lead)
			messages = frappe.get_all(
				"WhatsApp Message",
				filters={
					"reference_doctype": "CRM Lead",
					"reference_name": lead,
				},
				fields=wa_fields,
			)

	messages += frappe.get_all(
		"WhatsApp Message",
		filters={
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
		},
		fields=wa_fields,
	)

	# Filter messages to get only Template messages
	template_messages = [message for message in messages if message["message_type"] == "Template"]

	# Iterate through template messages
	for template_message in template_messages:
		# Find the template that this message is using
		if not frappe.db.exists("WhatsApp Templates", template_message["template"]):
			continue
		template = frappe.get_doc("WhatsApp Templates", template_message["template"])

		if template:
			template_message["template_name"] = template.template_name
			if template_message["template_parameters"]:
				parameters = json.loads(template_message["template_parameters"])
				template.template = parse_template_parameters(template.template, parameters)

			template_message["template"] = template.template
			if template_message["template_header_parameters"]:
				header_parameters = json.loads(template_message["template_header_parameters"])
				template.header = parse_template_parameters(template.header, header_parameters)
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
		from_name = get_from_name(message) if message["from"] else _("You")
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
			from_name = get_from_name(reply_message) if replied_message["from"] else _("You")
			message = replied_message["message"]
			if replied_message["message_type"] == "Template":
				message = replied_message["template"]
			reply_message["reply_message"] = message
			reply_message["header"] = replied_message.get("header") or ""
			reply_message["footer"] = replied_message.get("footer") or ""
			reply_message["reply_to"] = replied_message["name"]
			reply_message["reply_to_type"] = replied_message["type"]
			reply_message["reply_to_from"] = from_name

	return [message for message in messages if message["content_type"] != "reaction"]


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
):
	validate_access(reference_doctype, reference_name)
	doc = frappe.new_doc("WhatsApp Message")

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
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist()
def send_whatsapp_template(
	reference_doctype: str, reference_name: str, template: str, to: str, body_param=None, attach=None
):
	validate_access(reference_doctype, reference_name)
	doc = frappe.new_doc("WhatsApp Message")
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
		doc.body_param = json.dumps(
			{str(k): ("" if v is None else str(v)) for k, v in body_param.items()}
		)
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

	# frappe_whatsapp resolves placeholders from `field_names` (ref-doc fieldnames)
	# when set, else falls back to the literal `sample_values`. Mirror that exactly so
	# the preview defaults equal what an un-overridden send would transmit.
	field_names = (tpl.get("field_names") or "").strip()
	sample_values = (tpl.get("sample_values") or "").strip()
	using_fields = bool(field_names)
	raw = field_names or sample_values
	tokens = [t.strip() for t in raw.split(",") if t.strip()] if raw else []

	ref_doc = frappe.get_doc(reference_doctype, reference_name) if (tokens and using_fields) else None
	variables = []
	for i, tok in enumerate(tokens, start=1):
		if using_fields:
			try:
				value = ref_doc.get_formatted(tok) if ref_doc else ""
			except Exception:
				value = ""
			label = tok
		else:
			value = tok  # literal sample value
			label = _("Variable {0}").format(i)
		variables.append(
			{"index": i, "field": tok if using_fields else "", "label": label, "value": value or ""}
		)

	rendered = parse_template_parameters(body, [v["value"] for v in variables]) if variables else body
	return {
		"name": tpl.name,
		"body": body,
		"rendered": rendered,
		"footer": tpl.get("footer") or "",
		"header_type": tpl.get("header_type") or "",
		"language_code": tpl.get("language_code") or "",
		"variables": variables,
	}


# Field types worth offering as a template-variable source in the mapping dropdown
# (scalars that render as a short string). Tables/HTML/attachments are excluded.
_MAPPABLE_FIELDTYPES = {
	"Data", "Select", "Link", "Small Text", "Text", "Read Only", "Phone",
	"Int", "Float", "Currency", "Percent", "Date", "Datetime", "Time",
}


@frappe.whitelist()
def get_template_field_options(reference_doctype: str):
	"""Candidate ERPNext fields for the template-variable mapping dropdown: the
	reference doctype's own scalar fields plus one level of dotted Link traversal
	for the obvious links (so e.g. a Deal can map {{1}} to its contact's name).
	[{value, label, group}] — value is the field_names token (plain or dotted)."""
	validate_access()
	if not frappe.db.exists("DocType", reference_doctype):
		return []
	meta = frappe.get_meta(reference_doctype)
	opts = []
	for df in meta.fields:
		if df.fieldtype in _MAPPABLE_FIELDTYPES and not df.get("hidden"):
			opts.append({"value": df.fieldname, "label": _(df.label or df.fieldname), "group": reference_doctype})
	# one-level dotted for Link fields → that target's name-ish + phone-ish fields
	for df in meta.fields:
		if df.fieldtype == "Link" and df.options and frappe.db.exists("DocType", df.options):
			try:
				sub = frappe.get_meta(df.options)
			except Exception:
				continue
			for sdf in sub.fields:
				if sdf.fieldtype in ("Data", "Phone", "Read Only", "Select") and not sdf.get("hidden") and (
					"name" in (sdf.fieldname or "") or "mobile" in (sdf.fieldname or "")
					or "phone" in (sdf.fieldname or "") or "email" in (sdf.fieldname or "")
				):
					opts.append({
						"value": f"{df.fieldname}.{sdf.fieldname}",
						"label": f"{_(df.label or df.fieldname)} → {_(sdf.label or sdf.fieldname)}",
						"group": _(df.label or df.fieldname),
					})
	return opts


def _resolve_dotted(reference_doctype: str, reference_name: str, token: str) -> str:
	"""Resolve a field_names token (plain or one-level dotted) to a formatted value."""
	doc = frappe.get_doc(reference_doctype, reference_name)
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
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


QUICK_REPLY_SETTINGS_FIELD = "quick_replies"
QUICK_TEMPLATE_LIMIT = 6


@frappe.whitelist()
def get_quick_replies():
	"""Team-shared canned WhatsApp replies, stored as JSON on FCRM Settings."""
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
		"name", "type", "to", "from", "content_type", "message_type", "attach",
		"template", "use_template", "message_id", "is_reply", "reply_to_message_id",
		"creation", "message", "status", "reference_doctype", "reference_name",
		"template_parameters", "template_header_parameters",
	]
	if frappe.db.has_column("WhatsApp Message", "doco_sent_by_type"):
		fields += ["doco_sent_by_type", "doco_actor_user", "doco_automation_source", "doco_bot"]
	return fields


def parse_template_parameters(string, parameters):
	for i, parameter in enumerate(parameters, start=1):
		placeholder = "{{" + str(i) + "}}"
		string = string.replace(placeholder, str(parameter))

	return string


def get_from_name(message):
	doc = frappe.get_doc(message["reference_doctype"], message["reference_name"])
	from_name = ""
	if message["reference_doctype"] == "CRM Deal":
		if doc.get("contacts"):
			for c in doc.get("contacts"):
				if c.is_primary:
					from_name = c.full_name or c.mobile_no
					break
		else:
			from_name = doc.get("lead_name")
	else:
		from_name = " ".join(name for name in [doc.get("first_name"), doc.get("last_name")] if name)
	return from_name


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
			update_permission_property(doctype, role, 0, "create", 1)
			update_permission_property(doctype, role, 0, "delete", 1)
			update_permission_property(doctype, role, 0, "share", 1)
			update_permission_property(doctype, role, 0, "email", 1)
			update_permission_property(doctype, role, 0, "print", 1)
			update_permission_property(doctype, role, 0, "report", 1)
			update_permission_property(doctype, role, 0, "export", 1)
