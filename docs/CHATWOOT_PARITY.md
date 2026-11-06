# Chatwoot parity: CRM inbox, books assistant and n8n

Chatwoot was retired on 2026-08-04 and stays retired. This page compares the features Chatwoot
gave us, both to people and to n8n, with what the CRM and the books assistant provide now. Status
as of 2026-11-03, lanes `integrations-n8n` (crm) and `integrations-n8n-bot` (doco).

Legend: ✅ covered · ◐ partly or differently · ✗ gap (not built)

## Connections (what n8n used)

| Chatwoot | Muelle | |
|---|---|---|
| Account/inbox webhooks (`message_created`, `conversation_status_changed`, …) | CRM Integration events (20 types plus `document.*` for any record type), durable, retried, Standard Webhooks signed. See [integrations/N8N.md](integrations/N8N.md) | ✅ |
| Webhook payload has the full conversation | payload built as the connection user with the inbox's own read policy, child rows included; unreadable records are Skipped | ✅ (stricter) |
| Webhook retries | 8 attempts over about 21 h, Dead state, 410 stops at once, **Send again** | ✅ (Chatwoot did not retry durably) |
| HMAC on webhooks (`X-Chatwoot-Signature`, added late) | `webhook-signature` v1 HMAC-SHA256 with timestamp; a replaced secret keeps signing alongside the new one for 24 h; the n8n templates refuse with 401 whatever they cannot verify | ✅ |
| Application API (`api_access_token`) | Frappe API key of a dedicated user; every role and record permission still applies | ✅ |
| API: send a message | `crm.api.outbox.queue_message`, idempotent through the outbox fences | ✅ |
| API: toggle status, assign | `conversations.apply_control` (take, release, close, reopen), with generation fences | ✅ |
| API: conversation history | `conversation_threads.get_history` | ✅ |
| API channel inbox (bring any channel in) | CRM Integration «Use as an inbox channel»: `channel_message` in, outbox → webhook out, `channel_status` | ✅ |
| Agent bot (webhook on each customer message, bot replies through the API) | events `message.created` + `queue_message`; the in-house customer bot (CRM Automation Policy) covers WhatsApp/Webchat | ✅ |
| Agent bot handoff to a human | `apply_control` bot/human transitions; `conversation.status_changed` tells n8n, also when a take or transfer moves the owner | ✅ |
| Contact / custom attribute webhooks | `contact.*`, `lead.*`, `deal.*`, `inquiry.created` | ✅ (more than Chatwoot) |
| Staff assistant over the API | books assistant `say` / `callback` + `assistant.message_created` / `decision_pending` | ✅ (Chatwoot had nothing similar) |
| Platform API (create accounts or users from outside) | Frappe REST under permissions; tenant provisioning is Boat's job | ◐ by design |
| Client API for a custom widget | Webchat channel (CRM Webchat Channel), with its own session API | ◐ different shape |

## Inbox features (what people used)

| Chatwoot | Muelle | |
|---|---|---|
| Channels: WhatsApp Cloud, Messenger, Instagram, website widget, email, API | WhatsApp (WABA), Messenger, Instagram (through Messenger), Webchat, email (Correo queue), API channel | ✅ |
| Telegram, SMS, Line channels | through the API channel and n8n | ◐ bridged |
| Assign to an agent or team | owner take/release/transfer, departments (`route`), Assignment Rules on leads/deals, manager queues (`workload`) | ✅ |
| Conversation views: mine, unassigned, all, snoozed | inbox queues across every account the person can read, with label filter; `?queue=` remembers the view | ✅ |
| Auto-assignment for conversations | CRM Inbox Settings: least-busy available person per team, per-person limit, recorded as a control event | ✅ |
| Agent availability (online/offline) | each person switches «Recibir conversaciones nuevas» in the inbox; managers edit the list in Settings › Customer inbox | ✅ |
| Canned responses | composer `/` palette (templates and quick replies) and saved replies in the inbox composer (with doco_marketing) | ✅ |
| Private notes with @mentions | CRM Conversation Note: immutable, never sent to the customer, mention → CRM Notification, `conversation.note_created`; shown on the linked lead's and deal's timeline, and the linked records' notes show (and can be written) in the inbox | ✅ |
| Labels on conversations | CRM Conversation Label (name, colour) on the conversation; filters the queues; `conversation.updated` | ✅ |
| Snooze | until a preset time (site time, from the team's opening hours) or until the customer writes; tells the person who snoozed | ✅ |
| Conversation linked to contact or CRM record | `link_record` to Contact, Lead, Deal | ✅ |
| Macros (several actions at once) | CRM Inbox Macro: reply, label, note, team, snooze, close; personal or shared by a manager; all steps or none | ✅ |
| Automation rules (on event → action) | CRM Automation Policy for bot flows, Inbox Settings for away/assign/rating; anything else through events → n8n | ◐ by design |
| SLA | first-response and resolution targets in Inbox Settings, measured in the performance report; the queue shows each wait (amber near the goal, red past it) and sorts by «Esperan más»; a late-reply alert notifies the owner or the managers once per wait and emits `conversation.reply_overdue` | ✅ |
| CSAT survey after resolution | rating link sent on close (`/rate/<token>`, 1–5 and comment), first answer counts, `conversation.rated` | ✅ |
| Reports (first response, resolution time, CSAT) | team performance dialog for managers (`crm.api.inbox.performance`), per person and team | ✅ |
| Typing indicator, read receipts | WhatsApp statuses shown; API channel statuses through `channel_status` | ◐ |
| Business hours / out-of-office auto reply | Inbox Settings office hours per weekday plus a holiday list, and an away message with `{{nombre}}`, repeated at most every N hours | ✅ |
| Help center (knowledge base) | published Help Articles (Frappe website), searched and inserted from the composer | ✅ |
| Reopen on a new customer message | on by default; back to the previous owner when they can still answer | ✅ |
| Inbox settings screens | Settings › Customer inbox (hours, people, goals, ratings, labels, macros) and Settings › Automations (n8n) | ✅ |
| Webhooks for other records | `document.*` for any ERP or app record type the connection user can read | ✅ (Chatwoot had none) |

## Still different from Chatwoot

1. No typing indicator.
2. Platform API and client widget API are shaped differently (Boat provisioning, Webchat session
   API).
