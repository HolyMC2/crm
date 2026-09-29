# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""A CRM form's own settings, stored as JSON on the Web Form (`crm_form_settings`).

Kept on the Web Form itself (like `crm_hidden_defaults`) rather than in a companion
doctype: the settings live and die with the form, a duplicate copies them, and the
public page reads them in the same fetch. Keys:

- language: the language visitors see (texts, buttons, messages)
- template: the starter template the form was created from (informational)
- assign_mode: "rules" (assignment rules / auto-assign decide) or "user"
- assign_to: the user new submissions are assigned to when assign_mode == "user"
- notify_users: extra people told about each new submission (in-app)
- notify_mode: "instant" (one notification per submission) or "digest" (daily summary)
- campaign: an Active CRM Campaign (doco_marketing) to enroll new leads in
- consent_enabled / consent_text: optional WhatsApp opt-in checkbox on the form
"""

import json

import frappe
from frappe import _

MARKETING_APP = "doco_marketing"
CRM_ROLES = ("Sales User", "Sales Manager", "System Manager")

DEFAULTS = {
	"language": "",
	"template": "",
	"assign_mode": "rules",
	"assign_to": "",
	"notify_users": [],
	"notify_mode": "instant",
	"campaign": "",
	"consent_enabled": 0,
	"consent_text": "",
}


def marketing_installed() -> bool:
	return MARKETING_APP in frappe.get_installed_apps()


def default_language() -> str:
	return frappe.db.get_single_value("System Settings", "language") or "en"


def business_name() -> str:
	"""The name visitors know this business by: the CRM brand, else the default
	company, else the site's app name. Filled into `{business}` at render time."""
	return (
		frappe.db.get_single_value("FCRM Settings", "brand_name")
		or frappe.defaults.get_global_default("company")
		or frappe.db.get_single_value("System Settings", "app_name")
		or ""
	)


def fill_business(text: str | None, name: str | None = None) -> str:
	if not text:
		return text or ""
	return text.replace("{business}", name if name is not None else business_name())


def load(raw) -> dict:
	"""Settings merged over the defaults; tolerant of blank/invalid JSON."""
	if isinstance(raw, str):
		try:
			raw = json.loads(raw or "{}")
		except ValueError:
			raw = {}
	out = dict(DEFAULTS)
	out.update({k: v for k, v in (raw or {}).items() if k in DEFAULTS})
	if not isinstance(out["notify_users"], list):
		out["notify_users"] = []
	return out


def of_form(web_form) -> dict:
	return load(web_form.get("crm_form_settings") if hasattr(web_form, "get") else web_form)


def clean(settings: dict | str | None, document_type: str, current: dict | None = None) -> dict:
	"""Validate an author's settings before they're stored. Unknown keys are dropped;
	references (users, campaign, language) must exist and be usable."""
	if isinstance(settings, str):
		try:
			settings = json.loads(settings or "{}")
		except ValueError:
			settings = {}
	# a partial update changes only the keys it names
	out = load(current or {})
	out.update({k: v for k, v in (settings or {}).items() if k in DEFAULTS})
	out = load(out)

	if out["assign_mode"] not in ("rules", "user"):
		out["assign_mode"] = "rules"
	if out["assign_mode"] == "user":
		if not out["assign_to"]:
			frappe.throw(_("Choose who new submissions are assigned to, or leave it to assignment rules."))
		_assert_crm_user(out["assign_to"])
	else:
		out["assign_to"] = ""

	users = []
	for user in out["notify_users"]:
		if user and user not in users:
			_assert_crm_user(user)
			users.append(user)
	out["notify_users"] = users
	if out["notify_mode"] not in ("instant", "digest"):
		out["notify_mode"] = "instant"

	if out["campaign"]:
		if not marketing_installed():
			out["campaign"] = ""
		else:
			camp = frappe.db.get_value(
				"CRM Campaign", out["campaign"], ["status", "is_cadence"], as_dict=True
			)
			if not camp or camp.is_cadence:
				frappe.throw(_("Campaign {0} can't be used as a form follow-up.").format(out["campaign"]))
			if document_type != "CRM Lead":
				frappe.throw(_("Follow-up campaigns are available for forms that create leads."))

	out["consent_enabled"] = 1 if out["consent_enabled"] else 0
	out["consent_text"] = (out["consent_text"] or "").strip()[:500]
	if out["consent_enabled"] and not out["consent_text"]:
		frappe.throw(_("Write the consent text visitors agree to."))

	if out["language"] and not frappe.db.exists("Language", out["language"]):
		frappe.throw(_("Unknown language: {0}").format(out["language"]))
	out["template"] = (out["template"] or "")[:40]
	return out


def _assert_crm_user(user: str):
	enabled = frappe.db.get_value("User", user, "enabled")
	if not enabled or not set(frappe.get_roles(user)) & set(CRM_ROLES):
		frappe.throw(_("{0} isn't an active CRM user.").format(user))


def options(document_type: str) -> dict:
	"""What the "After someone submits" panel can offer on this site."""
	statuses = []
	status_dt = "CRM Lead Status" if document_type == "CRM Lead" else "CRM Deal Status"
	for row in frappe.get_all(status_dt, fields=["name", "type"], order_by="position asc"):
		statuses.append({"value": row.name, "type": row.type})

	out = {
		"marketing": marketing_installed(),
		"statuses": statuses,
		"campaigns": [],
		"auto_campaigns": [],
		"assignment_rules": frappe.get_all(
			"Assignment Rule",
			filters={"document_type": document_type, "disabled": 0},
			pluck="name",
		),
		"auto_assign": False,
		"business": business_name(),
		"default_language": default_language(),
	}
	if out["marketing"]:
		out["campaigns"] = frappe.get_all(
			"CRM Campaign",
			filters={"is_cadence": 0, "status": "Active"},
			fields=["name", "title", "status", "type", "enrollment_trigger"],
			order_by="modified desc",
		)
		if document_type == "CRM Lead":
			out["auto_campaigns"] = frappe.get_all(
				"CRM Campaign",
				filters={"is_cadence": 0, "status": "Active", "enrollment_trigger": "lead_created"},
				fields=["name", "title"],
			)
		try:
			settings = frappe.get_cached_doc("Marketing Settings")
			out["auto_assign"] = bool(settings.get("auto_assign_enabled")) and (
				document_type == "CRM Lead" or bool(settings.get("auto_assign_deals"))
			)
		except frappe.DoesNotExistError:
			pass
	return out
