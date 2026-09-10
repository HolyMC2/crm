# CRM powerhouse — implementation contract

Source status: locally integrated into the shared branches; see [integration handoff](CRM_INTEGRATION_HANDOFF_2026-09-09.md) and [next-session request](CRM_NEXT_SESSION.md). Historical isolated-candidate evidence below remains valid within its stated limits.

Owner: Codex (architecture, acceptance and final audit). Builder: Claude Fable, delegated per wave. Date: 2026-09-09. This is the full feature scope; completion is tracked per requirement and proven by evidence, never inferred from the existence of code.

**Execution status:** Native acquisition ACQ-01/02/03 is now implemented and lab-tested; see the [completion plan](CRM_COMPLETION_PLAN_2026-09-09.md) and [acquisition audit](../coordination/inquiries/FINAL_AUDIT.md).  Wave A candidate passed 201 regressions and two real-connection concurrency checks. [Codex final audit and next assignments](../../doco_marketing/coordination/FINAL_AUDIT.md) record the precise limits. Waves B–D are unbuilt; this is not an autonomous-production release.

## Business promise and success measures

An operator can capture an inquiry, identify the correct customer/case, advance a pipeline, assign the next action and complete the relevant business workflow without an external orchestrator, channel connection or model. Optional connections add ingestion, delivery and assistance. Failures leave saved work and a useful manual path available. Target Zoho/monday-class dependability for focused operational workflows before breadth of feature count.

“Never broken” is an engineering contract: no missing-addon crashes in supported journeys; no silent data loss; no fabricated delivery; no ambiguous automatic retries; visible recoverable failures; backwards-compatible rollout and tested restoration. It is not a claim of zero outages. Track duplicate/incorrect sends, next-action coverage, handoff success, recovery time, quote conversion, activated tenants and support/AI cost per completed workflow. Numeric SLOs follow a measured pilot baseline; no invented production results.

## Fixed architecture decisions

1. Keep Frappe/MariaDB/workers and the current CRM shell. Do not add another database, mandatory n8n service, Chatwoot deployment, generic code-node platform or new universal forms engine.
2. CRM owns inquiry/contact/deal truth and native record permissions. App-owned services own repair, commerce, finance and clinical operations. Doco owns the shared provider contract. Installed apps, settings, release state, permissions, paid entitlements and connection readiness are separate facts.
3. Reuse Chatflow, Chatflow Run, cadences, review queues, Marketing Send Log, channel adapters and the clinic reminder dispatcher's proven constraints. Converge their semantics; do not create a third unrelated bot engine. Keep their existing public API names compatible through adapters.
4. Core CRM requires no marketing app. Local automation must require no external API or LLM. The present marketing package has broad code dependencies; split them only after imports/hooks/schema/installation matrices prove each package can stand alone. Never merely delete `required_apps`.
5. Customer messages are opt-in behavior. Preserve existing manager approval and explicit per-flow auto settings. New automation features start disabled or draft-only. No automatic migration of old tenants into a more permissive mode.
6. Public CRM Web Forms are acquisition surfaces; Doco descriptors are operational forms; signed clinical forms stay in Clínica. Preserve each trust boundary and reuse existing storage/controllers.

## Functional requirements

### CORE — independent CRM and acquisition

- CORE-01: Lead, Contact, Organization, Deal, Task, Note, Call, filters, import, conversion and native Form journeys work on Frappe+CRM. Native status updates preserve script/lost-reason handling. Hide unavailable optional operations; never retry an uncertain addon mutation via a different endpoint.
- CORE-02: Desktop/mobile navigation and direct links degrade to native equivalents. Optional requests never fire for missing/unknown apps. Installed-but-unconfigured services show configuration state; provider outage leaves manual record work usable.
- CORE-03: Public Forms support hosted/embedded capture, conditional visibility/required fields, published-field allowlists and permission-safe preview. Client and server agree. Preserve author sessions after successful or failed Guest-option lookups. Retain imported upstream patch provenance.
- CORE-04: Manual funnel/source attribution works without inbound connectors. A WhatsApp deeplink means “opened”; an operator-reported send is distinguishable from provider acceptance, delivery and read receipt.
- CORE-05: Capability refresh is scoped to actor/context, ignores obsolete replies and updates after settings/role changes. Transient errors preserve unsaved local work; definitive revocation clears unauthorized contributions. Native authentication and backend authorization remain authoritative.

### VERT — verticals and clinic integration

