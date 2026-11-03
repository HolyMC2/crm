"""Durable webhook delivery: written by the integration engine only."""

import frappe
from frappe.model.document import Document


class CRMIntegrationDelivery(Document):
	def validate(self):
		if not self.flags.get("crm_integration_engine"):
			frappe.throw(
				frappe._("Deliveries are written by the integration engine."), frappe.PermissionError
			)
