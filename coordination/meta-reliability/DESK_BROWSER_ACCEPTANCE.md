# Native customer conversations: actual Desk browser acceptance

Verified 2026-09-10 on the isolated eight-app Meta site and two-app CRM site.
The tested overlay was CRM `c92b48277`, Doco `81a7cc2`, and the committed P4/P5
WA/marketing candidates, plus the approved Desk account-route change below.
Root's subsequent Webchat edits were not copied into this test process.

## Result

- [Eight-app final browser log](DESK_BROWSER_EIGHT_VERIFIED.log): real Sales User
  login; Desk Ctrl+K → “Conversaciones” → “Open Conversaciones de clientes”;
  exact authorized account; thread/history; human takeover; durable reply queue;
  lost response reconciliation; cancel; release; stale-generation rejection.
- The first queue request reached the real Frappe RPC and committed `Queued`.
  Playwright discarded only that successful response. The second request reused
  the identical UUID, generation, conversation and frozen body, adding exactly
  one durable row. A third request deliberately used a stale generation and a
  new key; it was rejected. The final run preserved one previously cancelled
  test row, so its explicit row count was 1 → 2, with only one new row.
- Actual RPC denied the other shop/account and disabled private assistant peer.
  Clinical-only history was unavailable; mixed clinical messages supplied no
  preview or body. All record content was fictional. HTML stayed inert.
- At 375px, document width/scroll width were both 375px and the workspace width/
  scroll width were both 364px. Native Desk's mobile sidebar was dismissed using
  its normal outside click before completing the cancel/release actions.
- Authorized account route options were consumed once. An unauthorized requested
  account showed an unavailable message, an empty selector and no threads,
  despite another account remaining authorized.
- [Core-only browser log](DESK_BROWSER_CORE_VERIFIED.log): real Sales User login
  and the same native command-search entry loaded the Page with no accounts and
  no composer. Both completed runs had zero JavaScript runtime errors.

## Product change and focused checks

Only `crm/fcrm/page/customer_conversations/customer_conversations.js` and
`frontend/tests/unit/conversationDesk.test.js` changed in this follow-up.
The Page consumes `{provider, account_id}` from `frappe.route_options` during
load, selects only an exact authorized match, and never falls back to another
account when the requested scope is unavailable. It leaves an explicit empty
selector so the operator can choose a different authorized account deliberately.

`conversationDesk.test.js`: **9 passed**, including requested second account,
unknown account, wrong provider, incomplete scope, frozen command/reply retries,
actor changes, text safety and Unknown action restrictions. ESLint passed for
the test and the Page source (via the frontend configuration/stdin); Python
compile and JavaScript syntax checks passed for the proof scripts.

## Isolation and retained records

The [eight-app database evidence](DESK_DB_EIGHT_FINAL.log) and
[core-only database evidence](DESK_DB_CORE_FINAL.log) record the installed app
paths, Page existence and persistent maintenance/pause/mute flags **1/1/1**.
Changed apps resolved from `/tmp/meta-wa-20260910`; unchanged framework apps used
their installed bench packages. No shared setting or service was changed.

The dedicated WSGI process temporarily bypassed maintenance only in its own
request-local configuration. It accepted only its one fixed isolated site.
Requests and SMTP transports raised; enqueue and mail hooks were suppressed.
The localhost proxy and browser blocked external destinations. No outbound
worker ran: every retained intent has **0 attempts** and no provider message ID.
This proves UI/admission/permission behavior, not provider delivery or Socket.IO
push delivery; state updates were read through actual RPCs.

All owned fixture users are disabled. Both fictional WhatsApp accounts and
shops are disabled; the conversation is Closed, bot disabled, with cancelled
intents. Immutable events and fictional message records remain as audit evidence.
The earlier diagnostic fixture `desk-proof-63ba10e0d4@example.invalid` was also
closed/disabled with its one intent Cancelled before the final fixture was made.
Temporary credential manifests were replaced with password-free copies after
cleanup. The dedicated WSGI process and localhost proxy are stopped.

## Reproduction and diagnostic history

The bounded harness scripts are [server](conversation_desk_server.py),
[proxy](conversation_desk_proxy.py), and [browser](conversation_desk_browser.mjs).
They require root's guarded Page migration and exact isolated app overlay first;
they do not migrate, dispatch, modify global settings or start shared services.
Inside the backend: `setup`, then `serve`, and finally `cleanup` / `inspect`,
with `--site eight` or `--site core`. The browser uses a mode-0600 temporary
fixture credential file copied locally; credentials are never stored here.

Complete HTTP evidence is retained in [eight-app](DESK_HTTP_EIGHT.log) and
[core-only](DESK_HTTP_CORE.log). The test server intentionally has no Socket.IO
service, so local `/socket.io/` requests return 404.

Earlier harness-only failures are retained rather than hidden:
[initial](DESK_BROWSER_INITIAL.log),
[resume diagnostic](DESK_BROWSER_RESUME_DIAGNOSTIC.log),
[entry diagnostic](DESK_BROWSER_ENTRY_DIAGNOSTIC.log), and
[core selector diagnostic](DESK_BROWSER_CORE_DIAGNOSTIC.log). They identified
the native mobile scrim, a resume interceptor accidentally treating the deliberate
stale rejection as a drop candidate, and native search labels hidden/different
across layouts. The final verified logs above supersede these incomplete runs.
