# P2 Workplan — binding definitions (2026-07-26)

Executor model: parallel build agents on **disjoint, new-file-only** slices; the
lead (session) owns all shared-file mount points, integration, git, builds, and
prod. Nothing here ships without lead review + the full vitest suite green.

## Global rules (every agent, non-negotiable)

- **Write ONLY the files listed in your slice.** No edits to shared files
  (`api/inbox.py`, `composables/inbox.js`, `ConversationQueue.vue`,
  `DealHeader.vue`, `hooks.py`, …). Where a mount point is needed, write the
  exact patch snippet into your REPORT — the lead applies it.
- **No git commands. No docker/bench/restart/migrate. No prod access
  (ventas.docomexico.com / ventas.mumulenceria.com / ssh contavm are OFF
  LIMITS). No installs.** Lab reads via files only.
- Backend: frappe16. Whitelisted endpoints MUST perm-check
  (`doc.check_permission(...)` — `has_permission(throw=)` is gone) and guard
  doctype allowlists. No bare `frappe.db.get_value` on caller-supplied names
  (IDOR audit lesson). All customer-text rendering client-side must stay
  text-interpolated (no v-html).
- Frontend: Vue 3 script-setup, frappe-ui tokens ONLY (`ink-*`/`surface-*`/
  `outline-*` — every color dark-safe), es-MX strings through `__()`, mobile
  first (≤640px must not side-scroll; test at 360px reasoning), `.press` on
  tappable chips, no new deps.
- **Tests are part of the definition of done.** Vitest for any pure logic you
  add (put files in `frontend/tests/unit/`, run `npx vitest run` — must be
  green, 150 existing tests must stay green). Python logic gets a test module
  under `doco_marketing/doco_marketing/tests/` (IntegrationTestCase style,
  runnable via bench later — you write it, the lead runs it).
  KNOWN vitest-4 trap: never return rejected promises through a `vi.fn()` in a
  file that has mock hooks — use a plain behavior function (see
  `tests/unit/outbox.test.js` header).
- **Report** (mandatory, even on failure): write
  `/tmp/claude-1000/-home-holymc2/3be36e5d-b02f-4d69-a6db-130adcc46bcb/scratchpad/p2-<slice>.md`
  with: files created, mount-point patch snippets (exact old/new), test files +
  what they cover, open questions, anything you knowingly skipped.

## Slice S1 — Búsqueda global de mensajes (spec 2.6 + 2.7)

Backend (`doco_marketing`):
- NEW `doco_marketing/api/search.py`: `search_messages(query, limit=30)` —
  LIKE search over `WhatsApp Message.message` + `Messenger Message.content`
  (guard messenger via Marketing Settings like inbox does), joined to their
  reference Deal/Lead. **Permission scoping is the hard requirement**: resolve
  the set of readable deals/leads via `frappe.get_list` (which applies
  perm_query_conditions) and filter matches to it — never leak another
  org-scope's messages. Return rows: {reference_doctype, reference_name,
  contact_name, snippet (±60 chars around match, match term NOT html-marked —
  the client highlights), channel, ts, direction}. Order newest-first. Query
  <2 chars → []. Add index note in report if you find LIKE too slow (do NOT
  add DB indexes yourself).
- NEW `doco_marketing/doco_marketing/tests/test_search.py`: seeding a WA
  message + asserting match/scoping/short-query behavior.

Frontend (`crm/frontend`):
- NEW `src/components/doco/inbox/GlobalSearch.vue`: full-screen (mobile) /
  modal (desktop) search over messages; debounced input (300ms), result rows
  (avatar/initials, contact, snippet with the match `<b>`-highlighted VIA TEXT
  SPLITTING not v-html, timeAgo, channel dot); tapping a row must emit
  `open(reference_doctype, reference_name)` — the LEAD wires it to selectDeal.
- NEW `tests/unit/globalSearch.test.js`: snippet-highlight splitter + debounce
  logic (extract them into `src/utils/searchHighlight.js` so they're testable
  pure).
