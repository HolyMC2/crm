# Isolated CRM performance baseline

This directory supplies a runnable **HTTP diagnostic client**, an evidence validator and a local native SQL probe. It does not seed a site, deploy assets, replace permissions, start workers or certify PERF-01. No application hook/endpoint is installed. Missing configuration fails; there is no demo-data or mock-success mode.

The source inventory and approved cohort are in the private roadmap receipt `performance-inventory.md`. Execution is pending a healthy native baseline, a controller-valid isolated seed and served browser topology. Use the existing Muelle source-locked native harness for those prerequisites; never point this client at a lab mirror or production tenant. Local execution through `heavy --` is required for a real benchmark. Do not queue when both slots are busy.

## Executable schema and private bindings

`contract.py` is the versioned, closed-key schema. Unknown keys, changed fixture checksums, incomplete roles/journeys, undersized datasets and non-loopback origins fail. All digest values are lowercase SHA-256 of `contract.canonical(value)` unless explicitly stated otherwise. A source commit is a full 40-character SHA; `tree_digest` is SHA-256 of the reviewed source export, not Git's40-character tree object. Keep the real source/export/patch evidence alongside the manifest.

The private manifest has these exact top-level keys:

| Key | Required content |
|---|---|
| `version`, `run_id` | Version 1 and an opaque lowercase alias |
| `environment` | `site`, `base_url`, `hardware_digest`, `network_digest`, immutable `image`, `attestation_digest`, `concurrency`, `timeout_seconds`, `max_seconds`, `warmups`, `samples` |
| `sources` | App alias → `{commit, tree_digest}`; CRM, Frappe, Muelle, ERPNext and all eight candidate apps are mandatory for this full-graph cohort. Other pinned base sources may be included |
| `seed` | `deals`, `activities`, `conversations`, `messages`, `intents`, `repair_orders`, `manifest_digest`, `scope_digest`, `controller_valid`, `hot_history` |
| `roles` | Actor alias → `{profile, scope_digest}` |
| `scenarios` | Scenario alias → `{role, bundle, cohort, case_count, cases_digest}` |

The environment accepts only `http://127.0.0.1:<port>` or `http://[::1]:<port>` with no path/query/credentials, and an independently provisioned `crm-perf-<12hex>.localhost` site. The Host header selects that site. Proxy environment settings and redirects are disabled. The isolated server/forward must already exist; the client never opens a tunnel. CPU/RAM limits, database settings, worker count, competing load, browser/network placement and network shaping belong in the hashed hardware/network declarations. `concurrency=1`, `warmups=5`, `samples=100`; socket timeout≤30 seconds, total run budget≤3600 seconds. Budget exhaustion retains partial rows and produces incomplete evidence, never reduced-sample success.

Minimum seed: 10,000 Deals, 50,000 explicit activities, 1,000 conversations, 20,000 messages, 2,000 intents, 500 ROs and a 5,000-activity hot history. The seed manifest records actual per-controller insert/save paths, distribution, automatically generated records separately, relationships and exact visibility/count expectations. `controller_valid=true` is an attestation requirement, not an instruction to bypass validators. This initial contract intentionally refuses a smaller/standalone imitation of the full-graph cohort; a separately reviewed standalone contract is still needed.

Four distinct authenticated users are required: `seller`, `hierarchy_manager`, `broad_manager`, `counter`. The `profile` takes those values; actor aliases may differ. Real grants/masks/hierarchy/company/pipeline/shop/lab/account scope are in the hashed scope evidence. Authentication proves that the provided session belongs to the declared user; it cannot itself prove those grants. The native preflight must do so. Administrator and Guest are refused.

Each actor needs ordinary `deals_queue` and `deal_detail`, plus a separate `deal_detail` `hot_history` scenario. Seller additionally needs `conversation_queue/detail`; hierarchy manager needs `workload_queue/detail` and `report_queue/detail`; broad manager needs `report_queue/detail`; counter needs `repair_queue/detail`. `BUNDLES` lists exact ordered read-only RPCs. There are no request-controlled methods/URLs. `open_thread`, intake create/replay and all send/payment/control methods are excluded because they are mutations. Their performance needs a separately scoped write protocol.

`bindings.json` is private and is **not copied into evidence**:

```text
actors[actor_alias] = {user, session_env, csrf_env}
scenarios[scenario_alias] = [case, ...]
case = [request, ...]  # same order and length as BUNDLES[bundle]
request = {params, checks}
check = {path, digest}
```

Credential references must be names such as `CRM_PERF_SELLER_SID` and `CRM_PERF_SELLER_CSRF`; their values come from task-owned native sessions in the process environment, never CLI arguments/files/logs. Session environment references and user identities must be distinct across actors. No password/login provisioning is implemented.

Parameters are restricted per RPC. Generic Frappe reads are restricted to CRM Deal; queue fields have a closed literal allowlist; page sizes are bounded at actual thread 50/outbox 100/native list 200 limits. Ordinary scenarios require 10–100 cases, hot histories 1–100. `case_count` and SHA-256 of the exact cases bind fixture selection; the runner rotates `index % case_count` independently for warm-up and measured samples. The validator verifies that rotation.

