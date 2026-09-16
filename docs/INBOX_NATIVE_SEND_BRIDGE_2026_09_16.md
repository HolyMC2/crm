# Inbox native send bridge — 2026-09-16

State: built and verified on lab (doco-mirror + meta-reliability test site).
Not on prod. Prod needs crm + frappe_whatsapp + doco_marketing together and a
crm migrate (new `CRM Outbound Intent.transcript_message`).

## Problem

Two send worlds shared a customer. Legacy producers (deal composer text,
attachments, voice notes, reactions, templates, catálogo, approvals queue,
taller notices) insert a `WhatsApp Message` whose `before_insert` calls Meta.
The native outbox (`CRM Outbound Intent`) is durable and ownership-fenced but
sent text only, needed explicit control, and its sends never reached the deal
thread. `crm.api.outbox_legacy.guard_legacy_send` refuses every legacy send to
a peer with a `CRM Conversation` row (created by opening a thread in
Conversaciones, by WhatsApp Business app echoes, or by webchat): from then on the
customer got no reply, template, catálogo, approval or repair notice, and the
operator saw a raw code.

## Design

One seam: `WhatsAppMessage.notify(data)` is the only place free-form and template
sends call Meta.

- **frappe_whatsapp** `_defer_to_native`: when `crm.api.outbox_bridge.
  governing_conversation(account, to)` names a conversation (Live account, exact
  recipient, schema migrated), the row is kept as the transcript with status
  `Queued` and no HTTP happens. A new row queues in `after_insert` (it needs its
  name); a refusal rolls back to a savepoint taken before the row was written and
  re-raises, so no caller keeps an orphan `Queued` row. A re-send of an existing
  row requeues its own intent (`requeue_transcript`). Demo accounts and every other
  recipient keep the legacy path byte for byte.
- **crm** `queue_transcript`: freezes the exact Meta payload (text, media by id or
  link, template, reaction, reply context) into an intent linked by
  `transcript_message` (outside the immutable fingerprint so older intents keep
  their identity; immutability is checked separately).
  - Origin is declared by server code, never read from provenance fields (they
    default to Human and clients can write them): the composer endpoints
    (`create_whatsapp_message`, `send_whatsapp_template`,
    `react_on_whatsapp_message`) wrap their insert in `person_reply()`; reviewed
    or automated producers wrap theirs in `automated_send()` (the outer
    declaration wins, so Inbox Auto Reply stays automated when it reuses a
    composer function); anything undeclared is automated (taller notices, Send
    Review, Desk button clicks on other documents). A client writing WhatsApp
    Message itself through the generic document API is always a person's reply.
    Automated notices act with system authority (`Administrator`); the row keeps
    who triggered it.
  - Ownership (Marco 2026-09-16): an unowned conversation is taken by the reply
    (`internal_take_for_reply`, recorded as `take` / `first_reply`); another
    owner, a bot run, a pause, a closed conversation or WhatsApp Business app
    control refuse with an actionable message. Notices send and are labeled.
  - Window: free-form needs the 24 h window (same `whatsapp_recipient_reason` the
    dispatcher runs); templates skip it. Purposes: `manual`, `service` (human
    template), `automation`.
- **Eligibility**: Human `manual`/`service` keep the generation + owner fence;
  `Automation` checks account, suppression, provider control and window, never
  generation, so a control change does not cancel a repair notice. Bot unchanged.
- **Projection** (`project_transcript`, called by every `outbox._transition`):
  intent state mirrors onto the row (`Queued`, `Sending`, `Success` + message id,
  `failed` / `unknown` + translated reason); a deleted row never wedges its
  intent. Deferred rows store the frozen recipient digits so delivery receipts
  find them. Accepted intents without a row
  (Conversaciones replies, bot replies) get one via
  `frappe_whatsapp.native_outbox.project_accepted` (`wa-native-<intent>`, no send,
  no hooks). Delivery webhooks then update both intent and row.
