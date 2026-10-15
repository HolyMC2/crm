# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""The deal's next step, for Deal 360, the deals list, Hoy and Ctrl+K.

Thin wrappers; the rules live in crm.pipeline.services.next_step.
"""

import json

import frappe
from frappe import _

from crm.pipeline.services import next_step as service


@frappe.whitelist()
def get(deal: str) -> dict:
	return service.state(deal)


@frappe.whitelist(methods=["POST"])
def schedule(
	deal: str,
	title: str,
	at: str,
	activity_type: str | None = None,
	owner: str | None = None,
	task: str | None = None,
	modified: str | None = None,
) -> dict:
	return service.schedule(
		deal, title=title, at=at, activity_type=activity_type, owner=owner, task=task, modified=modified
	)


@frappe.whitelist(methods=["POST"])
def snooze(deal: str, days: int = 1, task: str | None = None, modified: str | None = None) -> dict:
	return service.snooze(deal, days=int(days), task=task, modified=modified)


@frappe.whitelist(methods=["POST"])
def complete(
	deal: str,
	task: str,
	modified: str | None = None,
	note: str | None = None,
	next_step: str | dict | None = None,
) -> dict:
	if isinstance(next_step, str):
		next_step = json.loads(next_step) if next_step else None
	return service.complete(deal, task=task, modified=modified, note=note, next_step=next_step)


@frappe.whitelist(methods=["POST"])
def schedule_many(deals: str | list, title: str, at: str, activity_type: str | None = None) -> dict:
	if isinstance(deals, str):
		deals = json.loads(deals or "[]")
	return service.schedule_many(deals, title=title, at=at, activity_type=activity_type)


QUEUE_COUNT_CAP = 10


@frappe.whitelist()
def queue_counts(
	base: str | list | None = None, queues: str | dict | None = None, or_filters: str | dict | None = None
) -> dict:
	"""Deals per follow-up queue under the list's current filters, permission-scoped.

	`base` are the list's filters without the queue; `queues` maps a queue key to
	its own filters (the client's followUpFilters), so the chips and the rows can
	never disagree.
	"""
	from crm.api.doc import COUNT_NAME
	from crm.api.list_tokens import resolve_filter_tokens

	base = resolve_filter_tokens(json.loads(base) if isinstance(base, str) else base or [])
	queues = json.loads(queues) if isinstance(queues, str) else queues or {}
	or_filters = resolve_filter_tokens(
		json.loads(or_filters) if isinstance(or_filters, str) else or_filters or {}
	)
	if len(queues) > QUEUE_COUNT_CAP:
		frappe.throw(_("Count at most {0} queues at once.").format(QUEUE_COUNT_CAP))
	out = {}
	for key, filters in queues.items():
		rows = frappe.get_list(
			"CRM Deal",
			filters=[*base, *resolve_filter_tokens(filters or [])],
			or_filters=or_filters or None,
			fields=[COUNT_NAME],
		)
		out[key] = rows[0].total_count if rows else 0
	return out
