# P6 Webchat implementation — 2026-09-10

The finite Webchat visitor/storage slice is implemented and ready for root package review. Root installed the approved inert schemas; runtime remains uncommitted. No production/provider requests, schema migration, commits, deployment or shared-branch changes were performed by this worker.

- **25/25 tests PASS** on `meta-reliability-test-20260910.lab.xoloitzcuintles.com` (eight apps), 1.127s; log: `p6-webchat-tests.log`.
- **25/25 tests PASS** on `crm-inquiry-test-20260909.lab.xoloitzcuintles.com` (Frappe+CRM), 1.039s; log: `p6-webchat-core-tests.log`.
- Python compilation and `git diff --check` pass. SQL tests use fictional rows, rollback, blocked requests/SMTP/enqueue and mocked commits. Root owns separate real WSGI/browser and committed local outbox proof; these rollback tests do not claim crash/commit durability by themselves.

Implemented saved default-off Channel configuration and bounded manager listing, immutable profile/origin/account binding, private sessions with hash-only 256-bit capabilities and independent random peer identities, immutable literal-text transcript, idempotent incoming/outgoing keys, exact current eligibility, scoped keyset history and fail-closed Redis quotas. Bootstrap creates no Conversation. The first Incoming message creates existing Human/off/unowned Conversation and invokes the verified local customer-reply control helper within the same transaction. Outgoing delivery requires the private core dispatch capability first. No commit, rollback, enqueue, HTTP, model, customer person/Lead/Inquiry, identity merge or consent effects belong to this module.

Real SQL tests found and fixed Frappe insert naming/timestamp behavior: service inserts now use explicit `set_name`; expiry derives from the authoritative creation timestamp Frappe assigns before validation. Expiry is 24 elapsed UTC hours, including a DST regression, with explicit UTC `Z` public timestamps. Bounded history uses current SQL reads under the conversation fence, avoiding a stale repeatable-read scope-hint snapshot. Guest HTML sanitation is bypassed only for these finite plain-text endpoints; the storefront must render escaped text.

The approved final credential protocol is **Authorization: Bearer**, consumed by exact `prepare_request` paths before normal Frappe OAuth/API authentication. JSON/query/RPC signatures contain no capability. The hook keeps only its hash in an opaque exact-request context and preserves Guest without staff-session impersonation. Tests verify header removal, real `validate_auth`, cross-request context rejection, body-token denial and unchanged safe public projections. Bootstrap returns the capability once to the BFF, which owns its HttpOnly cookie and strips it from browser JSON.

Installed Frappe parses JSON before app hooks and its error sanitizers do not recognize a body field named capability. The former body protocol was therefore replaced. Tests inspect the actual malformed-JSON traceback/context metadata and installed Sentry WSGI header filtering, asserting no capability in serialized outputs without printing test credentials. Finite endpoint failures use static HTTPException JSON and scrub request diagnostic body/JSON/form caches; unexpected DB errors expose no original exception. The Administrator-only opt-in Recorder runs earlier: the exact-route hook scrubs captured headers/form, clears calls/events, invokes actual cleanup and disables only that request's recording. Actual Recorder.dump writes nothing; failed exclusion produces static503. No global recorder setting is changed. No claim covers privileged memory inspection, custom infrastructure logging or credentials deliberately placed in unsupported body/query fields.

Private generic access was tested through real `frappe.client.get`, document permission checks and list APIs. Frappe's Administrator fast path bypasses application has_permission hooks; controller-level guards now deny generic reads for Session, Message, Conversation, Control Event and Outbound Intent while retaining existing service-token mutations. Their generic `notify_update` is disabled. New message hints use only `{name: conversation_id}`, `after_commit=True`, and exact currently authorized owner/outgoing actor listeners. Replays emit no message hint; unowned queues retain bounded authorized polling.

Both isolated sites also retained old persistent `app_hooks` after schema migration. Outside developer mode the Webchat query/privacy and before-request hooks were absent. Under root authorization, only the exact site-prefixed `app_hooks` cache key was invalidated on each site; real hook resolution then contained the required entries. A production-mode `frappe.client.get_list` regression with actual rows now verifies empty private lists. Package rollout must refresh this exact hook cache; no all-Redis or all-site cache flush was used.

Rate limits are shared infrastructure/channel budgets, not per-visitor IP identity or a scale claim: observed egress IP6000/minute and bootstrap3000/hour; exact channel600/minute and bootstrap300/hour; session90/minute and send30/minute. No supplied IP/XFF is trusted. The storefront owns its independent per-visitor outer limit. Tests verify distinct budgets and that the tighter channel cap still rejects.

Owned paths:

- `crm/api/webchat.py`
- `crm/fcrm/doctype/crm_webchat_channel/` (approved schema/controller baseline already committed by root)
- `crm/fcrm/doctype/crm_webchat_session/`
- `crm/fcrm/doctype/crm_webchat_message/`
- `crm/fcrm/doctype/crm_conversation/crm_conversation.py` (only private read/notification guards)
- `crm/fcrm/doctype/crm_conversation_control_event/crm_conversation_control_event.py` (same)
- `crm/fcrm/doctype/crm_outbound_intent/crm_outbound_intent.py` (same)
- `crm/tests/test_webchat.py`
- `coordination/meta-reliability/P6_WEBCHAT_CONTRACT.md`, this report and the two focused test logs.

Existing Conversation/outbox/thread broker/hooks changes and storefront UI/BFF remain root/other-worker ownership and were preserved.
