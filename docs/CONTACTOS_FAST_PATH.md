# Contactos in the Muelle shell

Binding review: `~/muelle-releases/odoo-parity-20261004/reviews/review-spec-contactos.md`.
This lane is build preparation. Publication and production activation belong to the PM.

One Vue entry point hosts Contactos and the sales module. `App.vue` loads the sales
runtime only on sales routes. The neutral HTTP gate accepts canonical Contactos and
exact retired Contact/Organization paths; it does not authorize Leads or Deals.
Source URLs use native references, never a synthetic universal partner.

The common shell owns module switching, mobile navigation, theme, session recovery
and install affordances. `ModuleLayout.vue` owns the reusable per-module sidebar,
saved entries and content frame; each module supplies its lists and actions. Future
Pendientes, Agenda, Archivos, Compras and Hoy modules register in the same shell;
this lane does not advertise their unfinished SPA routes.

Contactos writes go to Doco services and retain native row, field and link authority.
Drafts are session scoped by site and actor; explicit retries keep the same request
ID. Logout clears drafts and list return state. No summaries or offline writes are
cached. The existing service worker scope is retained; offline cold start is not
promised. Contact360 sections load individually and remain optional.

Retired identity pages and modals are adapters to the canonical route/editor.
Native administrator Forms survive. POS/Taller picker creation and commercial
transactions stay with their owners and later lanes.

## Disposable release gates

Run `.scratch/contactos-acceptance.spec.mjs` using the PM's muted disposable site,
synthetic fixture manifest and buyer/manager/admin authentication states. Preserve
the exact three repo SHAs in evidence. Verify both viewports and themes, no denied
sales boot calls for the buyer, native permissions, explicit candidate decisions,
atomic bundle rollback/replay, real Customer hooks, relation concurrency, own ToDo
completion, native notes, shared-address recovery, legacy filters and return state.

The receipt template under `.scratch/contactos-release-receipt.md` records
install/migrate-twice, owned navigation snapshots and rollback. Do not activate
navigation until the complete acceptance walk passes. 10k-record p95 and cold/warm
timings must be measured on the declared site/device/network; bounded queries are
not performance proof.

Frappe v16 metadata distinguishes [Desktop Icon External links](https://github.com/frappe/frappe/blob/version-16/frappe/desk/doctype/desktop_icon/desktop_icon.json)
from [Workspace Sidebar URL entries](https://github.com/frappe/frappe/blob/version-16/frappe/desk/doctype/workspace_sidebar_item/workspace_sidebar_item.json).
The cutover uses those native fields. Tenant-pinned `/app` aliases still require
disposable runtime reconciliation.

## Rollback

Keep the additive Docoutils schemas and newly saved relation/segment/request rows.
Disable new writers/navigation in the compatible release; keep read compatibility
and legacy redirect routes. Never roll back to an image whose module map or service
code orphans those rows. No masters are merged/deleted and no inferred links are
backfilled. Restore proof and complete guarded migration logs precede production.
