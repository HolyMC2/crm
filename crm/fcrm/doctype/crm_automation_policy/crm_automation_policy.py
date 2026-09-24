"""Published inbound automation policy. Mutations belong to crm.api.automation_policy."""
import frappe
from frappe.model.document import Document


class CRMAutomationPolicy(Document):
    def validate(self):
        from crm.api.automation_policy import validate_policy_doc
        validate_policy_doc(self)

    def on_trash(self):
        if self.status == "Published" or self.published_revision:
            frappe.throw(frappe._("Pause published automation instead of deleting its history."), frappe.PermissionError)

    def before_rename(self, old, new, merge=False):
        frappe.throw(frappe._("Automation policy identities cannot be renamed."), frappe.PermissionError)
