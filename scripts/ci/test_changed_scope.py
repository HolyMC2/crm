"""Fast-path classification and gate verdicts (SHELL-D10), without Docker or a site."""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent


def load(name):
	spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


scope = load("changed_scope")
gate = load("gate")


class ClassifyTests(unittest.TestCase):
	def test_frontend_only_skips_server_and_shell(self):
		server, shell, _ = scope.classify(
			[("frontend/src/pages/Hoy.vue", 4, 2), ("frontend/tests/unit/hoy.test.js", 9, 0)]
		)
		self.assertEqual((server, shell), (False, False))

	def test_docs_markdown_and_added_translations_stay_on_the_fast_path(self):
		server, _, reason = scope.classify(
			[
				("docs/CI.md", 3, 3),
				("README.md", 1, 1),
				("crm/locale/es.po", 12, 0),
				("crm/locale/main.pot", 4, 4),
				("frontend/src/App.vue", 1, 1),
			]
		)
		self.assertFalse(server)
		self.assertIn("fast path", reason)

	def test_a_changed_translation_runs_the_full_suite(self):
		# test_pipeline_labels and test_form_wiring assert Spanish msgstr values.
		server, _, _ = scope.classify([("frontend/src/App.vue", 1, 1), ("crm/locale/es.po", 1, 1)])
		self.assertTrue(server)

	def test_python_hooks_patches_doctypes_and_ci_run_the_full_suite(self):
		for path in (
			"crm/api/deals.py",
			"crm/hooks.py",
			"crm/patches.txt",
			"crm/patches/v1_0/fix.py",
			"crm/fcrm/doctype/crm_deal/crm_deal.json",
			"pyproject.toml",
			".github/workflows/migration-test.yml",
			"scripts/ci/inside-container.sh",
			"crm/public/js/desk.js",
			"crm/www/crm.html",
		):
			with self.subTest(path=path):
				server, _, _ = scope.classify([("frontend/src/App.vue", 1, 0), (path, 1, 0)])
				self.assertTrue(server)

	def test_shell_api_paths_start_the_shell_job(self):
		for path in (
			"crm/api/shell.py",
			"crm/api/documentos.py",
			"crm/api/documentos/records.py",
			"crm/tests/test_shell_boot.py",
			"crm/tests/test_documentos_list.py",
			".github/workflows/server-tests.yml",
			"scripts/ci/changed_scope.py",
		):
			with self.subTest(path=path):
				self.assertTrue(scope.classify([(path, 1, 0)])[1])

	def test_registry_change_runs_shell_job_but_not_server(self):
		server, shell, _ = scope.classify([("frontend/src/vendor/muelle-shell/contracts/registry.ts", 2, 1)])
		self.assertEqual((server, shell), (False, True))

	def test_a_marked_test_module_starts_the_shell_job(self):
		path = "crm/tests/test_hoy_boot.py"
		self.assertFalse(scope.classify([(path, 1, 0)])[1])
		self.assertTrue(scope.classify([(path, 1, 0)], marked={path})[1])

	def test_other_python_does_not_start_the_shell_job(self):
		self.assertFalse(scope.classify([("crm/api/deals.py", 1, 0)])[1])

	def test_nothing_known_runs_everything(self):
		self.assertEqual(scope.classify([])[:2], (True, True))


class ShellModulesTests(unittest.TestCase):
	def test_named_and_marked_modules_are_selected(self):
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			tests = root / "crm/tests"
			tests.mkdir(parents=True)
			(tests / "test_shell_boot.py").write_text("")
			(tests / "test_documentos_list.py").write_text("")
			(tests / "test_hoy_boot.py").write_text(f"import x\n{scope.SHELL_MARKER}\n")
			(tests / "test_deals.py").write_text(f"x = '{scope.SHELL_MARKER}'\n")
			self.assertEqual(
				scope.shell_modules(root),
				["crm.tests.test_documentos_list", "crm.tests.test_hoy_boot", "crm.tests.test_shell_boot"],
			)

	def test_this_checkout_selects_the_shell_boot_tests(self):
		self.assertIn("crm.tests.test_shell_boot", scope.shell_modules())


