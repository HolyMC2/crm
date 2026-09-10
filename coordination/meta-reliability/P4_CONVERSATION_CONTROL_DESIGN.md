# P4 conversation control: implementation contract

Approved core contract, 2026-09-10; implementation is in progress in the isolated CRM candidate. P3 remains the shipping priority. CRM owns customer conversation identity, ownership and pinned runs; marketing is an optional adapter. P5 owns durable outbound intent, dispatch and reconciliation. No production or schema changes are made here.

## Core records and safe defaults

Add two DocTypes under `crm/fcrm/doctype/`; no mandatory Link to an optional app's DocType and no credentials, raw receipts or private assistant transcripts.

| Record | Minimum fields and invariants |
| --- | --- |
| **CRM Conversation** | `name = sha256(canonical_json([1, provider, account_id, peer_id]))`, `identity_version=1`; immutable identity, site-local database namespace. `provider`: WhatsApp/Messenger/Instagram; reserve Web only for a later disabled visitor adapter. `account_record`, optional `shop_key` are server-resolved display snapshots, never authority. Optional `reference_doctype/reference_name` allowlist: CRM Inquiry/Lead/Deal. `control_state`: **Human** default/Bot/Paused/Closed; `human_owner` User or empty; `generation=1`; `bot_enabled=0`; `provider_control`: Not Applicable/Ours/Other/Unknown. Requests live in immutable event rows. |
| **CRM Conversation Control Event** | Append-only `conversation`, unique `command_key`, `input_hash`, `origin` Human/Provider/System, authenticated `actor_user`, action/reason, previous/result state and owner, from/to generation, bounded result JSON and optional receipt identifier as Data. No generic create/edit/delete authority. Human key includes conversation/user/client command ID; provider key includes conversation/canonical receipt identity. |
| **Existing marketing Chatflow Run (later optional lane)** | `conversation`, `conversation_generation`, unique `execution_key`, `origin_event`, `actor_user`, initiating `requested_by`, immutable `definition_snapshot/hash`, `step_results`, existing status/next_step/next_run_at, `expires_at`, bounded attempts and reason. At most one active run is checked under the conversation fence; do not add a core Run DocType. Snapshot v1 has stable step IDs, fixed recipient/account/reference/purpose reference and bounded action payloads. |

Exact account IDs are WA `WhatsApp Account.phone_id`, FB Page ID, IG professional-account ID. IG's linked Page is credential routing, not its identity. Peer is the full validated WA identity, Page-scoped PSID or IG sender ID: never suffix-ten, latest message, name matching or cross-channel person merging. Local account rename does not change identity; reconfiguring its external ID cannot move an existing conversation.

Root adds `conversation_automation_enabled=0` to existing `FCRM Settings`, System Manager-controlled. Effective automation also requires conversation opt-in, Bot state, eligible current policy/provider and the P5 capability gate. Existing conversations materialize Human/unassigned with bots disabled. Every automated producer must honor the kill switch; old `auto_send`/Active runs never opt themselves in. Ambiguous account history remains unresolved.

## Permission and API contract

Core files: new `crm/api/conversations.py`, two DocType controllers and matching `crm/hooks.py` private-model permission hooks. Keep the core independent of marketing execution. Fixed adapters only: core WA, optional marketing Messenger/Instagram, later Web. No configurable function paths or workflow engine.

The core broker supplies the same predicate for list, document, mutation and delayed execution:

