# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Reminders for deals' next steps, and escalation of the overdue ones.

A deal's next step is its earliest open CRM Task, mirrored on CRM Deal
``next_activity_*``. Both jobs read those mirrored fields (indexed), so they cost
one query each, whatever the size of the tenant.

- ``remind_due`` (every 15 minutes): a next step due today, at most
  ``LEAD_MINUTES`` ahead, reaches the person it is assigned to as an aviso.
- ``escalate_overdue`` (every morning): a next step still open a full day after
  its date reaches the owner's manager (their parent in CRM Sales Hierarchy) as
  an aviso that opens the deal. Every manager also sees the team's overdue steps
  on Hoy (crm.api.hoy, «Seguimientos vencidos del equipo»).

Each aviso is a CRM Notification of type «Task» (a «direct» aviso) that opens the
deal; it is written in the recipient's language and sent once per step and due
date, so a rescheduled step reminds again and a repeated run never does.
"""

import datetime

import frappe
from frappe import _
from frappe.utils import add_days, cint, format_datetime, getdate, now_datetime, nowdate

DEAL = "CRM Deal"
TASK = "CRM Task"
NOTE = "CRM Notification"
TYPE = "Task"
LEAD_MINUTES = 15
ESCALATE_AFTER_DAYS = 1
RUN_CAP = 200  # avisos per job run; the rest go on the next run


def remind_due() -> int:
	"""Remind assignees of next steps due now or within LEAD_MINUTES. Returns avisos sent."""
	now = now_datetime()
	start = datetime.datetime.combine(now.date(), datetime.time.min)
	steps = _steps(start, now + datetime.timedelta(minutes=LEAD_MINUTES))
	sent = 0
	for step in steps:
		user = step.assigned_to or step.deal_owner
		if not _active(user):
			continue
		lang = _lang(user)
		text = _("Next step due {0}: {1} — {2}", lang=lang).format(
			_clock(step.next_activity_at), step.next_activity_title or _("Follow up", lang=lang), _title(step)
		)
		sent += _send(user, step, text)
		if sent >= RUN_CAP:
			break
	return sent


def escalate_overdue() -> int:
	"""Tell managers about next steps still open a full day after their date."""
	before = datetime.datetime.combine(getdate(add_days(nowdate(), -ESCALATE_AFTER_DAYS)), datetime.time.min)
	steps = _steps(datetime.datetime(1000, 1, 1), before - datetime.timedelta(microseconds=1))
	sent = 0
	for step in steps:
		owner = step.assigned_to or step.deal_owner
		for manager in managers_of(owner):
			lang = _lang(manager)
			text = _("Overdue since {0}: {1} — {2} ({3})", lang=lang).format(
				format_datetime(step.next_activity_at, "d MMM"),
				step.next_activity_title or _("Follow up", lang=lang),
				_title(step),
				_full_name(owner) if owner else _("no owner", lang=lang),
			)
			sent += _send(manager, step, text)
		if sent >= RUN_CAP:
			break
	return sent


def managers_of(user: str | None) -> list[str]:
	"""This person's manager in the sales hierarchy, if the tenant uses one.

	Without a hierarchy there is no single person to tell: the overdue steps show
	in the managers' Hoy («Seguimientos vencidos del equipo») instead of an aviso
	to every Sales Manager.
	"""
	from crm.permissions.org_hierarchy import hierarchy_enabled

	if not user or not hierarchy_enabled():
		return []
	parent = frappe.db.get_value("CRM Sales Hierarchy", {"user": user}, "reports_to")
	boss = parent and frappe.db.get_value("CRM Sales Hierarchy", parent, "user")
	return [boss] if boss and boss != user and _active(boss) else []


# ── helpers ────────────────────────────────────────────────────────────────


def _steps(start, end):
	"""Open deals whose next step falls in [start, end], with its assignee."""
	from crm.api.list_tokens import open_deal_statuses

	deal = frappe.qb.DocType(DEAL)
	task = frappe.qb.DocType(TASK)
	return (
		frappe.qb.from_(deal)
		.left_join(task)
		.on(task.name == deal.next_activity_task)
		.select(
			deal.name,
			deal.deal_name,
			deal.organization,
			deal.deal_owner,
			deal.next_activity_at,
			deal.next_activity_title,
			deal.next_activity_task,
			task.assigned_to,
		)
		.where(
			deal.next_activity_task.isnotnull()
			& (deal.next_activity_task != "")
			& deal.next_activity_at[start:end]
			& deal.status.isin(open_deal_statuses() or [""])
		)
		.orderby(deal.next_activity_at)
		.limit(RUN_CAP * 5)
	).run(as_dict=True)


def _send(user: str, step, text: str) -> int:
	key = {
		"type": TYPE,
		"to_user": user,
		"notification_type_doctype": TASK,
		"notification_type_doc": str(step.next_activity_task),
		"notification_text": text,
	}
	if frappe.db.exists(NOTE, key):
		return 0
	frappe.get_doc(
		{
			"doctype": NOTE,
			**key,
			"from_user": "Administrator",
			"message": "",
			"reference_doctype": DEAL,
			"reference_name": step.name,
		}
	).insert(ignore_permissions=True)
	return 1


def _active(user: str | None) -> bool:
	return bool(user) and cint(frappe.db.get_value("User", user, "enabled")) == 1


def _lang(user: str) -> str:
	return frappe.db.get_value("User", user, "language") or frappe.get_system_settings("language") or "en"


def _clock(value) -> str:
	return format_datetime(value, "HH:mm")


def _title(step) -> str:
	return step.deal_name or step.organization or step.name


def _full_name(user: str) -> str:
	return frappe.db.get_value("User", user, "full_name") or user
