# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""«Resumen de ayer» (Hoy). Thin wrappers over crm.morning, which holds the rules."""

import json

import frappe
from frappe import _

from crm import handover, morning
from crm.api.hoy import _require


@frappe.whitelist(methods=["GET", "POST"])
def summary() -> dict:
	_require()
	day = morning.yesterday()
	return {
		"day": str(day),
		"day_label": frappe.utils.format_date(day, "EEEE d 'de' MMMM"),
		"rows": morning.rows(day),
		"settings": morning.settings_rows(),
	}


@frappe.whitelist(methods=["POST"])
def save_settings(changes: dict | str) -> dict:
	_require()
	if isinstance(changes, str):
		changes = json.loads(changes or "{}")
	if not isinstance(changes, dict) or set(changes) - {"morning", "morning_hour"}:
		frappe.throw(_("Choose a summary setting to change."))
	handover.save_settings(changes)
	return {"settings": morning.settings_rows()}
