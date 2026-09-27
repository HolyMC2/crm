import frappe
from frappe import _
from frappe.model import get_permitted_fields

from crm.permissions.activity_history import _fields


@frappe.whitelist()
def get_deal_contacts(name: str):
	if not frappe.has_permission("CRM Deal", "read", name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	user = frappe.session.user
	if not frappe.get_list("CRM Deal", filters={"name": name}, pluck="name", limit_page_length=1):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if "contacts" not in _fields("CRM Deal", user):
		return []
	relationship_fields = _fields("CRM Contacts", user, parenttype="CRM Deal")
	if "contact" not in relationship_fields:
		return []

	# Default identity fields are not DocFields on the supported native base.
	# Require native scalar admission too, rather than inventing an identifier
	# from a title or returning an unusable masked key.
	contact_fields = _fields("Contact", user)
	if "name" not in get_permitted_fields("Contact", user=user, permission_type="read") or (
		frappe.get_meta("Contact").get_field("name") and "name" not in contact_fields
	):
		return []

	contacts = frappe.get_all(
		"CRM Contacts",
		filters={"parenttype": "CRM Deal", "parent": name, "parentfield": "contacts"},
		fields=[field for field in ("contact", "is_primary") if field in relationship_fields],
		order_by="idx asc",
	)
	names = sorted({row.contact for row in contacts if row.contact})
	fields = ["name"] + [
		field for field in ("image", "full_name", "email_id", "mobile_no") if field in contact_fields
	]
	readable = {}
	for offset in range(0, len(names), 200):
		batch = names[offset : offset + 200]
		try:
			rows = frappe.get_list(
				"Contact",
				filters={"name": ["in", batch]},
				fields=fields,
				limit_page_length=len(batch),
				order_by="name",
			)
		except frappe.PermissionError:
			continue
		for row in rows:
			# List conditions and record permission hooks are distinct gates.
			if row.get("name") in batch and frappe.has_permission("Contact", "read", doc=row.name):
				readable[row.name] = row
	deal_contacts = []
	seen = set()
	for relationship in contacts:
		contact = readable.get(relationship.contact)
		key = (relationship.contact, relationship.get("is_primary"))
		if not contact or key in seen:
			continue
		seen.add(key)
		deal_contacts.append(
			{
				"name": contact.name,
				"image": contact.get("image"),
				"full_name": contact.get("full_name"),
				"email": contact.get("email_id"),
				"mobile_no": contact.get("mobile_no"),
				"is_primary": relationship.get("is_primary"),
			}
		)
	return deal_contacts
