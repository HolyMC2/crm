import frappe
from frappe.model.document import Document


class CRMOffer(Document):
	def autoname(self):
		self.name = "CRM-OFF-" + self.request_key[:24]

	def has_permission(self, permtype="read", *, debug=False, user=None):
		from crm.offers.permissions import has_permission

		return super().has_permission(permtype, debug=debug, user=user) and has_permission(
			self, permtype, user
		)

	def validate(self):
		from crm.offers.service import validate_offer

		validate_offer(self)

	def on_trash(self):
		frappe.throw("Offer revisions and decision evidence cannot be deleted.", frappe.PermissionError)

	def before_rename(self, old, new, merge=False):
		frappe.throw("Offer revision identities cannot be renamed.", frappe.PermissionError)
