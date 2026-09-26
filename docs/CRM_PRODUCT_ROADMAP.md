# CRM product roadmap: independent sales and connected commerce

Date: 2026-09-26. Product direction: Marco's request for a distinct identity, excellent standalone sales, connected POS/Taller/storefront, extensible channels and bots, premium mobile and Desk experiences, and powerful configuration.

**Status: approved for full implementation; planned features are not yet certified as shipped.** User confirmed the name **CRM** and requires a distinct icon; see the [identity brief](CRM_IDENTITY_BRIEF.md). Facebook and WhatsApp catalog commerce are the first integration priority; selected marketplace Mercado Libre follows. The [acceptance contract](CRM_ACCEPTANCE.md) requires exact-source evidence and an actual Claude Opus 5.5 READY verdict. Older plans remain dated evidence; the form-scripting plan is a technical backlog, and the shop-bot plan continues to own automation implementation.

## Product promise

A salesperson can capture a prospect, understand the customer, agree the next action, prepare an offer, close the sale and see fulfilment without losing context. That experience works on Frappe + CRM alone. Installed business apps add the real payment, stock, repair and channel actions with their own permissions and records.

The commercial pipeline belongs to sales. Repair progress, delivery progress, payment status and conversation ownership are related but independent state axes. A repair becoming ready is not universally a won sale; receiving a message is not verified identity or consent; an order is not collected revenue.

## Baseline and evidence

Production was checked read-only on 2026-09-26: eight runtime actors use image `all-apps-20260925-881f958`, whose release receipt pins CRM `ed9e8dc23`. The roadmap lane starts from fresh mainline `0642fea5e`, which also includes outbox translation and CI changes. These are different baselines, not a claim those later commits are deployed.

Doco has 799 deals and 340 CRM tasks, with zero dated tasks; its repair-follow-up setting is off. Mumu has seven deals and no CRM tasks. Neither shop has CRM Automation Policy records. These are aggregate observations, not an instruction to backfill or activate customers.

| Capability | Current evidence | Roadmap consequence |
| --- | --- | --- |
| Sales records, import, forms, conversion, product lines, tasks, hierarchy and configurable fields | Native CRM controllers and UI exist | Complete and verify the connected sales journeys; retain useful foundations |
| Follow-up queues, inline scheduling, grouping and shared views | Shipped list/detail functionality | Prioritize adoption, task continuity and team ownership |
| Stages | One tenant-wide CRM Deal Status set; no separate pipeline model found | Add independent pipelines without relabelling repair history |
| Sales numbers | `pipelineMath.js` filters funnel rungs to Open; native intermediate sales stages use Ongoing. Dashboard forecast counts Lost expected value and differs from board arithmetic | Fix semantics before expanding reports; reproduce with a normal sales dataset |
| Standalone gaps | Native dashboard exists; redesigned reports and duplicate tools call marketing. Current quote actions require ERPNext; commercial section discovery also requires marketing | Move essential sales ownership into CRM; expose optional commerce through providers |
| Connected operations | ERP sales-document services, Taller links, native conversation/control/outbox and durable automation runtimes exist | Extend their contracts; do not create replacement order, inbox or bot engines |
| Identity | Upstream app title/assets coexist with tenant branding; active rail uses a literal C; rail/mobile read a reactive brand object as a ref | Unify the identity source before applying the new name/icon |
| Mobile and team UX | Responsive shell, phone Kanban, saved context and workload reassignment exist; zoom is disabled and workload errors can appear as permission denials | Preserve the good interaction model; fix accessibility and recovery gaps |

Source anchors: [pipeline arithmetic](../frontend/src/utils/pipelineMath.js), [native dashboard](../crm/api/dashboard.py), [capability discovery](../crm/api/capabilities.py), [follow-up service](../crm/pipeline/services/follow_up.py), [pipeline tracker](CRM_PIPELINE_PLAN_2026_09_13.md), [native-support evidence](CRM_NATIVE_SUPPORT_HANDOFF_2026-09-10.md). Cross-app evidence lives in `~/muelle-host/doco/docs/AUTOMATIONS.md`, `doco/docs/AUTOMATIONS_ACCEPTANCE_20260923.md`, `taller/docs/GAP_CLOSURE_2026_09_15.md`, and `~/muelle-releases/all-apps-20260925/`.

