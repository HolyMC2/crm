"""Manager queues over native CRM permissions; capacity never changes routing."""

from contextlib import contextmanager

import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.utils import CallbackManager, add_days, cint, get_datetime, get_time, getdate, now_datetime

from crm.permissions.org_hierarchy import _in_hierarchy, _team_mem_query, hierarchy_enabled
from crm.pipeline.constants import OPEN_TASK_STATUSES
from crm.pipeline.services.configuration import can_access_pipeline, record_company_allowed

TYPES = {
	"leads": ("CRM Lead", "lead_owner", "lead_name"),
	"deals": ("CRM Deal", "deal_owner", "deal_name"),
	"tasks": ("CRM Task", "assigned_to", "title"),
}
OPEN = ("Open", "Ongoing", "On Hold")
PAGE_SIZE = 25


def _manager():
	frappe.only_for(["System Manager", "Sales Manager"])


def _fields(doctype, names, permission="read"):
	allowed = set(get_permitted_fields(doctype, permission_type=permission))
	masked = {f.fieldname for f in frappe.get_meta(doctype).get_masked_fields()}
	if not set(names).issubset(allowed) or set(names) & masked:
		frappe.throw(_("You cannot access the fields required for this workload."), frappe.PermissionError)


def _scope(filters):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else filters
	if filters is None:
		filters = {}
	if not isinstance(filters, dict) or set(filters) - {"pipeline", "company"}:
		frappe.throw(_("Choose valid workload filters."))
	if any(not isinstance(v, str) or len(v) > 140 for v in filters.values()):
		frappe.throw(_("Choose valid workload filter values."))
	return {key: filters.get(key, "") for key in ("pipeline", "company")}


def _offset(value):
	if isinstance(value, bool) or not str(value).isdigit() or int(value) > 1000000:
		frappe.throw(_("Choose a valid page."))
	return int(value)


def _allowed(kind, filters):
	doctype, owner, title = TYPES[kind]
	_fields(
		doctype,
		[owner, title, "status", "modified", "pipeline", "sales_company"]
		+ (["converted"] if kind == "leads" else []),
	)
	conditions = {
		field: filters[key]
		for key, field in (("pipeline", "pipeline"), ("company", "sales_company"))
		if filters[key]
	}
	return frappe.qb.get_query(
		doctype, fields=["name"], filters=conditions, ignore_permissions=False, order_by=None
	).get_sql()


def _source(kind, filters, *, owner=None, overdue=False, as_of=None):
	"""The same relation is consumed by counts and every drill-down page."""
	if kind not in TYPES:
		frappe.throw(_("Choose leads, deals or tasks."))
	doctype, owner_field, _title = TYPES[kind]
	params = {"open": OPEN, "task_open": OPEN_TASK_STATUSES, "as_of": as_of or now_datetime()}
	if kind == "tasks":
		_fields(
			doctype,
			[
				"assigned_to",
				"title",
				"status",
				"modified",
				"due_date",
				"reference_doctype",
				"reference_docname",
			],
		)
		allowed = frappe.qb.get_query(
			doctype, fields=["name"], ignore_permissions=False, order_by=None
		).get_sql()
		leads, deals = _allowed("leads", filters), _allowed("deals", filters)
		where = f"d.name IN ({allowed}) AND d.status IN %(task_open)s AND ((d.reference_doctype='CRM Lead' AND d.reference_docname IN ({leads})) OR (d.reference_doctype='CRM Deal' AND d.reference_docname IN ({deals})))"
		join = ""
		if overdue:
			where += " AND d.due_date < %(as_of)s"
	else:
		allowed = _allowed(kind, filters)
		join = f"JOIN `tab{doctype} Status` s ON s.name=d.status"
		where = f"d.name IN ({allowed}) AND s.type IN %(open)s"
		if kind == "leads":
			where += " AND COALESCE(d.converted,0)=0"
	if owner is not None:
		if not isinstance(owner, str) or len(owner) > 140:
			frappe.throw(_("Choose a valid owner."))
		where += f" AND COALESCE(d.{owner_field},'')=%(owner)s"
		params["owner"] = owner
	return f"FROM `tab{doctype}` d {join} WHERE {where}", params


