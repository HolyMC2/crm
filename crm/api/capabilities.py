import json

import frappe
from frappe import get_installed_apps

from crm.api.session import get_session_role_flags


@frappe.whitelist()
def get_capabilities():
	"""Installed-app availability for the CRM shell (frontend/src/utils/crmCapabilities.js).

	Availability only: the shell uses it to pick native pages over addon-backed ones
	and to hide navigation for surfaces that cannot work on this site. It grants
	nothing — every endpoint behind those surfaces keeps its own authorization.
	"""
	get_session_role_flags()
	return {"installed_apps": list(get_installed_apps())}


@frappe.whitelist(methods=["POST"])
def get_vertical_config(entity=None):
	"""CRM-owned compatibility boundary: no optional app is required to call it.

	The new Doco protocol can roll out before or after CRM. Existing vertical
	sections retain their placement; app and permission checks precede rendering.
	Personalized responses are never stored in the site's vertical layout cache.
	"""
	frappe.local.response.setdefault("headers", {})["Cache-Control"] = "private, no-store"
	get_session_role_flags()
	if not frappe.session.user or frappe.session.user == "Guest" or not frappe.db.get_value(
		"User", frappe.session.user, "enabled"
	):
		raise frappe.PermissionError("CRM access is required.")
	try:
		if isinstance(entity, str):
			if len(entity) > 512:
				raise ValueError
			entity = json.loads(entity)
		if entity is not None and (
			not isinstance(entity, dict) or set(entity) != {"doctype", "name"}
			or not isinstance(entity["doctype"], str)
			or entity["doctype"] not in {"CRM Lead", "CRM Deal", "Contact"}
			or not isinstance(entity["name"], str) or not entity["name"].strip()
			or len(entity["name"]) > 140
		):
			raise ValueError
	except (ValueError, TypeError):
		raise frappe.ValidationError("Choose a valid CRM context.") from None
	if entity:
		frappe.get_doc(entity["doctype"], entity["name"]).check_permission("read")
	result = {"schemaVersion": 1, "providers": [], "sections": [], "unavailable": []}
	apps = set(get_installed_apps())
	if "doco" not in apps:
		return result

	messages = len(frappe.local.message_log or [])
	try:
		from doco.crm.api import discover
		result.update(discover(entity))
	except Exception:
		result["unavailable"].append({"id": "registry", "reason": "provider_unavailable"})
	finally:
		if frappe.local.message_log:
			del frappe.local.message_log[messages:]
	try:
		from doco.docoutils.boot import get_active_vertical_config
		config = get_active_vertical_config() or {}
		for section in config.get("sections", [])[:32]:
			component = section.get("vue_component")
			if not section.get("enabled"):
				continue
			if component in {"RepairOrdersSection", "DealsSearchBox"}:
				if "taller" not in apps or not frappe.has_permission("Repair Order", "read"):
					continue
			elif component == "DealDocumentsSection":
				if not {"doco_marketing", "erpnext"}.issubset(apps):
					continue
			else:
				continue
			if section.get("render_in") not in {"data_tab", "deals_list_header"}:
				continue
			# Only RepairOrdersSection has a configurable prop. Never pass a
			# server-supplied docname or event handler into a compiled component.
			options = section.get("config") or {}
			result["sections"].append({
				"section_key": str(section.get("section_key", component))[:80],
				"vue_component": component, "render_in": section["render_in"],
				"enabled": 1, "idx": frappe.utils.cint(section.get("idx")),
				"config": {"initiallyOpen": options.get("initiallyOpen") is True}
				if component == "RepairOrdersSection" and isinstance(options, dict) else {},
			})
	except Exception:
		result["unavailable"].append({"id": "layout", "reason": "provider_unavailable"})
	finally:
		if frappe.local.message_log:
			del frappe.local.message_log[messages:]
	return result