## Priority order

Each row is a product outcome with a release gate. Mobile, Desk, configuration and failure recovery are requirements throughout, not a final polish phase. There are no calendar promises until the first packages are sized and staffed.

**Execution override from the user:** complete the active P0/P1 foundations while delivering Facebook/WhatsApp catalog commerce as the first connected sales journey. Pull its necessary customer, conversation and ERP order contracts forward from P2/P3. Next comes Mercado Libre. This ordering does not remove standalone sales, POS, Taller, storefront, bots or SaaS acceptance.

| Priority | Outcome | Main work | Depends on | Exit gate |
| --- | --- | --- | --- | --- |
| P0 | A distinct product with trustworthy basics | Confirmed CRM name, distinct icon, unified identity, sales-number corrections, zoom and truthful errors | Name confirmed | Consistent identity across surfaces; reconciled funnel/forecast; usable recovery |
| P1 | An excellent standalone sales CRM | Independent pipelines, prospect-to-close workflow, native reports/proposals, daily queues, team configuration and premium core UI | P0 calculation contract; rebrand can run in parallel | Real Frappe + CRM seller and manager journeys with optional apps absent |
| P2 | Sell once, fulfil through the owning app | ERP/POS, Taller and storefront handoffs; canonical customer/product/document links | P1 identities, amounts, pipeline and action contracts | Quote-to-paid/fulfilled and blocked/return journeys without re-entry or duplicate effects |
| P3 | A dependable omnichannel customer workspace | Channel capabilities, native queue convergence, social and marketplace journeys, routing/search/media | P1 customer scope; P2 commerce adapters for order actions | Each advertised channel passes account-specific receipt, reply, takeover and recovery |
| P4 | Useful, configurable automation and assistance | Extend existing recipes, policies, visual editor and scoped bots; measurable sales sequences and copilot | P1 actions; P2/P3 capabilities used by each recipe | Configure, simulate, publish, run, interrupt and recover one complete sales journey |
| P5 | A repeatable premium SaaS product | Fresh-tenant setup, templates, entitlements, scale/performance, upgrade discipline and measured adoption | Qualified packages above | New and existing tenants pass their supported installation/channel matrix |

### P0 — identity and correctness

Owner: CRM; Doco/Boat/storefront owners update their launcher entries when the identity is selected.

- Apply the [identity migration checklist](CRM_IDENTITY_BRIEF.md). Separate product identity from the tenant's business identity and preserve configured tenant branding.
- Define one commercial metric contract: open expected value, weighted forecast, won value, invoiced amount, collected amount and currency basis. Won/lost are outcomes; Lost contributes zero future forecast. Use per-deal semantics consistently rather than a maximum of stage aggregates.
- Include Open, Ongoing and appropriate On Hold stages in the normal sales funnel. Handle missing/stale stages and archived-stage history explicitly. Honour report period filters.
- Restore browser zoom. Distinguish unavailable service, denied permission, empty data and retryable failure in workload and other touched queues.
- Record focused acceptance before changing native defaults: mixed sales/repair data, multilingual labels, different currencies and users with restricted records.

**Done:** one small dataset reconciles board, list, funnel and report drill-down; a lost deal cannot inflate forecast; a server error is recoverable; a phone user can zoom. Rebrand has one agreed name, one mark and a complete asset/surface receipt. Calculation fixes need not wait for naming.

### P1 — standalone sales excellence

Owner: CRM. Optional business applications must not be required for routine customer, opportunity or next-action work.

**Seller journey:** today queue → capture/import prospect → review identity → qualify → convert once → choose pipeline → prepare offer → schedule/complete next step → won/lost → return to queue.

