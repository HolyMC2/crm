# Native customer support: assembled acceptance

2026-09-10. Root acceptance of the CRM Webchat runtime, staff workspace and
storefront integration. This supersedes the intermediate “runtime uncommitted”
status in the worker contract/result; those reports retain their original scope.
The final package commit contains this report. Source/lab acceptance does not
authorize production rollout, remote push, customer sends or Meta changes.

## Product outcome

One private staff assistant remains separate from customer support. CRM Inbox
and the native Desk **Customer Conversations** Page are two entries to the same
customer conversation/control/outbox service. The storefront supplies one help
bubble, with WhatsApp inside it or as the unavailable-channel fallback. Chatwoot
is not a dependency. Public input never calls the private Doco assistant.

The completed journey is visitor message → exact store queue → staff take
ownership → durable manual reply → visitor transcript → continue or close.
Manager configuration carries the saved channel identity/revision; an agent
assignment opens an unsaved User Permission with the exact channel prefilled.
Channels default disabled and visitors create no person, Inquiry or consent.

Webchat uses random session authority, a hash-only capability in CRM and a
host-only Secure/HttpOnly storefront cookie. Only the BFF sends the capability,
in a header consumed before Frappe authentication. Generic reads of private
conversation/session/message/control/outbox records are blocked, including the
Administrator document fast path; staff use current scoped brokers. The exact
hook cache must be refreshed with the source package.

## Final checks

| Check | Result and retained evidence |
| --- | --- |
| Assembled eight-app Python suite | 599 discovered, 598 passed, 1 appropriate core-only absence skip; [full log](p6-assembled-final-tests.log) |
| Actual Frappe + CRM installation | 37/37 passed, including optional-app absence and Webchat/local outbox; [full log](p6-coreonly-final-tests.log) |
| CRM frontend | 516 tests in 51 files passed after final review fixes; [full log](p6-crm-frontend-reviewed-tests.log) |
| CRM production assets/PWA | Build passed; 184 precache entries, expected size warnings; [full log](p6-crm-reviewed-build.log) |
| JavaScript lint | Explicit frontend config passed; Desk checked through the same config with a frontend stdin filename; [Desk log](p6-desk-eslint.log) |
| Actual concurrent SQL/commit/crash behavior | Six scenarios passed with real processes, connections, commits and two SIGKILL checkpoints; [report](P6_WEBCHAT_OUTBOX_CONCURRENCY.md) |
| Actual storefront → CRM → storefront | Guest commit/lost-response replay, separate Sales User Desk search/take/queue, actual worker and visible visitor reply passed; storefront repository `coordination/meta-reliability/STOREFRONT_ACCEPTANCE.md` |
| Actual manager configuration | Saved immutable binding, exact revision, lost create response, single disabled row, permission prefill, zero implicit grants and 375px layout passed; [report](WEBCHAT_CONFIG_ACCEPTANCE.md) |

Storefront's companion package passed 1,308 unit/component tests in 126 files,
Astro check (zero errors/warnings; four existing hints), production build and
seven HTTPS browser/middleware scenarios. It preserves the frozen request ID/body
across uncertainty; another tab's cookie change cannot resend into another thread.
The actual two-application round trip used production service functions with
fictional landing reads and blocked external transports. It does not establish
production Boat routing or throughput.

The assembled 599-test run covers WhatsApp signature/receipt/legacy/coexistence/
native activity and delivery behavior, Marketing's current acquisition and
transport guards, core ownership/outbox/thread brokers and Webchat/health. It
used preserved Doco `81a7cc2` plus the finite OTP change. The later Doco package
rebases onto clinic/mail `588a00f`; its own final report records the additional
auth-mail/OTP integration checks rather than implying that base was in this run.

## Final response-timing review

Final review found that a transient history refresh could unmount the actual CRM
composer and discard its draft/frozen command. Realtime refresh now skips pending
work; polling rechecks pending state after its queue await. Temporary history
errors retain the mounted thread; confirmed revoked access still clears private
state. Five new tests include the actual mounted workspace/composer and the race
where a send begins while queue refresh waits. All 15 focused workspace tests
passed ([log](p6-crm-refresh-tests-final.log)); the full 516-test suite, lint and
production build passed afterwards. An initial harness submitted the control form
instead of the composer form; its two failures are retained in
`p6-crm-refresh-tests.log` and resolved by targeting the textarea's actual form.

