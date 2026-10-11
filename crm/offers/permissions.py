"""An offer never grants access to another actor's opportunity."""

import frappe

# Doco's read-only assistant service role (doco reader_access.enable()). The
# assistant states a figure only from rows that both its service user and the
# person asking can read, so reading every offer never widens what a person sees.
ASSISTANT_READER_ROLE = "Doco Copilot Reader"
_READ_TYPES = frozenset({"read", "select"})


def _reads_every_offer(user=None, permission="read"):
	"""READ of every offer: the tenant administrator, who reads every deal, and
	the assistant's read-only role. Writes keep following the offer's deal."""
	user = user or frappe.session.user
	if permission not in _READ_TYPES:
		return False
	roles = frappe.get_roles(user)
	return user == "Administrator" or "System Manager" in roles or ASSISTANT_READER_ROLE in roles


def has_permission(doc, ptype=None, user=None, permission_type=None):
	permission = ptype or permission_type or "read"
	if _reads_every_offer(user, permission):
		return True
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
	if _reads_every_offer(user):
		return ""
	if user and user != frappe.session.user:
		return "1=0"
	from crm.pipeline.queries.stages import permitted_deals
	from crm.utils.query import subquery_sql

	return "`tabCRM Offer`.`deal` in (" + subquery_sql(permitted_deals()) + ")"
