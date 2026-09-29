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
marketing tools live in disclosures. No additional chart library or backend changes.

Sales numbers describe creation cohorts in their current state, not cash collected
or historical stage transitions. Comparisons use an equal-length preceding cohort.
Marketing endpoints have different supported scopes; each panel states exceptions.

## API boundaries

- Native sales supports date, owner, pipeline and company scopes. Previous periods
  are adjacent, equal-length creation cohorts, measured in their current state.
- Source wins count won deals, not distinct customers. Stage aging is an occupancy
  metric; records with no measured age remain available in the detailed stage list.
- Marketing source/funnel/KPI calls accept dates and user. Campaign, social,
  scorecard and flow calls accept dates only. Hygiene is live and supports owner;
  dispatch uses its existing seven-day window. Deal-agent metrics retain their own
  backend-supported week/month/year selector. Captions state these exceptions.
- Marketing aggregates do not expose generic record drill endpoints. Campaign and
  hygiene rows link to real records; aggregate-only values remain read-only.
- Native forecast and missing-FX totals cannot select their exact subcohort through
  the existing record API. Their actions explicitly offer the full cohort for review.
- Money uses the existing tenant formatter and response currency when supplied.
  Marketing responses currently omit currency; those panels retain the tenant
  formatter's default. No currency conversion is invented by the frontend.

## Checks

- Unit coverage includes inclusive calendar periods, zero-baseline deltas,
  serialized query filters, debounce, browser history, exact chart buckets,
  malformed drill URLs, late-response guards and isolated marketing failures.
- `npx vitest run`: 106 files, 1,067 tests passed.
- `npx prettier --check` and `npx eslint` on changed Vue/JS files: passed.
- `heavy -- npm run build`: passed in 50.87 seconds; PWA verifier confirmed 199
  JavaScript/CSS assets precached. Generated type-file whitespace was discarded.
- Browser appearance is **unverified**. The fixture harness failed to load its
  chart import, and the corrected optional rerun remained queued behind shared
  work. It was cancelled to finish this bounded task. No authenticated tenant
  checks were performed; phone overflow and dark-mode appearance need a visual pass.
