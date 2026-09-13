# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Whitelisted entrypoints for the pipeline. Authorization and delegation only."""

import frappe

from crm.pipeline.queries.stages import status_doctype, visible_statuses


@frappe.whitelist()
def get_visible_stages(doctype: str):
	"""Stages a picker, board or funnel may offer for CRM Deal / CRM Lead."""
	frappe.has_permission(status_doctype(doctype), throw=True)
	return visible_statuses(doctype)
