"""The person's conversation queue across every account they can read: mine, unassigned,
everything, snoozed, filtered by state, label and team, newest customer message first."""

import frappe
from frappe import _
from frappe.utils import cint

VIEWS = {"mine", "unassigned", "all", "snoozed"}
STATES = {"open": ["in", ["Human", "Paused", "Bot"]], "closed": "Closed", "any": None}
SCAN = 200


def list_queue(view="mine", state="open", label=None, department=None, start=0, limit=30):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control
	from crm.inbox.labels import clean_name, parse

	if view not in VIEWS or state not in STATES:
		frappe.throw(_("Unknown queue view."))
	user = frappe.session.user
	filters = {}
	if STATES[state]:
		filters["control_state"] = STATES[state]
	if view == "mine":
		filters["human_owner"] = user
	elif view == "unassigned":
		filters["human_owner"] = ["is", "not set"]
		filters["control_state"] = ["in", ["Human", "Paused"]]
	has_snooze = frappe.db.has_column(control.DOCTYPE, "snoozed_until")
	if has_snooze:
		filters["snoozed_until"] = ["is", "set"] if view == "snoozed" else ["is", "not set"]
	elif view == "snoozed":
		return {"items": [], "next_start": None}
	if label:
		label = clean_name(label)
		# Prefilter only (a wildcard in a label widens it); the exact label is checked below.
		filters["labels"] = ["like", f"%{label}%"]
	if department:
		filters["department"] = department
	order = "modified desc"
	if frappe.db.has_column(control.DOCTYPE, "last_customer_message_at"):
		order = "last_customer_message_at desc, modified desc"
	size, offset = min(max(cint(limit), 1), 50), max(cint(start), 0)
	rows = frappe.get_all(
		control.DOCTYPE,
		filters=filters,
		pluck="name",
		order_by=order,
		start=offset,
		page_length=SCAN,
		ignore_permissions=True,
	)
	items, scanned = [], 0
	for name in rows:
		scanned += 1
		doc = control._load(name)
		if threads._private_peer(doc.provider, doc.peer_id):
			continue
		if not threads._permitted(lambda doc=doc: control._authorize(doc)):
			continue
		labels = parse(doc.get("labels"))
		if label and label not in labels:
			continue
		items.append(_item(doc, labels))
		if len(items) == size:
			break
	names = {}
	for item in items:
		names.setdefault(item["provider"], set()).add(item["peer_id"])
	shown = {
		(provider, peer): label_
		for provider, peers in names.items()
		for peer, label_ in threads._display_names(provider, list(peers)).items()
	}
	for item in items:
		item["display_name"] = shown.get((item["provider"], item["peer_id"]), item["peer_id"])
	more = len(rows) == SCAN or scanned < len(rows)
	return {"items": items, "next_start": offset + scanned if more else None}


def _item(doc, labels):
	from crm.api import conversation_threads as threads

	preview, at = "", None
	try:
		scope = threads._scope(doc.provider, doc.account_id, doc=doc)
		visible = threads._first_visible(scope, doc.peer_id)
		if visible:
			message = threads._message(scope, visible)
			preview, at = (message.get("content") or "")[:160], message.get("timestamp")
	except (frappe.PermissionError, frappe.DoesNotExistError):
		pass
	return {
		"name": doc.name,
		"provider": doc.provider,
		"account_id": doc.account_id,
		"peer_id": doc.peer_id,
		"display_name": doc.peer_id,
		"materialized": True,
		"control_state": doc.control_state,
		"human_owner": doc.human_owner,
		"department": doc.get("department"),
		"labels": labels,
		"snoozed_until": doc.get("snoozed_until"),
		"preview": preview,
		"last_message_at": at,
	}
