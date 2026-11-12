"""A site built after the provenance patch still gets its WhatsApp Message fields."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.whatsapp import after_app_install
from crm.patches.v1_0.create_message_provenance_fields import ensure_fields

FIELDS = ("doco_sent_by_type", "doco_actor_user", "doco_automation_source", "doco_bot", "doco_bot_step")


class TestMessageProvenanceInstall(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		if "frappe_whatsapp" not in frappe.get_installed_apps():
			self.skipTest("needs frappe_whatsapp")

	def present(self):
		frappe.clear_cache(doctype="WhatsApp Message")
		meta = frappe.get_meta("WhatsApp Message")
		return {f for f in FIELDS if meta.has_field(f) and frappe.db.has_column("WhatsApp Message", f)}

	def test_the_fields_exist_after_the_connector_is_installed(self):
		after_app_install("frappe_whatsapp")
		self.assertEqual(self.present(), set(FIELDS))
		# The report that read the missing column runs.
		frappe.db.sql("SELECT o.doco_actor_user FROM `tabWhatsApp Message` o LIMIT 1")

	def test_creating_them_again_changes_nothing(self):
		self.assertTrue(ensure_fields())
		self.assertTrue(ensure_fields())
		self.assertEqual(self.present(), set(FIELDS))
		self.assertEqual(
			frappe.db.count("Custom Field", {"dt": "WhatsApp Message", "fieldname": ["in", list(FIELDS)]}),
			len(FIELDS),
		)
