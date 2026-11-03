"""Customer page to rate a closed conversation: /rate/<token>. The token is the only capability."""

import frappe
from frappe import _

from crm.inbox import csat

no_cache = 1


def get_context(context):
	token = frappe.form_dict.get("token") or ""
	row = csat.resolve(token)
	if not row:
		raise frappe.DoesNotExistError
	if frappe.session.user == "Guest":
		# Customers read the seller's language, not whatever their browser negotiates.
		frappe.local.lang = frappe.db.get_single_value("System Settings", "language") or frappe.local.lang
	headers = frappe.local.response_headers
	headers["Cache-Control"] = "no-store"
	headers["Referrer-Policy"] = "no-referrer"
	headers["X-Robots-Tag"] = "noindex, nofollow"
	context.no_cache = 1
	context.lang = frappe.local.lang
	try:
		context.csrf_token = frappe.sessions.get_csrf_token()
	except Exception:
		context.csrf_token = ""
	context.token = token
	context.status = row.status
	context.company = (
		frappe.db.get_single_value("Website Settings", "app_name") or frappe.db.get_default("company") or ""
	)
	context.i18n = {
		"title": _("How did we do?"),
		"intro": _("Tell us how we helped you in this conversation."),
		"stars": [_("Very bad"), _("Bad"), _("Okay"), _("Good"), _("Excellent")],
		"comment": _("Anything else you want to tell us? (optional)"),
		"send": _("Send rating"),
		"thanks": _("Thank you! We received your rating."),
		"expired": _("This rating link has expired. Thank you for writing to us."),
		"choose": _("Choose from 1 to 5 stars."),
		"error": _("Something went wrong. Reload the page and try again."),
	}
