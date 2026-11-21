"""Entrega de turno (Hoy): the closing person hands the shift over from one screen.

Hoy builds the handover from what is still open, so nobody writes it from
memory: the closer's own pendientes due by today, the follow-ups due tomorrow
(the customers who said they would come back), and what other apps add through
the ``crm_handover_sections`` hook (Taller: devices promised today that are not
ready, devices ready to hand over). The closer adds a note and taps «Entregar
turno». A CRM Shift Note keeps the note and a snapshot of those sections.
Everyone else's Hoy shows the latest handover of the last day («Del turno
anterior») until they tap «Enterado».

A provider is ``sections(user) -> list[section]``; a section is
``{"key", "title", "count", "rows": [{"title", "detail", "to"|"href"}]}``
in the worker's words, already scoped to what ``user`` may read.

The owner switches the handover off from the sheet itself
(FCRM Settings.hoy_settings holds only what the owner changed).
"""

import datetime
import json

import frappe
from frappe import _
from frappe.utils import add_days, cstr, get_datetime, getdate, now_datetime, nowdate

HOOK = "crm_handover_sections"
DOCTYPE = "CRM Shift Note"
FIELD = "hoy_settings"
MANAGER_ROLES = frozenset({"System Manager", "Sales Manager"})
ROW_LIMIT = 8
NOTE_LIMIT = 1000
VISIBLE_HOURS = 24
OPEN_TASKS = ("Backlog", "Todo", "In Progress")


# ── settings ────────────────────────────────────────────────────────────────


# «Resumen de ayer» (crm.morning): the hours the owner may choose, site time.
MORNING_HOURS = (6, 7, 8, 9, 10, 11)


def defaults() -> dict:
	return {"handover": True, "morning": True, "morning_hour": 8}


def _valid(key, value) -> bool:
	if key == "morning_hour":
		return isinstance(value, int) and not isinstance(value, bool) and value in MORNING_HOURS
	return isinstance(value, bool)


def settings() -> dict:
	values = defaults()
	for key, value in _stored().items():
		if key in values and _valid(key, value):
			values[key] = value
	return values


def can_change(user: str | None = None) -> bool:
	user = user or frappe.session.user
	return user == "Administrator" or bool(MANAGER_ROLES.intersection(frappe.get_roles(user)))


def save_settings(changes: dict) -> dict:
	if not can_change():
		frappe.throw(_("Only the owner or a manager changes Hoy."), frappe.PermissionError)
	if not isinstance(changes, dict) or set(changes) - set(defaults()):
		frappe.throw(_("Choose a Hoy setting to change."))
	stored = _stored()
	for key, value in changes.items():
		if key == "morning_hour":
			try:
				hour = int(value)
			except (TypeError, ValueError):
				hour = -1
			if isinstance(value, bool) or hour not in MORNING_HOURS:
				frappe.throw(_("Choose one of the offered hours."))
			stored[key] = hour
			continue
		if not isinstance(value, bool) and value not in (0, 1, "0", "1"):
			frappe.throw(_("Turn the setting on or off."))
		stored[key] = bool(int(value)) if not isinstance(value, bool) else value
	frappe.db.set_single_value("FCRM Settings", FIELD, json.dumps(stored, sort_keys=True))
	values = defaults()
	values.update({key: value for key, value in stored.items() if key in values and _valid(key, value)})
	return values


def _stored() -> dict:
	if not frappe.get_meta("FCRM Settings").has_field(FIELD):
		return {}
	raw = frappe.db.get_single_value("FCRM Settings", FIELD)
	try:
		value = json.loads(raw) if raw else {}
	except (TypeError, ValueError):
		return {}
	return value if isinstance(value, dict) else {}


# ── what is still open ──────────────────────────────────────────────────────


def sections(user: str | None = None) -> list[dict]:
	"""Every section of the handover, in order; empty ones are left out."""
	user = user or frappe.session.user
	built = [_own_pendientes(user), _tomorrow(user)]
	for path in _paths():
		try:
			built += _load(path)(user) or []
		except Exception:
			# One app failing costs only its own section, never the handover.
			frappe.logger("crm.handover").exception(f"Handover section {path} failed")
			frappe.clear_last_message()
	return [section for section in built if section and section.get("count")]


