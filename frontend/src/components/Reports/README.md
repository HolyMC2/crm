# Reports UI

Delivery checklist:

- [x] Shared URL filters, presets and browser history
- [x] Sales comparison, focused charts and record return flow
- [x] Split marketing panels and isolate endpoint failures
- [x] Filter/date/delta tests and full test suite
- [x] Formatting, lint and heavy production build
- [x] Review scoped diff, remove dependency symlink, commit locally

Design: tenant theme surfaces and ink, existing application typography, compact
comparison tiles followed by three decision charts. Detailed tables and operational
marketing tools live in disclosures. No additional chart library. The Marketing
tab's filter, currency and drill contract lives in
`doco_marketing/services/report_scope.py` (doco_marketing).

Sales numbers describe creation cohorts in their current state, not cash collected
or historical stage transitions. Comparisons use an equal-length preceding cohort.
Marketing endpoints report which filters reached each number; panels state the rest.

## API boundaries

- Native sales supports date, owner, pipeline and company scopes. Previous periods
  are adjacent, equal-length creation cohorts, measured in their current state.
- Source wins count won deals, not distinct customers. Stage aging is an occupancy
  metric; records with no measured age remain available in the detailed stage list.
- Every Marketing call (`doco_marketing.api.reports.*`) receives date, owner and
  pipeline. Responses list `applied_filters` / `ignored_filters`, and
  `metric_filters` where columns differ (for example sends, flows and dispatch
  carry no owner or pipeline; lead grades are current state, not a period).
  Panels show those exceptions from the response instead of fixed captions.
  Company remains a Sales-only filter. Deal-agent metrics (`ReportsAgents`)
  retain their own backend-supported week/month/year selector.
- List endpoints are asked for their envelope with `with_meta: 1`; without it
  they still return the legacy list.
- Record counts carry a server `drill` `{doctype, filters[, or_filters]}` (per
  metric under `drills`). Underlined numbers open ReportRecords, which lists
  exactly those records through `frappe.client.get_list` and
  `frappe.desk.reportview.get_count` with the viewer's permissions; the drill
  travels in the URL (`drill_doctype`, `drill_filters`, `drill_or_filters`) so
  Back and copied links return to the same records. Counts derived outside
  list filters (distinct contacts, social attribution, hygiene issues) drill by
  record names and are not offered above 200 records.
- Native forecast and missing-FX totals cannot select their exact subcohort through
  the existing record API. Their actions explicitly offer the full cohort for review.
- Money uses the existing tenant formatter with the currency the response gives
  per row or per response (document currency, else the site default). Rows whose
  documents mix currencies list each amount; nothing is converted in the frontend.

## Checks

- Unit coverage includes inclusive calendar periods, zero-baseline deltas,
  serialized query filters, debounce, browser history, exact chart buckets,
  malformed drill URLs, late-response guards and isolated marketing failures,
  plus server drill URL round-trips and rejection, shared marketing filters,
  per-metric filter notes, list envelopes and mixed-currency money.
- `npx vitest run`: 106 files, 1,081 tests passed.
- `npx prettier --check` and `npx eslint` on changed Vue/JS files: passed.
- `heavy -- npm run build`: passed in 49.47 seconds; PWA verifier confirmed 200
  JavaScript/CSS assets precached. Generated type-file whitespace was discarded.
- Backend contract: `doco_marketing.tests.test_report_filters` on the lab mirror
  checks that each endpoint applies the filters, carries currency, and that
  every drill reproduces its count through `frappe.get_list`.
- Browser appearance is **unverified**. No authenticated tenant checks were
  performed; phone overflow, dark mode and the drill round trip need a visual pass.
