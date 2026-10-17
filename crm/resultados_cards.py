"""CRM's card for Resultados (the `muelle_resultados_cards` hook).

On a phone the legacy Dashboard is desktop-only (Shell SPEC D3); its sales
numbers fold into Resultados here, as one «Tratos ganados» card that opens the
Embudo. The numbers are the Dashboard's own (crm.api.dashboard), so the two
screens never disagree: won deals by closing date, the average won amount and
the deals still open, with the caller's record permissions.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, add_months, add_years, get_first_day, get_last_day, getdate, nowdate

MANAGER_ROLES = {"Sales Manager", "System Manager"}
EMBUDO = "/crm/pipeline-analysis"


def window(periodo: str, today=None, desde: str | None = None, hasta: str | None = None):
	"""(from, to) as dates for a Resultados period; unknown is Mes."""
	day = getdate(today or nowdate())
	if periodo == "hoy":
		return day, day
	if periodo == "ayer":
		y = add_days(day, -1)
		return y, y
	if periodo == "semana":
		return add_days(day, -day.weekday()), day
	if periodo == "mes_anterior":
		start = get_first_day(add_months(day, -1))
		return start, get_last_day(start)
	if periodo == "rango" and desde and hasta:
		return getdate(desde), getdate(hasta)
	return get_first_day(day), day


def compare_window(compara: str, start, end):
	"""The comparison window, or None for «Sin comparar». «Anterior» is the
	window of the same length just before; «Año» is the same dates last year."""
	if compara == "no":
		return None
	if compara == "anio":
		return add_years(start, -1), add_years(end, -1)
	length = (end - start).days + 1
	return add_days(start, -length), add_days(start, -1)


def _reason(user: str) -> str | None:
	if not frappe.has_permission("CRM Deal", "read", user=user):
		return _("Ask your manager for permission to read deals.")
	if user != "Administrator" and not set(frappe.get_roles(user)) & MANAGER_ROLES:
		return False  # not a manager: the card does not apply (absent, not blocked)
	return None


def _pct(value, prev):
	if prev in (None, 0) or value is None:
		return None
	return round((value - prev) / prev * 100, 1)


def tratos(ctx: dict) -> dict | None:
	from crm.api import dashboard

	user = ctx.get("user") or frappe.session.user
	reason = _reason(user)
	if reason is False:
		return None
	if reason:
		return {"key": "tratos", "blocked_reason": reason}
	if ctx.get("check"):
		return {"key": "tratos"}
	start, end = window(ctx.get("periodo") or "mes", None, ctx.get("desde"), ctx.get("hasta"))
	won = dashboard.get_won_deals(str(start), str(end))
	value = int(won.get("value") or 0)
	other = compare_window(ctx.get("compara") or "anterior", start, end)
	prev = None
	if other:
		prev = int(dashboard.get_won_deals(str(other[0]), str(other[1])).get("value") or 0)
	average = dashboard.get_average_won_deal_value(str(start), str(end))
	ongoing = dashboard.get_ongoing_deals(str(start), str(end))
	facts = [
		{"label": _("Average won"), "value": average.get("value") or 0, "format": "money"},
		{"label": _("Opened, still open"), "value": int(ongoing.get("value") or 0), "format": "count"},
	]
	return {
		"key": "tratos",
		"label": _("Won deals"),
		"format": "count",
		"value": value,
		"prev": prev,
		"delta_pct": _pct(value, prev),
		"period": {
			"from": str(start),
			"to": str(end),
			"compare": ctx.get("compara") or "anterior",
			"compare_from": str(other[0]) if other else None,
			"compare_to": str(other[1]) if other else None,
		},
		"facts": facts,
		"note": _("By closing date; the amount is what was agreed, not what was invoiced."),
		"drill": {"label": _("Open the funnel"), "path": EMBUDO, "query": {}},
	}
