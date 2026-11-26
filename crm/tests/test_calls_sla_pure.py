"""Calls picked up and missed calls returned in time (crm/calls_sla.py), pure."""

import sys
import types
import unittest
from datetime import datetime

if "frappe" not in sys.modules:
	stub = types.ModuleType("frappe")
	utils = types.ModuleType("frappe.utils")
	utils.cint = lambda v: int(v or 0)
	utils.get_datetime = lambda v: v if isinstance(v, datetime) else datetime.fromisoformat(str(v))
	utils.now_datetime = datetime.now
	stub.utils = utils
	sys.modules["frappe"] = stub
	sys.modules["frappe.utils"] = utils

import importlib.util  # noqa: E402
from pathlib import Path  # noqa: E402

# By path: the crm package's __init__ needs a site; this module's logic does not.
_spec = importlib.util.spec_from_file_location("calls_sla", Path(__file__).resolve().parents[1] / "calls_sla.py")
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)

T = datetime(2026, 11, 26, 10, 0)


def call(kind, status, minute, frm="+52 669 123 4567", to="6690000000", duration=0, receiver="tere", caller=None):
	return {"type": kind, "status": status, "start_time": T.replace(minute=minute), "from": frm, "to": to,
	        "duration": duration, "receiver": receiver, "caller": caller}


class TestCalls(unittest.TestCase):
	def test_answered_and_missed(self):
		self.assertTrue(C.answered(call("Incoming", "Completed", 0, duration=40)))
		self.assertTrue(C.missed(call("Incoming", "No Answer", 0)))
		self.assertTrue(C.missed(call("Incoming", "Completed", 0, duration=0)))
		self.assertFalse(C.missed(call("Outgoing", "No Answer", 0)))

	def test_returned_in_time(self):
		missed = call("Incoming", "No Answer", 0)
		back = call("Outgoing", "Completed", 20, to="6691234567")
		self.assertTrue(C.judge(missed, [back], 30, T.replace(minute=59)))
		late = call("Outgoing", "Completed", 45, to="526691234567")
		self.assertFalse(C.judge(missed, [late], 30, T.replace(minute=59)))
		self.assertIsNone(C.judge(missed, [], 30, T.replace(minute=10)))
		self.assertFalse(C.judge(missed, [], 30, T.replace(minute=40)))

	def test_tally_per_person(self):
		rows = [call("Incoming", "Completed", 0, duration=30), call("Incoming", "No Answer", 5),
		        call("Outgoing", "Completed", 10, to="6691234567", caller="tere", receiver=None)]
		out = C.tally(rows, T.replace(hour=23), 30, T.replace(minute=50))
		self.assertEqual(out["tere"]["incoming"], 2)
		self.assertEqual(out["tere"]["answered"], 1)
		self.assertEqual(out["tere"]["returned"], 1)
		self.assertEqual(out["tere"]["made"], 1)

	def test_one_late_row_per_number(self):
		rows = [call("Incoming", "No Answer", 0), call("Incoming", "Busy", 5),
		        call("Incoming", "No Answer", 6, frm="6697777777")]
		late = C.late_missed(rows, 30, T.replace(minute=59))
		self.assertEqual(len(late), 2)


if __name__ == "__main__":
	unittest.main()
