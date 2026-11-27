"""Who the shop's line rings: the people on the Twilio number (CRM Telephony Agent with
that `twilio_number`) and where each one takes calls, set by a manager from Bandeja de
clientes > Llamadas. Every incoming call rings all of them at once
(crm.integrations.twilio.twilio_handler.ring_targets).
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
	rows = frappe.get_all(
		AGENT,
		filters={"twilio_number": ["in", numbers]} if numbers else {"name": ["is", "not set"]},
		fields=["name", "twilio_number", "call_receiving_device", "mobile_no", "sip_username"],
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
			}
		)
	return {"numbers": numbers, "people": people, "enabled": bool(cint(_twilio_enabled()))}


def _twilio_enabled():
	if not frappe.db.exists("DocType", "CRM Twilio Settings"):
		return 0
	return frappe.db.get_single_value("CRM Twilio Settings", "enabled")


def save(user: str, rings, device: str | None = None, mobile_no: str | None = None) -> dict:
	"""Put a person on the line (or take them off) and say where they take calls."""
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
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	return team()
