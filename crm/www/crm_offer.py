"""Customer page for an issued offer: /o/<token>. The token is the only capability."""

import frappe
from frappe import _
from frappe.utils import fmt_money, format_date, format_datetime

from crm.offers import share

no_cache = 1


def get_context(context):
	token = frappe.form_dict.get("token") or ""
	link = share.resolve(token)
	if not link:
		raise frappe.DoesNotExistError
	if frappe.session.user == "Guest":
		# Customers read the seller's language, not whatever their browser negotiates.
		frappe.local.lang = frappe.db.get_single_value("System Settings", "language") or frappe.local.lang
	headers = frappe.local.response_headers
	headers["Cache-Control"] = "no-store"
	headers["Referrer-Policy"] = "no-referrer"
	headers["X-Robots-Tag"] = "noindex, nofollow"

	view = share.public_view(link)
	precision = view["currency_precision"]

	def money(value):
		return fmt_money(value or 0, precision=precision, currency=view["currency"])

	context.no_cache = 1
	context.lang = frappe.local.lang
	try:
		context.csrf_token = frappe.sessions.get_csrf_token()
	except Exception:
		context.csrf_token = ""
	context.token = token
	context.offer = view
	context.rows = [
		{
			"name": row["product_name"],
			"qty": f"{row['qty']:g}",
			"rate": money(row["rate"]),
			"discount": f"{row['discount_percentage']:g}%" if row["discount_percentage"] else "",
			"amount": money(row["net_amount"]),
			"list_amount": money(row["amount"]) if row["discount_percentage"] else "",
		}
		for row in view["products"]
	]
	context.total = money(view["net_total"])
	context.gross_total = money(view["total"]) if view["total"] != view["net_total"] else ""
	context.valid_until = format_date(view["valid_until"])
	context.decided_at = format_datetime(view["decided_at"]) if view["decided_at"] else ""
	context.messages = [
		{**m, "at": format_datetime(m["at"])} for m in view["messages"]
	]
	context.i18n = {
		"offer": _("Offer"),
		"revision": _("Revision {0}").format(view["revision"]),
		"valid_until": _("Valid until"),
		"prepared_for": _("Prepared for"),
		"your_contact": _("Your contact"),
		"print": _("Print"),
		"description": _("Description"),
		"quantity": _("Quantity"),
		"unit_price": _("Unit price"),
		"discount": _("Disc."),
		"amount": _("Amount"),
		"subtotal": _("Before discounts"),
		"total": _("Total"),
		"tax_note": _("Proposal amounts. Taxes, if any, are calculated on the final quotation or invoice."),
		"terms": _("Terms and conditions"),
		"history": _("Messages"),
		"you": _("You"),
		"write": _("Write a message…"),
		"send": _("Send"),
		"accept": _("Accept offer"),
		"decline": _("Decline"),
		"sign_label": _("Type your full name to accept"),
		"note_label": _("Note (optional)"),
		"confirm_accept": _("Accept and sign"),
		"confirm_decline": _("Decline offer"),
		"decline_reason": _("Tell us why (optional)"),
		"cancel": _("Cancel"),
		"expired": _("This offer has expired. Send us a message to receive a new one."),
		"superseded": _("This offer was replaced by a newer version."),
		"see_newer": _("See the current offer"),
		"contact_us": _("Send us a message below and we will send you the current offer."),
		"accepted": _("You accepted this offer on {0}.").format(context.decided_at),
		"accepted_by": _("Signed as «{0}».").format(view["decided_by_name"]) if view["decided_by_name"] else "",
		"rejected": _("You declined this offer on {0}.").format(context.decided_at),
		"error": _("Something went wrong. Reload the page and try again."),
		"no_messages": _("Questions about this offer? Write to us here."),
	}
