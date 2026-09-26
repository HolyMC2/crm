"""Read-only CRM configuration provenance; native records remain authoritative.

SLA and assignment conditions are deliberately not evaluated without a sales
record. A pipeline/company selector is not a substitute for their native scope.
"""

from urllib.parse import quote

import frappe
from frappe.model import get_permitted_fields
from frappe.utils import get_system_timezone

from crm.pipeline.services.configuration import (
	can_access_pipeline,
	default_pipeline,
	record_company_allowed,
	validate_company,
)

LIMIT = 20


class SourceState(Exception):
	def __init__(self, state):
		self.state = state


def _fields(doctype, fields, *, parenttype=None, permission_type="read"):
	meta = frappe.get_meta(doctype)
	if any(not meta.has_field(field) for field in fields):
		raise SourceState("unavailable")
	permitted = set(get_permitted_fields(doctype, parenttype=parenttype, permission_type=permission_type))
	masked = {field.fieldname for field in meta.get_masked_fields()}
	if not set(fields).issubset(permitted) or set(fields) & masked:
		raise SourceState("denied")


def _doc(doctype, name, fields):
	if not frappe.db.exists("DocType", doctype):
		raise SourceState("unavailable")
	# Document checks preserve native self-access (for example the current User).
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	_fields(doctype, fields)
	return doc


def _source(doc, fields, editor=None):
	can_write = bool(doc.has_permission("write"))
	if can_write:
		try:
			_fields(doc.doctype, fields, permission_type="write")
		except SourceState:
			can_write = False
	return {
		"doctype": doc.doctype,
		"name": doc.name,
		"fields": fields,
		"url": "/app/"
		+ frappe.scrub(doc.doctype).replace("_", "-")
		+ ("" if doc.meta.issingle else "/" + quote(doc.name, safe="")),
		"editor": editor if can_write else None,
		"can_write": can_write,
	}


def _list_source(doctype, fields, editor):
	can_write = bool(frappe.has_permission(doctype, "write"))
	if can_write:
		try:
			_fields(doctype, fields, permission_type="write")
		except SourceState:
			can_write = False
	return {
		"doctype": doctype,
		"name": None,
		"fields": fields,
		"url": "/app/" + frappe.scrub(doctype).replace("_", "-"),
		"editor": editor if can_write else None,
		"can_write": can_write,
	}


def _capture(reader):
	try:
		return reader()
	except SourceState as error:
		return {"state": error.state}
	except frappe.PermissionError:
		return {"state": "denied"}
	except frappe.DoesNotExistError:
		return {"state": "not_configured"}
	except Exception:
		# Do not expose exception messages, masked fields or condition expressions.
		return {"state": "unavailable"}


def _scalar(doctype, name, field, editor):
	doc = _doc(doctype, name, [field])
	value = doc.get(field)
	return {
		"state": "configured" if value not in (None, "") else "not_configured",
		"source": _source(doc, [field], editor),
		"values": {field: value},
	}


def _site_timezone():
	result = _scalar("System Settings", "System Settings", "time_zone", None)
	result["values"]["effective_timezone"] = result["values"]["time_zone"] or get_system_timezone()
	result["values"]["uses_framework_fallback"] = not bool(result["values"]["time_zone"])
	return result


def _system_defaults():
	fields = ["currency", "date_format", "time_format"]
	doc = _doc("System Settings", "System Settings", fields)
	return {
		"state": "configured",
		"source": _source(doc, fields, "Defaults"),
		"values": {field: doc.get(field) for field in fields},
	}


def _choices(company):
	_fields("CRM Pipeline", ["pipeline_name", "sales_company", "archived"])
	frappe.has_permission("CRM Pipeline", "read", throw=True)
	# Include NULL as well as empty global scopes when narrowing by company.
	or_filters = [["sales_company", "=", company], ["sales_company", "is", "not set"]] if company else None
	rows = frappe.get_list(
		"CRM Pipeline",
		filters={"archived": 0},
		or_filters=or_filters,
		fields=["name"],
		order_by="pipeline_name asc",
		limit_page_length=101,
	)
	items = []
	for row in rows[:100]:
		doc = _doc("CRM Pipeline", row.name, ["pipeline_name", "sales_company", "archived"])
		if can_access_pipeline(doc.name):
			items.append({"name": doc.name, "label": doc.pipeline_name, "company": doc.sales_company})
	return {
		"state": "configured" if items else "not_configured",
		"pipelines": items,
		"truncated": len(rows) > 100,
	}


