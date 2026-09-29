# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""What happens after someone submits a CRM form.

`stamp` runs in the record's before_insert (inside `enrich_form_submission`) and
`apply` in its after_insert, both only for web-form submissions. Everything here
reuses the owning system's own actions: assignment goes through the record's
owner field (the controller assigns and the ToDo hook notifies), follow-ups through
doco_marketing's campaign engine (which applies suppression/consent at enroll and
send time), consent through its ledger, attribution through its touchpoints.
None of it may block the visitor's submission: a failing side effect is logged.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_days, escape_html, get_datetime, nowdate

from crm.forms import settings as form_settings

UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")
OWNER_FIELD = {"CRM Lead": "lead_owner", "CRM Deal": "deal_owner"}
NOTIFICATION_TYPE = "Form"
MAX_UTM_LENGTH = 140


def request_utm() -> dict:
	"""UTM parameters the public page captured from its own URL, sanitized."""
	raw = frappe.form_dict.get("crm_utm")
	if isinstance(raw, str):
		try:
			raw = json.loads(raw or "{}")
		except ValueError:
			raw = {}
	if not isinstance(raw, dict):
		return {}
	out = {}
	for key in (*UTM_KEYS, "page"):
		value = raw.get(key)
		if isinstance(value, str) and value.strip():
			out[key] = value.strip()[: 500 if key == "page" else MAX_UTM_LENGTH]
	return out


def request_consent() -> bool:
	return str(frappe.form_dict.get("crm_consent") or "").lower() in ("1", "true", "yes", "on")


def submitting_form():
	"""The CRM Web Form this request submits, or None."""
	name = frappe.form_dict.get("web_form")
	if not name:
		return None
	return frappe.db.get_value(
		"Web Form",
		name,
		["name", "title", "route", "doc_type", "module", "crm_form_settings"],
		as_dict=True,
	)


def stamp(doc, form) -> None:
	"""before_insert: link the record to its form, carry attribution, set the owner."""
	if doc.meta.has_field("crm_web_form"):
		doc.crm_web_form = form.name
	utm = request_utm()
	for key in UTM_KEYS:
		if utm.get(key) and doc.meta.has_field(key) and not doc.get(key):
			doc.set(key, utm[key])

	settings = form_settings.of_form(form)
	owner_field = OWNER_FIELD.get(doc.doctype)
	if (
		settings["assign_mode"] == "user"
		and settings["assign_to"]
		and owner_field
		and not doc.get(owner_field)
		and frappe.db.get_value("User", settings["assign_to"], "enabled")
	):
		# the controller's after_insert assigns + shares, and the ToDo hook notifies
		doc.set(owner_field, settings["assign_to"])


def apply(doc) -> dict:
	"""after_insert: timeline note, attribution, consent, follow-up, watchers.
	Returns what it did (the test run shows this to the author)."""
	form = submitting_form()
	if not form or form.doc_type != doc.doctype:
		return {}
	settings = form_settings.of_form(form)
	utm = request_utm()
	report = {"form": form.name}

	report["comment"] = _safe("comment", _add_intake_comment, doc, form, utm)
	if form_settings.marketing_installed():
		report["touchpoint"] = _safe("touchpoint", _record_touchpoint, doc, form, utm)
		if settings["consent_enabled"] and request_consent():
			report["consent"] = _safe("consent", _log_consent, doc, form, settings)
		if settings["campaign"] and doc.doctype == "CRM Lead":
			report["enrollment"] = _safe("enrollment", _enroll, doc, settings["campaign"])
	if settings["notify_users"] and settings["notify_mode"] == "instant":
		report["notified"] = _safe("notify", _notify_watchers, doc, form, settings["notify_users"])
	# read back by the test submission to show the author what happened
	frappe.flags.crm_form_after_submit = report
	return report


def _safe(what, fn, *args):
	try:
		return fn(*args)
	except frappe.QueryDeadlockError:
		# the transaction is gone; let the request unwind (as consent capture does)
		raise
	except Exception:
		frappe.log_error(frappe.get_traceback(), f"CRM form after-submit: {what}")
		return None


def _add_intake_comment(doc, form, utm) -> str:
	"""A timeline note so whoever opens the record sees where it came from and the
	visitor's own words, without hunting through fields."""
	parts = [_("Submitted through the form «{0}».").format(escape_html(form.title or form.name))]
	message = doc.get("crm_form_message")
	if message:
		parts.append(f"<blockquote>{escape_html(message)}</blockquote>")
	source = " · ".join(f"{k.replace('utm_', '')}: {escape_html(utm[k])}" for k in UTM_KEYS if utm.get(k))
	if source:
		parts.append(_("Campaign link: {0}").format(source))
	comment = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": doc.doctype,
			"reference_name": doc.name,
			"content": "<br>".join(parts),
		}
	)
	comment.insert(ignore_permissions=True)
	return comment.name


