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

## Open before merging (Marco decides)

- (2026-09-13 15:40 UTC) Test-fixture status rows deleted from the mirror; board shows the 11 real columns. Any `bench run-tests` on the mirror recreates them.

- doco-mirror `System Settings.language` is `en`; tenants run `es-MX`. Flip the
  mirror, re-run seed + heal, and accept on a Spanish pipeline like prod.
- Deal 360 stepper now has its own horizontally scrollable row; verified in
  the browser at 1366px without page overflow.
- FF-merge target: `fix/social-editorial-quality` (crm, base of this branch),
  `main` (taller), `feat/campaign-registration-20260910` (doco_marketing, base).

## Wave 2 — implemented and tested on lab (2026-09-13 takeover; uncommitted)

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
The mirror language remains `en`; Spanish acceptance remains open above.

`dev-refresh.sh crm` completed both host and container SPA builds, PWA verification
(183 JS/CSS assets), asset publication, and coordinated restarts. Served and local
build IDs match: `1789316305403`. The refresh's all-site cache loop reported an
unrelated missing database; the target mirror refresh completed. Logs:
`/tmp/crm-pipeline-refresh.log`, `/tmp/crm-pipeline-*-tests.log`,
`/tmp/crm-pipeline-vitest.log`.

Browser: funnel API HTTP 200, 11 stages; empty rungs render and warranty is excluded
from drop-off calculations. Deal header loads at 1366px without page overflow.
Screenshots: `/tmp/crm-pipeline-funnel.png`, `/tmp/crm-pipeline-header-1366.png`.
The test account received a PermissionError from
`crm.api.whatsapp.get_deal_whatsapp_contacts`; full conversation acceptance is
not established by this header check. Backend tests use committed intake fixtures,
so their test repair orders/deals remain on the mirror.

Quote ownership remains inferred: zero or the previous quote total follows the
quote; a distinct nonzero manual estimate stays. A manual value identical to the
quote cannot be distinguished without explicit provenance.

## Still deferred

6. Lists still lack inline edit, group-by, shared saved views, true totals;
   consider adopting the upstream list/kanban instead of the redesign list.
