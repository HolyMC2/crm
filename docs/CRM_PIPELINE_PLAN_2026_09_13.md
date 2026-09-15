# CRM pipeline (Odoo gap work) — state and next steps

Lean tracker. Trim as items land; delete when the initiative closes.

## Why (assessment, 2026-09-13, condensed)

Leads and deals felt weak next to Odoo for three reasons, in weight order:
1. the pipeline had no semantics to render: taller seeds the stage taxonomy in
   two languages (22 statuses, board showed all, funnel double counted), values
   are rarely captured, leads never leave "New";
2. no next-activity discipline: nothing dated on a deal, nothing on rows or cards;
3. the redesign views hid what the model had (probability, expected value, close
   date) and lag the upstream list/kanban (group-by, shared views, quick add).
Decision: the deals pipeline IS the repair pipeline (taller owns the taxonomy);
we keep both language sets seeded but only the active one is visible.

## Milestone 1 — DONE on lab (branch `feat/crm-pipeline-gaps` in crm, taller, doco_marketing; pushed; not on prod)

- crm: `CRM Deal Status.hidden`, `CRM Task.activity_type`, `next_activity_*` on
  Lead/Deal kept from CRM Task by hooks (`crm/pipeline/`), backfill patch, stage
  charts skip hidden stages. 10 integration tests.
- taller: seed marks the inactive language set hidden on every run;
  `deal_status_heal` relabels deals and repair orders onto the active names.
- doco_marketing: `get_pipeline_funnel` skips hidden stages, returns
  stages + won/lost/conversion.
- frontend: cards with title, value, probability, next-activity chip, owner,
  tags; headers with count, sum, weighted sum (Frappe 16 dict aggregates);
  next-activity column and sort; StageStepper in Deal 360 desktop header;
  "Embudo" nav entry; Pipeline Analysis on won/lost semantics.
- Verified on doco-mirror (English set active there): 11 real columns, headers
  "Approved 1367 MX$ 2,050 pond. MX$ 1,538", stepper renders, funnel reads
  Conversión 95.9%.

## Merge targets (not merged or deployed to production)

- FF-merge target: `fix/social-editorial-quality` (crm, base of this branch),
  `main` (taller), `feat/campaign-registration-20260910` (doco_marketing, base).

## Inbox › Conversaciones repair — built 2026-09-15, UNCOMMITTED (crm)

Marco: «conversaciones feature is broken … where are our messages?». Four
defects, all in the native workspace shipped 09-10:
1. Every read endpoint locked rows (`FOR UPDATE` in `_roles`, `_account`,
   `_load`, message scans). The page fires thread list, history and outbox in
   parallel; they took the account and conversation rows in opposite order and
   deadlocked → 500 `QueryDeadlockError` → «No se pudo cargar la conversación»
   and an emptied list. Now `conversations._locked()` is true only inside
   `conversation_fence` (mutations); list/history reads never lock.
2. WhatsApp keyed peers by the exact string: incoming `from` is `521…`, stored
   outgoing `to` is `52…` → replies lived in a second nameless thread (543 of
   1147 outgoing rows). `PEER_SUFFIX = 10` (the codebase phone-key contract)
   now scopes history and collapses spellings in the list; the existing
   exact-peer test still passes, a new test pins the merge.
3. Template sends have an empty `message` (868 of 1069 deal rows) → blank
   bubble. `_template_text` renders the review-queue preview, else the template
   body with its parameters.
4. Threads showed raw numbers. `_display_names` resolves Contact by number
   suffix, else the customer's WhatsApp `profile_name`.
Frontend: default space is «Negocios y actividad» (conversations via
`?workspace=conversations` or a deep link); the inbox route keeps a stable
router key so a thread click no longer remounts and re-bootstraps the page;
selects readable in dark mode. Verified on doco-mirror: no banner, three API
calls per click, thread 5216463445324 reads «maria ramos» with 7 out / 5 in.
Python: `test_conversation_threads` 20 ok, `test_conversations` 23 ok (mirror).

## Aprobaciones WhatsApp redesign — built 2026-09-15, UNCOMMITTED on the same worktrees

