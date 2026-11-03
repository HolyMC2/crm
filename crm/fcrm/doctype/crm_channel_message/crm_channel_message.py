"""API inbox channel message; writes belong only to crm.integrations.channel."""

import frappe
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
	return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
	return False


class CRMChannelMessage(Document):
	def notify_update(self):
		# Private records use explicit, authorized broker hints only.
		return

	def has_permission(self, permtype="read", *, debug=False, user=None):
		from crm.integrations.channel import WRITE_TOKEN

		return permtype in ("create", "write") and self.flags.get("crm_channel_service") is WRITE_TOKEN

	def check_permission(self, permtype="read", permlevel=None):
		if not self.has_permission(permtype):
			raise frappe.PermissionError("Use the API channel broker.")

	def validate(self):
		from crm.integrations.channel import WRITE_TOKEN

		if self.flags.get("crm_channel_service") is not WRITE_TOKEN:
			frappe.throw(
				frappe._("Channel messages are written by the channel broker."), frappe.PermissionError
			)

	def on_trash(self):
		raise frappe.PermissionError("Channel history cannot be deleted.")
