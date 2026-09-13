# CRM pipeline milestone 1: plan and spec (2026-09-13)

Companion to `CRM_PIPELINE_GAPS_2026_09_13.md`. This is the build spec for the
first milestone. Branch `feat/crm-pipeline-gaps` in `crm`, `taller` and `doco_marketing`. The session lead commits;
workers do not commit, do not run `dev-refresh.sh`, do not restart containers.

## Decisions (already taken, do not re-litigate)

1. **The deals pipeline IS the repair pipeline.** taller owns the stage taxonomy
   (`taller/repair/seed/deal_statuses.py`): eleven canonical stages with color,
   position, type and probability, seeded in BOTH languages so a language flip is
   free. We keep that. What we fix: only the tenant's ACTIVE language set is
   visible in pickers, boards, funnels and analytics, and deals sitting on the
   inactive twin get re-labelled to the active name.
2. **Next activity = the earliest open CRM Task on the record**, denormalised
   onto CRM Lead / CRM Deal so lists and boards can show and sort by it without
   N+1 queries. No new "activity" doctype.
3. **Values:** `expected_deal_value` is the pipeline number (taller may fill it
   from `Repair Order.quote_amount` later; out of scope here). `deal_value` stays
   the invoiced number (`taller/repair/repair_orders/deal_sync.py`). Boards show
   expected value when present, else deal value. Column totals are
   probability-weighted using the stage probability.
4. Layering per the workspace rule: thin `api.py`, services, queries, one
   responsibility per file, files under ~200 lines.

## Schema (crm fork, doctype JSON)

