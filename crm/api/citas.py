"""«Agendar cita» in the WhatsApp chat (Citas en línea, doco.citas).

«Send booking link» sends the shop's published «Agendar cita» WhatsApp Flow with today's
services and free times frozen into it, through the outbox like any reply (same fence,
24 h window, suppression and account checks). Without a published flow it sends the /citas
link as text. «Book appointment» opens Agenda's staff booking with the chat's contact.
"""

import frappe
from frappe import _

from crm.api import conversations as control


def _engine():
	try:
		from doco.citas import messages, schema
		from doco.citas import whatsapp as flows
		from doco.citas.service import problems_cached
	except ImportError:
		return None
	if not schema.installed():
		return None
	return frappe._dict(messages=messages, flows=flows, problems=problems_cached)


def _contact(doc):
	"""The chat's linked Contact, else the one Contact whose mobile ends like the peer's."""
	for row in frappe.parse_json(doc.get("context_links") or "[]") or []:
		if row.get("doctype") == "Contact" and frappe.has_permission("Contact", "read", doc=row.get("name")):
			return {"name": row["name"], "label": frappe.db.get_value("Contact", row["name"], "full_name") or row["name"]}
	tail = "".join(ch for ch in str(doc.peer_id or "") if ch.isdigit())[-10:]
	if len(tail) < 7:
		return None
	rows = frappe.get_list(
		"Contact",
		filters={"mobile_no": ["like", f"%{tail}"]},
		fields=["name", "full_name"],
		limit_page_length=2,
	)
	return {"name": rows[0].name, "label": rows[0].full_name or rows[0].name} if len(rows) == 1 else None


@frappe.whitelist()
def booking_context(conversation: str):
	engine = _engine()
	with control.conversation_fence(conversation):
		doc = control._load(control._text(conversation, 140))
		control._authorize(doc)
		if not engine or doc.provider != "WhatsApp":
			return {"available": False}
		if engine.problems():
			return {"available": False, "reason": _("Online appointments are not set up yet. The owner sets them up in Agenda.")}
		flow = engine.flows.flow_state()
		return {
			"available": True,
			"flow": flow["ready"] and flow["account"] == doc.account_record,
			"bookingUrl": engine.messages.booking_url(),
			"contact": _contact(doc),
			"canBook": bool(frappe.has_permission("Appointment", "create")),
		}


@frappe.whitelist(methods=["POST"])
def send_booking_link(conversation: str, expected_generation: int | str, request_id: str):
	from crm.api import outbox

	engine = _engine()
	if not engine:
		frappe.throw(_("Online appointments are not installed on this site."))
	if engine.problems():
		frappe.throw(_("Online appointments are not set up yet. The owner sets them up in Agenda."))
	with control.conversation_fence(conversation):
		doc = control._load(control._text(conversation, 140))
		control._authorize(doc, write=True)
		flow = engine.flows.flow_state()
	text = _("Choose the day and time that suit you.")
	if flow["ready"] and flow["account"] == doc.account_record:
		return outbox.queue_flow_message(
			conversation,
			expected_generation,
			request_id,
			{
				"flow": flow["flow"],
				"body": text,
				"token_prefix": engine.flows.TOKEN_PREFIX,
				"data": engine.flows.flow_data(),
			},
		)
	url = engine.messages.booking_url()
	if not url:
		frappe.throw(_("Add your shop's web address to its storefront profile so customers can open the booking page."))
	return outbox.queue_message(conversation, expected_generation, request_id, {"type": "text", "text": f"{text} {url}"})
