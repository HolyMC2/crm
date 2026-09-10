import frappe
from frappe import _
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
	# Legacy queries check only the parent's role before querying this child.
	# Deny that path. Current Frappe joins the parent and applies its owner/assignee
	# query condition instead; authorized parent rows may safely be returned.
	return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
	"""Children are read with the parent and mutated only by parent validation."""
	ptype = ptype or permission_type or "read"
	if ptype not in ("read", "select") or doc.parenttype != "CRM Inquiry" or not doc.parent:
		return False
	return frappe.has_permission("CRM Inquiry", "read", doc=doc.parent, user=user)


class CRMInquiryPerson(Document):
	def validate(self):
		# Parent.save() persists children without running child lifecycle methods.
		frappe.throw(_("Edit people through their inquiry."), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("Edit people through their inquiry."), frappe.PermissionError)
