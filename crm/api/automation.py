"""Automatizaciones: customer work queues, routing, linked records and inbound policies.

Queues project canonical CRM Conversations; there is no second inbox. Every row,
link and account is authorized individually for the session user through the
conversation broker, and the actor is always the authenticated session.
Mutations are POST-only and idempotent by command/request id.
"""

import frappe
from frappe import _

from crm.api import automation_departments as departments
from crm.api import automation_policy as policies
from crm.api import conversation_threads as threads
from crm.api import conversations as control

SCHEMA_VERSION = 1
VIEWS = ("all", "unassigned", "mine", "bot", "waiting_input", "blocked", "handed_off", "paused")
SCAN = 200
PAGE = 50


def _roles():
	return control._roles(frappe.session.user)


def _can_manage(roles):
	return bool(roles & control.MANAGERS)


def _queue_state(doc, user):
	"""Normalized queue state plus the next action code the UI translates."""
	automation = doc.get("automation_state") or None
	if doc.control_state == "Closed":
		return "Closed", None
	if doc.control_state == "Bot":
		return ("Waiting input", "monitor_bot") if automation == "Waiting input" else ("Bot", "monitor_bot")
	if doc.control_state == "Paused":
		return "Paused", "take"
	if automation == "Blocked":
		return "Blocked", "review_blocker"
	if not doc.human_owner:
		return "Unassigned", "take"
	return ("Mine", "reply") if doc.human_owner == user else ("Assigned", "request")


def _reference(doc, user):
	if not doc.reference_doctype or not doc.reference_name:
		return None
	try:
		record = frappe.get_doc(doc.reference_doctype, doc.reference_name)
	except frappe.DoesNotExistError:
		return None
	if not frappe.has_permission(doc.reference_doctype, "read", doc=record, user=user, print_logs=False):
		return None
	return {
		"doctype": doc.reference_doctype,
		"name": doc.reference_name,
		"url": control.record_url(doc.reference_doctype, doc.reference_name),
	}


def _item(doc, user, names=None):
	state, next_action = _queue_state(doc, user)
	display = (names or {}).get(doc.peer_id) or threads._display_names(doc.provider, [doc.peer_id]).get(
		doc.peer_id, doc.peer_id
	)
	return {
		"name": doc.name,
		"provider": doc.provider,
		"account_id": doc.account_id,
		"display_name": display,
		"department": doc.get("department") or None,
		"control_state": doc.control_state,
		"human_owner": doc.human_owner,
		"generation": doc.generation,
		"state": state,
		"next_action": next_action,
		"automation_state": doc.get("automation_state") or None,
		"automation_run": doc.get("automation_run") or None,
		"reference": _reference(doc, user),
		"record_links": control.context_view(doc, user),
		"routed_at": doc.get("routed_at"),
		"modified": doc.modified,
		"open_url": "/crm/inbox?conversation=" + doc.name,
	}


def _view_clause(view, user):
	if view not in VIEWS:
		frappe.throw(_("Unsupported queue view."))
	return {
		"all": ("", {}),
		"unassigned": (" AND control_state IN ('Human','Paused') AND COALESCE(human_owner,'')=''", {}),
		"mine": (" AND human_owner=%(user)s", {"user": user}),
		"bot": (" AND control_state='Bot'", {}),
		"waiting_input": (" AND automation_state='Waiting input'", {}),
		"blocked": (" AND automation_state='Blocked'", {}),
		"handed_off": (" AND automation_state='Handed off'", {}),
		"paused": (" AND control_state='Paused'", {}),
	}[view]


def _wanted(roles, department):
	if department in (None, "", "all"):
		return departments.member_departments(roles)
	department = departments.department(department)
	if not (departments.is_member(roles, department) or _can_manage(roles)):
		control._deny()
	return [department]


def _scan(wanted, view, user, after=None, limit=PAGE):
	if not wanted or not frappe.db.has_column(control.DOCTYPE, "department"):
		return [], None
	clause, values = _view_clause(view, user)
	values.update({"departments": tuple(wanted)})
	boundary = ""
	if after:
		boundary = " AND (modified<%(m)s OR (modified=%(m)s AND name<%(n)s))"
		values.update({"m": after[0], "n": after[1]})
	values["scan"] = SCAN + 1
	# Security review: _view_clause and the cursor boundary are fixed SQL structure; all values are bound.
	rows = frappe.db.sql(  # nosemgrep: frappe-sql-format-injection
		f"""SELECT name, modified FROM `tabCRM Conversation`
        WHERE department IN %(departments)s{clause}{boundary}
        ORDER BY modified DESC, name DESC LIMIT %(scan)s""",
		values,
		as_dict=True,
	)
	items, last, examined = [], None, 0
	for row in rows[:SCAN]:
		examined += 1
		last = [str(row.modified), row.name]
		doc = control._load(row.name)
		if threads._private_peer(doc.provider, doc.peer_id):
			continue
		if not threads._permitted(lambda: control._authorize(doc)):
			continue
		items.append(doc)
		if len(items) == limit:
			break
	# More rows exist past the last examined one (including the scan sentinel).
	return items, last if examined < len(rows) else None


@frappe.whitelist()
def list_departments():
	roles = _roles()
	return {
		"schema_version": SCHEMA_VERSION,
		"departments": departments.describe(roles),
		"can_manage": _can_manage(roles),
	}


