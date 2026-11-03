# Chatwoot parity: CRM inbox, books assistant and n8n

Chatwoot was retired on 2026-08-04 and stays retired. This page compares the features Chatwoot
gave us, both to people and to n8n, with what the CRM and the books assistant provide now. Status
as of 2026-11-03, lanes `integrations-n8n` (crm) and `integrations-n8n-bot` (doco).

Legend: ✅ covered · ◐ partly or differently · ✗ gap (not built)

## Connections (what n8n used)

| Chatwoot | Muelle | |
|---|---|---|
| Account/inbox webhooks (`message_created`, `conversation_status_changed`, …) | CRM Integration events (17 types), durable, retried, Standard Webhooks signed. See [integrations/N8N.md](integrations/N8N.md) | ✅ |
| Webhook payload has the full conversation | payload built as the connection user with the inbox's own read policy; unreadable records are Skipped | ✅ (stricter) |
| Webhook retries | 8 attempts over about 21 h, Dead state, 410 stops at once, **Send again** | ✅ (Chatwoot did not retry durably) |
| HMAC on webhooks (`X-Chatwoot-Signature`, added late) | `webhook-signature` v1 HMAC-SHA256 with timestamp, secret rotation | ✅ |
| Application API (`api_access_token`) | Frappe API key of a dedicated user; every role and record permission still applies | ✅ |
| API: send a message | `crm.api.outbox.queue_message`, idempotent through the outbox fences | ✅ |
| API: toggle status, assign | `conversations.apply_control` (take, release, close, reopen), with generation fences | ✅ |
| API: conversation history | `conversation_threads.get_history` | ✅ |
| API channel inbox (bring any channel in) | CRM Integration «Use as an inbox channel»: `channel_message` in, outbox → webhook out, `channel_status` | ✅ |
| Agent bot (webhook on each customer message, bot replies through the API) | events `message.created` + `queue_message`; the in-house customer bot (CRM Automation Policy) covers WhatsApp/Webchat | ✅ |
| Agent bot handoff to a human | `apply_control` bot/human transitions; `conversation.status_changed` tells n8n | ✅ |
| Contact / custom attribute webhooks | `contact.*`, `lead.*`, `deal.*`, `inquiry.created` | ✅ (more than Chatwoot) |
| Staff assistant over the API | books assistant `say` / `callback` + `assistant.message_created` / `decision_pending` | ✅ (Chatwoot had nothing similar) |
| Platform API (create accounts or users from outside) | Frappe REST under permissions; tenant provisioning is Boat's job | ◐ by design |
| Client API for a custom widget | Webchat channel (CRM Webchat Channel), with its own session API | ◐ different shape |

## Inbox features (what people used)

| Chatwoot | Muelle | |
|---|---|---|
| Channels: WhatsApp Cloud, Messenger, Instagram, website widget, email, API | WhatsApp (WABA), Messenger, Instagram (through Messenger), Webchat, email (Correo queue), API channel | ✅ |
| Telegram, SMS, Line channels | through the API channel and n8n | ◐ bridged |
| Assign to an agent or team | owner take/release, departments (`route`), Assignment Rules on leads/deals, manager queues (`workload`) | ✅ |
| Auto-assignment round robin for conversations | Assignment Rules cover leads/deals; conversations are taken from department queues | ◐ |
| Canned responses | composer `/` palette: templates and quick replies with shortcuts and record variables | ✅ |
| Private notes | FCRM Note on the linked lead/deal; the conversation itself has no internal note | ◐ |
| Labels on conversations | tags on records (masivo); no label on the conversation itself | ◐ |
| Conversation linked to contact or CRM record | `link_record` to Contact, Lead, Deal | ✅ |
| Macros (several actions at once) | n8n flows over the action API; no one-click macro in the inbox | ◐ |
| Automation rules (on event → action) | CRM Automation Policy for bot flows; anything else through events → n8n | ◐ |
| SLA | CRM Service Level Agreement on leads/deals; not on conversations | ◐ |
| CSAT survey after resolution | Encuestas exist (doco) but are not sent automatically when a conversation closes | ✗ |
| Reports (first response, resolution time) | CRM dashboard and sales reports; no conversation response-time report | ◐ |
| Typing indicator, read receipts | WhatsApp statuses shown; API channel statuses through `channel_status` | ◐ |
| Business hours / out-of-office auto reply | Holiday lists and service days exist for SLA; no out-of-office reply | ✗ |
| Help center (knowledge base) | not built | ✗ |

## Gaps worth building next

1. CSAT: send an Encuesta when a conversation is closed (`conversation.status_changed` already
   has the event; doco Encuestas has the form).
2. Internal notes and labels on CRM Conversation itself.
3. Out-of-office auto reply from the holiday list and service days.
4. A conversation report for first response and resolution time, from Control Events.