**Manager journey:** configure pipeline/team → distribute work → inspect overdue/stalled/unassigned opportunities → reassign → reconcile forecast and conversion → improve the rules.

Deliver in this order:

1. **P1-A: sales model and configuration.** Multiple pipelines with scoped stages, explicit outcome semantics, probability policy, defaults, role/transition requirements and archive/history behaviour. Existing records receive an explicit compatibility mapping; preserve their current repair links and historical stage evidence. Show repair status independently. Support company/currency and actor scope from the first migration.
2. **P1-B: daily execution and customer identity.** Reliable import preview and row errors; manual/forms/email capture; contact/account matching with explicit ambiguity review; replay-safe conversion; linked history, assignments and open tasks survive conversion. Today/overdue/no-follow-up queues show real work. Inline owner/stage/value edits use the same validation as detail forms. Snooze, dated next step, reminders and completion are distinct actions.
3. **P1-C: commercial closing.** Reuse native product/service rows for a versioned standalone offer with readable preview/export and recorded customer decision. This is a commercial proposal, not an invoice/order/payment engine. When ERP is installed, map the accepted version into the canonical ERP quotation/order flow. Distinguish expected, offered, accepted, invoiced and paid amounts.
4. **P1-D: manager control.** Essential pipeline/source/conversion/aging/forecast reports and reviewed duplicate management are CRM-owned. Reports drill into the same permission-scoped records and filters. Preserve existing assignment rules and hierarchy; unify their setup into understandable team/pipeline configuration. Upgrade workload views to unassigned, person, capacity and overdue work using the existing service; validate the newer mockups before implementation.

**Configuration included:** pipelines, stage requirements, product/service fields, activity types, business hours/timezone, owner defaults, assignment/capacity, role permissions, saved views, custom fields/layouts and templates. Reuse Frappe metadata and scripts behind safe forms; common sales setup must not require Python/JavaScript.

**Done:** a new Frappe + CRM site supports seller and manager journeys on phone, desktop SPA and relevant Desk lists/forms, with no ERPNext/Taller/marketing/Meta/AI calls required. Retry conversion, restricted identities, imports, reopen, stale edits and loss reasons are covered. Absence of an addon does not leave dead controls or break a sale.

### P2 — complete POS, Taller and storefront chains

Owners: CRM presents commercial context; the owning business app executes and validates the transaction.

| Chain | Required continuity | Acceptance |
| --- | --- | --- |
| CRM → ERP/POS → CRM | Customer/contact, accepted offer version, items, quantities, price/discount approval, company, branch/warehouse and source deal flow into the existing quotation/order/POS handoff. The deal shows payment and fulfilment receipts | Retry creates no second order/payment; changed stock/price/permissions require review; partial payment, credit, cancellation and return remain truthful; cashier and seller return to their queues |
| CRM ↔ Taller | One commercial opportunity can link multiple repair orders. Technical/QC/custody/parts stages remain Taller-owned; CRM handles customer decision and dated contact work | Quote revision invalidates only the affected acceptance; one ready repair does not imply all work delivered; notification proof and pickup tasks use the existing follow-up service; no historical messages on backfill |
| Storefront ↔ CRM ↔ ERP/POS | Explicit customer/visitor identity, inquiry/cart/order source and attribution; existing checkout owns the order/payment; staff see linked progress and answer from the canonical conversation | Guest inquiry → staff reply → accepted order → payment → pickup/shipping; duplicate webhook/reconnect and cancellation/return tested; store and shop permissions preserved |

Remove the accidental marketing dependency from ERP commercial discovery/facades through an additive, dependency-safe adapter. Inventory and reuse `doco.docoutils.deal_quotes`, `doco.docoutils.sales_docs`, current CRM vertical discovery and POS handoff endpoints. Do not move ERP stock, fiscal or payment rules into CRM.

**Done:** customers/products/source documents and return locations carry through; no copying IDs or re-entering known information; each blocked action says what is missing and links to its owning form. Financial posting, physical work and sending remain explicit authorised actions.

