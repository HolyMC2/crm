# CRM Leads and Deals: gap assessment vs Odoo CRM (2026-09-13)

Audience: Marco and agents working on the CRM fork. Plain Markdown on purpose.

Question answered: "deals and leads views still feel weak compared to Odoo, what are
our gaps? the UI?"

Short answer: roughly one third UI, two thirds data model and workflow. The views
look empty because the pipeline underneath has nothing to render: no ordered sales
stages, no values, no dated next action. Restyling cards first would still ship
"No Title, MX$0.00".

## Evidence and sources

- Lab mirror `doco-mirror.lab.xoloitzcuintles.com`, headless screenshots of
  `/crm/leads`, `/crm/leads/view/kanban`, `/crm/deals`, `/crm/deals/view/kanban`,
  `/crm/deal/<id>` (Deal 360), `/crm/deals/<id>` (upstream page), `/crm/leads/<id>`,
  `/crm/pipeline-analysis`, `/crm/dashboard`. Viewport 1366x800.
- Read-only aggregates on the mirror and on prod (`frappe-doco-*` MCP).
- Two read-only code audits: frontend views (`frontend/src`) and data model plus
  automation (`crm/`, `doco_marketing/`, `doco/doco/crm/`). File references below
  come from those audits.

### Data, mirror (2,081 deals, 22 deal statuses)

| Stage | Deals | Sum deal_value |
|---|---|---|
| Approved (EN) | 683 | 0 |
| Aprobado (ES) | 682 | 2,050 |
| Completado | 635 | 68,250 |
| Por Entregar | 18 | 1,880 |
| New Lead | 14 | 1,400 |
| everything else | 49 | 0 |

Open leads (unconverted): 44, of which 43 in "New", 1 "Qualified".

### Data, prod (759 deals)

| Stage | Deals | Sum deal_value |
|---|---|---|
| Completado (Won) | 691 | 69,750 |
| Aprobado + Approved (Open) | 36 | 550 |
| Por Entregar | 17 | 1,880 |
| Cancelado, Garantia en Curso, Abandonado | 15 | 0 |

Open leads (unconverted): 8, of which 7 in "New".

Won deals average about 100 MXN of recorded value; open ones about 15. Values are
mostly never captured.

## What Odoo's pipeline has that ours does not

- Ordered stages with probability per stage; won and lost are actions with buttons,
  lost captures a reason.
- Expected revenue on every card; weighted total per column; forecast by close month
  that actually has data.
- A scheduled next activity on every card (type, due, owner), colored overdue / today
  / planned; "mark done, schedule next" loop; an Activities view.
- Priority stars, color tags, avatar, days in stage on the card; column fold, quick
  create in column, drag with persisted order.
- Stage stepper on the form; smart buttons to quotations, meetings, calls.
- Inline editing, group-by, keyboard shortcuts, true counts.

## Gap 1: the pipeline is a repair-order lifecycle, not a sales pipeline

- **Stages are Taller statuses in two languages.** `CRM Deal Status` on the mirror
  holds 22 rows at 11 positions: Awaiting Drop-Off / Esperando Recepcion, Awaiting
  Approval / En Cotizacion, Approved / Aprobado, Ready for Pickup / Por Entregar,
  Picked Up / Completado, Declined / Cancelado, Warranty Repair / Garantia en Curso,
  Beyond Economical Repair / Reparacion No Viable, No Fault Found / Sin Falla
  Detectada, plus Unclaimed, Abandonado (position 0, type Lost) and New Lead / Por
  Contactar. Board columns come out in that order; the funnel counts the twins as
  separate stages.
- **Every repair order becomes a deal and parks there.** Prod: 691 won, 36 open, all
  repair driven. Odoo keeps opportunities apart from tickets; here the deals list is
  a mirror of the workshop queue and sales metrics are noise (dashboard says 1.4K
  ongoing deals on the mirror).
- **Value, close date and probability exist but are neither filled nor shown.**
  `crm/fcrm/doctype/crm_deal/crm_deal.json` has `deal_value`,
  `expected_deal_value`, `expected_closure_date`, `closed_date`, `probability`,
  `currency`, `exchange_rate`, `next_step` (free text). `CRM Deal Status` has
  `probability` and `type` (Open / Ongoing / On Hold / Won / Lost).
  `crm_deal.py:239-265` copies the stage probability onto a deal and can auto-fill
  expected value; the forecasting switch (`DashboardSettings.vue:36-42`) makes value
  and close date mandatory. Probability renders in exactly one place,
  `components/doco/inbox/DealContextPanel.vue:172`. No settings UI edits per-stage
  probability.
- **Leads never move.** Contacted, Nurture, Qualified unused on mirror and prod. The
  list shows leads untouched for 376 days with no cue to act. Lead has no
  probability, value, priority or next step field at all.
- **Deal title is empty** on RO-generated deals; the upstream kanban shows "No Title".

## Gap 2: no next-activity discipline (biggest felt gap)

- **No dated next action on a deal or lead.** `next_step` is text without date or
  owner. The only dated next action in the model is `next_action_at` on
  `CRM Inquiry`. `CRM Task` has `due_date` and `priority` but no reminder field;
  reminders exist only for calendar events (`crm/api/event.py`).
- **Nothing on a row or card shows it.** The single "Proxima accion" bar lives in the
  Deal 360 header (`components/doco/inbox/DealHeader.vue:218-247`) with mark done and
  reschedule.
