"""«Resumen de ayer»: what yesterday left, for the owner, each morning and in Hoy.

At the hour the owner chose (Hoy's settings, default 8:00 site time) every
owner and manager gets one notice («Resumen de ayer: ventas $12,400 · 3
cosas que atender»). It opens Hoy's «Resumen de ayer» sheet, where each row
has its button. The sheet reads the figures live, as the person who opens it,
so they always match the screen the button opens.

Rows come from crm and from the apps that list a provider under the
``muelle_morning_summary`` hook: ``provider(day) -> [row]``, a row being
``{"key", "title", "value", "detail", "to"|"href", "attention": bool}`` in the
worker's words. A provider that fails costs only its own rows.

Idempotent per (person, day). Nothing is sent when nothing needs attention
and nothing was sold.
"""

import datetime

import frappe
from frappe import _
from frappe.utils import add_days, cint, fmt_money, getdate, now_datetime, nowdate

HOOK = "muelle_morning_summary"
RECIPIENT_ROLES = ("System Manager", "Sales Manager")
HOURS = (6, 7, 8, 9, 10, 11)
SENT_KEY = "crm:morning_summary"
ROW_LIMIT = 12


def yesterday() -> datetime.date:
	return getdate(add_days(nowdate(), -1))


# ── the rows ────────────────────────────────────────────────────────────────


def rows(day: datetime.date | None = None) -> list[dict]:
	"""Every row of the summary for the session user, in order."""
	day = day or yesterday()
	built = []
	for build in (_sales, _follow_ups, _approvals):
		try:
			built += build(day) or []
		except Exception:
			frappe.logger("crm.morning").exception("Morning summary row failed")
			frappe.clear_last_message()
	for path in _paths():
		try:
			built += _load(path)(day) or []
		except Exception:
			frappe.logger("crm.morning").exception(f"Morning summary provider {path} failed")
			frappe.clear_last_message()
	return [row for row in built if isinstance(row, dict) and row.get("title")][:ROW_LIMIT]


def _paths() -> list[str]:
	return list(frappe.get_hooks(HOOK) or [])


def _load(path):
	return frappe.get_attr(path)


def _sales(day) -> list[dict]:
	"""Resultados' own «Ventas» card for yesterday, for those who see the money."""
	from crm.api import money, resultados

	if money.hidden() or "ventas" not in (card for card, _path in resultados._providers()):
		return []
	answer = resultados.board(periodo="ayer", compara="anterior", card="ventas")
	card = next(iter(answer.get("cards") or []), None)
	if not card or card.get("retry") or card.get("blocked_reason"):
		return []
	charged = card.get("charged") or {}
	value = charged.get("value", card.get("value"))
	currency = answer.get("currency")
	facts = [_fact_text(fact, currency) for fact in (charged.get("facts") or card.get("facts") or [])]
	return [
		{
			"key": "ventas",
			"title": _("Yesterday's sales"),
			"value": fmt_money(value or 0, precision=0, currency=currency),
			"amount": float(value or 0),
			"detail": " · ".join(fact for fact in facts[:2] if fact),
			"to": (card.get("drill") or {}).get("to") or "/resultados?periodo=ayer",
			"attention": False,
		}
	]


def _fact_text(fact, currency) -> str:
	"""A Resultados fact ({label, value, format}) in words: «Tickets 14», «Sin IVA $10,690»."""
	if not isinstance(fact, dict):
		return str(fact or "")
	value = fact.get("value")
	if fact.get("format") == "money":
		shown = fmt_money(value or 0, precision=0, currency=currency)
	elif isinstance(value, float) and value.is_integer():
		shown = str(int(value))
	else:
		shown = str(value if value is not None else "")
	return f"{fact.get('label') or ''} {shown}".strip()