- Report the mount patch: a 🔍 button in the queue header area (exact snippet
  against current `ConversationQueue.vue` — read it, don't edit it).

## Slice S2 — Analítica por agente (spec 7.1)

Backend:
- NEW `doco_marketing/services/agent_metrics.py` + NEW
  `doco_marketing/api/agent_metrics.py`: `get_agent_metrics(period='month')`
  (`frappe.only_for(["System Manager", "Sales Manager"])`). Per deal_owner/
  lead_owner across the period: conversations touched (outbound msgs sent —
  WhatsApp Message by owner? WA messages carry no owner → use Comment/Deal
  attribution: count deals owned + deals won + won value + median first
  response over the owner's deals via the existing sla helpers if reusable;
  DOCUMENT what each number means in docstrings — no invented precision).
  Batched queries only (no per-agent N+1 loops over big tables — build from
  2-3 grouped queries).
- NEW `doco_marketing/doco_marketing/tests/test_agent_metrics.py`.

Frontend:
- NEW `src/components/doco/ReportsAgents.vue`: table (desktop) / stacked cards
  (mobile ≤640) — agent, abiertos, ganados, valor ganado, respuesta mediana;
  sortable by column (client-side). Manager-gate handled by backend 403 →
  render the same "solo gerentes" banner pattern Reports.vue uses (read it for
  the pattern; don't edit it).
- NEW `tests/unit/reportsAgents.test.js`: the sort + formatting helpers
  (extract to `src/utils/agentMetricsFormat.js`).
- Report the mount patch for `pages/Reports.vue` (new section/tab).

## Slice S3 — Resumen AI del hilo (spec 5.2)

Backend:
- NEW `doco_marketing/api/summary.py`: `thread_summary(doctype, name)` —
  allowlist CRM Deal/Lead, `check_permission("read")`, gate on
  `services.ai.is_enabled()` else `{available: false}`. Build context: last 30
  messages (both channels, chronological, redaction handled by ai.complete) +
  deal status/device. Prompt (es-MX): 3-4 frases — situación, qué espera el
  cliente, siguiente paso sugerido. **Cache**: `frappe.cache()` key
  `thread_summary:{doctype}:{name}:{n_messages}` TTL 6h — a new message
  changes n_messages → natural invalidation. Return {available, summary,
  cached, message_count}.
- NEW `doco_marketing/doco_marketing/tests/test_summary.py` (mock ai.complete;
  assert cache hit on same count, miss on changed count, gating).

Frontend:
- NEW `src/components/doco/inbox/ThreadSummary.vue`: collapsed chip "🧠
  Resumen" → expands to a card (loading → summary text, "actualizado hace X",
  refresh button forces `force=1` param — add it to the endpoint). Hide
  entirely when `{available: false}`.
- NEW `tests/unit/threadSummary.test.js` for any extracted pure logic
  (staleness label at minimum).
- Report mount patch for `DealWorkspace.vue` (chip next to the tab strip).

## Slice S4 — Detección de duplicados (spec 4.3, detection-only v1)

Backend:
- NEW `doco_marketing/services/dedupe.py`: `find_duplicates(doctype, name)` —
  normalize the record's phone (E.164-ish: strip non-digits, compare last 10;
  memory: WABA numbers may carry extra digits) and find other OPEN Leads/Deals
  sharing it (exclude self, exclude converted leads, cap 10). NEW
  `doco_marketing/api/dedupe.py` exposing it perm-checked (results themselves
  filtered through `frappe.get_list` scoping).
  **NO merge implementation** — v1 is detect + navigate. Merge is a later,
  human-gated slice.
- NEW `doco_marketing/doco_marketing/tests/test_dedupe.py`: phone-normalize
  matrix (52/521 prefixes, spaces, +) + scoping.
- Frontend: NEW `src/components/doco/inbox/DuplicateBanner.vue`: amber strip
  "⚠ posible duplicado: <name> (<status>)" with "Ver" button emitting
  `open(doctype, name)`; renders nothing when empty; fetch once per
  conversation change (prop-driven, no polling).
- NEW `tests/unit/dedupe.test.js` for the phone-normalize helper (extract to
  `src/utils/phoneNormalize.js` and have the backend logic mirror it —
  document the shared contract in both files).
- Report mount patch for `DealContextPanel.vue`.

## Deferred (NOT in this batch — needs gates or lead-owned files)

