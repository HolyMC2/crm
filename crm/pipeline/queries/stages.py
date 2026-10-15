# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Reads over the pipeline stage sets (CRM Deal Status / CRM Lead Status)."""

import frappe
from frappe import _
from frappe.query_builder import Case, DocType
from frappe.query_builder.functions import Coalesce, Count, Sum
from pypika.terms import ValueWrapper

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


# ── Metric contract ─────────────────────────────────────────────────────────
# One definition of the commercial numbers for every surface: the deals list
# summary, the board column totals, the funnel, the dashboard and the reports
# (docs/CRM_METRIC_CONTRACT.md). Change it here, bump the version, and tell
# the consumers.
METRIC_CONTRACT_VERSION = 2
# A deal amount above this multiple of the tenant's p95 is flagged and kept
# out of sums and averages instead of silently dominating them.
OUTLIER_FACTOR = 100
# Below this many priced deals a percentile says nothing; no guard applies.
OUTLIER_MIN_SAMPLE = 20
OUTLIER_CACHE_KEY = "crm:metric_outlier_threshold"
OUTLIER_CACHE_SECONDS = 600


def _base_currency():
	return frappe.db.get_single_value("FCRM Settings", "currency") or "USD"


def _rate(deal, base_currency):
	"""Multiplier into base currency, or NULL when a foreign amount has no stored rate."""
	return (
		Case()
		.when(Coalesce(deal.currency, "").isin(["", base_currency]), 1)
		.when(deal.exchange_rate > 0, deal.exchange_rate)
		.else_(None)
	)


def outlier_threshold() -> float | None:
	"""``OUTLIER_FACTOR`` x the tenant p95 of priced deals in base currency.

	Tenant-wide (not the caller's permission scope) so every user and every
	surface flags the same deals. The amount is the larger of the expected and
	the recorded value. Cached for ten minutes; ``frappe.flags`` can pin it.
	"""
	if "crm_metric_outlier_threshold" in frappe.flags:
		return frappe.flags.crm_metric_outlier_threshold
	cached = frappe.cache.get_value(OUTLIER_CACHE_KEY)
	if isinstance(cached, dict):
		return cached.get("threshold")
	threshold = _compute_outlier_threshold()
	frappe.cache.set_value(OUTLIER_CACHE_KEY, {"threshold": threshold}, expires_in_sec=OUTLIER_CACHE_SECONDS)
	return threshold


def _deal_size(deal):
	"""The larger of the expected and the recorded amount, in the deal currency."""
	expected = Coalesce(deal.expected_deal_value, 0)
	recorded = Coalesce(deal.deal_value, 0)
	return Case().when(expected > recorded, expected).else_(recorded)


