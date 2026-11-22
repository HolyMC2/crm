"""parallel_tests.py without a site: its arguments, the shard split and the module weights."""

import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SPEC = importlib.util.spec_from_file_location(
	"parallel_tests", Path(__file__).resolve().parent / "parallel_tests.py"
)
pt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pt)


class ParallelTestsTests(unittest.TestCase):
	def test_a_shard_child_needs_no_site_flag(self):
		args = pt.parse_args(["--run-shard", "crm-shard-2.localhost", "/results/test-shard-2.txt"])
		self.assertEqual(args.run_shard, ["crm-shard-2.localhost", "/results/test-shard-2.txt"])

	def test_the_parent_needs_a_site(self):
		with self.assertRaises(SystemExit):
			pt.parse_args([])
		self.assertEqual(pt.parse_args(["--site", "s", "--shards", "3"]).shards, 3)

	def test_every_module_lands_on_exactly_one_shard_in_discovery_order(self):
		modules = [f"crm.tests.test_{i}" for i in range(10)]
		weights = {m: (i % 4) + 1 for i, m in enumerate(modules)}
		shards = pt.partition(modules, weights, 3)
		self.assertEqual(sorted(m for shard in shards for m in shard), sorted(modules))
		for shard in shards:
			self.assertEqual(shard, sorted(shard, key=modules.index))
		loads = [sum(weights[m] for m in shard) for shard in shards]
		self.assertLessEqual(max(loads) - min(loads), max(weights.values()))

	def test_more_shards_than_modules_leaves_no_empty_shard(self):
		self.assertEqual(
			pt.partition(["crm.tests.test_a"], {"crm.tests.test_a": 2}, 3), [["crm.tests.test_a"]]
		)

	def test_a_module_weighs_its_test_methods_plus_one(self):
		with tempfile.TemporaryDirectory() as folder:
			path = Path(folder) / "test_x.py"
			path.write_text(
				"class T:\n\tdef test_a(self):\n\t\tpass\n\tdef test_b(self):\n\t\tpass\n\tdef helper(self):\n\t\tpass\n"
			)
			self.assertEqual(pt.weight(path), 3)
			self.assertEqual(pt.weight(Path(folder) / "missing.py"), 1)


# A stand-in frappe whose test runner records what each shard child was asked to run.
FAKE_TESTING = """
import json, os
def main(site=None, app=None, module=None):
	import frappe
	assert frappe.site == site, "frappe.init(site) must come before main()"
	with open(os.environ["FAKE_RUNS"], "a") as fh:
		fh.write(json.dumps({"cwd": os.path.basename(os.getcwd()), "site": site, "app": app, "module": module}) + "\\n")
	if site == os.environ.get("FAKE_RED_SITE"):
		raise SystemExit(1)
"""


class ShardRunTests(unittest.TestCase):
	"""The parent and its shard children for real, with frappe and the database copy stood in."""

	def run_parent(self, red_site=""):
		with tempfile.TemporaryDirectory() as folder:
			root = Path(folder)
			fake = root / "fake/frappe/commands"
			fake.mkdir(parents=True)
			(root / "fake/frappe/__init__.py").write_text(
				"site = None\n\ndef init(name):\n\tglobal site\n\tsite = name\n"
			)
			(fake / "__init__.py").write_text("")
			(fake / "testing.py").write_text(FAKE_TESTING)
			bench = root / "bench"
			(bench / "sites").mkdir(parents=True)
			runs = root / "runs.jsonl"
			env = {
				"PYTHONPATH": str(root / "fake"),
				"FAKE_RUNS": str(runs),
				"FAKE_RED_SITE": red_site,
			}
			modules = [f"crm.tests.test_{i}" for i in range(5)]
			out = io.StringIO()
			with (
				mock.patch.dict(os.environ, env),
				mock.patch.object(pt, "discover", return_value=(modules, root)),
				mock.patch.object(pt, "copy_site"),
				mock.patch.object(
					sys,
					"argv",
					["parallel_tests.py", "--site", "s1", "--shards", "3", "--logs", str(root / "logs")],
				),
				contextlib.redirect_stdout(out),
				contextlib.chdir(bench),
			):
				try:
					pt.main_()
					code = 0
				except SystemExit as exc:
					code = exc.code
			calls = [__import__("json").loads(line) for line in runs.read_text().splitlines()]
			return code, calls, out.getvalue()

	def test_each_child_runs_its_modules_on_its_own_site_from_sites(self):
		code, calls, output = self.run_parent()
		self.assertEqual(code, 0, output)
		self.assertEqual({c["site"] for c in calls}, {"s1", "crm-shard-2.localhost", "crm-shard-3.localhost"})
		self.assertEqual({c["cwd"] for c in calls}, {"sites"})
		self.assertEqual(
			sorted(m for c in calls for m in c["module"]), [f"crm.tests.test_{i}" for i in range(5)]
		)
		self.assertTrue(all(c["app"] == "crm" for c in calls))

	def test_a_red_shard_fails_the_run(self):
		code, calls, output = self.run_parent(red_site="crm-shard-2.localhost")
		self.assertEqual(len(calls), 3)
		self.assertIn("shard(s) 2 failed", str(code))


if __name__ == "__main__":
	unittest.main()
