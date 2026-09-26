"""Internal unanswered-offer obligation; owning runtime supplies timers and budget.

No whitelist, scheduler, commits, outbound messages or optional-app imports.
Offer identity pins the immutable revision. The Deal lock serializes competing
runs with offer decisions/revisions; task storage remains the canonical CRM
follow-up service. A human-edited or settled task is never reopened or canceled.
"""

from contextlib import contextmanager
from html import escape
from urllib.parse import quote

import frappe
from frappe.model import get_permitted_fields
from frappe.utils import add_to_date, cstr, now_datetime

from crm.offers import service
from crm.pipeline.constants import OPEN_TASK_STATUSES
from crm.pipeline.services import follow_up


@contextmanager
def _actor(user):
	previous = frappe.session.user
	session, form_dict = dict(frappe.session), frappe.local.form_dict
	if user != previous:
		frappe.set_user(user)
	try:
		yield
	finally:
		if user != previous:
			frappe.set_user(previous)
			frappe.session.clear()
			frappe.session.update(session)
			frappe.local.form_dict = form_dict


def _deny():
	frappe.throw(frappe._("You do not have permission for this offer follow-up."), frappe.PermissionError)


def _fields(doctype, names, actors, permission_type="read"):
	meta = frappe.get_meta(doctype)
	masked = {field.fieldname for field in meta.get_masked_fields()}
	for actor in actors:
		with _actor(actor):
			permitted = set(get_permitted_fields(doctype, permission_type=permission_type))
			if not set(names).issubset(permitted) or set(names) & masked:
				_deny()


def _permission(doc, actors, permission="read"):
	for actor in actors:
		if not frappe.has_permission(doc.doctype, permission, doc=doc, user=actor):
			_deny()


def _actors(executor):
	actors = tuple(dict.fromkeys(u for u in (frappe.session.user, executor) if u))
	for actor in actors:
		if actor == "Guest" or not frappe.db.get_value("User", actor, "enabled"):
			_deny()
	return actors


def _load(offer, company, conversation, actors, write):
	# A row lock, not the conversation dispatch fence: the calling automation
	# runtime already holds its own run lock. No provider dispatch occurs here.
	thread = None
	if conversation:
		from crm.api import conversations

		thread = frappe.get_doc("CRM Conversation", conversation, for_update=True)
		for actor in actors:
			conversations._authorize(thread, actor, write=True)
		# This private DocType intentionally denies generic record/field reads;
		# the broker above authorizes its finite control projection instead.
	deal_name = frappe.db.get_value("CRM Offer", offer, "deal")
	if not deal_name:
		frappe.throw(frappe._("Offer does not exist."), frappe.DoesNotExistError)
	deal = frappe.get_doc("CRM Deal", deal_name, for_update=True)
	doc = frappe.get_doc("CRM Offer", offer, for_update=True)
	_permission(deal, actors, "write" if write else "read")
	_permission(doc, actors, "read")
	_fields("CRM Deal", ["status", "deal_owner", "sales_company"], actors)
	_fields(
		"CRM Offer",
		["deal", "root_offer", "revision", "status", "valid_until", "title", "terms_hash", "sales_company"],
		actors,
	)
	if cstr(doc.sales_company) != cstr(deal.sales_company) or (
		company is not None and cstr(deal.sales_company) != cstr(company)
	):
		_deny()
	if thread and (thread.reference_doctype != "CRM Deal" or thread.reference_name != deal.name):
		_deny()
	stage = frappe.get_doc("CRM Deal Status", deal.status, for_update=True)
	_permission(stage, actors)
	_fields("CRM Deal Status", ["type"], actors)
	return doc, deal, thread, stage.type


def _reason(doc, stage_type, thread, expected_generation=None):
	state = service.effective_status(doc)
	if state != "Issued":
		return state.lower()
	if stage_type in ("Won", "Lost"):
		return "deal_closed"
	if thread:
		if thread.control_state in ("Closed", "Paused"):
			return "conversation_stopped"
		if expected_generation is not None and thread.generation != expected_generation:
			return "takeover"
	return None


def snapshot(offer, *, company=None, conversation=None, executor=None):
	"""Read/pin only; nothing is scheduled or created here."""
	actors = _actors(executor)
	doc, deal, thread, stage_type = _load(offer, company, conversation, actors, False)
	reason = _reason(doc, stage_type, thread)
	return {
		"offer": doc.name,
		"deal": deal.name,
		"revision": doc.revision,
		"terms_hash": doc.terms_hash,
		"conversation": thread.name if thread else None,
		"generation": thread.generation if thread else 0,
		"active": not bool(reason),
		"reason": reason or "unanswered",
	}


