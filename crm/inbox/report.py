"""Conversation performance per person: first response, resolution, targets met, ratings.

A customer conversation is one long-lived thread per customer, so the measures use
episodes from the control ledger: an episode opens when the conversation is created
or comes back to people (reopened, handed over by the assistant) and ends when someone
closes it. First response is the time from the episode's start to the first reply a
person sent; resolution is the time from the start to the close.
"""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, getdate, nowdate

MANAGER_ROLES = {"System Manager", "Sales Manager"}
MAX_DAYS = 92
MAX_ROWS = 50000
REPLY_STATES = ("Accepted", "Delivered", "Read")


def _period(from_date, to_date):
	end = getdate(to_date or nowdate())
	start = getdate(from_date or add_days(end, -29))
	if start > end:
		start, end = end, start
	if (end - start).days > MAX_DAYS:
		frappe.throw(_("Choose a period of at most {0} days.").format(MAX_DAYS))
	return get_datetime(start), get_datetime(add_days(end, 1))


def require_manager():
	if not MANAGER_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only managers can see team performance."), frappe.PermissionError)


def _json_state(raw, field):
	try:
		return (frappe.parse_json(raw or "{}") or {}).get(field)
	except ValueError:
		return None


def performance(from_date=None, to_date=None, department=None):
	"""Rows per person plus a team total for the period (site time, both days included)."""
	from crm.inbox import settings as inbox_settings

	require_manager()
	start, end = _period(from_date, to_date)
	targets = inbox_settings()
	frt_target = cint(targets.get("first_response_minutes")) * 60
	res_target = cint(targets.get("resolution_hours")) * 3600

	conv_filters = {"modified": [">=", start]}
	if department:
		conv_filters["department"] = department
	conversations = {
		r.name: r
		for r in frappe.get_all(
			"CRM Conversation",
			filters=conv_filters,
			fields=["name", "creation", "department"],
			limit=MAX_ROWS,
			ignore_permissions=True,
		)
	}
	names = list(conversations) or [""]
	events = frappe.get_all(
		"CRM Conversation Control Event",
		filters={"conversation": ["in", names], "creation": ["between", [start, end]]},
		fields=["conversation", "creation", "previous_json", "result_json"],
		order_by="creation asc",
		limit=MAX_ROWS,
		ignore_permissions=True,
	)
	replies = defaultdict(list)
	for row in frappe.get_all(
		"CRM Outbound Intent",
		filters={
			"conversation": ["in", names],
			"origin": "Human",
			"state": ["in", REPLY_STATES],
			"creation": ["between", [start, end]],
		},
		fields=["conversation", "creation", "actor_user"],
		order_by="creation asc",
		limit=MAX_ROWS,
		ignore_permissions=True,
	):
		replies[row.conversation].append(row)

	people = defaultdict(lambda: defaultdict(list))
	by_conversation = defaultdict(list)
	for event in events:
		by_conversation[event.conversation].append(event)
	for name, conv in conversations.items():
		starts, closes = [], []
		if get_datetime(conv.creation) >= start:
			starts.append(get_datetime(conv.creation))
		for event in by_conversation.get(name, []):
			before = _json_state(event.previous_json, "control_state")
			after = _json_state(event.result_json, "control_state")
			if after == "Human" and before in {"Closed", "Bot"}:
				starts.append(get_datetime(event.creation))
			elif after == "Closed" and before != "Closed":
				owner = _json_state(event.previous_json, "human_owner")
				closes.append((get_datetime(event.creation), owner))
		episodes = _episodes(sorted(starts), closes)
		pending = list(replies.get(name, []))
		for opened, closed, owner in episodes:
			first = next(
				(
					r
					for r in pending
					if get_datetime(r.creation) >= opened
					and (not closed or get_datetime(r.creation) <= closed)
				),
				None,
			)
			if first:
				seconds = (get_datetime(first.creation) - opened).total_seconds()
				people[first.actor_user]["first_response"].append(seconds)
			if closed and owner:
				people[owner]["resolution"].append((closed - opened).total_seconds())
		for reply in pending:
			people[reply.actor_user]["replies"].append(1)

	rating_filters = {"status": "Rated", "rated_at": ["between", [start, end]]}
	if department:
		rating_filters["department"] = department
	for row in frappe.get_all(
		"CRM Conversation Rating",
		filters=rating_filters,
		fields=["human_owner", "rating"],
		limit=MAX_ROWS,
		ignore_permissions=True,
	):
		people[row.human_owner or ""]["ratings"].append(cint(row.rating))

	names_by_user = {
		u.name: u.full_name or u.name
		for u in frappe.get_all(
			"User", filters={"name": ["in", [p for p in people if p] or [""]]}, fields=["name", "full_name"]
		)
	}
	rows = [
		_summary(
			user, names_by_user.get(user) or (user or _("Without a person")), data, frt_target, res_target
		)
		for user, data in people.items()
	]
	rows.sort(key=lambda r: (-r["closed"], r["person_name"]))
	team = defaultdict(list)
	for data in people.values():
		for key, values in data.items():
			team[key].extend(values)
	return {
		"from_date": str(getdate(start)),
		"to_date": str(getdate(add_days(end, -1))),
		"targets": {"first_response_minutes": frt_target // 60, "resolution_hours": res_target // 3600},
		"rows": rows,
		"total": _summary(None, _("Team"), team, frt_target, res_target),
	}


def _episodes(starts, closes):
	"""Pair each close with the latest start before it; an unclosed start stays open."""
	episodes, opened = [], None
	timeline = [(t, "start", None) for t in starts] + [(t, "close", owner) for t, owner in closes]
	for when, kind, owner in sorted(timeline, key=lambda x: (x[0], x[1] == "start")):
		if kind == "start":
			opened = opened or when
		elif opened:
			episodes.append((opened, when, owner))
			opened = None
	if opened:
		episodes.append((opened, None, None))
	return episodes


def _average(values):
	return round(sum(values) / len(values), 1) if values else None


def _share(values, target):
	if not values or not target:
		return None
	return round(100 * sum(1 for v in values if v <= target) / len(values), 1)


def _summary(user, name, data, frt_target, res_target):
	frt, res, ratings = data.get("first_response", []), data.get("resolution", []), data.get("ratings", [])
	return {
		"person": user,
		"person_name": name,
		"replies": len(data.get("replies", [])),
		"first_responses": len(frt),
		"avg_first_response_minutes": _average([v / 60 for v in frt]),
		"first_response_met_pct": _share(frt, frt_target),
		"closed": len(res),
		"avg_resolution_hours": _average([v / 3600 for v in res]),
		"resolution_met_pct": _share(res, res_target),
		"ratings": len(ratings),
		"avg_rating": _average(ratings),
	}
