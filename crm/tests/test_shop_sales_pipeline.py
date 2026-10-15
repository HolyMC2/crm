"""The shop sales pipeline (CRM program S1.2, decision D1)."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.pipeline.services import shop_sales
from crm.pipeline.services.configuration import default_pipeline


class TestShopSalesPipeline(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def test_ensure_is_idempotent_and_builds_the_d1_stages(self):
		first = shop_sales.ensure()
		second = shop_sales.ensure()
		self.assertEqual(first["pipeline"], shop_sales.SHOP_SALES_PIPELINE)
		self.assertFalse(second["created"])
		self.assertEqual(second["stages"], [name for name, *_ in shop_sales.STAGES])
		types = {
			row.name: row.type
			for row in frappe.get_all(
				"CRM Deal Status", filters={"name": ["in", second["stages"]]}, fields=["name", "type"]
			)
		}
		self.assertEqual(types["Ganado"], "Won")
		self.assertEqual(types["Perdido"], "Lost")
		self.assertEqual(types["Nuevo"], "Open")
		self.assertTrue(frappe.db.exists("CRM Lost Reason", shop_sales.QUOTE_DECLINED_REASON))
		pipeline = frappe.get_doc("CRM Pipeline", shop_sales.SHOP_SALES_PIPELINE)
		self.assertEqual(pipeline.probability_policy, "Stage")
		lost = next(row for row in pipeline.stages if row.status == "Perdido")
		self.assertEqual(lost.outcome, "Lost")
		self.assertIn("lost_reason", lost.required_fields)
		self.assertEqual(shop_sales.outcome_stage(pipeline.name, "Won"), "Ganado")
		self.assertEqual(shop_sales.outcome_stage(pipeline.name, "Lost"), "Perdido")
		self.assertIsNone(shop_sales.outcome_stage(pipeline.name, "Open"))
		self.assertTrue(shop_sales.is_sales_pipeline(pipeline.name))
		self.assertFalse(shop_sales.is_sales_pipeline("legacy-sales"))

	def test_default_pipeline_opens_new_deals_on_nuevo_and_lost_needs_its_reason(self):
		result = shop_sales.ensure(make_default=True)
		self.assertTrue(result["is_default"])
		self.assertEqual(default_pipeline(), shop_sales.SHOP_SALES_PIPELINE)
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"deal_owner": "Administrator",
				"expected_deal_value": 1200,
				"expected_closure_date": "2040-02-10",
			}
		).insert()
		self.assertEqual((deal.pipeline, deal.status), (shop_sales.SHOP_SALES_PIPELINE, "Nuevo"))
		self.assertEqual(deal.probability, 10)  # Stage policy.
		deal.status = "Cotizado"
		deal.save()
		self.assertEqual(deal.probability, 50)
		# A repair stage is not a sales stage.
		deal.status = frappe.db.get_value(
			"CRM Deal Status", {"name": ["not in", [s for s, *_ in shop_sales.STAGES]]}
		)
		if deal.status:
			with self.assertRaises(frappe.ValidationError):
				deal.save()
			deal.reload()
		deal.status = "Perdido"
		with self.assertRaises(frappe.ValidationError):
			deal.save()
		deal.reload()
		deal.status = "Perdido"
		deal.lost_reason = shop_sales.QUOTE_DECLINED_REASON
		deal.save()
		self.assertTrue(deal.closed_date)
		self.assertEqual(deal.probability, 0)

	def test_adopting_refuses_a_same_named_stage_with_another_outcome(self):
		# Tests in a class share one transaction: undo this conflict before the next one.
		frappe.db.savepoint("shop_sales_conflict")
		try:
			if frappe.db.exists("CRM Deal Status", "Ganado"):
				frappe.db.set_value("CRM Deal Status", "Ganado", "type", "Open")
			else:
				frappe.get_doc(
					{"doctype": "CRM Deal Status", "deal_status": "Ganado", "type": "Open"}
				).insert()
			with self.assertRaises(frappe.ValidationError):
				shop_sales.ensure()
		finally:
			frappe.db.rollback(save_point="shop_sales_conflict")
