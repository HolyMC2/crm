# FCRM Excellence Spec — camino a CRM top-of-class

**Date:** 2026-07-25 · **Owner:** Marco · **Scope:** crm fork (`doco-dev`) + `doco_marketing` backends · **Status:** proposal

The bar: beat the tools our market actually uses — Kommo, respond.io, HubSpot mobile —
*for WhatsApp-first Mexican SMB sales*, and be unbeatable where they can't follow:
taller (repairs), saldo/recargas, CFDI facturación, POS, payments — all in one thread.

Benchmarks referenced: Kommo (WhatsApp CRM UX), respond.io (inbox ops), HubSpot
(pipeline/reporting polish), Attio (speed/keyboard), Close (calling workflows).

---

## 0. Where we already win (shipped, keep sharp)

- Omnichannel inbox (WA + Messenger + FB comments) with review-gated sends (MA-1),
  auto-acuse review, provenance, unified customer thread, SLA + score in queue.
- Deal workspace: Conversación/Actividad/Reparación, catálogo picker, quotes,
  sales docs + saldo chip, bitácora cross-channel ledger.
- 2026-07-25 mobile rounds: tab bar, drawer reskin + dark mode + apps switcher,
  single-pane stacks with hardware-back, swipe gestures, queue cache + skeletons,
  tap/motion polish, PWA (upstream vite-plugin-pwa, now green-themed + shortcuts).
- Verticals no competitor has: taller repair orders in the deal, saldo/recargas,
  CFDI (EMC), POS (posawesome), campaigns single-engine, HRMS shifts.

## 1. Pillar: Native-grade mobile (finish the job)

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 1.1 | **Web Push notifications** | #1 gap vs native apps: new WA message → phone banner even with browser closed. Sales lives or dies on response time (SLA data proves it). | VAPID keys per bench; `Push Subscription` doctype in doco_marketing; subscribe flow in SPA (Notification.requestPermission from a settings toggle, NOT on load); `pywebpush` fired from the existing `whatsapp_message_in` hook + SLA-overdue escalations; deep-link `/crm/inbox?deal=`. SW already exists (workbox) — add push+notificationclick handlers via `injectManifest`. | **M (3-5d)** |
| 1.2 | Voice notes in composer | WA parity — half of MX customers voice-note; agents must answer in kind. | MediaRecorder → ogg/opus upload → existing attach path (`content_type: audio`). Waveform optional later. | S (1-2d) |
| 1.3 | Camera-direct attach | One tap photo of the repaired equipo. | `<input capture="environment">` option in the + menu. | S (<1d) |
| 1.4 | Offline outbox | Dead zones in tianguis/bodegas: type → queue → auto-send on reconnect. | Persist pending sends (IndexedDB), flush on `online`/socket reconnect; optimistic bubble already exists — add "pendiente" state. SW Background Sync as enhancement. | M (2-4d) |
| 1.5 | Keyboard-aware composer | DONE 2026-07-25 (thread pins to tail when keyboard opens). | — | done |
| 1.6 | Pull-to-refresh + haptics | DONE 2026-07-25. | — | done |
| 1.7 | App shortcuts + install nudge | Long-press icon → Inbox/Leads; gentle "instala la app" banner after N visits (beforeinstallprompt). | Manifest shortcuts DONE; banner S. | S |

## 2. Pillar: Inbox ops depth (respond.io parity)

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 2.1 | **Snooze / recordar** | Conversations that wait ("me pagan el viernes") pollute the queue or get lost. Snooze till date → auto-resurface + optional auto-reminder to customer. | `snoozed_until` on the queue row source (deal-level field); queue filters it; scheduler resurfaces + optional templated nudge through MA-1 gates. | M (2-3d) |
| 2.2 | **Etiquetas** on conversations | Triage beyond stage: "urgente", "garantía", "mayoreo". Filter chips in queue. | Reuse CRM's tag/label doctype (`_user_tags` or CRM Tag) surfaced in queue API + chips row. | S-M (2d) |
| 2.3 | **Auto-assignment engine** | Today assignment is manual; scale needs round-robin / load-based / shift-aware routing of "Sin asignar". | Routing rules in doco_marketing (per-channel, per-shift via HRMS rotation, cap per agent); audit trail; manual override stays. | M-L (4-6d) |
| 2.4 | Collision detection | Two agents answering the same thread = embarrassing double-replies. | Socket presence: "X está viendo/escribiendo" strip in thread; soft-lock on composer focus broadcast. | M (2-3d) |
| 2.5 | SLA escalation notify | Overdue conversations should chase the manager, not wait to be found. | Scheduler → notification + (post-1.1) push to supervisor; per-tenant thresholds. | S (1-2d) |
| 2.6 | Global message search | "¿dónde quedó lo del Realme?" — search across all threads, not just queue names. | Backend LIKE/FTS over WhatsApp Message + Comment scoped by permissions; results deep-link into thread at match. | M (3d) |
| 2.7 | In-thread search + date jump | Long threads are unnavigable. | Client-side over loaded pages + backend paged fetch-around-date. | S-M |
| 2.8 | IG DMs channel | Next provider (memory: next-bets). Same WABA-style plumbing via Meta Graph. | Extend frappe_whatsapp-style connector or Meta inbox app in doco_marketing; token gates apply. | L (1-2w) |
| 2.9 | Email into the omnichannel thread | Email exists in Actividad but not as a first-class channel tab. | Channel tab + send path via `frappe.sendmail` (audit fixed it); per-tenant ESP = wiring W2 dependency. | M |

