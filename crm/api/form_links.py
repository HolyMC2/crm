"""Attach a record captured by a form to the customer's existing conversations.

Additive conversation metadata only (context_links, like a person's link or a
bot's own capture): no control generation, no owner change, no message. The
caller is trusted server code acting on a record it just created.
"""

import json

import frappe
from frappe.utils import now_datetime

from crm.api import automation_departments as departments
from crm.api import conversations as control


def whatsapp_conversations(phone):
	"""Open WhatsApp conversations whose peer matches `phone` on its last 10 digits."""
	tail = "".join(ch for ch in str(phone or "") if ch.isdigit())[-10:]
	if len(tail) < 7:
		return []
	return frappe.get_all(
		control.DOCTYPE,
		filters={"provider": "WhatsApp", "peer_id": ["like", f"%{tail}"], "control_state": ["!=", "Closed"]},
		pluck="name",
		order_by="modified desc",
		limit=5,
	)


def link(conversation, doctype, docname, *, source, added_by=None):
	"""Link doctype/docname to the conversation once. Returns True when linked
	now or already, False when the conversation cannot take it (closed, full,
	record type not linkable)."""
	if doctype not in departments.record_doctypes() or not frappe.db.exists(doctype, docname):
		return False
	if not all(frappe.db.has_column(control.DOCTYPE, field) for field in control.METADATA_FIELDS):
		return False
	with control.conversation_fence(conversation):
		doc = control._load(conversation)
		if doc.control_state == "Closed":
			return False
		links = departments.parse_links(doc.get("context_links"))
		if any((row["doctype"], row["name"]) == (doctype, docname) for row in links):
			return True
		if len(links) >= departments.MAX_LINKS:
			return False
		links.append(
			{
				"doctype": doctype,
				"name": docname,
				"department": control._owning_department(doctype, doc.get("department")),
				"added_by": added_by or frappe.session.user,
				"added_at": str(now_datetime()),
				"source": str(source)[:120],
			}
		)
		control._write_metadata(
			doc, {"context_links": json.dumps(links, sort_keys=True, separators=(",", ":"))}
		)
		return True
