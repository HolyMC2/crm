# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.model.document import Document

from crm.inbox.labels import clean_name, parse


class CRMConversationLabel(Document):
	def validate(self):
		self.label_name = clean_name(self.label_name)

	def on_trash(self):
		# A deleted label leaves every conversation that carried it.
		for row in frappe.get_all(
			"CRM Conversation",
			filters={"labels": ["like", f"%{self.name}%"]},
			fields=["name", "labels"],
			ignore_permissions=True,
		):
			labels = parse(row.labels)
			if self.name in labels:
				kept = [v for v in labels if v != self.name]
				frappe.db.set_value(
					"CRM Conversation",
					row.name,
					"labels",
					json.dumps(kept, ensure_ascii=False) if kept else None,
					update_modified=False,
				)