def _record_touchpoint(doc, form, utm) -> str:
	from doco_marketing.services import touchpoint

	return touchpoint.record_touchpoint(
		reference_doctype=doc.doctype,
		reference_name=doc.name,
		channel="Form",
		event="form_submit",
		utm={k: utm[k] for k in UTM_KEYS if utm.get(k)},
		props={"web_form": form.name, "route": form.route, "page": utm.get("page")},
		source_doctype="Web Form",
		source_name=form.name,
	)


def _log_consent(doc, form, settings) -> str | None:
	"""The visitor ticked the opt-in: record an Explicit WhatsApp grant in the
	consent ledger, with the exact text they agreed to."""
	party = (doc.get("mobile_no") or doc.get("phone") or "").strip()
	if not party:
		return None
	from doco_marketing.services import consent

	return consent.log_consent(
		party=party,
		channel="WhatsApp",
		action="Grant",
		consent_class="Explicit",
		source_form=f"crm-form:{form.route}",
		ip_address=getattr(frappe.local, "request_ip", None),
		consent_text=form_settings.fill_business(settings["consent_text"]),
	)


def _enroll(doc, campaign) -> str | None:
	"""Start the chosen follow-up through the campaign engine — it records a
	suppressed target as Suppressed and dedups active enrollments; its sends
	apply suppression and consent again at send time."""
	if not frappe.db.exists("CRM Campaign", campaign):
		return None
	from doco_marketing.services import campaign_engine

	return campaign_engine.enroll(campaign, lead=doc.name)


def _notify_watchers(doc, form, users) -> list[str]:
	from crm.fcrm.doctype.crm_notification.crm_notification import notify_user

	title = doc.get("lead_name") or doc.get("organization") or doc.name
	text = _(
		'New submission on <span class="font-medium text-ink-gray-9">{0}</span>: '
		'<span class="font-medium text-ink-gray-9">{1}</span>'
	).format(escape_html(form.title or form.name), escape_html(title))
	sent = []
	for user in users:
		if not frappe.db.get_value("User", user, "enabled"):
			continue
		notify_user(
			{
				"owner": frappe.session.user,
				"assigned_to": user,
				"notification_type": NOTIFICATION_TYPE,
				"message": "",
				"notification_text": f'<div class="mb-2 leading-5 text-ink-gray-5">{text}</div>',
				"reference_doctype": doc.doctype,
				"reference_docname": doc.name,
				"redirect_to_doctype": doc.doctype,
				"redirect_to_docname": doc.name,
			}
		)
		sent.append(user)
	return sent


def assignment_actor() -> str | None:
	"""Who to credit in the assignee's notification when a form submission assigns a
	record: the form, not the anonymous visitor."""
	if not frappe.flags.get("in_web_form"):
		return None
	form = submitting_form()
	return _("Form «{0}»").format(form.title or form.name) if form else None


def send_daily_digests() -> None:
	"""Daily: one in-app summary per watcher for forms set to "digest"."""
	since = get_datetime(add_days(nowdate(), -1))
	until = get_datetime(nowdate())
	forms = frappe.get_all(
		"Web Form",
		filters={"module": "FCRM", "crm_form_settings": ["like", '%"digest"%']},
		fields=["name", "title", "doc_type", "crm_form_settings"],
	)
	from crm.fcrm.doctype.crm_notification.crm_notification import notify_user

	for form in forms:
		settings = form_settings.of_form(form)
		if settings["notify_mode"] != "digest" or not settings["notify_users"]:
			continue
		count = frappe.db.count(
			form.doc_type, {"crm_web_form": form.name, "creation": ["between", (since, until)]}
		)
		if not count:
			continue
		text = _(
			'<span class="font-medium text-ink-gray-9">{0}</span> received {1} new submission(s) yesterday'
		).format(escape_html(form.title or form.name), count)
		for user in settings["notify_users"]:
			try:
				notify_user(
					{
						"owner": "Administrator",
						"assigned_to": user,
						"notification_type": NOTIFICATION_TYPE,
						"message": "",
						"notification_text": f'<div class="mb-2 leading-5 text-ink-gray-5">{text}</div>',
						"reference_doctype": "Web Form",
						"reference_docname": form.name,
						"redirect_to_doctype": "Web Form",
						"redirect_to_docname": form.name,
					}
				)
			except Exception:
				frappe.log_error(frappe.get_traceback(), "CRM form digest")