- **Lists sort by modified or score** (`pages/LeadsView.vue:413-424`,
  `pages/DealsView.vue`), never by what needs action now. No "my activities today"
  view.
- **Won and lost are status picks.** No Won / Lost buttons, no stepper
  (`pages/Deal.vue:10-37`). Lost reason capture is good: `LostReasonModal.vue`,
  enforced server-side at `crm_deal.py:267-275`.

## Gap 3: the redesign views hide what exists and lag the upstream ones

- **Redesign board** (`components/doco/BoardView.vue`, 83 lines): columns from
  status position with dot, label, count and, for deals, `sum(deal_value)`. Card =
  contact, device or phone, value. Absent: title, owner avatar, days in stage, next
  activity chip, tags, priority, column collapse, quick add in column, persisted
  card order, WIP limits. Board mode bumps page length to 200 and shows at most 200
  records across all columns (`LeadsView.vue:480-483`, `DealsView.vue:597-600`).
- **Redesign lists** (`pages/LeadsView.vue`, `pages/DealsView.vue`): no value on
  leads, deals "Valor" empty in practice, no close date, probability, SLA badge or
  next activity. No inline edit, no group-by, no keyboard shortcuts, count badge is
  loaded rows plus "+" (`LeadsView.vue:424`, `DealsView.vue:546`), saved views in
  localStorage only (`LeadsView.vue:519-587`), row menu without call / WhatsApp /
  email (`LeadsView.vue:709-722`), bulk = convert and delete.
- **Two parallel list systems.** Upstream `/leads/view/:viewType` and
  `/deals/view/:viewType` keep server columns, quick filters, group-by, shared
  public/private views, import, bulk edit and assign, SLA badge, per-column quick
  add, configurable card fields, load more, persisted card order
  (`components/ViewControls.vue:157-238`, `components/Kanban/KanbanView.vue`). The
  default routes land on the poorer redesign lists. Documented as deliberate in
  `docs/doco/wiki/08-frontend-rediseno.md:20-41`.
- **Two deal pages.** Deal 360 (`pages/Deal360.vue`) is conversation-first:
  WhatsApp thread, quick replies, macros, coaching notes, duplicate strip, score ring
  with probability. Upstream `pages/Deal.vue` is data-first. Neither shows pipeline
  state as a stepper with value, probability, close date and next action together.
- **Pipeline Analysis is unreachable** (route exists, no nav entry:
  `router.js:168-173`, `composables/navModel.js`) and its stage-to-stage drop-off is
  computed over a non-sequential status set, so it reports 0% conversion and a
  "-97% Aprobado to Por Entregar" drop that means nothing.
- **Dashboard forecast** (`crm/api/dashboard.py:757-800`) is probability weighted by
  expected close month, but the inputs are empty, so the chart has one point. Lost
  branch uses the raw expected value (not zero). No stage aging report although
  `CRM Status Change Log` has the raw material.
- **Mobile** drops bulk selection, column picker, the quick-action button row and the
  Events tab (`pages/MobileLead.vue`, `pages/MobileDeal.vue`).
- **Smaller irritants:** English stage names in a Spanish UI (Approved, New,
  Qualified), empty icon rows on upstream kanban cards, quick macros hardcode status
  names ("Por Entregar", "Completado": `DealContextPanel.vue`, noted in
  `doco_marketing/docs/INBOX_ROADMAP.md:183-186`), orphan-to-deal conversion throws
  when forecasting is on (`INBOX_ROADMAP.md:178-182`).

## What we have that is good and should be kept

- Lost reason modal with required reason and server enforcement.
- SLA model on lead and deal (first response, rolling response, hygiene sweeps).
- Scoring engine with rules, grades, decay and score log (`doco_marketing`).
- Auto-assignment (round-robin / least loaded), campaigns and steps, lifecycle hooks
  on won / lost, consent ledger.
- Deal 360 conversation workspace: WhatsApp 24h window chip, snooze, tags,
  duplicates merge, coaching, money documents rollup, vertical provider tab
  (taller, clinica via `doco/doco/crm`).

## Fix order

1. **Pipeline semantics.** One ordered, single-language status set per tenant with
   probability per stage (seed patch plus a settings UI). Decide what a repair order
   is in the CRM: its own board, or no deal until a quote is in play. Require value
   and close date from the quoting stage on (forecasting switch already exists).
   Auto-title deals from device plus customer.
2. **Next activity as a first-class field** on CRM Lead and CRM Deal (type, due,
   owner). Show it on every row and card with overdue / today / planned color. Done
   then schedule-next loop. Default "today" list sorted by due.
3. **Views.** Card: title, contact or org, value, probability, next activity chip,
   owner, tags. Column header: count and weighted total. Deal 360 header: stepper
   with Won and Lost. Inline edit of stage, value, close date. Group-by, shortcuts,
   true totals, shared saved views. Port these from the upstream list and kanban or
   retire the weaker redesign list. Put Pipeline Analysis in the nav and compute it
   on won / lost semantics with stage aging.

## Reproduce the measurements

- Stage set: `CRM Deal Status` listed by position (MCP `list_documents`).
- Deals by stage and value: MCP `aggregate_documents` on `CRM Deal`, group by
  `status`, count and `sum(deal_value)`.
- Screenshots: headless Chromium from `crm/frontend/node_modules/playwright`, login
  via `page.request.post('/api/method/login')` with the lab bot from
  `~/.secrets/lab-bot.env`, then `page.goto` per route above.
