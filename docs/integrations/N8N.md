# n8n (and any automation) ↔ CRM and the books assistant

The CRM sends signed webhooks to automations and accepts their actions through the same
whitelisted endpoints the CRM UI uses. n8n is one optional adapter: the CRM never depends on it.
If it is disconnected, the inbox, the outbox and the assistant keep working, and deliveries wait
and then go Dead. This replaces what Chatwoot gave n8n (webhooks, agent bot, API channel); Chatwoot
itself stays retired. The feature comparison is in [CHATWOOT_PARITY.md](../CHATWOOT_PARITY.md).

## 1. Set up a connection (Desk → CRM Integration)

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
     to copy it into n8n, and **Rotate** if it leaks.
3. **Enable**. If something is missing, enabling says exactly what (user without an API key, no
   URL, no events…).
4. **Send test event** posts a signed `ping` synchronously and shows the response.
   **Deliveries** lists every attempt. A Failed or Dead row has **Send again**.

## 2. Delivery and signature

Each event is one durable *CRM Integration Delivery* row, queued after the transaction commits.
The payload is built on the first attempt and then frozen, so retries send the same bytes.

- Retries: 30 s, 2 min, 10 min, 30 min, 2 h, 6 h, 12 h; after 8 attempts the row is **Dead**.
  HTTP 410 marks it Dead at once (the receiver asked to stop).
- Any 2xx is success. The connection shows the last status, consecutive failures and the last
  error.
- Delivered and Skipped rows are kept for 30 days, Dead rows for 90 days.

Headers follow [Standard Webhooks](https://www.standardwebhooks.com/):

```
webhook-id: <delivery id, stable across retries — use it to dedupe>
webhook-timestamp: <unix seconds>
webhook-signature: v1,<base64 HMAC-SHA256(secret_bytes, "<id>.<timestamp>.<raw body>")>
X-Muelle-Event: <event type>
```

`secret_bytes` is the base64-decoded part after `whsec_`. In n8n, verify in a Code node right
after the Webhook node (Webhook option «Raw body» on):

```js
const crypto = require('crypto');
const h = $input.first().json.headers;
const body = Buffer.from($input.first().binary.data.data, 'base64').toString('utf8');
const key = Buffer.from($env.MUELLE_WHSEC.replace(/^whsec_/, ''), 'base64');
const expected = crypto.createHmac('sha256', key)
  .update(`${h['webhook-id']}.${h['webhook-timestamp']}.${body}`).digest('base64');
const ok = h['webhook-signature'].split(' ').some((s) => s === `v1,${expected}`);
if (!ok || Math.abs(Date.now() / 1000 - Number(h['webhook-timestamp'])) > 300) {
  throw new Error('Bad signature');
}
return [{ json: JSON.parse(body) }];
```

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

## 3. Event catalog

`GET /api/method/crm.api.integration.events` returns this list. `whoami` returns the caller's
connections.

| Event | When | `data` |
|---|---|---|
| `conversation.created` | a conversation is materialized | `conversation`: the inbox detail (provider, account, peer, owner, state, generation) |
| `conversation.status_changed` | take, release, close, reopen, bot/human handover | `conversation` plus `change`: action, origin, actor, from/to state and owner, generation |
| `conversation.updated` | route, link to lead/deal, metadata | `conversation` plus `change` |
| `message.created` | a customer or agent message on WhatsApp, Messenger, Webchat or the API channel | `message` (`id`, `direction` in/out, `content`, `content_type`, `attach`, `status`, `timestamp`), `conversation`, `thread` (`provider`, `account_id`, `peer_id`) |
| `message.updated` | delivery status (sent, delivered, read, failed) | as `message.created` plus `change.status` |
| `outbound.updated` | an outbox intent changes state (queued, accepted, blocked, failed) | `intent`: as `outbox.get_intent` returns it |
| `contact.created` / `contact.updated` | Contact | `doctype`, `record` (the fields the user can read) |
| `lead.created` / `lead.updated` / `lead.status_changed` | CRM Lead | `doctype`, `record`; status changes add `change.from_status` / `to_status` |
| `deal.created` / `deal.updated` / `deal.status_changed` | CRM Deal | as leads |
| `inquiry.created` | storefront or form inquiry | `doctype`, `record` |
| `assistant.message_created` | the books assistant answered the connection user | see §6 |
| `assistant.decision_pending` | that answer has buttons waiting for a decision | see §6 |
| `ping` | **Send test event** | `{}` |

Installs, migrations, patches and data imports do not emit events.

## 4. Actions (n8n → CRM)

These are the same idempotent endpoints the inbox uses. Their fences (generation, request id)
protect against double sends and stale takes.

| Goal | Call (POST `/api/method/…`) |
|---|---|
| Reply in a conversation | `crm.api.outbox.queue_message(conversation, expected_generation, request_id, payload)` |
| Take, release, close, reopen, hand to the bot | `crm.api.conversations.apply_control(name, action, generation, command_id)` |
| Read the history | `crm.api.conversation_threads.get_history(conversation, cursor=None, limit=50)` |
| Route to a department | `crm.api.conversations.route(name, department, expected_generation, command_id, reason=None)` |
| Link to a lead, deal or contact | `crm.api.conversations.link_record(name, doctype, docname, command_id, remove=False)` |
| Create or update leads, deals, contacts, notes, tasks | standard REST `/api/resource/<DocType>` (permissions apply) |

Use a stable `request_id` / `command_id` derived from the n8n execution, so a retried node never
sends twice.

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

Set the credentials (`Header Auth`: `Authorization: token key:secret`) and `MUELLE_WHSEC` in
n8n; no secret lives in the JSON.