## 3. Pillar: Speed & reliability (Attio feel)

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 3.1 | **Virtualized lists** | 967-row queue + big lead lists on a phone = jank + memory. | `vue-virtual-scroller` (or hand-rolled windowing) for queue + LeadsView/DealsView rows. Keep roving tabindex working. | M (2-3d) |
| 3.2 | Idle prefetch of hot chunks | First tap into Deal/Inbox pays chunk latency. | `requestIdleCallback` → dynamic import of Inbox/Deal360/Activities chunks after landing paint. Also fixes part of the cold-load 429 burst (pace it). | S (1d) |
| 3.3 | Thread media lazy-load + thumbs | Image-heavy threads load MBs. | `loading="lazy"` + backend thumbnail size for chat images (frappe image API supports). | S-M |
| 3.4 | Offline/queue-degraded banner | Silent socket death = "no me llegan mensajes". catchUpInbox exists; surface it. | Tiny banner on `navigator.onLine` false or socket disconnected >10s; auto-clears. | S (1d) |
| 3.5 | 429 first-load fix (known) | api_zone 60r/s vs SW precache burst (memory: reference_crm_spa_headless_test_429) hits real cold users too. | Raise/carve `assets` out of api_zone in proxy template + pace SW precache (workbox `concurrency`). Needs muelle-restart proxy on rolls. | S (1d, infra) |
| 3.6 | Frontend error telemetry | We only see errors users screenshot. | Reuse posawesome telemetry pattern: window.onerror/unhandledrejection → doco endpoint, sampled, PII-scrubbed. | S-M (2d) |
| 3.7 | Optimistic status/task updates | Stage change + task done still round-trip before UI moves. | Apply locally, reconcile on response, toast+revert on error (send path already does this). | S (1-2d) |

## 4. Pillar: Sales automation (close more, type less)

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 4.1 | **Cobrar en el chat** | The killer loop: quote → payment link → paid → deal won, all in-thread. Competitors stop at "send a link manually". | Button in SalesDocs/Quote: create mercadopago/conekta link (connectors EXIST), send via WA template (MA-1 gated), webhook flips deal + saldo chip. Prod gate: mp secrets pending. | M (3-4d) |
| 4.2 | 1:1 cadencias (follow-up sequences) | "No contestó" → auto 3-touch sequence (day 1/3/7) with stop-on-reply. Campaigns engine exists for bulk; personal cadences are the gap. | Reuse doco_marketing campaign steps scoped to single deal; enrollment from thread ("Iniciar seguimiento"); all sends through review gates until trusted. | M-L (4-6d) |
| 4.3 | Dedupe & merge | Same customer, 3 leads (phone variants). Score/attribution fragment. | Normalize phone (E.164 — WABA tracker strip trap noted in memory), duplicate detector surfacing merge UI; frappe merge API under the hood. | M (3d) |
| 4.4 | Post-call prompt | After telephony call ends: modal "resultado?" → log + next task in 5s. | Hook telephony call-end event (Twilio integration exists) → quick-action sheet. | S-M (2d) |
| 4.5 | Won/lost flows | On Ganado: auto-offer factura (EMC) + review request template; on Perdido: reason taxonomy already exists — add win-back cadence enrollment. | Status-change hooks → action sheet. | S-M |

## 5. Pillar: AI copiloto (drafts exist — make them ambient)

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 5.1 | **Suggested replies in composer** | doco_marketing AI drafts exist behind Aprobar; surface 1-tap suggestion chips inline (still send-gated where policy demands). | Endpoint: thread tail → 2-3 short suggestions; chips above composer; accepted → canned-style attribution for audit. | M (3d) |
| 5.2 | Thread resumen on open | 80-message thread → 3-line summary + open items, cached per last-message. | Summarize endpoint (Ollama local at 172.17.0.1:11434 for cost-free, or API); cache on WhatsApp Message count. | M (2-3d) |
| 5.3 | Intent → action | catalogSuggest exists (price asks). Extend: detect "quiero factura" → CFDI action, "cuánto por reparar X" → taller quote flow. | Intent classifier over inbound; action chips in thread. | M-L |
| 5.4 | Score explainability + tuning | Score Rules exist; agents don't trust numbers they can't read. | "por qué B·62" popover (rule hits); monthly backtest vs outcomes report. | S-M |
| 5.5 | Call transcripts | Deferred from P4 audit; recordings exist in call drawer. | Whisper (local/API) → transcript in call doc → searchable (2.6). | M |

