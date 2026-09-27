"""An offer never grants access to another actor's opportunity."""

import frappe


def has_permission(doc, ptype=None, user=None, permission_type=None):
	permission = ptype or permission_type or "read"
	if permission in {"delete", "share", "cancel", "submit", "amend"}:
		return False
	if not doc.get("deal") or (user or frappe.session.user) == "Guest":
		return False
	return bool(
		frappe.has_permission(
			"CRM Deal", "write" if permission in {"create", "write"} else "read", doc=doc.deal, user=user
		)
	)


def get_permission_query_conditions(user=None):
	if user and user != frappe.session.user:
		return "1=0"
	from crm.pipeline.queries.stages import permitted_deals
	from crm.utils.query import subquery_sql

	return "`tabCRM Offer`.`deal` in (" + subquery_sql(permitted_deals()) + ")"
