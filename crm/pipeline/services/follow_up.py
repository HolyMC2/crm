# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Automated follow-up tasks on CRM Lead / CRM Deal.

Contract: `docs/CRM_FOLLOWUP_TASK_API_2026_09_15.md`. The event source -- taller's
repair rules, marketing, any server code -- owns the business event and the
decision to open, close or supersede a follow-up. CRM owns CRM Task storage and
the `next_activity_*` projection, which follows on its own because every write
here goes through the Document API and its hooks.

Server logic only: nothing is whitelisted, nothing commits and nothing is sent.
The caller's transaction decides, and notices leave after it commits.
"""

import hashlib
import json
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cstr, escape_html, get_datetime

from crm.pipeline.constants import OPEN_TASK_STATUSES, REFERENCE_DOCTYPES

# A fresh follow-up is owed now: Backlog would hide it from the queues that read
# the projection.
NEW_TASK_STATUS = "Todo"

# What a rule owns on the task it wrote. `automation_values` keeps these as last
# written, so any later difference is a person's edit.
TRACKED_FIELDS = ("title", "due_date", "assigned_to", "activity_type")

# "Done" means the business condition was met, "Canceled" that the work became
# obsolete. Neither is ever reopened.
CLOSED_OUTCOMES = ("Done", "Canceled")

# Data columns are varchar(140).
MAX_DATA = 140

LOCK_TIMEOUT = 5


def upsert(
	*,
	reference_doctype: str,
	reference_name: str,
	slot: str,
	occurrence: str,
	title: str,
	activity_type: str = "Task",
	due: str | None = None,
	owner: str | None = None,
	source_doctype: str | None = None,
	source_name: str | None = None,
	description: str | None = None,
	priority: str | None = None,
	ignore_permissions: bool = False,
) -> dict:
	"""Open or refresh the single follow-up a rule owes on `slot`.

	Returns `{"name", "action", "superseded", "human_edited"}` and, when the owner
	could not be used, `"owner_skipped"`. `action` is one of created / reused /
	updated / superseded.
	"""
	_require_migration()
	slot = _slot(slot)
	occurrence = _required_text(occurrence, _("follow-up occurrence"))
	title = _required_text(title, _("follow-up title"), limit=MAX_DATA)
	activity_type = _option(activity_type, "activity_type", required=True)
	priority = _option(priority, "priority", required=False)
	due = _due(due)
	_check_reference(reference_doctype, reference_name, ignore_permissions)
	source_doctype, source_name = _source(source_doctype, source_name)
	owner, owner_skipped = _usable_owner(owner)

	with slot_lock(slot):
		rows = _open_slot_tasks(slot)
		kept = next((row for row in rows if cstr(row.automation_occurrence) == occurrence), None)
		# One open task per slot. Anything else of this slot is obsolete, whether it
		# belongs to an older occurrence or is a duplicate this service never means
		# to leave behind. Cancelled, not deleted: the history is the audit trail.
		superseded = [row.name for row in rows if not kept or row.name != kept.name]
		for name in superseded:
			_close(name, "Canceled")

		if kept:
			result = _refresh(
				kept.name,
				title=title,
				activity_type=activity_type,
				due=due,
				owner=owner,
				owner_skipped=owner_skipped,
				description=description,
				priority=priority,
			)
		else:
			result = _create(
				reference_doctype=reference_doctype,
				reference_name=reference_name,
				slot=slot,
				occurrence=occurrence,
				title=title,
				activity_type=activity_type,
				due=due,
				owner=owner,
				description=description,
				priority=priority,
				source_doctype=source_doctype,
				source_name=source_name,
			)
			if superseded:
				result["action"] = "superseded"

		result["superseded"] = [cstr(name) for name in superseded]
		if owner_skipped:
			result["owner_skipped"] = owner_skipped
		return result


def complete(
	*, slot: str, occurrence: str | None = None, outcome: str = "Done", note: str | None = None
) -> dict:
	"""Close the open task(s) of `slot`, all occurrences or only the one given.

	An incoming customer message is not a completion: only the caller knows that
	the condition of the rule was actually met.
	"""
	_require_migration()
	slot = _slot(slot)
	if outcome not in CLOSED_OUTCOMES:
		frappe.throw(_("A follow-up closes as Done or Canceled."))
	if occurrence is not None:
		occurrence = _required_text(occurrence, _("follow-up occurrence"))

	closed = []
	with slot_lock(slot):
		for row in _open_slot_tasks(slot):
			if occurrence and cstr(row.automation_occurrence) != occurrence:
				continue
			_close(row.name, outcome, note=note)
			closed.append(cstr(row.name))
	return {"closed": closed}


def open_tasks(*, source_doctype: str, source_name: str, for_update: bool = False) -> list[dict]:
	"""Every open automated task of one source record, in the order it was opened.

	Not ordered by due date on purpose: MariaDB sorts undated rows first on ASC,
	which would read as "most urgent". Urgency is the projection's job.
	"""
	_require_migration()
	if not source_doctype or not source_name:
		frappe.throw(_("A source document is required."))

	task = frappe.qb.DocType("CRM Task")
	query = (
		frappe.qb.from_(task)
		.select(
			task.name,
			task.automation_slot,
			task.automation_occurrence,
			task.automation_values,
			task.due_date,
			task.assigned_to,
			task.title,
		)
		.where(
			(task.automation_source_doctype == source_doctype)
			& (task.automation_source_name == source_name)
			& task.automation_slot.isnotnull()
			& (task.automation_slot != "")
			& task.status.isin(OPEN_TASK_STATUSES)
		)
		.orderby(task.creation, task.name)
	)
	if for_update:
		query = query.for_update()
	rows = query.run(as_dict=True)
	return [
		{
			"name": cstr(row.name),
			"slot": row.automation_slot,
			"occurrence": row.automation_occurrence,
			"due_date": row.due_date,
			"assigned_to": row.assigned_to,
			"title": row.title,
			"human_edited": _human_edited(row.name, row.automation_values, for_update=for_update),
		}
		for row in rows
	]


def reassign(*, slot: str, owner: str) -> dict:
	"""Move the open automated task(s) of `slot` to `owner`.

	A task a person edited keeps its assignee: the rule no longer owns it.
	Returns `{"reassigned", "kept"}` plus `"owner_skipped"` when `owner` cannot
	hold a task, in which case nothing is reassigned.
	"""
	_require_migration()
	slot = _slot(slot)
	if not owner:
		frappe.throw(_("A follow-up is reassigned to a user."))
	usable, skipped = _usable_owner(owner)

	result: dict = {"reassigned": [], "kept": []}
	if skipped:
		result["owner_skipped"] = skipped
		return result

	with slot_lock(slot):
		for row in _open_slot_tasks(slot):
			doc = frappe.get_doc("CRM Task", row.name, for_update=True)
			if _human_edited(doc.name, doc.automation_values, for_update=True):
				result["kept"].append(cstr(doc.name))
				continue
			_apply_owner(doc, usable, None)
			doc.save(ignore_permissions=True)
			_record_values(doc.name)
			result["reassigned"].append(cstr(doc.name))
	return result


@contextmanager
def slot_lock(slot: str, timeout: int = LOCK_TIMEOUT):
	"""Serialise the events of one slot on a connection-owned MariaDB lock.

	An existence query alone lets two transitions of the same order each read
	"no open task" and each create one. On timeout the caller gets
	TimestampMismatchError so it retries its event instead of duplicating it.
	"""
	key = _lock_key(slot)
	row = frappe.db.sql("SELECT GET_LOCK(%s, %s)", (key, timeout))
	if not row or row[0][0] != 1:
		frappe.throw(_("Another event is updating this follow-up. Retry."), frappe.TimestampMismatchError)
	try:
		yield
	finally:
		# RELEASE_LOCK is connection-specific; it cannot free another worker's lock.
		frappe.db.sql("SELECT RELEASE_LOCK(%s)", (key,))


def _lock_key(slot: str) -> str:
	# The lock namespace is the whole MariaDB instance, which several sites share:
	# the site goes into the digest, with a separator so that site+slot pairs
	# cannot run into each other and cross-serialise two tenants.
	digest = hashlib.sha256(f"{frappe.local.site}\x00{slot}".encode()).hexdigest()
	return "crmtask:" + digest[:56]


def _create(
	*,
	reference_doctype,
	reference_name,
	slot,
	occurrence,
	title,
	activity_type,
	due,
	owner,
	description,
	priority,
	source_doctype,
	source_name,
) -> dict:
	doc = frappe.get_doc(
		{
			"doctype": "CRM Task",
			"title": title,
			"status": NEW_TASK_STATUS,
			"activity_type": activity_type,
			"due_date": due,
			"assigned_to": owner,
			"description": description,
			"priority": priority,
			"reference_doctype": reference_doctype,
			"reference_docname": reference_name,
			"automation_slot": slot,
			"automation_occurrence": occurrence,
			"automation_source_doctype": source_doctype,
			"automation_source_name": source_name,
		}
	)
	# The authorisation gate is the write check on the reference record; the task
	# row itself is the automation's, not the session user's.
	doc.insert(ignore_permissions=True)
	_record_values(doc.name)
	return {"name": cstr(doc.name), "action": "created", "human_edited": False}


def _refresh(name, *, title, activity_type, due, owner, owner_skipped, description, priority) -> dict:
	doc = frappe.get_doc("CRM Task", name, for_update=True)
	if _human_edited(doc.name, doc.automation_values, for_update=True):
		# The person's title, date or assignee is the current truth. The task keeps
		# its slot and occurrence so the next event of the rule still finds it.
		return {"name": cstr(doc.name), "action": "reused", "human_edited": True}

	changes = {"title": title, "activity_type": activity_type, "due_date": due}
	if not owner_skipped:
		changes["assigned_to"] = owner
	if priority:
		changes["priority"] = priority
	if description is not None:
		changes["description"] = description
	if all(cstr(doc.get(field)) == cstr(value) for field, value in changes.items()):
		return {"name": cstr(doc.name), "action": "reused", "human_edited": False}

	doc.title = title
	doc.activity_type = activity_type
	doc.due_date = due
	if priority:
		doc.priority = priority
	if description is not None:
		doc.description = description
	_apply_owner(doc, owner, owner_skipped)
	doc.save(ignore_permissions=True)
	_record_values(doc.name)
	return {"name": cstr(doc.name), "action": "updated", "human_edited": False}


def _close(name, outcome, note=None) -> None:
	doc = frappe.get_doc("CRM Task", name, for_update=True)
	doc.status = outcome
	if note:
		doc.description = _with_note(doc.description, note)
	doc.save(ignore_permissions=True)


def _with_note(description, note) -> str:
	# description is a Text Editor field: the note is escaped, never interpolated
	# as markup, and appended so the reason for closing survives with the task.
	return f"{cstr(description)}<p>{escape_html(cstr(note))}</p>"


def _apply_owner(doc, owner, owner_skipped) -> None:
	"""The rule owns `assigned_to` on a task it wrote, and `owner=None` means it
	has nobody to assign. An owner that could not be validated is a different
	case: the caller wanted someone, so the current assignee stays rather than
	being dropped by a typo.
	"""
	if owner_skipped:
		return
	if doc.assigned_to and not owner:
		# CRM Task.validate only withdraws the previous assignment when a new owner
		# replaces it, so clearing the field has to withdraw it here or the ToDo
		# outlives the assignment it represents.
		doc.unassign_from_previous_user(doc.assigned_to)
	doc.assigned_to = owner


def _record_values(name) -> None:
	"""Store what the automation left on the row, read back from the row itself so
	a later comparison sees the same shape the database returns.

	Written straight to the column: it is derived data, the document hooks already
	ran for the fields a user sees, and it must not read as user activity.
	"""
	frappe.db.set_value("CRM Task", name, "automation_values", _values_json(name), update_modified=False)


def _values_json(name) -> str:
	return json.dumps(_values_of(name), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _values_of(name, *, for_update=False) -> dict:
	row = frappe.db.get_value("CRM Task", name, TRACKED_FIELDS, as_dict=True, for_update=for_update) or {}
	return {
		"title": cstr(row.get("title")) or None,
		# The column hands back a datetime and the caller a string: normalise both
		# to one text form, or every refresh would look like a human edit.
		"due_date": cstr(get_datetime(row.get("due_date"))) if row.get("due_date") else None,
		"assigned_to": cstr(row.get("assigned_to")) or None,
		"activity_type": cstr(row.get("activity_type")) or None,
	}


def _human_edited(name, written, *, for_update=False) -> bool:
	if not written:
		# Values this service cannot prove it wrote are never overwritten.
		return True
	try:
		stored = json.loads(written)
	except ValueError:
		return True
	return stored != _values_of(name, for_update=for_update)


def _open_slot_tasks(slot) -> list:
	# Current read: GET_LOCK ends before the outer transaction commits.
	# Frappe v16 get_all does not accept for_update; use the query builder.
	task = frappe.qb.DocType("CRM Task")
	return (
		frappe.qb.from_(task)
		.select(task.name, task.automation_occurrence)
		.where((task.automation_slot == slot) & task.status.isin(OPEN_TASK_STATUSES))
		.orderby(task.creation, task.name)
		.for_update()
		.run(as_dict=True)
	)


def _check_reference(doctype, name, ignore_permissions) -> None:
	if doctype not in REFERENCE_DOCTYPES:
		frappe.throw(_("A follow-up belongs to a CRM Lead or a CRM Deal."))
	if not name or not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} does not exist.").format(doctype, cstr(name)), frappe.DoesNotExistError)
	if ignore_permissions:
		# Only a trusted server hook asks for this, and it has already decided that
		# the business event may touch the record.
		return
	if not frappe.has_permission(doctype, "write", doc=name):
		frappe.throw(
			_("Not permitted to add a follow-up on {0} {1}.").format(doctype, cstr(name)),
			frappe.PermissionError,
		)


def _source(source_doctype, source_name):
	if not source_doctype and not source_name:
		return None, None
	if not source_doctype or not source_name:
		frappe.throw(_("A follow-up source needs both its doctype and its name."))
	if not frappe.db.exists("DocType", source_doctype) or not frappe.db.exists(source_doctype, source_name):
		frappe.throw(
			_("{0} {1} does not exist.").format(source_doctype, cstr(source_name)), frappe.DoesNotExistError
		)
	return source_doctype, source_name


def _usable_owner(owner):
	"""An owner that cannot hold a task is skipped, never guessed: the follow-up
	stays visible and unassigned instead of landing on the wrong person.
	"""
	if not owner:
		return None, None
	row = frappe.db.get_value("User", owner, ["enabled", "user_type"], as_dict=True)
	if not row or not row.enabled or row.user_type != "System User":
		return None, owner
	return owner, None


def _option(value, fieldname, required):
	"""Select values come from the doctype, so a new activity type needs no edit here."""
	if not value:
		if required:
			frappe.throw(_("A follow-up needs an activity type."))
		return None
	options = frappe.get_meta("CRM Task").get_field(fieldname).options or ""
	if value not in [option for option in options.split("\n") if option]:
		frappe.throw(_("{0} is not a CRM Task {1}.").format(cstr(value), fieldname))
	return value


def _due(due):
	if due in (None, ""):
		return None
	try:
		return cstr(get_datetime(due))
	except (ValueError, TypeError):
		frappe.throw(_("Invalid follow-up due date."))


def _slot(slot) -> str:
	# The `<source doctype>:<source name>:<rule>` shape is the caller's convention;
	# what this service needs is a stable, bounded identity per obligation.
	return _required_text(slot, _("follow-up slot"), limit=MAX_DATA)


def _required_text(value, label, limit=MAX_DATA) -> str:
	if not isinstance(value, str) or not value.strip() or len(value) > limit:
		frappe.throw(_("Invalid {0}.").format(label))
	return value.strip()


def _require_migration() -> None:
	"""A bind-mounted deploy can run this code before its migration adds the columns."""
	if not frappe.db.has_column("CRM Task", "automation_slot"):
		frappe.throw(_("CRM Task has no automation fields yet; migrate the site."))
