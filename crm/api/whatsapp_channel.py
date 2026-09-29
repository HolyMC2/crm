"""CRM's manual WhatsApp (wa.me) path on top of the site's one channel.

The mode is not CRM's to decide: ``frappe_whatsapp.channel.resolve_mode()``
answers for every app (WhatsApp Settings.channel_mode, Auto/Manual/Off).

- ``api``: the CRM composer sends through frappe_whatsapp; no wa.me links here.
- ``manual``: CRM fills a template or quick reply with the record's data and the
  worker opens WhatsApp on their own device (wa.me) and presses send. Nothing is
  sent by the server, and an open is logged as opened, never as delivered.
- ``off``: no WhatsApp actions.

Without frappe_whatsapp's channel module the manual path is off and the
existing API behaviour is untouched.
"""

import re

import frappe
from frappe import _
from frappe.utils import escape_html

from crm.api.whatsapp import get_template_preview, parse_template_parameters, validate_access
from crm.api.whatsapp_contacts import _digits

try:
	from frappe_whatsapp import channel
except ImportError:
	channel = None

RECORD_DOCTYPES = ("CRM Deal", "CRM Lead")


def resolve_mode():
	return channel.resolve_mode() if channel else "off"


# --- recipient ------------------------------------------------------------


def _candidates(doctype, name):
	"""The record's mobile unless the operator marked it as not-WhatsApp, then
	its other phone, then the Deal's primary contact's numbers."""
	record = frappe.get_doc(doctype, name)
	not_whatsapp = record.meta.has_field("mobile_is_whatsapp") and record.get("mobile_is_whatsapp") == 0
	skipped = _digits(record.get("mobile_no")) if not_whatsapp else ""
	raw = [] if not_whatsapp else [record.get("mobile_no")]
	raw.append(record.get("phone"))
	if doctype == "CRM Deal":
		contact = next((c.contact for c in record.get("contacts") or [] if c.is_primary), None)
		if contact:
			raw += frappe.db.get_value("Contact", contact, ["mobile_no", "phone"]) or []
	return [r for r in raw if r and (not skipped or _digits(r) != skipped)]


def recipient(doctype, name, phone=""):
	"""wa.me digits for the record. `phone` picks one of the record's own numbers
	(the chat tab the worker is on); a number the record does not hold is refused."""
	region = channel.site_region()
	if phone:
		from crm.api.conversation_threads import PEER_SUFFIX
		from crm.api.whatsapp_contacts import _record_numbers

		key = _digits(phone)[-PEER_SUFFIX:]
		if key not in {n["key"] for n in _record_numbers(doctype, name)}:
			frappe.throw(_("Ese número no pertenece a este registro."), frappe.PermissionError)
		return channel.wa_digits(phone, region)
	for raw in _candidates(doctype, name):
		digits = channel.wa_digits(raw, region)
		if digits:
			return digits
	return None


# --- endpoints ------------------------------------------------------------


def _record(reference_doctype, reference_name):
	if reference_doctype not in RECORD_DOCTYPES:
		frappe.throw(_("Unsupported doctype"), frappe.PermissionError)
	return validate_access(reference_doctype, reference_name)


def _require_manual():
	if resolve_mode() != "manual":
		frappe.throw(_("Este negocio no usa WhatsApp manual."), frappe.ValidationError)


@frappe.whitelist()
def get_record_channel(reference_doctype: str, reference_name: str, phone: str = ""):
	"""Everything a manual WhatsApp button needs, decided server-side so every
	surface agrees. The bare link opens the chat with no text."""
	_record(reference_doctype, reference_name)
	mode = resolve_mode()
	out = {"mode": mode, "phone": None, "url": None, "shop_number": "", "sender_hint": None}
	if mode != "manual":
		return out
	digits = recipient(reference_doctype, reference_name, phone)
	out.update(
		phone=digits,
		url=channel.wa_link(digits) if digits else None,
		shop_number=channel.shop_number(),
		sender_hint=channel.sender_hint(),
	)
	return out


