# Reports UI

Delivery checklist:
- [ ] Shared URL filters, presets and browser history
- [ ] Sales comparison, focused charts and record return flow
- [ ] Split marketing panels and isolate endpoint failures
- [ ] Filter/date/delta tests and full test suite
- [ ] Formatting, lint and heavy production build
- [ ] Review scoped diff, remove dependency symlink, commit locally

Design: tenant theme surfaces and ink, existing application typography, compact
comparison tiles followed by three decision charts. Detailed tables and operational
marketing tools live in disclosures. No additional chart library or backend changes.

Sales numbers describe creation cohorts in their current state, not cash collected
or historical stage transitions. Comparisons use an equal-length preceding cohort.
Marketing endpoints have different supported scopes; each panel states exceptions.
