# CRM / Meta reliability and native support handoff

Source integration completed locally on 2026-09-10. Start from current shared
refs, preserving later commits. This supersedes the implementation status in the
September 9 audit/handoff and intermediate worker reports; it does not replace
requirements or grant production/publishing authorization.

## Accepted package heads

| Repository | Shared branch | Accepted source head |
| --- | --- | --- |
| CRM | `fix/social-editorial-quality`; canonical `doco-dev` | `19282436c` runtime; this handoff is an additive docs commit |
| Frappe WhatsApp | `doco-customizations` | `97e0ba1` |
| Doco Marketing | `fix/social-editorial-quality`; canonical `master` | `7dabbee` |
| Doco | `develop` | `19b5460`, preserving clinic/mail merge `588a00f` |
| Storefront | `main` | `754f0d9` |
| WhatsApp Chat fork | `doco-customizations` | `9aa805b` |

All listed packages were focused commits and local fast-forwards. No remote push,
production deployment/configuration/subscription mutation or customer send was
performed by this lane. Doco's unrelated dirty books/media/patches and the clinic
lane's disjoint work were preserved. There is no canonical branch freeze.

## Published clinic R3 cutoff and future integration

The clinic lane subsequently confirmed its separately authorized publication.
Its frozen CRM R3 cutoff is two-parent merge `e2cec7e0a`: clinic `8b8b3fc48` plus
Inquiry evidence `48abed320`. The local `origin/doco-dev` tracking ref and clinic
worktree both resolve to `e2cec7e0a`; the clinic release record reports R3 image
verification. This lane did not push or independently repeat that image proof.

Keep that published clinic history. It diverges from our completed `b08269d65`
source: three clinic-side commits and thirteen native-support-side commits after
common base `48abed320`. The clinic cutoff intentionally excludes our later
packages; those packages are committed and tested, not dirty P3/P4 work.
Marketing `751ba32` and its runtime successors are ancestors of accepted `7dabbee`.

Before any later combined publication, refresh the actual remote refs, integrate
the published clinic merge with the completed native-support history, and validate
the assembled result. Both `e2cec7e0a` and `b08269d65` must be ancestors of the new
CRM publication head. Preserve two histories rather than resetting to either tip
or rebasing already published clinic commits. Fast-forward publication remains
subject to that lane's existing authorization. The frozen clinic R3 image is not
evidence for the newer combined source; no clinic retail rollout or Meta activation
follows from source integration.

## Implemented behavior, in priority order

| Priority | Accepted behavior | Remaining boundary |
| --- | --- | --- |
| P0 authentication | Mandatory raw-body WhatsApp HMAC, exact current App/WABA/phone validation of the whole batch before writes; Demo cannot bypass public authentication | Production audit found two Active accounts without secrets; coordinated activation and owned real signed-event proof are required |
| Durable ingest | Unique scoped immutable receipts, all entries/changes/messages/statuses, after-commit scheduling, bounded leases/recovery/retry, no nested transaction-wide commit/rollback, replay/history egress holds | Live provider delivery and operational backlog monitoring remain rollout checks |
| Acquisition | Account-scoped FB/IG mentions and enrichment, explicit Lead Ads form purpose/revision, retained-event recovery, CRM Inquiry evidence with distinct people, subscription preview/apply preserving existing fields | Configured/subscribed/received/processed/captured are separate evidence; no production subscription repair was applied |
| Ownership | Private versioned Human/Bot/Paused/Closed control, current owner/role/account checks, immutable commands, takeover fence, verified human replies/provider-loss holds; pinned finite Chatflow definitions | Bot readiness remains false; provider grants never auto-enable a bot; snapshotless/history-triggered flows stay blocked |
| Outbox / delivery / health | Durable manual WhatsApp and Webchat intents, current owner/generation at physical send, bounded gateway, monotonic exact-ID delivery, explicit Unknown, legacy-send fences, scoped account health | Native Messenger core dispatch/producer eligibility and Instagram transport remain gated; no automatic Unknown resend or fabricated read acknowledgement |
| Demonstrated integration value | One storefront bubble → CRM staff queue/take/reply → visitor transcript; manager channel setup/agent prefill; finite tenant-scoped WhatsApp login OTP separate from support | Exact production store routing/enabling and owned provider delivery require rollout validation; no universal workflow engine or private-assistant reuse |