def _paths() -> list[str]:
	return list(frappe.get_hooks(HOOK) or [])


def _load(path):
	return frappe.get_attr(path)


def _own_pendientes(user) -> dict | None:
	"""My pendientes due by today and still open: what the next person may need to pick up."""
	today = getdate(nowdate())
	end = datetime.datetime.combine(today, datetime.time.max)
	rows, count = [], 0
	if frappe.has_permission("ToDo", "read"):
		todos = frappe.get_list(
			"ToDo",
			filters={"allocated_to": user, "status": "Open", "date": ["<=", today]},
			fields=["name", "description", "date", "reference_type", "reference_name"],
			order_by="date asc",
			limit=ROW_LIMIT + 1,
		)
		count += len(todos)
		rows += [
			{
				"title": _first_line(row.description),
				"detail": _due_words(row.date),
				"to": f"/pendientes/todo/{row.name}",
			}
			for row in todos
		]
	if frappe.db.exists("DocType", "CRM Task") and frappe.has_permission("CRM Task", "read"):
		tasks = frappe.get_list(
			"CRM Task",
			filters={"assigned_to": user, "status": ["in", OPEN_TASKS], "due_date": ["<=", end]},
			fields=["name", "title", "due_date"],
			order_by="due_date asc",
			limit=ROW_LIMIT + 1,
		)
		count += len(tasks)
		rows += [
			{"title": row.title, "detail": _due_words(row.due_date), "to": f"/pendientes/crm-task/{row.name}"}
			for row in tasks
		]
	return {
		"key": "pendientes",
		"title": _("Your pendientes still open"),
		"count": min(count, ROW_LIMIT * 2),
		"rows": rows[:ROW_LIMIT],
	}


def _tomorrow(user) -> dict | None:
	"""Follow-ups due tomorrow, anyone's: the customers who said they come back."""
	if not frappe.db.exists("DocType", "CRM Task") or not frappe.has_permission("CRM Task", "read"):
		return None
	day = getdate(add_days(nowdate(), 1))
	start = datetime.datetime.combine(day, datetime.time.min)
	end = datetime.datetime.combine(day, datetime.time.max)
	tasks = frappe.get_list(
		"CRM Task",
		filters={"status": ["in", OPEN_TASKS], "due_date": ["between", [start, end]]},
		fields=["name", "title", "due_date", "assigned_to", "reference_doctype", "reference_docname"],
		order_by="due_date asc",
		limit=ROW_LIMIT + 1,
	)
	rows = []
	for row in tasks[:ROW_LIMIT]:
		who = _record_label(row.reference_doctype, row.reference_docname)
		owner = cstr(frappe.utils.get_fullname(row.assigned_to)).split(" ")[0] if row.assigned_to else ""
		rows.append(
			{
				"title": " · ".join(part for part in (row.title, who) if part),
				"detail": " · ".join(part for part in (_clock(row.due_date), owner) if part),
				"to": _record_route(row.reference_doctype, row.reference_docname),
			}
		)
	return {
		"key": "manana",
		"title": _("Follow-ups for tomorrow"),
		"count": len(tasks),
		"rows": rows,
	}


# ── handing over and reading it ─────────────────────────────────────────────


def prepare() -> dict:
	"""What the «Entregar turno» sheet shows."""
	return {
		"enabled": settings()["handover"],
		"can_change": can_change(),
		"sections": sections() if settings()["handover"] else [],
		"last": _dto(_last()),
	}


def hand_over(note: str = "") -> dict:
	if not settings()["handover"]:
		frappe.throw(_("The shift handover is off in this shop."))
	note = cstr(note).strip()
	if len(note) > NOTE_LIMIT:
		frappe.throw(_("Write a note of at most {0} characters.").format(NOTE_LIMIT))
	doc = frappe.get_doc(
		{
			"doctype": DOCTYPE,
			"handed_by": frappe.session.user,
			"handed_at": now_datetime(),
			"note": note,
			"sections": json.dumps(sections(), ensure_ascii=False, default=str),
			"seen_by": json.dumps([frappe.session.user]),
		}
	)
	# Hoy's own gate (every staff account) decides; the doctype grants Desk reads only.
	doc.insert(ignore_permissions=True)
	return {"message": _("Shift handed over. The next person sees it on their Hoy."), "last": _dto(doc)}


