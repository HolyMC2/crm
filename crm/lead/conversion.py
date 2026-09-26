"""One authorized conversion per lead; CRM records remain the source of truth."""

from copy import deepcopy
from uuid import UUID

import frappe
from frappe import _
from frappe.utils import cint, get_datetime

from crm.pipeline.constants import NEXT_ACTIVITY_FIELDS, OPEN_TASK_STATUSES
from crm.pipeline.services.next_activity import refresh

# Neither source projections nor client-supplied identity/system fields may become
# editable deal input. Child rows receive new row identities, not copied DB names.
SYSTEM_FIELDS = {
	"name",
	"doctype",
	"naming_series",
	"creation",
	"owner",
	"modified",
	"modified_by",
	"idx",
	"docstatus",
	"parent",
	"parenttype",
	"parentfield",
	"lead",
	"converted",
	"contact",
	"contacts",
	"organization",
	"email",
	"mobile_no",
	"phone",
	"sla",
	"sla_status",
	"response_by",
	"first_response_time",
	"first_responded_on",
	"communication_status",
	"sla_creation",
	"status_change_log",
	*NEXT_ACTIVITY_FIELDS,
}
LAYOUT_FIELDS = {"Tab Break", "Section Break", "Column Break", "HTML", "Button", "Attach"}


def _lead(name, lock=False):
	if not isinstance(name, str) or not name or len(name) > 140:
		frappe.throw(_("Choose a valid lead."))
	doc = frappe.get_doc("CRM Lead", name, for_update=lock)
	doc.check_permission("read")
	doc.check_permission("write")
	return doc


def _existing(lead, lock=False):
	# The locked source row serializes every caller of the existing conversion API.
	# Preserve historical multi-deal data; never arbitrarily pick one of those deals.
	rows = frappe.db.sql(
		"SELECT name FROM `tabCRM Deal` WHERE lead=%s ORDER BY name LIMIT 2"
		+ (" FOR UPDATE" if lock else ""),
		(lead.name,),
		pluck=True,
	)
	if len(rows) > 1:
		frappe.throw(
			_("This lead has more than one linked deal. Review its existing deals before continuing.")
		)
	if rows:
		deal = frappe.get_doc("CRM Deal", rows[0])
		if not deal.has_permission("read"):
			frappe.throw(_("The converted deal is not accessible to your account."), frappe.PermissionError)
		return deal.name
	if lead.converted:
		frappe.throw(
			_("This lead was already converted, but its deal is unavailable. Ask a manager to review it.")
		)


def _candidates(lead):
	contacts = []
	if lead.email:
		names = frappe.get_all("Contact Email", filters={"email_id": lead.email}, pluck="parent", limit=101)
		if names:
			contacts = frappe.get_list(
				"Contact", filters={"name": ["in", names]}, fields=["name", "full_name"], limit_page_length=20
			)
	organizations = []
	if lead.organization:
		organizations = frappe.get_list(
			"CRM Organization",
			filters={"organization_name": lead.organization},
			fields=["name", "organization_name"],
			limit_page_length=20,
		)
	return {"contacts": contacts, "organizations": organizations}


@frappe.whitelist()
def get_conversion_context(lead):
	doc = _lead(lead)
	existing = _existing(doc)
	candidates = _candidates(doc) if not existing else {"contacts": [], "organizations": []}
	doc.apply_fieldlevel_read_permissions()
	return {
		"lead": doc.as_dict(),
		"modified": str(doc.modified),
		"existing_deal": existing,
		**candidates,
	}


