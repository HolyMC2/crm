"""Private durable send intent. Mutations belong to the native outbox broker."""
import frappe
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
    return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
    return False


class CRMOutboundIntent(Document):
    def notify_update(self):
        # Private records use explicit, authorized broker hints only.
        return

    def has_permission(self, permtype="read", *, debug=False, user=None):
        from crm.api.outbox import _SERVICE_TOKEN
        return permtype in {"create", "write"} and self.flags.get("crm_outbox_service") is _SERVICE_TOKEN

    def check_permission(self, permtype="read", permlevel=None):
        if not self.has_permission(permtype):
            raise frappe.PermissionError("Use the private customer conversation broker.")

    def autoname(self):
        self.name = self.action_key

    def validate(self):
        from crm.api.outbox import _SERVICE_TOKEN, validate_intent
        if self.flags.get("crm_outbox_service") is not _SERVICE_TOKEN:
            frappe.throw(frappe._("Use the native outbox service."), frappe.PermissionError)
        validate_intent(self)

    def on_trash(self):
        frappe.throw(frappe._("Outbound intent history cannot be deleted."), frappe.PermissionError)

    def before_rename(self, old, new, merge=False):
        frappe.throw(frappe._("Outbound intent identities cannot be renamed."), frappe.PermissionError)
