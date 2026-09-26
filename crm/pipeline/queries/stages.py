# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Reads over the pipeline stage sets (CRM Deal Status / CRM Lead Status)."""

import frappe
from frappe import _
from frappe.query_builder import Case, DocType
from frappe.query_builder.functions import Coalesce, Count, Sum

from crm.pipeline.constants import STATUS_DOCTYPES, STATUS_OPTIONAL_COLUMNS


def status_doctype(doctype: str) -> str:
	"""Resolve a caller-supplied doctype to its stage set, rejecting anything else."""
	resolved = STATUS_DOCTYPES.get(doctype)
	if not resolved:
		frappe.throw(_("{0} has no pipeline stages.").format(doctype or "-"), frappe.ValidationError)
	return resolved


def visible_statuses(doctype: str) -> list[dict]:
	"""Pickable stages in board order: hidden ones dropped, shape identical for lead and deal."""
	stage_doctype = status_doctype(doctype)
	present = [column for column in STATUS_OPTIONAL_COLUMNS if frappe.db.has_column(stage_doctype, column)]
	rows = frappe.get_all(
		stage_doctype,
		fields=["name", "color", "position", "type", *present],
		filters={"hidden": 0} if "hidden" in present else None,
		order_by="position asc, name asc",
	)
	for row in rows:
		for column, fallback in STATUS_OPTIONAL_COLUMNS.items():
			row.setdefault(column, fallback)
	return rows


def exclude_hidden_stages(query, status_table):
	"""Drop hidden stages from a query builder statement already joined to the stage table.

	WHY the guard: dashboards must keep answering on a site that has not run the
	pipeline migration yet, where the column does not exist.
	"""
	if frappe.db.has_column("CRM Deal Status", "hidden"):
		query = query.where(status_table.hidden == 0)
	return query


def metric_expressions(deal, status, pipeline_stage=None, pipeline=None):
	"""Commercial amounts in FCRM base currency, calculated before aggregation.

	Deal value is a recorded commercial amount, never proof of invoicing/payment.
	Explicit zero probability is respected. Legacy null probability uses the stage.
	Foreign amounts without a positive stored exchange rate remain unavailable.
	"""
	base_currency = frappe.db.get_single_value("FCRM Settings", "currency") or "USD"
	expected = (
		Case()
		.when(deal.expected_deal_value > 0, deal.expected_deal_value)
		.else_(Coalesce(deal.deal_value, 0))
	)
	value = Case().when((status.type == "Won") & (deal.deal_value > 0), deal.deal_value).else_(expected)
	rate = (
		Case()
		.when(Coalesce(deal.currency, "").isin(["", base_currency]), 1)
		.when(deal.exchange_rate > 0, deal.exchange_rate)
		.else_(None)
	)
	probabilities = [deal.probability]
	if pipeline_stage is not None:
		probabilities.append(pipeline_stage.probability)
	probability = Coalesce(*probabilities, status.probability, 0)
	probability = Case().when(probability < 0, 0).when(probability > 100, 100).else_(probability)
	is_open = status.type.isin(["Open", "Ongoing", "On Hold"])
	if pipeline_stage is not None:
		is_open &= Coalesce(pipeline_stage.archived, 0) == 0
		is_open &= (Coalesce(deal.pipeline, "") == "") | pipeline_stage.name.isnotnull()
		is_open &= Coalesce(pipeline.archived, 0) == 0
	if frappe.db.has_column("CRM Deal Status", "hidden"):
		is_open &= Coalesce(status.hidden, 0) == 0
	return {
		"commercial_value": value * rate,
		"open_expected_value": Case().when(is_open, expected * rate).else_(0),
		"weighted_forecast": Case().when(is_open, expected * rate * probability / 100).else_(0),
		"won_value": Case().when(status.type == "Won", value * rate).else_(0),
		"missing_exchange_rate_count": Case().when(rate.isnull(), 1).else_(0),
	}


def permitted_deals(filters=None, or_filters=None, amounts=False):
	"""Use the list's native permission conditions, including assignments/shares.

	The subquery has no page limit; an outer aggregate never counts joined children
	twice. Financial field restrictions fail closed instead of leaking their sums.
	"""
	from frappe.model import get_permitted_fields

	if amounts:
		financial_fields = {"deal_value", "expected_deal_value", "probability", "currency", "exchange_rate"}
		permitted = set(get_permitted_fields("CRM Deal", permission_type="read"))
		masked = {field.fieldname for field in frappe.get_meta("CRM Deal").get_masked_fields()}
		if not financial_fields.issubset(permitted) or financial_fields & masked:
			frappe.throw(_("You do not have permission to read deal amounts."), frappe.PermissionError)
	return frappe.qb.get_query(
		"CRM Deal",
		fields=["name"],
		filters=filters,
		or_filters=or_filters,
		ignore_permissions=False,
		order_by=None,
	)


