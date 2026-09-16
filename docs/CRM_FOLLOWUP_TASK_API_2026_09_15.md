# CRM-owned follow-up task API (contract for taller and marketing)

Date: 2026-09-15. CRM's answer to
`taller/docs/CRM_WORKFLOW_CONTRACT_2026_09_15.md` §3 «Task integration
contract» items 2–8. Status: **implemented on `feat/crm-pipeline-gaps`** and
verified on `doco-mirror.lab.xoloitzcuintles.com`; nothing here is on
production yet.

## Ownership

- CRM owns CRM Task storage and the `next_activity_*` projection on CRM Lead /
  CRM Deal (`crm/pipeline/services/next_activity.py`, kept by the CRM Task
  hooks). No caller writes those fields.
- Taller (and any other event source) owns the business events, the rule
  table and the decision to create, complete, cancel or supersede a follow-up.
  It calls the service below; it never inserts CRM Task rows directly.
- Deal 360 and the Tratos list keep writing human follow-ups through
  `frappe.client.insert` / `set_value` on CRM Task. Human tasks carry no slot.

## CRM Task fields added by crm (doctype JSON, migrated by crm)

| Field | Type | Meaning |
| --- | --- | --- |
| `automation_slot` | Data, indexed | Logical slot `<source_doctype>:<source_name>:<rule>` (e.g. `Repair Order:RO-00255:quote_followup`). One open task per slot. |
| `automation_occurrence` | Data | Immutable occurrence id from the caller (transition audit id, quote revision id, custody event id). Retrying the same occurrence reuses the task; a new occurrence supersedes the previous open task of the slot. |
| `automation_source_doctype` | Link DocType | Provenance kept even when the CRM reference is the shared deal. |
| `automation_source_name` | Dynamic Link | idem. |
| `automation_values` | Small Text (JSON) | The last title / due_date / assigned_to / activity_type the automation wrote. Differences between it and the row mean a human edited the task. |

## Service: `crm.pipeline.services.follow_up`

Python only (same bench). Every function takes keyword arguments, runs inside
the caller's transaction, takes a MariaDB `GET_LOCK` on the slot for the
duration of the call, and never sends anything.

```python
upsert(*, reference_doctype, reference_name,   # CRM Deal | CRM Lead
       slot, occurrence,
       title, activity_type="Task",            # one of CRM Task.activity_type
       due=None,                                # Datetime str in site tz, or None
       owner=None,                              # User; None leaves it unassigned
       source_doctype=None, source_name=None,
       description=None, priority=None) -> dict
# -> {"name": task, "action": "created" | "reused" | "updated" | "superseded",
#     "superseded": [older task names now Canceled], "human_edited": bool}
```
Rules:
1. Open task with the same slot **and** occurrence → reuse. If the automation
   values still match the row, refresh title/due/owner from the arguments
   (`updated`); if a human changed any of them (`automation_values` differs
   from the row), keep the human's values (`reused`, `human_edited=True`).
2. Open task with the same slot and a different occurrence → cancel it
   (`status=Canceled`, provenance kept), create the new one (`superseded`).
3. No open task for the slot → create (`created`).
4. Done/Canceled tasks are never reopened; a new call creates a new task.
5. Validation: reference must exist and be one of the two doctypes; the caller
   must have write access to it (`frappe.has_permission(..., "write")`) or run
   with `ignore_permissions` explicitly as a trusted server hook; owner must be
   an enabled System User, otherwise the task is left unassigned and the result
   carries `"owner_skipped": <user>`.

```python
complete(*, slot, occurrence=None, outcome="Done", note=None) -> dict
# -> {"closed": [names]}   outcome ∈ {"Done", "Canceled"}
```
Closes the open task(s) of the slot (all occurrences, or only the given one).
`Done` means the business condition was met; `Canceled` means obsolete or
superseded. Never called because a customer wrote «hola»: an incoming message
focuses the task, it does not complete it.

```python
open_tasks(*, source_doctype, source_name, for_update=False) -> list[dict]
# every open automated task of a repair order: name, slot, occurrence, due_date,
# assigned_to, title, human_edited
```

```python
reassign(*, slot, owner) -> dict   # only when not human_edited
```

## Occurrence and slot identity

- Slot = `f"{source_doctype}:{source_name}:{rule}"`. Rule ids are taller's
  (`quote_followup`, `parts_followup`, `ready_notice`, `pickup_followup`, …).
- Occurrence = a string the caller derives from an immutable event: the
  transition audit row name, `f"quote:{quote_revision}"`, the custody event
  name. A cycle number alone is not enough (waiting/ready repeat inside one).
- The lock key is `crmtask:<sha256(site + slot)[:56]>`, 5 s timeout,
  `TimestampMismatchError` on timeout so a concurrent event retries.

## What the projection does with automated tasks

