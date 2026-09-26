"""Standalone sales cohorts with the same permission scope as native lists."""

import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.utils import add_days, getdate, now_datetime, today

from crm.pipeline.constants import OPEN_TASK_STATUSES
from crm.pipeline.queries.stages import deal_metrics

KINDS = {"leads": "CRM Lead", "deals": "CRM Deal", "tasks": "CRM Task"}
FILTERS = {"from_date", "to_date", "owner", "pipeline", "company"}
BUCKETS = {"source", "status", "owner", "pipeline", "outcome", "converted", "task_state"}
GROUP_LIMIT = 500


def _object(value, allowed):
	value = frappe.parse_json(value) if isinstance(value, str) else value
	if value is None:
		return {}
	if not isinstance(value, dict) or set(value) - allowed:
		frappe.throw(_("Choose valid report filters."))
	if any(not isinstance(v, (str, int, bool)) or len(str(v)) > 140 for v in value.values()):
		frappe.throw(_("Choose valid report filter values."))
	return dict(value)


def _filters(value):
	result = _object(value, FILTERS)
	result["from_date"] = str(getdate(result.get("from_date") or add_days(today(), -29)))
	result["to_date"] = str(getdate(result.get("to_date") or today()))
	if result["from_date"] > result["to_date"]:
		frappe.throw(_("Start date must be before end date."))
	return {key: result.get(key, "") for key in sorted(FILTERS)}


def _fields(doctype, fields):
	permitted = set(get_permitted_fields(doctype, permission_type="read"))
	masked = {f.fieldname for f in frappe.get_meta(doctype).get_masked_fields()}
	if not set(fields).issubset(permitted) or set(fields) & masked:
		frappe.throw(
			_("You do not have permission to read the fields in this report."), frappe.PermissionError
		)


def _record_filters(kind, filters, bucket=None):
	owner = "lead_owner" if kind == "leads" else "deal_owner"
	result = [
		["creation", ">=", filters["from_date"]],
		["creation", "<", str(add_days(filters["to_date"], 1))],
	]
	for key, field in (("owner", owner), ("pipeline", "pipeline"), ("company", "sales_company")):
		if filters.get(key):
			result.append([field, "=", filters[key]])
	for key, value in (bucket or {}).items():
		if key in {"source", "status", "pipeline", "owner"}:
			field = owner if key == "owner" else key
			result.append([field, "is", "not set"] if value == "" else [field, "=", value])
		elif key == "converted" and kind == "leads":
			if value not in (0, 1, "0", "1"):
				frappe.throw(_("Choose a valid conversion state."))
			result.append(["converted", "=", int(value)])
		elif key == "outcome" and kind == "deals":
			if value not in {"Won", "Lost"}:
				frappe.throw(_("Choose Won or Lost."))
			statuses = frappe.get_all("CRM Deal Status", filters={"type": value}, pluck="name")
			result.append(["status", "in", statuses])
		else:
			frappe.throw(_("This filter does not apply to the selected report."))
	return result


def _allowed(kind, filters, bucket=None):
	doctype = KINDS[kind]
	_fields(
		doctype, ["creation", "pipeline", "sales_company", "lead_owner" if kind == "leads" else "deal_owner"]
	)
	return frappe.qb.get_query(
		doctype,
		fields=["name"],
		filters=_record_filters(kind, filters, bucket),
		ignore_permissions=False,
		order_by=None,
	).get_sql()


def _tasks(filters, bucket=None):
	"""Task visibility AND parent visibility; date cohort belongs to the parent."""
	allowed = frappe.qb.get_query(
		"CRM Task", fields=["name"], ignore_permissions=False, order_by=None
	).get_sql()
	leads, deals = _allowed("leads", filters), _allowed("deals", filters)
	conditions = [
		f"t.name IN ({allowed})",
		f"((t.reference_doctype='CRM Lead' AND t.reference_docname IN ({leads})) "
		f"OR (t.reference_doctype='CRM Deal' AND t.reference_docname IN ({deals})))",
		"t.status IN %(open_statuses)s",
	]
	params = {"open_statuses": OPEN_TASK_STATUSES, "as_of": now_datetime()}
	for key, value in (bucket or {}).items():
		if key == "owner":
			conditions.append("COALESCE(t.assigned_to,'')=%(task_owner)s")
			params["task_owner"] = value
		elif key == "task_state" and value in {"open", "overdue", "undated"}:
			if value == "overdue":
				conditions.append("t.due_date < %(as_of)s")
			elif value == "undated":
				conditions.append("t.due_date IS NULL")
		else:
			frappe.throw(_("This filter does not apply to task workload."))
	return " AND ".join(conditions), params


