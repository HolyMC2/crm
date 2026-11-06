# n8n (and any automation) ↔ CRM and the books assistant

The CRM sends signed webhooks to automations and accepts their actions through the same
whitelisted endpoints the CRM UI uses. n8n is one optional adapter: the CRM never depends on it.
If it is disconnected, the inbox, the outbox and the assistant keep working, and deliveries wait
and then go Dead. This replaces what Chatwoot gave n8n (webhooks, agent bot, API channel); Chatwoot
itself stays retired. The feature comparison is in [CHATWOOT_PARITY.md](../CHATWOOT_PARITY.md).

## 1. Set up a connection (Settings › Automations (n8n))

A System Manager opens **Settings › Automations (n8n)** in the CRM, creates a connection
(name + «Acts as user») and follows its five steps: webhook URL, acts-as user, API access
(**Create API key** generates the user's key and shows the `Authorization` header once, next to
the base URL and the `whoami` check), signing secret (show, copy, replace) and **Send test
event**. Events are ticked by what they describe, record types are added from a search that only
offers types the acts-as user can read, and **Deliveries** shows the counts and the latest
problems with **Send again**. The Desk form (CRM Integration) is the same document; the steps
below describe its fields.

1. Create a **dedicated user** for the automation (for example `n8n@<site>`). Give it only the
   roles it needs:
   - Sales User (or the shop role) to read and answer conversations, leads and deals;
   - an «Asistente Canal» row with channel «Desk» and external id = the user, if the
     automation should talk to the books assistant.
   Generate its **API key** (User → API Access). n8n sends `Authorization: token <key>:<secret>`.
2. New **CRM Integration**:
   - **Acts as user**: the dedicated user. Every payload is built as this user, so a webhook never
     carries more than the user could read in the CRM. Records the user cannot read are
     **Skipped**, not sent.
   - **Webhook URL**: the n8n Webhook node's production URL. Only `https` is accepted, and the
     host must resolve to public addresses. A private or `http` host (n8n on the LAN) must be
     listed in site config `crm_integration_allowed_hosts`.
   - **Events**: one row per event you want (catalog below).
   - Save. The signing secret (`whsec_…`) is created automatically. Use **Show signing secret**
     to copy it into n8n, and **Rotate** if it leaks. For 24 hours after a rotation every event
     carries two signatures, one per secret, so n8n keeps accepting events until you paste the
     new one; the verify snippet below accepts either.
3. **Enable**. If something is missing, enabling says exactly what (user without an API key, no
   URL, no events…).
4. **Send test event** posts a signed `ping` synchronously and shows the response.
   **Deliveries** lists every attempt. A Failed or Dead row has **Send again**.

## 2. Delivery and signature

Each event is one durable *CRM Integration Delivery* row, queued after the transaction commits.
The payload is built on the first attempt and then frozen, so retries send the same bytes.

- Retries: 30 s, 2 min, 10 min, 30 min, 2 h, 6 h, 12 h; after 8 attempts the row is **Dead**.
  HTTP 410 marks it Dead at once (the receiver asked to stop). A test `ping` is never retried:
  if it fails, it is Dead straight away. **Send again** needs the connection enabled.
- An event about a record that «Acts as user» may not read is **Skipped** and not sent, and so
  is one whose record was deleted before the send (its `document.deleted` still goes out). A
  deletion the user could not have seen is not sent. The row's error says which.
- Any 2xx is success. The connection shows the last status, consecutive failures and the last
  error.
- Delivered and Skipped rows are kept for 30 days, Dead rows for 90 days.

