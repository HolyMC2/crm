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


def hierarchy_enabled() -> bool:
	return bool(frappe.db.get_single_value("FCRM Settings", "enable_sales_hierarchy"))


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
	else:
		# Sales User default: own records and records directly assigned to them
		q1 = None
		for f in owner_fields:
			q = DT[f] == user
			q1 = q if q1 is None else q1 | q
		q2 = DT.name.isin(
			frappe.qb.from_(Todo)
			.select(Todo.reference_name)
			.where((Todo.reference_type == doctype) & (Todo.status != "Cancelled") & (Todo.allocated_to == user))
		)
		cond = q1 | q2

	# Shared pool: everyone assigned to a shop sees that shop's records.
	shops = _shop_names(user, doctype)
	if shops:
		cond = cond | DT[_SHOP_FIELD].isin(list(shops))
	return cond


def get_lead_permission_query_conditions(user=None):
	cond = _permission_query_conditions(user, "CRM Lead")
	return cond.get_sql(with_namespace=True, quote_char="`", secondary_quote_char="'") if cond else ""


def get_deal_permission_query_conditions(user=None):
	cond = _permission_query_conditions(user, "CRM Deal")
	return cond.get_sql(with_namespace=True, quote_char="`", secondary_quote_char="'") if cond else ""


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
	return _has_permission(doc, ptype, user, "CRM Lead")


def has_deal_permission(doc, ptype, user):
	return _has_permission(doc, ptype, user, "CRM Deal")


def has_call_log_permission(doc, ptype, user):
	return _has_permission(doc, ptype, user, "CRM Call Log")


def _in_hierarchy(user: str) -> bool:
	return bool(frappe.db.exists("CRM Sales Hierarchy", {"user": user}))


def _team_mem_query(user: str):
	Mgr = frappe.qb.DocType("CRM Sales Hierarchy").as_("_sqmgr")
	Member = frappe.qb.DocType("CRM Sales Hierarchy").as_("_sqmem")
	return (
		frappe.qb.from_(Mgr)
		.join(Member)
		.on((Member.lft >= Mgr.lft) & (Member.lft <= Mgr.rgt))
		.select(Member.user)
		.where(Mgr.user == user)
	)