@frappe.whitelist()
def list_queue(
	department: str | None = None,
	view: str | None = "all",
	cursor: str | None = None,
	limit: int | str = 30,
):
	"""One department's (or all of the user's departments') canonical conversations."""
	user = frappe.session.user
	roles = _roles()
	wanted = _wanted(roles, department)
	context = ["automation_queue", department or "all", view or "all"]
	after = threads._cursor(cursor, context)
	if after is not None and (
		not isinstance(after, list) or len(after) != 2 or not all(isinstance(v, str) for v in after)
	):
		frappe.throw(_("Invalid page cursor."))
	docs, last = _scan(wanted, view or "all", user, after, threads._limit(limit))
	names = {}
	for provider in {doc.provider for doc in docs}:
		names.update(
			threads._display_names(provider, [doc.peer_id for doc in docs if doc.provider == provider])
		)
	return {
		"items": [_item(doc, user, names) for doc in docs],
		"departments": wanted,
		"next_cursor": threads._next(last, context) if last else None,
	}


def queue_counts(roles=None, user=None):
	"""Authorized counts per department, bounded; `capped` when the scan limit was reached."""
	user = user or frappe.session.user
	roles = roles if roles is not None else _roles()
	out = {}
	for department in departments.member_departments(roles):
		docs, more = _scan([department], "all", user, limit=SCAN)
		counts = {
			"total": len(docs),
			"unassigned": 0,
			"mine": 0,
			"bot": 0,
			"waiting_input": 0,
			"blocked": 0,
			"capped": bool(more),
		}
		for doc in docs:
			state, _next = _queue_state(doc, user)
			key = {
				"Unassigned": "unassigned",
				"Paused": "unassigned",
				"Mine": "mine",
				"Bot": "bot",
				"Waiting input": "waiting_input",
				"Blocked": "blocked",
			}.get(state)
			if key:
				counts[key] += 1
		out[department] = counts
	return out


@frappe.whitelist()
def get_context(name: str):
	doc = control._load(name)
	control._authorize(doc)
	if threads._private_peer(doc.provider, doc.peer_id):
		control._deny()
	return _item(doc, frappe.session.user)


@frappe.whitelist(methods=["POST"])
def route_conversation(
	name: str,
	department: str | None,
	expected_generation: bool | int | float | str,
	command_id: str,
	reason: str | None = None,
):
	return control.route(name, department or None, expected_generation, command_id, reason)


@frappe.whitelist(methods=["POST"])
def link_record(name: str, doctype: str, docname: str, command_id: str):
	control.link_record(name, doctype, docname, command_id)
	return get_context(name)


@frappe.whitelist(methods=["POST"])
def unlink_record(name: str, doctype: str, docname: str, command_id: str):
	control.link_record(name, doctype, docname, command_id, remove=True)
	return get_context(name)


@frappe.whitelist()
def list_policies(provider: str | None = None, account_id: str | None = None):
	return policies.list_policies(provider, account_id)


@frappe.whitelist()
def get_policy(name: str):
	return policies.get_policy(name)


@frappe.whitelist(methods=["POST"])
def save_policy(values: dict | str, name: str | None = None, expected_revision: int | str | None = None):
	return policies.save_policy(values, name, expected_revision)


@frappe.whitelist()
def review_policy(name: str):
	return policies.review_policy(name)


@frappe.whitelist(methods=["POST"])
def publish_policy(name: str, expected_revision: int | str, review_hash: str, approval_note: str):
	return policies.publish_policy(name, expected_revision, review_hash, approval_note)


@frappe.whitelist(methods=["POST"])
def pause_policy(name: str, reason: str | None = None):
	return policies.pause_policy(name, reason)


def _connection(account, policy_rows):
	provider, account_id = account["provider"], account["account_id"]
	from crm.api.outbox import automation_ready, channel_send_ready

	blockers, binding, profile = [], None, None
	try:
		record = control._account(provider, account_id, active=False)
		connection, profile_row, reasons = policies.resolve_route(provider, record.name)
		blockers.extend(reasons)
		binding = connection.name if connection else None
		profile = profile_row.name if profile_row else None
	except frappe.PermissionError:
		blockers.append(_("The exact customer account is unavailable or disabled."))
	try:
		ready = automation_ready(provider) is True
	except Exception:
		ready = False
	if not ready:
		blockers.append(_("Customer automation is not ready for {0}.").format(provider))
	published = next(
		(
			row
			for row in policy_rows
			if row["provider"] == provider
			and row["account_id"] == account_id
			and row["status"] == "Published"
		),
		None,
	)
	return {
		"name": binding or f"{provider}:{account_id}",
		"bot_profile": profile,
		"provider": provider,
		"account": account.get("label") or account_id,
		"account_id": account_id,
		"active": bool(account.get("active") and binding and not blockers),
		"send_ready": bool(channel_send_ready(provider)),
		"automation_ready": ready,
		"policy": published,
		"blockers": blockers,
	}


@frappe.whitelist()
def list_connections():
	"""Exact accounts this manager can operate, with route, policy and prerequisites."""
	roles = _roles()
	if not _can_manage(roles):
		control._deny()
	accounts = threads.list_accounts()["accounts"]
	policy_rows = policies.list_policies()
	return [_connection(account, policy_rows) for account in accounts]


@frappe.whitelist()
def bootstrap_section():
	"""Customer-side slice for doco.docoutils.assistant.automation.api.bootstrap()."""
	roles = _roles()
	manager = _can_manage(roles)
	return {
		"schema_version": SCHEMA_VERSION,
		"can_manage": manager,
		"departments": departments.describe(roles),
		"queue_counts": queue_counts(roles),
		"policies": policies.list_policies() if manager else [],
		"connections": list_connections() if manager else [],
	}