def metric_query():
	"""Join the selected pipeline policy when its schema is available."""
	deal, status = DocType("CRM Deal"), DocType("CRM Deal Status")
	query = frappe.qb.from_(deal).left_join(status).on(deal.status == status.name)
	pipeline_stage = pipeline = None
	if frappe.db.has_column("CRM Deal", "pipeline") and frappe.db.exists("DocType", "CRM Pipeline Stage"):
		pipeline_stage = DocType("CRM Pipeline Stage")
		pipeline = DocType("CRM Pipeline")
		query = query.left_join(pipeline_stage).on(
			(pipeline_stage.parent == deal.pipeline) & (pipeline_stage.status == deal.status)
		)
		query = query.left_join(pipeline).on(pipeline.name == deal.pipeline)
	return query, deal, status, metric_expressions(deal, status, pipeline_stage, pipeline)


def deal_metrics(filters=None, or_filters=None):
	"""Exact totals across every permitted matching deal, grouped by status."""
	query, deal, _status, expressions = metric_query()
	query = (
		query.select(deal.status, Count(deal.name).as_("count"))
		.select(*(Sum(expression).as_(name) for name, expression in expressions.items()))
		.where(deal.name.isin(permitted_deals(filters, or_filters, amounts=True)))
		.groupby(deal.status)
	)
	return query.run(as_dict=True)


def pipeline_funnel(from_date=None, to_date=None, filters=None):
	"""Current stage distribution of a creation cohort, with explicit history.

	Pipeline+status is the identity: the same global status can be active in one
	pipeline and archived in another. No traversal/drop-off is inferred.
	"""
	deal_filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	deal = DocType("CRM Deal")
	allowed = permitted_deals(deal_filters)
	if from_date:
		allowed = allowed.where(deal.creation >= frappe.utils.getdate(from_date))
	if to_date:
		allowed = allowed.where(deal.creation < frappe.utils.add_days(frappe.utils.getdate(to_date), 1))
	if from_date and to_date and frappe.utils.getdate(from_date) > frappe.utils.getdate(to_date):
		frappe.throw(_("Start date must be before end date."), frappe.ValidationError)
	has_pipelines = frappe.db.exists("DocType", "CRM Pipeline") and frappe.db.has_column(
		"CRM Deal", "pipeline"
	)
	query = (
		frappe.qb.from_(deal)
		.select(deal.status, Count(deal.name).as_("count"))
		.where(deal.name.isin(allowed))
		.groupby(deal.status)
	)
	if has_pipelines:
		query = query.select(deal.pipeline).groupby(deal.pipeline)
	counts = query.run(as_dict=True)
	count_map = {(row.get("pipeline") or "", row.status): int(row.count) for row in counts}
	if has_pipelines:
		from crm.pipeline.api import get_pipelines

		selected = deal_filters.get("pipeline") if isinstance(deal_filters, dict) else None
		configs = get_pipelines(include_archived=True)
		if isinstance(selected, str):
			configs = [row for row in configs if row.name == selected]
		elif isinstance(selected, list) and len(selected) == 2 and selected[0] == "in":
			configs = [row for row in configs if row.name in selected[1]]
		statuses = [
			frappe._dict(
				{
					**stage,
					"pipeline": config.name,
					"pipeline_name": config.pipeline_name,
					"hidden": bool(stage.get("archived") or config.archived),
				}
			)
			for config in configs
			for stage in config.stages
		]
	else:
		fields = ["name", "type", "position", "probability"]
		if frappe.db.has_column("CRM Deal Status", "hidden"):
			fields.append("hidden")
		statuses = frappe.get_all("CRM Deal Status", fields=fields, order_by="position asc, name asc")
	stages, historical = [], []
	for row in statuses:
		pipeline = row.get("pipeline") or ""
		entry = {
			"stage": row.name,
			"status": row.name,
			"pipeline": pipeline,
			"pipeline_name": row.get("pipeline_name"),
			"type": row.type,
			"position": row.position,
			"probability": row.probability,
			"count": count_map.pop((pipeline, row.name), 0),
		}
		if row.get("hidden"):
			if entry["count"]:
				historical.append({**entry, "hidden": True})
		else:
			stages.append(entry)
	unknown = [
		{
			"stage": name or _("Missing stage"),
			"status": name or "",
			"pipeline": pipeline,
			"type": "Unknown",
			"count": count,
		}
		for (pipeline, name), count in count_map.items()
	]
	won = sum(row["count"] for row in stages + historical if row["type"] == "Won")
	lost = sum(row["count"] for row in stages + historical if row["type"] == "Lost")
	return {
		"stages": stages,
		"historical_stages": historical,
		"unclassified_stages": unknown,
		"won": won,
		"lost": lost,
		"total": sum(row.count for row in counts),
		"conversion": round(100 * won / (won + lost), 1) if won + lost else 0,
		"date_basis": "creation",
	}
