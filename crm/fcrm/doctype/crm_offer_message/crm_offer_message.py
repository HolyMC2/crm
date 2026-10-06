import frappe
from frappe import _
from frappe.model.document import Document


class CRMOfferMessage(Document):
	def validate(self):
		from crm.offers.share import guard_write

		guard_write(self)

	def on_trash(self):
		if not self.flags.get("crm_offer_share"):
			frappe.throw(_("Use the offer actions to change customer links and messages."), frappe.PermissionError)
