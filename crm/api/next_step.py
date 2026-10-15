# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""The deal's next step, for Deal 360, the deals list, Hoy and Ctrl+K.

Thin wrappers; the rules live in crm.pipeline.services.next_step.
"""

import json

import frappe

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

