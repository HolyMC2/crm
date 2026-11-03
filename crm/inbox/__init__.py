"""Customer inbox work around a conversation: labels, private notes, snooze, macros,
office hours, automatic assignment and satisfaction ratings.

Every person's command goes through the conversation broker (crm.api.conversations):
the same fence, read-then-write authorization, command-id replay and ledger row as
take/route/link. Labels, snooze and notes are metadata: they never advance the control
generation, so they never cancel the owner's queued replies. Automatic assignment is
the one owner change made here; it is recorded as a System event.
"""

import frappe
from frappe import _

SETTINGS = "CRM Inbox Settings"
WRITE_TOKEN = object()


def settings():
	if not frappe.db.exists("DocType", SETTINGS):
		return frappe._dict()
	return frappe.get_cached_doc(SETTINGS)


def insert_private(values):
	"""Insert a private inbox row; its controller refuses any other writer."""
	doc = frappe.get_doc(values)
	doc.flags.crm_inbox_service = WRITE_TOKEN
	doc.insert(ignore_permissions=True)
	return doc


def require_service(doc):
	if doc.flags.get("crm_inbox_service") is not WRITE_TOKEN:
		frappe.throw(_("Add notes and ratings from the conversation in the inbox."), frappe.PermissionError)


def run_command(name, command_id, kind, values, apply):
	"""Fenced, idempotent person command on one conversation.

	`apply(doc, roles)` makes the change and returns (reason, grant). The ledger row
	makes a retried command id return the first result instead of acting twice.
	"""
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	actor = frappe.session.user
	command_id = control._text(command_id)
	key = control._event_key(name, "Human", actor, command_id)
	fingerprint = control._digest([kind, *values])
	with control.conversation_fence(name):
		doc = control._load(name)
		control._authorize(doc, actor)
		if threads._private_peer(doc.provider, doc.peer_id):
			control._deny()
		replay = control._replay(key, fingerprint)
		if replay:
			return replay
		roles, _account = control._authorize(doc, actor, write=True)
		before = control._snapshot(doc)
		reason, grant = apply(doc, roles)
		return control._persist_transition(
			doc,
			before,
			key=key,
			fingerprint=fingerprint,
			origin="Human",
			actor=actor,
			action=kind,
			reason=(reason or "")[:500],
			grant=grant,
		)


def system_event(doc, before, command, action, *, actor=None, reason="", grant=None):
	"""Ledger row for a change the system made inside the caller's fence."""
	from crm.api import conversations as control

	key = control._event_key(doc.name, "System", actor, command)
	replay = control._replay(key, control._digest([action, command]))
	if replay:
		return replay
	return control._persist_transition(
		doc,
		before,
		key=key,
		fingerprint=control._digest([action, command]),
		origin="System",
		actor=actor,
		action=action,
		reason=reason[:500],
		grant=grant,
	)


def can_steer(doc, roles, actor):
	"""Who may route, snooze or run a macro: the owner, anyone on an unowned conversation, a manager."""
	from crm.api import conversations as control

	unowned = doc.control_state in {"Human", "Paused"} and not doc.human_owner
	return doc.human_owner == actor or unowned or control.manager_for(roles, doc)
