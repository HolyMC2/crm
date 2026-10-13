"""Stage and pipeline names in server-composed text read in the worker's language.

Stage names (CRM Deal Status) and pipeline names (CRM Pipeline.pipeline_name)
are data: the funnel, the dashboard and refusals draw the standard ones through
the catalog, keep what a manager typed, and never change the stored values.
"""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.dashboard import get_pipeline_funnel
from crm.pipeline.labels import pipeline_label, stage_label
from crm.pipeline.services.configuration import LEGACY_PIPELINE_NAME


class TestPipelineLabels(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.lang = frappe.local.lang
		frappe.local.lang = "es"

	def tearDown(self):
		frappe.local.lang = self.lang
		super().tearDown()

	def test_the_pipeline_crm_creates_reads_in_spanish(self):
		self.assertEqual(pipeline_label(LEGACY_PIPELINE_NAME), "Ventas generales")

	def test_a_typed_pipeline_name_reads_as_typed(self):
		# «Repairs» has a catalog entry elsewhere; a manager's pipeline keeps its name.
		self.assertEqual(pipeline_label("Repairs"), "Repairs")
		self.assertEqual(pipeline_label("Mostrador"), "Mostrador")
		self.assertEqual(pipeline_label(None), "")

	def test_a_standard_stage_reads_in_spanish_while_the_doctype_is_translated(self):
		self.assertEqual(stage_label("Qualification"), "Calificación")
		self.assertEqual(stage_label("Qualification", translated=False), "Qualification")
		self.assertEqual(stage_label("Esperando recepción"), "Esperando recepción")

	def test_funnel_labels_are_translated_and_identities_stay_stored(self):
		if not frappe.db.exists("CRM Deal Status", "Qualification"):
			self.skipTest("this site has no standard «Qualification» stage")
		pipeline = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": LEGACY_PIPELINE_NAME,
				"currency": "USD",
				"probability_policy": "Manual",
				"stages": [{"status": "Qualification", "probability": 10}],
			}
		).insert()
		funnel = get_pipeline_funnel(None, None, {"pipeline": pipeline.name})
		row = next(row for row in funnel["stages"] if row["status"] == "Qualification")
		self.assertEqual(row["stage"], "Calificación")
		self.assertEqual(row["pipeline"], pipeline.name)
		self.assertEqual(row["pipeline_name"], "Ventas generales")
		self.assertEqual(
			frappe.db.get_value("CRM Pipeline", pipeline.name, "pipeline_name"), LEGACY_PIPELINE_NAME
		)