Marco: the queue card showed a template id, a phone and a deal number; nothing
said who the customer is or what the send is about. Now
`doco_marketing.api.review_queue._enrich` resolves per row (batched): customer
name + phone (deal identity chain via `api.deals.get_deal_display`), device,
repair type, deal title/status/owner, the repair order the row is about
(folio pinned from `source`/`body_param`, else newest) with its status, template
human name; `counts` no longer enriches. Card (`WhatsAppReviewCard.vue`) leads
with the person linked to Deal 360, RO chip to Desk, deal chip with stage,
owner, then message, then actions; `showContext=false` in the conversation
strip. Pills carry pending/failed counts. Pure display rules in
`utils/reviewCardFormat.js` (phone prefix comes from the data, no `+52`).
Rows whose reference is gone (deleted test repair orders) still name the
customer from the Contact behind the number and open the contact. Tests:
`reviewCardFormat.test.js`, `whatsappReviewCard.test.js` (16 green, suite
green). Verified headless on doco-mirror `/crm/whatsapp-queue` (26 RO chips,
75 deal links, 24 contact links, no console errors). Awaiting Marco's review;
prod needs doco_marketing (Python) and the crm SPA build rolled together.

## Wave 2 — committed and tested on lab (2026-09-13)

Commits: CRM `6b8ce8863`, Taller `7728e99a`, Marketing `1b909bb`.

1. `deal_name` field on CRM Deal (taller already writes it; Frappe drops it);
   title_field; heal for repair-order deals.
2. Seed enforces position/colour/type/probability on existing status rows
   ("Abandonado" sits at 0 on the mirror).
3. Legacy `Repair Order.deal_status` strings and NULLs: map via
   `cleanup_status_taxonomy.DEAL_STATUS_MAP`, re-sync from the deal.
4. Expected value from the quote: copy `Repair Order.quote_amount` into
   `expected_deal_value` at quoting stage (taller), never stomping manual edits.
5. Funnel ladder: LEFT JOIN so empty stages show; stop the drop-off chain at the
   first Won/Lost position (Warranty Repair sits after them).

Validation: 13 Taller quote/title/status-sync tests, 17 stage seed/heal tests,
5 CRM title tests, 10 existing next-activity tests, 8 Marketing funnel tests;
all passed. Frontend: 569 tests passed, including the warranty re-entry cutoff.
Quote comparison tolerates floating-point summation noise; regression coverage
includes multi-order totals, clearing a quote, and preserving a one-cent edit.
The phone-title fixture now uses the primary Contact, which owns deal phone data.

Guarded mirror migration passed: 20 installed apps mapped, zero orphan DocTypes,
zero Deleted Document entries for DocType from the verification window. Full log:
`/tmp/crm-pipeline-migrate-full.log`. After language-flip tests, seed + heal restored
the existing English taxonomy (11 visible stages); a second heal changed zero rows.
The follow-up switched the mirror to `es-MX`; see acceptance below.

`dev-refresh.sh crm` completed both host and container SPA builds, PWA verification
(183 JS/CSS assets), asset publication, and coordinated restarts. Served and local
build IDs match: `1789316305403`. The refresh's all-site cache loop reported an
unrelated missing database; the target mirror refresh completed. Logs:
`/tmp/crm-pipeline-refresh.log`, `/tmp/crm-pipeline-*-tests.log`,
`/tmp/crm-pipeline-vitest.log`.

Browser: funnel API HTTP 200, 11 stages; empty rungs render and warranty is excluded
from drop-off calculations. Deal header loads at 1366px without page overflow.
Screenshots: `/tmp/crm-pipeline-funnel.png`, `/tmp/crm-pipeline-header-1366.png`.
The initial header check exposed a retired WhatsApp endpoint; see the follow-up
below. Backend tests use committed intake fixtures, so their test repair orders/deals
remain on the mirror.

Quote ownership remains inferred: zero or the previous quote total follows the
quote; a distinct nonzero manual estimate stays. A manual value identical to the
quote cannot be distinguished without explicit provenance.

## Follow-up — native conversation handoff and Spanish acceptance

- The permission error was the intentional legacy retirement gate in
  `whatsapp_chat.api.native_workspace`, not a missing role. DealWorkspace now
  lists native conversations explicitly linked to the current deal/lead and opens
  their existing workspace. The native conversation's deal link returns to Deal 360.
- `conversation_threads.list_for_reference` checks record access and each current
  account/shop/peer scope; returns finite metadata with reference-bound pagination.
  It does not infer identities from phone numbers or create conversations.
- Activity tabs no longer fetch the retired WhatsApp contact endpoint in the
  background. Empty, denied, and failed conversation lookups have clear next actions.