def _count(scope, table):
	return int(frappe.db.sql(f"SELECT COUNT(*) FROM `{table}` WHERE name IN ({scope})")[0][0])


@frappe.whitelist()
def get_report(filters=None):
	filters = _filters(filters)
	_fields("CRM Lead", ["creation", "lead_owner", "source", "converted", "pipeline", "sales_company"])
	_fields(
		"CRM Deal",
		["creation", "deal_owner", "source", "status", "pipeline", "sales_company", "status_change_log"],
	)
	_fields("CRM Task", ["assigned_to", "status", "due_date", "reference_doctype", "reference_docname"])
	leads, deals = _allowed("leads", filters), _allowed("deals", filters)
	tasks, params = _tasks(filters)
	lead_count = _count(leads, "tabCRM Lead")
	converted = int(
		frappe.db.sql(f"SELECT COUNT(*) FROM `tabCRM Lead` WHERE converted=1 AND name IN ({leads})")[0][0]
	)
	# One row per deal even when repaired history contains several open log rows.
	stages = frappe.db.sql(
		f"""
		SELECT COALESCE(d.pipeline,'') AS pipeline, COALESCE(d.status,'') AS status,
		COALESCE(s.type,'Unknown') AS type, COUNT(*) AS count,
		AVG(GREATEST(0,TIMESTAMPDIFF(SECOND,COALESCE(h.started,d.creation),%(as_of)s))/86400) AS average_age_days,
		SUM(CASE WHEN h.started IS NULL OR h.rows_seen<>1 THEN 1 ELSE 0 END) AS approximate_count
		FROM `tabCRM Deal` d LEFT JOIN `tabCRM Deal Status` s ON s.name=d.status
		LEFT JOIN (SELECT parent, `from`, MAX(from_date) AS started, COUNT(*) AS rows_seen
		 FROM `tabCRM Status Change Log` WHERE parenttype='CRM Deal' AND parentfield='status_change_log'
		 AND to_date IS NULL GROUP BY parent, `from`) h ON h.parent=d.name AND h.`from`=d.status
		WHERE d.name IN ({deals}) GROUP BY d.pipeline,d.status,s.type
		ORDER BY count DESC,pipeline,status
	""",
		params,
		as_dict=True,
	)
	deal_count = sum(int(row.count) for row in stages)
	won = sum(int(row.count) for row in stages if row.type == "Won")
	lost = sum(int(row.count) for row in stages if row.type == "Lost")
	sources, owners = {}, {}
	for kind, scope in (("leads", leads), ("deals", deals)):
		table, owner = ("tabCRM Lead", "lead_owner") if kind == "leads" else ("tabCRM Deal", "deal_owner")
		extra = (
			"SUM(CASE WHEN d.converted=1 THEN 1 ELSE 0 END)"
			if kind == "leads"
			else "SUM(CASE WHEN s.type='Won' THEN 1 ELSE 0 END)"
		)
		join = "" if kind == "leads" else "LEFT JOIN `tabCRM Deal Status` s ON s.name=d.status"
		rows = frappe.db.sql(
			f"SELECT COALESCE(d.source,'') AS source,COUNT(*) AS count,{extra} AS outcome FROM `{table}` d {join} WHERE d.name IN ({scope}) GROUP BY d.source",
			as_dict=True,
		)
		for row in rows:
			item = sources.setdefault(
				row.source, {"source": row.source, "leads": 0, "converted_leads": 0, "deals": 0, "won": 0}
			)
			item[kind] += int(row.count)
			item["converted_leads" if kind == "leads" else "won"] += int(row.outcome or 0)
		rows = frappe.db.sql(
			f"SELECT COALESCE({owner},'') AS owner,COUNT(*) AS count FROM `{table}` WHERE name IN ({scope}) GROUP BY {owner}",
			as_dict=True,
		)
		for row in rows:
			owners.setdefault(row.owner, _owner_row(row.owner))[kind] += int(row.count)
	for row in frappe.db.sql(
		f"""SELECT COALESCE(t.assigned_to,'') AS owner,COUNT(*) AS open_tasks,
		SUM(CASE WHEN t.due_date < %(as_of)s THEN 1 ELSE 0 END) AS overdue_tasks,
		SUM(CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END) AS undated_tasks
		FROM `tabCRM Task` t WHERE {tasks} GROUP BY t.assigned_to""",
		params,
		as_dict=True,
	):
		owners.setdefault(row.owner, _owner_row(row.owner)).update(row)
	amount_names = ("open_expected_value", "weighted_forecast", "won_value", "missing_exchange_rate_count")
	amounts_available = True
	try:
		metrics = deal_metrics(_record_filters("deals", filters))
		amounts = {key: sum((row.get(key) or 0) for row in metrics) for key in amount_names}
	except frappe.PermissionError:
		amounts_available = False
		amounts = dict.fromkeys(amount_names)
	return {
		"filters": filters,
		"date_basis": "creation",
		"as_of": str(params["as_of"]),
		"timezone": frappe.utils.get_system_timezone(),
		"currency": frappe.db.get_single_value("FCRM Settings", "currency") or "USD",
		"amounts_available": amounts_available,
		"summary": {
			"leads": lead_count,
			"converted_leads": converted,
			"conversion_percent": round(100 * converted / lead_count, 1) if lead_count else None,
			"deals": deal_count,
			"won": won,
			"lost": lost,
			"closed_win_percent": round(100 * won / (won + lost), 1) if won + lost else None,
			**amounts,
		},
		"sources": sorted(sources.values(), key=lambda row: (-row["leads"] - row["deals"], row["source"]))[
			:GROUP_LIMIT
		],
		"owners": sorted(owners.values(), key=lambda row: (-row["open_tasks"], row["owner"]))[:GROUP_LIMIT],
		"stages": stages[:GROUP_LIMIT],
		"groups_truncated": any(len(rows) > GROUP_LIMIT for rows in (sources, owners, stages)),
		"definitions": {
			"cohort": "Leads and deals created within the selected site dates; current state as of this report.",
			"conversion": "Converted visible leads / all visible leads in the lead creation cohort.",
			"closed_win": "Current Won deals / current Won plus Lost deals in the deal creation cohort.",
			"stages": "Current occupancy, not a claim that records passed through preceding stages.",
			"age": "Time in the current logged stage; missing or ambiguous history is approximate.",
			"workload": "Open permitted tasks on permitted cohort records, grouped by current task assignee. Overdue means due before the site timestamp.",
			"amounts": "Commercial deal values in base currency. They do not establish invoiced, paid or delivered amounts.",
			"source": "Current recorded source; blank source is Unknown. It is not campaign attribution.",
		},
	}