### P3 — omnichannel, social and marketplaces

Owners: CRM customer conversation/control/outbox; existing channel adapters for delivery; Marketing for campaigns/acquisition; Mercado for marketplace commerce.

**First connected package — Facebook and WhatsApp catalog commerce:** reuse `doco_meta_catalog` and the canonical storefront catalog. Prove publication, stock/price changes, rejected-item diagnostics and removal/reconciliation; send catalog/product/product-list through CRM's governed outbox; preserve product inquiry and cart context; review every cart line and identity before making one canonical draft order. Carry the order through payment, fulfilment and return with the customer conversation intact. Facebook catalog/Shop availability and Marketplace listing/order APIs are distinct account-dependent capabilities and must be presented truthfully. Mercado Libre is the next selected provider after this package.

1. **Unify staff work.** Project conversation queues, unread/needs-reply, assignment, SLA, snooze and linked sales work from canonical records. Preserve an exact account/peer identity and historical receipts. One help entry per customer surface; staff-private assistant history remains separate.
2. **Certify existing channels before adding breadth.** Publish a capability matrix for WhatsApp, Webchat, email, calls, Messenger and Instagram: receive, reply, attachments/media, templates/window rules, receipts, ownership, search and recovery. A connected account does not imply full channel support. Instagram Login native replies remain blocked until its ownership contract is implemented and proven.
3. **Connect social acquisition to sales.** Ads, forms, mentions/referrals and permitted comments retain source/campaign evidence, assigned follow-up and explicit person selection. A marketing audience is not the same thing as a verified customer. Preserve consent/purpose and opt-out across channels.
4. **Qualify one marketplace at a time.** After Meta catalog commerce, implement the selected Mercado Libre account/external-ID mappings through a bounded adapter, reusing Mercado's catalog/import and existing commerce contracts. Link seller account, external buyer/order/listing, canonical customer/order and sales opportunity. Only expose messaging when the provider supports the account/use case. Prove inquiry/order → staff action → fulfilment → return/refund, including settlement visibility when supported.

**Done per channel/provider:** own-account inbound, correct staff queue, human reply, accepted/delivered/unknown distinction, media where advertised, takeover, expired credentials, replay/reconnect, opt-out and tenant isolation. Unsupported actions show a useful next step rather than claiming parity. No new marketplace-wide connector framework without a first working chain.

### P4 — configurable bots and sales assistance

Owners: Doco's internal workflow/runtime and capability registry; Marketing's customer Chatflow definitions/runs; CRM's inbound policy, conversation ownership and outbox.

The native automation runtime and builder already exist. Extend them around commercial actions established in P1/P2; do not rebuild a workflow engine or expose the private staff assistant to customers.

- Start with configurable recipes: qualify a new inquiry; route to a seller; remind about an unanswered proposal; request missing order information; notify ready-for-pickup; offer an explicitly consented reactivation.
- Recipes have manager-editable triggers, scope, hours, delay, conditions, owner fallback, purpose/consent, approval, stop conditions and budgets. Human reply/takeover, a changed deal/order and opt-out supersede pending work.
- Reuse visual editor, guided setup and accessible step-list views. Draft → validate → simulate with fictional data → publish a version → bind one account → inspect runs → pause/recover. Existing runs retain their pinned revision.
- Copilot offers source-linked summaries, proposed replies and next actions. Suggestions remain distinct from saved facts and completed actions. Approved bot tools use the same business APIs and record-level checks as staff.
- Extend optional external/MCP adapters through scoped capabilities, audit identity and reversible configuration. A provider timeout or budget limit leaves work visible for a person.

**Done:** one complete sales recipe survives retry, worker restart, stale approval, changed consent, bot-budget exhaustion and human takeover without duplicate effects. Managers understand what will run and why it stopped. Measure task completion and corrections, not generated message count.

### P5 — tenant repeatability and scale

Owners: CRM plus Boat/Doco and the relevant integration owners.

