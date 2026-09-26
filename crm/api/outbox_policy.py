"""Current eligibility for the first native manual-reply slice.

Window evidence comes from authenticated, processed provider timestamps. A
backlogged receipt or newly inserted message never restarts the customer window.
"""

import hashlib
import json
import time

import frappe


def account_revision(account):
	values = [account.name, account.app_id, account.business_id]
	return "manual_reply:" + hashlib.sha256(json.dumps(values, separators=(",", ":")).encode()).hexdigest()


def webchat_revision(account):
	values = [account.name, account.profile, account.public_origin]
	return "manual_webchat:" + hashlib.sha256(json.dumps(values, separators=(",", ":")).encode()).hexdigest()


# A person's free-form reply is `manual`; a person's template send is `service`.
HUMAN_PURPOSES = {"manual", "service"}


def requires_window(intent):
	"""Meta delivers a template outside the customer-service window; nothing else."""
	try:
		return json.loads(intent.payload).get("type") != "template"
	except (TypeError, ValueError, AttributeError):
		return True


def manual_reply_reason(intent):
	if intent.origin != "Human" or intent.purpose not in HUMAN_PURPOSES:
		return "producer_not_ready"
	if frappe.conf.get("maintenance_mode"):
		return "site_maintenance"
	if intent.provider == "Webchat":
		from crm.api.webchat import current_session

		try:
			current_session(intent.account_id, intent.peer_id)
		except (frappe.PermissionError, frappe.ValidationError, frappe.DoesNotExistError):
			return "webchat_session_unavailable"
		channel = frappe.db.get_value(
			"CRM Webchat Channel",
			intent.account_id,
			["name", "profile", "public_origin"],
			as_dict=True,
			for_update=True,
		)
		if (
			not channel
			or intent.source_doctype != "CRM Webchat Channel"
			or intent.source_name != channel.name
			or intent.source_action != webchat_revision(channel)
		):
			return "account_configuration_changed"
		return None
	if intent.provider != "WhatsApp":
		return "producer_not_ready"
	reason, account = whatsapp_account_reason(intent)
	if reason:
		return reason
	return _recipient_reason(intent, account)


def automation_reason(intent):
	"""Automated or approved notices: no ownership, but every account, peer and
	provider-control rule a person's reply obeys. A control change never cancels one."""
	if intent.origin != "Automation" or intent.purpose != "automation" or intent.provider != "WhatsApp":
		return "producer_not_ready"
	if frappe.conf.get("maintenance_mode"):
		return "site_maintenance"
	from crm.api import conversations as control

	try:
		current = control._load(intent.conversation)
		if (intent.provider, intent.account_id, intent.peer_id) != (
			current.provider,
			current.account_id,
			current.peer_id,
		):
			return "conversation_scope_changed"
		control._authorize(current, intent.actor_user, write=True)
	except (frappe.PermissionError, frappe.DoesNotExistError):
		return "authority_revoked"
	if current.provider_control not in {"Ours", "Not Applicable"}:
		return "provider_control_unavailable"
	reason, account = whatsapp_account_reason(intent)
	if reason:
		return reason
	return _recipient_reason(intent, account)


def whatsapp_template_reason(intent, account):
	"""A frozen template remains bound to its current approved account/language.

	Commerce templates are not certified by the catalog producer yet. They must
	not use this generic service path to bypass its item/catalog/window checks.
	Marketing templates require the installed consent owner to prove permission.
	"""
	try:
		payload = json.loads(intent.payload)
	except (TypeError, ValueError):
		return "frozen_payload_invalid"
	if payload.get("type") != "template":
		return None
	template = payload.get("template") or {}
	name = template.get("name")
	language = (template.get("language") or {}).get("code")
	if not isinstance(name, str) or not isinstance(language, str):
		return "template_unavailable"
	rows = frappe.db.sql(
		"""SELECT name,status,category,buttons FROM `tabWhatsApp Templates`
		WHERE whatsapp_account=%s AND language_code=%s
		AND (actual_name=%s OR (COALESCE(actual_name,'')='' AND template_name=%s))
		LIMIT 2 FOR UPDATE""",
		(account.name, language, name, name),
		as_dict=True,
	)
	if len(rows) != 1 or rows[0].status != "APPROVED":
		return "template_unavailable"
	try:
		buttons = json.loads(rows[0].buttons or "[]")
	except (TypeError, ValueError):
		return "template_unavailable"
	components = template.get("components") or []
	if not isinstance(buttons, list) or not isinstance(components, list):
		return "template_unavailable"
	if any(not isinstance(button, dict) for button in buttons + components):
		return "template_unavailable"
	if any(str(button.get("type", "")).upper() in {"CATALOG", "MPM"} for button in buttons):
		return "catalog_template_not_ready"
	for component in components:
		if component.get("sub_type") in {"mpm", "catalog"}:
			return "catalog_template_not_ready"
		parameters = component.get("parameters") or []
		if not isinstance(parameters, list) or any(not isinstance(row, dict) for row in parameters):
			return "template_unavailable"
		if any(row.get("type") == "action" for row in parameters):
			return "catalog_template_not_ready"
	if rows[0].category == "MARKETING":
		paths = frappe.get_hooks("crm_whatsapp_marketing_consent") or []
		paths = [paths] if isinstance(paths, str) else paths
		if not isinstance(paths, list) or len(set(paths)) != 1:
			return "marketing_consent_unverified"
		from crm.api.outbox import _adapter_module

		module = _adapter_module(paths[0])
		if module is None or not callable(getattr(module, "check", None)):
			return "marketing_consent_unverified"
		if module.check(intent.peer_id) is not True:
			return "marketing_consent_unverified"
	elif rows[0].category not in {"UTILITY", "AUTHENTICATION", "TRANSACTIONAL", "OTP"}:
		return "template_unavailable"
	return None


