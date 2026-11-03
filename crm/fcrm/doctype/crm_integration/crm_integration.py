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
		seen = set()
		for row in self.subscriptions or []:
			if row.event in seen:
				frappe.throw(_("Event {0} is listed twice.").format(row.event))
			seen.add(row.event)
		if self.enabled:
			reason = webhooks.enable_blocker(self)
			if reason:
				frappe.throw(reason, title=_("This connection cannot be enabled yet"))
		if self.api_channel and not self.channel_account_id:
			self.channel_account_id = frappe.generate_hash(length=64)

	def on_update(self):
		from crm.integrations import webhooks

		webhooks.clear_subscriber_cache()

	def on_trash(self):
		from crm.integrations import webhooks

		webhooks.clear_subscriber_cache()
		frappe.db.delete("CRM Integration Delivery", {"integration": self.name})