def _pipeline(name, company):
	fields = [
		"pipeline_name",
		"sales_company",
		"currency",
		"probability_policy",
		"is_default",
		"archived",
		"stages",
		"roles",
	]
	frappe.has_permission("CRM Pipeline", "read", throw=True)
	_fields("CRM Pipeline", fields)
	chosen = name or default_pipeline(company)
	if not chosen:
		return {"state": "not_configured", "source": _list_source("CRM Pipeline", fields, "Sales pipelines")}
	if not can_access_pipeline(chosen):
		raise SourceState("denied")
	doc = _doc("CRM Pipeline", chosen, fields)
	if company and doc.sales_company and doc.sales_company != company:
		raise SourceState("denied")
	if not record_company_allowed(doc.sales_company):
		raise SourceState("denied")
	validate_company(doc.sales_company)
	stage_fields = [
		"status",
		"probability",
		"archived",
		"allowed_from",
		"required_fields",
		"transition_roles",
	]
	_fields("CRM Pipeline Stage", stage_fields, parenttype="CRM Pipeline")
	_fields("CRM Pipeline Role", ["role"], parenttype="CRM Pipeline")
	stages = []
	for row in doc.stages:
		status = _doc("CRM Deal Status", row.status, ["type", "hidden"])
		stages.append(
			{
				"status": status.name,
				"probability": row.probability,
				"type": status.type,
				"archived": bool(row.archived or status.hidden),
				"has_entry_requirements": bool(
					row.allowed_from or row.required_fields or row.transition_roles
				),
			}
		)
	resolved_company = company or doc.sales_company or None
	default_name = default_pipeline(resolved_company)
	default = {"state": "not_configured"}
	if default_name:

		def read_default():
			default_doc = _doc("CRM Pipeline", default_name, ["pipeline_name", "sales_company", "is_default"])
			return {
				"state": "configured",
				"name": default_doc.name,
				"label": default_doc.pipeline_name,
				"company": default_doc.sales_company,
				"reason": "explicit_default" if default_doc.is_default else "only_pipeline",
			}

		default = _capture(read_default)
	return {
		"state": "configured",
		"source": _source(doc, fields, "Sales pipelines"),
		"values": {
			"name": doc.name,
			"label": doc.pipeline_name,
			"company": doc.sales_company,
			"currency": doc.currency,
			"probability_policy": doc.probability_policy,
			"archived": bool(doc.archived),
			"selection": "explicit" if name else "default",
			"default": default,
			"roles": [row.role for row in doc.roles],
		},
		"items": stages,
	}


def _holiday(name):
	if not name:
		return {"state": "not_configured"}
	fields = ["from_date", "to_date", "holidays"]
	doc = _doc("CRM Holiday List", name, fields)
	_fields("CRM Holiday", ["date", "weekly_off"], parenttype=doc.doctype)
	rows = sorted(doc.holidays, key=lambda row: str(row.date))
	return {
		"state": "configured",
		"source": _source(doc, fields),
		"values": {"from_date": doc.from_date, "to_date": doc.to_date},
		"items": [{"date": row.date, "weekly_off": bool(row.weekly_off)} for row in rows[:100]],
		"truncated": len(rows) > 100,
	}


def _sla(doc):
	_fields("CRM Service Day", ["workday", "start_time", "end_time"], parenttype=doc.doctype)
	return {
		"source": _source(doc, SLA_FIELDS, "SLA Policies"),
		"name": doc.name,
		"document_type": doc.apply_on,
		"enabled": bool(doc.enabled),
		"default": bool(doc.default),
		"start_date": doc.start_date,
		"end_date": doc.end_date,
		"conditional": bool(doc.condition or doc.condition_json),
		"hours": [
			{"day": row.workday, "start": str(row.start_time), "end": str(row.end_time)}
			for row in doc.working_hours
		],
		"holiday": _capture(lambda: _holiday(doc.holiday_list)),
	}


