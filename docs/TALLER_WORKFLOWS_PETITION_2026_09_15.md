# Petition to the taller lane: canonical repair workflows for CRM follow-ups

From: CRM pipeline lane (crm `feat/crm-pipeline-gaps`, tracker
`crm/docs/CRM_PIPELINE_PLAN_2026_09_13.md`). Date: 2026-09-15.
Answer as one Markdown file under `taller/docs/` and hand the path back; the
CRM lane will not edit taller.

## Why

The CRM pipeline is on production (stages, titles, funnel, follow-up queues),
but on `ventas.docomexico.com` 0 of 765 deals have a next activity and 0 of
339 tasks have a due date. The counter staff never open a deal just to date a
task, so «Vencidos» and «Para hoy» are empty. The lasting fix is that taller's
repair lifecycle creates and closes the dated follow-ups itself. For that CRM
needs the rules from the app that owns the transitions.

## What we need

1. **Canonical Repair Order lifecycle.** Every `status` and `general_status`
   value, the allowed transitions, and the gate on each: intake / QC / delivery
   checklists, refacción gate, estimate decision, `no_charge` and warranty
   exceptions, reopen and abandonment.
2. **Per transition or event** — received, quote sent, quote approved, quote
   rejected, waiting parts, in work, ready, delivered, warranty claim, reopened,
   abandoned, cancelled:
   - owner role (counter, technician, manager);
   - customer notification that fires: WhatsApp template name, auto vs
     supervised (WhatsApp Send Review), and when it must NOT fire;
   - the CRM Deal stage it maps to (the map `deal_status_heal` maintains).
3. **Follow-up rule per stage** (the part that does not exist today): when the
   deal is in stage X and nothing is pending, which dated CRM Task should exist:
   title, `activity_type`, owner role, due offset from the transition
   (examples to confirm or replace: quote sent → «Confirmar cotización» +2 days;
   ready → «Avisar recogida» same day; delivered → «Pedir reseña» +3 days;
   waiting parts → «Confirmar refacción» +N days), and the condition that closes
   it automatically (customer replied, next transition happened, order
   delivered or cancelled).
4. **Anything from custody, device acquisition, technician queues or the
   evidence gates** that changes what the counter person's next action is.

## Already on the sealed line (say if these are canonical)

`taller/docs/CUSTODY_AND_DEVICE_WORKFLOW.md` and
`taller/docs/WORKFLOW_IMPROVEMENTS_2026-09-14.md` (release `b20c14a`). If they
already hold items 1, 2 or 4, point to the sections; item 3 is definitely
missing.

## How CRM will use the answer

- `crm/pipeline/` keeps `next_activity_*` on Lead/Deal from CRM Task; taller
  will create/close tasks through the same service Deal 360 uses (no direct
  writes to deal fields), keyed by (repair order, rule) so a transition never
  duplicates a follow-up.
- Rules become data, not constants: one table per vertical, editable, no
  language or company names in code.
- Owners follow the repair order's assignment (`received_by`, `technician`,
  `delivered_by`), never a hardcoded user.