def _owner_row(owner):
	return dict(owner=owner, leads=0, deals=0, open_tasks=0, overdue_tasks=0, undated_tasks=0)


@frappe.whitelist()
def get_records(filters=None, kind="deals", bucket=None, offset=0):
	if (
		kind not in KINDS
		or isinstance(offset, bool)
		or not str(offset).isdigit()
		or not 0 <= int(offset) <= 100000
	):
		frappe.throw(_("Choose a valid report page."))
	filters, bucket, offset = _filters(filters), _object(bucket, BUCKETS), int(offset)
	if kind == "tasks":
		fields = [
			"name",
			"title",
			"status",
			"assigned_to",
			"due_date",
			"reference_doctype",
			"reference_docname",
		]
		_fields("CRM Task", fields)
		where, params = _tasks(filters, bucket)
		params["offset"] = offset
		total = frappe.db.sql(f"SELECT COUNT(*) FROM `tabCRM Task` t WHERE {where}", params)[0][0]
		items = frappe.db.sql(
			f"SELECT {','.join('t.' + f for f in fields)} FROM `tabCRM Task` t WHERE {where} ORDER BY t.due_date IS NULL,t.due_date,t.name LIMIT 50 OFFSET %(offset)s",
			params,
			as_dict=True,
		)
	else:
		fields = ["name", "status", "source", "creation", "pipeline"] + (
			["lead_name", "lead_owner", "converted"]
			if kind == "leads"
			else ["deal_name", "deal_owner", "organization"]
		)
		_fields(KINDS[kind], fields)
		scope = _allowed(kind, filters, bucket)
		total = _count(scope, "tab" + KINDS[kind])
		items = frappe.get_list(
			KINDS[kind],
			fields=fields,
			filters=_record_filters(kind, filters, bucket),
			start=offset,
			page_length=50,
			order_by="creation desc, name desc",
		)
	return {
		"items": items,
		"total": int(total),
		"has_more": offset + len(items) < total,
		"next_offset": offset + len(items),
		"filters": filters,
		"kind": kind,
		"bucket": bucket,
	}
