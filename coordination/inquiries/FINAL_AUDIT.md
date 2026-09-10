# Native acquisition — Codex final audit

Date: 2026-09-09 local lab session. Verdict: **ACQ-01/02/03 implemented and accepted as a local candidate. Production release and later automation/vertical packages remain open.** Full [completion plan](../../docs/CRM_COMPLETION_PLAN_2026-09-09.md), [requirements](../../docs/CRM_POWERHOUSE_REQUIREMENTS.md) and [decision ledger](DECISIONS.md) govern the next work.

## Result

CRM now owns a native inquiry inbox independent of ERPNext, Doco, marketing, Meta, n8n or a model. Operators capture bounded URL/plain-text context, classify each person, explicitly create or link selected prospects, assign work, receive an internal assignment notification, set follow-up and close/reopen. The screenshot's three roles are handled separately: requester, referrer and another interested buyer. An alias never becomes a verified messaging identity. Referrers cannot be converted by calling the API directly.

Manual captures use an actor/request receipt and immutable payload fingerprint. Known social sources use a separate internal receipt namespace shared across staff. Repeated authorized capture/conversion returns the original result; denied staff get neither content nor another copy. Provider source identity survives renamed or duplicate inbox rows and branch reassignment. Generic saves cannot rewrite existing source identity. Missing provider identity leaves explicit manual capture available.

The marketing adapter preserves source/branch permissions and requires the CRM capability. Lead insertion has a scoped campaign-enrollment guard and compatible-marketing check: capturing a prospect does not enroll them or send a message. Read-only Page diagnostics distinguish local configuration, token/permission failure, missing subscription and subscribed-but-unverified delivery. Stored social timestamps are not webhook-receipt evidence. No claim is made that Meta exposes every Facebook group notification.

## Acceptance evidence

Evidence is retained in [verification](verification/). Logs contain fictional fixtures and technical results; credentials and site configuration files were not copied.

| Check | Result / retained evidence |
| --- | --- |
| Core DB + Forms | **57 passed**: 33 inquiry cases plus installed-app capabilities and Forms. [Log](verification/crm-inquiry-core-tests-20260909.log). Actual Frappe+CRM-only site, candidate controller/hooks, real SQL/savepoints/unique constraints. |
| Marketing | **46 passed**, including real Social Mention rename/generic rewrite, source adapter, Page token/version scope and campaign regressions. [Log](verification/crm-social-final-tests-20260909.log). |
| Frontend | **470 passed / 46 files**. [Log](verification/crm-inquiry-frontend-tests-20260909.log). Includes actual App/router/layout breakpoint regression. |
| Production assets | Build succeeds; **178 JavaScript/CSS assets precached**. [Log](verification/crm-inquiry-build-20260909.log). Existing brand-icon placeholder and bundle-size warnings remain; they do not certify other screens visually. |
| Real concurrency | Four two-connection checks: manual capture, selected-person conversion, known-source capture and stale-assignee denial. [Log](verification/crm-inquiry-concurrency-20260909.log). MariaDB deadlock losers return sanitized retry errors; only identified deadlocks are accepted. Fresh retry proves one record/lead or correct permission denial. |
| Full browser | Real built CRM shell and HTTP transactions: three fictional roles, two distinct selected leads, replay, rejected referrer conversion, follow-up date, close/reopen and reload. [Log](verification/crm-inquiry-browser-20260909.log), [desktop image](verification/crm-inquiry-browser-desktop.png). Zero JS runtime errors and zero optional-app RPCs. |
| Mobile | Visible inquiry content, no horizontal overflow, button/header/inbox/tab geometry and actual capture click. [Log](verification/crm-inquiry-mobile-20260909.log), [image](verification/crm-inquiry-browser-mobile.png). |
| Schema | Initial and permission-field migrations used the required guarded wrapper on the dedicated site. [Initial full log](verification/migrate-crm-inquiry-test-20260909.lab.xoloitzcuintles.com-20260909-190238.log), [permission full log](verification/migrate-crm-inquiry-test-20260909.lab.xoloitzcuintles.com-20260909-191534.log). Inspected full outputs: no orphan deletion, traceback or after-migrate error. |
| Lab state | Exactly `frappe, crm`; stored maintenance=1, pause_scheduler=1, mute_emails=1. [Record](verification/crm-inquiry-final-lab-state-20260909.log). No DNS/proxy publication added. |
| Source identity | [Fingerprints](verification/source-fingerprints.json) cover changed candidate source, including preceding foundation/Wave A files. They are not a claim that every earlier feature received new browser acceptance. |

The core suite blocks external requests/SMTP and rolls back test writes. Lead notification transport/realtime are mocked; persisted inquiry/lead/notification state and permissions are real. Concurrency tests own exact committed fictional fixtures and clean them up. Browser tests use fictional records on the dedicated site, a private candidate WSGI process and loopback asset proxy, real login/CSRF and normal HTTP transactions. They do not exercise a production reverse proxy, production service worker upgrade, live Meta delivery, or the full marketing+CRM acquisition journey with customer settings. Source contracts and campaign boundaries are tested separately on their relevant lab inventories.