- IG DMs (Meta tokens), cadences 4.2 (send-path policy design first),
  won/lost flows 4.5 + post-call 4.4 (hot shared files), per-tenant branding
  8.2 (wide hex sweep = merge hazard), keyset pagination (lead-owned
  queue.py), merge execution for duplicates.

---

# Batch 2 (2026-07-26) — same global rules, four new slices

Lead-owned in this batch (NOT yours, whoever you are): `services/inbox/queue.py`
(keyset pagination), the brand-color sweep, all mount points, hooks.py, and
`composables/inbox.js`. Deliver hooks/mount changes as report patches.

## Slice S5 — Cadencias 1:1 (spec 4.2)

Follow-up sequences for ONE deal ("no contestó" → touch at day 1/3/7),
stop-on-reply. **Reuse the existing campaign machinery — building a second send
path is automatic rejection.** Recon `services/campaign_engine.py`,
`services/dispatch/`, `marketing/doctype/crm_campaign*`,
`whatsapp_send_review` first; put a ≤12-line design at the TOP of your report.

- `crm_campaign.json`: add `is_cadence` (Check, default 0, description es-MX) —
  bump the doctype `modified`. Cadence campaigns are hidden from the normal
  Campaigns surfaces later (lead's job), listed only via your API.
- NEW `services/cadence.py`: `enroll(deal, campaign)` (validate is_cadence,
  active enrollment dedupe), `stop(deal)` (cancel active cadence enrollments),
  `stop_on_reply(doc, method)` — WhatsApp/Messenger INBOUND after_insert
  handler that cancels active cadence enrollments for the reference (deliver
  the hooks.py patch in your report; do not edit hooks.py).
- NEW `api/cadence.py`: `list_cadences()`, `enrollment_status(deal)`,
  `enroll(deal, campaign)`, `stop(deal)` — perm-checked (write on the deal),
  doctype allowlists.
- NEW frontend `src/components/doco/inbox/CadencePicker.vue`: chip/dialog —
  current enrollment state ("Seguimiento activo: X · paso 2/3 · próx. mañana")
  or picker of cadences + start; stop button. Emits nothing outside itself;
  fetches by props (doctype, name). Mount patch (DealHeader area) in report.
- Tests: python (enroll/dedupe/stop/stop_on_reply cancels/perm gate; mock or
  flag any send-path side effects — remember the lab Meta incident: NEVER
  insert an Outgoing WhatsApp Message without mocking send_outgoing) + vitest
  for any pure helpers.

## Slice S6 — Score explicable (spec 5.4)

- Recon `crm_lead_score_log` + `lead_scoring_rule` + `services/scoring.py`.
- NEW `api/score_explain.py`: `get_score_breakdown(doctype, name)` — for a
  Lead (or a Deal via its linked lead): current score + grade + per-rule
  contributions from the score log (rule label, points, count, last hit),
  ordered by |points| desc, cap 15 rows. Perm-checked read; allowlist.
- NEW `src/components/doco/ScoreExplainPopover.vue`: prop-driven popover/sheet
  listing the breakdown ("por qué B·62"); loading/error/empty states.
- Tests both sides (breakdown math from seeded logs; deal→lead resolution;
  perm gate).
- Mount patches (LeadsView score cell + DealHeader grade chip) in report.

## Slice S7 — Post-llamada (spec 4.4)

- NEW `services/postcall.py`: `on_call_log(doc, method)` — CRM Call Log
  after_insert → `frappe.publish_realtime("doco_marketing:call_ended",
  {...call, deal/lead ref, duration}, user=<the agent on the call>)` (targeted,
  NOT broadcast; recon how the call log stores its agent). Deliver hooks patch
  in report. `log_outcome(call, outcome, note, create_task, task_due_epoch)` in
  NEW `api/postcall.py`: outcome enum (contesto/no_contesto/buzon/venta/otro),
  writes a Comment breadcrumb on the call's reference, optional CRM Task
  (due from epoch — TZ-proof like snooze), perm-checked.
- NEW `src/components/doco/inbox/PostCallSheet.vue`: bottom sheet (reuse the
  .sheet-in pattern) that a socket event opens: outcome chips + nota + "crear
  tarea para mañana 9:00" toggle + guardar/omitir. Socket wiring patch (which
  page mounts it + $socket.on) in report — do not edit shared pages.