Response checks start at `message` and follow literal dictionary keys or list indexes, e.g. `['message',0,'name']`. Their digests must be produced from the seed's independently checked expected identity/order/count/scope projection, **not learned from an unverified baseline response**. Supply checks covering page membership, aggregate counts, monetary/source definitions and protected-field absence as applicable. Checking only an arbitrary always-present value is insufficient evidence. Missing fields, error objects, denied calls or mismatched checks fail the sample. The runner retains only the boolean outcome, not returned business data or checks themselves. Keep source/seed/cases evidence private for reproducibility and review.

## Required native attestation

The provisioning owner must create `attestation.json` after inspecting the actual disposable site, running valid fixtures and verifying source/controller/network state. It has exact keys:

```text
site, base_url, created_at, disposable, outbound_disabled,
scheduler_disabled, workers_disabled, sources_digest,
seed_manifest_digest, scope_digest, hardware_digest, network_digest, image
```

`created_at` must be timezone-aware and no more than1 hour old, with no future timestamp. The four environment booleans must be true. All sources/seed/scope/environment references must match the manifest. The manifest binds the full attestation checksum. This is a local provenance contract, not a cryptographic signature or a substitute for inspecting the actual server. No attestation generator is provided because fixture/topology integration is not yet complete. Hand-authoring `true` values without the native evidence is invalid acceptance practice.

No queue consumer/scheduler runs in the read-focused project: real queue callbacks may enqueue in real Redis, but no provider dispatch is consumed. That topology must be recorded and never presented as dispatch-throughput evidence. The project has no external credentials or customer data, muted email and internal-only network. Actual native source probes and outbound-audit evidence remain prerequisite artifacts.

## Commands and evidence

Once those real inputs exist:

```sh
heavy -- python3 scripts/performance/run.py \
  --manifest /private/run/manifest.json \
  --bindings /private/run/bindings.json \
  --attestation /private/run/attestation.json \
  --output /private/run/http-evidence
python3 scripts/performance/validate.py /private/run/http-evidence
```

The output directory must not exist; its parent must exist. Creation uses mode 0700. `manifest.json`, flushed `samples.ndjson` and `completion.json` contain only aliases, source/data checksums, result codes, bytes, durations and boolean checks. Bindings, cookies, CSRF values, raw SQL, parameters, bodies, exception messages and customer identifiers are not exported. HTTP/authentication status and fixed error categories are retained. Each actor is authenticated using the real `frappe.auth.get_logged_user` endpoint before its scenarios; a wrong actor remains failed auth evidence and cannot accumulate successful samples.

`run.py` exits 0 only for complete HTTP observations with every response check passing; this is not latency/browser/native acceptance. Exit 1 means collected failures; exit 2 means an input/environment/run-budget failure. `validate.py` rejects missing/duplicate/relabelled samples, altered manifests, incomplete bundles, false coverage and inconsistent outcomes. It includes failed request durations in nearest-rank p95/max, never drops timeouts. Complete HTTP evidence reports `http_pass` using p95≤2000 ms and zero failures. **The validator still exits 2 and sets `perf_01_ready=false`**, naming absent remote SQL and browser/cold/reconnect evidence. Invalid/incomplete evidence exits 1.

HTTP duration covers the sequential declared RPC bundle and body/check handling. It is a server/network diagnostic, not the actual parallel browser waterfall or visible-ready latency. Browser asset/auth setup, renderer-ready checks, cold PWA/reconnect, full query coverage and first/middle/last permissioned pagination parity are still required. Do not rename this output as complete worker performance.

## Local native SQL probe

`SQLProbe(database, key, manifest=..., attestation=..., current_site=frappe.local.site)` temporarily wraps that database instance's SQL execution only around `probe.call(real_callable, ...)`. It delegates every query and preserves its results/exceptions; restoration runs even on failure. Use a single-threaded owned bench command outside fixture test mode, with the same current attested disposable site and a task-local random HMAC key ≥32 bytes. Never install this on a production/global request path. The key is retained privately by the provisioning owner when comparing repeated-query shapes across runs.

`probe.evidence()` returns local query count/time/failure count and keyed normalized query-shape counts. It emits no SQL, bind values, result data or key. Shape normalization is a diagnostic heuristic; no claim of a full SQL parser. The probe's return value is the real callable result, so the caller must not print it or raw exception details into evidence. The ordinary framework Recorder may retain raw SQL; inspect the pinned recorder before choosing a sanitized disposable-server bridge. The HTTP runner explicitly records `sql_coverage=false`: this local probe **does not observe HTTP work**. A reviewed server-side recorder/correlation bridge and query-growth validator remain required future integration.

## Tests

```sh
python3 -m unittest discover -s scripts/performance -p 'test_*.py' -v
uvx --offline ruff check scripts/performance
```

Tests cover nearest-rank arithmetic, complete role/dataset/sample contracts, failures retained in p95, replayed/missing samples, rejected write RPCs, actual loopback HTTP auth/errors/redirects, actual runner output, and actual SQLite query delegation/restoration/redaction. Synthetic test manifests are explicitly unit fixtures. They do not prove native Frappe permissions, deployed topology, production SQL behavior, a real 10k/50k dataset or PERF-01 latency. Network-restricted sandboxes may need permission to bind the unit server to ephemeral 127.0.0.1; they must not silently skip it.
