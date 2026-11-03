# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from crm.inbox import require_service


class CRMConversationNote(Document):
	"""A private note on a customer conversation; written only by crm.inbox.notes."""

	def before_insert(self):
		require_service(self)

	def validate(self):
		if not self.is_new():
			frappe.throw(_("A conversation note cannot be changed once written."))
