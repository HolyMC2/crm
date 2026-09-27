"""Closed, versioned contract for an isolated CRM HTTP baseline. No Frappe import."""

import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


class ContractError(ValueError):
	"""Messages contain fixed codes only, never configuration/response values."""


def require(condition, code):
	if not condition:
		raise ContractError(code)


def keys(value, expected):
	require(isinstance(value, dict) and set(value) == set(expected.split()), "invalid_keys")


def ident(value):
	require(isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,47}", value), "invalid_alias")
	return value


def digest(value):
	require(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value), "invalid_digest")
	return value


def canonical(value):
	return json.dumps(
		value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
	).encode()


def checksum(value):
	return hashlib.sha256(canonical(value)).hexdigest()


def read_json(path):
	p = Path(path)
	require(p.is_file() and not p.is_symlink() and p.stat().st_size <= 4_000_000, "invalid_input_file")

	def unique(pairs):
		result = {}
		for key, value in pairs:
			require(key not in result, "duplicate_json_key")
			result[key] = value
		return result

	try:
		return json.loads(
			p.read_text(),
			object_pairs_hook=unique,
			parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
		)
	except (UnicodeError, ValueError, OSError):
		raise ContractError("invalid_json") from None


def positive(value):
	return type(value) in (int, float) and math.isfinite(value) and value > 0


def nonnegative(value):
	return type(value) in (int, float) and math.isfinite(value) and value >= 0


# Ordered bundles model actual UI read request chains. New routes require source
# review here; bindings cannot supply a URL/method or invoke a creation endpoint.
BUNDLES = {
	"deals_queue": ("frappe.client.get_list", "crm.api.doc.aggregate_deal_metrics"),
	"deal_detail": ("frappe.client.get", "crm.api.activities.get_activities"),
	"conversation_queue": ("crm.api.conversation_threads.list_threads",),
	"conversation_detail": ("crm.api.conversation_threads.get_history", "crm.api.outbox.list_intents"),
	"workload_queue": ("crm.api.workload.get_workload",),
	"workload_detail": ("crm.api.workload.get_work_items",),
	"report_queue": ("crm.api.sales_reports.get_report",),
	"report_detail": ("crm.api.sales_reports.get_records",),
	"repair_queue": ("taller.repair.repair_orders.get_deal_repair_context",),
	"repair_detail": ("taller.api.orders.detail.get",),
}
PARAMS = {
	"frappe.client.get_list": {
		"doctype",
		"fields",
		"filters",
		"or_filters",
		"order_by",
		"limit_start",
		"limit_page_length",
	},
	"crm.api.doc.aggregate_deal_metrics": {"filters", "or_filters"},
	"frappe.client.get": {"doctype", "name"},
	"crm.api.activities.get_activities": {"name", "doctype"},
	"crm.api.conversation_threads.list_threads": {"provider", "account_id", "cursor", "limit"},
	"crm.api.conversation_threads.get_history": {"conversation", "cursor", "limit"},
	"crm.api.outbox.list_intents": {"conversation", "before", "limit"},
	"crm.api.workload.get_workload": {"filters", "offset"},
	"crm.api.workload.get_work_items": {"filters", "kind", "owner", "overdue", "offset"},
	"crm.api.sales_reports.get_report": {"filters"},
	"crm.api.sales_reports.get_records": {"filters", "kind", "bucket", "offset"},
	"taller.repair.repair_orders.get_deal_repair_context": {"deal_name"},
	"taller.api.orders.detail.get": {"name"},
}
QUEUE_FIELDS = set(
	"name deal_name organization lead_name mobile_no email status pipeline source deal_owner deal_value currency modified creation expected_deal_value expected_closure_date probability next_activity_task next_activity_at next_activity_title next_activity_type _user_tags".split()
)
PROFILE_PAIRS = {
	"seller": {"deals", "deal", "conversation"},
	"hierarchy_manager": {"deals", "deal", "workload", "report"},
	"broad_manager": {"deals", "deal", "report"},
	"counter": {"deals", "deal", "repair"},
}


