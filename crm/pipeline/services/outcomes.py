# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""One-tap outcomes for a follow-up task (Hoy and Pendientes).

A worker who just called or wrote to a customer says what happened in one tap.
The task closes or comes back later, the record's timeline keeps the outcome,
and the next step is scheduled. Without this the worker opens the record,
closes the task and writes the next one by hand.

The app that owns the record decides what its tasks offer. A source app lists a
provider module under the ``crm_follow_up_outcomes`` hook. The first provider
whose ``offer(task, record)`` answers owns the task, and its
``apply(task, record, action, values)`` records the outcomes it offered. It
returns None to let CRM record a shared one («No contestó», «Contestó»). Tasks
no provider claims get CRM's own outcomes: answered, no answer, bought, does not
want it.

Nothing here sends a message. WhatsApp opens on the worker's phone (manual
mode) or in the record's chat (official account), and the worker presses send.
"""

import datetime
import re

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, cint, cstr, escape_html, get_datetime, getdate, now_datetime

from crm.lead import settings as prospect_settings
from crm.pipeline.constants import OPEN_TASK_STATUSES

TASK = "CRM Task"
RECORDS = ("CRM Lead", "CRM Deal")
PROVIDERS_HOOK = "crm_follow_up_outcomes"
DEFAULT_CLOCK = datetime.time(10, 0)
MAX_REASONS = 8
NOTE_LIMIT = 500

ANSWERED, NO_ANSWER, WON, LOST = "answered", "no_answer", "won", "lost"
# A provider may offer these and let CRM record them.
SHARED = (ANSWERED, NO_ANSWER)

ASK_WHEN, ASK_REASON = "when", "reason"
WHENS = ("2h", "tomorrow", "3d", "week", "none")
_DELTAS = {
	"2h": {"hours": 2},
	"tomorrow": {"days": 1},
	"2d": {"days": 2},
	"3d": {"days": 3},
	"week": {"days": 7},
}

# Message placeholders; the Spanish names are accepted too.
_TOKENS = {
	"name": ("name", "nombre"),
	"seller": ("seller", "vendedor"),
	"business": ("business", "negocio"),
}


def when_labels() -> dict:
	return {
		"2h": _("In 2 hours"),
		"tomorrow": _("Tomorrow"),
		"2d": _("In 2 days"),
		"3d": _("In 3 days"),
		"week": _("In a week"),
		"none": _("Nothing else"),
	}


# ── reads ───────────────────────────────────────────────────────────────────


def options(name: str) -> dict:
	"""What the outcome sheet shows for this task: who, how to reach them and the outcomes."""
	task = _task(name, "read")
	record = _record(task)
	_provider, offer = _offer(task, record)
	message = offer.get("message") or ""
	return {
		"task": cstr(task.name),
		"modified": str(task.modified),
		"title": task.title or "",
		"kind": task.activity_type or "Task",
		"open": task.status in OPEN_TASK_STATUSES,
		"attempts": cint(task.get("no_answer_count")),
		"who": who(record),
		"detail": offer.get("detail") or "",
		"record": {"doctype": record.doctype, "name": record.name, "label": _label(record)},
		"reach": _reach(record, message),
		"actions": offer.get("actions") or [],
		"whens": _whens(offer),
		"reasons": offer.get("reasons") or [],
		"can_change": bool(frappe.has_permission(TASK, "write", doc=task)),
	}


def record(
	name: str,
	action: str,
	modified: str | None = None,
	when: str | None = None,
	reason: str | None = None,
	note: str | None = None,
) -> dict:
	"""Record the outcome the worker tapped. Answers with what to tell them."""
	task = _task(name, "write", for_update=True)
	if modified and get_datetime(modified) != get_datetime(task.modified):
		frappe.throw(
			_("Someone changed this follow-up a moment ago. Open it again to see it."),
			frappe.TimestampMismatchError,
		)
	if task.status not in OPEN_TASK_STATUSES:
		frappe.throw(_("This follow-up is already closed."))
	target = _record(task)
	provider, offer = _offer(task, target)
	chosen = next((row for row in offer.get("actions") or [] if row.get("key") == action), None)
	if not chosen:
		frappe.throw(_("That outcome is not available for this follow-up."))
	values = {"note": _note(note)}
	if chosen.get("ask") == ASK_WHEN:
		values["when"] = _when_key(when, _whens(offer))
	if chosen.get("ask") == ASK_REASON:
		values["reason"] = _reason(reason, offer.get("reasons") or [])
	result = provider.apply(task, target, action, values) if provider else None
	if result is None:
		result = _apply_own(task, target, action, values)
	return {
		"message": result.get("message") or _("Saved."),
		"next": result.get("next"),
		"record": {"doctype": target.doctype, "name": target.name},
	}


# ── helpers a provider uses ─────────────────────────────────────────────────


def who(record) -> str:
	"""The person the record is about, in words (never an ID or a phone)."""
	person = " ".join(
		cstr(record.get(field)).strip() for field in ("first_name", "last_name") if record.get(field)
	)
	for value in (person, record.get("lead_name"), record.get("deal_name"), record.get("organization")):
		if cstr(value).strip():
			return cstr(value).strip()
	return _label(record)


def first_name(record) -> str:
	return cstr(record.get("first_name")).strip() or who(record).split(" ")[0]


def own_action(key: str) -> dict:
	"""CRM's wording of a shared outcome, for a provider's list."""
	return _own_actions()[key]


def retry_key() -> str:
	return prospect_settings.get()["retry_after"]


def retry_label() -> str:
	return {
		"2h": _("It comes back in 2 hours."),
		"tomorrow": _("It comes back tomorrow."),
		"2d": _("It comes back in 2 days."),
	}[retry_key()]


def retry(task, note: str = "") -> dict:
	"""«No contestó»: count the try and bring the task back later; it stays open."""
	attempts = cint(task.get("no_answer_count")) + 1
	task.no_answer_count = attempts
	task.due_date = at(retry_key(), task.due_date)
	task.save(ignore_permissions=True)
	text = _("{0}: no answer (try {1}).").format(task.title, attempts)
	note_on(_record(task), f"{text} {note}".strip())
	return {"message": _("Noted. {0}").format(retry_label()), "next": str(task.due_date)}


def close(task, status: str = "Done") -> None:
	task.status = status
	task.save(ignore_permissions=True)


def schedule_next(task, when: str) -> dict | None:
	"""The same follow-up again at `when`, for the same person; None for «Nothing else»."""
	if when == "none":
		return None
	step = frappe.get_doc(
		{
			"doctype": TASK,
			"title": task.title,
			"status": "Todo",
			"priority": task.priority,
			"activity_type": task.activity_type or "Task",
			"due_date": at(when, task.due_date),
			"assigned_to": task.assigned_to or frappe.session.user,
			"reference_doctype": task.reference_doctype,
			"reference_docname": task.reference_docname,
		}
	)
	step.insert(ignore_permissions=True)
	return {"name": cstr(step.name), "due": str(step.due_date)}


def note_on(record, text: str) -> None:
	if text:
		record.add_comment("Comment", text=escape_html(text))


def at(key: str, clock_from=None) -> datetime.datetime:
	"""When `key` falls: hours from now, or that day at the task's own hour (10:00 without one)."""
	delta = _DELTAS[key]
	if "hours" in delta:
		return add_to_date(now_datetime(), hours=delta["hours"]).replace(microsecond=0)
	clock = get_datetime(clock_from).time() if clock_from else DEFAULT_CLOCK
	if clock == datetime.time(0, 0):
		clock = DEFAULT_CLOCK
	return datetime.datetime.combine(getdate(add_days(now_datetime().date(), delta["days"])), clock)