def _owner(deal, doc, fallback):
	for owner in dict.fromkeys(filter(None, (deal.deal_owner, fallback))):
		user = frappe.db.get_value("User", owner, ["enabled", "user_type"], as_dict=True)
		if (
			user
			and user.enabled
			and user.user_type == "System User"
			and frappe.has_permission("CRM Deal", "read", doc=deal, user=owner)
			and frappe.has_permission("CRM Offer", "read", doc=doc, user=owner)
			and frappe.has_permission("CRM Task", "read", user=owner)
		):
			return owner
	frappe.throw(frappe._("Choose an enabled fallback owner who can read this deal, offer and CRM tasks."))


def reconcile(
	offer,
	*,
	revision,
	terms_hash,
	due_hours,
	company=None,
	conversation=None,
	generation=0,
	fallback_owner=None,
	executor=None,
):
	"""At most one task per root offer, never reopen the same settled revision.

	The caller commits task + its effect receipt together. A retry after a lost
	response or another run has the same canonical obligation, not another task.
	"""
	if isinstance(due_hours, bool) or not isinstance(due_hours, int) or not 1 <= due_hours <= 720:
		frappe.throw(frappe._("Follow-up due hours must be between 1 and 720."))
	actors = _actors(executor)
	doc, deal, thread, stage_type = _load(offer, company, conversation, actors, True)
	_fields(
		"CRM Task",
		["title", "due_date", "assigned_to", "status", "description", "priority", "activity_type"],
		actors,
		"write",
	)
	if doc.revision != revision or doc.terms_hash != terms_hash:
		frappe.throw(frappe._("The pinned offer revision does not match. Start a new review."))
	if thread and (isinstance(generation, bool) or not isinstance(generation, int) or generation < 1):
		frappe.throw(frappe._("A pinned conversation generation is required."))
	reason = _reason(doc, stage_type, thread, generation)
	slot = f"CRM Offer:{doc.root_offer}:unanswered"
	table = frappe.qb.DocType("CRM Task")
	rows = (
		frappe.qb.from_(table)
		.select(table.name)
		.where(table.automation_slot == slot)
		.orderby(table.name)
		.limit(100)
		.for_update()
		.run(as_dict=True)
	)
	if len(rows) == 100:
		frappe.throw(frappe._("This follow-up history needs manual review."))
	open_rows = {
		row["name"]: row
		for row in follow_up.open_tasks(
			source_doctype="CRM Offer", source_name=doc.root_offer, for_update=True
		)
	}
	current = None
	for row in rows:
		task = frappe.get_doc("CRM Task", row.name, for_update=True)
		_permission(task, actors, "write")
		_fields(
			"CRM Task",
			[
				"status",
				"automation_occurrence",
				"automation_values",
				"assigned_to",
				"title",
				"due_date",
				"activity_type",
				"description",
				"priority",
			],
			actors,
		)
		if task.automation_occurrence == doc.name:
			current = task
			if task.status not in OPEN_TASK_STATUSES:
				return _result(doc, task, False, "task_settled")
		if task.status in OPEN_TASK_STATUSES:
			owned = open_rows.get(cstr(task.name))
			# In Progress is itself a takeover. Description/priority are also
			# human territory, beyond the canonical service's tracked fields.
			if (
				not owned
				or owned["human_edited"]
				or task.status != "Todo"
				or (task.description != _description(task.automation_occurrence) or task.priority != "Medium")
			):
				return _result(doc, task, False, "task_takeover")
	if reason:
		if current and current.status in OPEN_TASK_STATUSES:
			follow_up.complete(slot=slot, occurrence=doc.name, outcome="Canceled", note=reason)
		return _result(doc, current, False, reason)
	if current:
		# Do not move a deadline or owner on each monitor poll.
		return _result(doc, current, True, "task_open")
	owner = _owner(deal, doc, fallback_owner)
	due = add_to_date(now_datetime(), hours=due_hours)
	new_task = frappe.get_doc(
		{
			"doctype": "CRM Task",
			"reference_doctype": "CRM Deal",
			"reference_docname": deal.name,
			"assigned_to": owner,
		}
	)
	_permission(new_task, actors, "create")
	result = follow_up.upsert(
		reference_doctype="CRM Deal",
		reference_name=deal.name,
		slot=slot,
		occurrence=doc.name,
		title=frappe._("Follow up offer {0}").format(doc.name)[:140],
		due=cstr(due),
		owner=owner,
		source_doctype="CRM Offer",
		source_name=doc.root_offer,
		description=_description(doc.name),
		priority="Medium",
	)
	return _result(doc, frappe.get_doc("CRM Task", result["name"]), True, "task_created")


def _description(offer):
	return (
		'<p><a href="/app/crm-offer/'
		+ quote(offer, safe="")
		+ '">'
		+ escape(frappe._("Review unanswered offer revision {0}").format(offer))
		+ "</a>. "
		+ escape(frappe._("Contact requires the normal reviewed customer outbox."))
		+ "</p>"
	)


def _result(doc, task, active, reason):
	return {
		"offer": doc.name,
		"deal": doc.deal,
		"task": cstr(task.name) if task else "",
		"active": active,
		"reason": reason,
		"owner": task.assigned_to if task else "",
		"due_date": cstr(task.due_date) if task else "",
	}