- VERT-01: Support core journeys for `retail_general`, `ropa_moda`, `servicios`, `restaurante`, `repair_shop`, `clinica`. Each vertical's operational features need separate acceptance; a preset alone does not establish released functionality.
- VERT-02: Installed-app hook discovery, declaring-app import allowlist, namespaced IDs, duplicate rejection before imports, versioned bounded descriptors, fixed local component/route mapping. Merge eligible providers independently of the preferred layout. A broken provider cannot take down core CRM or disclose exception contents.
- VERT-03: Boat/Muelle explicitly install Clínica in the health bundle, Abordo carries validated profile intent, and Clínica owns initialization. Store step receipts; retries preserve later administrator overrides. Retail does not receive healthcare apps. Existing-site adoption is explicit and reversible.
- VERT-04: Current clinic presets remain `consultorio`, `dental`, `clinica`, `hospital`. Dental remains `demo_only` until its clinical release gates pass; inpatient stays unavailable. Family medicine can be a specialty template, never an invented implicit preset.
- VERT-05: Keep Lead=inquiry, Deal=opportunity/case, Contact=communication identity, Customer=billing identity, Patient=clinical identity, Repair Order=repair job. Guardian, payer and patient may differ. Phone/name/email matching only suggests candidates; it never creates, merges or rebinds verified relationships.
- VERT-06: Explicit “Link existing patient” and “Register patient and link” precede separate booking. Restricted verified relationship includes provider, authorized CRM reference, canonical target, role, verifier/time, state and origin request. The existing intake policy and controller reconciliation own Contact/Customer reuse.
- VERT-07: Conversion locks source and enforces a unique source conversion plus actor/provider/action/request receipt. Same request+payload replays original result; changed payload conflicts; simultaneous actors or request IDs cannot create duplicate conversions. A new opportunity is a distinct explicit operation. Rollback leaves no orphan Patient, Contact, Customer or Deal.
- VERT-08: Authorized schedule uses the shared agenda and canonical Patient Appointment: UTC wire times, site-local persistence, optimistic versions, resource locks and existing caps. Check both CRM and source access for rows/counts. No duplicate CRM Event/Deal per booking. Multiple cases/family members require explicit context selection.
- VERT-09: Clinical notes, diagnoses, histories, prescriptions, chart findings, images, signed forms and attachment URLs never enter generic CRM fields/comments, segmentation, exports, logs, socket payloads or browser outbox. Reception gets only a permitted operational projection. Clinical workspace navigation never silently broadens patient permissions.

### AUTO — native execution and human control

- AUTO-01: Finite actions: assign, create task, change allowlisted field/stage, wait, condition, prepare reply, send eligible message, hand off. Invoke existing permission-checked domain actions; no arbitrary doctypes, Python, JavaScript, SQL, network URLs or model-selected privileged writes.
- AUTO-02: Persist `bot`, `human`, `paused`, `closed` ownership and a monotonic version for each conversation/case. Explicit takeover/resume; one owner policy. Recheck ownership and expected version before every delayed action and at dispatch. A stale model answer loses authority after takeover.
- AUTO-03: Freeze an immutable definition/revision for each run; editing a flow does not reinterpret positional steps in active runs. Existing runs need an explicit compatibility transition; never attach today's definition retroactively without a documented decision. Deletion disables new runs and preserves audit history.
- AUTO-04: Unique origin event/execution/action identity, transactional claims, bounded step/time/retry/concurrency limits. Persist intent before executing entry steps. Scheduled and event-triggered entry points share invariants. Sweep committed but unenqueued work. Avoid site-global mutable caches or server-wide tenant locks.
- AUTO-05: Per-tenant kill switch; per-flow enable; channel switch; human approvals. Cap checks belong at execution boundaries. Visible reason codes distinguish disabled, missing configuration, denied, opted out, stale context, quota, retryable, terminal and uncertain outcomes.
- AUTO-06: First recipes: qualify inquiry and assign next task; quote follow-up that stops on reply; repair-ready/payment follow-up with human handoff. Clinic reception/reminders follow their own consent and clinical boundaries. No autonomous triage/diagnosis or sales closure logic applied to care decisions.

### SEND — delivery correctness