- Tests: python (comment written, task created with tz-proof due, enum guard,
  perm) + vitest for pure helpers (tomorrow-9 epoch etc.).

## Slice S8 — Fusión de duplicados (spec 4.3b, human-gated)

You OWN `DuplicateBanner.vue` + `services/dedupe.py` + `api/dedupe.py` for
this slice (their original author closed out; extend, don't rewrite).

- SAME-DOCTYPE only (deal→deal, lead→lead). Cross-type merge is out of scope.
- NEW `services/merge.py`: `merge_conversation(source, target, doctype)`:
  repoint WhatsApp Message, Messenger Message, Comment, ToDo, Tag Link
  (dedupe/union tags via DocTags), FCRM Note if present — each repoint a
  BATCHED update, counts returned. Then close the source WITHOUT deleting:
  prefer a Junk-type status; if only Lost-type exists set
  lost_reason/«Duplicado» handling per the crm-deal-validation-traps memory
  (db.set_value bypasses validate — decide deliberately and DOCUMENT which
  path you took and why). Breadcrumb Comments on BOTH records. Return a
  summary dict {moved: {doctype: n}, source_closed_as}.
- `api/dedupe.py`: add `merge_duplicate(source, target, doctype)` —
  `frappe.only_for(["System Manager", "Sales Manager"])` PLUS write-perm on
  both records; allowlist; source≠target; both must share the normalized
  phone (server-side re-check — never trust the client pair).
- `DuplicateBanner.vue`: add «Fusionar…» (visible only when the backend says
  the caller may merge — return `can_merge` from find_duplicates) → confirm
  dialog stating exactly what will move and that the OTHER record closes →
  call → toast with the moved counts → emit `merged` (mount handler = lead).
- Tests: python is the heart of this slice — repoint counts per artifact
  type, tag union, breadcrumbs, closing-status fallback chain, manager gate,
  phone-mismatch rejection, source==target rejection. Mock any send hooks.

---

# Batch 3 (2026-07-26) — vertical loops + copiloto + management

Same global rules as above. NEW this batch: **NOBODY edits
`marketing_settings.json` or `hooks.py`** — every settings field and every hook
goes into your report as an exact patch; the lead applies all of them in one
pass (single `modified` bump). `services/push.py`, `composables/inbox.js`,
`WhatsAppBox.vue`, `DealWorkspace.vue`, `router.js` are lead-owned shared files
— mount patches only.

## Slice S9 — Repair status → WhatsApp auto-update (spec 6.1)

Taller state changes ("Listo para Entregar") → templated WA to the customer,
**always review-gated through MA-1** (a `WhatsApp Send Review` row, status
Pendiente, auto=0 — NEVER auto=1, never a direct send; spec non-goal 3).

Recon facts (verified): `Repair Order` doctype lives in the **taller** app
(`taller/taller/repair/doctype/repair_order/`); its `status` Select =
Recibido / En Trabajo / Esperando Cliente / Esperando Pieza / Listo para
Entregar / Entregado / Cancelado; it has a `crm_deal` Link → CRM Deal. The
MA-1 staging pattern to copy is `services/chatflow.py::_stage_template_review`
(WhatsApp Send Review row + `_pending_row_exists`-style dedupe + recipient
resolution). taller may be ABSENT on a tenant (mumu) — guard everything with
`frappe.db.exists("DocType", "Repair Order")` and make the handler try/except-
swallowed (must never block an RO save).

- NEW `doco_marketing/services/repair_updates.py`: `on_repair_order_update(doc,
  method)` — fire ONLY on a real status transition (`doc.has_value_changed("status")`
  on on_update), look up the template mapped to the NEW status, resolve the
  customer number through the linked `crm_deal` (deal→contact→lead chain —
  mobile_no-is-derived trap!), stage the MA-1 row (source
  `repair_status:<ro>:<status>`, dedupe repeats), breadcrumb Comment on the deal.
  Gate on a `enable_repair_status_updates` settings flag (default 0).
- Settings fields (REPORT PATCH, do not edit the json): `repair_updates_section`
  + `enable_repair_status_updates` (Check 0) + `repair_status_templates`
  (Small Text/JSON: {"Listo para Entregar": "<template name>", ...} — parse
  defensively, unknown status → no-op).
- Hook (REPORT PATCH): `doc_events["Repair Order"]["on_update"]` append.
- NEW `doco_marketing/doco_marketing/tests/test_repair_updates.py`: transition
  stages exactly one Pendiente review row w/ auto=0; repeat save no dup;
  unmapped status no-op; flag off no-op; missing taller doctype no-op; NEVER
  insert an Outgoing WhatsApp Message (mock send_outgoing at class level as
  belt). If `Repair Order` can't be seeded on the bench, drive the handler
  with a synthetic frappe._dict (test_cadence shows the pattern).
- No frontend in this slice.
- Report: `.../scratchpad/p2-s9-taller.md`.

## Slice S10 — Intent → action chips (spec 5.3)

Detect what the customer wants from the thread tail and surface ONE-TAP action
chips above the composer. Chips never send anything — they open existing
surfaces or prefill the composer (send stays human).

Recon: `services/ai.py` (`is_enabled`, `complete(prompt, system)` —
Anthropic-only, PII-redacting; NEVER call any other model path);
`api/inbox.py::suggest_replies` shows the thread-tail fetch + `_ai_enabled`
gating pattern; `ThreadSummary.vue` (S2) shows per-last-message caching.

- NEW `doco_marketing/api/intent.py`: `detect_intent(doctype, name)` —
  perm-checked read, allowlist CRM Deal/CRM Lead; last ~6 INBOUND WA/Messenger
  texts → ai.complete with a STRICT system prompt returning JSON only:
  {"intent": one of "factura"|"cotizar_reparacion"|"precio"|"pago"|"otro",
  "confidence": 0-1, "es_label": short es-MX}. Parse defensively (bad JSON →
  intent "otro" confidence 0). Cache per (record, last message name) in
  `frappe.cache` TTL ~6h. Return {"intent", "confidence", "label", "cached"}.
  Return {"intent": null} when AI disabled or no inbound.
- NEW `crm/frontend/src/components/doco/inbox/IntentChips.vue`: prop-driven
  (doctype, name); fetch on mount + when props change; render ≤1 chip
  (confidence ≥ 0.6 only): 💳 pago → emit('cobrar'), 🧾 factura → emit('factura'),
  🔧 cotizar_reparacion → emit('taller'), 🏷 precio → emit('catalogo'). Parent
  wiring is the LEAD's (report patch listing where: DealWorkspace above the
  composer area; emits map to existing surfaces — catálogo picker open,
  sales-docs tab, composerDraft canned text for factura).