def _recipient_reason(intent, account):
	reason = whatsapp_template_reason(intent, account)
	if reason:
		return reason
	# Only currently approved, eligible templates skip the customer window.
	if requires_window(intent):
		return whatsapp_recipient_reason(intent, account=account)
	return whatsapp_recipient_reason(intent, account=account, require_window=False)


def whatsapp_account_reason(intent):
	rows = frappe.db.get_values(
		"WhatsApp Account",
		{"phone_id": intent.account_id},
		["name", "status", "mode", "app_id", "business_id"],
		as_dict=True,
		for_update=True,
	)
	if len(rows) != 1 or rows[0].status != "Active" or (rows[0].mode or "Live") != "Live":
		return "account_unavailable", None
	if not rows[0].app_id:
		return "account_configuration_invalid", None
	from crm.api import catalog_commerce

	try:
		payload = json.loads(intent.payload)
	except (ValueError, TypeError):
		return "frozen_payload_invalid", None
	if catalog_commerce.is_catalog_payload(payload) or (intent.source_action or "").startswith("cat1:"):
		if intent.source_doctype != "WhatsApp Account" or intent.source_name != rows[0].name:
			return "account_configuration_changed", None
		reason = catalog_commerce.dispatch_reason(intent, rows[0])
		return (reason, None) if reason else (None, rows[0])
	if (
		intent.source_doctype != "WhatsApp Account"
		or intent.source_name != rows[0].name
		or intent.source_action != account_revision(rows[0])
	):
		return "account_configuration_changed", None
	return None, rows[0]


def whatsapp_recipient_reason(intent, account=None, require_window=True):
	"""Shared native/manual recipient rules; the producer validates its source."""
	if frappe.conf.get("maintenance_mode"):
		return "site_maintenance"
	if account is None:
		rows = frappe.db.get_values(
			"WhatsApp Account",
			{"phone_id": intent.account_id},
			["name", "status", "mode", "app_id", "business_id"],
			as_dict=True,
			for_update=True,
		)
		if (
			len(rows) != 1
			or rows[0].status != "Active"
			or (rows[0].mode or "Live") != "Live"
			or not rows[0].app_id
		):
			return "account_unavailable"
		account = rows[0]
	# Preserve the existing explicit opt-out policy without treating a missing
	# newsletter confirmation as a ban on a requested service conversation.
	if "doco_marketing" in frappe.get_installed_apps():
		if not frappe.db.exists("DocType", "Marketing Suppression"):
			return "suppression_unavailable"
		tail = intent.peer_id[-10:]
		if frappe.db.sql(
			"""SELECT name FROM `tabMarketing Suppression`
            WHERE channel IN ('WhatsApp','All')
              AND (party=%s OR (%s=1 AND REGEXP_REPLACE(party,'[^0-9]','') LIKE %s))
            LIMIT 1 FOR UPDATE""",
			(intent.peer_id, int(len(intent.peer_id) >= 10), "%" + tail),
		):
			return "recipient_suppressed"
	if not require_window:
		return None
	if not frappe.db.exists("DocType", "Meta Webhook Receipt"):
		return "customer_window_unverified"
	now = int(time.time())
	# Discover without locks, then revalidate ONE primary-key row with a current
	# read. A JSON predicate FOR UPDATE over the whole ledger would otherwise
	# hold unrelated inbound receipts through the provider HTTP attempt.
	predicate = """provider='WhatsApp' AND account_id=%s AND app_id=%s
          AND event_type='message' AND state='Processed'
          AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].from'))=%s
          AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].timestamp')) REGEXP '^[0-9]{1,12}$'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].timestamp')) AS UNSIGNED)>%s
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.change.value.messages[0].timestamp')) AS UNSIGNED)<=%s
    """
	params = (intent.account_id, account.app_id, intent.peer_id, now - 86400, now)
	candidate = frappe.db.sql(
		"SELECT name FROM `tabMeta Webhook Receipt` WHERE " + predicate + " LIMIT 1", params
	)
	incoming = candidate and frappe.db.sql(
		"SELECT name FROM `tabMeta Webhook Receipt` WHERE name=%s AND " + predicate + " LIMIT 1 FOR UPDATE",
		(candidate[0][0], *params),
	)
	return None if incoming else "customer_window_unverified"