def _team_users():
	"""Manager directory, bounded to their native hierarchy when configured."""
	condition = ""
	actor = frappe.session.user
	if (
		actor != "Administrator"
		and "System Manager" not in frappe.get_roles()
		and hierarchy_enabled()
		and _in_hierarchy(actor)
	):
		condition = f" AND u.name IN ({_team_mem_query(actor).get_sql()})"
	rows = frappe.db.sql(
		f"""SELECT u.name AS user,u.enabled,u.user_type
		FROM `tabUser` u WHERE u.name NOT IN ('Guest','Administrator')
		AND EXISTS (SELECT 1 FROM `tabHas Role` r WHERE r.parent=u.name AND r.parenttype='User' AND r.role IN ('Sales User','Sales Manager')) {condition}
		ORDER BY u.name""",
		as_dict=True,
	)

	# Match the manager owner directory's CRM role/enablement policy without
	# treating User profile fields as public. Labels require native record AND
	# field permission; otherwise expose only the canonical owner identifier.
	labels = {}
	permitted = set(get_permitted_fields("User", permission_type="read"))
	masked = {field.fieldname for field in frappe.get_meta("User").get_masked_fields()}
	if (
		rows
		and "full_name" in permitted
		and "full_name" not in masked
		and frappe.has_permission("User", "read")
	):
		labels = {
			row.name: row.full_name
			for row in frappe.get_list(
				"User",
				fields=["name", "full_name"],
				filters={"name": ["in", [row.user for row in rows]]},
				limit_page_length=0,
			)
		}
	for row in rows:
		row.full_name = labels.get(row.user) or row.user
	return rows


def _optional_failure(exc):
	# Driver failures can invalidate the transaction. Never disguise them as
	# an offline addon and then return apparently valid core results.
	for name in ("QueryDeadlockError", "QueryTimeoutError"):
		error = getattr(frappe, name, None)
		if isinstance(error, type) and isinstance(exc, error):
			raise exc
	for name in ("OperationalError", "InternalError", "InterfaceError"):
		error = getattr(frappe.db, name, None)
		if isinstance(error, type) and isinstance(exc, error):
			raise exc


def _capacity():
	settings = frappe.get_doc("FCRM Settings")
	settings.check_permission("read")
	_fields("FCRM Settings", ["workload_advisory_capacity"])
	capacity = {
		"cap": cint(settings.get("workload_advisory_capacity")),
		"source": "FCRM Settings",
		"advisory": True,
		"can_configure": bool(settings.has_permission("write")),
		"routing": "Native Assignment Rules keep their configured conditions, priority, users and weekdays. Their engine evaluates each record; this manual queue does not predict or change automatic routing.",
		"marketing": {"state": "absent"},
	}
	try:
		if "doco_marketing" not in frappe.get_installed_apps():
			return capacity
		if not frappe.db.exists("DocType", "Marketing Settings"):
			capacity["marketing"] = {"state": "unavailable"}
			return capacity
		doc = frappe.get_doc("Marketing Settings")
		if not doc.has_permission("read"):
			capacity["marketing"] = {"state": "restricted"}
			return capacity
		try:
			_fields(
				"Marketing Settings",
				[
					"auto_assign_enabled",
					"auto_assign_deals",
					"auto_assign_cap",
					"auto_assign_shift_aware",
					"auto_assign_users",
				],
			)
		except frappe.PermissionError:
			capacity["marketing"] = {"state": "restricted"}
			return capacity
		capacity["marketing"] = {
			"state": "available",
			"enabled": bool(doc.get("auto_assign_enabled")),
			"deals_enabled": bool(doc.get("auto_assign_deals")),
			"soft_cap": cint(doc.get("auto_assign_cap")),
			"shift_aware": bool(doc.get("auto_assign_shift_aware")),
			"pool": [
				v.strip()
				for v in (doc.get("auto_assign_users") or "").replace(",", "\n").splitlines()
				if v.strip()
			],
			"policy": "Marketing uses its existing automatic routing pool and legacy load calculation. Capacity and shifts are soft preferences: if no candidate qualifies, routing can fall back to the pool. Visible CRM counts below are not that router's private load.",
		}
		return capacity
	except Exception as exc:
		_optional_failure(exc)
		capacity["marketing"] = {"state": "unavailable"}
		return capacity


