"""Who the shop's line rings: the people on the Twilio number (CRM Telephony Agent with
that `twilio_number`), where each one takes calls and who always rings, set by a manager
from Bandeja de clientes > Llamadas. Whom a call rings comes from the rule
(crm.call_rule): the salespeople at work, or everyone on the number. `ring_now` says
who a call would ring right now, and why.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

AGENT = "CRM Telephony Agent"
DEVICES = ("Computer", "Phone", "SIP Phone")
MANAGERS = {"System Manager", "Sales Manager"}


def require_manager():
	if not MANAGERS & set(frappe.get_roles()):
		frappe.throw(_("Only a manager can choose who answers the shop's line."), frappe.PermissionError)


def _digits(value) -> str:
	return "".join(c for c in str(value or "") if c.isdigit())


def shop_numbers() -> list[str]:
	"""The line's numbers: the ones already given to someone, else the Twilio account's."""
	numbers = sorted(
		{
			n
			for n in frappe.get_all(AGENT, filters={"twilio_number": ["is", "set"]}, pluck="twilio_number")
			if n
		}
	)
	if numbers:
		return numbers
	from crm.integrations.twilio.twilio_handler import Twilio

	try:
		twilio = Twilio.connect()
	except Exception:
		return []
	if not twilio:
		return []
	try:
		return sorted(n for n in twilio.get_phone_numbers() if n)
	except Exception:
		frappe.log_error(title="Twilio numbers not readable")
		return []


def team() -> dict:
	require_manager()
	numbers = shop_numbers()
	fields = ["name", "twilio_number", "call_receiving_device", "mobile_no", "sip_username"]
	if frappe.get_meta(AGENT).has_field("ring_always"):
		fields.append("ring_always")
	rows = frappe.get_all(
		AGENT,
		filters={"twilio_number": ["in", numbers]} if numbers else {"name": ["is", "not set"]},
		fields=fields,
		order_by="user_name asc",
	)
	people = []
	for row in rows:
		mobile = row.mobile_no or frappe.db.get_value("User", row.name, "mobile_no") or ""
		people.append(
			{
				"user": row.name,
				"full_name": frappe.utils.get_fullname(row.name),
				"device": row.call_receiving_device or "Computer",
				"has_mobile": bool(_digits(mobile)),
				"mobile_end": _digits(mobile)[-4:],
				"has_sip": bool(row.sip_username),
				"always": bool(cint(row.get("ring_always"))),
			}
		)
	from crm import call_rule

	staff = call_rule.staff(listed=[p["user"] for p in people], team_only=True) or {}
	kept = bool(staff.get("kept"))
	return {
		"numbers": numbers,
		"people": people,
		"enabled": bool(cint(_twilio_enabled())),
		"kept": kept,
		"default_rule": call_rule.rule_of("", kept),
		"areas": call_rule.areas(staff.get("team")),
	}


def _twilio_enabled():
	if not frappe.db.exists("DocType", "CRM Twilio Settings"):
		return 0
	return frappe.db.get_single_value("CRM Twilio Settings", "enabled")


def save(user: str, rings, device: str | None = None, mobile_no: str | None = None, always=None) -> dict:
	"""Put a person on the line (or take them off), say where they take calls and
	whether they ring on every call while the line rings whoever is on shift."""
	require_manager()
	if not frappe.db.get_value("User", user, "enabled"):
		frappe.throw(_("Choose an active person."))
	rings = bool(cint(rings))
	numbers = shop_numbers()
	if rings and not numbers:
		frappe.throw(_("Connect the shop's Twilio number first, in Ajustes › Teléfono."))
	if rings and len(numbers) > 1:
		frappe.throw(_("This shop has several numbers; set each person's number in Ajustes › Teléfono."))
	if device and device not in DEVICES:
		frappe.throw(_("Choose where this person takes calls."))
	doc = frappe.get_doc(AGENT, user) if frappe.db.exists(AGENT, user) else None
	if not rings:
		if doc and doc.twilio_number:
			doc.twilio_number = ""
			doc.save(ignore_permissions=True)
		return team()
	if not doc:
		doc = frappe.new_doc(AGENT)
		doc.user = user
		doc.user_name = frappe.utils.get_fullname(user)
	doc.twilio_number = numbers[0]
	doc.default_medium = doc.default_medium or "Twilio"
	if mobile_no is not None and _digits(mobile_no):
		doc.mobile_no = mobile_no.strip()
	device = device or doc.call_receiving_device or "Computer"
	if device == "Phone" and not _digits(doc.mobile_no or frappe.db.get_value("User", user, "mobile_no")):
		frappe.throw(
			_("Write {0}'s mobile number to send calls to it.").format(frappe.utils.get_fullname(user))
		)
	if device == "SIP Phone" and not doc.sip_username:
		frappe.throw(
			_("{0} has no SIP softphone yet; they set it up in Ajustes › Teléfono.").format(
				frappe.utils.get_fullname(user)
			)
		)
	doc.call_receiving_device = device
	if always is not None and doc.meta.has_field("ring_always"):
		doc.ring_always = 1 if cint(always) else 0
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	return team()


def _reach(details: dict, signed_in: set, sip_on: bool) -> dict:
	"""Where a call finds this person: their phone, a SIP softphone, or Muelle (open or not)."""
	device = details.get("call_receiving_device") or "Computer"
	mobile = _digits(details.get("agent_mobile") or details.get("mobile_no"))
	if device == "Phone" and mobile:
		return {"reach": "phone", "mobile_end": mobile[-4:]}
	if device == "SIP Phone" and sip_on and details.get("sip_username"):
		return {"reach": "sip", "mobile_end": ""}
	name = details.get("name") or ""
	return {"reach": "muelle" if name in signed_in else "muelle_off", "mobile_end": ""}


def ring_now(rule: str | None = None, fallback: str | None = None, skip_areas=None) -> dict:
	"""Who a call to the shop's line would ring right now, and why, for the settings page.
	`rule`, `fallback` and `skip_areas` are the page's unsaved choices."""
	require_manager()
	from crm import call_rule, calls_answer
	from crm.inbox import office_hours
	from crm.integrations.twilio import twilio_handler

	numbers = shop_numbers()
	settings = twilio_handler.inbox_settings()
	closed = calls_answer.policy(settings)["after_hours"] and twilio_handler.is_closed(settings, office_hours)
	if not numbers:
		return {"numbers": 0, "closed": closed, "rule": "", "mode": "", "because": "", "people": []}
	plan = call_rule.plan(
		numbers[0],
		settings=settings,
		rule=rule or None,
		fallback=fallback or None,
		skip=skip_areas if skip_areas is not None else None,
	)
	owners = plan["owners"]
	for user, details in owners.items():
		details.setdefault("name", user)
	signed_in = set(twilio_handler.get_active_loggedin_users(list(owners))) if owners else set()
	twilio_settings = frappe.get_single("CRM Twilio Settings") if _twilio_enabled() else None
	sip_on = bool(
		twilio_settings and twilio_settings.get("enable_sip_phone") and twilio_settings.get("sip_domain")
	)
	people = []
	for user in plan["ring"]:
		why = plan["why"].get(user) or {}
		people.append(
			{
				"user": user,
				"full_name": frappe.utils.get_fullname(user),
				"kind": why.get("kind") or "list",
				"shift": why.get("shift") or "",
				"checked_in": why.get("checked_in") or "",
				**_reach(owners.get(user) or {}, signed_in, sip_on),
			}
		)
	return {
		"numbers": len(numbers),
		"closed": closed,
		"rule": plan["rule"],
		"mode": plan["mode"],
		"because": plan["because"],
		"fallback": plan["fallback"],
		"kept": plan["kept"],
		"people": people,
	}
