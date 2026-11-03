"""Snooze: put a conversation aside until a time; it comes back by itself.

A snoozed conversation wakes when its time comes (cron) or as soon as the customer
writes again, whichever is first, and the person who snoozed it is told.
"""

from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

from crm.inbox import can_steer, run_command, system_event

MAX_DAYS = 90


def _until(value):
	try:
		until = get_datetime(value)
	except Exception:
		until = None
	now = now_datetime()
	if not until or until <= now + timedelta(minutes=1) or until > now + timedelta(days=MAX_DAYS):
		frappe.throw(_("Choose a time between one minute and {0} days from now.").format(MAX_DAYS))
	return until.replace(microsecond=0)


PRESETS = ("1h", "3h", "tomorrow", "next_week")
DEFAULT_OPENING = time(9, 0)


def _opening(day):
	"""When the team starts on `day`: the earliest office-hours start that weekday, else 9:00."""
	from crm.inbox import settings
	from crm.inbox.office_hours import _time

	starts = [
		_time(row.start_time)
		for row in settings().get("working_hours") or []
		if row.workday == day.strftime("%A") and _time(row.start_time)
	]
	return datetime.combine(day, min(starts) if starts else DEFAULT_OPENING)


def preset_until(preset):
	"""Site-time end of a snooze preset (the browser's clock and zone never decide it)."""
	now = now_datetime()
	if preset == "1h":
		return now + timedelta(hours=1)
	if preset == "3h":
		return now + timedelta(hours=3)
	if preset == "tomorrow":
		return _opening(now.date() + timedelta(days=1))
	if preset == "next_week":
		return _opening(now.date() + timedelta(days=7 - now.weekday()))
	frappe.throw(_("Choose when the conversation comes back."))


def snooze(name, until, command_id):
	from crm.api import conversations as control

	until = _until(until)
	actor = frappe.session.user

	def apply(doc, roles):
		if doc.control_state == "Closed":
			frappe.throw(_("A closed conversation cannot be snoozed. Reopen it first."))
		if not can_steer(doc, roles, actor):
			control._deny()
		control._write_metadata(doc, {"snoozed_until": until, "snoozed_by": actor})
		return str(until), {"snoozed_until": str(until)}

	return run_command(name, command_id, "snooze", [str(until)], apply)


def unsnooze(name, command_id):
	from crm.api import conversations as control

	actor = frappe.session.user

	def apply(doc, roles):
		if not can_steer(doc, roles, actor) and doc.get("snoozed_by") != actor:
			control._deny()
		if doc.get("snoozed_until"):
			control._write_metadata(doc, {"snoozed_until": None, "snoozed_by": None})
		return "", {"snoozed_until": None}

	return run_command(name, command_id, "unsnooze", [], apply)


def wake(name, why):
	"""System wake inside its own fence; tells the person who snoozed it (or the owner)."""
	from crm.api import conversations as control

	with control.conversation_fence(name):
		doc = control._load(name)
		until = doc.get("snoozed_until")
		if not until:
			return False
		if why == "time" and get_datetime(until) > now_datetime():
			return False
		before = control._snapshot(doc)
		who = doc.get("snoozed_by") or doc.human_owner
		control._write_metadata(doc, {"snoozed_until": None, "snoozed_by": None})
		system_event(doc, before, f"wake:{until}", "wake", actor=who, reason=why)
	if who:
		_tell(who, name, why)
	return True


def _tell(user, name, why):
	text = (
		_("A customer wrote in a conversation you snoozed")
		if why == "customer_message"
		else _("A conversation you snoozed is back in your queue")
	)
	if frappe.db.exists("DocType", "CRM Notification"):
		frappe.get_doc(
			{
				"doctype": "CRM Notification",
				"from_user": "Administrator",
				"to_user": user,
				"type": "Assignment",
				"notification_text": text,
				"reference_doctype": "CRM Conversation",
				"reference_name": name,
			}
		).insert(ignore_permissions=True)
	frappe.publish_realtime(
		"crm_conversation_updated", {"name": name, "woke": True}, user=user, after_commit=True
	)


def wake_due():
	"""Cron: wake every conversation whose snooze time has come."""
	from crm.api import conversations as control

	if not frappe.db.has_column(control.DOCTYPE, "snoozed_until"):
		return
	names = frappe.get_all(
		control.DOCTYPE,
		filters={"snoozed_until": ["<=", now_datetime()]},
		pluck="name",
		order_by="snoozed_until asc",
		limit=200,
	)
	for name in names:
		try:
			wake(name, "time")
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- one conversation per commit in a cron sweep
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title="CRM snooze wake failed", message=frappe.get_traceback())
