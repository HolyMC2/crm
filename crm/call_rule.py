"""Who an incoming call rings: the rule a manager picks in Bandeja de clientes > Llamadas.

Rules (CRM Inbox Settings `call_ring_rule`):
- «shift»: the people who sell and are at work right now at the number's shop, each on
  their own device (CRM Telephony Agent `call_receiving_device`; «in Muelle» when they
  never set one), plus the people on the number marked `ring_always`. At work means on
  shift or checked in, as the site's attendance app says through the `crm_call_at_work`
  hook. Sells means holding a CRM sales role (`SELL_ROLES`) with an area (department, else
  designation) that the manager did not take off the line (`call_ring_skip_areas`).
- «list»: everyone on the number (CRM Telephony Agent with that `twilio_number`).

An empty rule is the default: «shift» on a site that keeps shifts, «list» elsewhere.
Under «shift», when nobody who sells is at work, or the site keeps no shifts, the
fallback applies (`call_ring_fallback`): «list» rings everyone on the number, «message»
rings only the always-ring people and then the caller hears the message.

The hook returns, for `at_work(now=, listed=, team_only=)`:
  {"kept": bool,                    # the site keeps shifts or check-ins
   "team": [{"user", "area", "area_label"}],   # active staff at the number's shop
   "at_work": [{"user", "shift", "checked_in"}]}  # at work now; shift «9-15», checked_in «9:02»
or None when it keeps no staff records. `choose` is pure; `plan` reads the site.
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint

HOOK = "crm_call_at_work"
SHIFT, LIST = "shift", "list"
RULES = (SHIFT, LIST)
MESSAGE = "message"
FALLBACKS = (LIST, MESSAGE)
SELL_ROLES = ("Sales User", "Sales Manager")
DEFAULT_DEVICE = "Computer"
NOBODY_USERS = ("Administrator", "Guest")


# ── pure ────────────────────────────────────────────────────────────────────


def areas_of(value) -> set[str]:
	"""The stored list of areas taken off the line (JSON list of strings)."""
	if isinstance(value, list | tuple | set):
		items = value
	else:
		try:
			items = json.loads(value) if value else []
		except (TypeError, ValueError):
			return set()
	return (
		{str(item) for item in items if isinstance(item, str)}
		if isinstance(items, list | tuple | set)
		else set()
	)


def rule_of(stored, kept: bool) -> str:
	return stored if stored in RULES else (SHIFT if kept else LIST)


def fallback_of(stored) -> str:
	return stored if stored in FALLBACKS else LIST


def choose(
	*,
	rule: str,
	fallback: str,
	listed: list,
	always: set,
	team: dict,
	at_work: list,
	sellers: set,
	kept: bool,
	skip_areas: set,
) -> dict:
	"""Who rings and why.

	`listed`: the people on the number, in order; `always`: those of them marked to ring
	on every call; `team`: {user: area} of the staff at the number's shop; `at_work`: the
	hook's rows; `sellers`: users holding a sales role.

	Returns {"rule", "mode": list|shift|fallback, "because": ""|nobody|no_shifts,
	"fallback", "ring": [user], "on_shift": [user], "why": {user: {...}}}."""
	out = {
		"rule": rule,
		"mode": LIST,
		"because": "",
		"fallback": fallback,
		"ring": [],
		"on_shift": [],
		"why": {},
	}

	def add(user, kind, **detail):
		if user in out["why"]:
			return
		out["ring"].append(user)
		out["why"][user] = {"kind": kind, **detail}

	if rule != SHIFT:
		for user in listed:
			add(user, "list")
		return out

	for row in at_work if kept else ():
		user = row.get("user")
		if not user or user not in sellers or user not in team:
			continue
		if (team.get(user) or "") in skip_areas:
			continue
		if user in out["on_shift"]:
			continue
		out["on_shift"].append(user)
		add(user, "shift", shift=row.get("shift") or "", checked_in=row.get("checked_in") or "")

	if out["on_shift"]:
		out["mode"] = SHIFT
		for user in listed:
			if user in always:
				add(user, "always")
		return out

	out["mode"] = "fallback"
	out["because"] = "nobody" if kept else "no_shifts"
	for user in listed:
		if user in always:
			add(user, "always")
		elif fallback == LIST:
			add(user, "list")
	return out


def log_entry(plan: dict, reached: set) -> dict:
	"""What the call's log keeps of the plan: who was at work, who rang, who could not."""
	return {
		"mode": plan["mode"],
		"because": plan["because"],
		"on_shift": list(plan["on_shift"]),
		"rang": [u for u in plan["ring"] if u in reached],
		"unreached": [u for u in plan["ring"] if u not in reached],
	}


def parse_log(value) -> dict | None:
	try:
		data = json.loads(value) if value else None
	except (TypeError, ValueError):
		return None
	if not isinstance(data, dict):
		return None
	lists = ("on_shift", "rang", "unreached")
	return {
		"mode": str(data.get("mode") or ""),
		"because": str(data.get("because") or ""),
		**{key: [u for u in data.get(key) or [] if isinstance(u, str)] for key in lists},
	}


# ── site ────────────────────────────────────────────────────────────────────


def _provider():
	paths = frappe.get_hooks(HOOK) or []
	return frappe.get_attr(paths[-1]) if paths else None


