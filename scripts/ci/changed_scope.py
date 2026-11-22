"""Decide which native CRM jobs a change needs (SHELL-D10, Shell SPEC §6.4 A6).

`python3 scripts/ci/changed_scope.py --base <ref> [--github-output FILE]` compares HEAD with its
merge base against <ref> and prints, and appends to $GITHUB_OUTPUT:

- `server=true|false`: Server and Migration are needed. They are skipped only when every changed
  path is on the fast path: `frontend/**`, `docs/**`, `*.md`, `crm/locale/*.pot`, and `.po` diffs that
  only add lines (a changed or removed msgstr can break server tests that assert Spanish text, e.g.
  test_pipeline_labels, so it runs the full suite).
- `shell=true|false`: the Shell APIs job is needed (paths in SHELL_PATHS or a test module carrying
  the SHELL_MARKER line).
- `modules=…`: the space-separated test modules the Shell APIs job runs.
- `migration_suite=true|false`: the Migration job runs the whole suite on the upgraded site. Only
  when Server is needed and the change reaches what migrate applies: JSON in the app (DocTypes,
  workspaces, pages, fixtures), `crm/patches*`, `crm/hooks.py`, the modules the install and migrate
  hooks name and every crm module they import, and the CI itself. Any other change leaves the
  upgraded site what a fresh install of the candidate is, which the Tests job already runs the
  suite on; the Migration job still installs the base, migrates and verifies the probe.

Anything it cannot decide (no base, git failure, running on mainline itself) runs everything.
"""

import argparse
import ast
import fnmatch
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# fnmatch's `*` also matches `/`, so "frontend/*" is the whole tree.
FAST_PATH = ("frontend/*", "docs/*", "*.md", "crm/locale/*.pot")
LOCALE = "crm/locale/*.po"

# Shell APIs and their tests, plus the CI that runs them (so a change to the job proves itself).
SHELL_PATHS = (
	"crm/api/shell*.py",
	"crm/api/documentos*",
	"crm/api/documentos/*",
	"crm/tests/test_shell*.py",
	"crm/tests/test_documentos*.py",
	"frontend/src/vendor/muelle-shell/contracts/registry.ts",
	"scripts/ci/*",
	".github/workflows/server-tests.yml",
	".github/actions/setup-native-environment/*",
)
SHELL_TESTS = ("crm/tests/test_shell*.py", "crm/tests/test_documentos*.py")
# A test module elsewhere joins the Shell APIs job with this line (at the start of a line).
SHELL_MARKER = "# ci: shell-apis"


# What migrate applies, besides the modules the install and migrate hooks reach (migrate_modules).
MIGRATION_PATHS = (
	"crm/*.json",
	"crm/patches.txt",
	"crm/patches/*",
	"crm/hooks.py",
	"scripts/ci/*",
	".github/workflows/migration-test.yml",
	".github/actions/setup-native-environment/*",
)
MIGRATE_HOOKS = ("before_install", "after_install", "before_migrate", "after_migrate")


def migrate_modules(root=ROOT):
	"""crm/… .py paths of the modules the install and migrate hooks name, and every crm module those
	import, statically (the import closure)."""
	files = {}
	for path in (root / "crm").rglob("*.py"):
		parts = path.relative_to(root).with_suffix("").parts
		files[".".join(parts[:-1] if parts[-1] == "__init__" else parts)] = path

	def resolve(dotted):
		parts = dotted.split(".")
		while parts:
			if ".".join(parts) in files:
				return ".".join(parts)
			parts.pop()
		return None

	# The hooks' values, read as literals: a value that is not one raises, and the caller runs the suite.
	todo = []
	for node in ast.parse((root / "crm/hooks.py").read_text(encoding="utf-8")).body:
		if isinstance(node, ast.Assign | ast.AugAssign):
			targets = node.targets if isinstance(node, ast.Assign) else [node.target]
			if any(isinstance(t, ast.Name) and t.id in MIGRATE_HOOKS for t in targets):
				value = ast.literal_eval(node.value)
				todo += [value] if isinstance(value, str) else list(value)
	seen = set()
	todo = [resolve(name) for name in todo]
	while todo:
		module = todo.pop()
		if module is None or module in seen:
			continue
		seen.add(module)
		tree = ast.parse(files[module].read_text(encoding="utf-8"))
		for node in ast.walk(tree):
			if isinstance(node, ast.Import):
				names = [alias.name for alias in node.names]
			elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
				names = [node.module, *(f"{node.module}.{alias.name}" for alias in node.names)]
			else:
				continue
			todo += [resolve(name) for name in names if name.startswith("crm.")]
	return {files[module].relative_to(root).as_posix() for module in seen}