class GitTests(unittest.TestCase):
	def git(self, root, *args):
		subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)

	def run_scope(self, root, base):
		output = Path(root) / "out.txt"
		script = Path(root) / "scripts/ci/changed_scope.py"
		script.parent.mkdir(parents=True, exist_ok=True)
		script.write_text((SCRIPTS / "changed_scope.py").read_text())
		subprocess.run(
			["python3", str(script), "--base", base, "--github-output", str(output)],
			check=True,
			capture_output=True,
			env={**os.environ, "GITHUB_OUTPUT": ""},
		)
		return dict(line.split("=", 1) for line in output.read_text().splitlines())

	def repository(self, directory):
		root = Path(directory)
		self.git(root, "init", "-q", "-b", "doco-dev")
		self.git(root, "config", "user.email", "ci@example.com")
		self.git(root, "config", "user.name", "ci")
		(root / "crm/tests").mkdir(parents=True)
		(root / "crm/tests/test_shell_boot.py").write_text("")
		(root / "crm/locale").mkdir(parents=True)
		(root / "crm/locale/es.po").write_text('msgid "a"\nmsgstr "b"\n')
		(root / "frontend").mkdir()
		(root / "frontend/App.vue").write_text("<template/>\n")
		self.git(root, "add", ".")
		self.git(root, "commit", "-qm", "base")
		self.git(root, "checkout", "-qb", "lane/x")
		return root

	def test_frontend_lane_against_its_merge_base(self):
		with tempfile.TemporaryDirectory() as directory:
			root = self.repository(directory)
			(root / "frontend/App.vue").write_text("<template><b/></template>\n")
			with open(root / "crm/locale/es.po", "a") as catalog:
				catalog.write('msgid "c"\nmsgstr "d"\n')
			self.git(root, "commit", "-qam", "frontend")
			# Mainline moving on with Python must not count against the lane.
			self.git(root, "checkout", "-q", "doco-dev")
			(root / "crm/api.py").write_text("x = 1\n")
			self.git(root, "add", ".")
			self.git(root, "commit", "-qm", "mainline")
			self.git(root, "checkout", "-q", "lane/x")
			outputs = self.run_scope(root, "doco-dev")
			self.assertEqual((outputs["server"], outputs["shell"]), ("false", "false"))
			self.assertEqual(outputs["modules"], "crm.tests.test_shell_boot")

	def test_mainline_itself_and_unknown_base_run_everything(self):
		with tempfile.TemporaryDirectory() as directory:
			root = self.repository(directory)
			self.git(root, "checkout", "-q", "doco-dev")
			self.assertEqual(self.run_scope(root, "doco-dev")["server"], "true")
			outputs = self.run_scope(root, "no-such-branch")
			self.assertEqual((outputs["server"], outputs["shell"]), ("true", "true"))


class GateTests(unittest.TestCase):
	def test_path_skipped_jobs_pass(self):
		ok, _ = gate.verdict(["changes=success", "test=skipped:false", "shell=skipped:false", "ruff=success"])
		self.assertTrue(ok)

	def test_needed_jobs_must_succeed(self):
		for spec in ("test=skipped:true", "test=failure:true", "test=cancelled:true", "test=:true"):
			with self.subTest(spec=spec):
				self.assertFalse(gate.verdict(["changes=success", spec])[0])

	def test_unknown_scope_fails_closed(self):
		# changes failed: its outputs are empty and the real jobs were skipped.
		self.assertFalse(gate.verdict(["changes=failure", "test=skipped:"])[0])
		self.assertFalse(gate.verdict(["test=skipped:"])[0])

	def test_a_failed_skippable_job_still_fails(self):
		self.assertFalse(gate.verdict(["test=failure:false"])[0])

	def test_an_advisory_job_is_reported_but_never_fails_the_gate(self):
		ok, lines = gate.verdict(["changes=success", "shell=failure:true:advisory"])
		self.assertTrue(ok)
		self.assertTrue(lines[1].startswith("warn shell: failure"))
		self.assertTrue(gate.verdict(["shell=skipped:false:advisory"])[0])
		self.assertFalse(gate.verdict(["changes=failure", "shell=success:true:advisory"])[0])

	def test_no_jobs_is_not_green(self):
		self.assertFalse(gate.verdict([])[0])


if __name__ == "__main__":
	unittest.main()
