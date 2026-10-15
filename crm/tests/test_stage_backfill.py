"""Stage backfill onto the shop sales pipeline (CRM program S1.3, decision D2)."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.pipeline.services import shop_sales, stage_backfill
from crm.pipeline.services.configuration import LEGACY_PIPELINE

REPAIR_STAGES = {
	"Approved": "Open",
	"Picked Up": "Won",
	"Declined": "Lost",
	"Warranty Repair": "Open",
	"New Lead": "Open",
}


class TestStageBackfill(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		if not frappe.db.exists("CRM Pipeline", LEGACY_PIPELINE):
			self.skipTest("the compatibility pipeline is not on this site")
		for name, kind in REPAIR_STAGES.items():
			if not frappe.db.exists("CRM Deal Status", name):
				frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": name, "type": kind}).insert()
		shop_sales.ensure()

	def legacy_deal(self, status, **values):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"pipeline": LEGACY_PIPELINE,
				"status": "New Lead",
				"deal_owner": "Administrator",
				"expected_deal_value": 100,
				"expected_closure_date": "2040-02-10",
			}
		).insert()
		doc.reload()
		doc.db_set({"status": status, "modified": "2040-02-11 10:00:00", **values}, update_modified=False)
		return doc.name

	def test_preview_writes_nothing_and_apply_moves_with_history(self):
		names = {
			"approved": self.legacy_deal("Approved"),
			"won": self.legacy_deal("Picked Up", closed_date=None, deal_value=800),
			"declined": self.legacy_deal("Declined", lost_reason=None),
			"warranty": self.legacy_deal("Warranty Repair"),
		}
		report = stage_backfill.preview(names=list(names.values()))
		self.assertEqual(report["deals"], 4)
		self.assertEqual(report["to_stage"]["Negociación"], 1)
		self.assertEqual(report["to_stage"]["Ganado"], 1)
		self.assertEqual(report["to_stage"]["Perdido"], 1)
		self.assertEqual(report["to_stage"]["Contactado"], 1)
		self.assertEqual(frappe.db.get_value("CRM Deal", names["approved"], "pipeline"), LEGACY_PIPELINE)

		result = stage_backfill.apply(names=list(names.values()), commit=False)
		self.assertEqual(result["moved"], 4)
		rows = {
			key: frappe.db.get_value(
				"CRM Deal",
				name,
				["pipeline", "status", "lost_reason", "closed_date", "probability", "modified"],
				as_dict=True,
			)
			for key, name in names.items()
		}
		self.assertTrue(all(row.pipeline == shop_sales.SHOP_SALES_PIPELINE for row in rows.values()))
		self.assertEqual(rows["approved"].status, "Negociación")
		self.assertEqual(rows["approved"].probability, 75)
		self.assertEqual(rows["won"].status, "Ganado")
		self.assertEqual(str(rows["won"].closed_date), "2040-02-11")
		self.assertEqual(rows["declined"].status, "Perdido")
		self.assertEqual(rows["declined"].lost_reason, shop_sales.QUOTE_DECLINED_REASON)
		self.assertEqual(rows["warranty"].status, "Contactado")
		# Lists keep their order: nobody's "last updated" moved.
		self.assertEqual(str(rows["approved"].modified), "2040-02-11 10:00:00")
		# The stage history shows where the deal came from.
		log = frappe.get_all(
			"CRM Status Change Log",
			filters={"parent": names["approved"], "parenttype": "CRM Deal"},
			fields=["from", "to"],
			order_by="idx asc",
		)
		self.assertIn({"from": "Approved", "to": "Negociación"}, [dict(row) for row in log])
		self.assertEqual(log[-1]["from"], "Negociación")
		self.assertFalse(log[-1]["to"])
		# The moved deal is a valid sales-pipeline record: a normal save passes.
		doc = frappe.get_doc("CRM Deal", names["approved"])
		doc.status = "Cotizado"
		doc.save()
		# Idempotent: nothing left to move.
		self.assertEqual(stage_backfill.apply(names=list(names.values()), commit=False)["moved"], 0)

	def test_unknown_stage_falls_back_on_its_outcome_type(self):
		frappe.get_doc(
			{"doctype": "CRM Deal Status", "deal_status": "Odd Lost Stage", "type": "Lost"}
		).insert()
		name = self.legacy_deal("Odd Lost Stage", lost_reason="Other", lost_notes="x")
		move = stage_backfill.plan(names=[name])[0]
		self.assertEqual(move.to_status, "Perdido")
		self.assertEqual(move.note, "mapped by its outcome type")
		self.assertFalse(move.blocked)