## 6. Pillar: Vertical superpowers (the moat)

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 6.1 | Repair status auto-updates | Taller state changes ("listo para entregar") → templated WA to customer, review-gated. Evidence gates memory: Bloquear LIVE. | Hook taller RO status → template map → MA-1 queue. | S-M (2d) |
| 6.2 | Factura desde el chat | "Mándame factura" → EMC flow prefilled from deal's sales docs; RESICO-first (contaduría memory). | Action chip → EMC redesign surfaces (LAB-LIVE branch) once merged. | M (dep: EMC branch) |
| 6.3 | Saldo/recargas in-thread | Customer tops up via chat; RQ latency fix already mapped (memory 07-24). | Action → posawesome/saldo API; hold-until-confirm exists. | M (dep: queue fix) |
| 6.4 | Storefront ↔ CRM loop | Webshop order → deal thread w/ context; abandoned cart → cadence (4.2). | Storefront webhooks → doco_marketing; attribution fields exist. | M |

## 7. Pillar: Team & management

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 7.1 | Per-agent inbox analytics | First-response time, resolution, sends/agent, SLA hit rate — Reports has org-level; managers need per-agent + trend. | Extend api.reports with per-agent aggregates; manager-gated (auditor verified gating pattern). | M (2-3d) |
| 7.2 | Workload view + rebalance | Who's drowning? Drag conversations between agents. | Queue grouped by assignee + bulk reassign (pairs with 2.3). | S-M |
| 7.3 | Shift-aware everything | HRMS rotation is LIVE — inbox routing (2.3), SLA clocks pause off-shift, push quiet hours (1.1). | Read rotation API in routing/SLA calc. | M |
| 7.4 | Coaching mode | Manager annotates a thread privately ("aquí ofrece el combo"). | Private-note type visible only to roles; ties into provenance. | S |

## 8. Pillar: Platform & quality

| # | Feature | Why | How | Effort |
|---|---------|-----|-----|--------|
| 8.1 | **es-MX i18n completeness** | UI mixes EN ("Notifications", "Dark mode", "Send Template") — unacceptable for top-class MX product. All strings use `__()` — the CSV is just incomplete. | Extract new msgids → `crm/locale/es.csv` (+ doco_marketing); CI check for untranslated new strings. | S (1-2d) |
| 8.2 | Per-tenant branding | Green #16a34a is hardcoded ~20 places; mumu shouldn't be doco-green forever. | CSS var `--brand` set from settings brand color at boot; replace hex with var. Manifest stays per-build (limitation: one theme_color). | S-M (2d) |
| 8.3 | Frontend test harness | 0 JS tests today; regressions caught by Playwright-by-hand (this week proved it). | Vitest + component tests for composables (inbox state machine, swipe, cache) + 3-4 Playwright smoke flows in CI on lab. | M (3-4d, then ongoing) |
| 8.4 | a11y pass | Roving tabindex exists in queue (good); tab bar/drawer need aria-current/labels audit; swipe actions all have button equivalents (keep as rule). | Axe run + fixes. | S-M |
| 8.5 | Rebase-clean debt | Mobile rounds touched upstream files (Activities, WhatsAppBox, App.vue, session.js…). Fine per-line but document every touch. | `docs/doco/UPSTREAM_TOUCHES.md` ledger + review at each upstream rebase. | S (½d) |

---

## 9. Recommended sequencing

**P0 — "se siente app, nunca pierdo un cliente" (next 2 weeks)**
1.1 Web Push (the single biggest gap) · 3.4 offline banner · 3.1 virtualized queue ·
8.1 es-MX sweep · 1.2 voice notes · 3.5 429 fix · auditor CRITICAL/HIGH fixes.

**P1 — "opero más rápido que con el teléfono en la mano" (weeks 3-6)**
2.1 snooze · 2.2 etiquetas · 2.3 auto-assignment (+7.3 shift-aware) · 4.1 cobrar
en el chat · 5.1 suggested replies · 2.4 collision · 8.3 test harness · 1.4 offline outbox.

**P2 — "nadie más puede ofrecer esto" (quarter)**
4.2 cadencias · 6.1-6.4 vertical loops · 5.2/5.3 AI resumen+intent · 2.8 IG ·
7.1 manager analytics · 8.2 per-tenant branding · 2.6 global search.

**Dependencies / gates (from memory):**
- Lab WA token undecryptable → all send-path features test on mirror with mock or on prod window with Marco.
- Meta: 7 templates pending approval; token extend+swap pending (mumu).
- mp/conekta prod secrets pending (4.1). EMC facturación branch needs migrate (6.2).
- vigia/monitoring restore pending → 3.6 telemetry lands into what? (dockervm stack DOWN since 07-06).
- Prod rolls remain gated: `crm-push-prod.sh --yes` on Marco's signal.

## 10. Non-goals (explicit)

- No native Android/iOS wrapper (Capacitor) while PWA + push covers 95% — revisit only if Meta/OS policy forces it.
- No parallel chat product — the CRM thread IS the chat.
- No AI auto-send anywhere: every AI/automation send stays behind MA-1 review gates until a tenant opts out per-flow (SaaS defaults ownership: boat can't-weaken policy).