def _link(doctype, name):
	if not isinstance(name, str) or len(name) > 140:
		frappe.throw(_("Choose a valid linked identity."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return doc.name


def _contact(lead, selected, create_new):
	if selected:
		return _link("Contact", selected)
	if not create_new and lead.email and frappe.db.exists("Contact Email", {"email_id": lead.email}):
		frappe.throw(
			_(
				"Review the contact identity. Select an authorized contact or explicitly create a different person."
			)
		)
	contact = frappe.new_doc("Contact")
	contact.update(
		{
			"first_name": lead.first_name or lead.lead_name,
			"last_name": lead.last_name,
			"salutation": lead.salutation,
			"gender": lead.gender,
			"designation": lead.job_title,
			"company_name": lead.organization,
			"image": lead.image or "",
		}
	)
	if lead.email:
		contact.append("email_ids", {"email_id": lead.email, "is_primary": 1})
	if lead.phone:
		contact.append("phone_nos", {"phone": lead.phone, "is_primary_phone": 1})
	if lead.mobile_no:
		contact.append("phone_nos", {"phone": lead.mobile_no, "is_primary_mobile_no": 1})
	contact.insert()
	return contact.name


def _organization(lead, selected):
	if selected:
		return _link("CRM Organization", selected)
	if not lead.organization:
		return None
	if frappe.db.exists("CRM Organization", {"organization_name": lead.organization}):
		frappe.throw(
			_(
				"Review the organization identity. Select an authorized organization or change the lead organization before creating another."
			)
		)
	organization = frappe.new_doc("CRM Organization")
	organization.update(
		{key: lead.get(key) for key in ("website", "territory", "industry", "annual_revenue")}
	)
	organization.organization_name = lead.organization
	organization.insert()
	return organization.name


def _value(field, value):
	if field.fieldtype in {"Table", "Table MultiSelect"}:
		if value is not None and not isinstance(value, list):
			frappe.throw(_("Choose valid product or child rows."))
		if any(not isinstance(row, dict) and not hasattr(row, "as_dict") for row in (value or [])):
			frappe.throw(_("Choose valid product or child rows."))
		return [
			{
				key: deepcopy(val)
				for key, val in (row.as_dict() if hasattr(row, "as_dict") else row).items()
				if key not in SYSTEM_FIELDS and not key.startswith("_")
			}
			for row in (value or [])
		]
	return deepcopy(value)


def _deal(lead, values):
	from crm.fcrm.doctype.crm_lead.crm_lead import get_deal_fieldname

	doc = frappe.new_doc("CRM Deal")
	for field in lead.meta.fields:
		if field.fieldname in SYSTEM_FIELDS | {"status"} or field.no_copy or field.fieldtype in LAYOUT_FIELDS:
			continue
		name = get_deal_fieldname(field, doc.meta)
		if name:
			doc.set(name, _value(field, lead.get(field.fieldname)))
	if isinstance(values, str):
		values = frappe.parse_json(values)
	if values is not None and not isinstance(values, dict):
		frappe.throw(_("Choose valid deal fields."))
	for name, value in (values or {}).items():
		if not isinstance(name, str):
			frappe.throw(_("Choose valid deal fields."))
		field = doc.meta.get_field(name)
		if name.startswith("_") or name == "doctype":
			continue  # native quick-entry bookkeeping
		if not field or name in SYSTEM_FIELDS or field.read_only or field.fieldtype in LAYOUT_FIELDS:
			frappe.throw(_("Field {0} cannot be supplied during conversion.").format(name))
		doc.set(name, _value(field, value))
	doc.lead = lead.name
	if lead.first_responded_on:
		for name in (
			"sla_creation",
			"response_by",
			"sla_status",
			"communication_status",
			"first_response_time",
			"first_responded_on",
		):
			doc.set(name, lead.get(name))
	# Validate create/user scopes using the real actor; no ignored permissions.
	doc.check_permission("create")
	return doc


def convert(
	lead,
	deal=None,
	existing_contact=None,
	existing_organization=None,
	create_new_contact=False,
	expected_modified=None,
	request_id=None,
):
	if request_id:
		try:
			UUID(request_id)
		except (ValueError, TypeError, AttributeError):
			frappe.throw(_("Invalid conversion request identity."))
	source = _lead(lead, lock=True)
	if existing := _existing(source, lock=True):
		return existing  # a lost response reconciles even after source.modified changed
	if expected_modified and get_datetime(expected_modified) != get_datetime(source.modified):
		frappe.throw(
			_("The lead changed. Review the current details before converting."),
			frappe.TimestampMismatchError,
		)
	target = _deal(source, deal)
	# Check every outstanding task before changing identities. Finished work remains
	# on the original lead and the native activity timeline follows that source link.
	tasks = [
		frappe.get_doc("CRM Task", name, for_update=True)
		for name in frappe.db.sql(
			"SELECT name FROM `tabCRM Task` WHERE reference_doctype=%s AND reference_docname=%s "
			"AND status IN %s ORDER BY name FOR UPDATE",
			("CRM Lead", source.name, OPEN_TASK_STATUSES),
			pluck=True,
		)
	]
	for task in tasks:
		task.check_permission("read")
		task.check_permission("write")
	# Native request transaction commits all records together; this helper never commits.
	organization = _organization(source, existing_organization)
	contact = _contact(source, existing_contact, cint(create_new_contact))
	target.organization = organization
	target.contact = contact
	target.contacts = []
	target.append("contacts", {"contact": contact, "is_primary": 1})
	target.insert()
	for user in source.get_assigned_users():
		if user and user != target.deal_owner:
			target.assign_agent(user)
	for task in tasks:
		task.reference_doctype = "CRM Deal"
		task.reference_docname = target.name
		task.save()
	if frappe.db.exists("CRM Lead Status", "Qualified"):
		source.status = "Qualified"
	source.converted = 1
	if source.sla and frappe.db.exists("CRM Communication Status", "Replied"):
		source.communication_status = "Replied"
	source.save()
	refresh("CRM Lead", source.name)
	refresh("CRM Deal", target.name)
	return target.name


def normalize_task_reference(doc):
	"""A stale lead tab must not strand newly opened work after conversion.

	New tasks acquire the same lead fence before insertion. Existing Task._save
	already holds a task lock: never acquire a new lead fence in that order.
	Native modified checks reject stale task documents. Completed historical
	tasks stay on the lead; reopening one moves that same task, preserving its ID.
	"""
	if (
		doc.reference_doctype != "CRM Lead"
		or not doc.reference_docname
		or doc.status not in OPEN_TASK_STATUSES
	):
		return
	lead = frappe.get_doc("CRM Lead", doc.reference_docname, for_update=doc.is_new())
	lead.check_permission("read")
	if lead.converted:
		doc.reference_doctype = "CRM Deal"
		doc.reference_docname = _existing(lead, lock=doc.is_new())
