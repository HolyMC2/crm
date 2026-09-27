"""Small synthetic contract tests; never performance or native CRM evidence."""

import copy
import json
import unittest
from datetime import datetime, timedelta, timezone

from contract import (
	BUNDLES,
	PROFILE_PAIRS,
	ContractError,
	checksum,
	validate_attestation,
	validate_bindings,
	validate_manifest,
)
from validate import nearest_rank, summarize


def fixture():
	"""Fictional manifests for pure validator tests, not runnable acceptance data."""
	manifest = {
		"version": 1,
		"run_id": "contract_test",
		"environment": {
			"site": "crm-perf-123456789abc.localhost",
			"base_url": "http://127.0.0.1:18080",
			"hardware_digest": "a" * 64,
			"network_digest": "b" * 64,
			"image": "ghcr.io/holymc2/doco-bench@sha256:" + "c" * 64,
			"attestation_digest": "d" * 64,
			"concurrency": 1,
			"timeout_seconds": 3,
			"max_seconds": 3600,
			"warmups": 5,
			"samples": 100,
		},
		"sources": {
			app: {"commit": "e" * 40, "tree_digest": "f" * 64}
			for app in (
				"crm",
				"frappe",
				"muelle",
				"taller",
				"doco",
				"erpnext",
				"frappe_whatsapp",
				"doco_meta_catalog",
				"doco_marketing",
				"posawesome",
				"mercadopago_connector",
			)
		},
		"seed": {
			"deals": 10_000,
			"activities": 50_000,
			"conversations": 1000,
			"messages": 20_000,
			"intents": 2000,
			"repair_orders": 500,
			"manifest_digest": "1" * 64,
			"scope_digest": "2" * 64,
			"controller_valid": True,
			"hot_history": 5000,
		},
		"roles": {},
		"scenarios": {},
	}
	bindings = {"actors": {}, "scenarios": {}}
	for profile, pairs in PROFILE_PAIRS.items():
		manifest["roles"][profile] = {"profile": profile, "scope_digest": "3" * 64}
		bindings["actors"][profile] = {
			"user": profile + "@example.invalid",
			"session_env": "CRM_PERF_" + profile.upper() + "_SID",
			"csrf_env": "CRM_PERF_" + profile.upper() + "_CSRF",
		}
		bundles = {"deals_queue", "deal_detail"}
		for prefix in pairs - {"deals", "deal"}:
			bundles.update({prefix + "_queue", prefix + "_detail"})
		for bundle, cohort in [(bundle, "ordinary") for bundle in sorted(bundles)] + [
			("deal_detail", "hot_history")
		]:
			alias = profile + "_" + bundle + ("_hot" if cohort != "ordinary" else "")
			cases = []
			for index in range(10):
				case = []
				for method in BUNDLES[bundle]:
					params = (
						{"doctype": "CRM Deal", "fields": ["name"], "limit_page_length": 50}
						if method == "frappe.client.get_list"
						else {"doctype": "CRM Deal", "name": f"fixture-{index}"}
						if method == "frappe.client.get"
						else {}
					)
					case.append(
						{"params": params, "checks": [{"path": ["message"], "digest": checksum(index)}]}
					)
				cases.append(case)
			manifest["scenarios"][alias] = {
				"role": profile,
				"bundle": bundle,
				"cohort": cohort,
				"case_count": len(cases),
				"cases_digest": checksum(cases),
			}
			bindings["scenarios"][alias] = cases
	attestation = {
		"site": manifest["environment"]["site"],
		"created_at": datetime.now(timezone.utc).isoformat(),
		"disposable": True,
		"outbound_disabled": True,
		"scheduler_disabled": True,
		"workers_disabled": True,
		"sources_digest": checksum(manifest["sources"]),
		"seed_manifest_digest": manifest["seed"]["manifest_digest"],
		"scope_digest": manifest["seed"]["scope_digest"],
		**{k: manifest["environment"][k] for k in ("base_url", "hardware_digest", "network_digest", "image")},
	}
	manifest["environment"]["attestation_digest"] = checksum(attestation)
	return manifest, bindings, attestation


def observations(manifest):
	step = {"status": 200, "elapsed_ms": 0.1, "bytes": 50, "error": None, "matched": True}
	rows = [{"kind": "auth", "role": role, **step} for role in manifest["roles"]]
	for alias, scenario in manifest["scenarios"].items():
		for phase, count in (("warmup", 5), ("warm", 100)):
			for index in range(count):
				rows.append(
					{
						"kind": "sample",
						"scenario": alias,
						"phase": phase,
						"index": index,
						"case_index": index % scenario["case_count"],
						"elapsed_ms": index + 1,
						"ok": True,
						"steps": [dict(step) for _ in BUNDLES[scenario["bundle"]]],
					}
				)
	for row in rows:
		row["manifest_digest"] = checksum(manifest)
	completion = {
		"manifest_digest": checksum(manifest),
		"complete": True,
		"http_errors": False,
		"sql_coverage": False,
		"browser_coverage": False,
	}
	return rows, completion