- Require enabled authenticated operator plus channel roles. Reuse CRM `crm/api/whatsapp.py:validate_access` and `ALLOWED_WHATSAPP_ROLES`; mutations require **write**, whereas current message/template entry points call its default read check. Messenger's `doco_marketing/services/dispatch/messenger.py:_guard` currently permits System Manager/Sales User; preserve that narrower send-role intersection until an explicit role change.
- Require selected reference permission through existing `has_permission`/Inquiry controller and `crm/permissions/org_hierarchy.py`. For an orphan, retain `services/inbox/orphans.py:_require_inbox_access` (CRM Deal read), plus channel and exact account scope. Lead assignment alone is not conversation ownership; Inquiry read does not grant linked Lead access.
- Resolve the **current exact account** and its shop. Reuse the policy of marketing `services/social/shops.py:get_allowed_shops(user)` with current locking role/Shop/User Permission reads; do not reuse its caches at final mutation. Match WA `doco_shop` or exact Messenger Page `shop`, including validated IG mapping. Restricted operators cannot use an untagged account; an authorized unrestricted manager can resolve its scope. Resolver errors/conflicting/deleted accounts fail closed; current account record and shop must exactly match the creation snapshot until an explicit reassignment service exists. Do not reuse `_shop_hidden_channels`: its exception path hides nothing.
- Bare CRM/WA without marketing/shop dimensions works through exact-account brokerage and CRM permissions. Absent optional app differs from an installed adapter failing. Base WA Account/Message JSON permissions are System Manager-only: **do not require ordinary operators to read token-bearing account configuration or grant them that access**. Return safe account metadata through the broker.
- Target owner must be enabled and currently eligible for the same channel/account/shop/reference. Manager force requires a reason and still respects scope; Sales Manager alone is not an unrestricted social manager. Recheck permissions at dispatch. Generic REST/import/save cannot mutate identity/control fields outside the internal service capability.

Public API: `get_conversation`, `list_conversations`, finite `apply_control` with request/take/transfer/release/pause/close/reopen. Bot entry is strict internal `begin_bot`/`handoff_bot`, never a caller-supplied origin flag. Each mutation takes conversation name, `expected_generation`, stable `command_id` and bounded action fields. Identity, actor and origin are server-derived. Same command/input returns the original result without another transition, before testing its now-stale expected generation; recheck current read scope and original actor. Changed input with the same ID conflicts. Mark replay results as historical and refetch current state.

| Transition | Authorization/result |
| --- | --- |
| Request | Eligible operator requests another Human owner's conversation. Request audit event only, no authority or generation change. |
| Take | Eligible operator takes Bot or unowned Human into Human/self. Another Human requires owner transfer or scoped manager force/reason. Paused requires explicit authorized resume; Closed must reopen first. |
| Transfer / release | Current owner or scoped manager; eligible target for transfer. Release means Human/unassigned, **never Bot or provider handover**. |
| Pause / close / reopen | Owner/scoped manager; eligible operator may pause Bot. Paused and Closed cannot send. Reopen to Human/unassigned, with bot opt-in cleared; no inbound auto-resume. |
| Bot opt-in / start | Scoped manager, enabled site policy and P5 ready. Cannot steal a Human owner's conversation: require owner release first. Start inserts pinned run and enters Bot atomically. Disabling opt-in holds automation immediately. |
| Human reply (P5) | Same take/owner check and intent creation in one transaction. Another operator cannot send as owner. Repeated replies by the current owner do not keep incrementing generation. |

Each actual authority/state/reference change increments generation, cancels obsolete run/unsubmitted bot work and appends its event atomically. Reference changes require access to old and new references and never change peer/account. No 30-minute expiry restores bots. Notifications are after-commit, user-targeted ID/generation/state; fetch text under current permissions. Ownership is separate from purpose/consent: an added Inquiry person never inherits the original respondent's contact purpose.

## Shared fence and outbound seam with P5

`crm.api.conversations` exposes `conversation_fence(conversation_name, timeout=...)` as a context manager. Use a site/conversation-namespaced **database advisory lock** shared by commands, planning and P5 dispatch. The outer endpoint/worker owns transaction commit/rollback; nested helpers never commit/roll back caller work. Fence lifetime must cover that outer boundary when dispatch/takeover depends on it.

```python
with conversation_fence(conversation_name):
    # Lock order: conversation -> active run -> intents in stable order -> event.
    authority = authorize_locked(conversation, actor, expected_generation, action)
    # P4 control: transition + invalidate_locked + event, then outer commit.
    # P4 planner/P5 reply: create_intent_locked(authority, stable_occurrence).
    # P5 dispatcher: final permission/identity/purpose/generation checks,
    # durable Submitting commit -> bounded provider call, fence still held.
```

Takeover uses the same fence, bumps generation and cancels **unsubmitted** bot work. It may wait or return a retriable conflict while a prior attempt owns the fence. Already Submitting/Unknown is in flight or possibly sent: retain evidence and never promise recall. After successful takeover no older generation may begin a new provider attempt. A row lock released at the Submitting commit followed by HTTP is insufficient. Prove advisory-lock connection loss/restart behavior in P5; fail closed without lock ownership.

