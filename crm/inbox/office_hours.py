"""Office hours from CRM Inbox Settings: weekly hours plus the holiday list."""

from datetime import time, timedelta

import frappe
from frappe.utils import get_datetime, getdate


def _time(value):
	if isinstance(value, time):
		return value
	if isinstance(value, timedelta):
		seconds = int(value.total_seconds()) % 86400
		return time(seconds // 3600, seconds % 3600 // 60, seconds % 60)
	if isinstance(value, str) and value:
		hours, minutes, seconds = ([int(p) for p in value.split(".")[0].split(":")] + [0, 0])[:3]
		return time(hours, minutes, seconds)
	return None


def configured(settings):
	return bool(settings.get("office_hours_enabled") and settings.get("working_hours"))


def is_open(settings, when):
	"""True when `when` (site time) is inside the configured hours and not a holiday."""
	when = get_datetime(when)
	if settings.get("holiday_list") and frappe.db.exists(
		"CRM Holiday",
		{"parent": settings.holiday_list, "parenttype": "CRM Holiday List", "date": getdate(when)},
	):
		return False
	day, now = when.strftime("%A"), when.time()
	for row in settings.get("working_hours") or []:
		start, end = _time(row.start_time), _time(row.end_time)
		if row.workday == day and start and end and start <= now < end:
			return True
	return False
