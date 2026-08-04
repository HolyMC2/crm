# Track B merge — `upstream/develop` @ `177a781e` into `doco-dev` @ `601d32b3`

Branch `trackb/merge`. Single merge commit. Nothing pushed.

Goal of this commit: **the tree builds.** Render correctness is explicitly out of scope —
114 of our frontend files import frappe-ui and merged clean while being semantically
untouched by the espresso v2 token rewrite. Those are inventoried, not fixed, in
`W0-inventory.md` (session scratchpad).

## Conflicts: 21, not the 18 predicted

The three extra are `crm/integrations/api.py`, `crm/permissions/org_hierarchy.py` and
`crm/permissions/test_org_hierarchy.py`. They conflict because Track A cherry-picked
those same upstream commits with local modifications; the full history now brings the
originals back. Phase 1 measured the conflict surface against `doco-dev` *before* Track A
landed.

## Non-trivial resolutions

### Backend

**`crm/hooks.py`** — both sides append to `permission_query_conditions` and
`has_permission`. Kept both: ours adds `CRM Call Log`, upstream adds `CRM Notification`.

**`crm/integrations/api.py`, hunk 1 (IPv6 Host header)** — **upstream wins.** `urlparse`
returns IPv6 hostnames unbracketed, so our `f"{parsed.hostname}:{parsed.port}"` emits a
malformed `::1:443`. Upstream brackets it. This is upstream fixing a bug we also have.

**`crm/integrations/api.py`, hunk 2 (buffered vs streamed recording)** — **upstream wins,
reversing a Track A decision.** Track A kept our buffered
`Response(data=…, mimetype="audio/mpeg")` because upstream's Range-passthrough streaming
arrived in a separate commit we had not taken. That reason has expired — we are now taking
all of `upstream/develop`. Checked before switching: nothing in `frontend/src` calls
`get_recording_url`; the consumer is an `<audio>` element bound to `recording_url_path`,
which is exactly what Range support serves (duration readout + seeking). Upstream's version
still routes through the SSRF-safe `_fetch_recording` we hardened in Track A, and closes
the pinned session in the generator's `finally`.

**`crm/permissions/org_hierarchy.py` + `test_org_hierarchy.py`** — ours, unchanged. Both
are pure additions (`get_call_log_permission_query_conditions` and its namespacing
assertion) with no upstream counterpart; they conflicted only on shared context.

**`crm/patches.txt`** — took upstream's `set_persona_captured_for_existing_sites` and
`reorder_address_quick_entry_layout`, kept ours (`create_message_provenance_fields`),
**dropped `add_enrichment_fields_to_layouts`** (enrichment, excluded). Upstream's block is
placed first so future upstream appends stay contiguous.

**`fcrm_settings.json`** — union of both field sets. `field_order` and `fields` verified
equal-length and mutually consistent (31/31) after resolution.

### Frontend

**`frontend/package.json`** — took upstream's dependency block wholesale (frappe-ui
`0.1.261` → `1.0.0-beta.29`, TipTap 2 → 3), kept our `qz-tray` and `@playwright/test`,
took upstream's superset of `resolutions`. Note `brace-expansion: 2.1.0` in that superset
— that is plausibly the fix for the long-standing `brace_expansion_1.expand is not a
function` PWA glob crash documented in `reference_crm_spa_build_lab`.

**`frontend/yarn.lock`** — took upstream's wholesale rather than hand-merging, then deleted
the `@framework/ui@link:../../frappe/ui` entry.

**`frontend/src/utils/dialogs.jsx`** — **took upstream's API, kept our behaviour.**
frappe-ui v1 replaced `Dialog`'s `options` + `modelValue` with discrete props
(`title`/`size`/`icon`/`position`/`actions`) and `open` + `onUpdate:open`. Our
`confirmDialog` contract depends on `onClose` firing on every non-confirm close (X,
backdrop, Esc) so `onCancel` resolves, so that callback is carried onto the new
`onUpdate:open` handler. This is a shared-layer file; leaving it on the dead 0.x API would
have broken every dialog in the app.

**`Activities.vue`** — kept our named socket handlers and **added** upstream's new
`docinfo_update` / `doc_subscribe` wiring alongside them. Our named-handler fix is
strictly better than upstream's blanket `$socket.off('whatsapp_message')` (which still
removes *every* subscriber's listener — the documented bug at `Activities.vue:1145`), but
upstream's live-comment sync is genuinely new and does not overlap our WhatsApp/Messenger
handlers. Both `handleDocinfoUpdate` and our `openTemplateReview` kept — the third hunk
was a rename collision (`sendTemplate` → `openTemplateReview`) where the shared body below
is ours.

