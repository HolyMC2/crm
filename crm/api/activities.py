import json

import frappe
from bs4 import BeautifulSoup
from frappe import _
from frappe.desk.form.load import get_docinfo
from frappe.translate import get_translated_doctypes

from crm.fcrm.doctype.crm_call_log.crm_call_log import (
	CALL_FIELDS,
	REFERENCE_FIELDS,
	call_linked_activities,
	call_user_labels,
	get_call_links,
	get_permitted_docs,
	parse_call_log,
	readable_activity_fields,
	readable_call_links,
	unique_activities,
)
from crm.fcrm.doctype.crm_fields_layout.crm_fields_layout import get_permlevel_access

ATTACHMENT_FIELDS = (
	"name",
	"file_name",
	"file_type",
	"file_url",
	"file_size",
	"is_private",
	"modified",
	"creation",
	"owner",
)


@frappe.whitelist()
def get_activities(name: str, doctype: str | None = None):
	if doctype is not None:
		if doctype == "CRM Deal":
			return get_deal_activities(name)
		if doctype == "CRM Lead":
			return get_lead_activities(name)
		frappe.throw(_("Unsupported activity document type"), frappe.ValidationError)
	# Older clients did not send a type. New clients keep the exact parent identity.
	if frappe.db.exists("CRM Deal", name):
		return get_deal_activities(name)
	elif frappe.db.exists("CRM Lead", name):
		return get_lead_activities(name)
	else:
		frappe.throw(_("Document not found"), frappe.DoesNotExistError)


def _get_activity_docinfo(doctype: str, name: str):
	"""Use native history internally without adding raw Versions to the RPC response."""
	missing = object()
	previous = frappe.response.pop("docinfo", missing)
	try:
		get_docinfo("", doctype, name)
		return frappe.response["docinfo"]
	finally:
		frappe.response.pop("docinfo", None)
		if previous is not missing:
			frappe.response["docinfo"] = previous


