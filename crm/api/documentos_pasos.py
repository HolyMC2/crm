"""Actividad in the owner's words for a record that is a person (Equipo's Employee).

On a person's record an edit reads as the step the owner took («le dio acceso», «cambió su
cargo a Vendedor»), never as a field label with an arrow, and never with a login, an email
or an ID: a User link names nobody (the record is the person), an Employee link names the
employee, an email or a phone change only says it changed. Switches that only keep the books
(the user-permission box, the preferred-email choice) make no step; any other readable change
folds into one «actualizó sus datos».

`reader(doctype)` returns the doctype's step reader, or None where the ledger of old and new
values applies (documentos._version_event).
"""

import frappe
from frappe import _
from frappe.utils import cstr

# Fields of a person's record that never make a step: bookkeeping and Frappe's tree columns.
_EMPLOYEE_NOISE = frozenset(
	{
		"create_user_permission",
		"prefered_contact_email",
		"naming_series",
		"lft",
		"rgt",
		"old_parent",
	}
)
_NAME_FIELDS = ("first_name", "middle_name", "last_name", "employee_name")
_EMAIL_FIELDS = ("personal_email", "company_email", "prefered_email")
# ERPNext's company suffix on a department («Taller - GD»).
_ABBR_SUFFIX = " - "


def _employee_name(value):
	"""An Employee link as its person's name; never the ID."""
	if not value:
		return ""
	return cstr(frappe.db.get_value("Employee", value, "employee_name") or "")


def _department(value):
	text = cstr(value).strip()
	head, sep, _tail = text.rpartition(_ABBR_SUFFIX)
	return head if sep and head else text


def _status_step(new):
	return {
		"Active": _("marked their record as active"),
		"Inactive": _("marked their record as inactive"),
		"Suspended": _("suspended their record"),
		"Left": _("recorded that they left"),
	}.get(cstr(new), _("changed their status"))


def _employee_step(field, old, new):
	"""The step one changed Employee field reads as; None for a field with no step of its own."""
	if field == "user_id":
		if not old:
			return _("gave them access")
		if not new:
			return _("removed their access")
		return _("changed their access")
	if field == "status":
		return _status_step(new)
	if field == "designation":
		return _("changed their job title to {0}").format(new) if new else _("removed their job title")
	if field == "company":
		return _("moved them to {0}").format(new) if new else None
	if field == "department":
		return _("changed their area to {0}").format(_department(new)) if new else _("removed their area")
	if field == "branch":
		return _("changed their branch to {0}").format(new) if new else _("removed their branch")
	if field == "default_shift":
		return _("changed their usual shift to {0}").format(new) if new else _("removed their usual shift")
	if field == "holiday_list":
		return _("changed their days off")
	if field == "reports_to":
		name = _employee_name(new)
		if not new:
			return _("removed who they report to")
		return _("changed who they report to: {0}").format(name) if name else _("changed who they report to")
	if field == "date_of_joining":
		return _("changed their start date")
	if field == "relieving_date":
		return _("set their leaving date") if new else _("removed their leaving date")
	if field == "date_of_birth":
		return _("changed their date of birth")
	if field in _NAME_FIELDS:
		return _("changed their name")
	if field in _EMAIL_FIELDS:
		return _("changed their email")
	if field == "cell_number":
		return _("changed their mobile number")
	if field == "image":
		return _("changed their photo")
	return None


def employee_steps(changed, fields, rows):
	"""The steps of one Employee save, in order and once each.

	`changed` holds the Version's `[field, old, new]` entries, `fields` the fields this worker
	may read (documentos._diff_fields) and `rows` the meaningful child-row changes. A field the
	worker may not read makes no step, not even «actualizó sus datos».
	"""
	steps = []
	details = bool(rows)
	for entry in changed:
		if not isinstance(entry, list | tuple) or len(entry) < 3:
			continue
		field, old, new = cstr(entry[0]), entry[1], entry[2]
		df = fields.get(field)
		if df is None or not df.label or field in _EMPLOYEE_NOISE:
			continue
		if cstr(old) == cstr(new):
			continue
		step = _employee_step(field, old, new)
		if step is None:
			details = True
		elif step not in steps:
			steps.append(step)
	if details:
		steps.append(_("updated their details"))
	return steps


_READERS = {"Employee": employee_steps}


def reader(doctype):
	"""The step reader of a person's doctype, or None (the ledger applies)."""
	return _READERS.get(doctype)