def _shifts(users):
	"""Missing/restricted HRMS evidence is unknown, never a fabricated off shift."""
	unknown = {user: ("unknown", "No complete permitted HRMS shift evidence.") for user in users}
	fields = {
		"Employee": ["user_id", "status"],
		"Shift Assignment": ["employee", "shift_type", "start_date", "end_date", "status", "docstatus"],
		"Shift Type": ["start_time", "end_time"],
	}
	try:
		if not users or "hrms" not in frappe.get_installed_apps():
			return unknown
		for doctype, names in fields.items():
			frappe.has_permission(doctype, "read", throw=True)
			_fields(doctype, names)
		employees = frappe.get_list(
			"Employee",
			filters={"user_id": ["in", users], "status": "Active"},
			fields=["name", "user_id"],
			limit_page_length=0,
		)
		if not employees:
			return unknown
		all_employees = frappe.get_all(
			"Employee", filters={"user_id": ["in", users], "status": "Active"}, fields=["name", "user_id"]
		)
		current = now_datetime()
		filters = {
			"employee": ["in", [row.name for row in employees]],
			"status": "Active",
			"docstatus": 1,
			"start_date": ["<=", getdate(current)],
		}
		or_filters = [["end_date", ">=", add_days(getdate(current), -1)], ["end_date", "is", "not set"]]
		assignments = frappe.get_list(
			"Shift Assignment",
			filters=filters,
			or_filters=or_filters,
			fields=["name", *fields["Shift Assignment"]],
			limit_page_length=0,
		)
		# A negative conclusion requires complete visibility. Hidden assignments
		# only change the answer to Unknown; no hidden shift details leave here.
		all_assignments = frappe.get_all(
			"Shift Assignment", filters=filters, or_filters=or_filters, fields=["name", "employee"]
		)
		windows = frappe.get_list(
			"Shift Type", fields=["name", "start_time", "end_time"], limit_page_length=0
		)
		windows = {row.name: row for row in windows}
		for employee in employees:
			visible = [row for row in assignments if row.employee == employee.name]
			if {row.name for row in visible} != {
				row.name for row in all_assignments if row.employee == employee.name
			}:
				continue
			if sum(row.user_id == employee.user_id for row in all_employees) != 1:
				continue
			states = []
			for row in visible:
				window = windows.get(row.shift_type)
				if not window or window.start_time is None or window.end_time is None:
					states.append(None)
					continue
				start, end, now = get_time(window.start_time), get_time(window.end_time), current.time()
				if start == end:
					states.append(None)
					continue
				day = add_days(getdate(current), -1) if start > end and now <= end else getdate(current)
				active_day = getdate(row.start_date) <= day and (
					not row.end_date or getdate(row.end_date) >= day
				)
				states.append(
					active_day and (start <= now <= end if start < end else now >= start or now <= end)
				)
			if any(value is True for value in states):
				unknown[employee.user_id] = (
					"on_shift",
					"A permitted submitted HRMS shift covers the site timestamp.",
				)
			elif None not in states:
				unknown[employee.user_id] = (
					"off_shift",
					"Complete permitted HRMS assignments contain no shift covering the site timestamp. This is advisory for manual assignment.",
				)
		return unknown
	except (frappe.PermissionError, frappe.DoesNotExistError):
		return unknown
	except Exception as exc:
		_optional_failure(exc)
		return {user: ("unknown", "HRMS shift evidence is temporarily unavailable.") for user in users}


