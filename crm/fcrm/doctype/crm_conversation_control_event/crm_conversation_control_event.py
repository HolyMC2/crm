"""Immutable private command ledger; never a source of client authority."""
import frappe
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
    return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
    return False


class CRMConversationControlEvent(Document):
    def autoname(self):
        self.name = self.command_key

    def validate(self):
        from crm.api.conversations import _SERVICE_TOKEN
        if not self.is_new() or self.flags.get("crm_conversation_service") is not _SERVICE_TOKEN:
            frappe.throw(frappe._("Conversation control events are immutable."), frappe.PermissionError)
        if self.name != self.command_key:
            frappe.throw(frappe._("Invalid conversation command identity."))

    def on_trash(self):
        frappe.throw(frappe._("Conversation control events are immutable."), frappe.PermissionError)

    def before_rename(self, old, new, merge=False):
        frappe.throw(frappe._("Conversation control events are immutable."), frappe.PermissionError)
