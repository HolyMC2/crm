# Chat surfaces and ownership

User direction, 2026-09-10 UTC: keep chat simple across the existing assistant,
CRM support and storefront; Chatwoot is no longer used. This records the design
decision and rollout scope. Native Webchat is now implemented and verified in the
local lab; see the [accepted source handoff](CRM_NATIVE_SUPPORT_HANDOFF_2026-09-10.md).
Production activation remains gated.

## Product contract

One launcher per surface. A customer conversation has one server-owned thread,
one accountable owner and one delivery history regardless of whether a human
or an approved bot responds. CRM Inbox is the staff's customer-support workspace;
it is not another floating chat window.

| Surface | Entry point | Conversation authority |
| --- | --- | --- |
| Desk / CRM staff | One private assistant launcher | Current authenticated user; private assistant history and permissions |
| CRM customer support | Existing Inbox navigation and contextual customer thread | Assigned team/staff; explicit human/bot ownership and durable outbound intents |
| Storefront | One customer-help bubble; WhatsApp/contact fallback when native chat is unavailable | Server-selected tenant/store, isolated visitor session, native customer conversation service |

The storefront bubble may offer WhatsApp as a channel choice within the same
entry point. Do not stack separate assistant, WhatsApp and support launchers.
Customers see their own help thread, never staff notes or private assistant
history. Cross-channel linking requires explicit verified identity; matching a
phone, name or browser cookie does not merge people or expose another thread.

"CRM support" is implemented as staff helping customers. If platform support is needed,
it belongs within the same staff Help entry, but routes to a separately authorized
Muelle support conversation. An ordinary customer thread never grants platform
operator access. This ambiguity does not block inbound reliability work.

## Accepted implementation

- Doco's authenticated assistant API and user-addressed realtime transport own
  staff assistant messages. The Desk launcher currently depends on Desk globals;
  CRM needs a thin adapter if the assistant is exposed there. Screen context must
  distinguish concurrent surfaces so one tab cannot overwrite another's context.
- CRM Inbox and the native Desk Customer Conversations Page use the same private
  conversation/control/outbox service. Durable ownership and current generation
  govern manual WhatsApp/Webchat replies; private notes stay outside customer history.
- Storefront now has an embedded receiver and one persisted bubble. Server-selected
  tenant/profile/origin, hash-only visitor authority, a Secure/HttpOnly cookie,
  bounded input/rates and private history were verified. Response loss preserves
  the same command; session changes never move a pending send into another thread.
- The optional old WhatsApp widget suppresses its FAB/navbar and blocks phone-only
  customer APIs/notifications when native CRM is present. Truly old/missing CRM
  retains compatibility; partial native installs fail closed. Its actual installed-
  app browser rollout remains a gate.
- Reuse Frappe database and workers. Keep core CRM usable without marketing,
  Meta or an AI provider. Do not introduce a Chatwoot dependency or another
  workflow engine.

The Doco staff assistant has broader operational capabilities than a customer
support bot. Public input must not use its service user, assistant channel,
Books Chat Log or private session history. An optional customer bot operates
through bounded customer-support actions and the same ownership/send checks
as every other actor.

## Delivery gates

1. Complete authenticated durable inbound processing and source identity first.
2. Add durable human/bot/paused/closed ownership with a version; takeover or a
   verified human reply invalidates pending bot actions before submission.
3. Route sends through durable intent state. After uncertain submission, show
   Unknown and reconcile; never silently resend after a timeout or reload.
4. Add the storefront channel through that service and verify tenant isolation,
   reconnect/replay, permissions, human handoff and desktop/mobile launcher
   behavior using fictional fixtures and blocked external transports.
5. Expose each tested surface under its documented rollout gate. A launcher or
   connected account alone is not evidence of a working support journey.

These local source/verification gates passed for manual WhatsApp and Webchat,
including actual visitor→staff take/reply→visitor, real concurrent commits/crashes,
private access and mobile behavior. Automation readiness remains false; Messenger
core dispatch and Instagram transport have separate unresolved gates. Exact
package heads and current production steps are in the accepted source handoff.

## Retired Chatwoot attachment

Read-only Meta inventory found WABA `2954965221375122` still subscribed to
app `1418834030282521`, named **Doco Chatwoot Connector**, alongside the active
ERPNext connector `2082376078930469`. The user confirms Chatwoot is retired.

Prepare removal scoped only to the retired app/WABA attachment after checking
its callback and dependencies. Preserve the active app, phone mappings, receipt
evidence and existing Page subscriptions. No production subscription/config
mutation is authorized by the current local implementation request; no removal
has been performed. Record the approved operation and GET verification when the
production rollout is authorized.

See [next-session scope](CRM_NEXT_SESSION.md),
[completion plan](CRM_COMPLETION_PLAN_2026-09-09.md) and
[requirements](CRM_POWERHOUSE_REQUIREMENTS.md).