P5 interfaces: `create_intent_locked(authority, occurrence)` returns the same intent for the same occurrence/payload; `invalidate_locked(conversation, older_than_generation, reason)` cancels unsubmitted obsolete actions; `dispatch_with_conversation_fence(intent)` rechecks current identity, permissions, generation, purpose/suppression, provider and kill switches. These are internal row identities, not client authorization tokens. Bot occurrence = conversation/generation/run/step/action; human occurrence = conversation/authenticated user/stable command ID. A stale review/result cannot generate a new occurrence. A crash after possible submission becomes Unknown, never blind retry.

## Pinned runs, provider events and concrete wiring

Run creation and first occurrence planning happen before any effect, including one-step flows. The optional marketing lane uses its finite versioned action validator, including same-conversation message/template/escalate and bounded domain actions. P5 pins rendered values and rechecks current template eligibility at dispatch. Reject unsupported cross-channel/code steps. Current native validator bounds: 20 steps, no loops, 30-day maximum horizon, three local planning attempts; transport attempts belong to P5. Definition edits affect only new runs; explicit kill cancels future work. Planning completion does not change conversation generation or cancel its pending intents. Delayed model/review results retain snapshot/generation and are cancelled when stale.

| Existing files | Required integration |
| --- | --- |
| Marketing `services/chatflow.py:start_run/run_step/_advance_run/_human_attended` and existing Chatflow/Step/Run | Keep authoring/history, add immutable snapshot/generation/trigger fields to the existing optional Chatflow Run. Replace entry action before Run insertion and mutable step reads. Hold legacy Active/Processing runs; do not resume via the human-30-minute heuristic or Administrator inbound path. P3 owns acquisition. |
| CRM `api/whatsapp.py`; marketing `services/inbox/send.py`, `services/inbox/orphans.py`, `services/dispatch/messenger.py`; WA `.../doctype/whatsapp_message/whatsapp_message.py` and `transport.py` | Explicit conversation/account through all sends/retries/media/reactions/sender actions. Remove controlled-send reliance on reference-only recipient/default account/Page fallback. WA `before_insert` currently sends before insertion: P5 must put the intent/fence before that effect. |
| Marketing `marketing/doctype/whatsapp_send_review/whatsapp_send_review.py:_send`; CRM `frontend/src/composables/outbox.js` | Reviews remain approval surfaces. P5 fixes Pending-as-Enviado and lost-response browser retries, preserving stable occurrence and generation. No P4 duplicate outbox. |
| WA `utils/webhook.py:consume_receipt`; marketing `api/messenger_webhook.py:consume_receipt/_classify/_store_event` | Normalize only proven exact-account observations. Receipt consumers never call provider handover/send APIs. Preserve existing receipt/replay action holds. |

Finite control observations: external outbound, provider control lost/returned/requested. Correlated exact-account intent/message-ID echo updates evidence only; unknown/external live app output holds automation, Human/unassigned with generation increment, without inventing a staff actor. Provider loss pauses; return may mark Ours but never resumes Bot. Local operator request/release differs from provider request/pass/take, which requires separate P5 control intent. Duplicates do not transition twice. Historical/replayed events never open/enable/start bots. Ordinary failed-receipt retry must still apply a conservative hold if its first transaction rolled back; `meta_webhook_replay` alone also means retry and cannot suppress that hold. Unordered live grants cannot undo a hold automatically.

Raw event adapters require fixtures before activation. Meta's [official handover sample](https://raw.githubusercontent.com/fbsamples/messenger-platform-samples/main/handover_protocol/index.js) shows standby/pass-thread-control handling, not proof of current delivery. The [360dialog coexistence reference](https://docs.360dialog.com/docs/messaging/webhook/webhook-reference.md#coexistence-events) identifies live `value.message_echoes[]`; its history/state-sync outer envelope is BSP-specific. Do not adopt that envelope into the raw Meta receiver; history/state-sync stay unsupported pending raw-shape/control proof. Not Applicable is valid only for an adapter without provider ownership; Unknown/Other blocks sends where ownership is required.

