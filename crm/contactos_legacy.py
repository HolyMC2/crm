"""A single native view can migrate only with an explicit source constraint.

Reasons are English msgids; crm.api.contactos.get_legacy_view translates them.
"""

import json

SOURCE_TYPES = {"contact": "Contact", "organization": "CRM Organization"}
OPERATORS = {"=", "!=", "like", "in", "not in", "is"}


def translate_view(source, view, permitted_fields):
	if source not in SOURCE_TYPES or view.get("dt") != SOURCE_TYPES[source]:
		return {
			"supported": False,
			"reason": "This view belongs to another record type. Review its filters.",
		}
	if view.get("type", "list") != "list" or view.get("group_by_field"):
		return {
			"supported": False,
			"reason": "This grouped view needs review. Open Edit filters to continue.",
		}
	try:
		filters = (
			json.loads(view.get("filters") or "{}")
			if isinstance(view.get("filters"), str)
			else view.get("filters") or {}
		)
	except ValueError:
		return {
			"supported": False,
			"reason": "The saved filters could not be read. Review the previous view.",
		}
	if not isinstance(filters, dict) or len(filters) > 12:
		return {"supported": False, "reason": "These filters need review before the list opens."}
	native = []
	for field, condition in filters.items():
		if field not in permitted_fields:
			return {
				"supported": False,
				"reason": "You cannot apply some fields of this view. Ask for access or review its filters.",
			}
		operator, value = ("=", condition)
		if isinstance(condition, list):
			if len(condition) != 2:
				return {"supported": False, "reason": "Este filtro necesita revisión."}
			operator, value = condition
		if operator not in OPERATORS or isinstance(value, dict):
			return {"supported": False, "reason": "Este tipo de filtro necesita revisión."}
		native.append([field, operator, value])
	return {
		"supported": True,
		"title": view.get("label") or "Vista anterior",
		"filters": {"source": source, "native_filters": native},
	}
