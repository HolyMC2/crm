"""The first follow-up a new prospect gets, when the shop asks for one (the Prospectos settings).

A CRM Task through the follow-up service (crm.pipeline.services.follow_up): one slot per
lead, so a retried insert never opens two, and the task follows the lead's owner while it
is open, unless a person moved it by hand. An assignment rule names the owner after the
lead's own `after_insert`, through a ToDo, so the task moves when that ToDo arrives.
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from crm.lead import settings as prospect_settings
from crm.pipeline.constants import OPEN_TASK_STATUSES
from crm.pipeline.services import follow_up

OCCURRENCE = "1"
SAVEPOINT = "crm_first_follow_up"
DUE = {"2h": {"hours": 2}, "tomorrow": {"days": 1}}


def slot(lead: str) -> str:
	return f"CRM Lead:{lead}:primer-seguimiento"


def due_for(choice: str, now=None):
	offset = DUE.get(choice)
	return add_to_date(now or now_datetime(), **offset) if offset else None


def on_lead_insert(doc, method=None) -> None:
	"""CRM Lead `after_insert`."""
	if _bulk() or doc.get("converted"):
		return
	due = due_for(prospect_settings.get()["first_follow_up"])
	if not due:
		return
	# A follow-up that cannot be written never costs the prospect: the lead arrives from
	# web forms and webhooks too, and losing it would be worse than a missing reminder.
	frappe.db.savepoint(SAVEPOINT)
	try:
		follow_up.upsert(
			reference_doctype="CRM Lead",
			reference_name=doc.name,
			slot=slot(doc.name),
			occurrence=OCCURRENCE,
			title=_("Follow up"),
			activity_type=_activity(doc),
			due=str(due),
			owner=doc.get("lead_owner"),
			# The shop's setting is the business event; the session may be a webhook or a guest form.
			ignore_permissions=True,
		)
	except Exception as error:
		try:
			frappe.db.rollback(save_point=SAVEPOINT)
		except Exception:
			# A deadlock already rolled the whole transaction back (the savepoint is gone,
			# 1305): the lead is not there either, so its caller must hear it and retry.
			raise error from None
		frappe.log_error(title="crm first follow-up", reference_doctype="CRM Lead", reference_name=doc.name)


def on_todo_insert(doc, method=None) -> None:
	"""ToDo `after_insert`: a lead assigned to someone hands them its open first follow-up."""
	if doc.get("reference_type") != "CRM Lead" or not doc.get("allocated_to"):
		return
	if doc.get("status") not in (None, "", "Open"):
		return
	name = slot(doc.reference_name)
	if not frappe.db.exists("CRM Task", {"automation_slot": name, "status": ["in", OPEN_TASK_STATUSES]}):
		return
	follow_up.reassign(slot=name, owner=doc.allocated_to)


def _activity(doc) -> str:
	# How the worker will most likely reach them first.
	if doc.get("mobile_no"):
		return "WhatsApp" if doc.get("mobile_is_whatsapp") in (None, 1, "1") else "Call"
	if doc.get("phone"):
		return "Call"
	if doc.get("email"):
		return "Email"
	return "Task"


def _bulk() -> bool:
	flags = frappe.flags
	return bool(flags.in_import or flags.in_install or flags.in_patch or flags.in_migrate)