- Guided sales-first onboarding with sample-free defaults and optional reviewed templates for retail, services and repair. Adding a vertical must not replace a tenant's sales model.
- Provision capabilities, configuration/templates and entitlements idempotently through Boat. Keep installation, permissions, configuration, account verification and feature activation as separate readiness states.
- Validate fresh standalone, ERP/POS, repair, storefront and second-tenant combinations. Upgrade/backfill previews preserve custom fields, stages, links and active runs.
- Set and measure route budgets: target p95 queue/detail load ≤2 seconds on a declared reference dataset/network, bounded pagination and no per-row queries. This is a proposed target, not a measured current result. Cold PWA load, degraded network and concurrent tenant work are separate scenarios.
- Ship observability for failed intake, stalled work, uncertain delivery, provider expiry and affected customer actions. Recovery links lead to the owning queue.
- Release only with exact-source CI, appropriate migration/asset receipts and production activation evidence. Expand the pilot after actual usage demonstrates reliable follow-up and complete handoffs.

## Architecture decisions that constrain every phase

| Concern | Canonical owner and rule |
| --- | --- |
| Prospect, contact/account, opportunity, activity, sales pipeline and commercial offer | CRM. Essential manual sales works without optional apps |
| Customer, item/price, quotation/order, invoice, stock, payment and accounting | ERPNext/owning commerce app. CRM stores links and explicit commercial snapshots, not a second ledger |
| Repair, parts, QC, custody and repair delivery | Taller. Commercial and technical progress remain separately visible |
| Public catalog, checkout and visitor surface | Storefront using existing business APIs; verified linking to CRM |
| Marketplace accounts/listings/order sync | Proposed bounded connector adapters coordinated with Mercado's catalog/stock surface; CRM adds relationship context and ERP owns transactions |
| Customer conversation, human/bot control and delivery intent | Existing CRM Conversation/control/outbox with versioned ownership |
| Campaigns, social acquisition and customer sequence definitions | Marketing, attached to CRM records with purpose/consent |
| Internal workflow execution, approved tools, model routing and budgets | Existing Doco automation/assistant platform; customer authority stays scoped |
| Tenant provisioning and entitlements | Boat; no endpoint call confers a missing role or activates a channel |

Extend current capability discovery with versioned, namespaced providers and a finite action contract: availability/reason, source and target scope, prerequisites, actor permissions, context, expected revision, command identity, owning action, outcome/receipt and next/return destination. Add contracts at the first real adapter, with backwards-compatible facades. Discovery remains bounded and allowlisted; no arbitrary code or URLs from provider metadata.

Commands are revalidated by the owning server before effects. Events carry source revision, tenant/account scope, event time and idempotency identity; consumers derive projections rather than rewriting source state. Unknown external outcomes require reconciliation. Revocation, concurrent actors and stale tabs are first-class cases.

## Premium mobile, desktop and Desk acceptance

- **Purposeful navigation:** Today, Prospects, Opportunities, Customers and Conversations are proposed primary queues; reports/settings are role-specific. Validate labels with real work rather than enforcing a fixed count.
- **One connected chain:** list → record → contextual action → linked result → next task/return. Preserve filters, selection, scroll position and customer/company/branch context. Routine Desk lists/forms and SPA actions share validation and outcomes.
- **Desktop:** clear record hierarchy, useful density, adjustable columns, inline actions, keyboard navigation, visible focus, bulk actions with preview and per-row results. Avoid dashboard cards that hide the working list.
- **Phone:** one active pane, reachable primary action, proper back behaviour, bottom sheets only for bounded work, keyboard-safe composer/forms, preserved drafts, camera/voice where supported, 44px targets, zoom and reduced motion. A desktop table compressed onto a phone is not acceptance.
- **Visual system:** one product mark and deliberate type/spacing/token system; coherent light/dark themes and tenant accent treatment; money/status/ownership have consistent placement and meaning. The [identity brief](CRM_IDENTITY_BRIEF.md) owns branding detail.
- **Honest states:** loading, empty, denied, stale, offline, partial failure and unknown delivery are different. Keep recoverable edits; never imply a send/payment completed because a button was clicked.
- **Accessibility and resilience:** check 360/390px phones and 1280/1440px desktops, text zoom, keyboard/screen-reader labels, contrast and no accidental page overflow. Preserve offline drafts; only queue writes whose replay semantics are explicitly supported.
- **Evidence:** seller, counter/cashier and manager journeys on actual browser UI with permitted and restricted roles. Mocked component tests complement real record/database acceptance.

