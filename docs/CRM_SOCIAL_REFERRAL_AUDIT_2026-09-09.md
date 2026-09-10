# Facebook group referral capture — production finding

Observed 2026-09-09, approximately 10:32–10:35 America/Mazatlan, on `ventas.docomexico.com`. User supplied a Facebook group screenshot: a requester needs an iPhone screen repair, another commenter recommends Doco by mentioning the Page, and a separate commenter has another repair request. These are different actors; a referral is not proof the recommender is the buyer.

## Verified, read-only

- No Social Mention, Social Comment, CRM Lead or CRM Deal matched the screenshot aliases or its distinctive request phrases. There are **zero Social Mention and Social Comment rows created since September 7**. The latest stored FB mention is July 28; that date does not establish the last successful real-world ingestion because older rows may be test fixtures. Matching cannot rule out an independently created lead under different identifying information.
- The connected Page and shop are enabled, and the deployed code contains the FB mention router/handler. Tagged-post backfill is registered in scheduler hooks; registration is not evidence that it has run successfully.
- GET of the Page's live `subscribed_apps` returned HTTP 200 with `messages`, `messaging_postbacks`, `message_reactions`, `messaging_referrals`, `feed`, `leadgen`, `message_echoes`. **`mention` is absent.** Both configured credential sources could read this metadata; no tokens or raw errors were printed.
- `auto_lead_from_comment` is 0. The deployed mention service has no CRM Lead creation path. Comment auto-lead logic is a separate path for qualifying top-level comments.
- `feed_enabled` is stored as 0, but the inspected comment-ingestion handler does not consult that field. Do not attribute the missing mentions to that flag or assume toggling it fixes capture.
- No relevant mention/tagged/Messenger-webhook Error Log rows were present since September 7. Absence of errors is not evidence of event delivery; raw receipts/coverage have not been proven.

No subscription, lead, setting, message, production code or schema was changed. The database inspection used a connection set to read-only and rollback. Meta calls were GET-only.

## Diagnosis and limits

This capture flow was not active as previously implied. A deployed handler is insufficient when the live Page subscription omits its event field, and storing a mention still does not create a lead or Inbox comment. The screenshot is a GROUP post; a notification visible inside Facebook does not establish that the corresponding event/content is available through the Page API. The public/group/anonymous-author cases need explicit acceptance. Do not promise every group notification or use a nonexistent API event as proof of CRM failure.

The screenshot lacks the original post/comment URL, so the audit matched visible text/aliases and checked the complete recent social-record window. No lead was created merely from the screenshot.

## Bounded work to add to the build

1. **SOC-01a — inbound readiness.** Verify app-level and Page-level mention support/subscriptions for the configured Graph API and callback, preserve existing fields, and verify the actual subscribed set after any authorized change. Do not blindly invoke a helper that also adds unrelated fields such as ratings. Run controlled Page-post, third-party-post/comment and group cases with received-event/storage evidence. Configuration, unavailable upstream content and delivery errors must be distinct states.
2. **SOC-01b — referral to lead.** Reuse Social Mention plus native CRM: internal alert, owner, original source, context and an explicit create/link action. Record requester, referrer and additional prospective customers separately. Preserve unverified/anonymous identities; do not merge by display name. One external thread may legitimately produce multiple distinct leads. Deduplicate receipts by tenant/Page/event and conversion request/selected prospect; no customer message on capture.
3. **SOC-01c — dependable manual capture.** Permit an operator to save a post/comment link and selected text or optional screenshot into the same referral workflow without API access. Record manual origin, who captured it, and identity/context uncertainty. No scheduled Facebook UI scraping. This is a core fallback for group referrals, not a promise of background monitoring.
4. **SOC-01d — prove the business journey.** The supplied pattern becomes a fictional acceptance fixture: buyer A, recommender B, additional buyer C. Capture and assign; create/link A and C deliberately; retain B as referrer. Redelivery/repeated conversion must not duplicate either lead. Failed source enrichment still leaves the captured inquiry usable. Never fabricate private contact details, reply rights or an automatically ingested source.

Code references: [mention router](/home/holymc2/muelle-host/doco_marketing/doco_marketing/api/messenger_webhook.py:167), [mention ingestion](/home/holymc2/muelle-host/doco_marketing/doco_marketing/services/social/mentions.py:182), [comment auto-lead gate](/home/holymc2/muelle-host/doco_marketing/doco_marketing/services/social/comments.py:120), [Menciones UI](/home/holymc2/muelle-host/crm/frontend/src/pages/SocialMentions.vue).