def pending_for(user: str | None = None) -> dict | None:
	"""The latest handover of the last day by someone else, if this person has not seen it."""
	user = user or frappe.session.user
	row = _last()
	if not row or row.handed_by == user or user in _seen(row):
		return None
	return _dto(row, full=True)


def acknowledge(name: str) -> dict:
	user = frappe.session.user
	if not name or not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("This handover no longer exists."), frappe.DoesNotExistError)
	doc = frappe.get_doc(DOCTYPE, name, for_update=True)
	seen = _seen(doc)
	if user not in seen:
		seen.append(user)
		frappe.db.set_value(DOCTYPE, name, "seen_by", json.dumps(seen), update_modified=False)
	return {"seen": True}


def hoy_state() -> dict:
	"""Hoy's «Turno» section: on or off, the handover waiting for me, the last one given."""
	if not frappe.db.exists("DocType", DOCTYPE) or not settings()["handover"]:
		return {"available": False, "reason": None}
	return {"available": True, "pending": pending_for(), "last": _dto(_last())}


def _last():
	since = now_datetime() - datetime.timedelta(hours=VISIBLE_HOURS)
	name = frappe.db.get_value(DOCTYPE, {"handed_at": [">=", since]}, "name", order_by="handed_at desc")
	return frappe.get_doc(DOCTYPE, name) if name else None


def _seen(doc) -> list:
	try:
		value = json.loads(doc.seen_by or "[]")
	except (TypeError, ValueError):
		return []
	return value if isinstance(value, list) else []


def _dto(doc, full: bool = False) -> dict | None:
	if not doc:
		return None
	out = {
		"name": doc.name,
		"by": doc.handed_by,
		"by_name": frappe.utils.get_fullname(doc.handed_by) or doc.handed_by,
		"at": str(get_datetime(doc.handed_at)),
		"when": _when_words(doc.handed_at),
	}
	if full:
		try:
			snapshot = json.loads(doc.sections or "[]")
		except (TypeError, ValueError):
			snapshot = []
		out["note"] = doc.note or ""
		out["sections"] = snapshot if isinstance(snapshot, list) else []
	return out


# ── words ───────────────────────────────────────────────────────────────────


def _first_line(text) -> str:
	from frappe.utils import strip_html

	plain = strip_html(cstr(text)).strip()
	return (plain.splitlines() or [""])[0][:140]


def _due_words(value) -> str:
	if not value:
		return ""
	day = getdate(value)
	today = getdate(nowdate())
	if day < today:
		return _("Overdue since {0}").format(frappe.utils.format_date(day, "d MMM"))
	return _("Due today")


def _when_words(value) -> str:
	"""«hoy a las 21:05» / «ayer a las 21:05», in site time."""
	moment = get_datetime(value)
	clock = moment.strftime("%H:%M")
	if moment.date() == getdate(nowdate()):
		return _("today at {0}").format(clock)
	if moment.date() == getdate(add_days(nowdate(), -1)):
		return _("yesterday at {0}").format(clock)
	return _("{0} at {1}").format(frappe.utils.format_date(moment.date(), "d MMM"), clock)


def _clock(value) -> str:
	if not value:
		return ""
	moment = get_datetime(value)
	return "" if moment.time() == datetime.time(0, 0) else moment.strftime("%H:%M")


def _record_label(doctype, name) -> str:
	if not doctype or not name or not frappe.db.exists(doctype, name):
		return ""
	meta = frappe.get_meta(doctype)
	for field in ("lead_name", "deal_name", "first_name", "organization"):
		if meta.has_field(field):
			value = frappe.db.get_value(doctype, name, field)
			if value:
				return cstr(value)
	return ""


def _record_route(doctype, name) -> str | None:
	if doctype == "CRM Deal":
		return f"/deals/{name}"
	if doctype == "CRM Lead":
		return f"/prospectos/{name}"
	return None
