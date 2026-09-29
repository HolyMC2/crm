# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Starter templates for CRM forms.

A template pre-fills a new form (fields, texts, route, after-submit defaults) so
an author starts from something that already works instead of a blank canvas.
Texts are generic: the business name is the `{business}` token, filled from the
site's own data when the public page renders (see `settings.business_name`).
Visitor-facing texts are written in the form's language, not the author's UI
language — the people filling the form are the audience.
"""

import frappe
from frappe import _

from crm.forms import settings as form_settings

# UI metadata only (author's language). The build below owns the actual content.
TEMPLATE_KEYS = ("contact", "quote", "visit", "promo")


def list_templates() -> list[dict]:
	"""Template cards for the "New form" picker, in the author's language."""
	cards = {
		"contact": {
			"label": _("Contact us"),
			"summary": _(
				"A simple way for visitors to reach you. Collects name, phone, email and a message."
			),
			"icon": "message-square-text",
		},
		"quote": {
			"label": _("Request a quote"),
			"summary": _(
				"Visitors describe what they need so you can send a price. Adds company and details."
			),
			"icon": "file-text",
		},
		"visit": {
			"label": _("Book a visit"),
			"summary": _("Visitors ask for a day and time to come in. You confirm by message."),
			"icon": "calendar-check",
		},
		"promo": {
			"label": _("Promo sign-up"),
			"summary": _(
				"Grow your WhatsApp list for offers. Includes an opt-in checkbox so consent is recorded."
			),
			"icon": "megaphone",
		},
	}
	out = []
	for key in TEMPLATE_KEYS:
		spec = _spec(key, frappe.local.lang)
		out.append(
			{
				"key": key,
				"document_type": spec["document_type"],
				"fields": [label for label, _reqd in _preview_fields(spec)],
				**cards[key],
			}
		)
	return out


def build(key: str, lang: str | None = None) -> dict:
	"""A `save_form` payload for template `key`, texts in `lang`."""
	if key not in TEMPLATE_KEYS:
		frappe.throw(_("Unknown form template: {0}").format(key))
	lang = lang or form_settings.default_language()
	spec = _spec(key, lang)
	document_type = spec["document_type"]
	return {
		"title": spec["title"],
		"document_type": document_type,
		"description": spec["description"],
		"submit_button_label": spec["submit_button_label"],
		"success_message": spec["success_message"],
		"fields": _layout_rows(document_type, spec["sections"], lang),
		"settings": {"language": lang, "template": key, **spec.get("settings", {})},
	}


def _spec(key: str, lang: str) -> dict:
	def t(msg):
		return _(msg, lang=lang)

	name = ("first_name", {"label": t("Name"), "reqd": 1})
	mobile = ("mobile_no", {"label": t("Mobile"), "reqd": 1})
	email = ("email", {"label": t("Email")})

	specs = {
		"contact": {
			"document_type": "CRM Lead",
			"title": t("Contact us"),
			"description": t("Tell us what you need and {business} will get back to you shortly."),
			"submit_button_label": t("Send"),
			"success_message": t("Thanks! We got your message and will reply soon."),
			"sections": [
				{"label": t("Your details"), "columns": [[name, email], [mobile]]},
				{
					"label": "",
					"columns": [[("crm_form_message", {"label": t("How can we help?"), "reqd": 1})]],
				},
			],
		},
		"quote": {
			"document_type": "CRM Lead",
			"title": t("Request a quote"),
			"description": t("Tell {business} what you need and we'll send you a price."),
			"submit_button_label": t("Request quote"),
			"success_message": t("Thanks! We'll prepare your quote and contact you soon."),
			"sections": [
				{
					"label": t("Your details"),
					"columns": [
						[name, email],
						[mobile, ("organization", {"label": t("Company (optional)")})],
					],
				},
				{
					"label": t("What you need"),
					"columns": [
						[
							(
								"crm_form_message",
								{
									"label": t("What would you like a quote for?"),
									"reqd": 1,
									"field_description": t(
										"Models, quantities, deadlines — any detail helps."
									),
								},
							)
						]
					],
				},
			],
		},
		"visit": {
			"document_type": "CRM Lead",
			"title": t("Book a visit"),
			"description": t("Choose when you'd like to come in and {business} will confirm by message."),
			"submit_button_label": t("Request visit"),
			"success_message": t("Thanks! We'll confirm your visit shortly."),
			"sections": [
				{"label": t("Your details"), "columns": [[name, email], [mobile]]},
				{
					"label": t("Your visit"),
					"columns": [
						[
							(
								"crm_form_message",
								{
									"label": t("When would you like to come in?"),
									"reqd": 1,
									"placeholder": t("e.g. Saturday morning"),
									"field_description": t(
										"Tell us a day and time that works for you — we'll confirm by message."
									),
								},
							)
						]
					],
				},
			],
		},
		"promo": {
			"document_type": "CRM Lead",
			"title": t("Get our offers"),
			"description": t("Join the {business} list and be the first to hear about offers and news."),
			"submit_button_label": t("Sign me up"),
			"success_message": t("You're in! Watch your WhatsApp for our next offer."),
			"sections": [
				{
					"label": "",
					"columns": [[name, ("mobile_no", {"label": t("WhatsApp number"), "reqd": 1}), email]],
				},
			],
			"settings": {
				"consent_enabled": 1,
				"consent_text": t("Yes, send me offers and news from {business} on WhatsApp."),
			},
		},
	}
	return specs[key]


def _preview_fields(spec: dict) -> list[tuple[str, bool]]:
	rows = []
	for section in spec["sections"]:
		for col in section["columns"]:
			for fieldname, overrides in col:
				rows.append((overrides.get("label") or fieldname, bool(overrides.get("reqd"))))
	return rows


def _layout_rows(document_type: str, sections: list[dict], lang: str) -> list[dict]:
	"""Web Form rows (Section/Column breaks + fields) for a template layout. A field
	the target doesn't offer on this site is skipped rather than failing the create."""
	from crm.api.form import _mappable_fields

	catalog = {f["fieldname"]: f for f in _mappable_fields(document_type)}
	rows = []
	n = 0

	def _break(fieldtype, label=""):
		nonlocal n
		n += 1
		prefix = "section_break" if fieldtype == "Section Break" else "column_break"
		return {
			"fieldname": f"{prefix}_tpl{n}",
			"label": label,
			"fieldtype": fieldtype,
			"options": "",
			"reqd": 0,
		}

	for section in sections:
		rows.append(_break("Section Break", section.get("label") or ""))
		for ci, col in enumerate(section["columns"]):
			if ci:
				rows.append(_break("Column Break"))
			for fieldname, overrides in col:
				field = catalog.get(fieldname)
				if not field:
					continue
				rows.append(
					{
						"fieldname": fieldname,
						"label": overrides.get("label") or _(field["label"], lang=lang),
						"fieldtype": field["fieldtype"],
						"options": field["options"],
						"reqd": 1 if (overrides.get("reqd") or field["reqd"]) else 0,
						"placeholder": overrides.get("placeholder", ""),
						"field_description": overrides.get("field_description", ""),
					}
				)
	return rows
