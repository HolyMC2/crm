# Isolated CRM performance baseline

This directory supplies a runnable **HTTP diagnostic client**, an evidence validator and a local native SQL probe. The separate native seeder below creates a guarded disposable fixture. Neither tool deploys assets, replaces permissions, starts workers or certifies PERF-01. No application hook/endpoint is installed. Missing configuration fails; there is no demo-data or mock-success mode.

The source inventory and approved cohort are in the private roadmap receipt `performance-inventory.md`. Execution is pending a healthy native baseline, a controller-valid isolated seed and served browser topology. Use the existing Muelle source-locked native harness for those prerequisites; never point this client at a lab mirror or production tenant. Local execution through `heavy --` is required for a real benchmark. Do not queue when both slots are busy.

## Executable schema and private bindings

`contract.py` is the versioned, closed-key schema. Unknown keys, changed fixture checksums, incomplete roles/journeys, undersized datasets and non-loopback origins fail. All digest values are lowercase SHA-256 of `contract.canonical(value)` unless explicitly stated otherwise. A source commit is a full 40-character SHA; `tree_digest` is SHA-256 of the reviewed source export, not Git's 40-character tree object. Keep the real source/export/patch evidence alongside the manifest.

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

`created_at` must be timezone-aware and no more than 1 hour old, with no future timestamp. The four environment booleans must be true. All sources/seed/scope/environment references must match the manifest. The manifest binds the full attestation checksum. This is a local provenance contract, not a cryptographic signature or a substitute for inspecting the actual server. No attestation generator is provided because fixture/topology integration is not yet complete. Hand-authoring `true` values without the native evidence is invalid acceptance practice.

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


## Controller-valid native seed

`seed_native.py` is a separate **mutating setup command**, executed with the pinned bench Python. It is not an HTTP endpoint, a test-runner fixture or part of the read-only RPC allowlist. `seed_plan.py` defines the finite, deterministic dataset. Native execution is pending the existing native baseline and a separately provisioned performance site; the pure tests are not native acceptance.

Use two empty sites: one for the controller preflight, then another for the full dataset. The seeder refuses existing Deals, Leads, activities, ROs, conversations, intents, Customers, Companies, Contacts or nonstandard Users on its first run. Installed metadata, native ERP roots and settings must already exist. It creates real leaf Customer Group/Territory records under the canonical native roots, two Companies in MXN, Customers/Contacts, two labs/shops, a device, six stages, three pipelines, twelve sellers, two hierarchy managers, a broad manager and a repair counter. The counter has the existing Sales User and Doco Repair Counter roles; no administrator business writes or emergency role escalation.

The pipeline/company User Permissions are native records. Sellers form two native hierarchy branches. The third pipeline has a distinct native role restriction. The counter's Social Shop membership deliberately exposes the branch's shared queue, including unassigned Deals. The broad manager is outside the hierarchy and has both company scopes. `expected_visible()` expresses these independent fixture expectations; verification compares every permissioned native page against them, including an explicit denied parent for restricted roles. Field-mask and provider-account scenarios remain explicit gaps, not implied by this initial seed.

Preflight: 96 Deals covering every actor and stage, 24 tasks, 12 comments, 6 notes, 6 calls and 6 ROs, one intake/replay for each seeded stage. Manual pipeline probability preserves each explicit Deal value, including terminal stages; monetary metrics still apply their canonical Won/Lost outcome rules. Full: exactly 10,000 Deals, 25,000 tasks, 15,000 comments, 5,000 notes, 5,000 manual call logs and 500 ROs. Full activity placement preserves one 5,000-activity hot Deal per benchmark role, exact 50/500 histories and a deterministic ordinary distribution. Each hot history contains all four activity types. Undated/past/future tasks and native Done status are declared inputs; creation timestamps are never forged.

Deals are inserted Open, then native-saved to their declared outcome. This preserves real transition logs and Won dates. Only after Deals and repairs exist is the historical stage archived through the Pipeline controller. Tasks preserve native assignment and next-action hooks. Comments use `crm.api.comment.add_comment`; calls are native manual log records using fictional reserved numbers, not telephony requests. Repairs use `create_and_link_repair_order`, repeat the same command, resolve it through `resolve_deal_repair_request`, and verify the native Deal child link. The UUID v4 is persisted before the first command. No PIN, pattern, payment or customer send is populated.

### Provisioner receipt and actual settings

Create a mode-0600 private receipt from inspected disposable topology, not a copied example of successful flags. Its exact keys are:

```text
version: 1
site: crm-perf-<12 lowercase hex>.localhost
created_at: timezone-aware ISO timestamp, age 0..3600 seconds at start
anchor_date: ISO date anchoring immutable fixture dates across resume
database: {name: crm_perf_<same hex>, host: crm-perf-<same hex>-db, port: 3306}
redis: {redis_cache, redis_queue, redis_socketio}
image: sha256:<64 hex>
sources: app -> {commit: <40 hex>, root: <absolute exported repo>, files: {relative path: sha256}}
network_internal: true
workers_disabled: true
scheduler_disabled: true
outbound_disabled: true
topology_digest: <SHA-256 of retained inspected Compose/network/process evidence>
```

