# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_to_date, cint, now_datetime

from crm.lead_syncing.doctype.lead_sync_source.facebook import FacebookSyncSource

DELETE_BATCH = 5000
# Short on purpose: a row holds the raw `lead_data` payload (name, phone,
# email as the ad platform sent it) plus a traceback. Its only action is
# `retry_sync`, and a lead form submission is not worth retrying weeks
# later, so the diagnostic value expires long before the PII does.
DEFAULT_RETENTION_DAYS = 30


class FailedLeadSyncLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		lead_data: DF.Code | None
		source: DF.Link | None
		traceback: DF.Code | None
		type: DF.Literal["Duplicate", "Failure", "Synced"]
	# end: auto-generated types

	@staticmethod
	def clear_old_logs(days: int | None = None) -> int:
		"""Frappe Log Settings interface (LogType protocol in
		frappe/core/doctype/log_settings). Log Settings silently drops any
		logs_to_clear row whose controller lacks this method, which is why
		this table had no retention. Registered in boat's
		hygiene.LOG_RETENTION. Batched and idempotent."""
		# Unset -> the app default. 0 or negative DISABLES the purge, matching
		# the "0 = no purgar" convention the rest of the estate uses.
		days = DEFAULT_RETENTION_DAYS if days is None else cint(days)
		if days <= 0:
			return 0
		# CUTOFF CLOCK. `creation` is written from frappe.utils.now_datetime()
		# (frappe/model/base_document.py:754 -> utils/data.py:371), a NAIVE
		# datetime on the SITE's timezone. The cutoff must be built on that same
		# clock: MariaDB's NOW() is UTC here (time_zone=SYSTEM), and today()
		# truncates to midnight, so either one moves the window — by the site's
		# UTC offset, or by up to a whole day.
		cutoff = add_to_date(now_datetime(), days=-days)
		deleted = 0
		while True:
			frappe.db.sql(
				"DELETE FROM `tabFailed Lead Sync Log` WHERE creation < %s LIMIT %s",
				(cutoff, DELETE_BATCH),
			)
			removed = frappe.db._cursor.rowcount or 0
			frappe.db.commit()
			deleted += removed
			if removed < DELETE_BATCH:
				break
		return deleted

	@frappe.whitelist()
	def retry_sync(self):
		if not self.source:
			frappe.throw(frappe._("Can't retry sync for this without source!"))

		source = frappe.get_cached_doc("Lead Sync Source", self.source)
		if source.type != "Facebook":
			frappe.throw(frappe._("Not implemented yet!"))

		crm_lead = FacebookSyncSource(
			source.get_password("access_token"), source.facebook_lead_form
		).sync_single_lead(frappe.parse_json(self.lead_data), raise_exception=True)

		self.type = "Synced"
		self.save()
		return crm_lead
