"""Validate complete HTTP evidence. PERF-01 requires additional native/browser proof."""

import argparse
import json
import math
import sys
from pathlib import Path

from contract import (
	BUNDLES,
	ContractError,
	canonical,
	checksum,
	keys,
	nonnegative,
	read_json,
	require,
	validate_manifest,
)

ERRORS = {
	None,
	"response_limit",
	"application_error",
	"http_error",
	"timeout",
	"transport_error",
	"invalid_response",
}


def nearest_rank(values, percentile=95):
	require(
		bool(values) and 0 < percentile <= 100 and all(nonnegative(v) for v in values),
		"invalid_observations",
	)
	ordered = sorted(values)
	return ordered[max(0, math.ceil(len(ordered) * percentile / 100) - 1)]


def result_shape(step):
	keys(step, "status elapsed_ms bytes error matched")
	require(type(step["status"]) is int and 0 <= step["status"] <= 599, "invalid_http_status")
	require(type(step["bytes"]) is int and 0 <= step["bytes"] <= 8_000_001, "invalid_byte_count")
	require(nonnegative(step["elapsed_ms"]), "invalid_timing")
	require(step["error"] in ERRORS and type(step["matched"]) is bool, "invalid_outcome")
	if step["matched"]:
		require(200 <= step["status"] < 300 and step["error"] is None, "false_success")


def summarize(manifest, rows, completion):
	validate_manifest(manifest)
	keys(completion, "manifest_digest complete http_errors sql_coverage browser_coverage")
	require(
		completion["manifest_digest"] == checksum(manifest) and completion["complete"] is True,
		"incomplete_execution",
	)
	# There is currently no HTTP server recorder or browser-ready bridge. It is
	# invalid to claim that a direct-call SQL probe observed these HTTP requests.
	require(
		completion["sql_coverage"] is False and completion["browser_coverage"] is False,
		"unsupported_coverage_claim",
	)
	auth, samples = {}, {}
	for row in rows:
		require(isinstance(row, dict), "invalid_evidence")
		require(row.get("manifest_digest") == checksum(manifest), "mixed_run_evidence")
		if row.get("kind") == "auth":
			keys(row, "manifest_digest kind role status elapsed_ms bytes error matched")
			require(row["role"] in manifest["roles"] and row["role"] not in auth, "invalid_auth_sample")
			result_shape(
				{key: value for key, value in row.items() if key not in {"manifest_digest", "kind", "role"}}
			)
			auth[row["role"]] = row["matched"]
		else:
			keys(row, "manifest_digest kind scenario phase index case_index elapsed_ms ok steps")
			require(row["kind"] == "sample" and row["scenario"] in manifest["scenarios"], "invalid_sample")
			require(row["phase"] in {"warmup", "warm"} and type(row["index"]) is int, "invalid_sample_index")
			limit = 5 if row["phase"] == "warmup" else 100
			require(
				0 <= row["index"] < limit and type(row["case_index"]) is int and 0 <= row["case_index"] < 100,
				"invalid_sample_index",
			)
			key = (row["scenario"], row["phase"], row["index"])
			require(key not in samples, "duplicate_sample")
			samples[key] = row
			require(nonnegative(row["elapsed_ms"]), "invalid_timing")
			scenario = manifest["scenarios"][row["scenario"]]
			require(row["case_index"] == row["index"] % scenario["case_count"], "incorrect_case_rotation")
			require(
				isinstance(row["steps"], list) and len(row["steps"]) == len(BUNDLES[scenario["bundle"]]),
				"incomplete_rpc_bundle",
			)
			for step in row["steps"]:
				result_shape(step)
			require(
				row["elapsed_ms"] + 0.01 >= sum(s["elapsed_ms"] for s in row["steps"]),
				"inconsistent_bundle_timing",
			)
			require(
				type(row["ok"]) is bool and row["ok"] == all(s["matched"] for s in row["steps"]),
				"false_success",
			)
	require(set(auth) == set(manifest["roles"]), "missing_auth_evidence")
	require(all(auth.values()), "actor_authentication_failed")
	summary = {}
	for alias in manifest["scenarios"]:
		for phase, count in (("warmup", 5), ("warm", 100)):
			require(all((alias, phase, i) in samples for i in range(count)), "missing_samples")
		warm = [samples[alias, "warm", i] for i in range(100)]
		latencies = [row["elapsed_ms"] for row in warm]  # Failures are not filtered out.
		failed = sum(not row["ok"] for row in warm)
		summary[alias] = {
			"samples": 100,
			"failed": failed,
			"p50_ms": nearest_rank(latencies, 50),
			"p95_ms": nearest_rank(latencies),
			"max_ms": max(latencies),
		}
	actual_failed = any(not row["ok"] for row in samples.values())
	require(
		type(completion["http_errors"]) is bool and completion["http_errors"] == actual_failed,
		"incorrect_completion",
	)
	http_pass = not actual_failed and all(row["p95_ms"] <= 2000 for row in summary.values())
	return {
		"manifest_digest": checksum(manifest),
		"http_pass": http_pass,
		"perf_01_ready": False,
		"missing_evidence": [
			"remote_sql_query_counts_and_growth",
			"browser_action_to_ready",
			"cold_pwa_and_reconnect",
		],
		"scenarios": summary,
	}


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("evidence")
	args = parser.parse_args()
	try:
		root = Path(args.evidence)
		file = root / "samples.ndjson"
		require(
			file.is_file() and not file.is_symlink() and file.stat().st_size <= 50_000_000,
			"invalid_evidence_file",
		)
		rows = [json.loads(line) for line in file.read_text().splitlines()]
		result = summarize(read_json(root / "manifest.json"), rows, read_json(root / "completion.json"))
		print(canonical(result).decode())
		return 2  # Partial HTTP evidence can never return a release acceptance exit.
	except (ContractError, ValueError, TypeError, KeyError, OSError):
		print("NOT_READY: incomplete or invalid performance evidence", file=sys.stderr)
		return 1


if __name__ == "__main__":
	raise SystemExit(main())
