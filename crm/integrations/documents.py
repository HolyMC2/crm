"""document.* events: any record type on the site (ERP, CRM, storefront, apps), for the
connections that subscribe to that type.

A connection picks the record type on each document.* event row. The "*" doc_events
hook returns at once unless an enabled connection subscribed to that type (one cached
set, cleared whenever a connection changes), and the payload is built later as the
connection's user like every other event. Changes the connection's own user made are
skipped when the connection says so, so a flow that writes back does not loop.
"""

import frappe
from frappe import _

from crm.integrations import webhooks

EVENTS = {
	"document.created": "A record of the chosen type was created.",
	"document.updated": "A record of the chosen type was changed.",
	"document.submitted": "A record of the chosen type was submitted (invoices, orders, payments…).",
	"document.cancelled": "A submitted record of the chosen type was cancelled.",
	"document.deleted": "A record of the chosen type was deleted.",
}
# Record types that hold credentials, logs, permissions or this engine's own rows.
DENY_MODULES = {"Core", "Custom", "Email", "Integrations"}
DENY_DOCTYPES = {
	"CRM Integration",
	"CRM Integration Delivery",
	"CRM Integration Subscription",
	"CRM Conversation Control Event",
	"CRM Outbound Intent",
	"CRM Conversation Rating",
	"CRM Webchat Session",
	"Error Log",
	"Scheduled Job Log",
	"Access Log",
	"Activity Log",
	"Route History",
	"Version",
	"Deleted Document",
	"Prepared Report",
	"Notification Log",
}


def is_document_event(event):
	return event in EVENTS


def refusal(doctype):
	"""Why this record type cannot be sent as document.* events, or None."""
	if not doctype or not frappe.db.exists("DocType", doctype):
		return _("Choose the record type this event is about.")
	meta = frappe.get_meta(doctype)
	if meta.istable or meta.issingle or meta.get("is_virtual"):
		return _("{0} is part of another record or a settings page; choose the main record type.").format(
			_(doctype)
		)
	if doctype in DENY_DOCTYPES or meta.module in DENY_MODULES:
		return _("{0} holds system or security data and cannot be sent to automations.").format(_(doctype))
	return None


def document_types(query="", limit=20, user=None):
	"""Record types a connection acting as `user` can subscribe to, for the settings picker."""
	query = (query or "").strip()
	filters = {"istable": 0, "issingle": 0, "module": ["not in", sorted(DENY_MODULES)]}
	rows = frappe.get_all(
		"DocType",
		filters=filters,
		or_filters={"name": ["like", f"%{query}%"]} if query else None,
		fields=["name", "module", "is_submittable"],
		order_by="name asc",
		limit=200,
	)
	out = []
	for row in rows:
		if row.name in DENY_DOCTYPES or not frappe.has_permission(row.name, "read", user=user):
			continue
		out.append(
			{
				"name": row.name,
				"label": _(row.name),
				"module": row.module,
				"submittable": bool(row.is_submittable),
			}
		)
		if len(out) >= limit:
			break
	return out


def _subscribed(doctype):
	return doctype in webhooks.document_types()


def _emit(doc, event, *, version, context=None, readable=False):
	webhooks.emit(
		event,
		doc.doctype,
		doc.name,
		version=version,
		context=context,
		actor=frappe.session.user,
		readable_doc=doc if readable else None,
	)


def after_insert(doc, method=None):
	if _subscribed(doc.doctype):
		_emit(doc, "document.created", version="created")


def on_update(doc, method=None):
	if doc.flags.in_insert or not _subscribed(doc.doctype):
		return
	before = doc.get_doc_before_save()
	if before is None:
		return
	from crm.integrations.events import changed_fields

	changed = changed_fields(before, doc)
	if changed:
		_emit(doc, "document.updated", version=str(doc.modified), context={"fields": changed})


def on_submit(doc, method=None):
	if _subscribed(doc.doctype):
		_emit(doc, "document.submitted", version="submitted")


def on_cancel(doc, method=None):
	if _subscribed(doc.doctype):
		_emit(doc, "document.cancelled", version="cancelled")


def on_trash(doc, method=None):
	# The record is gone when the payload is built, so who may hear of it is decided now.
	if _subscribed(doc.doctype):
		_emit(
			doc,
			"document.deleted",
			version="deleted:" + str(doc.modified),
			context={"deleted_by": frappe.session.user},
			readable=True,
		)


def build(event, doctype, name, context):
	from crm.integrations.events import _record

	if event == "document.deleted":
		return {"doctype": doctype, "name": name, "deleted_by": context.get("deleted_by")}
	data = {"doctype": doctype, "record": _record(doctype, name)}
	if context:
		data["change"] = context
	return data