- NEW `crm/frontend/src/utils/intentActions.js`: pure map intent→{icon, label,
  event} + confidence gate fn. Vitest it.
- NEW `doco_marketing/doco_marketing/tests/test_intent.py`: mocked ai.complete
  (JSON good/garbage/low confidence), cache hit short-circuits the model,
  disabled gate, perm gate. NEVER a live Anthropic call in tests.
- Report: `.../scratchpad/p2-s10-intent.md`.

## Slice S11 — Workload view + rebalance (spec 7.2)

Manager surface: who owns how many OPEN conversations, who's over cap, drag- or
button-reassign. Pairs with the S3 metrics + 2.3 auto-assignment machinery.

Recon: `services/assignment.py` (`_open_load`, `_terminal_statuses`,
`OWNER_FIELD`, breadcrumb pattern, `frappe.desk.form.assign_to`);
`api/agent_metrics.py` (S3) for the manager-gating pattern.

- NEW `doco_marketing/api/workload.py`: manager-gated (`frappe.only_for(
  ["System Manager", "Sales Manager"])`):
  `get_workload()` → rows per eligible agent (assignment._pool logic):
  {user, full_name, open_leads, open_deals, sla_overdue_count, over_cap
  (vs auto_assign_cap)}, + {"unassigned": n}. Reuse assignment helpers —
  duplicating the load query is rejection.
  `reassign(doctype, name, to_user)` + `reassign_bulk(items json)` — write-perm
  on each record, set the OWNER_FIELD via db.set_value(update_modified=False),
  swap the ToDo assignment (remove old + assign_add new, both best-effort),
  breadcrumb Comment "↔ Reasignado a X por Y". Publish
  `doco_marketing:thread_update` per record.