- **Thread UX**: rows carry `native` state from one non-locking query (a locking
  read deadlocked against the dispatcher on the lab); bubbles show En cola /
  No entregado / Sin confirmar with the reason, Reintentar and Cancelar envío.
  `ConversationControlStrip` above the composer shows who attends and the next
  action (Tomar control, Solicitar control, Liberar, Reabrir; managers give a
  reason only when overriding another person). Its buttons keep the composer
  focused on mousedown: a blur collapsed the composer, moved the strip and lost
  the click. Composer, templates, catálogo and reactions send from the business
  number the customer wrote to, when the user may send from it (else default).
  A busy conversation (dispatcher holding the fence through a Meta request)
  refuses with «Reintenta en unos segundos» instead of the English conflict.
  Bulk «retry failed» requeues native rows through their intent and no longer
  wipes their provider id.

## Verification (2026-09-16)

- meta-reliability test site: `test_outbox_bridge` 55 (includes the outbox and
  conversation suites it extends), `test_outbox_legacy` 11, `test_webchat_outbox`
  8, `test_outbox_delivery` 18, frappe_whatsapp `test_receipt_pipeline` 9,
  `test_transport` 11, `test_native_outbox` 27, `test_delivery` 9, doco_marketing
  `test_chatflow_native` 21, `test_native_outbox` 22, `test_legacy_outbox` 28,
  doco `test_bot_provider` 4 (with maintenance off in-process).
- doco-mirror: crm `test_whatsapp` 6, `test_whatsapp_optional` 3,
  `test_whatsapp_contacts` 6, `test_whatsapp_routing` 7, `test_conversation_enrich`
  13, doco_marketing `test_conversation_orphans` 8, `test_catalog` 16,
  `test_rate_limit_fail_closed` 11, `test_auto_reply` 20, `test_review_dispatch_guard` 38,
  frappe_whatsapp `test_conversation_webhook` 15, `test_bulk_messaging` 5. Vitest 70 files / 677.
- Browser on doco-mirror with a fictional Live account without token (no HTTP
  possible), deal `LAB-NATIVE-BRIDGE-0916`: reply to an unowned conversation took
  control and queued; the dispatcher blocked it (`account_configuration_invalid`)
  and the bubble showed the reason with Reintentar/Cancelar; retry requeued;
  assistant in control refused the send with the friendly message and «Tomar
  control» handed it over; another owner refused; a manager take required and
  recorded a reason; a template went through the bridge as `service`; a catálogo
  item sent with the customer's account; a catálogo send while the assistant
  attends surfaced the refusal instead of a silent skip.
- Pre-existing, unrelated: frappe_whatsapp `test_legacy_outbox` native worker test
  commits inside the worker (fails identically with projection stubbed); doco
  `test_bot_customer` fixture lacks `Bot Profile.execution_user`; frappe_whatsapp
  `test_account_health` pickles a Mock; the test site has `maintenance_mode=1`.

## Review (2026-09-16, independent pass) — resolved

Fixed: origin inference from request paths/provenance (now declared), deleted
row wedging projection, bulk sends left `Queued`, bulk retry wiping native rows,
savepoint rollback masking a deadlock, stale/out-of-scope suggested account,
English lock-timeout conflict, `+`-formatted recipients missing receipts,
`native_states` on an unmigrated site, `thread_control` probing arbitrary phones,
Reintentar/Cancelar offered to users the server would deny, null media captions.

## Known limits and next increments

- `frappe_whatsapp.native_outbox._classify` requires `wa_id == peer`: a
  conversation keyed with the `52…` spelling gets «Sin confirmar» for accepted
  sends (open since 09-15; conversations materialized from inbound use `521…`).
- Per-conversation send order is not enforced: several intents (e.g. catálogo
  items) dispatch on parallel workers serialized only by the fence.
- Lab hygiene: frappe_whatsapp `utils.test_webhook` / `utils.test_bulk_messaging`
  commit Live default test accounts; never run them on doco-mirror (restored
  2026-09-16).

- Exact-spelling fence: conversations are keyed by the exact peer (`521…`);
  producers sending to another spelling (`52…`) bypass fence and bridge, as before.
  The composer now uses the customer's inbound spelling.
- Messenger: the native Messenger gateway exists in doco_marketing but is not wired
  into `outbox._gateway`; a Messenger conversation still blocks legacy Messenger
  sends. Next increment: wire the gateway and bridge `create_messenger_message`.
- Conversaciones space still has the text-only composer; its replies now appear in
  the deal thread. Next increment: reuse the rich thread there.
- Catálogo from a «Sin asignar» orphan thread and the orphan composer still use
  the default account.