def validate_manifest(doc):
	keys(doc, "version run_id environment sources seed roles scenarios")
	require(doc["version"] == 1, "unsupported_version")
	ident(doc["run_id"])
	env = doc["environment"]
	keys(
		env,
		"site base_url hardware_digest network_digest image attestation_digest concurrency timeout_seconds max_seconds warmups samples",
	)
	require(re.fullmatch(r"crm-perf-[a-f0-9]{12}\.localhost", env["site"] or ""), "not_disposable_site")
	u = urlsplit(env["base_url"])
	require(
		u.scheme == "http"
		and u.hostname in ("127.0.0.1", "::1")
		and u.port
		and not u.username
		and not u.password
		and u.path in ("", "/")
		and not u.query
		and not u.fragment,
		"not_loopback_origin",
	)
	for field in ("hardware_digest", "network_digest", "attestation_digest"):
		digest(env[field])
	require(
		re.fullmatch(r"ghcr\.io/holymc2/doco-bench@sha256:[a-f0-9]{64}", env["image"] or ""), "unlocked_image"
	)
	require(env["concurrency"] == 1 and env["warmups"] == 5 and env["samples"] == 100, "invalid_sample_plan")
	require(positive(env["timeout_seconds"]) and env["timeout_seconds"] <= 30, "invalid_timeout")
	require(type(env["max_seconds"]) is int and 1 <= env["max_seconds"] <= 3600, "invalid_run_budget")
	sources = doc["sources"]
	require(isinstance(sources, dict) and {"crm", "frappe", "muelle"} <= set(sources), "incomplete_sources")
	for app, source in sources.items():
		ident(app)
		keys(source, "commit tree_digest")
		require(re.fullmatch(r"[a-f0-9]{40}", source["commit"] or ""), "unlocked_source")
		digest(source["tree_digest"])
	seed = doc["seed"]
	keys(
		seed,
		"deals activities conversations messages intents repair_orders manifest_digest scope_digest controller_valid hot_history",
	)
	for key in ("deals", "activities", "conversations", "messages", "intents", "repair_orders"):
		require(type(seed[key]) is int and seed[key] >= 0, "invalid_seed_count")
	require(seed["deals"] >= 10_000 and seed["activities"] >= 50_000, "insufficient_dataset")
	require(seed["controller_valid"] is True and seed["hot_history"] >= 5000, "invalid_seed_provenance")
	digest(seed["manifest_digest"])
	digest(seed["scope_digest"])
	roles = doc["roles"]
	require(isinstance(roles, dict) and bool(roles), "missing_roles")
	for alias, role in roles.items():
		ident(alias)
		keys(role, "profile scope_digest")
		require(role["profile"] in PROFILE_PAIRS, "invalid_profile")
		digest(role["scope_digest"])
	require({r["profile"] for r in roles.values()} == set(PROFILE_PAIRS), "incomplete_roles")
	scenarios = doc["scenarios"]
	require(isinstance(scenarios, dict) and 1 <= len(scenarios) <= 64, "invalid_scenarios")
	for alias, scenario in scenarios.items():
		ident(alias)
		keys(scenario, "role bundle cohort case_count cases_digest")
		require(scenario["role"] in roles and scenario["bundle"] in BUNDLES, "invalid_scenario")
		require(scenario["cohort"] in ("ordinary", "hot_history"), "invalid_cohort")
		require(
			type(scenario["case_count"]) is int
			and (1 if scenario["cohort"] == "hot_history" else 10) <= scenario["case_count"] <= 100,
			"invalid_case_count",
		)
		digest(scenario["cases_digest"])
	for alias, role in roles.items():
		bundles = {
			s["bundle"] for s in scenarios.values() if s["role"] == alias and s["cohort"] == "ordinary"
		}
		required = {"deals_queue", "deal_detail"}
		for prefix in PROFILE_PAIRS[role["profile"]] - {"deals", "deal"}:
			required.update({prefix + "_queue", prefix + "_detail"})
		require(required <= bundles, "incomplete_role_journeys")
		require(
			any(
				s["role"] == alias and s["bundle"] == "deal_detail" and s["cohort"] == "hot_history"
				for s in scenarios.values()
			),
			"missing_hot_history",
		)
	require(
		seed["conversations"] >= 1000
		and seed["messages"] >= 20_000
		and seed["intents"] >= 2000
		and seed["repair_orders"] >= 500,
		"insufficient_channel_dataset",
	)
	require(
		{
			"taller",
			"doco",
			"erpnext",
			"frappe_whatsapp",
			"doco_meta_catalog",
			"doco_marketing",
			"posawesome",
			"mercadopago_connector",
		}
		<= set(sources),
		"missing_integration_sources",
	)
	return doc