CRM Inbox and Desk **Customer Conversations** use one customer conversation/control/
outbox service. The existing private staff assistant retains its own authority.
Storefront has one help bubble with WhatsApp inside it or as the unavailable-channel
fallback. When native CRM is present, the optional old WhatsApp Chat fork suppresses
its FAB/navbar and blocks its phone-only customer APIs and notifications. Chatwoot
is retired; no dependency or new connector was added.

“CRM support” means staff helping customers in this implementation. A Muelle software
support service is not implicitly created or granted tenant access. If requested,
it can share the staff Help entry while keeping separate authorization.

## Verification

The [assembled acceptance](../coordination/meta-reliability/P6_NATIVE_SUPPORT_ACCEPTANCE.md)
contains raw checks, migration evidence, privacy findings, cleanup and rollout
details. Key outcomes:

- Eight-app Python suite: 599 discovered, 598 passed, one appropriate core-only
  absence skip. Actual Frappe+CRM installation: 37/37 passed.
- CRM frontend: 516/516 in 51 files, explicit lint and production/PWA build passed.
- Storefront: 1,308/1,308 in 126 files; check/build passed; seven HTTPS browser/
  middleware scenarios and an actual isolated CRM round trip passed. Final expiry
  timing regressions passed mounted-component tests after reproducing failure.
- Actual processes/connections/commits proved six Webchat contention/crash/takeover
  cases, the earlier 12-scenario external-outbox recovery proof and five-scenario
  legacy WhatsApp fence proof. External submissions were doubled/blocked.
- Actual Sales User Desk search → exact account → take → queued reply → worker →
  visitor reception passed. Manager saved revision, lost-create-response recovery,
  single disabled channel and unsaved exact agent-permission prefill passed at 375px.
- Doco's rebased OTP/auth-mail/mailguard suite: 95/95, including 12 actual SQL
  queue/alias recovery cases; zero retained fictional outgoing accounts.
- Optional WhatsApp Chat transition: 14 Python cases, 10 actual bundle branches
  under DOM/transport doubles, and actual core capability probe passed. That app
  was not installed in the isolated lab: no installed-app browser proof claimed.

These are distinct overlapping suites; do not add them into a unique test count.
Earlier broader Marketing legacy suites have documented fixture errors (missing
UOM and currency/network setup) outside changed paths. The 214 affected Marketing
tests passed; do not describe the unrelated suite as green.

Both isolated sites used guarded migrations with full logs and deletion review.
Three Webchat tables and the provider-message unique index exist; zero Deleted
DocTypes. Explicit Mercado card/chart recreation was checked. Only the exact
site-prefixed app_hooks keys were invalidated when stale hooks were found.
Maintenance/pause-scheduler/mute-email remain set; schedulers remain disabled.
Browser fixtures are closed/revoked/disabled and temporary servers stopped.

## Rollout gates and continuation

1. **P0 first.** Reverify account/app ownership read-only. Prepare the real app
   secret through the established secret channel and Frappe Password API. The old
   receiver starts enforcing site-wide signatures when the first secret is set:
   coordinate relevant secrets, source, cache and workers. Prove an owned genuine
   signed inbound and rejection before writes. Follow the
   [P0 procedure](../../frappe_whatsapp/coordination/meta-reliability/P0_ROLLOUT.md).
   Rollback retains authentication or holds the callback unavailable.
2. **Compatible deployment.** Use guarded migration and coordinated refresh/restart
   scripts. Inspect complete logs and same-time deletions. Publish private
   controllers, permission hooks, broker/outbox and workers as a compatible bundle;
   refresh the exact app-hooks cache and assets. Never roll back the privacy
   controller/hook bundle alone or delete audit rows.
