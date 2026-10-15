# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""A deal's next step: schedule, snooze, reschedule and complete it.

The next step is the deal's earliest open CRM Task; the crm/pipeline hooks mirror
it onto CRM Deal ``next_activity_*``. Every write here goes through CRM Task, so
the list, the board, Hoy and Deal 360 read one truth.

Rules the seller relies on:
- A new step defaults to tomorrow 10:00 (site time) and to the deal's owner.
- Snooze moves the current step by whole days from today or its date, whichever
  is later, keeping its clock; a deal without a step gets a dated one.
- Complete closes the current step, leaves the outcome on the deal's timeline and
  schedules the next one in the same request.
- A step changed by someone else since it was read is refused, never overwritten.
"""

import datetime

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, getdate, now_datetime, nowdate

from crm.pipeline.constants import OPEN_TASK_STATUSES

DEAL = "CRM Deal"
TASK = "CRM Task"
DEFAULT_CLOCK = datetime.time(10, 0)
DEFAULT_TYPE = "Task"
NEW_STATUS = "Todo"
TERMINAL_TYPES = ("Won", "Lost")
SNOOZE_MAX_DAYS = 90


def default_at(days: int = 1) -> datetime.datetime:
	"""Tomorrow (or `days` ahead) at 10:00, site time."""
	return datetime.datetime.combine(getdate(add_days(nowdate(), days)), DEFAULT_CLOCK)


def state(deal: str) -> dict:
	"""What the next-step dialog needs: the current step, the owner and the defaults."""
	doc = _deal(deal, "read")
	task = _current_task(deal)
	return {
		"deal": deal,
		"open": _is_open(doc.status),
		"status": doc.status,
		"owner": doc.deal_owner or "",
		"task": str(task.name) if task else "",
		"title": task.title if task else "",
		"at": str(task.due_date) if task and task.due_date else "",
		"type": (task.activity_type if task else "") or "",
		"assigned_to": (task.assigned_to if task else "") or "",
		"modified": str(task.modified) if task else "",
		"automated": bool(task and task.automation_slot),
		"default_at": str(default_at()),
		"types": _types(),
	}


def schedule(
	deal: str,
	*,
	title: str,
	at: str,
	activity_type: str | None = None,
	owner: str | None = None,
	task: str | None = None,
	modified: str | None = None,
) -> dict:
	"""Create the deal's next step, or move/retitle the given open one."""
	doc = _deal(deal, "write")
	title = (title or "").strip()
	if not title:
		frappe.throw(_("Write what the next step is."), title=_("Next step"))
	due = _when(at)
	kind = _type(activity_type)
	if task:
		step = _open_task(deal, task, modified)
		step.title = title
		step.due_date = due
		step.activity_type = kind
		if owner:
			step.assigned_to = _user(owner)
		step.save(ignore_permissions=True)
	else:
		_new_task(doc, title=title, due=due, kind=kind, owner=owner)
	return state(deal)


def snooze(deal: str, *, days: int = 1, task: str | None = None, modified: str | None = None) -> dict:
	"""Postpone the current step by whole days, or give a deal without one a dated step."""
	doc = _deal(deal, "write")
	days = int(days or 1)
	if days < 1 or days > SNOOZE_MAX_DAYS:
		frappe.throw(_("Snooze between 1 and {0} days.").format(SNOOZE_MAX_DAYS), title=_("Next step"))
	step = _open_task(deal, task, modified) if task else _current_task(deal)
	if not step:
		_new_task(doc, title=_("Follow up"), due=default_at(days), kind=DEFAULT_TYPE, owner=None)
		return state(deal)
	if step.due_date:
		current = get_datetime(step.due_date)
		base, clock = max(current.date(), getdate(nowdate())), current.time()
	else:
		base, clock = getdate(nowdate()), DEFAULT_CLOCK
	step.due_date = datetime.datetime.combine(getdate(add_days(base, days)), clock)
	step.save(ignore_permissions=True)
	return state(deal)


