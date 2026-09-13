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
- Deal 360 header is crowded on 1366px: the stepper squeezes the title; move it
  to its own row or truncate stage labels.
- FF-merge target: `fix/social-editorial-quality` (crm, base of this branch),
  `main` (taller), `feat/campaign-registration-20260910` (doco_marketing, base).

## Wave 2 (not started)

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
6. Lists still lack inline edit, group-by, shared saved views, true totals;
   consider adopting the upstream list/kanban instead of the redesign list.