def fill(text: str, record, values: dict | None = None) -> str:
	"""Put the record's words into a message: {name}, {seller}, {business}."""
	from crm.forms.settings import business_name

	values = {
		"name": first_name(record),
		"seller": cstr(frappe.utils.get_fullname(frappe.session.user)).split(" ")[0],
		"business": business_name(),
		**(values or {}),
	}
	for key, aliases in _TOKENS.items():
		for alias in aliases:
			text = text.replace("{" + alias + "}", cstr(values.get(key)))
	return re.sub(r"[ \t]{2,}", " ", text).strip()


# ── CRM's own outcomes ──────────────────────────────────────────────────────


def default_message() -> str:
	return _(
		"Hi {name}, this is {seller} from {business}. Following up on what we talked about: any questions?"
	)


def _own_actions() -> dict:
	return {
		ANSWERED: {"key": ANSWERED, "label": _("Answered"), "ask": ASK_WHEN},
		NO_ANSWER: {
			"key": NO_ANSWER,
			"label": _("No answer"),
			"hint": retry_label(),
		},
		WON: {"key": WON, "label": _("Already bought"), "tone": "success"},
		LOST: {"key": LOST, "label": _("Does not want it"), "ask": ASK_REASON},
	}


def _own_offer(task, record) -> dict:
	actions = _own_actions()
	offered = [actions[ANSWERED], actions[NO_ANSWER]]
	reasons = []
	if frappe.has_permission(record.doctype, "write", doc=record) and not _closed(record):
		if record.doctype == "CRM Deal" and _terminal_stage(record, "Won"):
			offered.append(actions[WON])
		if _terminal_stage(record, "Lost"):
			lost = dict(actions[LOST])
			if record.doctype == "CRM Deal":
				reasons = _lost_reasons()
				if not reasons:
					lost = None
			else:
				lost.pop("ask")
			if lost:
				offered.append(lost)
	message = prospect_settings.get()["follow_up_message"] or default_message()
	return {"actions": offered, "reasons": reasons, "message": fill(message, record)}


