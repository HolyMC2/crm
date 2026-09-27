# Copyright (c) 2023, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from urllib.parse import quote

import frappe
from frappe import _, generate_hash
from frappe.model import get_permitted_fields
from frappe.model.document import Document

from crm.integrations.api import get_contact_by_phone_number
from crm.utils import seconds_to_duration


class CRMCallLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.core.doctype.dynamic_link.dynamic_link import DynamicLink
		from frappe.types import DF

		caller: DF.Link | None
		duration: DF.Duration | None
		end_time: DF.Datetime | None
		id: DF.Data | None
		links: DF.Table[DynamicLink]
		medium: DF.Data | None
		note: DF.Link | None
		receiver: DF.Link | None
		recording_url: DF.SmallText | None
		reference_docname: DF.DynamicLink | None
		reference_doctype: DF.Link | None
		start_time: DF.Datetime | None
		status: DF.Literal[
			"Initiated",
			"Ringing",
			"In Progress",
			"Completed",
			"Failed",
			"Busy",
			"No Answer",
			"Queued",
			"Canceled",
		]
		telephony_medium: DF.Literal["", "Manual", "Twilio", "Exotel"]
		to: DF.Data
		type: DF.Literal["Incoming", "Outgoing"]
	# end: auto-generated types

	def before_insert(self):
		if not self.id:
			self.id = generate_hash(length=12)
		if not self.telephony_medium:
			self.telephony_medium = "Manual"

	def on_update(self):
		self._touch_linked_records()

	def _touch_linked_records(self):
		# Bumping `modified` on the linked Lead/Deal makes the call show up as
		# the latest activity in list sorts and "last updated" labels, so a new
		# call moves the record to the top of the agent's view.
		targets = set()
		if self.reference_doctype and self.reference_docname:
			targets.add((self.reference_doctype, self.reference_docname))
		for link in self.links or []:
			if link.link_doctype in ("CRM Lead", "CRM Deal"):
				targets.add((link.link_doctype, link.link_name))
		if not targets:
			return
		now = frappe.utils.now()
		for dt, name in targets:
			if frappe.db.exists(dt, name):
				frappe.db.set_value(dt, name, "modified", now, update_modified=False)

	@staticmethod
	def default_list_data():
		columns = [
			{
				"label": "Caller",
				"type": "Link",
				"key": "caller",
				"options": "User",
				"width": "9rem",
			},
			{
				"label": "Receiver",
				"type": "Link",
				"key": "receiver",
				"options": "User",
				"width": "9rem",
			},
			{
				"label": "Type",
				"type": "Select",
				"key": "type",
				"width": "9rem",
			},
			{
				"label": "Status",
				"type": "Select",
				"key": "status",
				"width": "9rem",
			},
			{
				"label": "Duration",
				"type": "Duration",
				"key": "duration",
				"width": "6rem",
			},
			{
				"label": "From (number)",
				"type": "Data",
				"key": "from",
				"width": "9rem",
			},
			{
				"label": "To (number)",
				"type": "Data",
				"key": "to",
				"width": "9rem",
			},
			{
				"label": "Created On",
				"type": "Datetime",
				"key": "creation",
				"width": "8rem",
			},
		]
		rows = [
			"name",
			"caller",
			"receiver",
			"type",
			"status",
			"duration",
			"from",
			"to",
			"note",
			"recording_url",
			"reference_doctype",
			"reference_docname",
			"creation",
		]
		return {"columns": columns, "rows": rows}

	def parse_list_data(calls):
		return [parse_call_log(call) for call in calls] if calls else []

	def has_link(self, doctype, name):
		for link in self.links:
			if link.link_doctype == doctype and link.link_name == name:
				return True

	def link_with_reference_doc(self, reference_doctype, reference_name):
		if self.has_link(reference_doctype, reference_name):
			return

		self.append("links", {"link_doctype": reference_doctype, "link_name": reference_name})

	def as_dict(self, *args, **kwargs):
		d = super().as_dict(*args, **kwargs)
		if d.get("recording_url"):
			d["recording_url_path"] = (
				f"/api/method/crm.integrations.api.get_recording_url?call_log_name={quote(str(d.get('name')), safe='')}"
			)
		return d


CALL_FIELDS = (
	"name",
	"id",
	"caller",
	"receiver",
	"from",
	"to",
	"duration",
	"start_time",
	"end_time",
	"status",
	"type",
	"recording_url",
	"creation",
	"note",
	"reference_doctype",
	"reference_docname",
)
ACTIVITY_FIELDS = {
	"FCRM Note": ("name", "title", "content", "owner", "modified", "creation"),
	"CRM Task": (
		"name",
		"title",
		"description",
		"assigned_to",
		"due_date",
		"priority",
		"status",
		"modified",
		"creation",
	),
}
REFERENCE_FIELDS = {"reference_doctype", "reference_docname"}