**`CallLogDetailModal.vue`** — **combined**, `v-if="field.value && !recordingError"`.
Both sides independently added a missing-recording fallback. Ours alone leaves a 404'd
recording rendering a dead `<audio>`; upstream's alone renders `<audio src="">` when there
is no URL at all. The conjunction is what both were reaching for.

**`DealModal.vue`** — union of imports. Both `FormControl` (4 template uses) and `call`
(line 274) are genuinely referenced.

**`MobileSidebar.vue`** — ours wholesale (`--ours`). Upstream reduced this file to a thin
`<AppSidebar mobile />` wrapper; ours is a complete custom drawer (brand header, nav model
shared with `DocoNavRail`, saved views, apps grid, push/theme/sign-out footer).

**Four `Activities/*Area.vue` files** — ours. Upstream extracted a `TimelineTimestamp`
component driven by the new `crm_timeline_timestamp_format` setting; ours renders
`timeAgo · formatDateTime` under a full-timestamp `Tooltip`. Verified all four helpers
(`timeAgo`, `formatDate`, `formatDateTime`, `formatTimestampFull`) survived the auto-merge
of `utils/index.js`, so keeping ours is build-safe. Upstream's `TimelineTimestamp.vue` is
merged in and currently unused — a later wave can adopt it.

**`ActivityHeader.vue`, `WhatsAppArea.vue`, `DesktopLayout.vue`, `MobileLayout.vue`** —
ours. These carry our Messenger tab title, provenance badges + full WhatsApp receipt set,
`DocoNavRail`, and the mobile side-scroll fix. Upstream's side of each was espresso token
churn, which is a later wave's job.

## Exclusions applied

| Exclusion | How |
|---|---|
| `domain_enrichment` | Source **kept** under `crm/domain_enrichment/` so future merges stay clean, but **unwired**: removed from `crm/modules.txt` (so `bench migrate` never syncs its 8 doctypes), its 3 `doctype_js` entries and `after_migrate` seeder removed from `hooks.py`, and `add_enrichment_fields_to_layouts` dropped from `patches.txt`. |
| `crm.telemetry.capture_feature_state` | Removed from the `daily` scheduler in `hooks.py`. `crm/telemetry.py` remains on disk, unreferenced. |
| `tldextract>=5.0.0` | Dropped from `pyproject.toml` — enrichment-only. `requests>=2.28.0` **kept**: imported directly by `crm.integrations.api`, `crm.integrations.exotel.handler`, `crm.api.exchange_rate` and `crm_exotel_settings`. |
| New locale files | `crm/locale/bg.po`, `uz.po` merged in as inert data. Only `es.po` matters to us; it auto-merged and must be compile-verified, not eyeballed. |
| frappe-ui submodule | `.gitmodules` gitlink merged, left uninitialised. `vite.config.js` only takes the local-submodule path when `isDev`, so a production build falls through to the npm package. |
| `@framework/ui` | Dependency removed from `package.json`, alias removed from `vite.config.js`, content glob removed from `tailwind.config.js`, lock entry removed. Zero source files ever imported it. |

Kept deliberately: `add_default_scripts` and `add_web_form_custom_fields` in
`after_migrate` (generic forecasting/web-form seeders, not enrichment), and
`set_persona_captured_for_existing_sites` (suppresses the onboarding persona prompt on an
existing site — what we want).

## Deleted components: the Phase 1 prediction was wrong

Phase 1 called this "the single most important trap in the whole sync" — four files
importing three deleted components. **After the real merge, one importer remains.**

`SalesHierarchyBanner.vue` turns out to be *upstream's* component (`454e8414`, authored
May 2026, an ancestor of our merge base), not ours. And we never modified
`AppSidebar.vue`, `UserDropdown.vue` or `Settings/Settings.vue` at all —
`git diff 91996b8f HEAD` on those three is empty. So upstream deleted its own components
and updated its own importers in the same commits, and those updates merged in cleanly.

The one real casualty is `SidebarLink`, imported by **our** rewritten
`MobileSidebar.vue:258`. `frontend/src/components/SidebarLink.vue` is restored from
`doco-dev` to keep the tree building; replacing it properly is W1-base's call.

`Apps.vue` and `SalesHierarchyBanner.vue` are left deleted — nothing references them.
Recorded divergence: `AppSidebar.vue` (now upstream's rewrite) is unreachable in our fork
and was already unreachable before this merge, so the sales-hierarchy banner it hosted was
already dead code. Re-enabling `AppSidebar` later would need the banner re-added.