- `CRM Deal Status`: add `hidden` (Check, default 0, label "Hidden",
  description "Excluded from pickers, boards, funnels and analytics. Deals already
  on this status still render."), after `type`, `in_list_view: 1`.
- `CRM Task`: add `activity_type` (Select, options `Task\nCall\nWhatsApp\nEmail\nMeeting`,
  default `Task`, after `priority`, `in_list_view: 1`).
- `CRM Lead` and `CRM Deal`: a collapsible section "Next Activity" with four
  read-only fields: `next_activity_at` (Datetime), `next_activity_title` (Data),
  `next_activity_type` (Data), `next_activity_task` (Link CRM Task).
  `next_activity_at` gets `in_standard_filter: 0`, `search_index: 1`.

## Backend (crm fork)

```
crm/crm/pipeline/
  __init__.py
  api.py                      # whitelisted only: get_visible_stages(doctype)
  hooks.py                    # on_task_change(doc, method) -> services.next_activity.refresh
  constants.py                # OPEN_TASK_STATUSES = ("Backlog","Todo","In Progress"), REFERENCE_DOCTYPES
  services/next_activity.py   # refresh(doctype, name), backfill()
  queries/next_activity.py    # earliest_open_task(doctype, name) -> dict|None
  queries/stages.py           # visible_statuses(doctype) ordered by position, hidden=0
crm/crm/patches/v1_0/backfill_next_activity.py   # + line in patches.txt
crm/crm/tests/test_next_activity.py
```

Behaviour:
- `refresh(doctype, name)`: earliest open task by `due_date` ascending, tasks
  without due date last (ordered by creation). Writes the four fields with
  `frappe.db.set_value(..., update_modified=False)`; clears them when no open
  task remains. No-op if the reference record does not exist.
- `hooks.py` wires `CRM Task` `after_insert`, `on_update`, `on_trash` in
  `crm/hooks.py` `doc_events`. When a task's reference changes on update,
  refresh both the old and the new reference.
- `backfill()` iterates leads and deals that have any open task, plus clears
  stale values on records with none. Idempotent; the patch calls it.
- `get_visible_stages(doctype)` returns `[{name, color, position, type,
  probability}]` for `CRM Deal Status` / `CRM Lead Status` (lead statuses have
  no hidden or probability: return `hidden` 0 and `probability` null).
- `crm/api/dashboard.py`: every query that joins `CRM Deal Status` for stage
  distribution (`get_deals_by_stage_axis`, `get_deals_by_stage_donut`) excludes
  `hidden = 1`. Do not touch forecast or counts.

Tests (`IntegrationTestCase`, own the fixtures you create, clean up):
- creating a task with a due date sets the four fields on its deal;
- an earlier-due task replaces it; marking Done falls back to the next one;
- deleting the last open task clears the fields;
- a task moved to another deal refreshes both;
- backfill fills a deal whose fields were blanked by SQL.

## taller (owner of the taxonomy)

- `taller/repair/seed/deal_statuses.py`: after seeding, mark every status of the
  INACTIVE language set `hidden = 1` and the active set `hidden = 0`, guarded by
  `frappe.db.has_column("CRM Deal Status", "hidden")`. Runs on every
  `execute()` so a language flip re-marks.
- New `taller/repair/seed/deal_status_heal.py`: `relabel_inactive_twins()` moves
  deals from each hidden twin to its active sibling (same canonical stage) with
  one UPDATE per pair, mirrors `Repair Order.deal_status` the same way, returns
  counts. Idempotent. Wire it after the seed in `install.heal_critical_data`.
- Tests in `taller/tests/test_deal_statuses.py`: hidden marks follow the site
  language; heal moves a deal from "Approved" to "Aprobado" on a Spanish site
  and leaves the active set untouched.

## Frontend (crm, redesign surfaces only)

```
frontend/src/utils/activityState.js         # activityState(at, now) -> overdue|today|planned|none ; activityLabel(at, now)
frontend/src/utils/pipelineMath.js          # weightedTotal(countsByStatus, statuses) ; displayValue(row)
frontend/src/components/doco/NextActivityChip.vue
frontend/src/components/doco/StageStepper.vue
frontend/tests/unit/activityState.test.js
frontend/tests/unit/pipelineMath.test.js
```

- `stores/statuses.js`: fetch `probability` and `hidden` too; expose
  `visibleDealStatuses` / `visibleLeadStatuses` (hidden filtered out) while the
  by-name maps keep every row so a legacy deal still renders its color.
- `pages/DealsView.vue` and `pages/LeadsView.vue`: `stageOptions` use the visible
  lists; list resources fetch `expected_deal_value`, `expected_closure_date`,
  `probability`, `next_activity_at`, `next_activity_title`, `next_activity_type`,
  `deal_owner` / `lead_owner`, `_user_tags`.
- Deal board card: line 1 `deal_name` (fallback customer, then `name`); line 2
  device or phone; right side `displayValue(row)` and a probability pill
  (`row.probability` else stage probability); bottom row: `NextActivityChip`
  (or a muted "Sin actividad"), owner initials avatar, relative age. Lead card
  gets the chip and owner avatar; keeps the score popover.
- Column header: count, then `formatMXN(sum)` and `pond. formatMXN(weighted)`
  where the aggregate call also sums `expected_deal_value`; weighted =
  sum over statuses of (expected or deal value) x probability / 100.
- Lists: new toggleable columns "Valor esperado", "Cierre", "Próxima actividad"
  (chip) on deals; "Próxima actividad" on leads. Sort option "Próxima actividad"
  (`next_activity_at asc`, nulls last: order by `ifnull(next_activity_at,
  '9999-12-31')` is not expressible through frappe-ui; use `next_activity_at
  desc` plus client-side placement of nulls last within the loaded page).
- Chip states: overdue = red text on red-1 surface, today = amber, planned =
  gray, none = muted text. Label examples: "Vencida · 2 d", "Hoy 15:00",
  "Mañana", "En 3 d", "12 oct".
- `StageStepper.vue`: the visible Open/Ongoing/On Hold stages in position order
  as clickable segments (current highlighted with the stage color), then two
  buttons: "Ganado" (first Won-type status) and "Perdido" (dropdown of Lost-type
  statuses). Every change goes through the existing status change path in
  `DealHeader.vue` (guardStatusChange + lost-reason modal); the stepper replaces
  the plain status dropdown on desktop in `DealHeader.vue` only.
- `composables/navModel.js`: add `{ key: 'funnel', label: 'Embudo', to:
  '/pipeline-analysis', group: 'funnel' }` to `navItemsBottom` (lucide
  `filter` icon) and map `/pipeline-analysis` to group `funnel` in `routeGroup`.
- `pages/PipelineAnalysis.vue`: consume the new funnel payload (below): drop-off
  only across Open stages in position order; KPI "Conversión" = won / (won +
  lost); "Etapa final" replaced by "Ganados" and "Perdidos" counts.

## doco_marketing

- `api/reports.py::get_pipeline_funnel`: exclude `ds.hidden = 1` (guard with
  `has_column`), return `{"stages": [{stage, count, type, probability,
  position}], "won": n, "lost": n, "conversion": pct}`. Keep the scoping logic.
  Update its test if one exists; add one otherwise.

## Acceptance (lead verifies on doco-mirror)

- Mirror after migrate + heal: 0 deals on English twins; board shows 11 columns
  in stage order; funnel and Pipeline Analysis show one row per stage.
- A deal with two open tasks shows the earlier one on its row and card; done
  falls through; the chip turns red for an overdue task.
- Column headers show count, sum and weighted sum.
- Deal 360 desktop header shows the stepper; clicking "Perdido" still demands a
  lost reason.
- `npx vitest run` green; crm and taller test modules green on doco-mirror.