def _owner_rows(filters, counts, capacity):
	rows = {row.user: {**row, "in_team": True} for row in _team_users()}
	# An existing owner remains visible even after disabling/removing their role.
	# Their ID is already disclosed by a permitted record; do not expose a wider directory.
	for user in counts:
		if user:
			rows.setdefault(
				user, {"user": user, "full_name": user, "enabled": None, "user_type": None, "in_team": False}
			)
	shifts = _shifts(list(rows))
	for user, row in rows.items():
		row.update(counts.get(user, {}))
		for key in ("open_leads", "open_deals", "open_tasks", "overdue_tasks", "undated_tasks"):
			row.setdefault(key, 0)
		row["open_total"] = row["open_leads"] + row["open_deals"]
		row["at_capacity"] = capacity["cap"] > 0 and row["open_total"] >= capacity["cap"]
		if not row["in_team"]:
			reason = "Existing owner is outside the current CRM team or no longer has a CRM sales role."
		elif not row["enabled"]:
			reason = "This user is disabled."
		elif row["user_type"] != "System User":
			reason = "An enabled system user is required."
		elif not can_access_pipeline(filters["pipeline"], user):
			reason = "This person cannot access the selected pipeline."
		elif not record_company_allowed(filters["company"], user):
			reason = "This person cannot access the selected company."
		else:
			reason = ""
		row["eligible"] = not reason
		row["reason"] = reason or "Record permissions are checked again when reassigning."
		row["shift"], row["shift_reason"] = shifts[user]
		# Do not serialize private User profile/authorization fields.
		for field in ("enabled", "user_type", "in_team"):
			row.pop(field, None)
	return sorted(rows.values(), key=lambda row: (-row["open_total"], row["full_name"], row["user"]))


@frappe.whitelist()
def get_workload(filters=None, offset=0):
	_manager()
	filters, offset = _scope(filters), _offset(offset)
	counts = {}
	as_of = now_datetime()
	for kind in TYPES:
		source, params = _source(kind, filters, as_of=as_of)
		owner = TYPES[kind][1]
		extra = (
			",SUM(d.due_date < %(as_of)s) AS overdue_tasks,SUM(d.due_date IS NULL) AS undated_tasks"
			if kind == "tasks"
			else ""
		)
		for row in frappe.db.sql(
			f"SELECT COALESCE(d.{owner},'') AS user,COUNT(*) AS open_{kind}{extra} {source} GROUP BY d.{owner}",
			params,
			as_dict=True,
		):
			counts.setdefault(row.pop("user"), {}).update(
				{key: int(value or 0) for key, value in row.items()}
			)
	capacity = _capacity()
	rows = _owner_rows(filters, counts, capacity)
	from crm.pipeline.api import get_pipelines

	pipelines = get_pipelines(include_archived=True)
	companies = {p.get("sales_company") for p in pipelines if p.get("sales_company")}
	for kind in ("leads", "deals"):
		allowed = _allowed(kind, {"pipeline": filters["pipeline"], "company": ""})
		companies.update(
			frappe.db.sql(
				f"SELECT DISTINCT sales_company FROM `tab{TYPES[kind][0]}` WHERE name IN ({allowed}) AND COALESCE(sales_company,'')<>''",
				pluck=True,
			)
		)
	return {
		"agents": rows[offset : offset + PAGE_SIZE],
		"total_agents": len(rows),
		"has_more": offset + PAGE_SIZE < len(rows),
		"next_offset": offset + PAGE_SIZE,
		"capacity": capacity,
		"unassigned": counts.get("", {}),
		"summary": {
			key: sum(row.get(key, 0) for row in counts.values())
			for key in ("open_leads", "open_deals", "open_tasks", "overdue_tasks", "undated_tasks")
		},
		"candidates": [
			{
				key: row[key]
				for key in ("user", "full_name", "eligible", "reason", "at_capacity", "shift", "shift_reason")
			}
			for row in rows
			if row["eligible"]
		],
		"pipelines": [
			{
				"name": p["name"],
				"label": p.get("pipeline_name") or p["name"],
				"company": p.get("sales_company") or "",
			}
			for p in pipelines
		],
		"filters": filters,
		"as_of": str(as_of),
		"companies": sorted(companies),
		"timezone": frappe.utils.get_system_timezone(),
		"definitions": "Current Open, Ongoing and On Hold records, excluding converted leads; archived pipeline history remains visible if still open. Task workload includes open tasks on any permitted parent in the selected scope. Only dated tasks before the site timestamp are overdue. Counts cover all pages and only records you can read.",
	}


