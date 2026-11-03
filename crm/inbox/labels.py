"""Conversation labels: the team's own words to sort and find customer conversations."""

import json
import re

import frappe
from frappe import _

from crm.inbox import run_command

LABEL = "CRM Conversation Label"
MAX_LABELS = 10
NAME = re.compile(r"[^\"\\,\x00-\x1f]{1,40}")


def parse(raw):
	try:
		value = json.loads(raw) if raw else []
	except ValueError:
		return []
	return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def clean_name(value):
	value = (value or "").strip() if isinstance(value, str) else ""
	if not NAME.fullmatch(value):
		frappe.throw(_("A label has 1 to 40 characters, without quotes, commas or backslashes."))
	return value


def list_labels():
	return frappe.get_all(LABEL, fields=["name", "color", "description"], order_by="name asc", limit=500)


def _requested(labels):
	if isinstance(labels, str):
		try:
			labels = json.loads(labels)
		except ValueError:
			frappe.throw(_("Send the labels as a list."))
	if not isinstance(labels, list) or len(labels) > MAX_LABELS:
		frappe.throw(_("A conversation can have at most {0} labels.").format(MAX_LABELS))
	wanted = list(dict.fromkeys(clean_name(v) for v in labels))
	known = set(frappe.get_all(LABEL, filters={"name": ["in", wanted]}, pluck="name")) if wanted else set()
	missing = [v for v in wanted if v not in known]
	if missing:
		frappe.throw(
			_(
				"These labels do not exist yet: {0}. A manager can create them in Settings › Customer inbox."
			).format(", ".join(missing))
		)
	return sorted(wanted, key=str.casefold)


def set_labels(name, labels, command_id):
	from crm.api import conversations as control

	wanted = _requested(labels)

	def apply(doc, roles):
		if not frappe.db.has_column(control.DOCTYPE, "labels"):
			frappe.throw(_("Labels are not set up on this system yet. Ask support to finish the update."))
		if parse(doc.get("labels")) != wanted:
			control._write_metadata(
				doc, {"labels": json.dumps(wanted, ensure_ascii=False) if wanted else None}
			)
		return ", ".join(wanted), {"labels": wanted}

	return run_command(name, command_id, "labels", wanted, apply)


def change_labels(name, command_id, *, add=(), remove=()):
	"""Add/remove relative to the current labels (macros)."""
	from crm.api import conversations as control

	current = parse(frappe.db.get_value(control.DOCTYPE, name, "labels"))
	wanted = [v for v in current if v not in set(remove)] + [v for v in add if v not in current]
	return set_labels(name, wanted, command_id)
