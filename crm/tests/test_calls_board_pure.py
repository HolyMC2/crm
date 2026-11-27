"""The calls page's board (crm/calls_board.py), pure: open or closed, what happened to
each missed call, pickup inside office hours."""

import importlib.util
import sys
import types
import unittest
from datetime import date, datetime
from pathlib import Path

if "frappe" not in sys.modules:
	stub = types.ModuleType("frappe")
	utils = types.ModuleType("frappe.utils")
	utils.cint = lambda v: int(v or 0)
	utils.get_datetime = lambda v: v if isinstance(v, datetime) else datetime.fromisoformat(str(v))
	utils.now_datetime = datetime.now
	stub.utils = utils
	sys.modules["frappe"] = stub
	sys.modules["frappe.utils"] = utils

HERE = Path(__file__).resolve().parents[1]


def _load(name, filename):
	"""The loaded module when there is one; else by path (the crm package's __init__
	needs a site, this module's logic does not)."""
	if name in sys.modules:
		return sys.modules[name]
	spec = importlib.util.spec_from_file_location(name, HERE / filename)
	module = importlib.util.module_from_spec(spec)
	sys.modules[name] = module
	spec.loader.exec_module(module)
	return module


sys.modules.setdefault("crm", types.ModuleType("crm"))
_load("crm.calls_sla", "calls_sla.py")
B = _load("crm.calls_board", "calls_board.py")

WEEK = [
	(d, "09:00:00", "20:00:00") for d in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
]
HOURS = B.Hours([*WEEK, ("Sunday", "08:00:00", "14:00:00")])
CUSTOMER = "+52 669 111 2233"


def call(kind, status, when, frm=CUSTOMER, to="6690000000", duration=0, name=None, **extra):
	return {
		"name": name or f"{kind}-{when}",
		"type": kind,
		"status": status,
		"start_time": datetime.fromisoformat(when),
		"from": frm,
		"to": to,
		"duration": duration,
		**extra,
	}


def summary(rows, now="2026-11-28 12:20", goal=30, hours=HOURS):
	return B.summarize(
		rows,
		start=date(2026, 11, 22),
		end=date(2026, 11, 28),
		now=datetime.fromisoformat(now),
		goal_minutes=goal,
		hours=hours,
	)


class TestHours(unittest.TestCase):
	def test_open_and_closed_by_the_week(self):
		self.assertTrue(HOURS.is_open(datetime(2026, 11, 23, 9, 0)))  # Monday at opening
		self.assertFalse(HOURS.is_open(datetime(2026, 11, 23, 8, 45)))
		self.assertFalse(HOURS.is_open(datetime(2026, 11, 23, 20, 0)))  # closing time is closed
		self.assertTrue(HOURS.is_open(datetime(2026, 11, 22, 13, 59)))  # Sunday
		self.assertFalse(HOURS.is_open(datetime(2026, 11, 22, 16, 2)))

	def test_next_opening_skips_holidays(self):
		self.assertEqual(HOURS.next_open(datetime(2026, 11, 22, 16, 2)), datetime(2026, 11, 23, 9, 0))
		self.assertEqual(HOURS.next_open(datetime(2026, 11, 24, 3, 40)), datetime(2026, 11, 24, 9, 0))
		holiday = B.Hours([*WEEK], holidays=[date(2026, 11, 23)])
		self.assertEqual(holiday.next_open(datetime(2026, 11, 22, 16, 2)), datetime(2026, 11, 24, 9, 0))

	def test_hours_of_the_day_any_day_is_open(self):
		hours = HOURS.open_hours_of_day()
		self.assertTrue(hours[8])  # Sunday opens at 8
		self.assertTrue(hours[19])
		self.assertFalse(hours[20])
		self.assertFalse(hours[3])

	def test_no_rows_is_not_configured(self):
		self.assertFalse(B.Hours().configured)


