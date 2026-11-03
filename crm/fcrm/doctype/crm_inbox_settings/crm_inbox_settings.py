# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from crm.inbox.office_hours import _time


class CRMInboxSettings(Document):
	def validate(self):
		for field in (
			"away_repeat_hours",
			"csat_valid_days",
			"auto_assign_max_open",
			"first_response_minutes",
			"resolution_hours",
		):
			if (self.get(field) or 0) < 0:
				self.set(field, 0)
		self._validate_hours()
		if self.office_hours_enabled and not (self.away_message or "").strip():
			frappe.throw(_("Write the message customers receive outside office hours."))
		if self.csat_enabled and "{link}" not in (self.csat_message or ""):
			frappe.throw(_("The rating message must include {link}, where the rating link goes."))
		self._validate_agents()

	def _validate_hours(self):
		if self.office_hours_enabled and not self.working_hours:
			frappe.throw(_("Add at least one day with office hours, or turn office hours off."))
		for row in self.working_hours or []:
			start, end = _time(row.start_time), _time(row.end_time)
			if not start or not end or start >= end:
				frappe.throw(
					_("Row {0}: office hours must start before they end on the same day.").format(row.idx)
				)

	def _validate_agents(self):
		seen = set()
		for row in self.assignment_agents or []:
			key = (row.user, row.department or "")
			if key in seen:
				frappe.throw(_("Row {0}: {1} is listed twice for the same team.").format(row.idx, row.user))
			seen.add(key)
		if self.auto_assign_enabled and not any(r.active for r in self.assignment_agents or []):
			frappe.throw(_("Add at least one active person to assign conversations to."))
