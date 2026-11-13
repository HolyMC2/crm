# CRM — Project Context

> ⚠ **Multi-agent stomping safeguard**: before any edit/restart, read [muelle/AGENTS.md → Coordination](../muelle/AGENTS.md#coordination--multi-agent-freshness-read-before-any-write). Use `bash ../muelle/scripts/muelle-restart.sh <svc> --reason "..."` not raw `docker compose restart`. Memory entries: `feedback_agent_freshness_protocol`, `feedback_restart_coordination`.

## What this project is

Frappe CRM frontend. Vue 3 + frappe-ui. The backend is Frappe Python. Scripts in
`frontend/` only; Python in `crm/` (Frappe app). No build step for Form Scripts —
they run as evaluated strings in the browser.

---

## Where to read before working

| Task | Read first |
|---|---|
| Product priorities and next delivery packages | [CRM product roadmap](./docs/CRM_PRODUCT_ROADMAP.md) |
| Product naming and icon change | [Identity brief](./docs/CRM_IDENTITY_BRIEF.md) |
| Any shell screen's layout on phones (record pages, lists, tasks) | [Mobile design references](./docs/design/MOBILE_REFERENCES.md): Google Contacts/Tasks, HubSpot, Pipedrive, with screenshots |
| Form-scripting technical backlog | [PLAN.md](./.pi/PLAN.md) |
| Stable API contracts (setFieldProperty, formDialog, helpers) | [SPEC.md](./.pi/SPEC.md) |
| Why code is the way it is (decisions, bugs fixed, history) | [ARCHIVE.md](./.pi/ARCHIVE.md) |
| Form scripting user guide | [feats/form-scripting/guide.md](./.pi/feats/form-scripting/guide.md) |
| formDialog() API reference | [feats/form-scripting/form-dialog.md](./.pi/feats/form-scripting/form-dialog.md) |

---

## Key files

### Scripting engine
| File | Role |
|---|---|
| `frontend/src/data/document.js` | `useDocument` — loads doc, wires script, patches `save.submit`, exposes triggers |
| `frontend/src/data/script.js` | `getScript` — fetches Form Script records, evaluates class via `new Function`, injects helpers, `setupHelperMethods` |
| `frontend/src/utils/scriptHelpers.js` | `createDocProxy`, `getClassNames` — extracted pure helpers |

### Field rendering
| File | Role |
|---|---|
| `frontend/src/components/FieldLayout/FieldLayout.vue` | Tab/section/column layout. Accepts `context` prop for standalone mode (no useDocument) |
| `frontend/src/components/FieldLayout/Field.vue` | Renders a single field. Calls `useDocument` unless `fieldLayoutContext` is injected |
| `frontend/src/components/FieldLayout/Section.vue` | Section with CollapsibleSection |
| `frontend/src/components/FieldLayout/Column.vue` | Column wrapper |

### Form dialog system
| File | Role |
|---|---|
| `frontend/src/components/Modals/FieldLayoutDialog.vue` | Dialog shell + standalone FieldLayout + local reactive doc |
| `frontend/src/components/Modals/FieldLayoutDialogContainer.vue` | Renders dialog entries from reactive array |
| `frontend/src/utils/renderFieldLayoutDialog.js` | `formDialog()` — pushes to array, returns Promise |
| `frontend/src/components/Modals/GlobalModals.vue` | Mounts FieldLayoutDialogContainer + other app-wide modals |

### Field transforms & validation
| File | Role |
|---|---|
| `frontend/src/utils/fieldTransforms.js` | `processField()`, `findMissingMandatory()`, `parseLinkFilters()` — pure, tested |
| `frontend/src/utils/expressions.js` | `evaluateDependsOnValue()`, `evaluateExpression()` |

### Meta & stores
| File | Role |
|---|---|
| `frontend/src/stores/meta.js` | `getMeta(doctype)` — fetches DocType meta, exposes `getFields()`, formatters |
| `frontend/src/stores/global.js` | `$dialog`, `$socket`, `makeCall` |

### Telephony (Doco fork additions)
| File | Role |
|---|---|
| `frontend/src/components/Telephony/TwilioCallUI.vue` | Twilio Voice JS SDK Device wrapper. **Patched**: `initDeviceAfterGesture()` defers `new Device(token)` until first user gesture so browser autoplay policy doesn't block AudioContext |
| `frontend/src/components/Telephony/CallUI.vue` | Multi-medium router (`twilio` / `exotel`), simultaneous-ring wiring |
| `frontend/src/components/Modals/CallLogDetailModal.vue` | **Patched**: `<audio v-if="field.value">` guard so empty `recording_url_path` doesn't trigger browser "Cannot play media... text/html" warning |
| `crm/integrations/twilio/api.py` | `voice()` + `sip_voice()` webhooks. `_normalize_e164()` strips MX 521 prefix + prepends +52 to bare 10-digit numbers before TwiML dial |
| `crm/integrations/twilio/twilio_handler.py` | `IncomingCall.process()` routes to SIP, Computer, or PSTN device per agent. `generate_twilio_parallel_response()` rings multiple endpoints simultaneously. Per-account routing supports the `enable_sip_phone` flag |
| `crm/fcrm/doctype/crm_telephony_agent/` | Extended with `sip_username`, `sip_password`, `call_receiving_device='SIP Phone'` option |
| `crm/fcrm/doctype/crm_twilio_settings/` | Extended with `enable_sip_phone` toggle + `sip_domain` |

### Repair / Doco custom
| File | Role |
|---|---|
| `frontend/src/components/PatternPad.vue` | SVG 3×3 draggable phone-unlock pattern. v-model is the same `1-2-5-8-9` dash-string the legacy text input emitted; pointer-event based, works on mouse + touch + stylus |
| `frontend/src/components/Modals/RepairOrderInlineForm.vue` | Inline Repair Order form inside Deal modal. Uses PatternPad when `unlock_method === 'pattern'` |
| `frontend/src/components/Modals/DealModal.vue` | Deal create/edit modal; mounts RepairOrderInlineForm in repair-shop vertical |

### Call log automation (Doco fork additions)
| File | Role |
|---|---|
| `crm/fcrm/doctype/crm_call_log/crm_call_log.py` | **Patched**: `on_update` hook bumps `modified` on every linked CRM Lead/Deal so a fresh call moves the record to the top of "Last updated" sorts |

---

## Tests

```bash
cd frontend
yarn test:run      # single run
yarn test          # watch mode
```

- All must pass before committing; `npx vitest run tests/unit/<file>` runs one file
- Location: `frontend/tests/unit/`
- Only pure utility functions are unit-tested (no Vue component tests yet)
- Add tests in `tests/unit/` when adding pure logic to `src/utils/`

---

## Rules and what enforces them

When a correction repeats, fix the enforcement, not just the rule text. A row whose
status says gap has no check yet.

| Rule | Enforced by | Status |
|---|---|---|
| Colour utilities name a token the installed frappe-ui defines (no `text-ink-white`, `bg-surface-modal`, or missing shades) | `frontend/tests/unit/colorTokensGuard.test.js` | enforced |
| Text reads at least 3:1 on what it sits on, in light and dark mode. frappe-ui 1.0 chromatic inks 1–4 are tints, not text: error text is `text-ink-red-6` on the page and `-7` on a red tint; white reads on -6/-7 fills, not on -8/-9 in dark mode | `frontend/tests/unit/labelContrastGuard.test.js` measures the installed tokens; each failure prints both ratios and the class to write | enforced for a class string with one fill and one text colour, and for chromatic text with no fill (measured on surface-base); a fill set on a parent element is not seen. Exceptions go in its `EXCEPTIONS` list with a reason, an expiry and an approver |
| Every file that renders `<Tabs>` maps its items through `indexTabs` (frappe-ui needs `value`) | `frontend/tests/unit/tabsIndexGuard.test.js`; the failure names the line to write | enforced per file |
| A failure reaches the screen through `utils/errorText.js`, never `error.message` (frappe-ui's message is the request) | `frontend/tests/unit/errorText.test.js` | enforced |
| A row that wraps a `<Dropdown>` answers Enter with `.self` | `frontend/tests/unit/dropdownEnterGuard.test.js` | enforced |
| Checkboxes keep `--radius-1` (`rounded-4` reads as a radio button) | `frontend/tests/unit/checkboxRadiusGuard.test.js` | enforced |
| An English msgid that needs two Spanish words carries a context with its es.po entry | `frontend/tests/unit/translationCollisions.test.js` | enforced |
| The daily /crm routes speak es-MX: every `__()` string has a msgstr, no hard-coded English | `frontend/tests/unit/dailySpanish.test.js` | enforced on the daily routes |
| `src/vendor/**` byte-matches its package | `frontend/scripts/verify-vendor.mjs` (prebuild) | enforced |
| Prettier 3.2.5 and ruff 0.8.1 layout | `scripts/ci/local.sh` pre-commit step, at land | gap at commit time: the repo's pre-commit hook is not installed in a clone (`.git/hooks` holds only samples), so layout fixups arrive as late `style:` commits |
| `src/components/ui/**` is the vendored @muelle/ui kit: change the package and re-vendor, never edit here | «DO NOT EDIT» header and the re-vendor practice | no crm check; hand edits stopped when vendoring began (2026-10-28), and a re-vendor re-stamps every file |
| `nosemgrep` suppressions name a reason | the comment itself | gap: no expiry date or approver recorded |

## Commit style

```
feat: short description
fix: short description
refactor: short description
test: short description
docs: short description
```

Multiple logical commits per PR — one commit per coherent change, not one giant commit.
Every lane adds a CHANGELOG entry at the top of `CHANGELOG.md` (union-merged; never hand-resolve it).
Pre-commit hooks run prettier + eslint + oxlint automatically. If they modify a file,
`git add` the file again and re-commit.

---

## Docs structure

```
PLAN.md          — future only (phases 3B, 4, 5, 6)
SPEC.md          — stable contracts
ARCHIVE.md       — completed phases + decision rationale
feats/           — user-facing feature docs
archives/        — old docs preserved verbatim
```

When a phase completes: move its spec from PLAN.md to ARCHIVE.md, update SPEC.md if
the API surface changed.

---

## Companion repos (cross-links)

- [`../taller/AGENTS.md`](../taller/AGENTS.md) — Repair Order doctype + `create_and_link_repair_order` REST endpoint called from `DealModal.vue`. Owns the `update_repair_summary_fields` denorm that populates `Dispositivo` + `Tipo de Reparación` columns in the Deal list view.
- [`../whatsapp_chat-fork/AGENTS.md`](../whatsapp_chat-fork/AGENTS.md) — Desk chat bubble UI. Exposes `whatsapp_chat.api.deal_contacts.get_deal_whatsapp_contacts` (whitelisted) which fcrm's `Activities.vue` consumes for the multi-Contact tab strip.
- [`../doco_meta_catalog/AGENTS.md`](../doco_meta_catalog/AGENTS.md) — planned bridge: ERPNext Item → Meta Commerce Catalog. Will eventually receive cart-message webhooks that create draft Sales Orders linked to fcrm Deals.
- [`../doco/`](../doco/) — Doco overrides, vertical config, observability
- [`../muelle-host/AGENTS.md`](../AGENTS.md) — root stack map; read first in a fresh session

## Memory (read-only, persists across sessions)

- `~/.claude/projects/-home-holymc2/memory/project_fcrm_twilio_sip.md` — Twilio voice + SIP softphone routing (this repo owns the integration code)
- `~/.claude/projects/-home-holymc2/memory/project_doco_whatsapp.md` — WhatsApp stack (Activities WhatsApp tab lives in this repo)
- `~/.claude/projects/-home-holymc2/memory/feedback_layered_architecture.md` — layered controllers + thin api.py rule
- `~/.claude/projects/-home-holymc2/memory/feedback_verify_before_commit.md` — verify before commit rule
- `~/.claude/projects/-home-holymc2/memory/feedback_hotfix_lab_first.md` — hotfix on lab first rule