def staff(now=None, listed=(), team_only=False) -> dict | None:
	"""The hook's answer, or None: no attendance app, or it failed (the line keeps
	ringing the list rather than nobody)."""
	fn = _provider()
	if not fn:
		return None
	try:
		data = fn(now=now, listed=list(listed), team_only=team_only)
	except Exception:
		frappe.log_error(title="Calls: who is at work could not be read")
		return None
	return data if isinstance(data, dict) else None


def sellers_among(users) -> set:
	users = [u for u in set(users or ()) if u and u not in NOBODY_USERS]
	if not users:
		return set()
	enabled = set(frappe.get_all("User", filters={"name": ["in", users], "enabled": 1}, pluck="name"))
	if not enabled:
		return set()
	return set(
		frappe.get_all(
			"Has Role",
			filters={"parenttype": "User", "parent": ["in", sorted(enabled)], "role": ["in", SELL_ROLES]},
			pluck="parent",
		)
	)


def devices(users) -> dict:
	"""{user: {call_receiving_device, sip_username, agent_mobile, mobile_no}} for people who
	ring without being on the number; «in Muelle» for whoever never set a device. Raw SQL:
	Twilio's webhook runs as Guest."""
	users = [u for u in users if u]
	if not users:
		return {}
	out = {}
	for row in frappe.db.sql(
		"""SELECT u.name AS user, a.call_receiving_device, a.sip_username,
		a.mobile_no AS agent_mobile, u.mobile_no
		FROM `tabUser` u LEFT JOIN `tabCRM Telephony Agent` a ON a.name = u.name
		WHERE u.name IN %(users)s""",
		{"users": tuple(users)},
		as_dict=True,
	):
		out[row.user] = {
			"name": row.user,
			"call_receiving_device": row.call_receiving_device or DEFAULT_DEVICE,
			"sip_username": row.sip_username or "",
			"agent_mobile": row.agent_mobile or "",
			"mobile_no": row.mobile_no or "",
		}
	return out


def settings_values(settings) -> dict:
	get = settings.get if settings else (lambda _k: None)
	return {
		"rule": get("call_ring_rule") or "",
		"fallback": fallback_of(get("call_ring_fallback")),
		"skip": areas_of(get("call_ring_skip_areas")),
	}


def plan(number, *, settings=None, now=None, owners=None, rule=None, fallback=None, skip=None) -> dict:
	"""Who a call to `number` rings now, with each person's device (`owners`).

	`rule`, `fallback` and `skip` override the stored settings (the settings page asks
	what an unsaved choice would do)."""
	from crm.integrations.twilio.twilio_handler import get_twilio_number_owners

	values = settings_values(settings)
	rule = rule if rule in RULES else values["rule"]
	fallback = fallback_of(fallback) if fallback is not None else values["fallback"]
	skip = areas_of(skip) if skip is not None else values["skip"]
	owners = dict(owners if owners is not None else get_twilio_number_owners(number))
	listed = list(owners)
	always = {u for u, d in owners.items() if cint(d.get("ring_always"))}
	info = staff(now=now, listed=listed) if rule != LIST else None
	kept = bool(info and info.get("kept"))
	team = {r.get("user"): r.get("area") or "" for r in (info or {}).get("team") or [] if r.get("user")}
	at_work = [r for r in (info or {}).get("at_work") or [] if isinstance(r, dict)]
	chosen = choose(
		rule=rule_of(rule, kept),
		fallback=fallback,
		listed=listed,
		always=always,
		team=team,
		at_work=at_work,
		sellers=sellers_among(r.get("user") for r in at_work),
		kept=kept,
		skip_areas=skip,
	)
	others = devices([u for u in chosen["ring"] if u not in owners])
	chosen["owners"] = {
		u: owners.get(u) or others.get(u) or {"call_receiving_device": DEFAULT_DEVICE} for u in chosen["ring"]
	}
	chosen["kept"] = kept
	chosen["team"] = team
	return chosen


def may_ring(user: str) -> bool:
	"""Whether the line may ring `user` while they are at work: the rule is «shift» and they
	sell in an area that answers. Their browser then gets an incoming-calls token even
	without a number of their own."""
	if not user or user in NOBODY_USERS:
		return False
	from crm import inbox

	values = settings_values(inbox.settings())
	if values["rule"] == LIST or user not in sellers_among([user]):
		return False
	info = staff(listed=(), team_only=True)
	if not info:
		return False
	if rule_of(values["rule"], bool(info.get("kept"))) != SHIFT:
		return False
	team = {r.get("user"): r.get("area") or "" for r in info.get("team") or [] if r.get("user")}
	return user in team and team[user] not in values["skip"]


def areas(team_rows) -> list[dict]:
	"""The areas of the people who sell, for the settings page: [{key, label, people}]."""
	team_rows = [r for r in team_rows or [] if r.get("user")]
	sellers = sellers_among(r["user"] for r in team_rows)
	found = {}
	for row in team_rows:
		if row["user"] not in sellers:
			continue
		key = row.get("area") or ""
		entry = found.setdefault(key, {"key": key, "label": row.get("area_label") or key, "people": 0})
		entry["people"] += 1
	return sorted(found.values(), key=lambda a: (a["key"] == "", a["label"].lower()))