def readable_activity_fields(doctype, *, parenttype=None):
	"""Native scalar/Table read policy, excluding masked and Password values."""
	meta = frappe.get_meta(doctype)
	allowed = set(get_permitted_fields(doctype, parenttype=parenttype, permission_type="read"))
	levels = set(meta.get_permlevel_access("read", parenttype=parenttype))
	if 0 not in levels and frappe.share.get_shared(parenttype or doctype, rights=["read"], limit=1):
		levels.add(0)
	# Native document reads bypass field levels for Administrator. Metadata
	# without permissions also exposes its fields; an empty level list is not
	# a denial in either case (get_permlevel_access itself has no Admin branch).
	unrestricted = frappe.session.user == "Administrator" or not meta.get_permissions(parenttype)
	allowed.update(
		f.fieldname for f in meta.get_table_fields() if unrestricted or (f.permlevel or 0) in levels
	)
	return (
		allowed
		- {f.fieldname for f in meta.get_masked_fields(parenttype=parenttype)}
		- {f.fieldname for f in meta.fields if f.fieldtype == "Password"}
	)


def unique_activities(rows):
	# CRM Task names are native integers; Dynamic Link names are strings.
	return list({str(row["name"]): row for row in rows}.values())


def get_permitted_docs(doctype: str, names=None, *, filters=None) -> list[dict]:
	"""Finite Note/Task DTOs under native list scope, without default-page truncation."""
	if (names is not None and not names) or not frappe.has_permission(doctype, "read"):
		return []
	allowed = readable_activity_fields(doctype)
	if filters and not set(filters).issubset(allowed):
		return []
	filters = dict(filters or {})
	if names is not None:
		names = list(dict.fromkeys(str(name) for name in names))
		filters["name"] = ("in", names)
	rows = frappe.get_list(
		doctype,
		filters=filters,
		fields=[f for f in ACTIVITY_FIELDS[doctype] if f in allowed],
		limit_page_length=0,
		order_by="creation desc, name desc",
	)
	if names is not None:
		positions = {name: index for index, name in enumerate(names)}
		rows.sort(key=lambda row: positions[str(row.name)])
	return rows


def readable_call_links():
	return "links" in readable_activity_fields("CRM Call Log") and {
		"link_doctype",
		"link_name",
	}.issubset(readable_activity_fields("Dynamic Link", parenttype="CRM Call Log"))


def get_call_links(names, types):
	"""Child rows remain internal and inherit native permission from their call."""
	if not names or not readable_call_links():
		return []
	return frappe.qb.get_query(
		"Dynamic Link",
		parent_doctype="CRM Call Log",
		ignore_permissions=False,
		fields=["parent", "link_doctype", "link_name"],
		filters={
			"parent": ("in", names),
			"parenttype": "CRM Call Log",
			"parentfield": "links",
			"link_doctype": ("in", types),
		},
		order_by="idx asc, name asc",
	).run(as_dict=True)


def call_linked_activities(calls, links):
	notes = [call["note"] for call in calls if call.get("note")]
	notes.extend(link.link_name for link in links if link.link_doctype == "FCRM Note")
	tasks = [link.link_name for link in links if link.link_doctype == "CRM Task"]
	admitted_notes = get_permitted_docs("FCRM Note", notes)
	admitted_names = {str(note.name) for note in admitted_notes}
	for call in calls:
		if call.get("note") and str(call["note"]) not in admitted_names:
			call.pop("note", None)
	return admitted_notes, get_permitted_docs("CRM Task", tasks)


def call_user_labels(calls):
	users = {call.get(field) for call in calls for field in ("caller", "receiver")} - {None, ""}
	if not users or not frappe.has_permission("User", "read"):
		return {}
	allowed = readable_activity_fields("User")
	fields = [field for field in ("name", "full_name", "user_image") if field in allowed]
	return {
		row.name: {"label": row.get("full_name") or row.name, "image": row.get("user_image")}
		for row in frappe.get_list(
			"User", filters={"name": ("in", sorted(users))}, fields=fields, limit_page_length=0
		)
	}


def parse_call_log(call, *, user_labels=None, resolve_contact=True):
	# Native list callers may request additional columns; preserve those columns,
	# but never derive labels from a field that is now masked or unreadable.
	allowed = readable_activity_fields("CRM Call Log")
	call = frappe._dict({key: value for key, value in call.items() if key in allowed})
	call["show_recording"] = False
	call["_duration"] = seconds_to_duration(call.get("duration")) if "duration" in call else ""
	call["_caller"] = {"label": _("Unknown"), "image": None}
	call["_receiver"] = {"label": _("Unknown"), "image": None}
	if call.get("type") in ("Incoming", "Outgoing"):
		incoming = call["type"] == "Incoming"
		call["activity_type"] = "incoming_call" if incoming else "outgoing_call"
		phone = call.get("from" if incoming else "to")
		contact = get_contact_by_phone_number(phone) if resolve_contact and phone else {}
		party = {
			"label": contact.get("full_name") or (phone if not resolve_contact else None) or _("Unknown"),
			"image": contact.get("image"),
		}
		user = call.get("receiver" if incoming else "caller")
		if user_labels is None:
			user_labels = call_user_labels([call])
		agent = user_labels.get(user) or {"label": user or _("Unknown"), "image": None}
		call["_caller"], call["_receiver"] = (party, agent) if incoming else (agent, party)
	return call


