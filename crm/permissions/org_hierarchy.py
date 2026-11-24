# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.caching import request_cache

_OWNER_FIELDS = {
	"CRM Lead": ("lead_owner",),
	"CRM Deal": ("deal_owner",),
	"CRM Call Log": ("caller", "receiver"),
}

# Branch shared pool: when the `doco_shop` custom field (Link -> Social Shop,
# installed by doco_marketing) is present, membership in a shop (a User<->Social
# Shop User Permission) widens visibility to ALL of that shop's records — the
# retail-counter model where any employee answers a walk-in conversation. On a
# bare crm install the field doesn't exist and behaviour is byte-identical to
# upstream (owner + assignment + manager subtree only).
_SHOP_FIELD = "doco_shop"


# Doco's read-only assistant service role (doco reader_access.enable()). The
# assistant states a figure only from rows that both its service user and the
# person asking can read, so reading every Lead and Deal never widens what a
# person sees. Writes, creates and assignment keep the hierarchy/pipeline scope.
ASSISTANT_READER_ROLE = "Doco Copilot Reader"
_READ_TYPES = frozenset({"read", "select"})


def _reads_every_record(user: str | None, ptype: str | None = "read") -> bool:
	return ptype in _READ_TYPES and ASSISTANT_READER_ROLE in frappe.get_roles(user or frappe.session.user)


def hierarchy_enabled() -> bool:
	return bool(frappe.db.get_single_value("FCRM Settings", "enable_sales_hierarchy"))


# The team tree. By default it is the organization chart: Employee «Reports To»,
# the nested set HR approvals and the organigrama read, so the owner keeps one
# tree. A tenant without employees, or one that keeps a separate sales tree
# (FCRM Settings `sales_hierarchy_own_tree`), uses CRM Sales Hierarchy.
EMPLOYEE = "Employee"
SALES_TREE = "CRM Sales Hierarchy"


def employee_tree_available() -> bool:
	"""Employee exists here as a tree with a linked user (ERPNext installed)."""
	if not frappe.db.exists("DocType", EMPLOYEE):
		return False
	meta = frappe.get_meta(EMPLOYEE)
	return all(meta.has_field(field) for field in ("user_id", "reports_to", "lft", "rgt", "status"))


def follows_org_chart() -> bool:
	"""The team tree is the organization chart (whether or not the hierarchy is on)."""
	if frappe.db.get_single_value("FCRM Settings", "sales_hierarchy_own_tree"):
		return False
	return employee_tree_available()


@request_cache
def _shop_names(user: str, doctype: str) -> tuple:
	"""Social Shop names `user` belongs to, () when the shop dimension is absent
	on this doctype. Reads the same User Permission rows Frappe core enforces
	(assign via doco_marketing shops.assign_employee)."""
	if not frappe.get_meta(doctype).has_field(_SHOP_FIELD):
		return ()
	return tuple(
		frappe.get_all(
			"User Permission",
			filters={"user": user, "allow": "Social Shop"},
			pluck="for_value",
			ignore_permissions=True,
		)
	)


def _permission_query_conditions(user: str | None, doctype: str):
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return ""

	roles = frappe.get_roles(user)
	if "System Manager" in roles:
		return ""

	in_tree = hierarchy_enabled() and _in_hierarchy(user)

	# Sales Manager outside the tree retains the default ie sees everything
	if "Sales Manager" in roles and not in_tree:
		return ""

	owner_fields = _OWNER_FIELDS[doctype]
	DT = frappe.qb.DocType(doctype)
	Todo = frappe.qb.DocType("ToDo").as_("_todo")

	if in_tree:
		# Owner is the user themselves or any member of their subtree
		q1 = None
		for f in owner_fields:
			q = (DT[f] == user) | DT[f].isin(_team_mem_query(user))
			q1 = q if q1 is None else q1 | q
		# Assigned to the user or any member of their subtree by ToDo
		q2 = DT.name.isin(
			frappe.qb.from_(Todo)
			.select(Todo.reference_name)
			.where(
				(Todo.reference_type == doctype)
				& (Todo.status != "Cancelled")
				& ((Todo.allocated_to == user) | (Todo.allocated_to.isin(_team_mem_query(user))))
			)
		)
		cond = q1 | q2
		if "Sales Manager" in roles:
			# What nobody owns yet stays in sight of a manager in the tree, to hand it out.
			unowned = None
			for f in owner_fields:
				q = DT[f].isnull() | (DT[f] == "")
				unowned = q if unowned is None else unowned & q
			cond = cond | unowned
	else:
		# Sales User default: own records and records directly assigned to them
		q1 = None
		for f in owner_fields:
			q = DT[f] == user
			q1 = q if q1 is None else q1 | q
		q2 = DT.name.isin(
			frappe.qb.from_(Todo)
			.select(Todo.reference_name)
			.where(
				(Todo.reference_type == doctype) & (Todo.status != "Cancelled") & (Todo.allocated_to == user)
			)
		)
		cond = q1 | q2

	# Shared pool: everyone assigned to a shop sees that shop's records.
	shops = _shop_names(user, doctype)
	if shops:
		cond = cond | DT[_SHOP_FIELD].isin(list(shops))
	return cond


def get_lead_permission_query_conditions(user=None):
	return _scoped_record_query(user, "CRM Lead")


def get_deal_permission_query_conditions(user=None):
	return _scoped_record_query(user, "CRM Deal")


def _scoped_record_query(user, doctype):
	from crm.pipeline.services.configuration import record_query

	if _reads_every_record(user):
		return ""
	cond = _permission_query_conditions(user, doctype)
	hierarchy = cond.get_sql(with_namespace=True, quote_char="`", secondary_quote_char="'") if cond else ""
	pipeline = record_query(doctype, user)
	return " AND ".join(f"({part})" for part in (hierarchy, pipeline) if part)


