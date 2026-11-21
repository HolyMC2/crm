# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Entrega de turno (Hoy). Thin wrappers over crm.handover, which holds the rules."""

import json

import frappe

from crm import handover as service
from crm.api.hoy import _require


@frappe.whitelist(methods=["GET", "POST"])
def prepare() -> dict:
	_require()
	return service.prepare()


@frappe.whitelist(methods=["POST"])
def hand_over(note: str = "") -> dict:
	_require()
	return service.hand_over(note)


@frappe.whitelist(methods=["POST"])
def acknowledge(name: str) -> dict:
	_require()
	return service.acknowledge(name)


@frappe.whitelist(methods=["POST"])
def save_settings(changes: dict | str) -> dict:
	_require()
	if isinstance(changes, str):
		changes = json.loads(changes or "{}")
	return {"settings": service.save_settings(changes)}