class ContractTests(unittest.TestCase):
	def test_nearest_rank_is_not_interpolation(self):
		self.assertEqual(nearest_rank(list(range(1, 101))), 95)
		self.assertEqual(nearest_rank([7, 100, 1]), 100)
		self.assertEqual(nearest_rank([4]), 4)
		for values in ([], [float("nan")], [float("inf")], [-1]):
			with self.assertRaises(ContractError):
				nearest_rank(values)

	def test_roles_dataset_site_and_bundle_are_mandatory(self):
		manifest, bindings, attestation = fixture()
		validate_manifest(manifest)
		validate_bindings(bindings, manifest)
		validate_attestation(attestation, manifest)
		mutations = [
			lambda m: m["environment"].update(site="production.example.com"),
			lambda m: m["environment"].update(base_url="http://127.0.0.1.evil.invalid:80"),
			lambda m: m["environment"].update(base_url="http://secret@127.0.0.1:80"),
			lambda m: m["environment"].update(samples=99),
			lambda m: m["seed"].update(activities=49_999),
			lambda m: m["roles"].pop("counter"),
			lambda m: m["scenarios"].pop("seller_deal_detail"),
			lambda m: m["scenarios"].pop("seller_deal_detail_hot"),
			lambda m: m["scenarios"]["seller_deal_detail"].update(bundle="create_order"),
		]
		for mutate in mutations:
			with self.subTest(mutate=mutate):
				bad = copy.deepcopy(manifest)
				mutate(bad)
				with self.assertRaises(ContractError):
					validate_manifest(bad)

	def test_attestation_rejects_future_stale_source_and_mutation(self):
		manifest, _, attestation = fixture()
		for change in (
			{"created_at": (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()},
			{"created_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()},
			{"outbound_disabled": False},
			{"sources_digest": "0" * 64},
		):
			bad = {**attestation, **change}
			manifest["environment"]["attestation_digest"] = checksum(bad)
			with self.assertRaises(ContractError):
				validate_attestation(bad, manifest)

	def test_bindings_cannot_change_fixture_checks_method_scope_or_page_bound(self):
		for key, value in (
			("ignore_permissions", True),
			("limit_page_length", 100_000),
			("fields", ["sleep(10)"]),
		):
			manifest, bindings, _ = fixture()
			cases = bindings["scenarios"]["seller_deals_queue"]
			cases[0][0]["params"][key] = value
			manifest["scenarios"]["seller_deals_queue"]["cases_digest"] = checksum(cases)
			with self.assertRaises(ContractError):
				validate_bindings(bindings, manifest)
		manifest, bindings, _ = fixture()
		bindings["scenarios"]["seller_deal_detail"][0][0]["checks"] = []
		with self.assertRaises(ContractError):
			validate_bindings(bindings, manifest)
		manifest, bindings, _ = fixture()
		bindings["actors"]["counter"]["user"] = bindings["actors"]["seller"]["user"]
		with self.assertRaisesRegex(ContractError, "duplicate_actor"):
			validate_bindings(bindings, manifest)

	def test_failures_are_kept_in_percentiles_and_block_http_pass(self):
		manifest, _, _ = fixture()
		rows, complete = observations(manifest)
		failed = [r for r in rows if r.get("scenario") == "seller_deal_detail" and r["phase"] == "warm"][-6:]
		for row in failed:
			row.update(ok=False, elapsed_ms=30_000)
			row["steps"][0].update(status=0, error="timeout", matched=False, elapsed_ms=29_999)
		complete["http_errors"] = True
		result = summarize(manifest, rows, complete)
		self.assertEqual(result["scenarios"]["seller_deal_detail"]["failed"], 6)
		self.assertEqual(result["scenarios"]["seller_deal_detail"]["p95_ms"], 30_000)
		self.assertEqual(result["scenarios"]["seller_deal_detail"]["max_ms"], 30_000)
		self.assertFalse(result["http_pass"])

	def test_missing_duplicate_samples_wrong_actor_or_false_coverage_never_pass(self):
		manifest, _, _ = fixture()
		for mutation in ("missing", "duplicate", "actor", "rotation", "sql", "raw_sql", "mixed_run"):
			rows, completion = observations(manifest)
			if mutation == "missing":
				rows.pop()
			elif mutation == "duplicate":
				rows.append(rows[-1])
			elif mutation == "actor":
				rows[0]["matched"] = False
			elif mutation == "rotation":
				rows[-1]["case_index"] = 0
			elif mutation == "sql":
				completion["sql_coverage"] = True
			elif mutation == "mixed_run":
				rows[-1]["manifest_digest"] = "0" * 64
			else:
				rows[-1]["sql"] = "SELECT 'private-token'"
			with self.subTest(mutation=mutation), self.assertRaises(ContractError):
				summarize(manifest, rows, completion)

	def test_even_complete_fast_http_evidence_is_not_perf_acceptance(self):
		manifest, _, _ = fixture()
		rows, completion = observations(manifest)
		result = summarize(manifest, rows, completion)
		self.assertTrue(result["http_pass"])
		self.assertFalse(result["perf_01_ready"])
		self.assertIn("browser_action_to_ready", result["missing_evidence"])
		self.assertNotIn("@example.invalid", json.dumps(result))


if __name__ == "__main__":
	unittest.main()
