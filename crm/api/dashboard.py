import json

import frappe
from frappe import _
from frappe.query_builder import Case, DocType
from frappe.query_builder.functions import Avg, Coalesce, Count, Date, DateFormat, IfNull, Sum
from pypika.functions import Function

from crm.fcrm.doctype.crm_dashboard.crm_dashboard import create_default_manager_dashboard
from crm.pipeline.queries.stages import exclude_hidden_stages, metric_query, permitted_deals, pipeline_funnel
from crm.utils import sales_user_only


# Custom function for TIMESTAMPDIFF (MySQL/MariaDB)
class TimestampDiff(Function):
	def __init__(self, unit, start, end, **kwargs):
		super().__init__("TIMESTAMPDIFF", unit, start, end, **kwargs)


@frappe.whitelist()
def reset_to_default():
	frappe.only_for("System Manager", True)
	create_default_manager_dashboard(force=True)


@frappe.whitelist()
@sales_user_only
def get_dashboard(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get the dashboard data for the CRM dashboard.
	"""

	if not from_date or not to_date:
		from_date = frappe.utils.get_first_day(from_date or frappe.utils.nowdate())
		to_date = frappe.utils.get_last_day(to_date or frappe.utils.nowdate())

	dashboard = frappe.db.exists("CRM Dashboard", "Manager Dashboard")

	layout = []

	if not dashboard:
		layout = json.loads(create_default_manager_dashboard())
		frappe.db.commit()
	else:
		layout = json.loads(frappe.db.get_value("CRM Dashboard", "Manager Dashboard", "layout") or "[]")

	for l in layout:
		method_name = f"get_{l['name']}"
		if hasattr(frappe.get_attr("crm.api.dashboard"), method_name):
			method = getattr(frappe.get_attr("crm.api.dashboard"), method_name)
			l["data"] = _read_chart(method, from_date, to_date, user)
		else:
			l["data"] = None

	return layout


@frappe.whitelist()
@sales_user_only
def get_chart(
	name: str, type: str, from_date: str | None = None, to_date: str | None = None, user: str | None = None
):
	"""
	Get number chart data for the dashboard.
	"""
	if not from_date or not to_date:
		from_date = frappe.utils.get_first_day(from_date or frappe.utils.nowdate())
		to_date = frappe.utils.get_last_day(to_date or frappe.utils.nowdate())

	method_name = f"get_{name}"
	if hasattr(frappe.get_attr("crm.api.dashboard"), method_name):
		method = getattr(frappe.get_attr("crm.api.dashboard"), method_name)
		return _read_chart(method, from_date, to_date, user)
	else:
		return {"error": _("Invalid chart name")}


def _read_chart(method, *args):
	try:
		return method(*args)
	except frappe.PermissionError:
		return {
			"unavailable": True,
			"reason": _(
				"Your permissions do not allow this metric. Other permitted metrics remain available."
			),
		}


def _scoped_users(user):
	"""Additional owner filter; native record permission scope is always applied."""
	if user:
		return [user]

	from crm.permissions.org_hierarchy import _in_hierarchy, hierarchy_enabled

	session = frappe.session.user
	if session == "Administrator":
		return None

	roles = frappe.get_roles(session)
	if "System Manager" in roles:
		return None

	if "Sales Manager" in roles and hierarchy_enabled() and _in_hierarchy(session):
		users = frappe.db.sql(
			"""select m2.user from `tabCRM Sales Hierarchy` m1
			   join `tabCRM Sales Hierarchy` m2 on m2.lft >= m1.lft and m2.lft <= m1.rgt
			   where m1.user = %s and coalesce(m2.user, '') <> ''""",
			session,
			pluck=True,
		)
		return users or [session]

	return None


def _permitted_from(doctype, table, fields):
	from crm.api.sales_reports import _fields

	_fields(doctype, fields)
	return frappe.qb.from_(table).where(table.name.isin(_permitted_names(doctype)))


def _permitted_names(doctype):
	return frappe.qb.get_query(doctype, fields=["name"], ignore_permissions=False, order_by=None)


def _period_bounds(from_date, to_date):
	"""Inclusive dates and an immediately preceding window of the same length."""
	start = frappe.utils.getdate(from_date or frappe.utils.get_first_day(frappe.utils.nowdate()))
	end = frappe.utils.getdate(to_date or frappe.utils.get_last_day(frappe.utils.nowdate()))
	if start > end:
		frappe.throw(_("Start date must be before end date."), frappe.ValidationError)
	return start, frappe.utils.add_days(end, 1), frappe.utils.add_days(start, -(end - start).days - 1)


def _metric_base(fields, user=None, *, amounts=True):
	from crm.api.sales_reports import _fields

	_fields("CRM Deal", ["status", "deal_owner", *fields])
	if frappe.db.has_column("CRM Deal", "pipeline"):
		_fields("CRM Deal", ["pipeline"])
	query, deal, status, expressions = metric_query(include_eligibility=True)
	users = _scoped_users(user)
	allowed = permitted_deals({"deal_owner": ["in", users]} if users else None, amounts=amounts)
	return query.where(deal.name.isin(allowed)), deal, status, expressions


def _amount_note(missing):
	return _("Excluded {0} deals with missing exchange rates.").format(missing) if missing else ""


def _average_value(from_date, to_date, user, kind, title, definition):
	start, end, previous = _period_bounds(from_date, to_date)
	date_basis = "closed_date" if kind == "won" else "creation"
	query, deal, status, amounts = _metric_base([date_basis], user)
	eligible = status.type == "Won" if kind == "won" else amounts["open_deal"] == 1
	if kind == "combined":
		eligible |= status.type == "Won"
	date = deal[date_basis]
	query = query.where(eligible).where(date >= previous).where(date < end)
	for key, condition in (("current", date >= start), ("previous", date < start)):
		query = query.select(
			Avg(Case().when(condition, amounts["commercial_value"]).else_(None)).as_(key),
			Count(Case().when(condition, amounts["commercial_value"]).else_(None)).as_(f"{key}_count"),
			Sum(Case().when(condition, amounts["missing_exchange_rate_count"]).else_(0)).as_(
				f"{key}_missing"
			),
		)
	row = query.run(as_dict=True)[0]
	missing = int(row.current_missing or 0)
	note = " ".join(part for part in (definition, _amount_note(missing)) if part)
	if row.previous_missing:
		note += " " + _("Previous period excludes {0} deals with missing exchange rates.").format(
			int(row.previous_missing)
		)
	return {
		"title": title,
		"tooltip": note,
		"metric_note": note,
		"value": row.current or 0,
		"delta": None
		if row.previous_missing and not row.previous_count
		else (row.current or 0) - (row.previous or 0),
		"deltaSuffix": " " + _base_currency(),
		"prefix": get_base_currency_symbol(),
		"currency": _base_currency(),
		"date_basis": date_basis,
		"sample_count": int(row.current_count or 0),
		"missing_exchange_rate_count": missing,
		"previous_sample_count": int(row.previous_count or 0),
		"previous_missing_exchange_rate_count": int(row.previous_missing or 0),
		"unavailable": bool(missing and not row.current_count),
		"reason": _amount_note(missing) + " " + _("No amounts can be converted to the base currency.")
		if missing and not row.current_count
		else None,
	}


def _base_currency():
	return frappe.db.get_single_value("FCRM Settings", "currency") or "USD"


def get_total_leads(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get lead count for the dashboard.
	"""
	from_date, to_date_plus_one, prev_from_date = _period_bounds(from_date, to_date)

	Lead = DocType("CRM Lead")
	users = _scoped_users(user)

	# Build conditions for current period
	current_cond = (Lead.creation >= from_date) & (Lead.creation < to_date_plus_one)
	if users:
		current_cond = current_cond & (Lead.lead_owner.isin(users))

	# Build conditions for previous period
	prev_cond = (Lead.creation >= prev_from_date) & (Lead.creation < from_date)
	if users:
		prev_cond = prev_cond & (Lead.lead_owner.isin(users))

	# Build query with CASE expressions
	query = _permitted_from("CRM Lead", Lead, ["creation", "lead_owner", "name"]).select(
		Count(Case().when(current_cond, Lead.name).else_(None)).as_("current_month_leads"),
		Count(Case().when(prev_cond, Lead.name).else_(None)).as_("prev_month_leads"),
	)

	result = query.run(as_dict=True)

	current_month_leads = result[0].current_month_leads or 0
	prev_month_leads = result[0].prev_month_leads or 0

	delta_in_percentage = (
		(current_month_leads - prev_month_leads) / prev_month_leads * 100 if prev_month_leads else 0
	)

	return {
		"title": _("Total leads"),
		"tooltip": _("Total number of leads"),
		"value": current_month_leads,
		"delta": delta_in_percentage,
		"deltaSuffix": "%",
	}


def get_total_repair_orders(
	from_date: str | None = None, to_date: str | None = None, user: str | None = None
):
	"""
	Get repair order count for the dashboard.
	"""
	# Repair Order belongs to the taller vertical, not installed on every tenant
	# (e.g. mumulenceria). Degrade to an empty tile instead of 500-ing the whole
	# dashboard when the doctype is absent.
	if not frappe.db.exists("DocType", "Repair Order"):
		return {
			"title": _("Total repair orders"),
			"unavailable": True,
			"reason": _("Repairs are not installed on this site."),
		}

	from_date, to_date_plus_one, prev_from_date = _period_bounds(from_date, to_date)

	RO = DocType("Repair Order")

	current_cond = (RO.creation >= from_date) & (RO.creation < to_date_plus_one)
	prev_cond = (RO.creation >= prev_from_date) & (RO.creation < from_date)

	query = _permitted_from("Repair Order", RO, ["creation", "name"]).select(
		Count(Case().when(current_cond, RO.name).else_(None)).as_("current_count"),
		Count(Case().when(prev_cond, RO.name).else_(None)).as_("prev_count"),
	)

	result = query.run(as_dict=True)

	current_count = result[0].current_count or 0
	prev_count = result[0].prev_count or 0

	delta_in_percentage = (current_count - prev_count) / prev_count * 100 if prev_count else 0

	return {
		"title": _("Total repair orders"),
		"tooltip": _("Total number of repair orders"),
		"value": current_count,
		"delta": delta_in_percentage,
		"deltaSuffix": "%",
	}


def get_ongoing_deals(from_date=None, to_date=None, user=None):
	start, end, previous = _period_bounds(from_date, to_date)
	query, deal, _status, amounts = _metric_base(["creation"], user, amounts=False)
	row = (
		query.where(amounts["open_deal"] == 1)
		.where(deal.creation >= previous)
		.where(deal.creation < end)
		.select(
			Count(Case().when(deal.creation >= start, deal.name).else_(None)).as_("current"),
			Count(Case().when(deal.creation < start, deal.name).else_(None)).as_("previous"),
		)
		.run(as_dict=True)[0]
	)
	return {
		"title": _("Ongoing deals"),
		"tooltip": _(
			"Active Open, Ongoing and On Hold deals created in the selected period; historical stages remain in stage charts."
		),
		"value": row.current,
		"delta": 100 * (row.current - row.previous) / row.previous if row.previous else 0,
		"deltaSuffix": "%",
		"date_basis": "creation",
	}


def get_average_ongoing_deal_value(from_date=None, to_date=None, user=None):
	return _average_value(
		from_date,
		to_date,
		user,
		"open",
		_("Avg. ongoing deal value"),
		_("Open expected amount per active open deal created in the selected period; includes zero amounts."),
	)


def get_won_deals(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get won deal count for the dashboard, and also calculate average deal value for won deals.
	"""
	from_date, to_date_plus_one, prev_from_date = _period_bounds(from_date, to_date)

	Deal = DocType("CRM Deal")
	Status = DocType("CRM Deal Status")
	users = _scoped_users(user)

	# Build conditions for current period
	current_cond = (
		(Deal.closed_date >= from_date) & (Deal.closed_date < to_date_plus_one) & (Status.type == "Won")
	)
	if users:
		current_cond = current_cond & (Deal.deal_owner.isin(users))

	# Build conditions for previous period
	prev_cond = (Deal.closed_date >= prev_from_date) & (Deal.closed_date < from_date) & (Status.type == "Won")
	if users:
		prev_cond = prev_cond & (Deal.deal_owner.isin(users))

	# Build query with CASE expressions
	query = (
		_permitted_from("CRM Deal", Deal, ["closed_date", "deal_owner", "name", "status"])
		.join(Status)
		.on(Deal.status == Status.name)
		.select(
			Count(Case().when(current_cond, Deal.name).else_(None)).as_("current_month_deals"),
			Count(Case().when(prev_cond, Deal.name).else_(None)).as_("prev_month_deals"),
		)
	)

	result = query.run(as_dict=True)

	current_month_deals = result[0].current_month_deals or 0
	prev_month_deals = result[0].prev_month_deals or 0

	delta_in_percentage = (
		(current_month_deals - prev_month_deals) / prev_month_deals * 100 if prev_month_deals else 0
	)

	return {
		"title": _("Won deals"),
		"tooltip": _("Total number of won deals based on its closure date"),
		"value": current_month_deals,
		"delta": delta_in_percentage,
		"deltaSuffix": "%",
	}


def get_average_won_deal_value(from_date=None, to_date=None, user=None):
	return _average_value(
		from_date,
		to_date,
		user,
		"won",
		_("Avg. won deal value"),
		_("Won commercial amount per deal closed in the selected period; not invoiced or collected."),
	)


def get_average_deal_value(from_date=None, to_date=None, user=None):
	return _average_value(
		from_date,
		to_date,
		user,
		"combined",
		_("Avg. deal value"),
		_(
			"Average ongoing & won commercial amount for active open and won deals created in the selected period; not invoiced or collected."
		),
	)


def get_average_time_to_close_a_lead(
	from_date: str | None = None, to_date: str | None = None, user: str | None = None
):
	"""
	Get average time to close deals for the dashboard.
	"""
	from_date, to_date_plus_one, prev_from_date = _period_bounds(from_date, to_date)
	prev_to_date = from_date

	Deal = DocType("CRM Deal")
	Status = DocType("CRM Deal Status")
	Lead = DocType("CRM Lead")

	users = _scoped_users(user)

	# Base condition: closed_date is not null and status type is Won
	base_cond = (Deal.closed_date.isnotnull()) & (Status.type == "Won")
	if users:
		base_cond = base_cond & (Deal.deal_owner.isin(users))

	# Current period condition
	current_cond = (Deal.closed_date >= from_date) & (Deal.closed_date < to_date_plus_one)

	# Previous period condition
	prev_cond = (Deal.closed_date >= prev_from_date) & (Deal.closed_date < prev_to_date)

	# Calculate time difference from lead/deal creation to deal closure
	time_diff = TimestampDiff(
		frappe.qb.terms.LiteralValue("DAY"), Coalesce(Lead.creation, Deal.creation), Deal.closed_date
	)

	# Build query
	query = (
		_permitted_from("CRM Deal", Deal, ["closed_date", "creation", "deal_owner", "lead", "status"])
		.join(Status)
		.on(Deal.status == Status.name)
		.left_join(Lead)
		.on((Deal.lead == Lead.name) & Lead.name.isin(_permitted_names("CRM Lead")))
		.where(base_cond)
		.select(
			Avg(Case().when(current_cond, time_diff).else_(None)).as_("current_avg_lead"),
			Avg(Case().when(prev_cond, time_diff).else_(None)).as_("prev_avg_lead"),
		)
	)

	result = query.run(as_dict=True)

	current_avg_lead = result[0].current_avg_lead or 0
	prev_avg_lead = result[0].prev_avg_lead or 0
	delta_lead = current_avg_lead - prev_avg_lead if prev_avg_lead else 0

	return {
		"title": _("Avg. time to close a lead"),
		"tooltip": _("Average time taken from lead creation to deal closure"),
		"value": current_avg_lead,
		"suffix": " days",
		"delta": delta_lead,
		"deltaSuffix": " days",
		"negativeIsBetter": True,
	}


def get_average_time_to_close_a_deal(
	from_date: str | None = None, to_date: str | None = None, user: str | None = None
):
	"""
	Get average time to close deals for the dashboard.
	"""
	from_date, to_date_plus_one, prev_from_date = _period_bounds(from_date, to_date)
	prev_to_date = from_date

	Deal = DocType("CRM Deal")
	Status = DocType("CRM Deal Status")
	Lead = DocType("CRM Lead")

	users = _scoped_users(user)

	# Base condition: closed_date is not null and status type is Won
	base_cond = (Deal.closed_date.isnotnull()) & (Status.type == "Won")
	if users:
		base_cond = base_cond & (Deal.deal_owner.isin(users))

	# Current period condition
	current_cond = (Deal.closed_date >= from_date) & (Deal.closed_date < to_date_plus_one)

	# Previous period condition
	prev_cond = (Deal.closed_date >= prev_from_date) & (Deal.closed_date < prev_to_date)

	# Calculate time difference from deal creation to deal closure
	time_diff = TimestampDiff(frappe.qb.terms.LiteralValue("DAY"), Deal.creation, Deal.closed_date)

	# Build query
	query = (
		_permitted_from("CRM Deal", Deal, ["closed_date", "creation", "deal_owner", "lead", "status"])
		.join(Status)
		.on(Deal.status == Status.name)
		.left_join(Lead)
		.on((Deal.lead == Lead.name) & Lead.name.isin(_permitted_names("CRM Lead")))
		.where(base_cond)
		.select(
			Avg(Case().when(current_cond, time_diff).else_(None)).as_("current_avg_deal"),
			Avg(Case().when(prev_cond, time_diff).else_(None)).as_("prev_avg_deal"),
		)
	)

	result = query.run(as_dict=True)

	current_avg_deal = result[0].current_avg_deal or 0
	prev_avg_deal = result[0].prev_avg_deal or 0
	delta_deal = current_avg_deal - prev_avg_deal if prev_avg_deal else 0

	return {
		"title": _("Avg. time to close a deal"),
		"tooltip": _("Average time taken from deal creation to deal closure"),
		"value": current_avg_deal,
		"suffix": " days",
		"delta": delta_deal,
		"deltaSuffix": " days",
		"negativeIsBetter": True,
	}


def get_sales_trend(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get sales trend data for the dashboard.
	[
		{ date: new Date('2024-05-01'), leads: 45, deals: 23, won_deals: 12 },
		{ date: new Date('2024-05-02'), leads: 50, deals: 30, won_deals: 15 },
		...
	]
	"""
	if not from_date or not to_date:
		from_date = frappe.utils.get_first_day(from_date or frappe.utils.nowdate())
		to_date = frappe.utils.get_last_day(to_date or frappe.utils.nowdate())

	Lead = DocType("CRM Lead")
	Deal = DocType("CRM Deal")
	Status = DocType("CRM Deal Status")

	# Build leads query
	leads_query = (
		_permitted_from("CRM Lead", Lead, ["creation", "lead_owner"])
		.select(
			Date(Lead.creation).as_("date"),
			Count("*").as_("leads"),
			frappe.qb.terms.ValueWrapper(0).as_("deals"),
			frappe.qb.terms.ValueWrapper(0).as_("won_deals"),
		)
		.where(Date(Lead.creation).between(from_date, to_date))
	)

	users = _scoped_users(user)
	if users:
		leads_query = leads_query.where(Lead.lead_owner.isin(users))

	leads_query = leads_query.groupby(Date(Lead.creation))

	# Build deals query
	deals_query = (
		_permitted_from("CRM Deal", Deal, ["creation", "deal_owner", "status"])
		.join(Status)
		.on(Deal.status == Status.name)
		.select(
			Date(Deal.creation).as_("date"),
			frappe.qb.terms.ValueWrapper(0).as_("leads"),
			Count("*").as_("deals"),
			Sum(Case().when(Status.type == "Won", 1).else_(0)).as_("won_deals"),
		)
		.where(Date(Deal.creation).between(from_date, to_date))
	)

	if users:
		deals_query = deals_query.where(Deal.deal_owner.isin(users))

	deals_query = deals_query.groupby(Date(Deal.creation))

	# Combine with UNION ALL and aggregate by date
	union_query = leads_query.union_all(deals_query)

	# Wrap in outer query to aggregate by date
	daily = (
		frappe.qb.from_(union_query)
		.select(
			DateFormat(union_query.date, "%Y-%m-%d").as_("date"),
			Sum(union_query.leads).as_("leads"),
			Sum(union_query.deals).as_("deals"),
			Sum(union_query.won_deals).as_("won_deals"),
		)
		.groupby(union_query.date)
		.orderby(union_query.date)
	)

	result = daily.run(as_dict=True)

	sales_trend = [
		{
			"date": frappe.utils.get_datetime(row.date).strftime("%Y-%m-%d"),
			"leads": row.leads or 0,
			"deals": row.deals or 0,
			"won_deals": row.won_deals or 0,
		}
		for row in result
	]

	return {
		"data": sales_trend,
		"title": _("Sales trend"),
		"subtitle": _("Leads and deals created per day; won deals show their current outcome"),
		"date_basis": "creation",
		"xAxis": {
			"title": _("Date"),
			"key": "date",
			"type": "time",
			"timeGrain": "day",
		},
		"yAxis": {
			"title": _("Count"),
		},
		"series": [
			{"name": "leads", "type": "line", "showDataPoints": True},
			{"name": "deals", "type": "line", "showDataPoints": True},
			{"name": "won_deals", "type": "line", "showDataPoints": True},
		],
	}


def get_forecasted_revenue(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""Open weighted forecast and commercial wins, never invoiced/collected revenue."""
	from_date = frappe.utils.getdate(from_date or frappe.utils.get_first_day(frappe.utils.nowdate()))
	to_date = frappe.utils.getdate(to_date or frappe.utils.get_last_day(frappe.utils.nowdate()))
	if from_date > to_date:
		frappe.throw(_("Start date must be before end date."), frappe.ValidationError)
	base_query, deal, status, amounts = _metric_base(["expected_closure_date", "closed_date"], user)
	result = {}
	missing_rates = 0
	for key, amount, date_field, outcome in (
		(
			"forecasted",
			"weighted_forecast",
			deal.expected_closure_date,
			amounts["open_deal"] == 1,
		),
		("actual", "won_value", deal.closed_date, status.type == "Won"),
	):
		query = (
			base_query.select(
				DateFormat(date_field, "%Y-%m").as_("month"),
				Sum(amounts[amount]).as_("value"),
				Sum(amounts["missing_exchange_rate_count"]).as_("missing_rates"),
			)
			.where(outcome)
			.where(date_field >= from_date)
			.where(date_field < frappe.utils.add_days(to_date, 1))
			.groupby(DateFormat(date_field, "%Y-%m"))
		)
		if key == "forecasted":
			query = exclude_hidden_stages(query, status)
		for row in query.run(as_dict=True):
			month = f"{row.month}-01"
			result.setdefault(month, {"month": month, "forecasted": 0, "actual": 0})[key] = row.value
			missing_rates += row.missing_rates or 0

	return {
		"data": [result[month] for month in sorted(result)],
		"title": _("Open forecast and won value"),
		"metric_note": _(
			"Open weighted forecast uses expected closure date; won commercial amount uses actual closure date. Neither proves invoicing or collection."
		)
		+ (" " + _amount_note(missing_rates) if missing_rates else ""),
		"date_basis": {"forecasted": "expected_closure_date", "actual": "closed_date"},
		"subtitle": _("Open weighted forecast and won deal value; not invoiced or collected amounts")
		+ (
			". " + _("Excluded {0} deals with missing exchange rates.").format(missing_rates)
			if missing_rates
			else ""
		),
		"currency": frappe.db.get_single_value("FCRM Settings", "currency") or "USD",
		"missing_exchange_rate_count": missing_rates,
		"xAxis": {"title": _("Month"), "key": "month", "type": "time", "timeGrain": "month"},
		"yAxis": {"title": _("Deal value") + f" ({get_base_currency_symbol()})"},
		# Keep stored dashboard series keys compatible; `actual` means won value.
		"series": [
			{"name": "forecasted", "type": "line", "showDataPoints": True},
			{"name": "actual", "type": "line", "showDataPoints": True},
		],
	}


@frappe.whitelist()
@sales_user_only
def get_pipeline_funnel(
	from_date: str | None = None, to_date: str | None = None, filters: dict | str | None = None
):
	from crm.pipeline.queries.stages import pipeline_funnel

	return pipeline_funnel(from_date, to_date, filters)


def get_funnel_conversion(from_date=None, to_date=None, user=None):
	"""Conversion belongs to one lead creation cohort, never repeated deal transitions."""
	start, end, _previous = _period_bounds(from_date, to_date)
	lead = DocType("CRM Lead")
	query = _permitted_from("CRM Lead", lead, ["creation", "lead_owner", "converted"])
	query = query.where(lead.creation >= start).where(lead.creation < end)
	users = _scoped_users(user)
	if users:
		query = query.where(lead.lead_owner.isin(users))
	row = query.select(
		Count(lead.name).as_("total"),
		Count(Case().when(lead.converted == 1, lead.name).else_(None)).as_("converted"),
	).run(as_dict=True)[0]
	return {
		"data": [
			{"stage": _("Leads"), "count": row.total},
			{"stage": _("Converted leads"), "count": row.converted},
		],
		"title": _("Lead conversion"),
		"subtitle": _("Current converted state of leads created in the selected period"),
		"date_basis": "creation",
		"conversion": 100 * row.converted / row.total if row.total else 0,
		"xAxis": {"title": _("State"), "key": "stage", "type": "category"},
		"yAxis": {"title": _("Count")},
		"swapXY": True,
		"series": [{"name": "count", "type": "bar", "echartOptions": {"colorBy": "data"}}],
	}


def _stage_distribution(from_date, to_date, user):
	from crm.api.sales_reports import _fields

	_fields("CRM Deal", ["creation", "deal_owner", "status"])
	if frappe.db.has_column("CRM Deal", "pipeline"):
		_fields("CRM Deal", ["pipeline"])
	start, end, _previous = _period_bounds(from_date, to_date)
	users = _scoped_users(user)
	cohort = pipeline_funnel(
		start, frappe.utils.add_days(end, -1), {"deal_owner": ["in", users]} if users else None
	)
	rows = cohort["stages"] + cohort["historical_stages"] + cohort["unclassified_stages"]
	result = []
	for row in rows:
		if not row["count"]:
			continue
		# Keep the exact identities for drill-down and distinguish the same status in different pipelines.
		label = row["stage"]
		if row.get("pipeline"):
			label += " · " + (row.get("pipeline_name") or row["pipeline"])
		if row.get("hidden"):
			label += " · " + _("Historical")
		elif row["type"] == "Unknown":
			label += " · " + _("Unclassified")
		result.append({**row, "stage": label, "status_type": row["type"]})
	return sorted(result, key=lambda row: (-row["count"], row["stage"]))


def get_deals_by_stage_axis(from_date=None, to_date=None, user=None):
	return {
		"data": _stage_distribution(from_date, to_date, user),
		"title": _("Deals by stage"),
		"subtitle": _(
			"Current stage of deals created in the selected period, including lost and historical stages"
		),
		"date_basis": "creation",
		"xAxis": {"title": _("Stage"), "key": "stage", "type": "category"},
		"yAxis": {"title": _("Count")},
		"series": [{"name": "count", "type": "bar"}],
	}


def get_deals_by_stage_donut(from_date=None, to_date=None, user=None):
	return {
		"data": _stage_distribution(from_date, to_date, user),
		"title": _("Deals by stage"),
		"subtitle": _(
			"Current stage of deals created in the selected period, including lost and historical stages"
		),
		"date_basis": "creation",
		"categoryColumn": "stage",
		"valueColumn": "count",
	}


def get_lost_deal_reasons(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get lost deal reasons for the dashboard.
	"""
	if not from_date or not to_date:
		from_date = frappe.utils.get_first_day(from_date or frappe.utils.nowdate())
		to_date = frappe.utils.get_last_day(to_date or frappe.utils.nowdate())

	# Using Frappe Query Builder with JOIN
	CRMDeal = DocType("CRM Deal")
	CRMDealStatus = DocType("CRM Deal Status")

	query = (
		_permitted_from("CRM Deal", CRMDeal, ["creation", "deal_owner", "lost_reason", "status"])
		.join(CRMDealStatus)
		.on(CRMDeal.status == CRMDealStatus.name)
		.select(CRMDeal.lost_reason.as_("reason"), Count("*").as_("count"))
		.where((Date(CRMDeal.creation).between(from_date, to_date)) & (CRMDealStatus.type == "Lost"))
		.groupby(CRMDeal.lost_reason)
		.having((CRMDeal.lost_reason.isnotnull()) & (CRMDeal.lost_reason != ""))
		.orderby(Count("*"), order=frappe.qb.desc)
	)

	users = _scoped_users(user)
	if users:
		query = query.where(CRMDeal.deal_owner.isin(users))

	result = query.run(as_dict=True)

	return {
		"data": result or [],
		"title": _("Lost deal reasons"),
		"subtitle": _("Common reasons for losing deals"),
		"xAxis": {
			"title": _("Reason"),
			"key": "reason",
			"type": "category",
		},
		"yAxis": {
			"title": _("Count"),
		},
		"series": [
			{"name": "count", "type": "bar"},
		],
	}


def get_leads_by_source(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get lead data by source for the dashboard.
	"""
	if not from_date or not to_date:
		from_date = frappe.utils.get_first_day(from_date or frappe.utils.nowdate())
		to_date = frappe.utils.get_last_day(to_date or frappe.utils.nowdate())

	# Using Frappe Query Builder (safer, more maintainable)
	CRMLead = DocType("CRM Lead")

	query = (
		_permitted_from("CRM Lead", CRMLead, ["creation", "lead_owner", "source"])
		.select(IfNull(CRMLead.source, "Empty").as_("source"), Count("*").as_("count"))
		.where(Date(CRMLead.creation).between(from_date, to_date))
		.groupby(CRMLead.source)
		.orderby(Count("*"), order=frappe.qb.desc)
	)

	users = _scoped_users(user)
	if users:
		query = query.where(CRMLead.lead_owner.isin(users))

	result = query.run(as_dict=True)

	return {
		"data": result or [],
		"title": _("Leads by source"),
		"subtitle": _("Lead generation channel analysis"),
		"categoryColumn": "source",
		"valueColumn": "count",
	}


def get_deals_by_source(from_date: str | None = None, to_date: str | None = None, user: str | None = None):
	"""
	Get deal data by source for the dashboard.
	"""
	if not from_date or not to_date:
		from_date = frappe.utils.get_first_day(from_date or frappe.utils.nowdate())
		to_date = frappe.utils.get_last_day(to_date or frappe.utils.nowdate())

	# Using Frappe Query Builder
	CRMDeal = DocType("CRM Deal")

	query = (
		_permitted_from("CRM Deal", CRMDeal, ["creation", "deal_owner", "source"])
		.select(IfNull(CRMDeal.source, "Empty").as_("source"), Count("*").as_("count"))
		.where(Date(CRMDeal.creation).between(from_date, to_date))
		.groupby(CRMDeal.source)
		.orderby(Count("*"), order=frappe.qb.desc)
	)

	users = _scoped_users(user)
	if users:
		query = query.where(CRMDeal.deal_owner.isin(users))

	result = query.run(as_dict=True)

	return {
		"data": result or [],
		"title": _("Deals by source"),
		"subtitle": _("Deal generation channel analysis"),
		"categoryColumn": "source",
		"valueColumn": "count",
	}


def _grouped_deal_values(from_date, to_date, user, field, label):
	start, end, _previous = _period_bounds(from_date, to_date)
	query, deal, _status, amounts = _metric_base(["creation", field], user)
	group = Case().when(Coalesce(deal[field], "") == "", _("Unassigned")).else_(deal[field])
	query = query.where(deal.creation >= start).where(deal.creation < end)
	query = query.select(group.as_(label), Count(deal.name).as_("deals"))
	query = query.select(
		*(
			Sum(amounts[key]).as_(key)
			for key in (
				"commercial_value",
				"open_expected_value",
				"weighted_forecast",
				"won_value",
				"missing_exchange_rate_count",
			)
		)
	)
	rows = query.groupby(group).orderby(Count(deal.name), order=frappe.qb.desc).run(as_dict=True)
	for row in rows:
		row["value"] = row.commercial_value
		row["missing_exchange_rate_count"] = int(row.missing_exchange_rate_count or 0)
	missing = sum(row.missing_exchange_rate_count for row in rows)
	note = _(
		"Recorded commercial amount includes lost and historical deals; it is not forecast, invoiced or collected revenue."
	)
	if missing:
		note += " " + _amount_note(missing)
	return {
		"data": rows,
		"subtitle": _("Deals created in the selected period"),
		"metric_note": note,
		"currency": _base_currency(),
		"date_basis": "creation",
		"missing_exchange_rate_count": missing,
		"xAxis": {
			"title": _("Territory") if field == "territory" else _("Salesperson"),
			"key": label,
			"type": "category",
		},
		"yAxis": {"title": _("Number of deals")},
		"y2Axis": {"title": _("Recorded commercial amount") + f" ({_base_currency()})"},
		"series": [
			{"name": "deals", "type": "bar"},
			{"name": "value", "type": "line", "showDataPoints": True, "axis": "y2"},
		],
	}


def get_deals_by_territory(from_date=None, to_date=None, user=None):
	return {
		**_grouped_deal_values(from_date, to_date, user, "territory", "territory"),
		"title": _("Deals by territory"),
	}


def get_deals_by_salesperson(from_date=None, to_date=None, user=None):
	# Owner IDs are stable chart identities; duplicate full names must not merge categories.
	return {
		**_grouped_deal_values(from_date, to_date, user, "deal_owner", "salesperson"),
		"title": _("Deals by salesperson"),
	}


def get_base_currency_symbol():
	"""
	Get the base currency symbol from the system settings.
	"""
	base_currency = frappe.db.get_single_value("FCRM Settings", "currency") or "USD"
	return frappe.db.get_value("Currency", base_currency, "symbol") or ""


def get_deal_status_change_counts(
	from_date: str | None = None,
	to_date: str | None = None,
	deal_conds: str = "",
	filters: dict | None = None,
):
	"""
	Get count of each status change (to) for each deal, excluding deals with current status type 'Lost'.
	Order results by status position.
	"""
	# Using Frappe Query Builder with multiple JOINs and table aliases
	CRMStatusChangeLog = DocType("CRM Status Change Log")
	CRMDeal = DocType("CRM Deal")
	CurrentStatus = DocType("CRM Deal Status").as_("s")
	TargetStatus = DocType("CRM Deal Status").as_("st")

	query = (
		frappe.qb.from_(CRMStatusChangeLog)
		.join(CRMDeal)
		.on(CRMStatusChangeLog.parent == CRMDeal.name)
		.join(CurrentStatus)
		.on(CRMDeal.status == CurrentStatus.name)
		.join(TargetStatus)
		.on(CRMStatusChangeLog.to == TargetStatus.name)
		.select(CRMStatusChangeLog.to.as_("stage"), Count("*").as_("count"))
		.where(
			(CRMStatusChangeLog.to.isnotnull())
			& (CRMStatusChangeLog.to != "")
			& (CurrentStatus.type != "Lost")
			& (Date(CRMDeal.creation).between(from_date, to_date))
		)
		.groupby(CRMStatusChangeLog.to, TargetStatus.position)
		.orderby(TargetStatus.position)
	)
	from crm.api.sales_reports import _fields
	from crm.pipeline.queries.stages import permitted_deals

	_fields("CRM Deal", ["creation", "status", "deal_owner", "status_change_log"])
	_fields("CRM Status Change Log", ["to"], parenttype="CRM Deal")
	query = query.where(CRMDeal.name.isin(permitted_deals())).where(
		(CRMStatusChangeLog.parenttype == "CRM Deal")
		& (CRMStatusChangeLog.parentfield == "status_change_log")
	)

	# Handle optional user filter if deal_conds contains user condition
	users = _scoped_users(filters.get("user") if filters else None)
	if users:
		query = query.where(CRMDeal.deal_owner.isin(users))

	result = query.run(as_dict=True)
	return result or []
