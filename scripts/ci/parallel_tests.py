"""Run crm's native suite as parallel shards inside the CI container, one site per shard.

inside-container.sh runs it from the bench once the site is ready (in migration mode, migrated):

	env/bin/python /candidate/scripts/ci/parallel_tests.py --site crm-integration.localhost --shards 4

Every extra shard gets a copy of the ready site: its folder, and a database copied inside the same
MariaDB (CREATE TABLE … LIKE, INSERT … SELECT; the image has no mariadb-dump) with its own user.
The copies are taken before any shard starts, so each one starts from the same state. The test
modules `bench run-tests --app crm` would run split across the shards by their number of test
methods (longest first onto the lightest shard), and each shard runs its modules through the same
`frappe.commands.testing.main` as `bench run-tests`. Every shard's output is printed in full, and
the run fails when any shard fails.
"""

import argparse
import ast
import concurrent.futures
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

APP = "crm"


def weight(path: Path) -> int:
	"""A module's share of the suite: its test methods, plus one for its setup."""
	try:
		tree = ast.parse(path.read_text(encoding="utf-8"))
	except (OSError, SyntaxError):
		return 1
	tests = sum(
		1
		for node in ast.walk(tree)
		if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name.startswith("test")
	)
	return tests + 1


def discover(site: str) -> tuple[list[str], Path]:
	"""The modules `bench run-tests --app crm` loads, in its order, without importing them."""
	import frappe
	import frappe.testing.discovery as discovery

	frappe.init(site)
	found: list[str] = []
	add = discovery._add_module_tests
	discovery._add_module_tests = lambda runner, app, module: found.append(module)
	try:
		discovery.discover_all_tests([APP], None)
	finally:
		discovery._add_module_tests = add
	root = Path(frappe.get_app_path(APP)).parent
	frappe.destroy()
	return found, root


def partition(modules: list[str], weights: dict[str, int], count: int) -> list[list[str]]:
	"""Longest first onto the lightest shard; each shard keeps discovery order."""
	loads = [0] * count
	shards: list[list[str]] = [[] for _ in range(count)]
	for module in sorted(modules, key=lambda m: (-weights[m], m)):
		lightest = min(range(count), key=lambda i: (loads[i], i))
		shards[lightest].append(module)
		loads[lightest] += weights[module]
	order = {m: i for i, m in enumerate(modules)}
	return [sorted(shard, key=order.__getitem__) for shard in shards if shard]