- NEW `crm/frontend/src/pages/WorkloadView.vue`: per-agent cards/rows (load
  bars vs cap, overdue badge) + tap agent → their conversations (reuse
  `get_conversation_queue`? NO — new param would touch shared files; instead
  fetch their open deals/leads via `frappe.get_list` client resource with
  owner filter, fields name/contact/status/modified) + reassign flow (select
  conversations → "Reasignar a…" user picker → bulk call → toast). Mobile
  first. Route mount = REPORT PATCH (router.js is lead-owned; propose
  `/workload`, nav entry under Más drawer).
- NEW `crm/frontend/src/utils/workloadFormat.js` (pure: cap %, bar color
  token, sort) + vitest.
- NEW tests `test_workload.py`: workload rows reflect seeded open/terminal
  records, manager gate blocks Sales User, reassign flips owner + breadcrumb +
  perm enforcement.
- Report: `.../scratchpad/p2-s11-workload.md`.

## Slice S12 — SLA escalation + push quiet hours (spec 2.5 + 7.3 remnant)

Overdue conversations chase the manager; push respects sleep.

Recon: `services/inbox/sla.py` (`response_clock`, `first_touch_clock`) and
`services/inbox/queue.py` (how rows get `sla_overdue`); `services/push.py`
(`send_to_users`, `push_enabled`) — push.py is LEAD-OWNED, patch via report.

- NEW `doco_marketing/services/escalation.py`: `run_escalations()` (cron */10
  — hooks patch in report): find conversations overdue > `sla_escalation_minutes`
  (settings, default 30, 0=off) using the SAME sla helpers the queue uses (no
  parallel clock math); notify the escalation audience: `sla_escalation_users`
  (settings, newline list; empty → all enabled Sales Managers): web push
  (`push.send_to_users`) + a `Notification Log` row deep-linking
  `/crm/inbox?deal=<name>`. DEDUPE: one escalation per conversation per
  `sla_escalation_cooldown_hours` (default 4) — stamp via `frappe.cache`
  (`setex`) AND survive cache flush by also checking recent Notification Log
  (belt+braces; document). Quiet hours apply to escalations too.
- Quiet hours: NEW helper `in_quiet_hours(now=None)` in escalation.py reading
  `push_quiet_start`/`push_quiet_end` (Time fields, settings; span-midnight
  aware like assignment._on_shift). REPORT PATCH for `services/push.py::
  send_to_users` to no-op (return {"skipped": "quiet"}) when in_quiet_hours()
  — exact old/new snippet, lead applies.
- Settings fields (REPORT PATCH): `sla_escalation_section`,
  `sla_escalation_minutes` (Int 30), `sla_escalation_cooldown_hours` (Int 4),
  `sla_escalation_users` (Small Text), `push_quiet_start`/`push_quiet_end`
  (Time, empty = no quiet hours).
- NEW `tests/test_escalation.py`: overdue conversation → exactly one
  notification set (push mocked), cooldown suppresses repeat, 0=off, quiet
  hours suppress, audience fallback to Sales Managers, span-midnight quiet
  window math (pure fn unit-tested hard).
- Report: `.../scratchpad/p2-s12-sla.md`.

## Lead-owned batch-3 slices (do not touch)

3.7 optimistic status/task updates, 3.2 idle chunk prefetch, 1.3 camera-direct
attach, all settings-json/hooks/push.py patch application, router mount,
DealWorkspace/composer wiring, integration, builds, prod.

---

# Batch 4 (2026-07-26) — lifecycle flows + quality rails

Same global rules as batches 1-3. Batch-3 addendum stands: NOBODY edits
`marketing_settings.json` / `hooks.py` / `services/push.py` / `composables/inbox.js` /
`router.js` / `DealWorkspace.vue` / `DealContextPanel.vue` / any `Activities/*` file —
settings fields, hooks, and mounts are EXACT patches in your report; the lead applies
them in one pass. New-files-only otherwise. Tests = DoD. Reports mandatory:
`/tmp/claude-1000/-home-holymc2/3be36e5d-b02f-4d69-a6db-130adcc46bcb/scratchpad/p2-<slice>.md`.

