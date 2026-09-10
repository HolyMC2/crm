"""Finite provider evidence for native inquiries; never a contact/send permission.

Adapters own provider authentication, account access and reviewed form policy.
This boundary validates and preserves the exact first source/actor/respondent.
No dependency on the optional marketing app or an external identity service.
"""

import json
import re

import frappe
from frappe import _

from crm.api.inquiries import DOCTYPE, _choice, _date, _mapping, _person, _text

BASE_FIELDS = frozenset({
	"version", "mode", "provider", "account_id", "source_kind", "source_id",
	"source_identity", "receipt_name", "policy_hash", "capture_user", "requested_by",
})
FORM_FIELDS = frozenset({
	"form_id", "leadgen_id", "purpose_statement", "response_channel",
	"form_revision_hash", "submitted_at", "original_respondent",
})
STABLE_FIELDS = ("provider", "account_id", "source_kind", "source_id", "source_identity", "form_id", "leadgen_id")
VISIBLE_FIELDS = frozenset({
	"version", "mode", "provider", "account_id", "source_kind", "source_id",
	*FORM_FIELDS,
}) - {"form_revision_hash"}
KINDS = {
	"fb_mention": "Messenger", "fb_comment": "Messenger", "lead_ad": "Messenger",
	"ig_mention": "Instagram", "ig_comment": "Instagram",
}


def _identifier(value, label):
	value = _text(value, label, 80, required=True)
	if not re.fullmatch(r"[0-9]+", value):
		frappe.throw(_("{0} must be a provider identifier.").format(label))
	return value


def _hash(value, label, required=False):
	value = _text(value, label, 64, required=required)
	if value and not re.fullmatch(r"[0-9a-f]{64}", value):
		frappe.throw(_("{0} must be a SHA-256 digest.").format(label))
	return value


def validate_context(value, source_key):
	"""Called only by the internal source adapter; generic RPC has no context input."""
	if value is None:
		return None
	if not frappe.get_meta(DOCTYPE).has_field("capture_context"):
		frappe.throw(_("Complete the CRM source evidence upgrade before enabling capture."))
	value = _mapping(value, BASE_FIELDS | FORM_FIELDS, _("Source evidence"))
	if type(value.get("version")) is not int or value["version"] != 1:
		frappe.throw(_("Unsupported source evidence version."))
	mode = _choice(value.get("mode"), ("manual_source", "automatic", "manager_reprocess"), _("capture mode"))
	kind = _choice(value.get("source_kind"), tuple(KINDS), _("source kind"))
	provider = _choice(value.get("provider"), ("Messenger", "Instagram"), _("provider"))
	if KINDS[kind] != provider:
		frappe.throw(_("Source kind does not belong to this provider."))
	identity = _text(value.get("source_identity"), _("Source identity"), 500, required=True)
	if identity != source_key:
		frappe.throw(_("Source evidence does not match the capture identity."))
	actor = _text(value.get("capture_user") or frappe.session.user, _("Capture user"), 140, required=True)
	if actor != frappe.session.user:
		frappe.throw(_("Capture evidence must use the current CRM actor."), frappe.PermissionError)
	result = {
		"version": 1, "mode": mode, "provider": provider, "source_kind": kind,
		"account_id": _identifier(value.get("account_id"), _("Provider account")),
		"source_id": _text(value.get("source_id"), _("Source ID"), 512, required=True),
		"source_identity": identity, "capture_user": actor,
		"receipt_name": _text(value.get("receipt_name"), _("Receipt"), 140, required=mode != "manual_source"),
		"policy_hash": _hash(value.get("policy_hash"), _("Capture policy"), required=mode != "manual_source"),
		"requested_by": _text(value.get("requested_by"), _("Requested by"), 140, required=mode == "manager_reprocess"),
	}
	if kind != "lead_ad":
		if FORM_FIELDS.intersection(value):
			frappe.throw(_("Public social sources cannot include a form respondent's contact purpose."))
		return result
	# All Lead Ads evidence, including manual reprocessing, is an exact reviewed
	# form submission. A bare public author is not a form respondent.
	respondent = _person(value.get("original_respondent"))
	if respondent["role"] != "Requester":
		frappe.throw(_("The original form respondent must be a requester."))
	channel = _choice(value.get("response_channel"), ("Email", "Phone call", "WhatsApp"), _("response channel"))
	if not respondent["email" if channel == "Email" else "phone"]:
		frappe.throw(_("The form respondent is missing the selected response address."))
	result.update({
		"form_id": _identifier(value.get("form_id"), _("Form ID")),
		"leadgen_id": _identifier(value.get("leadgen_id"), _("Lead submission ID")),
		"purpose_statement": _text(value.get("purpose_statement"), _("Form contact purpose"), 4000, required=True, multiline=True),
		"response_channel": channel,
		"form_revision_hash": _hash(value.get("form_revision_hash"), _("Form revision"), required=True),
		"submitted_at": str(_date(_text(value.get("submitted_at"), _("Submitted at"), 32, required=True), _("Submitted at"), required=True)),
		"original_respondent": respondent,
	})
	if result["source_id"] != result["leadgen_id"]:
		frappe.throw(_("Form evidence does not match the lead submission."))
	return result


def validate_people(context, values):
	if not context:
		return
	expected_source = "Facebook" if context["provider"] == "Messenger" else "Instagram"
	if values["source_type"] != expected_source:
		frappe.throw(_("Inquiry source type does not match its evidence."))
	if context["source_kind"] == "lead_ad":
		if values["people"] != [context["original_respondent"]]:
			frappe.throw(_("A form inquiry must start with its original respondent only."))
	elif any(person["role"] != "Referrer" for person in values["people"]):
		frappe.throw(_("Public social authors must be recorded as referrers."))


def encode(context):
	return json.dumps(context, sort_keys=True, ensure_ascii=False, separators=(",", ":")) if context else None


def _stored(doc):
	try:
		value = json.loads(doc.get("capture_context") or "null")
	except (TypeError, ValueError):
		frappe.throw(_("Stored source evidence is unavailable. Ask a CRM manager to review it."))
	if value is not None and (not isinstance(value, dict) or value.get("version") != 1):
		frappe.throw(_("Stored source evidence uses an unsupported version."))
	return value


def check_replay(doc, context):
	if not context:
		return
	stored = _stored(doc)
	if not stored or any(stored.get(field) != context.get(field) for field in STABLE_FIELDS):
		frappe.throw(_("This capture identity already has different or unscoped source evidence. A manager must review the mapping."))


def project(doc):
	"""Return a read-only view after caller checked Inquiry read permission."""
	stored = _stored(doc)
	return {key: stored[key] for key in VISIBLE_FIELDS if key in stored} if stored else None
