"""Webchat channel; writes belong only to the finite visitor/configuration broker."""
import frappe
from frappe.model.document import Document


class CRMWebchatChannel(Document):
    def validate(self):
        from crm.api.webchat import validate_channel
        validate_channel(self)

    def on_trash(self):
        raise frappe.PermissionError("Webchat history and channel identities cannot be deleted.")

    def before_rename(self, old, new, merge=False):
        raise frappe.PermissionError("Webchat identities cannot be renamed.")

