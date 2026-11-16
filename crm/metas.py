"""What Equipo's Metas (doco.metas) can measure in the CRM, through doco's
`doco_metas_indicadores` hook (doco reads this module; crm never imports doco).

Atención (WhatsApp, email): the inbox's own performance figures per person
(crm.inbox.report.measure): first replies inside the inbox's reply goal, the average
first reply, conversations closed inside the closing goal, the customers' rating and
replies sent. The goals the inbox settings hold (first_response_minutes,
resolution_hours) decide what «in time» means.

Ventas: deals won (status of type Won) by their owner, counted on the day they
closed, how many and how much; and new deals and leads answered in time, from the
CRM's own response SLA (`response_by`, `first_responded_on`): answered by the time
due is on time, answered later or still unanswered past it is late, and one not due
yet is not judged.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, now_datetime

NOBODY = ("Administrator", "Guest", None, "")


# ── Inbox ────────────────────────────────────────────────────────────


def _inbox(start: date, end: date) -> dict:
	"""crm.inbox.report.measure per person, once per period in this request."""
	from crm.inbox import report

	memo = getattr(frappe.local, "crm_metas_inbox", None)
	if memo is None:
		memo = frappe.local.crm_metas_inbox = {}
	key = (str(start), str(end))
	if key not in memo:
		rows = report.measure(str(start), str(end))["rows"]
		memo[key] = {row["person"]: row for row in rows if row.get("person") not in NOBODY}
	return memo[key]


def _inbox_values(field: str, n_field: str, detail):
	def values(start, end, company=None, options=None) -> dict:
		out = {}
		for user, row in _inbox(start, end).items():
			n = int(row.get(n_field) or 0)
			if not n or row.get(field) is None:
				continue
			out[user] = {"value": flt(row[field]), "n": n, "detail": detail(row)}
		return out

	return values


def _inbox_indicators() -> list[dict]:
	if not frappe.db.exists("DocType", "CRM Conversation"):
		return []
	group = _("Customer service")
	return [
		{
			"key": "inbox.primera_respuesta",
			"label": _("First reply in time"),
			"group": group,
			"unit": "percent",
			"better": "higher",
			"help": _("Conversations whose first reply came inside the inbox's reply goal."),
			"values": _inbox_values(
				"first_response_met_pct",
				"first_responses",
				lambda r: _("{0} conversations").format(r.get("first_responses") or 0),
			),
		},
		{
			"key": "inbox.primera_respuesta_min",
			"label": _("Average first reply"),
			"group": group,
			"unit": "minutes",
			"better": "lower",
			"help": _("Minutes from the customer's message to the first reply, on average."),
			"values": _inbox_values(
				"avg_first_response_minutes",
				"first_responses",
				lambda r: _("{0} conversations").format(r.get("first_responses") or 0),
			),
		},
		{
			"key": "inbox.cerradas_a_tiempo",
			"label": _("Conversations closed in time"),
			"group": group,
			"unit": "percent",
			"better": "higher",
			"help": _("Conversations closed inside the inbox's closing goal."),
			"values": _inbox_values(
				"resolution_met_pct", "closed", lambda r: _("{0} closed").format(r.get("closed") or 0)
			),
		},
		{
			"key": "inbox.calificacion",
			"label": _("Customer rating"),
			"group": group,
			"unit": "rating",
			"better": "higher",
			"help": _("The customers' average rating of the conversations the person closed (1 to 5)."),
			"values": _inbox_values(
				"avg_rating", "ratings", lambda r: _("{0} ratings").format(r.get("ratings") or 0)
			),
		},
		{
			"key": "inbox.respuestas",
			"label": _("Replies sent"),
			"group": group,
			"unit": "count",
			"better": "higher",
			"help": _("Messages the person sent to customers."),
			"values": _inbox_values("replies", "replies", lambda r: None),
		},
	]


# ── Deals and leads ──────────────────────────────────────────────────


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
	return datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)


def _won_statuses() -> list[str]:
	return frappe.get_all("CRM Deal Status", filters={"type": "Won"}, pluck="name")


def _won(start: date, end: date, company=None) -> list:
	statuses = _won_statuses()
	if not statuses:
		return []
	meta = frappe.get_meta("CRM Deal")
	fields = ["name", "deal_owner", "deal_value"]
	if meta.has_field("net_total"):
		fields.append("net_total")
	return frappe.get_all(
		"CRM Deal",
		filters={"status": ["in", statuses], "closed_date": ["between", [start, end]]},
		fields=fields,
		limit_page_length=0,
		ignore_permissions=True,
	)


def deals_won(start, end, company=None, options=None) -> dict:
	out: dict[str, dict] = defaultdict(lambda: {"value": 0.0, "n": 0, "detail": None})
	for row in _won(start, end):
		if row.deal_owner in NOBODY:
			continue
		out[row.deal_owner]["value"] += 1
		out[row.deal_owner]["n"] += 1
	return dict(out)


def deals_won_amount(start, end, company=None, options=None) -> dict:
	out: dict[str, dict] = defaultdict(lambda: {"value": 0.0, "n": 0, "detail": None})
	for row in _won(start, end):
		if row.deal_owner in NOBODY:
			continue
		amount = flt(row.get("net_total")) or flt(row.deal_value)
		out[row.deal_owner]["value"] += amount
		out[row.deal_owner]["n"] += 1
	return {user: {**row, "detail": _("{0} deals").format(row["n"])} for user, row in out.items()}


def judge_response(response_by, responded_on, now: datetime) -> bool | None:
	"""True: answered by the time due. False: answered later, or unanswered past it.
	None: not due yet and unanswered (not judged)."""
	if not response_by:
		return None
	due = get_datetime(response_by)
	if responded_on:
		return get_datetime(responded_on) <= due
	return False if now > due else None


def _answered_in_time(doctype: str, owner_field: str):
	def values(start, end, company=None, options=None) -> dict:
		begin, finish = _bounds(start, end)
		now = now_datetime()
		tally: dict[str, list[int]] = defaultdict(lambda: [0, 0])
		for row in frappe.get_all(
			doctype,
			filters={
				"creation": ["between", [begin, finish - timedelta(microseconds=1)]],
				"response_by": ["is", "set"],
			},
			fields=[owner_field, "response_by", "first_responded_on"],
			limit_page_length=0,
			ignore_permissions=True,
		):
			owner = row.get(owner_field)
			if owner in NOBODY:
				continue
			verdict = judge_response(row.response_by, row.first_responded_on, now)
			if verdict is None:
				continue
			tally[owner][1] += 1
			if verdict:
				tally[owner][0] += 1
		return {
			user: {
				"value": round(100 * good / total, 1),
				"n": total,
				"detail": _("{0} of {1} in time").format(good, total),
			}
			for user, (good, total) in tally.items()
			if total
		}

	return values


def _converted(start, end, company=None, options=None) -> dict:
	begin, finish = _bounds(start, end)
	out: dict[str, dict] = defaultdict(lambda: {"value": 0.0, "n": 0, "detail": None})
	for row in frappe.get_all(
		"CRM Deal",
		filters={"lead": ["is", "set"], "creation": ["between", [begin, finish - timedelta(microseconds=1)]]},
		fields=["deal_owner"],
		limit_page_length=0,
		ignore_permissions=True,
	):
		if row.deal_owner in NOBODY:
			continue
		out[row.deal_owner]["value"] += 1
		out[row.deal_owner]["n"] += 1
	return dict(out)


def _deal_indicators() -> list[dict]:
	group = _("Sales")
	return [
		{
			"key": "tratos.ganados",
			"label": _("Deals won"),
			"group": group,
			"unit": "count",
			"better": "higher",
			"help": _("Deals whose owner closed them won in the period."),
			"values": deals_won,
		},
		{
			"key": "tratos.ganado_monto",
			"label": _("Money from deals won"),
			"group": group,
			"unit": "money",
			"better": "higher",
			"help": _("What the deals won in the period are worth, for their owner."),
			"values": deals_won_amount,
		},
		{
			"key": "tratos.respuesta_a_tiempo",
			"label": _("New deals answered in time"),
			"group": group,
			"unit": "percent",
			"better": "higher",
			"help": _("New deals whose first answer came by the time the response SLA gives."),
			"values": _answered_in_time("CRM Deal", "deal_owner"),
		},
		{
			"key": "prospectos.respuesta_a_tiempo",
			"label": _("New leads answered in time"),
			"group": group,
			"unit": "percent",
			"better": "higher",
			"help": _("New leads whose first answer came by the time the response SLA gives."),
			"values": _answered_in_time("CRM Lead", "lead_owner"),
		},
		{
			"key": "prospectos.convertidos",
			"label": _("Leads turned into deals"),
			"group": group,
			"unit": "count",
			"better": "higher",
			"help": _("Deals created from a lead in the period, for the deal's owner."),
			"values": _converted,
		},
	]


def indicators() -> list[dict]:
	return [*_inbox_indicators(), *_deal_indicators()]
