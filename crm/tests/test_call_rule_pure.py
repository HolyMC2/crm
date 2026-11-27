"""Who a call to the shop's line rings (crm/call_rule.py `choose`), pure: the salespeople
at work, the people who always ring, the fallback when nobody who sells is at work or the
shop keeps no shifts, and the list rule."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

if "frappe" not in sys.modules:
	stub = types.ModuleType("frappe")
	utils = types.ModuleType("frappe.utils")
	utils.cint = lambda v: int(v or 0)
	stub.utils = utils
	sys.modules["frappe"] = stub
	sys.modules["frappe.utils"] = utils

HERE = Path(__file__).resolve().parents[1]


def _load(name, filename):
	if name in sys.modules and getattr(sys.modules[name], "__file__", None):
		return sys.modules[name]
	spec = importlib.util.spec_from_file_location(name, HERE / filename)
	module = importlib.util.module_from_spec(spec)
	sys.modules[name] = module
	spec.loader.exec_module(module)
	return module


sys.modules.setdefault("crm", types.ModuleType("crm"))
R = _load("crm.call_rule", "call_rule.py")

JENNI, TERE, MARCO, BRANDON, JESS = (
	"jenni@example.com",
	"tere@example.com",
	"owner@example.com",
	"tecnico@example.com",
	"caja@example.com",
)
TEAM = {JENNI: "Ventas", TERE: "Ventas", MARCO: "", BRANDON: "Taller", JESS: "Caja"}
SELLERS = {JENNI, TERE, MARCO, BRANDON, JESS}


def pick(*, rule="shift", fallback="list", listed=(JENNI, TERE, MARCO), always=(), at_work=(), **kw):
	args = {
		"rule": rule,
		"fallback": fallback,
		"listed": list(listed),
		"always": set(always),
		"team": TEAM,
		"at_work": [{"user": u, "shift": "9–15", "checked_in": ""} for u in at_work],
		"sellers": SELLERS,
		"kept": True,
		"skip_areas": set(),
	}
	args.update(kw)
	return R.choose(**args)


class TestRule(unittest.TestCase):
	def test_list_rings_everyone_on_the_number(self):
		out = pick(rule="list", at_work=(JENNI,))
		self.assertEqual(out["ring"], [JENNI, TERE, MARCO])
		self.assertEqual((out["mode"], out["on_shift"]), ("list", []))

	def test_shift_rings_who_is_at_work_and_sells(self):
		out = pick(at_work=(TERE,))
		self.assertEqual(out["ring"], [TERE])
		self.assertEqual(out["mode"], "shift")
		self.assertEqual(out["why"][TERE], {"kind": "shift", "shift": "9–15", "checked_in": ""})

	def test_the_next_call_follows_the_shift_change(self):
		self.assertEqual(pick(at_work=(JENNI,))["ring"], [JENNI])
		self.assertEqual(pick(at_work=(TERE,))["ring"], [TERE])

	def test_someone_at_work_who_is_not_on_the_number_rings_too(self):
		out = pick(listed=(MARCO,), at_work=(JESS,))
		self.assertEqual(out["ring"], [JESS])

	def test_always_ring_people_join_the_shift(self):
		out = pick(at_work=(JENNI,), always=(MARCO,))
		self.assertEqual(out["ring"], [JENNI, MARCO])
		self.assertEqual(out["why"][MARCO]["kind"], "always")
		self.assertEqual(out["on_shift"], [JENNI])

	def test_an_always_ring_person_on_shift_counts_once(self):
		out = pick(at_work=(MARCO,), always=(MARCO,))
		self.assertEqual(out["ring"], [MARCO])
		self.assertEqual(out["why"][MARCO]["kind"], "shift")

	def test_an_area_off_the_line_does_not_ring(self):
		out = pick(at_work=(BRANDON, TERE), skip_areas={"Taller"})
		self.assertEqual(out["ring"], [TERE])

	def test_people_without_a_sales_role_do_not_ring(self):
		out = pick(at_work=(BRANDON,), sellers=SELLERS - {BRANDON})
		self.assertEqual(out["mode"], "fallback")
		self.assertEqual(out["because"], "nobody")

	def test_people_outside_the_shop_do_not_ring(self):
		out = pick(at_work=("visita@example.com",), sellers=SELLERS | {"visita@example.com"})
		self.assertEqual(out["mode"], "fallback")

	def test_nobody_at_work_falls_back_to_the_list(self):
		out = pick(at_work=(), always=(MARCO,))
		self.assertEqual((out["mode"], out["because"]), ("fallback", "nobody"))
		self.assertEqual(out["ring"], [JENNI, TERE, MARCO])
		self.assertEqual(out["why"][MARCO]["kind"], "always")
		self.assertEqual(out["why"][JENNI]["kind"], "list")

	def test_message_fallback_rings_only_the_always_people(self):
		out = pick(at_work=(), always=(MARCO,), fallback="message")
		self.assertEqual(out["ring"], [MARCO])
		self.assertEqual(pick(at_work=(), fallback="message")["ring"], [])

	def test_a_shop_without_shifts_falls_back(self):
		out = pick(at_work=(JENNI,), kept=False)
		self.assertEqual((out["mode"], out["because"]), ("fallback", "no_shifts"))
		self.assertEqual(out["ring"], [JENNI, TERE, MARCO])

	def test_default_rule_follows_whether_the_shop_keeps_shifts(self):
		self.assertEqual(R.rule_of("", True), "shift")
		self.assertEqual(R.rule_of("", False), "list")
		self.assertEqual(R.rule_of("list", True), "list")
		self.assertEqual(R.rule_of("shift", False), "shift")
		self.assertEqual(R.fallback_of("nope"), "list")

	def test_areas_and_the_log(self):
		self.assertEqual(R.areas_of('["Taller", 3]'), {"Taller"})
		self.assertEqual(R.areas_of("not json"), set())
		self.assertEqual(R.areas_of(""), set())
		plan = pick(at_work=(JENNI, TERE), always=(MARCO,))
		entry = R.log_entry(plan, {JENNI, MARCO})
		self.assertEqual(entry["on_shift"], [JENNI, TERE])
		self.assertEqual(entry["rang"], [JENNI, MARCO])
		self.assertEqual(entry["unreached"], [TERE])
		import json

		self.assertEqual(R.parse_log(json.dumps(entry))["rang"], [JENNI, MARCO])
		self.assertIsNone(R.parse_log("[]"))
		self.assertIsNone(R.parse_log(""))


if __name__ == "__main__":
	unittest.main()