## Customer launcher boundary

Reuse CRM `frontend/src/pages/Inbox.vue`, `composables/inbox.js` and `components/Activities/WhatsAppBox.vue` for owner controls and conflict refresh. Future storefront launcher coordinates existing `src/layouts/Base.astro`, `WhatsAppCTA.vue` and `WaButton.astro`: one customer launcher per surface, using a separately authenticated Web visitor adapter and narrow own-thread API. Server binds tenant/widget/account/opaque visitor identity; clients cannot pick arbitrary peers/accounts/CRM references. Web remains disabled until that contract exists.

Private Doco `doco/public/js/assistant_bubble.js` and `doco/docoutils/assistant/{api,transport_desk,principals,operator_access}.py` retain staff authentication and `desk:<user>` transcripts. Public input never routes to those principals, APIs or transcript stores. Customer projections exclude staff notes/assistant content. Chatwoot is retired and not a dependency. Whether “CRM support” also includes platform support remains clarification; do not merge that queue or its permissions by assumption.

## Incremental gates and meaningful race proof

1. **P4-A Human/Off:** schema, exact-account permissions, commands and generic API protection. Two real SQL workers taking the same generation produce one owner/event and one conflict; lost-response same-ID replay adds no transition. Account/shop/target-owner denial, revoked access and bare CRM without optional apps pass.
2. **P4-B controls:** Inbox plus proven provider observations. Duplicate/reordered own/external echoes, loss then stale grant, and historical replay cannot restore bot authority or cross accounts. No provider call from the receipt consumer.
3. **P4-C planning only:** two inbound workers create one run/first occurrence; edit a waiting flow and prove pinned steps; run planner versus takeover in both interleavings proves rejection or cancellation of old work. Late model/review result stays cancelled. Preserve actual MariaDB conflict evidence and retry only in a fresh transaction with the same occurrence.
4. **P4/P5 activation:** fake-provider process barrier proves the advisory fence spans Submitting commit through transport and coordinates takeover; crash-after-possible-send remains Unknown with no review/browser resend. Cover **every** legacy effect route before explicit opt-in to a bounded pilot. Until then bots remain Off; no claim that P4 alone prevents late sends.

Use fictional isolated lab fixtures and blocked transports. Future migration/rollout uses guarded Muelle procedures after P3 completion; rollback disables automation and retains control/run/intent evidence and permission controllers. Do not revert to an unfenced sender with bot work queued.

Requirements: [next session](../../docs/CRM_NEXT_SESSION.md), [completion plan AUTO-01–04](../../docs/CRM_COMPLETION_PLAN_2026-09-09.md), [purpose and final eligibility](../../docs/CRM_POWERHOUSE_REQUIREMENTS.md), [Meta coverage](../../docs/CRM_META_COVERAGE_AUDIT_2026-09-09.md).

Implementation evidence: core SQL23/23 on the eight-app isolated site; core-only3/3 on frappe+crm. [Actual process proof](conversation_concurrency.py) and [complete output](conversation_concurrency.log) prove one winner at one generation, same-command response-loss replay, and a real checkpoint commit retaining the dispatch fence against takeover/stale dispatch (7 child processes, zero provider calls). Initial harness enqueue suppression failures remain in the log; all committed fixture accounts/users/shops from both runs were removed. Two closed private fictional conversations and eight immutable audit events are deliberately retained.

Approved internal bot seam: `begin_bot(name, expected_generation, command_id, *, run_name, actor_user=None)` requires the current session manager, Human/unassigned, both manager/executor current scopes, both site switches and `crm.api.outbox.automation_ready(provider) is True`. Fixed `doco_marketing.services.chatflow_native.validate_native_run(..., starting=True)` verifies the actual inserted run. The immutable grant binds run/hash/executor/requesting manager; marketing binds the returned generation in the same transaction. `assert_current_generation(..., origin="Bot", actor_user=executor, run_name=...)` revalidates the grant and fixed run validator. `handoff_bot(..., step_id, owner=None)` also requires the fixed due-step validator, emits System/bot_handoff and advances to Human with a new generation. Human dispatch requires its current owner; private notes never enter this outbound authority API. Missing readiness stays Off.
