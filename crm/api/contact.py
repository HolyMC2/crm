import frappe
from frappe import _
from frappe.model import get_permitted_fields

from crm.permissions.activity_history import _fields


def validate(doc, method):
	update_deals_email_mobile_no(doc)


def update_deals_email_mobile_no(doc):
	linked_deals = frappe.get_all(
		"CRM Contacts",
		filters={"contact": doc.name, "is_primary": 1},
		fields=["parent"],
	)

	for linked_deal in linked_deals:
		deal = frappe.db.get_values("CRM Deal", linked_deal.parent, ["email", "mobile_no"], as_dict=True)[0]
		if deal.email != doc.email_id or deal.mobile_no != doc.mobile_no:
			frappe.db.set_value(
				"CRM Deal",
				linked_deal.parent,
				{
					"email": doc.email_id,
					"mobile_no": doc.mobile_no,
				},
			)


@frappe.whitelist()
def get_linked_deals(contact: str):
	"""Return the permitted Contact-to-Deal relationships and finite list DTO."""

	if not frappe.has_permission("Contact", "read", contact):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	user = frappe.session.user
	if not frappe.get_list("Contact", filters={"name": contact}, pluck="name", limit_page_length=1):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if "name" not in get_permitted_fields("Contact", user=user, permission_type="read") or (
		frappe.get_meta("Contact").get_field("name") and "name" not in _fields("Contact", user)
	):
		return []
	deal_fields = _fields("CRM Deal", user)
	if "contacts" not in deal_fields or "contact" not in _fields("CRM Contacts", user, parenttype="CRM Deal"):
		return []
	scalar_fields = set(get_permitted_fields("CRM Deal", user=user, permission_type="read"))
	meta = frappe.get_meta("CRM Deal")
	if "name" not in scalar_fields or (meta.get_field("name") and "name" not in deal_fields):
		return []

	deal_names = frappe.get_all(
		"CRM Contacts",
		filters={"contact": contact, "parenttype": "CRM Deal", "parentfield": "contacts"},
		fields=["parent"],
		distinct=True,
	)
	names = sorted({row.parent for row in deal_names if row.parent})
	columns = (
		"name",
		"organization",
		"currency",
		"deal_value",
		"status",
		"email",
		"mobile_no",
		"deal_owner",
		"modified",
	)
	fields = [
		field
		for field in columns
		if field in deal_fields
		or (field in {"name", "modified"} and field in scalar_fields and not meta.get_field(field))
	]
	deals = []
	for offset in range(0, len(names), 200):
		batch = names[offset : offset + 200]
		try:
			rows = frappe.get_list(
				"CRM Deal",
				filters={"name": ["in", batch]},
				fields=fields,
				limit_page_length=len(batch),
				order_by="name",
			)
		except frappe.PermissionError:
			continue
		for row in rows:
			if row.get("name") in batch and frappe.has_permission("CRM Deal", "read", doc=row.name):
				deals.append({field: row.get(field) for field in columns})
	return deals


@frappe.whitelist()
def create_new(contact: str, field: str, value: str):
	"""Create new email or phone for a contact"""
	if not frappe.has_permission("Contact", "write", contact):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	contact = frappe.get_cached_doc("Contact", contact)

	if field == "email":
		email = {"email_id": value, "is_primary": 1 if len(contact.email_ids) == 0 else 0}
		contact.append("email_ids", email)
	elif field in ("mobile_no", "phone"):
		mobile_no = {"phone": value, "is_primary_mobile_no": 1 if len(contact.phone_nos) == 0 else 0}
		contact.append("phone_nos", mobile_no)
	else:
		frappe.throw(_("Invalid field"))

	contact.save()
	return True


@frappe.whitelist()
def set_as_primary(contact: str, field: str, value: str):
	"""Set email or phone as primary for a contact"""
	if not frappe.has_permission("Contact", "write", contact):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	contact = frappe.get_doc("Contact", contact)

	if field == "email":
		for email in contact.email_ids:
			if email.email_id == value:
				email.is_primary = 1
			else:
				email.is_primary = 0
	elif field in ("mobile_no", "phone"):
		name = "is_primary_mobile_no" if field == "mobile_no" else "is_primary_phone"
		for phone in contact.phone_nos:
			if phone.phone == value:
				phone.set(name, 1)
			else:
				phone.set(name, 0)
	else:
		frappe.throw(_("Invalid field"))

	contact.save()
	return True


@frappe.whitelist()
def search_emails(txt: str):
	doctype = "Contact"
	meta = frappe.get_meta(doctype)
	filters = [["Contact", "email_id", "is", "set"]]

	if meta.get("fields", {"fieldname": "enabled", "fieldtype": "Check"}):
		filters.append([doctype, "enabled", "=", 1])
	if meta.get("fields", {"fieldname": "disabled", "fieldtype": "Check"}):
		filters.append([doctype, "disabled", "!=", 1])

	or_filters = []
	search_fields = ["full_name", "email_id", "name"]
	if txt:
		for f in search_fields:
			or_filters.append([doctype, f.strip(), "like", f"%{txt}%"])

	results = frappe.get_list(
		doctype,
		filters=filters,
		fields=search_fields,
		or_filters=or_filters,
		limit_start=0,
		limit_page_length=20,
		order_by="email_id, full_name, name",
		ignore_permissions=False,
		as_list=True,
		strict=False,
	)

	return results
