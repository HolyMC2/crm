# CRM next session

Current product direction (2026-09-26): build Muelle's product named **CRM**, with a distinct icon,
that excels at standalone sales, with connected POS/Taller/storefront work and
optional omnichannel/bot capabilities. Use the
[prioritized product roadmap](CRM_PRODUCT_ROADMAP.md) and its **First execution
queue**; confirmed name and icon direction live in the
[identity brief](CRM_IDENTITY_BRIEF.md).

The full roadmap is approved. Facebook/WhatsApp catalog commerce is the first
integration priority; Mercado Libre follows. Final acceptance requires the
[harsh contract](CRM_ACCEPTANCE.md) and actual Claude Opus 5.5 READY review.
Continue identity/correctness and independent sales semantics. Preserve native
tasks, conversations, commercial adapters and automation already implemented.
Verify current source, installed apps and runtime before executing any rollout.
The September 25 production receipt supersedes older package-deployment claims;
deployment does not imply that a tenant's follow-up rules or bots are activated.

## Historical handoff: native support, 2026-09-10

The remainder is preserved as dated context. Its branch-divergence, pending-rollout
and automation-readiness statements are historical, not current assignments.
Revalidate any provider-specific gate against today's account and implementation.

The September 9 implementation request has been carried through tested, committed
local integration. **Do not rebuild those slices from the old audit.** Read the
current [source/verification handoff](CRM_NATIVE_SUPPORT_HANDOFF_2026-09-10.md) first.
It records exact accepted heads, remaining source/provider gates and evidence.

Continue from current shared branches in `~/muelle-host`, preserving later clinic
and other commits. The clinic lane has published CRM merge `e2cec7e0a` as its frozen
R3 cutoff; it diverges from our completed native-support source. Before any later
publication, refresh remote refs and integrate both histories with fresh combined
validation. Do not overwrite or rebase published clinic history. See the current
handoff's publication section. Relevant references remain:

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
