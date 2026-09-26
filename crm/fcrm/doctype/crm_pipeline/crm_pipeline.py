import frappe
from frappe import _
from frappe.model.document import Document

from crm.pipeline.services.configuration import validate_configuration


class CRMPipeline(Document):
	def validate(self):
		validate_configuration(self)

	def on_trash(self):
		frappe.throw(_("Archive pipelines to preserve their configuration and record history."))

	def before_rename(self, old, new, merge=False):
		frappe.throw(_("Pipeline IDs are stable. Edit the pipeline name instead."))