def complete(
	deal: str,
	*,
	task: str,
	modified: str | None = None,
	note: str | None = None,
	next_step: dict | None = None,
) -> dict:
	"""Close the current step, note the outcome on the deal, schedule the next one."""
	_deal(deal, "write")
	step = _open_task(deal, task, modified)
	step.status = "Done"
	step.save(ignore_permissions=True)
	note = (note or "").strip()
	if note:
		comment = frappe.get_doc(
			{
				"doctype": "Comment",
				"comment_type": "Comment",
				"reference_doctype": DEAL,
				"reference_name": deal,
				"content": frappe.utils.escape_html(f"{step.title}: {note}"),
			}
		)
		comment.insert(ignore_permissions=True)
	if next_step:
		return schedule(
			deal,
			title=next_step.get("title"),
			at=next_step.get("at"),
			activity_type=next_step.get("activity_type") or next_step.get("type"),
			owner=next_step.get("owner"),
		)
	return state(deal)


# ── helpers ────────────────────────────────────────────────────────────────


def _deal(name: str, ptype: str):
	if not name or not frappe.db.exists(DEAL, name):
		frappe.throw(_("This deal no longer exists."), frappe.DoesNotExistError, title=_("Next step"))
	doc = frappe.get_doc(DEAL, name)
	if not frappe.has_permission(DEAL, ptype, doc=doc):
		frappe.throw(
			_("You cannot change this deal. Ask its owner or your manager."),
			frappe.PermissionError,
			title=_("Next step"),
		)
	return doc


def _is_open(status: str | None) -> bool:
	if not status:
		return True
	kind = frappe.db.get_value("CRM Deal Status", status, "type")
	return kind not in TERMINAL_TYPES


def _current_task(deal: str):
	from crm.pipeline.queries.next_activity import earliest_open_task

	found = earliest_open_task(DEAL, deal)
	return frappe.get_doc(TASK, found["name"]) if found else None


def _open_task(deal: str, task: str, modified: str | None):
	if not frappe.db.exists(TASK, task):
		frappe.throw(
			_("This next step was deleted. Reload the deal."), frappe.DoesNotExistError, title=_("Next step")
		)
	step = frappe.get_doc(TASK, task)
	if step.reference_doctype != DEAL or step.reference_docname != deal:
		frappe.throw(_("This step belongs to another record."), title=_("Next step"))
	if modified and get_datetime(modified) != get_datetime(step.modified):
		frappe.throw(
			_("Someone changed this next step a moment ago. Reload the deal to see it."),
			frappe.TimestampMismatchError,
			title=_("Next step"),
		)
	if step.status not in OPEN_TASK_STATUSES:
		frappe.throw(
			_("This step is already {0}. Reload the deal.").format(_(step.status)),
			frappe.ValidationError,
			title=_("Next step"),
		)
	return step


def _new_task(deal_doc, *, title: str, due, kind: str, owner: str | None):
	step = frappe.get_doc(
		{
			"doctype": TASK,
			"title": title,
			"status": NEW_STATUS,
			"activity_type": kind,
			"due_date": due,
			"assigned_to": _user(owner) if owner else (deal_doc.deal_owner or frappe.session.user),
			"reference_doctype": DEAL,
			"reference_docname": deal_doc.name,
		}
	)
	step.insert(ignore_permissions=True)
	return step


def _when(value) -> datetime.datetime:
	if not value:
		frappe.throw(_("Choose the date of the next step."), title=_("Next step"))
	try:
		due = get_datetime(value)
	except Exception:
		due = None
	if not due:
		frappe.throw(_("That date is not valid."), title=_("Next step"))
	# Earlier today is fine (a step for today, its hour already gone); a past day is not.
	if due.date() < now_datetime().date():
		frappe.throw(_("The next step cannot be on a past day."), title=_("Next step"))
	return due


def _types() -> list[str]:
	options = frappe.get_meta(TASK).get_field("activity_type").options or ""
	return [option for option in options.split("\n") if option]


def _type(value: str | None) -> str:
	if not value:
		return DEFAULT_TYPE
	if value not in _types():
		frappe.throw(_("Choose a valid kind of step."), title=_("Next step"))
	return value


def _user(name: str) -> str:
	if not frappe.db.get_value("User", {"name": name, "enabled": 1}):
		frappe.throw(_("Choose an active user as the owner of the step."), title=_("Next step"))
	return name