def _apply_own(task, record, action, values) -> dict:
	note = values.get("note") or ""
	if action == NO_ANSWER:
		return retry(task, note)
	if action == ANSWERED:
		note_on(record, f"{_('{0}: answered.').format(task.title)} {note}".strip())
		close(task)
		step = schedule_next(task, values["when"])
		if step:
			return {
				"message": _("Done. Next follow-up: {0}.").format(when_labels()[values["when"]].lower()),
				"next": step["due"],
			}
		return {"message": _("Done.")}
	if action in (WON, LOST):
		stage = _terminal_stage(record, "Won" if action == WON else "Lost")
		record.status = stage
		if action == LOST and record.doctype == "CRM Deal":
			record.lost_reason = values["reason"]
		record.save()
		close(task)
		_cancel_other_tasks(task)
		words = _("{0}: already bought.") if action == WON else _("{0}: does not want it.")
		reason = f" {_(values['reason'])}" if values.get("reason") else ""
		note_on(record, f"{words.format(task.title)}{reason} {note}".strip())
		return {"message": _("Great, marked as won.") if action == WON else _("Noted: closed as lost.")}
	frappe.throw(_("That outcome is not available for this follow-up."))


def _cancel_other_tasks(task) -> None:
	"""The record is settled: its other open person-made follow-ups are obsolete.

	Automated ones belong to their source app, which closes them on its own.
	"""
	for name in frappe.get_all(
		TASK,
		filters={
			"reference_doctype": task.reference_doctype,
			"reference_docname": task.reference_docname,
			"status": ["in", OPEN_TASK_STATUSES],
			"name": ["!=", task.name],
			"automation_slot": ["in", ["", None]],
		},
		pluck="name",
	):
		other = frappe.get_doc(TASK, name)
		close(other, "Canceled")


def _closed(record) -> bool:
	if record.doctype == "CRM Lead" and record.get("converted"):
		return True
	status_doctype = f"{record.doctype} Status"
	return frappe.db.get_value(status_doctype, record.status, "type") in ("Won", "Lost")


def _terminal_stage(record, kind: str) -> str | None:
	"""The first stage of `kind` (Won/Lost) this record may move to, or None."""
	if record.doctype == "CRM Deal":
		stages = _deal_stages(record)
	else:
		from crm.pipeline.queries.stages import visible_statuses

		stages = visible_statuses("CRM Lead")
	roles = set(frappe.get_roles())
	for stage in stages:
		if stage.get("type") != kind or stage.get("hidden") or stage.get("archived"):
			continue
		allowed_from = _lines(stage.get("allowed_from"))
		if allowed_from and record.status not in allowed_from:
			continue
		needed = set(_lines(stage.get("transition_roles")))
		if needed and frappe.session.user != "Administrator" and not needed & roles:
			continue
		return stage.get("name")
	return None


def _lines(value) -> list[str]:
	return [part.strip() for part in cstr(value).splitlines() if part.strip()]