Storefront review separately reproduced expiry-at-response bugs in send and
refresh. Its acceptance function now refuses an expired snapshot before state
mutation; callers retain the draft/expiry notice and never restore old transcript
text. Both regressions failed before the fix, then 31 focused and all 1,308 tests,
check/build passed. See storefront `STOREFRONT_EXPIRY_ADDENDUM.md`. The earlier real
browser journey remains separate evidence; these final timing races were exercised
through real Vue component tests rather than claimed as new browser runs.

## Durability and privacy observations

Webchat inserts its Outgoing transcript and Accepted outbox state in one SQL
commit under the existing conversation fence. Killing a worker before that
commit leaves Queued/zero attempts/zero messages; killing it after commit leaves
one Accepted message that replay does not duplicate. Takeover waits for the
active transaction and cancels later intents pinned to the old generation.

The actual same-request race exposed MariaDB 1020. A narrow HTTP 409
`ReplyRequestPending` preserves the caller's transaction and the UI's frozen
command. After request rollback, a fresh connection checking that same command
converges on the one committed intent. No helper rolls back unrelated request
writes to make a retry succeed.

External transport keeps the distinct durable Submitting → Unknown recovery
rule. Webchat Accepted means “Disponible en la conversación”; no delivered/read
acknowledgement is invented. Native bot readiness remains false; the manual
WhatsApp/Webchat paths do not enable autonomous sending or Messenger/IG dispatch.

No phone/name/browser-cookie identity merge occurs. Customer history excludes
private assistant content, staff notes, chart/diagnosis and clinical attachments.
Read/write authorization, current account binding, current owner/generation and
session expiry/revocation are rechecked at the relevant service boundary.

## Migrations and cleanup

Both sites used the guarded Muelle migration wrapper. Complete raw logs are
[eight-app](p6-webchat-meta-migrate.log) and [core-only](p6-webchat-core-migrate.log).
All three private Webchat tables and the additive provider-message unique index
were verified. There were zero Deleted Document DocTypes. Same-time Workspace/
Mercado Number Card/chart deletions were investigated against explicit recreation
code; the exact four cards and chart were verified present. No orphan claim is
based only on migration exit status.

The persistent pre-Webchat `app_hooks` cache prevented the new hooks outside
developer mode. Only the exact site-prefixed key on each isolated site was
invalidated; actual production-mode list requests subsequently proved privacy.
This is a required rollout step, not a global Redis flush.

Final browser [cleanup evidence](p6-webchat-chain-cleanup.log) records channel and
fixture user disabled, three conversations Closed, all three sessions revoked,
and only three Accepted intents with no pending worker effects. The additional
configuration channel remains disabled with zero sessions. Immutable fictional
evidence is retained. The temporary WSGI and loopback bridge were stopped by exact
argv match; the private host/backend manifests no longer contain the password.
Stored maintenance/pause-scheduler/mute-email holds remain `[1,1,1]`; schedulers
stay disabled. No production traffic, provider request or customer message was
sent by these acceptance tests.

## Rollout requirements

- Keep P0's coordinated WhatsApp app-secret/source/worker activation and owned
  signed-event proof as the first production gate. Source is fail-closed.
- Publish compatible CRM schemas/controllers/hooks/brokers/workers and storefront
  source together. Use guarded migration, inspect deletion evidence, invalidate
  the exact app-hooks cache, publish assets and restart workers through the
  coordinated scripts. Do not roll back the privacy controller/hook bundle alone.
- Verify actual HTTPS/proxy trust/Boat tenant routing and API cache exclusion.
  Create or select the exact profile/origin channel in Desk; grant selected staff
  exact channel permission; explicitly enable only the intended store after the
  controlled visitor/staff journey passes.
- Preserve header redaction and no-store behavior; do not enable infrastructure
  logging of visitor credentials. Application Recorder exclusion is tested;
  privileged memory inspection/custom infrastructure logging is outside it.
- Coordinate the optional `whatsapp_chat` transition if that app is installed: its
  old customer launcher, phone-only customer APIs and notification hooks are
  retired when native CRM is present. Its isolated capability/unit/bundle checks
  passed; an actual installed-app browser rollout remains a separate gate.
- Keep automation off and Instagram transport unverified until their separate
  provider/producer gates pass. Unknown external sends are never blindly retried.
- Rollback starts by disabling the exact Webchat channel. Preserve immutable
  transcripts/control/outbox and consistent private controllers/hooks. No person,
  consent or audit deletion is part of rollback.