@frappe.whitelist()
def get_work_items(filters=None, kind="deals", owner=None, overdue=False, offset=0):
	_manager()
	filters, offset = _scope(filters), _offset(offset)
	source, params = _source(kind, filters, owner=owner, overdue=cint(overdue))
	doctype, owner_field, title = TYPES[kind]
	extra = (
		",d.due_date,d.reference_doctype,d.reference_docname"
		if kind == "tasks"
		else ",d.pipeline,d.sales_company"
	)
	total = int(frappe.db.sql(f"SELECT COUNT(*) {source}", params)[0][0])
	order = "(d.due_date IS NULL),d.due_date,d.name" if kind == "tasks" else "d.modified DESC,d.name"
	rows = frappe.db.sql(
		f"SELECT d.name,d.{title} AS label,d.{owner_field} AS owner,d.status,d.modified{extra} {source} ORDER BY {order} LIMIT {PAGE_SIZE} OFFSET {offset}",
		params,
		as_dict=True,
	)
	for row in rows:
		row["doctype"] = doctype
	return {
		"items": rows,
		"total": total,
		"has_more": offset + len(rows) < total,
		"next_offset": offset + len(rows),
	}


def _target(doc, target, scope):
	target_user = frappe.db.get_value("User", target, ["enabled", "user_type"], as_dict=True, for_update=True)
	if not target_user or not target_user.enabled or target_user.user_type != "System User":
		frappe.throw(_("Choose an enabled system user."), frappe.PermissionError)
	users = {row.user for row in _team_users() if row.enabled and row.user_type == "System User"}
	if target not in users:
		frappe.throw(_("Choose an enabled CRM owner within your team."), frappe.PermissionError)
	parent = doc
	if doc.doctype == "CRM Task":
		if doc.reference_doctype not in ("CRM Lead", "CRM Deal") or not doc.reference_docname:
			frappe.throw(_("Only tasks linked to CRM leads or deals are in this queue."))
		parent = frappe.get_doc(doc.reference_doctype, doc.reference_docname, for_update=True)
		parent.check_permission("read")
		if not frappe.has_permission(parent.doctype, "read", doc=parent, user=target):
			frappe.throw(_("The target owner cannot read this task's parent record."), frappe.PermissionError)
	for key, field in (("pipeline", "pipeline"), ("company", "sales_company")):
		if scope[key] and parent.get(field) != scope[key]:
			frappe.throw(_("The record moved outside the selected scope. Reload the queue."))
	if not can_access_pipeline(parent.get("pipeline"), target) or not record_company_allowed(
		parent.get("sales_company"), target
	):
		frappe.throw(_("The target owner cannot access this pipeline or company."), frappe.PermissionError)


class _RowRollbackFailure(frappe.ValidationError):
	pass


@contextmanager
def _row_savepoint(point):
	"""SQL savepoints alone do not isolate Frappe commit/rollback callbacks.

	Keep native realtime messages in the same scope: the framework registers a
	global flush only when its transaction buffer is first created. A rejected
	row must neither leak into an earlier flush nor clear earlier good messages.
	"""
	names = ("before_commit", "after_commit", "before_rollback", "after_rollback")
	parents = {name: getattr(frappe.db, name) for name in names}
	scoped = {name: CallbackManager() for name in names}
	missing = object()
	state = {"realtime": missing}

	@contextmanager
	def activate():
		previous = {name: getattr(frappe.db, name) for name in names}
		previous_log = getattr(frappe.local, "_realtime_log", missing)
		for name in names:
			setattr(frappe.db, name, scoped[name])
		if state["realtime"] is missing:
			if hasattr(frappe.local, "_realtime_log"):
				del frappe.local._realtime_log
		else:
			frappe.local._realtime_log = state["realtime"]
		try:
			yield
		finally:
			state["realtime"] = getattr(frappe.local, "_realtime_log", missing)
			for name in names:
				setattr(frappe.db, name, previous[name])
			if previous_log is missing:
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
			else:
				frappe.local._realtime_log = previous_log

	def run(name):
		with activate():
			scoped[name].run()

	with activate():
		frappe.db.savepoint(point)
		try:
			yield
		except BaseException:
			try:
				try:
					scoped["before_rollback"].run()
				finally:
					try:
						frappe.db.rollback(save_point=point)
					finally:
						scoped["after_rollback"].run()
			except Exception as exc:
				# A deadlock can roll back the whole transaction and destroy the
				# savepoint. Never return earlier rows as successful in that case.
				raise _RowRollbackFailure(
					_("The transaction could not be reconciled. Reload all selected records before retrying.")
				) from exc
			raise
		else:
			for name in names:
				parents[name].add(lambda name=name: run(name))


