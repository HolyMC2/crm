"""Exercise native runner failure propagation and base-to-candidate ordering without Docker."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent


class NativeRunnerTests(unittest.TestCase):
	def run_runner(self, mode="tests", *, failure="", coverage=False, omit_coverage=False):
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			candidate = root / "candidate"
			results = root / "results"
			bench = root / "bench"
			for path in (results, bench / "env/bin", bench / "apps/crm", candidate / "scripts/ci"):
				path.mkdir(parents=True)
			for path, revision in ((candidate, "head"), (candidate / ".ci-base/crm", "base")):
				(path / "crm").mkdir(parents=True)
				(path / "crm/hooks.py").write_text("")
				(path / "crm/revision.txt").write_text(revision)
				(path / "pyproject.toml").write_text("")
			(candidate / "scripts/ci/migration-probe.py").write_text("")
			python = bench / "env/bin/python"
			python.write_text("#!/usr/bin/env bash\nexit 0\n")
			python.chmod(0o755)
			stub = root / "bench-command"
			stub.mkdir()
			command = stub / "bench"
			command.write_text(
				"""#!/usr/bin/env bash
set -eu
printf '%s|%s\n' "$(cat apps/crm/crm/revision.txt)" "$*" >> "$COMMAND_LOG"
if [ -n "$FAIL_COMMAND" ] && [[ "$*" == *"$FAIL_COMMAND"* ]]; then
  exit 17
fi
mkdir -p sites/crm-integration.localhost/private
printf '{}\n' > sites/crm-integration.localhost/private/crm-ci-migration.json
if [[ "$*" == *"--coverage"* ]] && [ "$OMIT_COVERAGE" = false ]; then
  printf '<coverage/>\n' > sites/coverage.xml
fi
"""
			)
			command.chmod(0o755)
			script = root / "inside-container.sh"
			script.write_text(
				(SCRIPTS / "inside-container.sh")
				.read_text()
				.replace("/candidate", str(candidate))
				.replace("/results", str(results))
			)
			log = root / "commands.log"
			result = subprocess.run(
				["bash", str(script)],
				cwd=bench,
				env={
					**os.environ,
					"PATH": f"{stub}:{os.environ['PATH']}",
					"CRM_CI_MODE": mode,
					"CRM_CI_COVERAGE": str(coverage).lower(),
					"FAIL_COMMAND": failure,
					"COMMAND_LOG": str(log),
					"OMIT_COVERAGE": str(omit_coverage).lower(),
				},
				text=True,
				capture_output=True,
			)
			return (
				result,
				log.read_text().splitlines() if log.exists() else [],
				{path.name for path in results.iterdir()},
			)

	def test_fresh_install_runs_entire_suite_and_copies_coverage(self):
		result, commands, artifacts = self.run_runner(coverage=True)
		self.assertEqual(result.returncode, 0, result.stderr)
		self.assertIn("head|--site crm-integration.localhost run-tests --app crm --coverage", commands)
		self.assertIn("coverage.xml", artifacts)
		self.assertFalse(any("migrate" in command for command in commands))

	def test_migration_installs_base_then_seeds_and_upgrades_candidate(self):
		result, commands, artifacts = self.run_runner("migration")
		self.assertEqual(result.returncode, 0, result.stderr)
		stages = [
			"base|--site crm-integration.localhost install-app crm",
			"base|--site crm-integration.localhost execute crm._ci_migration.seed",
			"head|--site crm-integration.localhost execute crm._ci_migration.guard",
			"head|--site crm-integration.localhost migrate",
			"head|--site crm-integration.localhost execute crm._ci_migration.verify",
			"head|--site crm-integration.localhost run-tests --app crm",
		]
		positions = [commands.index(stage) for stage in stages]
		self.assertEqual(positions, sorted(positions))
		self.assertIn("migrate.log", artifacts)
		self.assertIn("migration-baseline.json", artifacts)

	def test_guard_failure_stops_before_migration(self):
		result, commands, _ = self.run_runner("migration", failure="crm._ci_migration.guard")
		self.assertEqual(result.returncode, 17)
		self.assertFalse(any(command.endswith(" migrate") for command in commands))

	def test_migration_failure_propagates_through_tee_and_stops(self):
		result, commands, artifacts = self.run_runner("migration", failure=" migrate")
		self.assertEqual(result.returncode, 17)
		self.assertIn("migrate.log", artifacts)
		self.assertFalse(
			any("_ci_migration.verify" in command or "run-tests" in command for command in commands)
		)

	def test_native_failure_remains_fatal(self):
		result, _, _ = self.run_runner(failure="run-tests")
		self.assertEqual(result.returncode, 17)

	def test_missing_coverage_is_a_failure(self):
		result, _, _ = self.run_runner(coverage=True, omit_coverage=True)
		self.assertNotEqual(result.returncode, 0)

	def test_unknown_mode_cannot_pass_without_tests(self):
		result, commands, _ = self.run_runner("invalid")
		self.assertEqual(result.returncode, 2)
		self.assertEqual(commands, [])


if __name__ == "__main__":
	unittest.main()