class TestFollowUp(unittest.TestCase):
	def test_a_call_while_closed_is_due_after_the_next_opening(self):
		rows = [
			call("Incoming", "No Answer", "2026-11-22 16:02"),
			call("Outgoing", "Completed", "2026-11-23 09:20", frm="6690000000", to=CUSTOMER, duration=60),
		]
		out = summary(rows)
		self.assertEqual(
			out["items"][rows[0]["name"]],
			{"verdict": "returned", "minutes": 1038, "closed": True, "message": False},
		)
		self.assertEqual(out["totals"]["missed_closed"], 1)

	def test_the_customer_getting_through_counts_but_late_is_late(self):
		rows = [
			call("Incoming", "No Answer", "2026-11-25 11:49"),
			call("Incoming", "Completed", "2026-11-25 12:50", duration=53),
		]
		item = summary(rows)["items"][rows[0]["name"]]
		self.assertEqual((item["verdict"], item["minutes"], item["closed"]), ("late", 61, False))
		rows[1]["start_time"] = datetime(2026, 11, 25, 12, 0)
		self.assertEqual(summary(rows)["items"][rows[0]["name"]]["verdict"], "reached")

	def test_still_inside_the_goal_is_pending_and_past_it_not_returned(self):
		rows = [call("Incoming", "No Answer", "2026-11-28 12:07")]
		self.assertEqual(summary(rows)["items"][rows[0]["name"]]["verdict"], "pending")
		out = summary(rows, now="2026-11-28 13:00")
		self.assertEqual(out["items"][rows[0]["name"]]["verdict"], "not_returned")
		self.assertEqual(out["waiting"], [rows[0]["name"]])
		self.assertEqual(out["totals"]["waiting_numbers"], 1)

	def test_another_number_is_not_a_call_back(self):
		rows = [
			call("Incoming", "No Answer", "2026-11-26 13:50"),
			call("Outgoing", "Completed", "2026-11-26 13:52", to="6697778899", duration=30),
		]
		self.assertEqual(
			summary(rows, now="2026-11-27 10:00")["items"][rows[0]["name"]]["verdict"], "not_returned"
		)

	def test_a_stored_after_hours_mark_wins_without_hours(self):
		rows = [call("Incoming", "No Answer", "2026-11-26 13:50", after_hours=1, left_message=1)]
		out = summary(rows, now="2026-11-27 10:00", hours=B.Hours())
		self.assertTrue(out["items"][rows[0]["name"]]["closed"])
		self.assertTrue(out["items"][rows[0]["name"]]["message"])
		self.assertEqual(out["totals"]["messages"], 1)
		self.assertFalse(out["hours_configured"])
		self.assertIsNone(out["by_hour"][13]["open"])


class TestSummary(unittest.TestCase):
	def test_doco_like_week(self):
		rows = [
			call("Incoming", "No Answer", "2026-11-22 16:02", name="sun"),
			call("Incoming", "No Answer", "2026-11-23 08:45", name="mon-early"),
			call(
				"Incoming", "Completed", "2026-11-25 18:35", frm="6695550000", duration=171, receiver="tere"
			),
			call("Incoming", "No Answer", "2026-11-26 13:50", frm="6694440000", name="thu"),
			call("Outgoing", "Completed", "2026-11-26 13:52", to="6694440000", duration=64, caller="marco"),
			call("Incoming", "No Answer", "2026-11-28 12:07", frm="6693330000", name="sat"),
			call("Incoming", "No Answer", "2026-11-21 12:00", name="before-the-period"),
		]
		out = summary(rows)
		t = out["totals"]
		self.assertEqual((t["incoming"], t["answered"], t["missed"]), (5, 1, 4))
		self.assertEqual((t["missed_open"], t["missed_closed"]), (2, 2))
		self.assertEqual((t["incoming_open"], t["answered_open"]), (3, 1))
		self.assertEqual(t["pickup_pct"], 20)
		self.assertEqual(t["pickup_open_pct"], 33)
		self.assertEqual((t["returned"], t["pending"], t["not_returned"]), (1, 1, 2))
		self.assertEqual(t["on_time_pct"], 33)
		self.assertEqual((t["outgoing"], t["outgoing_completed"]), (1, 1))
		self.assertNotIn("before-the-period", out["items"])
		# the same customer twice: one number waiting, the newest call
		self.assertEqual(t["waiting_numbers"], 1)
		self.assertEqual(out["waiting"], ["mon-early"])
		self.assertEqual([w["start"] for w in out["weeks"]], ["2026-11-16", "2026-11-23"])
		self.assertEqual(out["weeks"][1], {"start": "2026-11-23", "incoming": 4, "answered": 1, "missed": 3})
		self.assertEqual(out["by_hour"][16], {"hour": 16, "answered": 0, "missed": 1, "open": True})
		self.assertEqual(out["by_hour"][8]["missed"], 1)


if __name__ == "__main__":
	unittest.main()