@frappe.whitelist(methods=["POST"])
def reassign_bulk(items, target, filters=None):
	_manager()
	filters = _scope(filters)
	items = frappe.parse_json(items) if isinstance(items, str) else items
	if (
		not isinstance(items, list)
		or not 1 <= len(items) <= PAGE_SIZE
		or not isinstance(target, str)
		or len(target) > 140
	):
		frappe.throw(_("Select between 1 and 25 records and a target owner."))
	results = []
	for index, item in enumerate(items):
		if (
			not isinstance(item, dict)
			or set(item) != {"doctype", "name", "modified", "owner"}
			or item["doctype"] not in {row[0] for row in TYPES.values()}
			or any(not isinstance(v, str) or len(v) > 140 for v in item.values())
		):
			frappe.throw(_("Select valid queue records with their current version."))
		point = f"workload_{index}"
		try:
			with _row_savepoint(point):
				doc = frappe.get_doc(item["doctype"], item["name"], for_update=True)
				doc.check_permission("read")
				doc.check_permission("write")
				kind = next(k for k, value in TYPES.items() if value[0] == doc.doctype)
				owner_field = TYPES[kind][1]
				_fields(doc.doctype, [owner_field], "write")
				_fields(
					doc.doctype,
					[owner_field, "status", "modified"]
					+ (
						["reference_doctype", "reference_docname"]
						if kind == "tasks"
						else ["pipeline", "sales_company"]
					),
				)
				if (
					get_datetime(doc.modified) != get_datetime(item["modified"])
					or (doc.get(owner_field) or "") != item["owner"]
				):
					frappe.throw(
						_("This record changed. Reload it before reassigning."), frappe.TimestampMismatchError
					)
				if kind == "tasks":
					is_open = doc.status in OPEN_TASK_STATUSES
				else:
					is_open = frappe.db.get_value(
						doc.doctype + " Status", doc.status, "type"
					) in OPEN and not (kind == "leads" and doc.converted)
				if not is_open:
					frappe.throw(_("This record is no longer open. Reload the queue."))
				doc.set(owner_field, target)
				_target(doc, target, filters)
				doc.save()
				# Native hierarchy hooks query persisted ownership, so verify the
				# resulting native save inside this row's rollback boundary.
				if not frappe.has_permission(doc.doctype, "read", doc=doc, user=target):
					frappe.throw(_("The target owner cannot read this record."), frappe.PermissionError)
				doc.add_comment(
					"Info",
					_(
						"Reassigned from {0} to {1} through CRM Workload. Linked task assignees were preserved."
					).format(item["owner"] or _("Unassigned"), target),
				)
			results.append(
				{
					"doctype": doc.doctype,
					"name": doc.name,
					"ok": True,
					"modified": str(doc.modified),
					"owner": target,
				}
			)
		except _RowRollbackFailure:
			raise
		except Exception as exc:
			# Permission errors do not disclose the hidden record or target configuration.
			message = (
				_("You cannot reassign this record to that owner.")
				if isinstance(exc, frappe.PermissionError)
				else str(exc)
				if isinstance(exc, frappe.ValidationError)
				else _("This row could not be saved. Reload and try again.")
			)
			results.append(
				{
					"doctype": item["doctype"],
					"name": item["name"],
					"ok": False,
					"error": message,
					"error_type": type(exc).__name__,
				}
			)
	return {
		"results": results,
		"task_policy": "Linked tasks keep their current assignees. Reassign task rows separately when needed.",
	}