Headers follow [Standard Webhooks](https://www.standardwebhooks.com/):

```
webhook-id: <delivery id, stable across retries — use it to dedupe>
webhook-timestamp: <unix seconds>
webhook-signature: v1,<base64 HMAC-SHA256(secret_bytes, "<id>.<timestamp>.<raw body>")>
                   (two, space-separated, for 24 h after a rotation)
X-Muelle-Event: <event type>
```

`secret_bytes` is the base64-decoded part after `whsec_`. In n8n, verify in a Code node right
after the Webhook node (Webhook option «Raw body» on, «Respond» set to «Using 'Respond to Webhook'
node»), and answer only after the check: 2xx once the signature is good, 401 when it is not, so
the CRM retries what n8n refused (for example while you paste a rotated secret). Do not answer
«Immediately»: every request would count as delivered, bad signature or not. And do not refuse
by throwing: n8n 2.x answers 200 when a flow fails before its Respond node. n8n 2.x also blocks
both `require('crypto')` and `$env` in Code nodes by default, so set these in n8n's environment
and restart it:

```
NODE_FUNCTION_ALLOW_BUILTIN=crypto
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
MUELLE_WHSEC=whsec_…            # this connection's signing secret
```

Each connection has its own secret, so each workflow reads its own variable (the templates use
`MUELLE_WHSEC`, `MUELLE_CHANNEL_WHSEC` and `MUELLE_BOOKS_WHSEC`). Read the body with
`getBinaryDataBuffer`, which works whether n8n keeps binary data in memory or on disk:

```js
const crypto = require('crypto');
const h = $input.first().json.headers;
const body = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const key = Buffer.from($env.MUELLE_WHSEC.replace(/^whsec_/, ''), 'base64');
const expected = crypto.createHmac('sha256', key)
  .update(`${h['webhook-id']}.${h['webhook-timestamp']}.${body}`).digest('base64');
const ok = h['webhook-signature'].split(' ').some((s) => s === `v1,${expected}`);
if (!ok || Math.abs(Date.now() / 1000 - Number(h['webhook-timestamp'])) > 300) {
  return [{ json: { refused: 'Bad signature' } }];  // an IF sends this to a Respond 401
}
return [{ json: JSON.parse(body) }];  // the IF's true branch: Respond 204, then the work
```

Delivery is at-least-once: a CRM retry after a lost answer repeats `webhook-id`. Drop ids the
workflow already handled before doing anything a customer sees (the templates keep the last 1000
in the workflow's static data, in the «Seen before?» node).

Body:

```json
{
  "id": "<delivery id>",
  "type": "message.created",
  "api_version": 1,
  "timestamp": "2026-11-03T13:00:00Z",
  "site": "ventas.example.com",
  "connection": "INT-0001",
  "data": { "...": "event-specific, see below" }
}
```

`timestamp` is when the event happened, in UTC.

## 3. Event catalog

`GET /api/method/crm.api.integration.events` returns this list. `whoami` returns the caller's
connections.

| Event | When | `data` |
|---|---|---|
| `conversation.created` | a conversation is materialized | `conversation`: the inbox detail (provider, account, peer, owner, state, generation) |
| `conversation.status_changed` | take, transfer, release, pause, close, reopen, bot/human handover: the control state or the owner moved | `conversation` plus `change`: action, origin, actor, from/to state and owner, generation |
| `conversation.updated` | route, link to lead/deal, labels, snooze, metadata, and `request` (someone asked the owner for it; nothing moves) | `conversation` plus `change` (`action: "metadata"` lists the changed `fields`) |
| `conversation.note_created` | someone adds a private note (the customer never sees it) | `conversation` plus `note`: `id`, `author`, `content`, `mentions`, `created_at` |
| `conversation.rated` | the customer answers the satisfaction request | `conversation` plus `rating`: `id`, `rating` (1–5), `comment`, `agent`, `rated_at` |
| `conversation.reply_overdue` | a customer has waited longer than the inbox's first-reply goal (once per wait; only while open when office hours are on) | `conversation` plus `waiting`: `since`, `goal_minutes` |
| `message.created` | a customer or agent message on WhatsApp, Messenger, Webchat or the API channel | `message` (`id`, `direction` in/out, `content`, `content_type`, `attach`, `status`, `timestamp`), `conversation`, `thread` (`provider`, `account_id`, `peer_id`) |
| `message.updated` | delivery status (sent, delivered, read, failed) | as `message.created` plus `change.status` |
| `outbound.updated` | an outbox intent changes state (queued, accepted, blocked, failed) | `intent`: as `outbox.get_intent` returns it |
| `contact.created` / `contact.updated` | Contact | `doctype`, `record` (the fields the user can read) |
| `lead.created` / `lead.updated` / `lead.status_changed` | CRM Lead | `doctype`, `record`; status changes add `change.from_status` / `to_status` |
| `deal.created` / `deal.updated` / `deal.status_changed` | CRM Deal | as leads |
| `inquiry.created` | storefront or form inquiry | `doctype`, `record` |
| `assistant.message_created` | the books assistant answered the connection user | see §6 |
| `assistant.decision_pending` | that answer has buttons waiting for a decision | see §6 |
| `document.created` / `document.updated` / `document.submitted` / `document.cancelled` | any record type chosen on the row (Sales Invoice, Item, Appointment…) | `doctype`, `record` (the fields the user can read); `updated` adds `change.fields` |
| `document.deleted` | that record type, deleted | `doctype`, `name`, `deleted_by` |
| `ping` | **Send test event** | `{}` |

Installs, migrations, patches and data imports do not emit events.

Every `conversation` object carries `waiting_since` (the customer's first message after the last
reply a person sent, or null) and `ratings` (the latest answers to the satisfaction request).

**Any record type.** A `document.*` row names its **Record type**. Child tables, settings pages
and system or security types (users, roles, logs, this engine's own rows) are refused with the
reason, and so is a type the acts-as user cannot read. A deletion is only sent to connections
whose user could read the record before it went. `change.fields` lists the fields whose stored
value changed (a blank and an unset value are the same; a child table counts once, by its rows'
content). Password fields are never sent. The hook checks one cached set of subscribed types
before doing anything, so record types nobody subscribed to cost a set lookup per save.

**Skip changes this connection made** (on by default) drops record and document events whose
change was made by the acts-as user itself, so a flow that writes back does not trigger itself.

## 4. Actions (n8n → CRM)

These are the same idempotent endpoints the inbox uses. Their fences (generation, request id)
protect against double sends and stale takes.

| Goal | Call (POST `/api/method/…`) |
|---|---|
| Reply in a conversation | `crm.api.outbox.queue_message(conversation, expected_generation, request_id, payload)` |
| Request, take, transfer, release, pause, close, reopen | `crm.api.conversations.apply_control(name, action, expected_generation, command_id, owner=None, reason=None)` (`owner` only for `transfer`) |
| Read the history | `crm.api.conversation_threads.get_history(conversation, cursor=None, limit=50)` |
| Route to a department | `crm.api.automation.route_conversation(name, department, expected_generation, command_id, reason=None)` |
| Link or unlink a lead, deal or contact | `crm.api.automation.link_record(name, doctype, docname, command_id)` / `unlink_record(…)` |
| Set the labels | `crm.api.inbox.set_labels(name, labels, command_id)` (`labels` is a JSON list of CRM Conversation Label names) |
| Add a private note, mentioning people | `crm.api.inbox.add_note(name, content, command_id, mentions=None)` (`mentions`: JSON list of users) |
| Snooze or wake | `crm.api.inbox.snooze_conversation(name, command_id, until=None, preset=None)` (`preset`: `1h`, `3h`, `tomorrow`, `next_week`, in site time) / `unsnooze_conversation(name, command_id)` |
| Run a macro | `crm.api.inbox.run_macro(name, macro, expected_generation, command_id)`; all steps or none |
| Read a queue | `crm.api.inbox.list_queue(view, state="open", label=None, department=None, start=0, limit=30)` (`view`: `mine`, `unassigned`, `all`, `snoozed`) |
| Turn your own new conversations on or off | `crm.api.inbox.set_availability(receives_new, user=None)` (another `user` needs a manager) |
| Who receives conversations (managers) | `crm.api.inbox.list_agents()` / `save_agent(user, receives_new=1, department=None, max_open=0)` / `remove_agent(user)` |
| Team performance (managers) | `crm.api.inbox.performance(from_date=None, to_date=None, department=None)`: first response, resolution, ratings per person, 92 days at most |
| Create or update leads, deals, contacts, notes, tasks | standard REST `/api/resource/<DocType>` (permissions apply) |

Use a stable `request_id` / `command_id` derived from the n8n execution, so a retried node never
sends twice.

**CRM Inbox Settings** (Settings › Customer inbox in the CRM, or Desk) runs the inbox's own
automation, so n8n does not have to:

- **Office hours and the away message.** Outside the hours or on a holiday, a customer who writes gets the away
  message once per `away_repeat_hours`.
- **Auto-assign.** A new customer message on an unowned conversation goes to a listed person who
  is available (they switch «Recibir conversaciones nuevas» in the inbox), can answer that team
  and is under their limit, with the fewest open conversations. It is recorded as an
  `auto_assign` control event.
- **Reopen.** A customer who writes on a closed conversation reopens it, back to the person who
  had it if they can still answer it (on by default).
- **Late-reply alerts.** A wait longer than the first-reply goal notifies the owner, or the
  managers when nobody has it, once per wait, and emits `conversation.reply_overdue`.
- **Satisfaction rating.** When a conversation closes, the customer gets a `/rate/<token>` link.
  The first answer counts and emits `conversation.rated`. A link expires after the configured
  days.
- **Response targets** for the performance report.

Away messages, rating requests and macro replies are outbox intents with `origin: Automation`,
so `outbound.updated` reports them like any other send.

## 5. API inbox channel (bring another channel into the inbox)

Tick **Use as an inbox channel** on the connection. It gets a 64-character channel account, and
the inbox lists it as account type «API» next to WhatsApp and Webchat. This works like a
Chatwoot API inbox. n8n bridges any channel (Telegram, SMS, email, another chat) this way:

- **Inbound**: `crm.api.integration.channel_message(contact_id, text, message_id, sender_name=None, connection=None)`.
  - `contact_id` is the customer's id on that channel (letters, digits and `._:@+=-`, up to 128
    characters).
  - `message_id` is your channel's id for the message. Repeating it with the same text is a safe
    replay; repeating it with different text is refused.
  - The message opens or continues the conversation, with ownership and take/release/close
    exactly as for other channels.
- **Outbound**: an agent's reply goes through the outbox. The channel's own connection receives
  `message.created` with `data.message.direction: "out"` whether or not it subscribes to it, and n8n delivers
  it. The inbox shows «Entregado a la conexión».
- **Status**: `crm.api.integration.channel_status(message, status)`, with `status` one of
  `sent`, `delivered`, `read` or `failed`. It emits `message.updated`.
- `connection` is only needed when the user owns more than one channel connection.

## 6. Books assistant (agent-bot style)

The assistant treats the automation as an ordinary staff member. It has the same role gates as a
person, and a channel never adds power.

- **Talk**: `doco.docoutils.assistant.api.say(text, client_id=…)`. `client_id` makes a retry
  safe. The answer arrives asynchronously.
- **Receive**: subscribe to `assistant.message_created`, and `assistant.decision_pending` for
  answers with buttons. Only the connection user's own chat (`desk:<user>`) is ever sent; nobody
  else's assistant history leaves the site.

  ```json
  {"chat": "desk:n8n@site", "message": {"id": "…", "text": "¿Registro el gasto de $350?",
   "answer_id": "…", "created": "…", "buttons": [{"text": "Aprobar", "data": "dec:1:a"}],
   "reference": {"doctype": "Purchase Invoice", "name": "…"}},
   "reply": {"say": "/api/method/doco.docoutils.assistant.api.say",
             "callback": "/api/method/doco.docoutils.assistant.api.callback"}}
  ```
- **Decide**: `doco.docoutils.assistant.api.callback(data=<button data>)`.

## 7. Templates

[`n8n/`](n8n/) holds importable workflows:

- `crm-webhook-verify.json`: Webhook → verify the signature → route by `type`.
- `api-channel-bridge.json`: an inbound channel → `channel_message`; `message.created` (out) →
  send → `channel_status`.
- `books-assistant-relay.json`: a message → `say`; `assistant.message_created` → forward the
  text; a button → `callback`.

Each workflow is its own connection, with its own webhook URL and secret:

| Template | Webhook path(s) | Environment |
|---|---|---|
| `crm-webhook-verify.json` | `muelle-crm` | `MUELLE_WHSEC` |
| `api-channel-bridge.json` | `muelle-crm-channel`, `my-channel-inbound` | `MUELLE_CHANNEL_WHSEC`, `MUELLE_SITE_URL`, `MY_CHANNEL_SEND_URL` |
| `books-assistant-relay.json` | `muelle-books`, `books-ask`, `books-decide` | `MUELLE_BOOKS_WHSEC`, `MUELLE_SITE_URL` |

Every CRM-facing workflow runs Webhook → **Verify signature** → **Signed?** → **Accepted** (204) →
**Seen before?** → the work; a refused request ends at **Refuse** (401). The channel bridge
reports each send as `sent`, or `failed` when your channel does not answer 2xx, so the inbox shows
it.

Set the Header Auth credential (`Authorization: token key:secret`) on the HTTP Request nodes;
no secret lives in the JSON. The entry points other systems call (`my-channel-inbound`,
`books-ask`, `books-decide`) use **Header Auth** too: give them their own credential (a header
your channel or app sends), never the CRM key. `books-ask` and `books-decide` act with the
connection user's access to the books, and an open URL would let anyone ask or approve. They
answer when the flow has finished, so the caller sees a failure and can retry
(`channel_message` dedupes on `message_id`; the books relay passes the caller's `id` as the
assistant's `client_id`, so a caller of `books-ask` sends `{text, id}`). The webhook nodes carry a `webhookId`, so the production URL is
`https://<n8n>/webhook/<path>` however the workflow is imported (UI or `n8n import:workflow`;
after a CLI import, `n8n publish:workflow --id=<id>` and restart n8n).
