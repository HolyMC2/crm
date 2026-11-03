# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from crm.inbox import require_service


class CRMConversationRating(Document):
	"""A satisfaction rating request; created by crm.inbox.csat, answered from the customer's link."""

	def before_insert(self):
		require_service(self)

	def validate(self):
		if not self.is_new():
			require_service(self)
