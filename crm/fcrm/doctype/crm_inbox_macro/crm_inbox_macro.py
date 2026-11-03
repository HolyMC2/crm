# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint

from crm.inbox import macros

MAX_TEXT = 4000
MAX_SNOOZE_HOURS = 24 * 90 - 1  # crm.inbox.snooze allows up to 90 days


class CRMInboxMacro(Document):
	def validate(self):
		from crm.inbox.report import MANAGER_ROLES

		if self.shared and not MANAGER_ROLES & set(frappe.get_roles()):
			frappe.throw(_("Only a manager can share a macro with the team."))
		if not self.actions:
			frappe.throw(_("Add at least one step."))
		for row in self.actions:
			self._validate_step(row, last=row.idx == len(self.actions))

	def _validate_step(self, row, last):
		from crm.api.automation_departments import department
		from crm.inbox.labels import LABEL, clean_name

		value = (row.value or "").strip()
		row.value = value or None
		where = _("Step {0}").format(row.idx)
		if row.action in {macros.REPLY, macros.NOTE}:
			if not value or len(value) > MAX_TEXT:
				frappe.throw(_("{0}: write a text of 1 to {1} characters.").format(where, MAX_TEXT))
		elif row.action in {macros.ADD_LABEL, macros.REMOVE_LABEL}:
			row.value = clean_name(value)
			if not frappe.db.exists(LABEL, row.value):
				frappe.throw(_("{0}: the label {1} does not exist.").format(where, row.value))
		elif row.action == macros.TEAM:
			row.value = department(value or None)
		elif row.action == macros.SNOOZE:
			if not 1 <= cint(value) <= MAX_SNOOZE_HOURS:
				frappe.throw(_("{0}: snooze for 1 to {1} hours.").format(where, MAX_SNOOZE_HOURS))
			row.value = str(cint(value))
		elif row.action == macros.CLOSE:
			row.value = None
			if not last:
				frappe.throw(_("{0}: closing must be the last step.").format(where))