def get_call_log_permission_query_conditions(user=None):
	cond = _permission_query_conditions(user, "CRM Call Log")
	return cond.get_sql(with_namespace=True, quote_char="`", secondary_quote_char="'") if cond else ""


def _has_permission(doc, ptype, user, doctype: str) -> bool | None:
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return True

	roles = frappe.get_roles(user)
	if "System Manager" in roles:
		return True

	if ptype == "create" or not doc.name:
		return True

	in_tree = hierarchy_enabled() and _in_hierarchy(user)
	if "Sales Manager" in roles and not in_tree:
		return True

	conditions = _permission_query_conditions(user, doctype)
	DT = frappe.qb.DocType(doctype)
	return bool(
		frappe.qb.from_(DT).select(DT.name).where(DT.name == doc.name).where(conditions).limit(1).run()
	)


def has_lead_permission(doc, ptype, user):
	return _scoped_record_permission(doc, ptype, user, "CRM Lead")


def has_deal_permission(doc, ptype, user):
	return _scoped_record_permission(doc, ptype, user, "CRM Deal")


def _scoped_record_permission(doc, ptype, user, doctype):
	from crm.pipeline.services.configuration import can_access_pipeline, record_company_allowed

	if _reads_every_record(user, ptype):
		return True
	if not can_access_pipeline(doc.get("pipeline"), user) or not record_company_allowed(
		doc.get("sales_company"), user
	):
		return False
	return _has_permission(doc, ptype, user, doctype)


def has_call_log_permission(doc, ptype, user):
	return _has_permission(doc, ptype, user, "CRM Call Log")


def _in_hierarchy(user: str) -> bool:
	if follows_org_chart():
		return bool(frappe.db.exists(EMPLOYEE, {"user_id": user, "status": "Active"}))
	return bool(frappe.db.exists(SALES_TREE, {"user": user}))


def _team_mem_query(user: str):
	"""Users in `user`'s subtree, `user` included. On the organization chart the
	members keep their place after they leave, so their records stay with the boss
	who hands them out."""
	if follows_org_chart():
		Mgr = frappe.qb.DocType(EMPLOYEE).as_("_sqmgr")
		Member = frappe.qb.DocType(EMPLOYEE).as_("_sqmem")
		return (
			frappe.qb.from_(Mgr)
			.join(Member)
			.on((Member.lft >= Mgr.lft) & (Member.lft <= Mgr.rgt))
			.select(Member.user_id)
			.where(
				(Mgr.user_id == user)
				& (Mgr.status == "Active")
				& Member.user_id.isnotnull()
				& (Member.user_id != "")
			)
		)
	Mgr = frappe.qb.DocType(SALES_TREE).as_("_sqmgr")
	Member = frappe.qb.DocType(SALES_TREE).as_("_sqmem")
	return (
		frappe.qb.from_(Mgr)
		.join(Member)
		.on((Member.lft >= Mgr.lft) & (Member.lft <= Mgr.rgt))
		.select(Member.user)
		.where(Mgr.user == user)
	)


def team_users(user: str) -> list[str]:
	"""The accounts in `user`'s team, `user` included, without repeats."""
	return list(dict.fromkeys(u for u in _team_mem_query(user).run(pluck=True) if u))


def manager_of(user: str | None) -> str | None:
	"""The boss an overdue step of `user` goes to, when the hierarchy is on.

	On the organization chart: the nearest person above with an active account who
	may read deals (a boss without one is skipped). On the sales tree: the parent
	node's user."""
	if not user or not hierarchy_enabled():
		return None
	if not follows_org_chart():
		parent = frappe.db.get_value(SALES_TREE, {"user": user}, "reports_to")
		boss = parent and frappe.db.get_value(SALES_TREE, parent, "user")
		return boss if boss and boss != user else None
	employee = frappe.db.get_value(EMPLOYEE, {"user_id": user, "status": "Active"}, "reports_to")
	seen = set()
	while employee and employee not in seen:
		seen.add(employee)
		row = frappe.db.get_value(EMPLOYEE, employee, ["user_id", "status", "reports_to"], as_dict=True)
		if not row:
			return None
		if (
			row.user_id
			and row.user_id != user
			and row.status == "Active"
			and frappe.db.get_value("User", row.user_id, "enabled")
			and frappe.has_permission("CRM Deal", "read", user=row.user_id)
		):
			return row.user_id
		employee = row.reports_to
	return None


def scope_of(user: str) -> dict | None:
	"""What `user` sees of prospects and deals, in words the organigrama shows:
	{"scope": "all" | "team" | "own", "team": n, "shops": [...], "unowned": bool}.
	None when they cannot read prospects at all."""
	if user == "Administrator":
		return {"scope": "all"}
	if not frappe.db.get_value("User", user, "enabled"):
		return None
	if not frappe.has_permission("CRM Lead", "read", user=user):
		return None
	roles = frappe.get_roles(user)
	if "System Manager" in roles or _reads_every_record(user):
		return {"scope": "all"}
	in_tree = hierarchy_enabled() and _in_hierarchy(user)
	if "Sales Manager" in roles and not in_tree:
		return {"scope": "all"}
	shops = list(_shop_names(user, "CRM Lead"))
	if in_tree:
		team = [u for u in team_users(user) if u != user]
		return {
			"scope": "team",
			"team": len(team),
			"shops": shops,
			"unowned": "Sales Manager" in roles,
		}
	return {"scope": "own", "shops": shops}