def get_deal_activities(name: str):
	if not frappe.has_permission("CRM Deal", "read", name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	docinfo = _get_activity_docinfo("CRM Deal", name)
	attachment_index = _activity_attachments(docinfo)
	deal_fields = get_readable_fields("CRM Deal")
	avoid_fields = [
		"lead",
		"response_by",
		"sla_creation",
		"sla",
		"first_response_time",
		"first_responded_on",
	]

	doc = frappe.db.get_values("CRM Deal", name, ["creation", "owner", "lead"])[0]
	lead = doc[2]

	activities = []
	calls = []
	notes = []
	tasks = []
	attachments = []
	creation_text = _("created this deal")

	if lead:
		creation_text = _("converted the lead to this deal")
		# a user can have access to the deal but not the lead it came from, so
		# skip the lead's history instead of failing the whole timeline
		if frappe.has_permission("CRM Lead", "read", lead):
			activities, calls, notes, tasks, attachments = get_lead_activities(lead)

	activities.append(
		{
			"activity_type": "creation",
			"creation": doc[0],
			"owner": doc[1],
			"data": creation_text,
			"is_lead": False,
		}
	)

	docinfo.versions.reverse()

	for version in docinfo.versions:
		data = json.loads(version.data)
		if not data.get("changed") or not data["changed"][0]:
			continue

		for change in data["changed"]:
			field = deal_fields.get(change[0], None)

			if not field or change[0] in avoid_fields:
				continue

			# The native history projection retains readable Link change events
			# but withholds legacy values whose target identity is not recorded.
			# Preserve that event without trying to recover either old title.
			values_withheld = not change[1] and not change[2]
			if values_withheld and field.get("fieldtype") not in ("Link", "Dynamic Link"):
				continue

			field_label = field.get("label") or change[0]
			field_option = field.get("options") or None

			activity_type = "changed"
			data = {
				"field": change[0],
				"field_label": field_label,
				"old_value": change[1],
				"value": change[2],
			}
			if values_withheld:
				data["values_withheld"] = True

			if not change[1] and change[2]:
				activity_type = "added"
				data = {
					"field": change[0],
					"field_label": field_label,
					"value": change[2],
				}
			elif change[1] and not change[2]:
				activity_type = "removed"
				data = {
					"field": change[0],
					"field_label": field_label,
					"value": change[1],
				}

			if data.get("value") and field_option and is_translatable(field_option):
				data["value"] = _(data["value"])

				if data.get("old_value"):
					data["old_value"] = _(data["old_value"])

		activity = {
			"activity_type": activity_type,
			"creation": version.creation,
			"owner": version.owner,
			"data": data,
			"is_lead": False,
			"options": field_option,
		}
		activities.append(activity)

	for comment in docinfo.comments:
		activity = {
			"name": comment.name,
			"activity_type": "comment",
			"creation": comment.creation,
			"owner": comment.owner,
			"content": comment.content,
			"attachments": attachment_index.get(("Comment", comment.name), []),
			"is_lead": False,
		}
		activities.append(activity)

	for communication in docinfo.communications + docinfo.automated_messages:
		activity = {
			"activity_type": "communication",
			"communication_type": communication.communication_type,
			"communication_date": communication.communication_date or communication.creation,
			"creation": communication.creation,
			"data": {
				"subject": communication.subject,
				"content": communication.content,
				"sender_full_name": communication.sender_full_name,
				"sender": communication.sender,
				"recipients": communication.recipients,
				"cc": communication.cc,
				"bcc": communication.bcc,
				"attachments": attachment_index.get(("Communication", communication.name), []),
				"read_by_recipient": communication.read_by_recipient,
				"delivery_status": communication.delivery_status,
			},
			"is_lead": False,
		}
		activities.append(activity)

	for attachment_log in docinfo.attachment_logs:
		activity = {
			"name": attachment_log.name,
			"activity_type": "attachment_log",
			"creation": attachment_log.creation,
			"owner": attachment_log.owner,
			"data": parse_attachment_log(attachment_log.content, attachment_log.comment_type),
			"is_lead": False,
		}
		activities.append(activity)

	linked_calls = get_linked_calls("CRM Deal", name)
	calls = calls + linked_calls.get("calls", [])
	notes = notes + get_linked_notes("CRM Deal", name) + linked_calls.get("notes", [])
	tasks = tasks + get_linked_tasks("CRM Deal", name) + linked_calls.get("tasks", [])
	attachments = attachments + get_attachments("CRM Deal", name)

	activities.sort(key=lambda x: x["creation"], reverse=True)
	activities = handle_multiple_versions(activities)

	return (
		activities,
		unique_activities(calls),
		unique_activities(notes),
		unique_activities(tasks),
		attachments,
	)


def get_lead_activities(name: str):
	if not frappe.has_permission("CRM Lead", "read", name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	docinfo = _get_activity_docinfo("CRM Lead", name)
	attachment_index = _activity_attachments(docinfo)
	lead_fields = get_readable_fields("CRM Lead")
	avoid_fields = [
		"converted",
		"response_by",
		"sla_creation",
		"sla",
		"first_response_time",
		"first_responded_on",
	]

	doc = frappe.db.get_values("CRM Lead", name, ["creation", "owner"])[0]
	activities = [
		{
			"activity_type": "creation",
			"creation": doc[0],
			"owner": doc[1],
			"data": _("created this lead"),
			"is_lead": True,
		}
	]

	docinfo.versions.reverse()

	for version in docinfo.versions:
		data = json.loads(version.data)
		if not data.get("changed") or not data["changed"][0]:
			continue

		for change in data["changed"]:
			field = lead_fields.get(change[0], None)

			if not field or change[0] in avoid_fields:
				continue

			# The native history projection retains readable Link change events
			# but withholds legacy values whose target identity is not recorded.
			# Preserve that event without trying to recover either old title.
			values_withheld = not change[1] and not change[2]
			if values_withheld and field.get("fieldtype") not in ("Link", "Dynamic Link"):
				continue

			field_label = field.get("label") or change[0]
			field_option = field.get("options") or None

			activity_type = "changed"
			data = {
				"field": change[0],
				"field_label": field_label,
				"old_value": change[1],
				"value": change[2],
			}
			if values_withheld:
				data["values_withheld"] = True

			if not change[1] and change[2]:
				activity_type = "added"
				data = {
					"field": change[0],
					"field_label": field_label,
					"value": change[2],
				}
			elif change[1] and not change[2]:
				activity_type = "removed"
				data = {
					"field": change[0],
					"field_label": field_label,
					"value": change[1],
				}

			if data.get("value") and field_option and is_translatable(field_option):
				data["value"] = _(data["value"])

				if data.get("old_value"):
					data["old_value"] = _(data["old_value"])

		activity = {
			"activity_type": activity_type,
			"creation": version.creation,
			"owner": version.owner,
			"data": data,
			"is_lead": True,
			"options": field_option,
		}
		activities.append(activity)

	for comment in docinfo.comments:
		activity = {
			"name": comment.name,
			"activity_type": "comment",
			"creation": comment.creation,
			"owner": comment.owner,
			"content": comment.content,
			"attachments": attachment_index.get(("Comment", comment.name), []),
			"is_lead": True,
		}
		activities.append(activity)

	for communication in docinfo.communications + docinfo.automated_messages:
		activity = {
			"activity_type": "communication",
			"communication_type": communication.communication_type,
			"communication_date": communication.communication_date or communication.creation,
			"creation": communication.creation,
			"data": {
				"subject": communication.subject,
				"content": communication.content,
				"sender_full_name": communication.sender_full_name,
				"sender": communication.sender,
				"recipients": communication.recipients,
				"cc": communication.cc,
				"bcc": communication.bcc,
				"attachments": attachment_index.get(("Communication", communication.name), []),
				"read_by_recipient": communication.read_by_recipient,
				"delivery_status": communication.delivery_status,
			},
			"is_lead": True,
		}
		activities.append(activity)

	for attachment_log in docinfo.attachment_logs:
		activity = {
			"name": attachment_log.name,
			"activity_type": "attachment_log",
			"creation": attachment_log.creation,
			"owner": attachment_log.owner,
			"data": parse_attachment_log(attachment_log.content, attachment_log.comment_type),
			"is_lead": True,
		}
		activities.append(activity)

	linked_calls = get_linked_calls("CRM Lead", name)
	calls = linked_calls.get("calls", [])
	notes = get_linked_notes("CRM Lead", name) + linked_calls.get("notes", [])
	tasks = get_linked_tasks("CRM Lead", name) + linked_calls.get("tasks", [])
	attachments = get_attachments("CRM Lead", name)

	activities.sort(key=lambda x: x["creation"], reverse=True)
	activities = handle_multiple_versions(activities)

	return (
		activities,
		unique_activities(calls),
		unique_activities(notes),
		unique_activities(tasks),
		attachments,
	)


def get_readable_fields(doctype: str):
	"""Map of fieldname to label & options, skipping fields the user cannot read.

	History must respect current field permissions and masking, including values
	written before a field became masked. Password history is never displayed.
	"""
	allowed_permlevels = get_permlevel_access("read", doctype)
	meta = frappe.get_meta(doctype)
	masked = {field.fieldname for field in meta.get_masked_fields()}

	return {
		field.fieldname: {
			"label": field.label,
			"options": field.options,
			"fieldtype": field.fieldtype,
		}
		for field in meta.fields
		if (field.permlevel == 0 or field.permlevel in allowed_permlevels)
		and field.fieldname not in masked
		and field.fieldtype != "Password"
	}


def get_attachments(doctype: str, name: str):
	return (
		frappe.db.get_all(
			"File",
			filters={"attached_to_doctype": doctype, "attached_to_name": name},
			fields=list(ATTACHMENT_FIELDS),
		)
		or []
	)


def _activity_attachments(docinfo):
	"""Two reads for the exact entries already admitted by native docinfo.

	Keep Comment and Communication names in separate scopes; identical names
	across DocTypes cannot borrow another entry's files. Return the existing DTO.
	"""
	index = {}
	for doctype, entries in (
		("Comment", docinfo.comments),
		("Communication", docinfo.communications + docinfo.automated_messages),
	):
		names = list(dict.fromkeys(entry.name for entry in entries))
		if not names:
			continue
		rows = frappe.db.get_all(
			"File",
			filters={"attached_to_doctype": doctype, "attached_to_name": ["in", names]},
			fields=[*ATTACHMENT_FIELDS, "attached_to_name"],
		)
		for row in rows:
			name = row.pop("attached_to_name")
			index.setdefault((doctype, name), []).append(row)
	return index


def handle_multiple_versions(versions: list):
	activities = []
	grouped_versions = []
	old_version = None
	for version in versions:
		is_version = version["activity_type"] in ["changed", "added", "removed"]
		if not is_version:
			activities.append(version)
		if not old_version:
			old_version = version
			if is_version:
				grouped_versions.append(version)
			continue
		if is_version and old_version.get("owner") and version["owner"] == old_version["owner"]:
			grouped_versions.append(version)
		else:
			if grouped_versions:
				activities.append(parse_grouped_versions(grouped_versions))
			grouped_versions = []
			if is_version:
				grouped_versions.append(version)
		old_version = version
		if version == versions[-1] and grouped_versions:
			activities.append(parse_grouped_versions(grouped_versions))

	return activities


def parse_grouped_versions(versions: list):
	version = versions[0]
	if len(versions) == 1:
		return version
	other_versions = versions[1:]
	version["other_versions"] = other_versions
	return version


def _check_activity_parent(doctype, name):
	if doctype not in ("CRM Lead", "CRM Deal"):
		frappe.throw(_("Unsupported activity document type"), frappe.ValidationError)
	if not frappe.has_permission(doctype, "read", name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def get_linked_calls(doctype: str, name: str):
	_check_activity_parent(doctype, name)
	empty = {"calls": [], "notes": [], "tasks": []}
	if not frappe.has_permission("CRM Call Log", "read"):
		return empty
	allowed = readable_activity_fields("CRM Call Log")
	# Direction is required by the existing timeline card. Do not mislabel a
	# hidden direction as outgoing through that card's default branch.
	if "type" not in allowed:
		return empty
	Call = frappe.qb.DocType("CRM Call Log")
	relation = None
	if REFERENCE_FIELDS.issubset(allowed):
		relation = (Call.reference_doctype == doctype) & (Call.reference_docname == name)
	if readable_call_links():
		Link = frappe.qb.DocType("Dynamic Link")
		linked = (
			frappe.qb.from_(Link)
			.select(Link.parent)
			.where(
				(Link.parenttype == "CRM Call Log")
				& (Link.parentfield == "links")
				& (Link.link_doctype == doctype)
				& (Link.link_name == name)
			)
		)
		dynamic = Call.name.isin(linked)
		relation = relation | dynamic if relation is not None else dynamic
	if relation is None:
		return empty
	# Native list SQL includes hierarchy, User Permissions and shares. The
	# membership subquery cannot multiply rows or serialize sibling identities.
	calls = (
		frappe.qb.get_query(
			"CRM Call Log",
			fields=[f for f in CALL_FIELDS if f in allowed and f not in REFERENCE_FIELDS],
			ignore_permissions=False,
			order_by="creation desc, name desc",
		)
		.where(relation)
		.run(as_dict=True)
	)
	links = get_call_links([call.name for call in calls], ["FCRM Note", "CRM Task"])
	notes, tasks = call_linked_activities(calls, links)
	labels = call_user_labels(calls)
	# Complete history is still unpaged. This avoids per-call phone lookup SQL;
	# detail retains canonical actor-scoped contact enrichment.
	calls = [parse_call_log(call, user_labels=labels, resolve_contact=False) for call in calls]
	return {"calls": calls, "notes": notes, "tasks": tasks}


def get_linked_notes(doctype: str, name: str):
	_check_activity_parent(doctype, name)
	return get_permitted_docs("FCRM Note", filters={"reference_doctype": doctype, "reference_docname": name})


def get_linked_tasks(doctype: str, name: str):
	_check_activity_parent(doctype, name)
	return get_permitted_docs("CRM Task", filters={"reference_doctype": doctype, "reference_docname": name})


def parse_attachment_log(html: str, type: str):
	soup = BeautifulSoup(html, "html.parser")
	a_tag = soup.find("a")
	type = "added" if type == "Attachment" else "removed"
	if not a_tag:
		return {
			"type": type,
			"file_name": html.replace("Removed ", ""),
			"file_url": "",
			"is_private": False,
		}

	is_private = False
	if "private/files" in a_tag["href"]:
		is_private = True

	return {
		"type": type,
		"file_name": a_tag.text,
		"file_url": a_tag["href"],
		"is_private": is_private,
	}


def is_translatable(doctype: str) -> bool:
	return doctype in get_translated_doctypes()
