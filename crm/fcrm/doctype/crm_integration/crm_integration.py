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
			self._validate_watched_fields(row)
			key = (row.event, row.document_type or "")
			if key in seen:
				label = f"{row.event} ({_(row.document_type)})" if row.document_type else row.event
				frappe.throw(_("Event {0} is listed twice.").format(label))
			seen.add(key)

	def _validate_watched_fields(self, row):
		"""«Only when these fields change»: diffing update events only, and fields the record type has."""
		from frappe.model import no_value_fields, table_fields

		from crm.integrations import webhooks

		names = webhooks.field_list(row.get("only_fields"))
		if not names:
			row.only_fields = None
			return
		if not webhooks.watches_fields(row.event):
			frappe.throw(
				_(
					"Row {0}: only contact, lead, deal and record updates can wait for chosen fields. Clear «{1}» on {2}."
				).format(row.idx, _("Only when these fields change"), row.event)
			)
		doctype = (
			row.document_type if row.event in webhooks.DOCUMENT_EVENTS else webhooks.EVENTS[row.event][0]
		)
		meta = frappe.get_meta(doctype)
		# a table counts by its rows, as changed_fields compares it; layout and secret fields never change
		unknown = sorted(
			name
			for name in names
			if not (df := meta.get_field(name))
			or df.fieldtype == "Password"
			or (df.fieldtype in no_value_fields and df.fieldtype not in table_fields)
		)
		if unknown:
			frappe.throw(
				_(
					"Row {0}: {1} has no field {2} that can be watched. Use the field names, for example status."
				).format(row.idx, _(doctype), ", ".join(unknown))
			)
		row.only_fields = ", ".join(sorted(names))

	def on_update(self):
		self._clear_routes()

	def on_trash(self):
		self._clear_routes()
		frappe.db.delete("CRM Integration Delivery", {"integration": self.name})

	def _clear_routes(self):
		# now for this process, and again once the change is committed or rolled back, so no
		# process keeps a map it read while this transaction was still open
		from crm.integrations import webhooks

		webhooks.clear_subscriber_cache()
		frappe.db.after_commit.add(webhooks.clear_subscriber_cache)
		frappe.db.after_rollback.add(webhooks.clear_subscriber_cache)
