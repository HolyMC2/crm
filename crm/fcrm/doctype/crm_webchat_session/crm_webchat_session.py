"""Webchat session; writes belong only to the finite visitor/configuration broker."""
import frappe
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
    return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
    return False


class CRMWebchatSession(Document):
    def validate(self):
        from crm.api.webchat import validate_session
        validate_session(self)

    def on_trash(self):
        raise frappe.PermissionError("Webchat history and channel identities cannot be deleted.")

    def before_rename(self, old, new, merge=False):
        raise frappe.PermissionError("Webchat identities cannot be renamed.")