Nothing special: `next_activity_*` shows the earliest open task, automated or
human. The Tratos list and Deal 360 show it, the queues filter on it. Closing
or superseding a task through this service triggers the same hooks as a
manual save, so the deal's next activity moves on its own.

## Reconciliation of the existing marketing rule (`repair_ready`)

`doco_marketing/services/channel/rules.py` stages one CRM Task per deal
(`doco_rule = "repair_ready:<deal>"`, due today at noon, stands down when a
WhatsApp Send Review exists for the transition). It predates this API and is
insufficient for several orders per deal and rework. Migration path:
1. keep it running until taller's `ready_notice` rule ships through `upsert`;
2. then have `on_repair_status` call `upsert(slot="Repair Order:<RO>:ready_notice", …)`
   instead of `stage_task`, or retire it in favour of taller's coordinator
   (one owner per obligation, contract §3.7);
3. the `doco_rule` / `doco_channel_*` custom fields stay for history; new rows
   are identified by `automation_slot`.

## Backfill

None automatic. A previewable `bench execute crm.pipeline.services.follow_up.preview_backfill`
may later list applicable open orders; it never creates historical review
requests or reminders for completed cycles (contract §3.8).

## Tests (crm/tests/test_pipeline_follow_up.py)

Retry with the same occurrence creates one task; a new occurrence supersedes;
two orders on one deal stay independent; a human-edited task keeps its values;
complete marks Done, cancel marks Canceled; the deal's `next_activity_*`
follows; an invalid owner is skipped, not assigned; concurrent upserts on one
slot serialize.

## Calling it from taller

Import path: `from crm.pipeline.services import follow_up`
(`crm/crm/pipeline/services/follow_up.py`). Server-side only: nothing is
whitelisted, and no call commits, enqueues or sends.

```python
slot = f"Repair Order:{order.name}:quote_followup"
follow_up.upsert(reference_doctype="CRM Deal", reference_name=order.deal, slot=slot,
	occurrence=f"quote:{revision}", title=_("Confirmar cotización"), activity_type="Call",
	due=due, owner=counter, source_doctype="Repair Order", source_name=order.name,
	ignore_permissions=True)                    # -> {"name", "action", "superseded", "human_edited"}
follow_up.complete(slot=slot, outcome="Done", note=_("Cliente autorizó"))  # on the real approval
follow_up.reassign(slot=slot, owner=technician)  # no-op once a person edited the task
```

What the implementation pins down, on top of the signatures above:

- `upsert` takes a twelfth keyword, `ignore_permissions=False`. It governs the
  rule-5 write check on the **reference record** only; the CRM Task row is
  always written as the automation, since the worker whose event fired may not
  hold CRM Task permissions. A trusted server hook passes `True`.
- `title` and `slot` are bounded at 140 characters (the Data columns), `due`
  accepts a datetime or any string `get_datetime` parses, and `activity_type` /
  `priority` are validated against the doctype's own Select options, so a new
  option needs no change here. Titles are the caller's to translate.
- A task is created as `status="Todo"`; `Backlog` would hide it from the queues
  the projection feeds.
- On a reused task the rule rewrites the owner it passes, and `owner=None`
  unassigns (withdrawing the previous ToDo). An owner that failed validation is
  the one case where the current assignee stays: the caller wanted somebody, so
  a typo must not silently drop the assignment. The result then carries
  `"owner_skipped"`.
- `reassign` returns `{"reassigned": [...], "kept": [...]}`, `kept` being the
  tasks a person had edited, plus `"owner_skipped"` when the target user is
  unusable (nothing is moved in that case).
- `open_tasks` returns the tasks in the order they were opened, not by due
  date: MariaDB sorts undated rows first, which would read as most urgent.
  Urgency belongs to the `next_activity_*` projection.
- Task names come back as strings, matching what `next_activity_task` stores.
- `preview_backfill` is not implemented; the backfill section still applies.
- The `automation_*` fields are read-only in a collapsible "Automation"
  section. The label is the English source string, translated per user like
  every other CRM label.

## Gap-closing integration hardening

Mutators now use current locking reads for open slot rows, task documents and
human-edit comparisons. `open_tasks(for_update=True)` gives source coordinators
the same behavior inside their transaction. Frappe v16 requires the query
builder for locking list reads; `get_all(for_update=...)` is unsupported.
`GET_LOCK` still ends at service return, while row locks last until commit.
MariaDB may reject a stale snapshot with `QueryDeadlockError`; callers must
roll back and retry the whole transaction, never fall back to a stale read.

An identical reconciliation returns `reused, human_edited=False` without saving
the task or updating its projection again. Changed automation values still
refresh, and human changes remain protected. Taller also checks settled history
before calling `upsert`, so a completed/canceled occurrence is not recreated.

Taller now owns five disabled-by-default rules and explicit permission-scoped
backfill. Marketing defers its legacy ready task when Taller's enabled rule owns
it. See [Taller implementation and acceptance](../../taller/docs/GAP_CLOSURE_2026_09_15.md).