## Configuration model

Simple defaults first; advanced controls progressively disclosed. Common setup uses forms, searchable records, previews and effective-setting explanations. Managers can see which company/team/pipeline/account a rule affects and why it applies.

Support scopes deliberately: tenant → company/branch/team/pipeline → permitted personal view; show inheritance and overrides. Version and audit business-affecting rules, allow preview/dry-run and rollback to a compatible revision, and protect active records/runs. Permission, accounting, identity and consent invariants cannot be weakened by a custom field or script.

Ship configuration with its feature: pipeline controls in P1, handoff defaults in P2, channel/routing rules in P3, recipe policies in P4. Do not defer configurability to P5.

## First execution queue

| ID | Task | Evidence needed before completion |
| --- | --- | --- |
| CRM-01 | Apply confirmed CRM identity and build the single brand resolver/mark surface inventory | Distinct icon; no unresolved default/tenant conflict; complete surface check |
| CRM-02 | Correct generic funnel and reconcile forecast semantics | Normal sales + repair + currency fixtures; report/board/detail drill-down agreement |
| CRM-03 | Restore mobile zoom and truthful workload error recovery | Phone zoom and keyboard checks; denied vs transient-error browser paths |
| CRM-04 | Specify and implement independent pipeline migration | Preview mapping, preserved repair/history links, multiple-pipeline and role tests |
| META-01/03 | First integration: Facebook/WhatsApp catalog → governed conversation → reviewed cart → canonical order | Publication/reconciliation, signed account receipts, native outbox fences, complete price/identity review, replay-safe order and actual provider evidence |
| CRM-05 | Prove standalone capture → conversion → task → close | Fresh minimal installation; repeated conversion, identity ambiguity and task continuity |
| CRM-06 | Deliver standalone offer and native essential reporting | Versioned offer acceptance; no optional-app requests; reconciled totals |
| CRM-07 | Complete one ERP/POS commercial handoff | Accepted offer to canonical documents/payment/fulfilment, retry and return evidence |
| CRM-08 | Enable one scoped repair follow-up pilot | Manager rules, ownership/dates, previewed open-work backfill, no historical sends |

CRM-01 and CRM-02/03 can run independently. CRM-04 establishes semantics before broad pipeline UI changes. CRM-08 reuses shipped code and can proceed earlier once its existing dependencies and tenant configuration are verified; it must not become a prerequisite for standalone sales.

## Measurement and maintenance

Track dated-next-action coverage of open deals, overdue age, response time, stage age, conversion, sales-cycle length, forecast error and completed handoffs. Define denominators and permission scope; exclude tests and distinguish task activity from verified revenue. Record initial values before setting adoption targets.

Each completed package updates this document with source SHA, test/CI evidence, lab/production status and remaining gates. “Implemented”, “tested”, “deployed” and “activated” are separate states. Recheck old receipts rather than carrying forward stale blockers or assuming deployed code is enabled.

Read [next-session entry point](CRM_NEXT_SESSION.md) before execution. Keep [older requirements](CRM_POWERHOUSE_REQUIREMENTS.md) for invariant detail and [pipeline history](CRM_PIPELINE_PLAN_2026_09_13.md) for prior work. The automation plan at `~/muelle-host/muelle/docs/SHOP_BOT_MASTER_PLAN.md` remains authoritative for its runtime boundaries; this roadmap determines the CRM's product priorities.