- SEND-01: Shared final eligibility check across Chatflow, cadence, broadcast, WhatsApp template review, free-text review and retries. Check current recipient, purpose, source permission, suppression, consent where required, ownership, provider/channel readiness and caps immediately before dispatch. A suppression/consent lookup error blocks or defers; never interprets failure as permission.
- SEND-02: Marketing permission, requested service reply, patient-reminder consent and channel suppression remain distinct. Unknown machine-generated purpose fails closed; a source label is not proof of consent. Reuse provenance and known source mappings. A human approving an automated draft does not waive opt-out or policy checks. Do not break ordinary authorized manual service replies by relabeling everything marketing.
- SEND-03: Use durable local action intent with unique identity and attempt/claim fields. An internal mutation and integration event commit atomically; publish after commit. Include opaque event ID, provider, aggregate/version, type, occurrence time, correlation/causation and bounded nonclinical payload. Consumers deduplicate and reject stale versions; origin prevents hook loops.
- SEND-04: Provider acceptance and DB commit are not one transaction. Track `unknown` after a crash/timeout where submission may have happened; do not automatically resend. Use provider idempotency/receipt lookup when actually supported. A lease expiry never proves a send failed. A record in Pending status never proves a prior submission was rejected.
- SEND-05: Distinguish draft/review, queued, claimed, accepted, delivered/read, blocked/deferred, definite failure, cancelled and unknown. Preserve Spanish legacy states through explicit mappings/compatible fields; additions need schema and every consumer audited. Never classify non-failed/Pending WhatsApp Message as sent merely because it exists.
- SEND-06: Broadcast aggregate cannot show successful Sent when automatic recipients all failed/skipped or none were sent. Partial, unresolved and terminal totals remain visible. Recurrence re-arms once per completed occurrence, never on repeated finalizer calls. Manual-channel rows never fabricate automatic delivery.
- SEND-07: Cancellation, reply, opt-out, move and reschedule supersede queued work and are checked again after claim. For already submitted external work, report the real outcome; do not claim recall. Claims/retry locks are per site and action; one slow tenant cannot block another tenant's dispatch.

### AI / EXT — optional assistance and integration

- AI-01: Model adapter returns validated structured suggestions. Tenant-scoped retrieval, allowed tools and bounded input/output/context. Conversation content is untrusted data, not authority. No cross-tenant memory or clinical context through generic CRM prompts.
- AI-02: Provider timeout, invalid output, rate limit or budget exhaustion routes to a recoverable human/draft state. Track usage and enforce per-run/per-tenant cost caps before the next billable operation. No unlimited AI promise.
- EXT-01: Native runtime uses the same events/scoped action API exposed to optional n8n or customer-owned bots. Integration credentials have narrow scopes, rotation/revocation and an audit identity. Verify webhook authenticity; deduplicate events; rate-limit and bound requests. No external bot becomes the source of truth.
- EXT-02: Do not embed n8n's editor or make commercial licensing assumptions. External adapters are independently optional. Disconnection affects that integration's work, never core CRM CRUD, manual pipelines or authorized local actions.

- EXT-03: Social referrals must support both eligible Meta mention events and explicit manual capture without a connector. Verify live subscription/coverage instead of inferring readiness from installed code. Reuse Social Mention for internal alert, ownership, original-source context and explicit create/link lead. Keep requester, recommender and additional buyers distinct; preserve anonymous/unverified identity. A single thread may yield multiple deliberately selected prospects. Never promise complete Facebook group notification coverage or auto-message on capture. See [production finding and SOC-01 acceptance](CRM_SOCIAL_REFERRAL_AUDIT_2026-09-09.md).

### UX / OPS — operability and upgrades

- UX-01: Operators can see who owns work, why it is waiting, last known delivery state, eligible recovery actions and audit history. Controls reflect actual authority; repeating “retry” on Unknown is unavailable. No false send-success toast.
- UX-02: Guided recipes before a general visual graph. Reuse existing Inbox/Chatflow/review screens; keep operational and clinical forms in their proper workspaces. Mobile, keyboard and narrow-screen flows retain core usability.
- OPS-01: Additive schema/config changes, guarded migrations, preserved active runs/records, complete migration logs, exact app module readiness and documented old/new code compatibility. No production migrations or sends during builder work. Backfill ambiguity is a decision checkpoint.
- OPS-02: Privacy-minimal metrics: run/action IDs, state, reason, duration and counts. No tokens, credentials, message bodies or clinical values in generic logs. Surface stale claims, unknown outcomes, repeated deferrals and provider failure rates. Manual recovery requires authorization and a receipt.
- OPS-03: Select upstream correctness/security/features by patch with provenance and adapted regression tests. No sweeping upstream merge alongside runtime changes. Keep schema, transport and UI changes independently reviewable.

## Acceptance and fault matrix

Use fictional fixtures, provider doubles and rollback. Never send to actual customers. An assertion that a provider double was not called is required for blocked behavior. Unit tests do not substitute for database concurrency or browser acceptance.