def _follow_ups(day) -> list[dict]:
	"""Follow-ups due by yesterday and still open, per person: who dropped what."""
	if not frappe.db.exists("DocType", "CRM Task") or not frappe.has_permission("CRM Task", "read"):
		return []
	end = datetime.datetime.combine(day, datetime.time.max)
	tasks = frappe.get_list(
		"CRM Task",
		filters=[
			["status", "in", ("Backlog", "Todo", "In Progress")],
			# Frappe reads a missing date as the earliest one: an undated task is not overdue.
			["due_date", "is", "set"],
			["due_date", "<=", end],
		],
		fields=["assigned_to"],
		limit=2000,
	)
	if not tasks:
		return []
	counts = {}
	for task in tasks:
		counts[task.assigned_to or ""] = counts.get(task.assigned_to or "", 0) + 1
	top = sorted(counts.items(), key=lambda item: -item[1])[:3]
	names = ", ".join(
		f"{(frappe.utils.get_fullname(user) or user).split(' ')[0] if user else _('No owner')} {count}"
		for user, count in top
	)
	return [
		{
			"key": "seguimientos",
			"title": _("Follow-ups not done"),
			"value": str(len(tasks)),
			"detail": names,
			"to": "/deals?follow_up=overdue",
			"attention": True,
		}
	]


def _approvals(day) -> list[dict]:
	"""What waits for the owner in Pendientes, Por aprobar."""
	if "doco" not in frappe.get_installed_apps():
		return []
	try:
		from doco.pendientes import aprobaciones
	except ImportError:
		return []
	counts = aprobaciones.counts() or {}
	waiting = int((counts.get("approve") or {}).get("value") or 0)
	if not waiting:
		return []
	return [
		{
			"key": "aprobar",
			"title": _("Waiting for your approval"),
			"value": str(waiting),
			"detail": "",
			"to": "/pendientes?segment=approve",
			"attention": True,
		}
	]


# ── settings (Hoy's) ────────────────────────────────────────────────────────


def enabled() -> bool:
	from crm import handover

	return handover.settings()["morning"]


def hour() -> int:
	from crm import handover

	return handover.settings()["morning_hour"]


# ── the notice ──────────────────────────────────────────────────────────────


def recipients() -> list[str]:
	users = frappe.get_all(
		"Has Role", filters={"role": ["in", RECIPIENT_ROLES], "parenttype": "User"}, pluck="parent"
	)
	users = sorted(set(users) - {"Administrator", "Guest"})
	if not users:
		return []
	return frappe.get_all(
		"User", filters={"name": ["in", users], "enabled": 1, "user_type": "System User"}, pluck="name"
	)


def send_due() -> None:
	"""Hourly: at the owner's hour, one notice per owner and manager, once a day."""
	if not enabled() or now_datetime().hour != hour():
		return
	day = yesterday()
	for user in recipients():
		try:
			send(user, day)
		except Exception:
			frappe.logger("crm.morning").exception(f"Morning summary for {user} failed")
			frappe.clear_last_message()


def send(user: str, day: datetime.date) -> bool:
	key = f"{SENT_KEY}:{user}:{day}"
	if frappe.cache.get_value(key):
		return False
	previous = frappe.session.user
	try:
		frappe.set_user(user)
		found = rows(day)
	finally:
		frappe.set_user(previous)
	attention = sum(1 for row in found if row.get("attention"))
	sales = next((row for row in found if row.get("key") == "ventas" and row.get("amount")), None)
	if not attention and not sales:
		frappe.cache.set_value(key, 1, expires_in_sec=36 * 3600)
		return False
	parts = []
	if sales:
		parts.append(_("sales {0}").format(sales["value"]))
	if attention:
		parts.append(
			_("{0} things to look at").format(attention) if attention != 1 else _("1 thing to look at")
		)
	subject = _("Yesterday's summary: {0}").format(" · ".join(parts))
	frappe.get_doc(
		{
			"doctype": "Notification Log",
			"for_user": user,
			"type": "Alert",
			"subject": subject[:140],
			"email_content": subject,
			"link": "/crm/hoy?resumen=1",
		}
	).insert(ignore_permissions=True)
	frappe.cache.set_value(key, 1, expires_in_sec=36 * 3600)
	return True


def settings_rows() -> dict:
	from crm import handover

	values = handover.settings()
	return {
		"morning": values["morning"],
		"morning_hour": cint(values["morning_hour"]),
		"hours": list(HOURS),
		"can_change": handover.can_change(),
	}
