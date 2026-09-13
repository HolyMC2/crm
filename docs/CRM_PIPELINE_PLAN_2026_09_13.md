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

## Still deferred

6. Lists still lack inline edit, group-by, shared saved views;
   consider adopting the upstream list/kanban instead of the redesign list.
