# Meta subscription and consumer audit — 2026-09-09

**We are not using all enabled subscriptions.** The app has a broad configured event set, the connected Page enables a smaller set, and our consumers implement only part of either. Enabling a checkbox does not prove delivery, useful processing, correct CRM conversion or safe automation.

This is a fresh read-only production audit of `ventas.docomexico.com`, observed from 2026-09-10 03:04 UTC (September 9 local time). [Sanitized live metadata](../coordination/meta-coverage-20260909/crm-meta-coverage-readonly-20260909.json) and [runtime/security evidence](../coordination/meta-coverage-20260909/crm-meta-runtime-readonly-20260909.json) are retained. Provider calls were GET-only; the database connection was read-only. No subscription, setting, customer record, message, code or schema was changed in production.

## What is actually configured

| Object / level | Observed configuration | Meaning |
| --- | --- | --- |
| Facebook Page, app level | 42 fields, active callback to marketing webhook | Broad potential coverage; does not mean our Page receives all 42. |
| Doco connected Page | 7 fields: `messages`, `messaging_postbacks`, `message_reactions`, `messaging_referrals`, `feed`, `leadgen`, `message_echoes` | `mention`, read/delivery receipts and handover are absent at this level. |
| Instagram, app level | 11 fields, active callback to marketing webhook | Account mapping is present. A direct account subscription GET returned unsupported-edge/field error 100; account-level delivery coverage remains unproven. |
| WhatsApp business account, app level | 28 fields, active callback to WhatsApp webhook | Only messages and template-status events have substantive top-level handling. |
| WhatsApp business account attachment | Both configured active phone accounts use the same WABA; WABA GET lists our app and a second app | Inventory the second app's purpose/ownership before any cleanup; do not assume it is unwanted. |
| Legacy Facebook `user` object | 20 fields; callback points to the WhatsApp receiver | No corresponding Facebook-user event consumer was found in that receiver. This is not a bridge to ordinary Facebook notifications. |

Most current subscriptions use v25.0. The legacy user object mixes v22.0/v24.0. An accepted stored subscription is not proof of current permission, supported product access or real event delivery. In particular, the stored `group_feed` field does not demonstrate access to the group post in the screenshot.

## Coverage and remaining gaps

| Business capability | Implemented consumer | Gap / next action |
| --- | --- | --- |
| Facebook @mentions in third-party posts/comments | Router + Social Mention ingestion exist | App-level `mention` is enabled; the Page subscription omits it. After durable handling is ready, repair the Page's subscribed set without removing existing fields and prove controlled event delivery. Group/private-content availability remains a separate question. |
| Facebook Page comments and reactions | `feed` routes comments to Social Comment; post reactions update counts; explicit lead/reply paths exist | Automatic comment leads are intentionally off. `feed_enabled=0` is not enforced by ingestion. Reaction increments are not a unique event ledger, so redelivery can affect counts. |
| Lead Ads | Fetch form answers, create CRM Lead, route by Page/shop, add attribution | `leadgen` is subscribed, but `leadgen_enabled=0` is not consulted. Replay uses a touchpoint-text existence query instead of a unique receipt; fetch failure has no durable recovery. Form submission currently records a broad `channel=All` consent grant without validating the form's actual contact-purpose scope. Correct these semantics before expanding paid acquisition. |
| Messenger DMs, echoes and reactions | Stored/rendered conversations, Page-scoped identity linkage, reactions, ad/m.me attribution | This is real functionality. Echo receipt does not establish durable human takeover. Some async helpers carry PSID without Page identity; preserve account scope before generalizing multi-Page bots. |
| Messenger buttons/quick replies | Opt-in menu routing is implemented | The “talk to a person” action sends an acknowledgment but does not perform durable assignment/ownership handoff. Non-message events have no stable dedup key. |
| Messenger delivery/read receipts | Classifier stores `delivery`/`read` as audit rows | App enables them, Page does not. No fold into the outgoing message's status; subscribing alone will not make inbox checkmarks reliable. |
| Message edits, human/bot handover and standby | No complete lifecycle consumer | Page lacks relevant subscriptions; Instagram enables several. Receiver does not consume `entry.standby`, and ownership is not durably synchronized. Do not equate stored echo/raw event with a bot pause. |
| Instagram DMs, reactions, comments, @mentions and story-mention attachments | Dedicated routes exist and linked account is configured | No fresh controlled delivery proof. `live_comments`, `message_edit`, `story_insights`, seen and handover are not fully consumed. Instagram postbacks are stored but deliberately excluded from the Facebook menu sender; they need an Instagram-aware action path. |
| WhatsApp messages/statuses/template approval | Inbound message types, reactions, buttons, lists, Flow `nfm_reply`, message statuses and template status exist | Receiver selects only the first entry/change; status handling selects only the first status. Batches and reordered updates need complete processing and monotonic status rules. |
| WhatsApp account/template quality and limits | Subscribed, without matching domain handler/operator alert | `account_alerts`, `phone_number_quality_update`, template quality/category/components and related capability events need persisted state, operator alerts and appropriate send gating. |
| WhatsApp Business App coexistence | `smb_message_echoes`, `smb_app_state_sync`, `history` subscribed | Not applied to the CRM thread/ownership. Replies from the phone app can leave CRM/bots with incomplete conversation state. |
| WhatsApp calls/groups/Flow lifecycle/payment/security events | App subscriptions exist | These are not delivered CRM product features. Assess business need and Meta product eligibility before implementation; Flow message responses already supported are distinct from the `flows` lifecycle field. |
| Reviews/recommendations | `ratings` route exists in source | `ratings` is absent from both observed app and Page sets. Confirm current API availability/permissions before advertising or attempting subscription. |