def _assignment(doc):
	_fields("Assignment Rule Day", ["day"], parenttype=doc.doctype)
	return {
		"source": _source(doc, ASSIGNMENT_FIELDS, "Assignment Rules"),
		"name": doc.name,
		"document_type": doc.document_type,
		"enabled": not bool(doc.disabled),
		"priority": doc.priority,
		"method": doc.rule,
		"conditional": bool(doc.assign_condition),
		"weekdays": [row.day for row in doc.assignment_days],
	}


def _rules(doctype, type_field, fields, transform):
	if not frappe.db.exists("DocType", doctype):
		raise SourceState("unavailable")
	frappe.has_permission(doctype, "read", throw=True)
	_fields(doctype, fields)
	types = [kind for kind in ("CRM Lead", "CRM Deal") if frappe.has_permission(kind, "read")]
	if not types:
		raise SourceState("denied")
	rows = frappe.get_list(
		doctype,
		filters={type_field: ["in", types]},
		fields=["name"],
		order_by="modified desc, name asc",
		limit_page_length=LIMIT + 1,
	)
	items, warnings = [], set()
	for row in rows[:LIMIT]:
		result = _capture(lambda: {"state": "configured", "item": transform(_doc(doctype, row.name, fields))})
		if result["state"] == "configured":
			items.append(result["item"])
		else:
			warnings.add(result["state"])
	return {
		"state": "configured"
		if items
		else (
			"unavailable"
			if "unavailable" in warnings
			else "denied"
			if "denied" in warnings
			else "not_configured"
		),
		"items": items,
		"warnings": sorted(warnings),
		"truncated": len(rows) > LIMIT,
		"applicability": "record_conditions_required",
		"source": _list_source(
			doctype,
			fields,
			"SLA Policies" if doctype == "CRM Service Level Agreement" else "Assignment Rules",
		),
	}


SLA_FIELDS = [
	"apply_on",
	"enabled",
	"default",
	"start_date",
	"end_date",
	"condition",
	"condition_json",
	"working_hours",
	"holiday_list",
]
ASSIGNMENT_FIELDS = ["document_type", "disabled", "priority", "rule", "assign_condition", "assignment_days"]


@frappe.whitelist()
def get_effective_settings(pipeline=None, company=None):
	frappe.only_for(["System Manager", "Sales Manager"])
	for value in (pipeline, company):
		if value is not None and (
			not isinstance(value, str) or len(value) > 140 or any(ord(character) < 32 for character in value)
		):
			frappe.throw("Choose a valid pipeline and company scope.")
	if not record_company_allowed(company):
		frappe.throw("This company scope is unavailable.", frappe.PermissionError)
	validate_company(company)
	sections = {
		"pipeline": _capture(lambda: _pipeline(pipeline, company)),
		"site_timezone": _capture(_site_timezone),
		"system_defaults": _capture(_system_defaults),
		"personal_timezone": _capture(
			lambda: _scalar("User", frappe.session.user, "time_zone", "Preferences")
		),
		"crm_currency": _capture(lambda: _scalar("FCRM Settings", "FCRM Settings", "currency", "Dashboard")),
		"hierarchy": _capture(
			lambda: _scalar("FCRM Settings", "FCRM Settings", "enable_sales_hierarchy", "Sales Hierarchy")
		),
		"slas": _capture(lambda: _rules("CRM Service Level Agreement", "apply_on", SLA_FIELDS, _sla)),
		"assignment": _capture(
			lambda: _rules("Assignment Rule", "document_type", ASSIGNMENT_FIELDS, _assignment)
		),
	}
	# Only reveal a fallback once its source's native record and field reads succeeded.
	site = sections["site_timezone"]
	personal = sections["personal_timezone"]
	if "values" in personal:
		personal["values"]["effective_timezone"] = personal["values"]["time_zone"] or site.get(
			"values", {}
		).get("effective_timezone")
		personal["values"]["inherits_site"] = not bool(personal["values"]["time_zone"])
	return {
		"scope": {
			"pipeline": sections["pipeline"].get("values", {}).get("name") or pipeline or None,
			"company": company or sections["pipeline"].get("values", {}).get("company") or None,
		},
		"choices": _capture(lambda: _choices(company)),
		"sections": sections,
	}
