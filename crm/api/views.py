import frappe
from pypika import Criterion

from crm.api.documentos import VIEW_ROUTE as DOCUMENTOS_VIEW_ROUTE


@frappe.whitelist()
def get_views(doctype: str):
	View = frappe.qb.DocType("CRM View Settings")
	query = (
		frappe.qb.from_(View)
		.select("*")
		.where(Criterion.any([View.user == "", View.user == frappe.session.user]))
		# A document list's «Vistas» open in the shell's lists, not in a CRM view.
		.where(View.route_name.isnull() | (View.route_name != DOCUMENTOS_VIEW_ROUTE))
	)
	if doctype:
		query = query.where(View.dt == doctype)
	views = query.run(as_dict=True)
	return views