def migration_suite(changes, server, reached):
	"""Whether the Migration job runs the suite after the upgrade (see the module docstring)."""
	if not server:
		return False
	return any(matches(path, MIGRATION_PATHS) or path in reached for path, _a, _d in changes)


def matches(path, patterns):
	return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def shell_modules(root=ROOT):
	"""Test modules the Shell APIs job runs: named shell/documentos tests and marked modules."""
	found = set()
	for path in (root / "crm").rglob("test_*.py"):
		relative = path.relative_to(root).as_posix()
		if matches(relative, SHELL_TESTS) or any(
			line.startswith(SHELL_MARKER) for line in path.read_text(encoding="utf-8").splitlines()
		):
			found.add(relative)
	return sorted(path[: -len(".py")].replace("/", ".") for path in found)


def classify(changes, marked=()):
	"""changes: [(path, added, deleted)]. Returns (server, shell, reason)."""
	if not changes:
		return True, True, "no changed paths found: run everything"
	full = []
	for path, _added, deleted in changes:
		if matches(path, FAST_PATH):
			continue
		if fnmatch.fnmatchcase(path, LOCALE) and deleted == 0:
			continue
		full.append(path)
	shell = [path for path, _a, _d in changes if matches(path, SHELL_PATHS) or path in marked]
	server = bool(full)
	reason = (
		f"{len(full)} path(s) need Server and Migration, e.g. {full[0]}"
		if server
		else "fast path: only frontend, docs and added translations changed"
	)
	if shell:
		reason += f"; Shell APIs job for {shell[0]}"
	return server, bool(shell), reason


def git(*args):
	return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def resolve_base(base):
	for candidate in (f"origin/{base}", base):
		try:
			return git("rev-parse", "--verify", "--quiet", f"{candidate}^{{commit}}").strip()
		except subprocess.CalledProcessError:
			continue
	return ""


def changed_paths(base):
	"""[(path, added, deleted)] of HEAD against its merge base with base; None to run everything."""
	commit = resolve_base(base) if base else ""
	if not commit:
		return None, f"base {base!r} not found: run everything"
	try:
		merge_base = git("merge-base", commit, "HEAD").strip()
		head = git("rev-parse", "HEAD").strip()
		if merge_base == head:
			return None, "HEAD is the base itself (mainline run): run everything"
		rows = git("diff", "--no-renames", "--numstat", merge_base, "HEAD").splitlines()
	except subprocess.CalledProcessError as error:
		return None, f"git failed ({error.stderr.strip()[:200]}): run everything"
	changes = []
	for row in rows:
		added, deleted, path = row.split("\t", 2)
		# Binary files report "-": count them as changed lines.
		changes.append((path, int(added) if added != "-" else 1, int(deleted) if deleted != "-" else 1))
	return changes, f"{len(changes)} changed path(s) since {merge_base[:12]}"


def main(argv=None):
	parser = argparse.ArgumentParser()
	parser.add_argument("--base", default="")
	parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
	args = parser.parse_args(argv)
	modules = shell_modules()
	changes, context = changed_paths(args.base)
	if changes is None:
		server, shell, suite, reason = True, True, True, context
	else:
		marked = {module.replace(".", "/") + ".py" for module in modules}
		server, shell, reason = classify(changes, marked)
		try:
			suite = migration_suite(changes, server, migrate_modules())
		except Exception as error:  # any doubt runs the suite after the upgrade too
			suite, reason = server, f"{reason}; migrate hooks unreadable ({error}), upgrade suite runs"
		if server and not suite:
			reason += "; nothing migrate applies changed: the upgrade job migrates and verifies, no suite"
		reason = f"{context}; {reason}"
		for path, added, deleted in changes:
			print(f"  {path} (+{added} -{deleted})")
	outputs = {
		"server": str(server).lower(),
		"shell": str(shell).lower(),
		"migration_suite": str(suite).lower(),
		"modules": " ".join(modules),
		"reason": reason,
	}
	for key, value in outputs.items():
		print(f"{key}={value}")
	if args.github_output:
		# The runner's $GITHUB_OUTPUT file, not a request path.
		target = args.github_output
		with open(target, "a", encoding="utf-8") as handle:  # nosemgrep: frappe-security-file-traversal
			handle.writelines(f"{key}={value}\n" for key, value in outputs.items())
	return 0


if __name__ == "__main__":
	sys.exit(main())
