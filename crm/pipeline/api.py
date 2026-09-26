# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Whitelisted entrypoints for the pipeline. Authorization and delegation only."""

import frappe

from crm.pipeline.queries.stages import status_doctype, visible_statuses


@frappe.whitelist()
def get_visible_stages(doctype: str, pipeline: str | None = None):
	"""Stages a picker, board or funnel may offer for CRM Deal / CRM Lead."""
	frappe.has_permission(status_doctype(doctype), throw=True)
	if pipeline and status_doctype(doctype) == "CRM Deal Status":
		config = next((row for row in get_pipelines(include_archived=True) if row.name == pipeline), None)
		if not config:
			frappe.throw("Pipeline is unavailable.", frappe.PermissionError)
		return [row for row in config.stages if not row["archived"]]
	return visible_statuses(doctype)


@frappe.whitelist()
def get_pipelines(include_archived: bool = False):
	"""Effective pipeline setup for the current actor; no unscoped discovery."""
	from crm.pipeline.services.configuration import allowed_pipeline_names, installed

	frappe.has_permission("CRM Deal", "read", throw=True)
	if not installed():
		return []
	allowed = allowed_pipeline_names()
	if not allowed:
		return []
	filters = {"name": ["in", allowed]}
	if not include_archived:
		filters["archived"] = 0
	pipelines = frappe.get_all(
		"CRM Pipeline",
		filters=filters,
		fields=[
			"name",
			"pipeline_name",
			"sales_company",
			"currency",
			"is_default",
			"archived",
			"probability_policy",
			"modified",
		],
		order_by="pipeline_name asc",
	)
	stages = (
		frappe.get_all(
			"CRM Pipeline Stage",
			filters={"parent": ["in", [row.name for row in pipelines]]},
			fields=[
				"parent",
				"status",
				"probability",
				"archived",
				"idx",
				"required_fields",
				"allowed_from",
				"transition_roles",
			],
			order_by="idx asc",
		)
		if pipelines
		else []
	)
	statuses = {
		row.name: row for row in frappe.get_all("CRM Deal Status", fields=["name", "type", "color", "hidden"])
	}
	for pipeline in pipelines:
		pipeline["stages"] = [
			{
				**row,
				"name": row.status,
				"position": row.idx,
				"type": statuses.get(row.status, {}).get("type"),
				"color": statuses.get(row.status, {}).get("color"),
				"archived": int(bool(row.archived or statuses.get(row.status, {}).get("hidden"))),
				"hidden": int(bool(row.archived or statuses.get(row.status, {}).get("hidden"))),
			}
			for row in stages
			if row.parent == pipeline.name
		]
	return pipelines


@frappe.whitelist()
def preview_pipeline_mapping():
	from crm.pipeline.services.migration import preview

	frappe.has_permission("CRM Pipeline", "write", throw=True)
	return preview()


@frappe.whitelist()
def save_pipeline(data: dict):
	"""Native optimistic locking and controller checks apply to configuration."""
	data = frappe.parse_json(data)
	allowed = (
		"pipeline_name",
		"sales_company",
		"currency",
		"is_default",
		"archived",
		"probability_policy",
		"stages",
		"roles",
	)
	if data.get("name"):
		frappe.db.sql("SELECT name FROM `tabCRM Pipeline` WHERE name = %s FOR UPDATE", data["name"])
		doc = frappe.get_doc("CRM Pipeline", data["name"])
		doc.check_permission("write")
		if not data.get("modified") or str(data["modified"]) != str(doc.modified):
			frappe.throw("Pipeline settings changed. Reload before saving.", frappe.TimestampMismatchError)
	else:
		frappe.has_permission("CRM Pipeline", "create", throw=True)
		doc = frappe.new_doc("CRM Pipeline")
	for key in allowed:
		if key in data:
			if key in ("stages", "roles"):
				fields = (
					(
						"status",
						"probability",
						"archived",
						"required_fields",
						"allowed_from",
						"transition_roles",
					)
					if key == "stages"
					else ("role",)
				)
				doc.set(key, [{field: row.get(field) for field in fields} for row in data[key]])
			else:
				doc.set(key, data[key])
	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def get_pipeline_settings(name: str):
	doc = frappe.get_doc("CRM Pipeline", name)
	doc.check_permission("write")
	return doc.as_dict()


@frappe.whitelist()
def get_pipeline_editor_options():
	frappe.has_permission("CRM Pipeline", "write", throw=True)
	return {
		"stages": frappe.get_list(
			"CRM Deal Status",
			fields=["name", "type", "probability"],
			order_by="position asc",
			limit_page_length=0,
		),
		"roles": frappe.get_all("Role", filters={"disabled": 0}, pluck="name", order_by="name asc"),
		"fields": [
			{"name": field.fieldname, "label": field.label}
			for field in frappe.get_meta("CRM Deal").fields
			if field.fieldtype
			in (
				"Data",
				"Link",
				"Currency",
				"Date",
				"Datetime",
				"Small Text",
				"Text",
				"Select",
				"Int",
				"Float",
				"Percent",
			)
			and not field.read_only
		],
	}


@frappe.whitelist()
def change_deal_pipeline(name: str, values: dict, modified: str):
	values = frappe.parse_json(values)
	frappe.db.sql("SELECT name FROM `tabCRM Deal` WHERE name = %s FOR UPDATE", name)
	doc = frappe.get_doc("CRM Deal", name)
	doc.check_permission("write")
	if str(doc.modified) != str(modified):
		frappe.throw("This deal changed. Reload before choosing a pipeline.", frappe.TimestampMismatchError)
	for field in ("pipeline", "sales_company", "status", "currency"):
		if field in values:
			doc.set(field, values[field])
	doc.save()
	return {"name": doc.name, "pipeline": doc.pipeline, "status": doc.status, "modified": doc.modified}