3. **Storefront activation.** Verify actual Boat tenant/profile/cell routing,
   HTTPS, trusted proxy hop, no-store/API cache exclusion and header redaction.
   In Customer Conversations, configure the exact profile + public HTTPS origin,
   explicitly grant selected staff its channel, then enable only the intended store
   after the controlled visitor/staff journey passes. No new staff service credential
   is needed. Rollback disables that channel while preserving history.
4. **Meta subscriptions and retired Chatwoot.** Use the reviewed current App/Page
   snapshot and named additions; preserve unknown existing fields. Coordinate
   other editors because no provider CAS was demonstrated. Configuration acceptance
   is separate from delivery. Retired app `1418834030282521` remains attached to WABA
   `2954965221375122`; active app is `2082376078930469`. DELETE subscribed_apps has no
   demonstrated app_id selector: use a verified retired-app credential or reviewed
   Business Manager action, then GET-verify the active attachment and phone mapping.
   Nothing was removed by this lane.
5. **Autonomous sending.** Keep native automation readiness false until a finite
   producer uses native intents and current purpose/consent/account/provider-control
   checks, with independent crash/delivery proof. Chatflow message/template
   preparation currently blocks; local bounded actions were tested with a readiness
   double. Native Messenger's gateway exists but core dispatch is not enabled;
   Instagram's current login/token transport remains unverified. Provider grants
   never automatically resume Bot.
6. **Delivery/health.** Uncertain external submission stays Unknown and is never
   retried from body/time guesses. Verify provider-ID acknowledgements, quality/
   template events and explicit exact-phone health checks in the owned rollout.
   Legacy sends for peers without a native Conversation retain compatibility and
   are not claimed as durable native sends.

Clinic Patient/Guardian/Payer, booking, reception/care, POS and health provisioning
remain the clinic lane's contract. No chart, diagnosis or clinical attachment enters
generic CRM/marketing. Never merge people by phone/name or treat a submitted phone
as blanket consent. No clinic rollout to retail follows from this handoff. Dental
remains demo-only and inpatient unavailable until separately proven.

## Evidence map

- [Original integration handoff](CRM_INTEGRATION_HANDOFF_2026-09-09.md),
  [audit](CRM_META_COVERAGE_AUDIT_2026-09-09.md),
  [completion plan](CRM_COMPLETION_PLAN_2026-09-09.md),
  [requirements](CRM_POWERHOUSE_REQUIREMENTS.md),
  [clinic wiring](../../clinica/docs/CRM_VERTICAL_INTEGRATION.md).
- [P1 durable ingestion](../../frappe_whatsapp/coordination/meta-reliability/P1_ACCEPTANCE.md),
  [P3 acquisition](../../doco_marketing/coordination/meta-reliability/P3_ACCEPTANCE.md),
  [capabilities](../../doco_marketing/coordination/meta-reliability/P3_CAPABILITIES_RESULT.md).
- [Native external outbox](../coordination/meta-reliability/P5_OUTBOX_ACCEPTANCE.md),
  [account health](../../frappe_whatsapp/coordination/meta-reliability/P5_ACCOUNT_HEALTH_RESULT.md),
  [pinned Chatflow](../../doco_marketing/coordination/meta-reliability/P4_CHATFLOW_RESULT.md).
- [Storefront browser acceptance](../../muelle-storefront/coordination/meta-reliability/STOREFRONT_ACCEPTANCE.md),
  [expiry correction](../../muelle-storefront/coordination/meta-reliability/STOREFRONT_EXPIRY_ADDENDUM.md),
  [legacy widget transition](../../whatsapp_chat-fork/coordination/meta-reliability/NATIVE_WORKSPACE_RESULT.md),
  [OTP/alias integration](../../doco/coordination/meta-reliability/P5_OTP_AUTH_ALIAS_INTEGRATION_ADDENDUM.md).

Clinic coordination:
`~/muelle-releases/clinic-completion-20260910/META_CRM_LANE_COORDINATION.md`.
