# Deals list unification: one list, tenant-customizable

Approved by Marco on 2026-09-28. The decision was made by Codex Astra, with evidence from a
read-only Opus audit. Complaint: the custom `/deals` page (`frontend/src/pages/DealsView.vue`) is
weaker than upstream, with few filters, views and columns and almost no tenant customization.

Decision: consolidate on upstream `Deals.vue` (ViewControls + CRM View Settings). Carry over
what is good in DealsView, switch `/deals` only after the acceptance list passes, then retire
DealsView entirely, mobile included.

Lanes (both repo `crm`; the workers never share a worktree):

- `crm-deals-unify-api-20260928`: backend (Python, patches, tests). Lands first.
- `crm-deals-unify-ui-20260928`: frontend, coding against this contract.

## Contract

### 1. Relative date token `@today` (backend)

- `crm.api.doc.get_data` already resolves `@me`. Add `@today`, anywhere a filter value (scalar
  or list element) equals `"@today"`. It resolves to the site-local date (`frappe.utils.today()`,
  honouring System Settings time zone) at request time.
- Add optional offsets `@today+N` / `@today-N` (days).
- Saved views store the token, never the resolved date, so views stay correct past midnight.
- Implement it once as `crm.api.list_tokens.resolve_filter_tokens(filters) -> filters` (handles
  dict and list filter forms, recursing into list values) and use it in get_data,
  `aggregate_deal_metrics`, the group-by/kanban count paths inside get_data, and the new export
  (§4).

### 2. Virtual list columns (backend + frontend)

- Registry hook `crm_virtual_list_columns` in any app's hooks.py:
  `{"CRM Deal": ["dotted.path.provider"]}`. crm registers nothing for the repair or customer
  columns itself. doco_marketing / taller providers are wired in later lanes, so crm ships a
  generic, app-agnostic mechanism plus one crm-owned provider (see below).
- A provider is a module exposing:
  - `columns(doctype) -> list[dict]`: descriptors
    `{key, label, fieldtype, width, virtual: 1, sortable: 0, filterable: 0, groupable: 0|1}`.
    Keys MUST start with `_v_` (e.g. `_v_customer`, `_v_phone`, `_v_device`, `_v_repair_order`,
    `_v_repair_status`). Labels go through `_()`.
  - `enrich(doctype, rows: list[dict], keys: set[str]) -> None`: fills the keys in place for
    rows the user may read. It is batched (one query per key family, never per row) and
    permission-aware. It must not leak a related record the user cannot read; leave the
    value None instead.
- `crm.api.list_columns.get_virtual_columns(doctype)` (GET) returns the union of provider
  descriptors whose app is installed. Import failures are logged and skipped, never raised.
- `get_data` strips `_v_*` keys from the SQL fields, rows and order_by (a `_v_*` order_by
  falls back to the view default), runs the native query, then calls the providers' `enrich`
  for the requested keys. Columns keep their saved order and width.
- A crm-owned provider `crm.api.list_columns_crm` for CRM Deal:
  - `_v_next_step`: a compact object `{at, task, type, overdue: bool, days}` built from the
    existing `next_activity_*` fields, with overdue computed against site-local now.
  - `_v_weighted`: `deal_value × probability`, formatted in the deal currency.
- Frontend: ColumnSettings appends `get_virtual_columns` descriptors to its "add column" list.
  Filter, SortBy and GroupBy never offer `_v_*` keys (sortable/filterable 0).

### 3. Seeded public queues (backend)

- An idempotent install/migrate step (`after_migrate` hook calling
  `crm.api.deal_queues.ensure_default_queues()`) creates public CRM View Settings for CRM Deal
  (list view) when they are missing. Identity is a stable key stored in the view (use an existing
  field, or add a small custom field `crm_seed_key`), never the translated label. Managers may
  edit or delete them, and deleted seeds are NOT recreated: record that in a tombstone, e.g.
  FCRM Settings JSON `deal_queue_seeds_done`.
  - `todos`: all open deals (status type not Won/Lost; resolve the status names from CRM Deal
    Status `type` at request time, never hard-coded names).
  - `vencidos`: `next_activity_at < @today`, next task set, still open.
  - `para_hoy`: `next_activity_at` timespan today.
  - `sin_fecha`: task set but no date.
  - `sin_seguimiento`: no next task, still open.
  - Reproduce the exact predicates from `frontend/src/utils/dealFollowUp.js` in server form.
    Where "open" depends on status type, add the token `@open_deal_statuses` resolved in
    `resolve_filter_tokens` to the tenant's non-terminal CRM Deal Status names.