def _compute_outlier_threshold() -> float | None:
	deal = DocType("CRM Deal")
	size = _deal_size(deal) * _rate(deal, _base_currency())
	priced = frappe.qb.from_(deal).where(size > 0)
	count = priced.select(Count(deal.name)).run()[0][0] or 0
	if count < OUTLIER_MIN_SAMPLE:
		return None
	# Nearest-rank p95: the smallest amount with at least 95 % of priced deals at or below it.
	rank = -(-count * 95 // 100)
	p95 = priced.select(size.as_("size")).orderby(size).limit(1).offset(rank - 1).run()[0][0]
	return float(p95) * OUTLIER_FACTOR if p95 else None


def _erp_amounts_table(base_currency):
	"""Submitted invoices per deal in the company currency, when ERP links deals.

	Invoiced = submitted Sales Invoices with ``crm_deal`` plus POS Invoices with
	``crm_deal`` not yet consolidated; credit notes subtract. Collected =
	invoiced minus outstanding. Only companies whose currency is the CRM base
	currency count; other amounts are unavailable rather than mixed.
	Returns None when ERP is absent or the user may not read invoices.
	"""
	parts = []
	for doctype in ("Sales Invoice", "POS Invoice"):
		if not (
			frappe.db.exists("DocType", doctype)
			and frappe.db.has_column(doctype, "crm_deal")
			and frappe.has_permission(doctype, "read")
		):
			continue
		invoice, company = DocType(doctype), DocType("Company")
		outstanding = (
			Case()
			.when(
				invoice.party_account_currency == invoice.currency,
				invoice.outstanding_amount * invoice.conversion_rate,
			)
			.else_(invoice.outstanding_amount)
		)
		part = (
			frappe.qb.from_(invoice)
			.join(company)
			.on(company.name == invoice.company)
			.select(
				invoice.crm_deal.as_("deal"),
				invoice.base_grand_total.as_("invoiced"),
				(invoice.base_grand_total - outstanding).as_("collected"),
			)
			.where(invoice.docstatus == 1)
			.where(Coalesce(invoice.crm_deal, "") != "")
			.where(company.default_currency == base_currency)
		)
		if doctype == "POS Invoice":
			part = part.where(Coalesce(invoice.consolidated_invoice, "") == "")
		parts.append(part)
	if not parts:
		return None
	union = parts[0]
	for part in parts[1:]:
		union = union.union_all(part)
	return (
		frappe.qb.from_(union)
		.select(union.deal, Sum(union.invoiced).as_("invoiced"), Sum(union.collected).as_("collected"))
		.groupby(union.deal)
	).as_("erp_amounts")


def metric_expressions(
	deal,
	status,
	pipeline_stage=None,
	pipeline=None,
	*,
	include_eligibility=False,
	erp=None,
	in_deal_currency=False,
	per_deal=False,
):
	"""Commercial amounts per deal, calculated before aggregation (contract v2).

	- expected: ``expected_deal_value`` when positive, else ``deal_value``.
	- recorded (commercial_value): ``deal_value`` for a Won deal with one, else expected.
	- probability: the deal's own, else the pipeline stage's, else the status's;
	  an explicit zero is respected; clamped to 0-100.
	- open = status type Open/Ongoing/On Hold on a live (not archived/hidden) stage.
	  Won and Lost never add to the open value or the forecast.
	- Amounts are in FCRM base currency (or the deal's own currency with
	  ``in_deal_currency``). A foreign amount without a stored rate is NULL and
	  counted in ``missing_exchange_rate_count``.
	- A deal above ``outlier_threshold()`` is NULL in every amount and counted in
	  ``outlier_count``/``outlier_value``: flagged, never averaged.
	- invoiced/collected come from ERP documents (``erp`` table), never from the
	  deal fields; NULL when ERP is absent or unreadable.
	"""
	base_currency = _base_currency()
	expected = (
		Case()
		.when(deal.expected_deal_value > 0, deal.expected_deal_value)
		.else_(Coalesce(deal.deal_value, 0))
	)
	value = Case().when((status.type == "Won") & (deal.deal_value > 0), deal.deal_value).else_(expected)
	rate = _rate(deal, base_currency)
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
	size = _deal_size(deal) * rate
	threshold = outlier_threshold()
	is_outlier = size > threshold if threshold else None
	# The amount multiplier: NULL for an unconvertible or flagged deal.
	factor = rate if is_outlier is None else Case().when(is_outlier, None).else_(rate)
	if in_deal_currency:
		factor = Case().when(factor.isnull(), None).else_(1)

	def money(amount):
		return amount * factor

	expressions = {
		"commercial_value": money(value),
		"open_expected_value": Case().when(is_open, money(expected)).else_(0),
		"weighted_forecast": Case().when(is_open, money(expected) * probability / 100).else_(0),
		"won_value": Case().when(status.type == "Won", money(value)).else_(0),
		"missing_exchange_rate_count": Case().when(rate.isnull(), 1).else_(0),
		"outlier_count": Case().when(is_outlier, 1).else_(0) if is_outlier is not None else ValueWrapper(0),
		"outlier_value": Case().when(is_outlier, size).else_(0)
		if is_outlier is not None
		else ValueWrapper(0),
	}
	if erp is not None:
		erp_factor = 1
		if in_deal_currency:
			erp_factor = Case().when(rate.isnull(), None).else_(1 / rate)
		expressions["invoiced_value"] = Coalesce(erp.invoiced, 0) * erp_factor
		expressions["collected_value"] = Coalesce(erp.collected, 0) * erp_factor
	else:
		expressions["invoiced_value"] = ValueWrapper(None)
		expressions["collected_value"] = ValueWrapper(None)
	if include_eligibility or per_deal:
		# Count eligibility independently of money: an actual zero still belongs in an average.
		expressions["open_deal"] = Case().when(is_open, 1).else_(0)
	if per_deal:
		# Only meaningful for one deal; sums of these say nothing.
		expressions["expected_value"] = money(expected)
		# The unguarded amount, so a flagged deal can still show (and fix) its value.
		expressions["size"] = _deal_size(deal)
		expressions["probability"] = probability
		expressions["status_type"] = status.type
	return expressions


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


def metric_query(*, include_eligibility=False, in_deal_currency=False, per_deal=False):
	"""Join the selected pipeline policy and ERP amounts when their schema is available."""
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
	erp = _erp_amounts_table(_base_currency())
	if erp is not None:
		query = query.left_join(erp).on(erp.deal == deal.name)
	return (
		query,
		deal,
		status,
		metric_expressions(
			deal,
			status,
			pipeline_stage,
			pipeline,
			include_eligibility=include_eligibility,
			erp=erp,
			in_deal_currency=in_deal_currency,
			per_deal=per_deal,
		),
	)


def contract_info() -> dict:
	"""What a consumer needs to label the numbers: version, currency, guards."""
	return {
		"version": METRIC_CONTRACT_VERSION,
		"currency": _base_currency(),
		"outlier_threshold": outlier_threshold(),
		"outlier_factor": OUTLIER_FACTOR,
		"erp_amounts": _erp_amounts_table(_base_currency()) is not None,
	}


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


def deal_amounts(names, *, in_deal_currency=True) -> dict[str, dict]:
	"""The contract per deal, for rows and records the caller may read.

	Amounts are in each deal's own currency by default (what a row or Deal 360
	shows); pass ``in_deal_currency=False`` for base currency.
	"""
	names = [name for name in (names or []) if isinstance(name, str) and name][:500]
	if not names:
		return {}
	query, deal, _status, expressions = metric_query(in_deal_currency=in_deal_currency, per_deal=True)
	rows = (
		query.select(deal.name, deal.currency)
		.select(*(expression.as_(name) for name, expression in expressions.items()))
		.where(deal.name.isin(names))
		.where(deal.name.isin(permitted_deals({"name": ["in", names]}, amounts=True)))
		.run(as_dict=True)
	)
	result = {}
	for row in rows:
		row["outlier"] = bool(row.pop("outlier_count", 0))
		row["missing_exchange_rate"] = bool(row.pop("missing_exchange_rate_count", 0))
		row["open"] = bool(row.pop("open_deal", 0))
		row["currency"] = row.currency or _base_currency()
		result[row.pop("name")] = row
	return result


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
	pipeline_names = {}
	if has_pipelines:
		from crm.pipeline.api import get_pipelines

		selected = deal_filters.get("pipeline") if isinstance(deal_filters, dict) else None
		configs = get_pipelines(include_archived=True)
		if isinstance(selected, str):
			configs = [row for row in configs if row.name == selected]
		elif isinstance(selected, list) and len(selected) == 2 and selected[0] == "in":
			configs = [row for row in configs if row.name in selected[1]]
		pipeline_names = {config.name: config.pipeline_name for config in configs}
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
	from crm.pipeline.labels import pipeline_label, stage_label, translates

	# "stage" and "pipeline_name" are what the funnel and the dashboard draw: the
	# standard names in the worker's language. "status" and "pipeline" stay the
	# stored identities for drill-down and for matching one period with another.
	translated = translates("CRM Deal Status")
	stages, historical = [], []
	for row in statuses:
		pipeline = row.get("pipeline") or ""
		entry = {
			"stage": stage_label(row.name, translated=translated),
			"status": row.name,
			"pipeline": pipeline,
			"pipeline_name": pipeline_label(row.get("pipeline_name")) or None,
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
			"pipeline_name": pipeline_label(pipeline_names.get(pipeline)) or None,
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
