"""Calls: how many are picked up, and whether a missed call is returned in time.

A call log (CRM Call Log, from Twilio, Exotel or a manual entry) is answered when an
incoming call completed with talk time. It is missed when it rang and nobody took it
(no answer, busy, failed or cancelled). A missed call is returned in time when someone
called that same number back within the inbox's call-back goal (CRM Inbox Settings
`call_callback_minutes`, 30 by default). The person accountable is the one it rang
for (`receiver`); a call that rang for nobody in particular is the team's.

The pure parts (`same_number`, `answered`, `missed`, `judge`) take no site; `per_person`
and `missed_open` read the log. Doco's Metas reads the figures through `crm.metas`
(doco_metas_indicadores), and the assistant's round through `missed_open`.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

import frappe
from frappe.utils import cint, get_datetime, now_datetime

DOCTYPE = "CRM Call Log"
MISSED = ("No Answer", "Busy", "Failed", "Canceled", "Cancelled")
DEFAULT_CALLBACK_MINUTES = 30
DEFAULT_PICKUP_GOAL = 80


def digits(number) -> str:
	return "".join(c for c in str(number or "") if c.isdigit())


def same_number(a, b) -> bool:
	"""The same line: the last 10 digits match (country codes and prefixes vary)."""
	a, b = digits(a), digits(b)
	return len(a) >= 7 and len(b) >= 7 and a[-10:] == b[-10:]


def answered(call) -> bool:
	return (
		call.get("type") == "Incoming"
		and call.get("status") == "Completed"
		and cint(call.get("duration")) > 0
	)


def missed(call) -> bool:
	if call.get("type") != "Incoming":
		return False
	if call.get("status") in MISSED:
		return True
	# A «completed» incoming call nobody talked on is a missed one.
	return call.get("status") == "Completed" and not cint(call.get("duration"))


def judge(missed_call, outgoing, goal_minutes: int, now: datetime):
	"""True: returned within the goal; False: not returned and the goal passed (or returned
	late); None: not returned yet and still inside the goal (not judged)."""
	start = get_datetime(missed_call.get("start_time"))
	due = start + timedelta(minutes=goal_minutes)
	for call in outgoing:
		when = get_datetime(call.get("start_time"))
		if when < start or not same_number(call.get("to"), missed_call.get("from")):
			continue
		return when <= due
	return None if now <= due else False


def settings() -> dict:
	goal, pickup = DEFAULT_CALLBACK_MINUTES, DEFAULT_PICKUP_GOAL
	if frappe.db.exists("DocType", "CRM Inbox Settings"):
		meta = frappe.get_meta("CRM Inbox Settings")
		if meta.has_field("call_callback_minutes"):
			goal = cint(frappe.db.get_single_value("CRM Inbox Settings", "call_callback_minutes")) or goal
		if meta.has_field("call_pickup_goal"):
			pickup = cint(frappe.db.get_single_value("CRM Inbox Settings", "call_pickup_goal")) or pickup
	return {"callback_minutes": goal, "pickup_goal": pickup}


def available() -> bool:
	return bool(frappe.db.exists("DocType", DOCTYPE))


def calls(start: date, end: date, *, extra_minutes: int = 0) -> list:
	since = datetime.combine(start, time.min)
	until = datetime.combine(end, time.max) + timedelta(minutes=extra_minutes)
	return frappe.get_all(
		DOCTYPE,
		filters={"start_time": ["between", [since, until]]},
		fields=["name", "type", "status", "duration", "from", "to", "receiver", "caller", "start_time"],
		order_by="start_time asc",
		limit_page_length=0,
	)


def tally(rows, until: datetime, goal: int, now: datetime) -> dict:
	"""{user: {incoming, answered, missed, returned, returned_late, made}} (pure)."""
	outgoing = [r for r in rows if r.get("type") == "Outgoing"]
	out: dict = defaultdict(
		lambda: {"incoming": 0, "answered": 0, "missed": 0, "returned": 0, "returned_late": 0, "made": 0}
	)
	for row in rows:
		if get_datetime(row.get("start_time")) > until:
			continue  # only there to find call-backs
		if row.get("type") == "Outgoing":
			if row.get("caller") and row.get("status") == "Completed":
				out[row["caller"]]["made"] += 1
			continue
		figure = out[row.get("receiver") or ""]
		figure["incoming"] += 1
		if answered(row):
			figure["answered"] += 1
		elif missed(row):
			figure["missed"] += 1
			verdict = judge(row, outgoing, goal, now)
			if verdict is True:
				figure["returned"] += 1
			elif verdict is False:
				figure["returned_late"] += 1
	return dict(out)


def per_person(start: date, end: date, now: datetime | None = None) -> dict:
	goal = settings()["callback_minutes"]
	rows = calls(start, end, extra_minutes=goal)
	return tally(rows, datetime.combine(end, time.max), goal, now or now_datetime())


def late_missed(rows, goal: int, now: datetime) -> list:
	"""Missed calls not returned and past the goal, one per number (the newest), newest first."""
	outgoing = [r for r in rows if r.get("type") == "Outgoing"]
	newest = {}
	for row in rows:
		if missed(row) and judge(row, outgoing, goal, now) is False:
			newest[digits(row.get("from"))[-10:]] = row
	return sorted(newest.values(), key=lambda r: get_datetime(r.get("start_time")), reverse=True)


def missed_open(now: datetime | None = None, lookback_hours: int = 24) -> list:
	now = now or now_datetime()
	goal = settings()["callback_minutes"]
	rows = frappe.get_all(
		DOCTYPE,
		filters={"start_time": [">=", now - timedelta(hours=lookback_hours)]},
		fields=["name", "type", "status", "duration", "from", "to", "receiver", "start_time"],
		order_by="start_time asc",
		limit_page_length=0,
	)
	return late_missed(rows, goal, now)
