"""The calls page's tracking: how many calls are picked up, when the missed ones come in
(open or closed), and what happened to each missed call afterwards.

A missed call is attended when the shop called that number back, or the customer
called again and got through. It is on time when that happened within the call-back
goal (CRM Inbox Settings `call_callback_minutes`), counted from the call, or, for a
call outside office hours, from the next opening. The pure part (`Hours`, `follow_up`,
`summarize`) takes no site; `board` reads the log and the settings.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

import frappe
from frappe.utils import get_datetime

from crm.calls_sla import DOCTYPE, answered, missed, same_number, settings

DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
PERIODS = (7, 30, 90)
MANAGERS = {"System Manager", "Sales Manager"}


def _clock(value):
	if isinstance(value, time):
		return value
	if isinstance(value, timedelta):
		seconds = int(value.total_seconds()) % 86400
		return time(seconds // 3600, seconds % 3600 // 60)
	if isinstance(value, str) and value:
		parts = [int(p) for p in value.split(".")[0].split(":")] + [0, 0]
		return time(parts[0], parts[1])
	return None


class Hours:
	"""Office hours as weekly rows (workday, start, end) plus holiday dates."""

	def __init__(self, rows=(), holidays=()):
		self.week = defaultdict(list)
		for workday, start, end in rows:
			start, end = _clock(start), _clock(end)
			if workday in DAYS and start and end and start < end:
				self.week[workday].append((start, end))
		self.holidays = set(holidays)

	@property
	def configured(self) -> bool:
		return bool(self.week)

	def is_open(self, when: datetime) -> bool:
		if when.date() in self.holidays:
			return False
		now = when.time()
		return any(start <= now < end for start, end in self.week.get(DAYS[when.weekday()], ()))

	def next_open(self, when: datetime) -> datetime | None:
		"""`when` itself when open, else the next opening within two weeks."""
		if self.is_open(when):
			return when
		for offset in range(15):
			day = when.date() + timedelta(days=offset)
			if day in self.holidays:
				continue
			for start, _end in sorted(self.week.get(DAYS[day.weekday()], ())):
				opening = datetime.combine(day, start)
				if opening > when:
					return opening
		return None

	def open_hours_of_day(self) -> list[bool]:
		"""For each hour 0-23, whether some day is open during it."""
		out = [False] * 24
		for spans in self.week.values():
			for start, end in spans:
				for hour in range(24):
					if start < time(hour, 59, 59) and time(hour) < end:
						out[hour] = True
		return out


def follow_up(call, later, goal_minutes: int, hours: Hours, now: datetime) -> dict:
	"""What happened after a missed call: «returned» or «reached» on time, «late»,
	«pending» (still inside the goal) or «not_returned». `later` holds the calls after
	it in time order."""
	start = get_datetime(call.get("start_time"))
	closed = bool(call.get("after_hours")) or (hours.configured and not hours.is_open(start))
	base = (hours.next_open(start) if closed and hours.configured else None) or start
	due = base + timedelta(minutes=goal_minutes)
	for other in later:
		when = get_datetime(other.get("start_time"))
		if when <= start:
			continue
		if other.get("type") == "Outgoing" and same_number(other.get("to"), call.get("from")):
			kind = "returned"
		elif answered(other) and same_number(other.get("from"), call.get("from")):
			kind = "reached"
		else:
			continue
		minutes = int((when - start).total_seconds() // 60)
		return {"verdict": kind if when <= due else "late", "minutes": minutes, "closed": closed}
	return {"verdict": "pending" if now <= due else "not_returned", "minutes": None, "closed": closed}


def _pct(part, whole):
	return round(100 * part / whole) if whole else None


def summarize(rows, *, start: date, end: date, now: datetime, goal_minutes: int, hours: Hours) -> dict:
	"""The board over the calls in [start, end]; rows may run past `end` to find call-backs."""
	until = datetime.combine(end, time.max)
	since = datetime.combine(start, time.min)
	rows = sorted(rows, key=lambda r: get_datetime(r.get("start_time")))
	inside = [r for r in rows if since <= get_datetime(r.get("start_time")) <= until]
	incoming = [r for r in inside if r.get("type") == "Incoming"]
	totals = defaultdict(int)
	weeks = defaultdict(lambda: {"incoming": 0, "answered": 0, "missed": 0})
	by_hour = [{"hour": h, "answered": 0, "missed": 0} for h in range(24)]
	items, waiting = {}, {}
	for position, call in enumerate(rows):
		when = get_datetime(call.get("start_time"))
		if not since <= when <= until:
			continue
		if call.get("type") == "Outgoing":
			totals["outgoing"] += 1
			totals["outgoing_completed"] += call.get("status") == "Completed"
			continue
		week = (when.date() - timedelta(days=when.weekday())).isoformat()
		weeks[week]["incoming"] += 1
		totals["incoming"] += 1
		closed = bool(call.get("after_hours")) or (hours.configured and not hours.is_open(when))
		totals["incoming_closed" if closed else "incoming_open"] += 1
		if answered(call):
			weeks[week]["answered"] += 1
			by_hour[when.hour]["answered"] += 1
			totals["answered"] += 1
			totals["answered_closed" if closed else "answered_open"] += 1
			continue
		if not missed(call):
			continue
		weeks[week]["missed"] += 1
		by_hour[when.hour]["missed"] += 1
		totals["missed"] += 1
		totals["missed_closed" if closed else "missed_open"] += 1
		totals["messages"] += bool(call.get("left_message"))
		item = follow_up(call, rows[position + 1 :], goal_minutes, hours, now)
		item["message"] = bool(call.get("left_message"))
		items[call["name"]] = item
		totals[item["verdict"]] += 1
		if item["verdict"] == "not_returned":
			waiting[str(call.get("from") or "")[-10:]] = call["name"]
	open_hours = hours.open_hours_of_day() if hours.configured else [None] * 24
	for row in by_hour:
		row["open"] = open_hours[row["hour"]]
	return {
		"hours_configured": hours.configured,
		"totals": {
			**totals,
			"pickup_pct": _pct(totals["answered"], totals["incoming"]),
			"pickup_open_pct": _pct(totals["answered_open"], totals["incoming_open"]),
			"on_time_pct": _pct(totals["returned"] + totals["reached"], totals["missed"] - totals["pending"]),
			"waiting_numbers": len(waiting),
		},
		"weeks": [{"start": k, **v} for k, v in sorted(weeks.items())],
		"by_hour": by_hour,
		"items": items,
		"waiting": list(waiting.values()),
		"incoming_names": [r["name"] for r in incoming],
	}


def people(rows, *, start: date, end: date) -> list:
	"""Per person: incoming calls they took and calls they made (managers only)."""
	since, until = datetime.combine(start, time.min), datetime.combine(end, time.max)
	out = defaultdict(lambda: {"answered": 0, "made": 0})
	for row in rows:
		if not since <= get_datetime(row.get("start_time")) <= until:
			continue
		if answered(row) and row.get("receiver"):
			out[row["receiver"]]["answered"] += 1
		elif row.get("type") == "Outgoing" and row.get("caller") and row.get("status") == "Completed":
			out[row["caller"]]["made"] += 1
	return [
		{"user": user, "name": frappe.utils.get_fullname(user), **figures}
		for user, figures in sorted(out.items(), key=lambda kv: -(kv[1]["answered"] + kv[1]["made"]))
	]


def site_hours() -> Hours:
	from crm import inbox

	doc = inbox.settings()
	if not doc or not doc.get("office_hours_enabled"):
		return Hours()
	rows = [(r.workday, r.start_time, r.end_time) for r in doc.get("working_hours") or []]
	holidays = []
	if doc.get("holiday_list"):
		holidays = [
			get_datetime(d).date()
			for d in frappe.get_all(
				"CRM Holiday",
				filters={"parent": doc.holiday_list, "parenttype": "CRM Holiday List"},
				pluck="date",
			)
		]
	return Hours(rows, holidays)


def add_rings(items: dict, rows) -> None:
	"""Each missed call's `ring`: who was at work and who was rung, as first names
	(crm.call_rule.log_entry kept on the call's log)."""
	from crm.call_rule import parse_log

	names = {}

	def first(user):
		if user not in names:
			full = frappe.utils.get_fullname(user) or user
			names[user] = full.split()[0] if full.split() else user
		return names[user]

	for row in rows:
		item = items.get(row.get("name"))
		log = parse_log(row.get("ring_log")) if item is not None else None
		if not log:
			continue
		item["ring"] = {
			"mode": log["mode"],
			"because": log["because"],
			**{key: [first(u) for u in log[key]] for key in ("on_shift", "rang", "unreached")},
		}


def board(days: int, now: datetime) -> dict:
	"""The calls page's figures for the last `days` days, as the reader may see them."""
	end = now.date()
	start = end - timedelta(days=days - 1)
	goal = settings()
	meta = frappe.get_meta(DOCTYPE)
	fields = ["name", "type", "status", "duration", "from", "to", "receiver", "caller", "start_time"]
	fields += [f for f in ("after_hours", "left_message", "ring_log") if meta.has_field(f)]
	rows = frappe.get_list(
		DOCTYPE,
		filters={"start_time": [">=", datetime.combine(start, time.min)]},
		fields=fields,
		order_by="start_time asc",
		limit_page_length=0,
	)
	out = summarize(
		rows, start=start, end=end, now=now, goal_minutes=goal["callback_minutes"], hours=site_hours()
	)
	add_rings(out["items"], rows)
	out.update(
		{
			"days": days,
			"start": start.isoformat(),
			"end": end.isoformat(),
			"goals": goal,
			"people": people(rows, start=start, end=end) if MANAGERS & set(frappe.get_roles()) else None,
		}
	)
	return out