## Audit corrections

- Protected generic child lists, generic save/read responses and separately denied lead links; removed lower-level permission messages that could expose a lead identifier. Current query engine joins authorized parents; the older child-hook denial remains a compatibility fallback.
- Current ownership is read under lock. A handoff that revokes the acting assignee returns only a minimal acknowledgment; stale UI requests and notifications cannot restore protected content.
- Capture receipts preserve the original payload even after staff edits or provider enrichment. Source capture deduplicates across actors, rename and duplicate source rows.
- Inquiry-created leads cannot trigger either lead-created or score-crossed campaign enrollment. Earlier request flags are restored even on failure.
- Exact Page selection precedes Graph-version validation; an unrelated broken Messenger setting cannot reject a valid Social Page credential.
- Initial mobile blank frame was lazy-load/animation timing. Separate visual review found a shrinkable header hiding the capture button; `flex-none` plus actual browser geometry/click verification closes that defect.
- The shared lab container restarted during work and its active source repopulated cached hooks without the candidate inquiry hooks. This reproduced permission failures. Candidate verification now uses framework hook loading from its own source through copied process-local configuration, with hook assertions. Stored configuration and shared active source were not changed to force a pass. All permission assertions remain intact.
- An initial broad test attempt encountered the unstaged optional `doco.crm` fixture and a custom-field DDL test under the commit-mocked harness. These are not recorded as passing. Relevant core/Forms acceptance was subsequently run with the exact 57-test scope above.

Independent read-only review found the mutable source-name receipt and unrelated Page-version defects; both were corrected, regression-tested and rereviewed with no remaining concrete finding in those reviewed changes.

## Release and rollback contract

New schema consists of CRM Inquiry and its child. Do not deploy candidate Python by itself and assume the generic document APIs are safe. The inquiry's owner/assignee restrictions depend on its permission hooks and controller, beyond the persisted role permissions. The lab cache incident demonstrated this dependency.

A release must stage compatible CRM and marketing versions, guard the CRM migration, refresh app-hook/metadata caches and verify every serving worker uses the same source. New-lead conversion requires the marketing capture-guard marker when that app is installed. Until the source helper is present, the optional adapter returns an actionable upgrade error.

**Rollback must retain the inquiry permission/controller bundle**, or take the feature/site out of service and restore the compatible backup/configuration. Reverting to old CRM source while leaving inquiry tables and broad role metadata live is not an accepted rollback. Prove generic list/read and denied-actor behavior after both upgrade and rollback before production release. Do not delete captured inquiries as a rollback shortcut.

The private browser servers are test harnesses, not deployed applications. Their shutdown and temporary credential cleanup are recorded in `verification/harness-cleanup.log`. The dedicated site is retained in maintenance with fictional browser fixtures for reproducibility; no customer data was imported.

## Remaining product work

- ACQ-04: actual webhook receipt durability, unique account/event ingestion, account-scoped enrichment/retry, collision migration and explicitly opted-in automatic inquiry routing. Existing `mentions._upsert` still uses a nonunique existence check and transaction-wide commit/rollback; this package protects inquiry capture from duplicate source rows but does not repair that ingest implementation.
- Production Facebook settings are unchanged. Prior read-only evidence found no matching September event and no `mention` field on the observed subscription. The native fallback is built; it does not recover an event Meta never supplied or manufacture the screenshot's lead in production.
- AUTO-01–04: durable ownership/outbox, immutable flow/run revision, bounded native action runner, honest Unknown reconciliation and committed API/SPA/Desk recovery. Earlier Wave A is useful but is not this durable runtime.
- VERT-01–03: health provisioning, verified patient/guardian/payer relationships, replay-safe clinical conversion and authorized appointment actions. Reuse Clínica services; clinical records remain outside generic CRM/marketing projections. Dental is demo-only; inpatient remains unavailable.
- EXT/UX/REL: optional signed adapters, provider recovery surface, guided recipes/reporting/overdue work, the remaining vertical/connection matrix, private attachment authorization and production canary/rollback proof.

## Ownership and attribution

Codex root owns architecture, contracts, optional social/health integration, campaign/notification review, lab execution and final audit. Codex backend/frontend builders used bounded ownership and reported material decisions; an independent Codex reviewer audited integration/privacy boundaries. Both actual Claude Fable attempts in this wave hit the account limit before editing source. The earlier marketing Wave A was built by Fable and separately audited. This wave must not be attributed to Fable.

All work remains in isolated candidate worktrees. Active application repositories and production deployments/configuration were preserved.


Local source integration follow-up: [shared branch handoff](../../docs/CRM_INTEGRATION_HANDOFF_2026-09-09.md) records focused commits, preserved unrelated edits and retirement of the temporary task worktrees. This does not imply production deployment or completion of the remaining runtime/vertical work.