def validate_attestation(doc, manifest, now=None):
	keys(
		doc,
		"site base_url created_at disposable outbound_disabled scheduler_disabled workers_disabled sources_digest seed_manifest_digest scope_digest hardware_digest network_digest image",
	)
	env = manifest["environment"]
	require(checksum(doc) == env["attestation_digest"], "attestation_changed")
	require(
		doc["site"] == env["site"]
		and all(
			doc[k] is True
			for k in ("disposable", "outbound_disabled", "scheduler_disabled", "workers_disabled")
		),
		"unsafe_environment",
	)
	try:
		created = datetime.fromisoformat(doc["created_at"])
		require(created.tzinfo is not None, "invalid_attestation_time")
		age = ((now or datetime.now(timezone.utc)) - created).total_seconds()
	except (ValueError, TypeError):
		raise ContractError("invalid_attestation_time") from None
	require(0 <= age <= 3600, "stale_attestation")
	require(doc["sources_digest"] == checksum(manifest["sources"]), "source_mismatch")
	for key in ("scope_digest", "manifest_digest"):
		field = "seed_manifest_digest" if key == "manifest_digest" else key
		require(doc[field] == manifest["seed"][key], "seed_mismatch")
	for key in ("base_url", "hardware_digest", "network_digest", "image"):
		require(doc[key] == env[key], "environment_mismatch")


def validate_bindings(doc, manifest):
	keys(doc, "actors scenarios")
	require(
		set(doc["actors"]) == set(manifest["roles"]) and set(doc["scenarios"]) == set(manifest["scenarios"]),
		"incomplete_bindings",
	)
	for actor in doc["actors"].values():
		keys(actor, "user session_env csrf_env")
		require(
			isinstance(actor["user"], str)
			and 0 < len(actor["user"]) <= 140
			and actor["user"] not in ("Guest", "Administrator"),
			"invalid_actor",
		)
		for key in ("session_env", "csrf_env"):
			require(
				re.fullmatch(r"CRM_PERF_[A-Z0-9_]{1,64}", actor[key] or ""), "invalid_credential_reference"
			)
	for field in ("user", "session_env"):
		require(
			len({actor[field] for actor in doc["actors"].values()}) == len(doc["actors"]), "duplicate_actor"
		)
	for alias, cases in doc["scenarios"].items():
		scenario = manifest["scenarios"][alias]
		require(isinstance(cases, list) and len(cases) == scenario["case_count"], "invalid_cases")
		require(checksum(cases) == scenario["cases_digest"], "cases_changed")
		for case in cases:
			require(
				isinstance(case, list) and len(case) == len(BUNDLES[scenario["bundle"]]), "incomplete_bundle"
			)
			for method, request in zip(BUNDLES[scenario["bundle"]], case, strict=True):
				keys(request, "params checks")
				params = request["params"]
				require(
					isinstance(params, dict)
					and set(params) <= PARAMS[method]
					and len(canonical(params)) <= 32_000,
					"invalid_rpc_parameters",
				)
				if method.startswith("frappe.client.") or method == "crm.api.activities.get_activities":
					require(params.get("doctype") == "CRM Deal", "invalid_doctype")
				if method == "frappe.client.get_list":
					require(
						isinstance(params.get("fields"), list)
						and bool(params["fields"])
						and set(params["fields"]) <= QUEUE_FIELDS,
						"invalid_queue_fields",
					)
				for key, maximum in (
					("limit", 100 if method == "crm.api.outbox.list_intents" else 50),
					("limit_page_length", 200),
				):
					if key in params:
						require(type(params[key]) is int and 1 <= params[key] <= maximum, "invalid_page_size")
				checks = request["checks"]
				require(isinstance(checks, list) and 1 <= len(checks) <= 20, "missing_response_checks")
				for check in checks:
					keys(check, "path digest")
					require(
						isinstance(check["path"], list)
						and 0 < len(check["path"]) <= 12
						and check["path"][0] == "message",
						"invalid_response_path",
					)
					require(
						all(
							(type(p) is int and 0 <= p < 10_000)
							or (isinstance(p, str) and re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]{0,63}", p))
							for p in check["path"]
						),
						"invalid_response_path",
					)
					digest(check["digest"])
	return doc


def matches(body, checks):
	try:
		for check in checks:
			value = body
			for part in check["path"]:
				value = value[part]
			if checksum(value) != check["digest"]:
				return False
		return True
	except (KeyError, IndexError, TypeError, ValueError):
		return False