- Columns for the seeded views: title, `_v_customer`, `_v_phone`, `_v_device`,
  `_v_repair_order`, `_v_repair_status` (only when present in `get_virtual_columns`),
  `_v_next_step`, deal_value, status, modified, deal_owner.

### 4. Export (backend + frontend)

- `crm.api.list_export.export_list(doctype, fields, filters, order_by, page_length, file_format,
  selected_items=None, view=None)` (GET, streams a file):
  - same permission checks as get_data; tokens resolved; native fields via
    `frappe.get_list`; `_v_*` enriched through the same providers;
  - Excel via `frappe.utils.xlsxutils.make_xlsx`, CSV via the csv module;
  - column headers are the labels.
- Frontend ViewControls `exportRows` calls it instead of `frappe.desk.reportview.export_query`
  (for every doctype; it must behave identically when there are no tokens or virtual keys).

### 5. Saved-view migration (backend)

- A patch converts DealsView's packed views (state JSON inside `kanban_fields`; see
  `frontend/src/utils/dealViewSettings.js`) into standard CRM View Settings filters, columns
  (DealsView column keys mapped to real fields or `_v_*` keys), order_by and group_by.
  - Keep the original JSON in a backup field or a Version entry.
  - It is idempotent.
  - It must not touch views that were never packed.

### 6. Frontend (ui lane)

- `DealsListView.vue` cell slots for `_v_next_step` (reuse `NextActivityChip` + `FollowUpCell`
  from `components/doco/deals/FollowUpCell.vue` for inline schedule and complete),
  `_v_repair_status` (chip whose colour comes from the provider row, not a JS map), and the
  generic virtual text cells.
- Row click opens Deal 360 (`/deal/:dealId`, route name `Deal 360`) when that route exists,
  otherwise `Deal`. Back navigation keeps filters, sort, scroll and page.
- The Deals page gains:
  - a summary strip (count, value, weighted, from `aggregate_deal_metrics` with the same
    filters);
  - an Embudo toggle rendering the existing `components/doco/FunnelView.vue` from those
    aggregates;
  - a pipeline selector as a quick filter (`pipeline` field) whose stage options follow the
    chosen pipeline (`crm.pipeline.api.get_pipelines`).
- Mobile: port the DealsView phone card layout and filter sheet into the upstream list for
  small screens (`isMobile`).
- ColumnSettings: virtual columns (§2). ViewControls export: §4.
- Every colour comes from theme tokens or server config; every string goes through `__()`;
  dark mode must work.
- The route switch (`/deals` → upstream list, with redirect compatibility for old
  `/deals?…` query params) and deleting DealsView are NOT part of the worker's job. The lead
  does them after acceptance.

## Acceptance before the switch

- All five queues, next-step chips and inline schedule/complete work; midnight, undated tasks
  and terminal outcomes are correct.
- Queue → Deal 360 → action → back keeps filters, sort and position, on desktop and phone.
- Pipeline-scoped stages, configurable kanban, virtual columns, totals/funnel, search, bulk
  actions and export of the selected columns all work.
- Custom fields appear as columns and filters. Personal and public views survive reload.
  Migrated packed views match what they showed before.
- Restricted roles, and tenants without taller/doco_marketing, pass. Totals and export respect
  the same scope.

## Checklist

- [ ] api: tokens, virtual columns, crm provider, queues, export, migration, tests
- [ ] ui: cells, Deal 360 click, summary + funnel, pipeline filter, mobile, column picker, export
- [ ] doco_marketing/taller providers for customer/phone/device/RO columns (follow-up lane)
- [ ] lab acceptance walk
- [ ] route switch + delete DealsView
- [ ] land