@frappe.whitelist()
def get_call_log(name: str):
	if not frappe.has_permission("CRM Call Log", "read", name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	allowed = readable_activity_fields("CRM Call Log")
	rows = frappe.get_list(
		"CRM Call Log",
		filters={"name": name},
		fields=[f for f in CALL_FIELDS if f in allowed],
		limit_page_length=1,
	)
	if not rows:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	call = parse_call_log(rows[0])
	links = get_call_links([name], ["FCRM Note", "CRM Task", "CRM Lead", "CRM Deal"])
	call["_notes"], call["_tasks"] = call_linked_activities([call], links)
	if call.get("recording_url"):
		call["recording_url_path"] = (
			f"/api/method/crm.integrations.api.get_recording_url?call_log_name={quote(str(name), safe='')}"
		)

	references = [
		(link.link_doctype, link.link_name) for link in links if link.link_doctype in ("CRM Lead", "CRM Deal")
	]
	reference = (call.pop("reference_doctype", None), call.pop("reference_docname", None))
	if REFERENCE_FIELDS.issubset(allowed) and reference[0] in ("CRM Lead", "CRM Deal") and reference[1]:
		references.insert(0, reference)
	permitted_references = set()
	for doctype in ("CRM Lead", "CRM Deal"):
		names = {target for kind, target in references if kind == doctype}
		if names and frappe.has_permission(doctype, "read"):
			permitted_references.update(
				(doctype, row.name)
				for row in frappe.get_list(
					doctype, filters={"name": ("in", sorted(names))}, fields=["name"], limit_page_length=0
				)
			)
	for doctype, target in dict.fromkeys(references):
		if (doctype, target) in permitted_references:
			call.setdefault("_lead" if doctype == "CRM Lead" else "_deal", target)
			if (doctype, target) == reference:
				call["reference_doctype"], call["reference_docname"] = reference
	# The native detail modal formats these keys. Null is a neutral placeholder,
	# not a masked value or a derived direction/person/duration.
	for field in ("type", "status", "duration", "caller", "receiver"):
		call.setdefault(field, None)
	return call


@frappe.whitelist()
def create_lead_from_call_log(call_log: str | dict, lead_details: str | dict | None = None):
	call_log_data = frappe.parse_json(call_log or {})

	if isinstance(call_log_data, str):
		call_log_name = call_log_data
	elif isinstance(call_log_data, dict):
		call_log_name = call_log_data.get("name")
	else:
		call_log_name = None

	if not call_log_name:
		frappe.throw(_("A valid call log is required."), frappe.ValidationError)

	call_doc = frappe.get_doc("CRM Call Log", call_log_name)

	if not call_doc.has_permission("write"):
		frappe.throw(_("You are not permitted to update this call log."), frappe.PermissionError)

	if not frappe.has_permission("CRM Lead", "create"):
		frappe.throw(_("You are not permitted to create leads."), frappe.PermissionError)

	lead_details_data = frappe.parse_json(lead_details or {})
	if lead_details_data and not isinstance(lead_details_data, dict):
		frappe.throw(_("Invalid lead details supplied."), frappe.ValidationError)

	lead = frappe.new_doc("CRM Lead")
	meta = frappe.get_meta("CRM Lead")
	valid_fieldnames = [df.fieldname for df in meta.fields]

	sanitized_details = {
		key: value for key, value in (lead_details_data or {}).items() if key in valid_fieldnames
	}

	if "lead_owner" in valid_fieldnames and not sanitized_details.get("lead_owner"):
		sanitized_details["lead_owner"] = frappe.session.user

	if "mobile_no" in valid_fieldnames and not sanitized_details.get("mobile_no"):
		sanitized_details["mobile_no"] = call_doc.get("from") or ""

	if "first_name" in valid_fieldnames and not sanitized_details.get("first_name"):
		reference_label = sanitized_details.get("mobile_no") or call_doc.name
		sanitized_details["first_name"] = _("Lead from call {0}").format(reference_label)

	lead.update(sanitized_details)
	lead.insert()

	call_doc.link_with_reference_doc("CRM Lead", lead.name)
	call_doc.save()

	return lead.name
