"""Macros: a saved list of steps a person runs on a conversation with one click.

Each step is the same command the person could run by hand (labels, note, team, snooze,
close), with a command id derived from the macro run's id, so a retried run repeats
nothing that already happened. A reply step queues an inbox notice signed by the person.
All steps run in one transaction: if one step cannot run, none of them stays applied and
the person is told which step and why.
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, strip_html

from crm.inbox import can_steer

MACRO = "CRM Inbox Macro"
REPLY, ADD_LABEL, REMOVE_LABEL, NOTE, TEAM, SNOOZE, CLOSE = (
	"Send reply",
	"Add label",
	"Remove label",
	"Add private note",
	"Send to team",
	"Snooze",
	"Close",
)


def list_macros():
	user = frappe.session.user
	rows = frappe.get_all(
		MACRO,
		or_filters={"shared": 1, "owner": user},
		fields=["name", "title", "description", "shared", "owner"],
		order_by="title asc",
		limit=200,
		ignore_permissions=True,
	)
	steps = {}
	for step in frappe.get_all(
		"CRM Inbox Macro Action",
		filters={"parent": ["in", [r.name for r in rows] or [""]], "parenttype": MACRO},
		fields=["parent", "action", "value", "idx"],
		order_by="idx asc",
		ignore_permissions=True,
	):
		steps.setdefault(step.parent, []).append({"action": step.action, "value": step.value or ""})
	return [
		{
			"name": r.name,
			"title": r.title,
			"description": r.description or "",
			"shared": bool(r.shared),
			"own": r.owner == user,
			"steps": steps.get(r.name, []),
		}
		for r in rows
	]


def _macro(name):
	doc = frappe.get_doc(MACRO, name)
	if not (doc.shared or doc.owner == frappe.session.user):
		frappe.throw(_("This macro is private to the person who made it."), frappe.PermissionError)
	return doc


def run_macro(conversation, macro, expected_generation, command_id):
	from crm.api import conversations as control

	macro = _macro(macro)
	actor = frappe.session.user
	command_id = control._text(command_id, 100)  # steps append ":<idx>" within the broker's limit
	expected_generation = control._generation(expected_generation)
	key = control._event_key(conversation, "Human", actor, command_id)
	fingerprint = control._digest(["macro", macro.name, expected_generation])
	done = []
	with control.conversation_fence(conversation):
		doc = control._load(conversation)
		control._authorize(doc, actor)
		replay = control._replay(key, fingerprint)
		if replay:
			return {"macro": macro.name, "steps": [], "conversation": replay}
		roles, _account = control._authorize(doc, actor, write=True)
		if doc.generation != expected_generation:
			control._conflict()
		if not can_steer(doc, roles, actor):
			control._deny()
		for row in macro.actions:
			try:
				done.append(_run_step(conversation, row, f"{command_id}:{row.idx}", actor))
			except frappe.ValidationError as error:
				# The request rolls back every earlier step with this refusal.
				frappe.throw(
					_("Step {0} ({1}) could not run: {2}").format(
						row.idx, _(row.action), strip_html(str(error)) or _("try it by hand")
					),
					title=_("Macro not applied"),
				)
		doc = control._load(conversation)
		result = control._persist_transition(
			doc,
			control._snapshot(doc),
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action="macro",
			reason=macro.title[:500],
			grant={"macro": macro.name},
		)
	return {"macro": macro.name, "steps": done, "conversation": result}


def _run_step(conversation, row, step_id, actor):
	from crm.api import conversations as control
	from crm.api.outbox_bridge import reason_message
	from crm.inbox import labels, notes, snooze
	from crm.inbox.notices import queue_notice, render

	value = (row.value or "").strip()
	doc = control._load(conversation)
	if row.action == REPLY:
		if doc.control_state == "Bot":
			frappe.throw(_("The assistant is answering this conversation. Take it first."))
		intent, refused = queue_notice(
			conversation, kind="macro", key=f"{actor}:{step_id}", text=render(value, doc), actor=actor
		)
		if not intent:
			frappe.throw(reason_message(refused))
		return {"action": row.action, "intent": intent}
	if row.action in {ADD_LABEL, REMOVE_LABEL}:
		name = labels.clean_name(value)
		add, remove = ([name], []) if row.action == ADD_LABEL else ([], [name])
		labels.change_labels(conversation, step_id, add=add, remove=remove)
		return {"action": row.action, "label": name}
	if row.action == NOTE:
		notes.add_note(conversation, render(value, doc), step_id)
		return {"action": row.action}
	if row.action == TEAM:
		control.route(conversation, value or None, doc.generation, step_id, reason="macro")
		return {"action": row.action, "department": value or None}
	if row.action == SNOOZE:
		hours = cint(value)
		snooze.snooze(conversation, now_datetime() + timedelta(hours=hours), step_id)
		return {"action": row.action, "hours": hours}
	if row.action == CLOSE:
		if doc.control_state == "Closed":
			return {"action": row.action, "already": True}
		roles, _account = control._authorize(doc, actor, write=True)
		reason = None
		if doc.human_owner != actor:
			if control.manager_for(roles, doc) and doc.human_owner:
				reason = "macro"
			else:
				doc = _take(conversation, doc, step_id + ":take")
		control.apply_control(conversation, "close", doc.generation, step_id, reason=reason)
		return {"action": row.action}
	frappe.throw(_("Unknown macro step."))


def _take(conversation, doc, step_id):
	from crm.api import conversations as control

	control.apply_control(conversation, "take", doc.generation, step_id)
	return control._load(conversation)