- Validation: 19 native conversation integration tests and all 572 frontend tests
  pass. Tests cover exact identity, record and account denials, cursor isolation,
  empty lists, and retry. Logs: `/tmp/crm-native-handoff-tests.log` and
  `/tmp/crm-native-handoff-vitest.log`.
- Mirror now uses `es-MX`: 11 visible Spanish stages, zero changes on a second heal.
  There are currently no native conversations linked to mirror deals; positive
  linked-record behavior is verified with isolated fixtures, not live customer threads.
- Browser acceptance passed: Spanish funnel HTTP 200 with 11 stages; 1366px header
  has no page overflow; activity/conversation tab switch, native queue navigation,
  and browser back work with zero page errors. No messages were sent.
  Evidence: `/tmp/crm-native-handoff-browser.log`,
  `/tmp/crm-pipeline-header-spanish-1366.png`, `/tmp/crm-pipeline-funnel-spanish.png`.
- Lab refresh completed with both SPA/PWA builds verified. Served and local build
  IDs match `1789318324714`; full log `/tmp/crm-native-handoff-refresh.log`.

## Follow-up — integrated deal workflow polish

- Deal 360 opens on Resumen: canonical next follow-up, expected value, close date,
  owner, commercial stage, linked repair work, sales documents and conversations.
  Missing work explains the next action; task creation carries the deal and owner,
  and task completion guards double clicks and retains errors for retry.
- Contact details remain one click away; coaching is secondary and collapsed.
  Mobile stacks follow-up actions and gives identity its own header row.
- List, board and header use the deal title. Returning to Tratos preserves the
  user's search, filters, sort and view in per-user session storage. Aggregate
  counts show the filtered total, with a labelled loaded-count fallback.
- Follow-up modal headings translate correctly, its close button has an accessible
  name, and document guidance points to the existing Artículos quotation flow.
- Validation: all 577 frontend tests passed, including task defaults, duplicate
  completion prevention, failed completion, and list context normalization.
  Log: `/tmp/crm-polish-vitest-final.log`.
- Browser acceptance passed at 1366px and 390px: linked repair status/quote/balance,
  repair and quotation tab navigation, follow-up dialog open/close, restored list
  search, zero page errors and no page overflow. Screenshots:
  `/tmp/crm-polish-overview-desktop.png`, `/tmp/crm-polish-overview-mobile.png`,
  `/tmp/crm-polish-task-modal.png`; log `/tmp/crm-workflow-polish-browser-final.log`.
- Both SPA/PWA builds and coordinated lab refresh passed; served and local build
  IDs match `1789319680282`. Full log:
  `/tmp/crm-workflow-polish-refresh-final.log`. No production deployment or messages.

## Follow-up — daily work queues

- Added Todos, Vencidos, Para hoy, Sin fecha and Sin seguimiento entry points.
  The selected queue survives a deal visit and is included in saved browser views.
- Queue filters run on the server and are shared by rows, aggregate totals and
  export. Today uses the site timezone. Overdue means before today's midnight;
  dated queues use server ordering so the earliest tasks lead across pages.
- Missing follow-up uses the canonical task link and excludes Won/Lost statuses;
  undated tasks have their own queue and an explicit label. Load failures retain
  filters and show Reintentar instead of claiming there are no matching deals.
- All 580 frontend tests pass (`/tmp/crm-followup-queues-tests.log`).
- Browser: all four filtered queue requests HTTP 200; selected queue restored
  after a deal visit; 390px layout without page overflow or browser errors.
  Log `/tmp/crm-followup-queues-browser-tls.log`; screenshots
  `/tmp/crm-followup-queues-desktop.png`, `/tmp/crm-followup-queues-mobile.png`.
- Both SPA/PWA builds and asset publication passed (build `1789333582780`), but
  refresh failed at proxy restart: Tailscale Serve occupies tailnet port 443,
  conflicting with the proxy's wildcard bind. Normal lab HTTPS is unavailable
  pending an operator binding decision. Browser acceptance used a temporary
  localhost-only HTTPS relay to the same frontend/site; the relay was closed.
  Full refresh log `/tmp/crm-followup-queues-refresh.log`. No Python restart.

## Remaining list capabilities

6. Lists still lack inline edit, group-by, shared saved views;
   consider adopting the upstream list/kanban instead of the redesign list.
