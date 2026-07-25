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