## Slice S13 — Won/Lost flows (spec 4.5)

Status transitions close the loop: Ganado → offer factura + fast-path the review
ask; Perdido → optional win-back cadence enrollment. NOTHING sends directly —
factura/review go through MA-1 (`WhatsApp Send Review`, Pendiente, auto=0; copy
`services/repair_updates.py`, this batch's reference implementation), win-back
goes through the cadence engine (`services/cadence.enroll` — same ledger as S5).

Recon first (≤12-line design): `services/inbox/status.py` or wherever status
changes land (set_status routes through doc.save → doc_events on_update is the
hook point; detect terminal via the status doctype's `type` — copy
`_status_is_terminal` usage in services/inbox), `services/reviews.py`
(sweep_review_asks — your Won fast-path must DEDUPE against the sweep's source
key so the customer never gets two asks), `services/cadence.py` (enroll validates
is_cadence; one-active-per-deal), `services/repair_updates.py` (staging pattern).

- NEW `doco_marketing/services/lifecycle.py`: `on_deal_update(doc, method)` —
  fire only on a REAL status transition (has_value_changed) into a terminal
  type. Won-type: (a) if EMC installed + deal has submitted sales docs, stage an
  MA-1 factura-offer template row (settings `won_factura_template`, unset = skip);
  (b) review fast-path gated on the SAME `enable_review_asks` flag + reviews.py
  dedupe key. Lost-type: if settings `lost_winback_cadence` names an Active
  is_cadence campaign, enroll (cadence.enroll swallows 1:1 conflicts — catch +
  log, never block the save). EVERYTHING try/except-swallowed.
- Settings fields (REPORT PATCH): `lifecycle_section`, `won_factura_template`
  (Data, template name, empty = off), `lost_winback_cadence` (Data, campaign
  name, empty = off), `winback_delay_days` (Int 7 — the cadence's own steps
  handle timing; this field only documents intent, read it if trivial else drop
  it and SAY SO in the report).
- Hook (REPORT PATCH): append to CRM Deal on_update (there is an existing
  on_update entry — deliver old/new).
- NEW `tests/test_lifecycle.py`: Won stages ≤1 factura row (auto=0) + dedupes;
  review fast-path dedupes vs sweep; Lost enrolls exactly once, second Lost
  no-op, conflict with an active cadence logged not raised; non-terminal
  transition no-op; flags off no-op; NEVER an Outgoing WhatsApp Message
  (class-level send_outgoing mock + assertion). Savepoint per test.
- No frontend (the existing LostStagePrompt/status flows stay untouched).
- Report: `.../scratchpad/p2-s13-lifecycle.md`.

## Slice S14 — Frontend error telemetry (spec 3.6)

We only see errors users screenshot. Reuse the posawesome telemetry SHAPE
(sampled, PII-scrubbed, self-limiting) but store in a doco_marketing doctype —
the monitoring stack is down, so the landing zone is the site DB, viewable in
Desk.

- NEW doctype `CRM Client Error` (doco_marketing/marketing/doctype/
  crm_client_error/ — new folder is yours): fields hash (Data, unique-ish),
  message (Small Text), stack (Text, TRUNCATED server-side to ~4000 chars),
  url (Data), user_agent (Data 200), user (Link User), count (Int), first_seen /
  last_seen (Datetime), release (Data — the SPA __BUILD_ID__). Naming: hash.
  NO customer text may enter: the endpoint stores the error, never form data.
- NEW `doco_marketing/api/client_error.py`: `report(payload)` whitelisted,
  session users only (frappe.session.user != Guest → else 403), rate-limited
  (frappe.cache counter per user, ≤20/h — over = silently accepted+dropped),
  UPSERT by hash (count++, last_seen), retention cap (on insert, if total rows
  > 2000 delete oldest 200 — cheap, in the same request, best-effort).
- NEW frontend `src/composables/telemetry.js`: window.onerror +
  unhandledrejection listeners; builds {message, stack, url, release} —
  SCRUB: strip query strings from urls, cap stack, drop messages matching
  /ResizeObserver|Script error/ noise; hash = simple djb2 of message+top frame;
  10% sampling for repeats within the session (first occurrence always sent);
  navigator.sendBeacon fallback fetch keepalive; NEVER throws (telemetry that
  crashes the app = fired). Export `initTelemetry()`; mount patch (App.vue
  one-liner) in report.
- Tests: python (guest 403, rate-limit drop, upsert count++, retention prune,
  stack truncation) + vitest for the pure parts (hash stable, scrub, sampling
  gate, noise filter). Savepoint per test.
- Report: `.../scratchpad/p2-s14-telemetry.md`.

## Slice S15 — Abandoned checkout → cadence (spec 6.4 remainder)

Order→deal thread ALREADY exists (storefront_bridge.on_sales_order_submit).
What's missing: an abandoned checkout should optionally enroll the deal/lead in
a follow-up CADENCE (multi-touch, stop-on-reply — S5 machinery) instead of the
single template nudge `services/abandoned.py` sends today.

Recon first: `services/abandoned.py` END TO END (how carts are detected, the
SOURCE key, how the template nudge stages, which reference doc it resolves),
`services/cadence.py` (enroll contract: DEAL-scoped — if the abandoned flow
resolves to a Lead, look at how conversion/orphans link lead→deal and document
what you do with lead-only carts), `crm_campaign.is_cadence`.

- NEW `doco_marketing/services/abandoned_cadence.py`: called from the SAME
  sweep abandoned.py runs (hook/report patch appends your function to the
  existing scheduler entry or abandoned.py's sweep calls yours — do NOT edit
  abandoned.py; deliver the one-line call-site patch in the report). Gated on
  settings `abandoned_cadence` (Data, Active is_cadence campaign name, empty =
  off — the template nudge keeps working as today). Dedupe: one enrollment per
  cart/deal (cadence's own 1:1 dedupe + your source stamp). Lead-only carts:
  document the chosen path (skip with log is acceptable v1).
- Settings field (REPORT PATCH): `abandoned_cadence` in the existing abandoned
  section.
- NEW `tests/test_abandoned_cadence.py`: enrolls once, second sweep no-op,
  setting empty no-op, non-cadence campaign rejected+logged, reply stops the
  sequence (assert via cadence.stop_on_reply integration), no Outgoing WA ever.
- No frontend.
- Report: `.../scratchpad/p2-s15-abandoned.md`.

## Slice S16 — Coaching notes (spec 7.4)

Manager annotates a conversation privately ("aquí ofrece el combo") — visible
ONLY to manager roles, never to the agent being coached, never in the customer
timeline.

- NEW doctype `Coaching Note` (new folder yours): reference_doctype (CRM Deal/
  CRM Lead), reference_name, author (Link User), note (Small Text), creation.
  Doctype permissions: read/write/create ONLY System Manager + Sales Manager
  (role table in the doctype JSON). NOT track_changes-sensitive.
- NEW `doco_marketing/api/coaching.py`: `list_notes(doctype, name)` /
  `add_note(doctype, name, note)` / `delete_note(name)` — `frappe.only_for(
  ["System Manager","Sales Manager"])` on ALL (belt atop doctype perms), read
  perm on the referenced record, note escape_html'd ON WRITE (the audit L3
  lesson — every stored free-text escapes at the boundary), author = session
  user, delete only own note unless System Manager.
- NEW frontend `src/components/doco/inbox/CoachingPanel.vue`: collapsible
  section — list (author avatar/initials + timeAgo + note) + add box + delete
  own. Self-hides entirely when the backend 403s (non-manager sees NOTHING, not
  an empty box). frappe-ui tokens, es-MX, .press. Mount patch (DealContextPanel,
  below the duplicate banner area) in report.
- NEW `src/utils/coachingFormat.js` if you need pure helpers; vitest it.
  (If you genuinely need none, say so in the report instead of inventing one.)
- Tests: python (manager gate on all three endpoints, non-manager PermissionError,
  escape on write, delete-own-only, read-perm on referenced record) + vitest for
  any pure helpers. Savepoint per test.
- Report: `.../scratchpad/p2-s16-coaching.md`.

## Lead-owned batch-4 slices (do not touch)

2.7 in-thread search + 3.3 media lazy-load (Activities/WhatsAppArea — upstream
files), 7.3 SLA-pause-off-shift (services/inbox/sla.py), all patch application,
mounts, integration, builds, prod.
