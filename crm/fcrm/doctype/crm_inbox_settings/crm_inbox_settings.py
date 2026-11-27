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
		self._validate_calls()

	def _validate_calls(self):
		if not self.meta.has_field("call_ring_seconds"):
			return
		from crm.calls_answer import MAX_RING_SECONDS, MIN_RING_SECONDS

		if self.call_ring_seconds:
			self.call_ring_seconds = min(max(self.call_ring_seconds, MIN_RING_SECONDS), MAX_RING_SECONDS)
		if self.call_after_hours and not self.office_hours_enabled:
			frappe.throw(_("Turn office hours on first: the call message plays outside them."))
		if self.call_after_hours and not (self.call_after_hours_message or "").strip():
			frappe.throw(_("Write what callers hear outside office hours."))
		if self.call_voicemail and not (self.call_voicemail_prompt or "").strip():
			frappe.throw(_("Write what callers hear before they leave a message."))
		self._validate_ring_rule()

	def _validate_ring_rule(self):
		if not self.meta.has_field("call_ring_rule"):
			return
		import json

		from crm.call_rule import LIST, MESSAGE, areas_of

		skip = sorted(areas_of(self.call_ring_skip_areas))
		self.call_ring_skip_areas = json.dumps(skip, ensure_ascii=False) if skip else ""
		if self.call_ring_rule != LIST and self.call_ring_fallback == MESSAGE and not self.call_voicemail:
			frappe.throw(
				_("Let callers leave a message first: with nobody on shift the call goes to the message.")
			)

	def _validate_hours(self):
		if self.office_hours_enabled and not self.working_hours:
			frappe.throw(_("Add at least one day with office hours, or turn office hours off."))
		for row in self.working_hours or []:
			start, end = _time(row.start_time), _time(row.end_time)
			if not start or not end or start >= end:
				frappe.throw(
					_("Row {0}: office hours must start before they end on the same day.").format(row.idx)
				)
