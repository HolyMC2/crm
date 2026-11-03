"""One outbound connection (n8n or any automation service): signed events out, API calls in as its user."""

import frappe
from frappe import _
from frappe.model.document import Document


class CRMIntegration(Document):
	def validate(self):
		from crm.integrations import webhooks

		if not self.get_password("signing_secret", raise_exception=False):
			self.signing_secret = webhooks.new_secret()
		if self.webhook_url:
			webhooks.validate_url(self.webhook_url)
		self._validate_subscriptions()
		if self.enabled:
			reason = webhooks.enable_blocker(self)
			if reason:
				frappe.throw(reason, title=_("This connection cannot be enabled yet"))
		if self.api_channel and not self.channel_account_id:
			self.channel_account_id = frappe.generate_hash(length=64)

	def _validate_subscriptions(self):
		from crm.integrations import documents

		seen = set()
		for row in self.subscriptions or []:
			if documents.is_document_event(row.event):
				reason = documents.refusal(row.document_type)
				if reason:
					frappe.throw(_("Row {0}: {1}").format(row.idx, reason))
				if self.integration_user and not frappe.has_permission(
					row.document_type, "read", user=self.integration_user
				):
					frappe.throw(
						_(
							"Row {0}: {1} cannot read {2}. Give that user a role that can, or choose another record type."
						).format(row.idx, self.integration_user, _(row.document_type))
					)
			else:
				row.document_type = None
			key = (row.event, row.document_type or "")
			if key in seen:
				label = f"{row.event} ({_(row.document_type)})" if row.document_type else row.event
				frappe.throw(_("Event {0} is listed twice.").format(label))
			seen.add(key)

	def on_update(self):
		from crm.integrations import webhooks

		webhooks.clear_subscriber_cache()

	def on_trash(self):
		from crm.integrations import webhooks

		webhooks.clear_subscriber_cache()
		frappe.db.delete("CRM Integration Delivery", {"integration": self.name})
