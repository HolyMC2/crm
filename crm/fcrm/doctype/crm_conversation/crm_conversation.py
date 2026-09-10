"""Private customer control model; all mutations go through its finite broker."""
import frappe
from frappe.model.document import Document


def get_permission_query_conditions(user=None):
    return "1=0"


def has_permission(doc, ptype=None, user=None, permission_type=None):
    return False


class CRMConversation(Document):
    def notify_update(self):
        # Private records use explicit, authorized broker hints only.
        return

    def has_permission(self, permtype="read", *, debug=False, user=None):
        from crm.api.conversations import _SERVICE_TOKEN
        return permtype in {"create", "write"} and self.flags.get("crm_conversation_service") is _SERVICE_TOKEN

    def check_permission(self, permtype="read", permlevel=None):
        if not self.has_permission(permtype):
            raise frappe.PermissionError("Use the private customer conversation broker.")

    def autoname(self):
        from crm.api.conversations import conversation_key
        self.name = conversation_key(self.provider, self.account_id, self.peer_id)

    def validate(self):
        from crm.api.conversations import _SERVICE_TOKEN, conversation_key, STATES
        if self.flags.get("crm_conversation_service") is not _SERVICE_TOKEN:
            frappe.throw(frappe._("Use the conversation control service."), frappe.PermissionError)
        if self.name != conversation_key(self.provider, self.account_id, self.peer_id) or self.identity_version != 1:
            frappe.throw(frappe._("Conversation identity is immutable."))
        if self.control_state not in STATES or int(self.generation or 0) < 1:
            frappe.throw(frappe._("Invalid conversation control state."))
        if self.control_state == "Bot" and self.human_owner:
            frappe.throw(frappe._("A bot cannot own a human conversation."))
        if not self.is_new():
            previous = frappe.db.get_value(self.doctype, self.name,
                ["provider", "account_id", "peer_id", "identity_version", "generation"], as_dict=True, for_update=True)
            if any(self.get(f) != previous.get(f) for f in ("provider", "account_id", "peer_id", "identity_version")):
                frappe.throw(frappe._("Conversation identity is immutable."))
            if self.generation != previous.generation + 1:
                frappe.throw(frappe._("Conversation changes must advance generation."))

    def on_trash(self):
        frappe.throw(frappe._("Close conversations to preserve control history."), frappe.PermissionError)

    def before_rename(self, old, new, merge=False):
        frappe.throw(frappe._("Conversation identities cannot be renamed."), frappe.PermissionError)
