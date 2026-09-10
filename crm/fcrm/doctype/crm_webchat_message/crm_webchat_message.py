"""Webchat message; writes belong only to the finite visitor/configuration broker."""
import frappe
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
    return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
    return False


class CRMWebchatMessage(Document):
    def notify_update(self):
        # Private records use explicit, authorized broker hints only.
        return

    def has_permission(self, permtype="read", *, debug=False, user=None):
        from crm.api.webchat import _WRITE_TOKEN
        return permtype == "create" and self.flags.get("crm_webchat_service") is _WRITE_TOKEN

    def check_permission(self, permtype="read", permlevel=None):
        if not self.has_permission(permtype):
            raise frappe.PermissionError("Use the private Webchat broker.")

    def validate(self):
        from crm.api.webchat import validate_message
        validate_message(self)

    def on_trash(self):
        raise frappe.PermissionError("Webchat history and channel identities cannot be deleted.")

    def before_rename(self, old, new, merge=False):
        raise frappe.PermissionError("Webchat identities cannot be renamed.")
