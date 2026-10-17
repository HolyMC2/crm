"""Backfill: CRM assignment notices stored in the actor's language, rewritten in the reader's.

crm/api/todo.py used to build the text with the session language of whoever assigned or
removed the task (often Administrator, in English). New rows are written in the recipient's
language; this rewrites the old ones. Avisos already translates them at render time, so the
backfill only matters for other readers of ``notification_text`` (FCRM's own panel).

Dry run first (the default) — it writes nothing and returns a report:

    bench --site <site> execute crm.avisos.backfill.retranslate_assignments
    bench --site <site> execute crm.avisos.backfill.retranslate_assignments --kwargs '{"dry_run": false}'

Production needs Marco's go-ahead.
"""

import re

import frappe
from frappe import _

from crm.avisos import kinds

_ASSIGNED_TASK = re.compile(r"^(?P<who>.+?) assigned a new task (?P<what>.+) to you$")
_ASSIGNED_RECORD = re.compile(r"^(?P<who>.+?) assigned a (?P<kind>lead|deal) (?P<what>.+) to you$")
_REMOVED_RECORD_EN = re.compile(
	r"^Your assignment on (?P<kind>lead|deal) (?P<what>.+) has been removed by (?P<who>.+)$"
)
_MESSAGE_REMOVED = re.compile(
	r"^Your assignment on (?P<dt>CRM \w+) (?P<dn>\S+) has been removed by (?P<who>.+)$"
)
_MESSAGE_ASSIGNED = re.compile(r"^(?P<who>.+?) assigned a (?P<dt>CRM \w+) (?P<dn>\S+) to you$")


def _strong(value):
	return f'<span class="font-medium text-ink-gray-9">{frappe.utils.escape_html(value)}</span>'


def _wrap(inner):
	return f'<div class="mb-2 leading-5 text-ink-gray-5"><span>{inner}</span></div>'


def _kind(kind, lang):
	return _(kind.capitalize(), lang=lang).lower()


def rewrite_text(text, lang):
	"""English ``notification_text`` → (template, HTML in ``lang``), or None when not ours."""
	plain = kinds.plain(text)
	found = _REMOVED_RECORD_EN.match(plain)
	if found:
		return "removed_record", _wrap(
			_("Your assignment on {0} {1} has been removed by {2}", lang=lang).format(
				_kind(found["kind"], lang), _strong(found["what"]), _strong(found["who"])
			)
		)
	if plain.startswith("Your assignment on task "):
		parts = kinds.removal_parts(plain)
		if parts:
			what, who, _task = parts
			return "removed_task", _wrap(
				_("Your assignment on task {0} has been removed by {1}", lang=lang).format(
					_strong(what), _strong(who)
				)
			)
	found = _ASSIGNED_TASK.match(plain)
	if found:
		return "assigned_task", _wrap(
			_strong(found["who"])
			+ " "
			+ _("assigned a new task {0} to you", lang=lang).format(_strong(found["what"]))
		)
	found = _ASSIGNED_RECORD.match(plain)
	if found:
		return "assigned_record", _wrap(
			_strong(found["who"])
			+ " "
			+ _("assigned a {0} {1} to you", lang=lang).format(
				_kind(found["kind"], lang), _strong(found["what"])
			)
		)
	return None


def rewrite_message(message, lang):
	"""English plain ``message`` → the same sentence in ``lang``, or None."""
	found = _MESSAGE_REMOVED.match(message or "")
	if found:
		return _("Your assignment on {0} {1} has been removed by {2}", lang=lang).format(
			found["dt"], found["dn"], found["who"]
		)
	found = _MESSAGE_ASSIGNED.match(message or "")
	if found:
		return _("{0} assigned a {1} {2} to you", lang=lang).format(found["who"], found["dt"], found["dn"])
	return None


def retranslate_assignments(dry_run=True, samples=3):
	from crm.api.todo import recipient_language

	dry_run = frappe.parse_json(dry_run) if isinstance(dry_run, str) else bool(dry_run)
	rows = frappe.get_all(
		"CRM Notification",
		filters={"type": "Assignment"},
		fields=["name", "to_user", "message", "notification_text"],
		limit_page_length=0,
	)
	report = {"dry_run": dry_run, "scanned": len(rows), "changed": 0, "by_template": {}, "by_lang": {}}
	report["samples"] = []
	languages = {}
	for row in rows:
		lang = languages.get(row.to_user)
		if lang is None:
			lang = languages[row.to_user] = recipient_language(row.to_user)
		if lang == "en":
			continue
		text = rewrite_text(row.notification_text, lang)
		message = rewrite_message(row.message, lang)
		if not (text or message):
			continue
		values = {}
		if text and text[1] != row.notification_text:
			values["notification_text"] = text[1]
		if message and message != row.message:
			values["message"] = message
		if not values:
			continue
		template = text[0] if text else "message_only"
		report["changed"] += 1
		report["by_template"][template] = report["by_template"].get(template, 0) + 1
		report["by_lang"][lang] = report["by_lang"].get(lang, 0) + 1
		if len(report["samples"]) < samples:
			report["samples"].append(
				{
					"name": row.name,
					"before": kinds.plain(row.notification_text),
					"after": kinds.plain(values.get("notification_text") or row.notification_text),
					"message_after": values.get("message") or row.message,
				}
			)
		if not dry_run:
			frappe.db.set_value("CRM Notification", row.name, values, update_modified=False)
	if not dry_run:
		frappe.db.commit()
	return report
