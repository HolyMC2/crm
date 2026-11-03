# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CRMInboxAgent(Document):
	"""One person who receives automatically assigned conversations, and whether they are in now."""

	def validate(self):
		if frappe.db.get_value("User", self.user, "user_type") != "System User":
			frappe.throw(_("Only people who sign in to the system can receive conversations."))
		if (self.max_open or 0) < 0:
			self.max_open = 0