| Family | Required scenarios |
| --- | --- |
| Core | Bare CRM; optional app absent/unknown; addon installed unconfigured; outage/recovery; desktop/mobile/deep links; native create/edit/convert/forms/reopen |
| Access | Allowed/denied/disabled user; removed roles; source+target record restrictions; company/resource restrictions; stale capability; no counts/search/existence leaks |
| Verticals | All six presets; clinic without Taller/marketing; repair without clinic; both providers; dental toggle/hospital preset; shared-phone ambiguity; no clinical data in generic sinks |
| Delivery | Opt-out after staging; suppression error; paused owner; stale version; provider absent; template/free-text/email; review+retry+scheduled paths; empty body; changed recipient |
| Concurrency | Same request twice; changed payload; two workers/two actors/two IDs; crash before claim, after claim, after provider acceptance and before local success; lease expiry; out-of-order events |
| Recovery | Enqueue failure; edited/deleted flow; cancellation/move; quota limit; missed scheduler tick; backend restart; Unknown reconciliation without duplicate submission |
| Rollout | Old rows on new code; new additive schema on previous compatible code; no orphan DocTypes; preserved records/active runs; build/PWA completeness; canary and restoration proof |

## Build sequence, ownership and completion rules

The prior candidate already contains CORE navigation/details, upstream Forms/permission patches and read-only VERT discovery, with 434 frontend checks, 26 focused Python checks and staged generic/clinic discovery proof. Preserve it. Full fresh-site/browser/DB permission gates remain open.

1. **Wave A — immediate delivery hardening:** marketing-only additive code changes: suppression errors fail closed, fresh review dispatch eligibility, current row recheck/serialized review sends where existing DB semantics permit, per-site dispatch locks and truthful aggregate outcomes. Preserve manager approval, service-vs-marketing purpose and existing schema. If a truthful outcome requires new status schema, implement a compatible interim visible reason and escalate the schema decision; do not invent an unsupported Select value. Add focused regression tests. This is the first Fable assignment.
2. **Wave B — durable execution foundation:** schema-backed action/receipt/outbox, explicit ownership/version, immutable flow/run snapshot and Unknown reconciliation. Decide minimal reuse based on the Wave A inventory. Codex reviews schema/rollback plan before guarded lab synchronization. Migrate only via the workspace guard, never from the builder CLI.
3. **Wave C — provider actions and clinic onboarding:** explicit health provisioning and settings seed receipts; restricted identity/conversion receipts; approved domain actions and authorized schedule. No phone-based auto-linking. Separate deployment artifact readiness from app installation assertions.
4. **Wave D — product integration:** run/recovery/ownership UI, guided recipes, draft-first pilots, native local-automation dependency decoupling, optional model and external adapters. Release only actions with all applicable fault tests.
5. **Wave E — release audit:** Codex reviews diffs, runs appropriate real lab/database/browser gates, inventories remaining defects and verifies deployment/rollback artifacts. Production deployment is a separate authorized operation.

Each wave produces implementation, tests, compatibility notes, exact changed-file list, evidence and unresolved decisions. Stop a wave at its acceptance boundary, not at a claimed percentage. Do not mark later waves complete because groundwork exists. Do not leave speculative skeleton APIs advertised as released functionality.

## Fable ↔ Codex decision protocol

Use the assignment's `coordination/` directory. Fable owns `STATUS.md`, `RESULT.md`, `QUESTIONS.md`; Codex owns `DECISIONS.md`. Files are local coordination artifacts, not messages to teammates/customers.

- Escalate only: permission/consent or human-handoff semantics; new customer-visible behavior; schema/backfill/rollback ambiguity; incompatible API/schema; irreversible action; source fact contradicting this contract; failed acceptance that needs a design decision.
- A question states ID, concrete evidence, at most two options, recommendation, affected requirements and independent work remaining. No routine style/naming questions.
- Continue independent assigned work while an important question is pending. Read DECISIONS at natural checkpoints. If dependent work cannot continue, record `DECISION_REQUIRED` and return; Codex responds and resumes the next bounded CLI turn. Do not busy-poll or assume silence is approval.
- Do not start your own agent tree. Do not read outside the assignment's source allowlist or inherit unrelated conversation/memory. Preserve other workers' edits. No direct customer sends, git pushes, deployments, raw migrations, restarts, network tools or secret access.
- Codex handles external-tool approvals, test execution requiring the lab, final review and decisions. Fable reports actual checks separately from tests merely written. Defects found in final review return as a focused follow-up assignment.
