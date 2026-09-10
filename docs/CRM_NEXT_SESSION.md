# Next session: native support rollout and remaining provider gates

The September 9 implementation request has been carried through tested, committed
local integration. **Do not rebuild those slices from the old audit.** Read the
current [source/verification handoff](CRM_NATIVE_SUPPORT_HANDOFF_2026-09-10.md) first.
It records exact accepted heads, remaining source/provider gates and evidence.

Continue from current shared branches in `~/muelle-host`, preserving later clinic
and other commits. Relevant references remain:

- [Workspace instructions](../../AGENTS.md) and target app instructions.
- [Chat surfaces](CRM_CHAT_SURFACES_2026-09-10.md).
- [Original integration handoff](CRM_INTEGRATION_HANDOFF_2026-09-09.md),
  [Meta audit](CRM_META_COVERAGE_AUDIT_2026-09-09.md),
  [completion plan](CRM_COMPLETION_PLAN_2026-09-09.md),
  [requirements](CRM_POWERHOUSE_REQUIREMENTS.md).
- [Clinic wiring](../../clinica/docs/CRM_VERTICAL_INTEGRATION.md).

## Current product direction

One private staff assistant; CRM Inbox/Customer Conversations for staff helping
customers; one storefront help bubble using that native customer service, with
WhatsApp within the same entry point. Chatwoot is retired. Public customer input
must never acquire the private assistant's authority or history. Channels default
disabled; bots remain off; identity and consent require explicit evidence.

## Continue in this order

1. Prepare/execute P0's coordinated real app-secret/source/cache/worker rollout
   only when production authorization covers it; prove an owned signed inbound.
   The accepted receiver source fails closed without secrets; the production
   rollout is still pending. Never restore unsigned acceptance.
2. Roll out the compatible durable-receipt/control/outbox/privacy bundle through
   guarded migrations, full deletion review, exact hook-cache refresh and worker
   source checks. Recheck actual receipt replay/recovery using owned events.
3. Activate only the intended storefront channel after real Boat/HTTPS routing,
   scoped agent permission and visitor→CRM→visitor acceptance. Include the optional
   old WhatsApp widget transition on sites where that app is installed.
4. Apply reviewed exact Meta subscription additions and remove only the retired
   Chatwoot attachment when authorized; verify provider delivery separately.
5. Complete the separately gated native bot producers, Messenger dispatch and
   current Instagram transport only with demonstrated purpose/control/consent and
   delivery/crash proof. Native automation readiness remains false until then.
6. Add further integrations only for a concrete complete business workflow. Keep
   clinic-owned relationships/actions and clinical privacy boundaries intact.

Codex owns logic, integration and final quality. Preserve concurrent edits; use
isolated checkouts, fictional fixtures and blocked external transports for local
checks. Re-read refs before focused commits/local fast-forwards. Communicate
consequential identity/consent, compatibility and external-effect decisions.

The current implementation request authorized local source work, lab verification
and shared-branch fast-forwards. It did **not** authorize remote pushes, production
configuration/subscription changes/deployment or customer sends. Another lane's
authorization does not transfer to this lane. Prepare concrete changes/evidence
before requesting a remaining authorization; do not repeat already granted scope.