def copy_site(source: str, target: str, root_password: str) -> None:
	"""sites/<target>: the source site's folder with a fresh database copied server-side."""
	import pymysql

	common = json.loads(Path("common_site_config.json").read_text())
	config = json.loads((Path(source) / "site_config.json").read_text())
	shutil.rmtree(target, ignore_errors=True)
	shutil.copytree(source, target, ignore=shutil.ignore_patterns("locks", "logs"))
	for folder in ("locks", "logs"):
		(Path(target) / folder).mkdir()
	name = "_" + secrets.token_hex(8)
	password = secrets.token_hex(16)
	db = pymysql.connect(
		host=config.get("db_host") or common.get("db_host", "127.0.0.1"),
		port=int(config.get("db_port") or common.get("db_port") or 3306),
		user="root",
		password=root_password,
		autocommit=True,
	)
	try:
		with db.cursor() as cur:
			cur.execute("SET SESSION foreign_key_checks = 0, unique_checks = 0")
			cur.execute(f"CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
			# %% : pymysql formats the query with the parameters, so a literal % is doubled.
			cur.execute(f"CREATE USER '{name}'@'%%' IDENTIFIED BY %s", (password,))
			cur.execute(f"GRANT ALL PRIVILEGES ON `{name}`.* TO '{name}'@'%'")
			cur.execute(
				"SELECT table_name FROM information_schema.tables"
				" WHERE table_schema = %s AND table_type IN ('BASE TABLE', 'SEQUENCE')",
				(config["db_name"],),
			)
			# Base tables and sequences alike: LIKE copies a sequence's definition, INSERT its state.
			for (table,) in cur.fetchall():
				cur.execute(f"CREATE TABLE `{name}`.`{table}` LIKE `{config['db_name']}`.`{table}`")
				cur.execute(f"INSERT INTO `{name}`.`{table}` SELECT * FROM `{config['db_name']}`.`{table}`")
	finally:
		db.close()
	config.update(db_name=name, db_user=name, db_password=password)
	(Path(target) / "site_config.json").write_text(json.dumps(config, indent=1))


def run_shard(site: str, modules_file: str) -> None:
	import frappe
	from frappe.commands.testing import main

	modules = Path(modules_file).read_text().split()
	# As `bench --site … run-tests` does before main(): main reads the site path first thing.
	frappe.init(site)
	main(site=site, app=APP, module=modules)


def parse_args(argv=None) -> argparse.Namespace:
	parser = argparse.ArgumentParser()
	parser.add_argument("--site")
	parser.add_argument("--shards", type=int, default=int(os.environ.get("CRM_CI_SHARDS") or 4))
	parser.add_argument(
		"--db-root-password", default=os.environ.get("CRM_CI_DB_ROOT_PASSWORD", "integration-only")
	)
	parser.add_argument("--logs", default="/results")
	parser.add_argument("--run-shard", nargs=2, metavar=("SITE", "MODULES_FILE"), help=argparse.SUPPRESS)
	args = parser.parse_args(argv)
	if not args.run_shard and not args.site:
		parser.error("--site is required")
	return args


def main_() -> None:
	args = parse_args()
	bench = os.getcwd()
	os.chdir("sites")
	if args.run_shard:
		run_shard(*args.run_shard)
		return

	started = time.monotonic()
	modules, root = discover(args.site)
	weights = {m: weight(root.joinpath(*m.split(".")).with_suffix(".py")) for m in modules}
	shards = partition(modules, weights, max(1, args.shards))
	sites = [args.site] + [f"crm-shard-{index}.localhost" for index in range(2, len(shards) + 1)]
	with concurrent.futures.ThreadPoolExecutor(max(1, len(sites) - 1)) as pool:
		for done in [pool.submit(copy_site, args.site, site, args.db_root_password) for site in sites[1:]]:
			done.result()
	print(
		f"parallel-tests: {len(modules)} modules in {len(shards)} shard(s), "
		f"{len(sites) - 1} site copies ready after {time.monotonic() - started:.0f}s",
		flush=True,
	)

	logs = Path(args.logs)
	logs.mkdir(parents=True, exist_ok=True)
	runs = []
	for index, (site, mine) in enumerate(zip(sites, shards, strict=True), start=1):
		listing = logs / f"test-shard-{index}.txt"
		listing.write_text("\n".join(mine) + "\n")
		out = open(logs / f"test-shard-{index}.log", "w")  # nosemgrep: frappe-security-file-traversal
		load = sum(weights[m] for m in mine)
		print(
			f"parallel-tests: shard {index}/{len(shards)} on {site}: {len(mine)} modules, {load} tests",
			flush=True,
		)
		command = [sys.executable, os.path.abspath(__file__), "--run-shard", site, str(listing.resolve())]
		# From the bench, as this run started: the child changes into sites/ itself.
		runs.append((index, out, subprocess.Popen(command, cwd=bench, stdout=out, stderr=subprocess.STDOUT)))
	failed = []
	try:
		for index, out, run in runs:
			if run.wait():
				failed.append(index)
			out.close()
	finally:
		for _, _, run in runs:
			if run.poll() is None:
				run.terminate()
	print(f"parallel-tests: shards finished after {time.monotonic() - started:.0f}s", flush=True)
	for index, _, _ in runs:
		print(f"===== shard {index}/{len(shards)}{' FAILED' if index in failed else ''}", flush=True)
		sys.stdout.write((logs / f"test-shard-{index}.log").read_text(errors="replace"))
	if failed:
		sys.exit(f"parallel-tests: shard(s) {', '.join(str(index) for index in failed)} failed")


if __name__ == "__main__":
	main_()