def _deal_stages(deal) -> list[dict]:
	from crm.pipeline.api import get_pipelines
	from crm.pipeline.queries.stages import visible_statuses
	from crm.pipeline.services.configuration import installed

	if installed() and deal.get("pipeline"):
		pipeline = next((row for row in get_pipelines() if row.name == deal.pipeline), None)
		if pipeline:
			return pipeline["stages"]
	return visible_statuses("CRM Deal")


def _lost_reasons() -> list[dict]:
	"""The shop's lost reasons, most used first («Other» needs a note, so it stays off the chips)."""
	if not frappe.db.exists("DocType", "CRM Lost Reason"):
		return []
	names = frappe.get_all("CRM Lost Reason", pluck="name", order_by="creation asc")
	names = [name for name in names if name != "Other"]
	from crm.api.doc import COUNT_NAME

	used = (
		{
			row.lost_reason: row.total_count
			for row in frappe.get_all(
				"CRM Deal",
				filters={"lost_reason": ["in", names]},
				fields=["lost_reason", COUNT_NAME],
				group_by="lost_reason",
			)
		}
		if names
		else {}
	)
	names.sort(key=lambda name: -cint(used.get(name)))
	return [{"value": name, "label": _(name)} for name in names[:MAX_REASONS]]


# ── shared plumbing ─────────────────────────────────────────────────────────


def _task(name: str, ptype: str, for_update: bool = False):
	name = cstr(name)
	if not name or not frappe.db.exists(TASK, name):
		frappe.throw(_("This follow-up no longer exists."), frappe.DoesNotExistError)
	task = frappe.get_doc(TASK, name, for_update=for_update)
	if not frappe.has_permission(TASK, ptype, doc=task):
		frappe.throw(
			_("You cannot change this follow-up. Ask its owner or your manager."), frappe.PermissionError
		)
	if task.reference_doctype not in RECORDS or not task.reference_docname:
		frappe.throw(_("Outcomes are for follow-ups of prospects and deals."))
	return task


def _record(task):
	if not frappe.db.exists(task.reference_doctype, task.reference_docname):
		frappe.throw(_("The record of this follow-up no longer exists."), frappe.DoesNotExistError)
	doc = frappe.get_doc(task.reference_doctype, task.reference_docname)
	doc.check_permission("read")
	return doc


def _label(record) -> str:
	return cstr(record.get_title()) or record.name


def _providers():
	for path in frappe.get_hooks(PROVIDERS_HOOK) or []:
		try:
			yield frappe.get_module(path)
		except ImportError:
			frappe.logger("crm.outcomes").warning(f"Outcome provider {path} is not importable")


def _offer(task, record):
	"""(provider, offer): the first provider that claims the task, else CRM's own."""
	for provider in _providers():
		offer = provider.offer(task, record)
		if offer:
			return provider, offer
	return None, _own_offer(task, record)


def _reach(record, message: str) -> dict:
	"""How to reach the person: a call, and WhatsApp the way this shop uses it."""
	from crm.api import whatsapp_channel as wa

	phone = cstr(record.get("mobile_no") or record.get("phone")).strip()
	digits = re.sub(r"[^+\d]", "", phone)
	out = {"phone": phone, "call": f"tel:{digits}" if digits else "", "whatsapp": None, "message": message}
	mode = wa.resolve_mode()
	if mode == "manual" and wa.channel:
		number = wa.recipient(record.doctype, record.name)
		if number:
			out["whatsapp"] = {"kind": "link", "url": wa.channel.wa_link(number, message or None)}
	elif mode == "api":
		out["whatsapp"] = {"kind": "thread", "doctype": record.doctype, "name": record.name}
	return out


def _note(note) -> str:
	note = " ".join(cstr(note).split())
	return note[:NOTE_LIMIT]


def _whens(offer) -> list[dict]:
	"""The times a «when» outcome offers: the provider's own words, else CRM's."""
	labels = when_labels()
	rows = offer.get("whens") or [{"key": key, "label": labels[key]} for key in WHENS]
	return [row for row in rows if row.get("key") in _DELTAS or row.get("key") == "none"]


def _when_key(when, whens) -> str:
	if when not in {row["key"] for row in whens}:
		frappe.throw(_("Choose when the next follow-up is."))
	return when


def _reason(reason, reasons) -> str | None:
	if not reasons:
		return None
	if reason not in {row["value"] for row in reasons}:
		frappe.throw(_("Choose why they do not want it."))
	return reason