The deployed Messenger receiver, mentions, comments, IG comments, Lead Ads, Messenger consumers, attribution and WhatsApp receiver/signature modules were fingerprint-compared with the source inspected for this audit. This avoids treating an unshipped candidate as production behavior.

## Priority defects

1. **P0 — WhatsApp authentication is not enforced.** The deployed signature module deliberately skips verification if no WhatsApp Account app secret is configured. The actual deployed `configured_secrets()` returned zero. The Messenger app secret exists, but that does not activate WhatsApp's separate configuration. Complete a controlled signature-enforcement rollout with genuine signed delivery proof and unsigned/tampered rejection before widening webhook-driven automation. No attack request was submitted in this audit.
2. **P1 — Durable receipt and complete batch processing.** Store authenticated, account-scoped event receipts before enrichment/action, deduplicate them, process every entry/change/status, and retain a retryable failure instead of acknowledging lost work. Messenger currently returns 200 after caught handler failures and several helpers use transaction-wide commit/rollback. WhatsApp raw logging is not a consumer/recovery ledger.
3. **P1 — Capture and configuration contract.** Repair Page mention coverage; implement reliable lead/ad/mention conversion receipts; make displayed toggles agree with handlers; separate form contact purpose from marketing permission. Keep the native manual inquiry path available for events Meta cannot expose.
4. **P1 — Human ownership across channels.** Consume handover/coexistence signals and make actual agent replies/takeover invalidate queued bot actions. Persist ownership before acknowledging a handoff. This is more valuable than adding another bot designer.
5. **P2 — Delivery truth and health.** Fold receipts into the correct outgoing action/message, keep uncertain outcomes explicit, and turn subscribed quality/account signals into actionable operations state. Do not retry a message solely because a receipt is missing.
6. **P2 — Subscription reconciliation.** Maintain a per-product capability manifest: required app fields, account/Page fields, permissions, handler, proof and intended CRM effect. Audit unused legacy `user` subscriptions and the second WABA app before scoped cleanup; do not unsubscribe blindly or subscribe to everything.

The new [native acquisition candidate](../coordination/inquiries/FINAL_AUDIT.md) addresses explicit capture, separate people, safe lead conversion and a focused read-only Page diagnostic. It is **not deployed** and does not yet implement this complete Meta coverage matrix, durable ingest or WhatsApp authentication rollout.

## Bounded delivery tasks

| Task | Scope | Required proof | Existing plan dependency |
| --- | --- | --- | --- |
| META-00 | Complete WhatsApp signature enforcement and inventory callback/app ownership | Raw-body signed acceptance; missing/tampered signature denied before writes; known account routing; no customer message | Release/security prerequisite |
| META-01 | Shared inbound receipt semantics and batch correctness | Every event retained once; duplicate/out-of-order batches; handler failure/retry; exact account scope; no lost earlier writes | ACQ-04, AUTO-03 |
| META-02 | Read-only app/account subscription manifest + scoped repair contract | Set difference, handler readiness, preserved existing subscriptions, received-event proof and honest unknown coverage | ACQ-03, EXT-01 |
| META-03 | FB/IG acquisition and Lead Ads correctness | Mention/ad replay; stable source identity; live comment routing where supported; enforce toggles and form-purpose scope | ACQ-04, UX-01 |
| META-04 | Messenger/IG handover + WhatsApp coexistence into native ownership | Actual human takeover prevents queued bot effect; correct Page/account/thread; history does not retrigger bots | AUTO-01/02 |
| META-05 | Receipt folding and provider health lifecycle | Full status arrays, reordered statuses, template/account-quality events, Unknown reconciliation and operator alerts | AUTO-03/04, EXT-01 |
| META-06 | Optional advanced product surfaces and legacy cleanup | Explicit business need/product eligibility, allowlisted consumer and tests before advertisement; record why retained/removed | EXT-02, REL-01 |

## Meta source limits

Meta's developer pages returned HTTP 429 during this audit. Live Graph metadata is the authority for the subscription configuration above; it does not establish event eligibility. Meta's official [Instagram collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df) documents `comments`/`live_comments` and channel-specific private-reply conditions. Its official [WhatsApp webhook collection](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks) includes phone-quality, account-review and template events. These support treating acquisition and account-health events as distinct features; they do not certify our delivery coverage.