def _manual_templates(reference_doctype):
	if not frappe.db.exists("DocType", "WhatsApp Templates"):
		return []
	has_scope = frappe.get_meta("WhatsApp Templates").has_field("channel_scope")
	rows = frappe.get_all(
		"WhatsApp Templates",
		filters={"for_doctype": ["in", [reference_doctype, ""]]},
		fields=["name", "template", "footer", "status"] + (["channel_scope"] if has_scope else []),
		order_by="modified desc",
	)
	# Meta-approved templates and local freeform ones (a shop without an account
	# cannot get Meta approval); pending or rejected drafts stay out.
	return [r for r in rows if r.status == "APPROVED" or r.get("channel_scope") == "freeform"]


@frappe.whitelist()
def list_manual_templates(reference_doctype: str):
	validate_access()
	_require_manual()
	return [
		{"name": r.name, "template": r.template, "footer": r.footer}
		for r in _manual_templates(reference_doctype)
	]


@frappe.whitelist()
def prepare_manual_message(
	reference_doctype: str, reference_name: str, template: str = "", text: str = "", phone: str = ""
):
	"""Fill a template (or take the typed/quick-reply text) with the record's data
	and build the wa.me link. Only in manual mode: api and off never get a link."""
	_record(reference_doctype, reference_name)
	_require_manual()
	missing = []
	if template:
		if template not in {r.name for r in _manual_templates(reference_doctype)}:
			frappe.throw(_("Plantilla no disponible para este registro."))
		preview = get_template_preview(reference_doctype, reference_name, template)
		# Only values read from THIS record go into a manual message. A template
		# without a field mapping falls back to Meta's sample values («Hola
		# Marco», a demo link), which must never reach a real customer: those
		# holes stay visible as {{n}} and are reported, like empty fields.
		values, missing = [], []
		for v in preview["variables"]:
			if v["field"] and v["value"]:
				values.append(v["value"])
			else:
				values.append("{{%d}}" % v["index"])
				missing.append(v["label"] if v["field"] else _("Dato {0}").format(v["index"]))
		body = parse_template_parameters(preview["body"], values) if values else preview["body"]
		mapped = {v["index"] for v in preview["variables"]}
		missing += [
			_("Dato {0}").format(n)
			for n in sorted({int(n) for n in re.findall(r"\{\{(\d+)\}\}", body)} - mapped)
		]
		text = "\n\n".join(p for p in (body, preview["footer"]) if p)
	text = re.sub(r"[ \t]{2,}", " ", text or "").strip()
	digits = recipient(reference_doctype, reference_name, phone)
	return {
		"phone": digits,
		"text": text,
		"missing": missing,
		"url": channel.wa_link(digits, text or None) if digits else None,
	}


@frappe.whitelist(methods=["POST"])
def log_manual_open(
	reference_doctype: str, reference_name: str, phone: str = "", text: str = "", template: str = ""
):
	"""The worker opened WhatsApp with a filled message. We cannot see whether
	they pressed send, so this is a comment that says «abierto», never an
	outgoing WhatsApp Message that would read as delivered."""
	doc = _record(reference_doctype, reference_name)
	_require_manual()
	digits = recipient(reference_doctype, reference_name, phone)
	if not digits:
		frappe.throw(_("Este registro no tiene un número de WhatsApp válido."))
	what = _("la plantilla «{0}»").format(escape_html(template)) if template else _("un mensaje")
	content = "<p>{}</p>".format(
		_("Se abrió WhatsApp manualmente hacia +{0} con {1}. Envío no confirmado.").format(digits, what)
	)
	if text:
		content += "<blockquote>{}</blockquote>".format(escape_html(text).replace("\n", "<br>"))
	comment = doc.add_comment("Comment", content)
	return comment.name