All three Redis URLs must use `redis://crm-perf-<same hex>-redis:6379` with an optional database 0, 1 or 2, no credentials/query/fragment. Provision these exact internal network aliases. Neither a public DNS name nor a production/lab database name is accepted. Merged common/site config must match the receipt before importing or connecting Frappe; it must have boolean `mute_emails=true`, `pause_scheduler=true`, no developer mode and no enabled Server Scripts. The active SQL database is checked again after connecting, and a zero-wait MariaDB advisory lease serializes all seed writers for that site. The command never discovers or changes a running deployment.

Every installed app must have an inspected source export in `sources`. Required owners include Frappe, ERPNext, CRM, Doco, Taller, Marketing, Meta Catalog, WhatsApp, POS, MercadoPago and Scanner Kit. `files` must contain **all** `.py` and `.json` files under each exported repo, excluding `.git`, `node_modules`, `__pycache__`, `.venv` and `env`; include scripts, hooks and schema. Unknown/missing/changed files fail. Paths must match the actual imported native app roots. This local receipt ties execution to the reviewed export; it is not a cryptographic signature or proof that a manually supplied commit string is genuine. Keep export provenance and topology evidence alongside it.

Before execution, use the owning settings documents' normal save paths on the empty site to establish:

- FCRM currency MXN, sales hierarchy enabled, automatic expected-value updates disabled, conversation automation disabled.
- ERPNext CRM Settings disabled; no implicit Customer synchronization from Deal transitions.
- The exact Taller and Marketing delivery/routing flags listed in `DISABLED` are off. Missing fields fail instead of silently skipping a guard.
- Doco Tenant Settings printing disabled; no enabled Printer Route, published Bot Workflow, active CRM Campaign, enabled Notification/Webhook/SLA, enabled Assignment Rule or Server Script.
- No Email Queue, Integration Request, CRM Outbound Intent, Doco Print Job or Asistente Agent Run. An unexpected effect ledger stops setup.

The seeder verifies these actual settings before writes and before each commit; it does not silently rewrite them. It also checks the real Redis worker registry is empty. Scheduler/process absence and internal-only network isolation still need the external topology evidence; an empty RQ registry alone cannot prove either. Native hooks and before/after-commit callbacks remain active. Real queue producers enqueue into isolated Redis, but no worker consumes them. User creation's native contact job is one such retained callback. Do not enable workers later and mistake this seed for a safe delivery workload.

### Execution, recovery and native postconditions

On the owned bench container only, using the image's Python and site directory (wrap the containing local command in `heavy --`):

```sh
env/bin/python apps/crm/scripts/performance/seed_native.py \
  --provision /private/perf/preflight-provision.json \
  --sites /home/frappe/frappe-bench/sites \
  --output /private/perf/preflight --scale preflight
```

The output directory must already exist with mode 0700. First retain and review the successful **actual** `native-postconditions.json`. Then provision a distinct empty site using the same source exports; pass `--scale full --preflight /private/perf/preflight/native-postconditions.json`. A missing, partial, different-source or same-site preflight is refused. Do not run full setup until the native baseline and small preflight pass and capacity is available. No large setup has been executed for this checkpoint.

The private `native-seed.json` journal binds site, database, source files, image, anchor date and scale. Native writes commit in batches of at most 100 documents; each repair command commits before the next UUID is persisted. The journal is atomically replaced and fsynced with mode 0600. Resume keeps that file, source, fixture anchor and database and supplies fresh inspected topology evidence. An abandoned `.new` file is an explicit recovery stop; inspect it rather than silently adopting it. Do not delete or reset the journal to bypass a refusal.

A crash after SQL commit but before journal persistence is reconciled by exact native fixture identity and complete declared-field checks. Zero matches permits a new normal insert; one exact match is adopted; duplicate, altered or missing previously recorded rows fail. No bulk insert, direct database setter, permission bypass, forced naming, private write token, validator suppression or deletion is used by the seed. Owning controllers retain their own established internal mechanisms.

Native postconditions check total and per-parent activity distributions, actual assignment/status histories, MXN conversion, Won dates, archived membership, exact repair replay and child links, exact native actor page membership without duplicates, and denied-parent checks. Generated Versions/status logs/ToDos are counted separately. The private result contains counts/digests and always `perf_01_ready=false`; Webchat, account/field-mask fixtures, HTTP bindings, remote SQL and browser measurement remain required. Failures retain a private fixed-code/class/phase/fixture-alias receipt without raw SQL or exception bodies. Exit 0 means those native seed postconditions passed, not performance acceptance; exit 1 means a native controller failure; exit 2 means a guard/configuration/postcondition refusal.
