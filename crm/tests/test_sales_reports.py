"""Native database proof for cohort definitions, scopes and report drill-downs."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, today

from crm.api.sales_reports import get_records, get_report


class TestSalesReports(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.key = frappe.generate_hash(length=8)
		self.actor = f"reports-{self.key}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.actor,
				"first_name": "Reports",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert()
		self.statuses = {}
		for index, kind in enumerate(("Open", "Won", "Lost")):
			self.statuses[kind] = (
				frappe.get_doc(
					{
						"doctype": "CRM Deal Status",
						"deal_status": f"Report {kind} {self.key}",
						"type": kind,
						"position": index + 1,
						"probability": 50,
					}
				)
				.insert()
				.name
			)
		self.pipeline = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": f"Reports {self.key}",
				"currency": "USD",
				"probability_policy": "Manual",
				"stages": [{"status": name, "probability": 50} for name in self.statuses.values()],
			}
		).insert()
		frappe.db.set_single_value("FCRM Settings", "currency", "USD")
		self.filters = {"pipeline": self.pipeline.name, "from_date": today(), "to_date": today()}

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def deal(self, kind="Open", owner=None):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"deal_name": f"Report {self.key}",
				"deal_owner": owner or self.actor,
				"pipeline": self.pipeline.name,
				"status": self.statuses["Open"],
				"currency": "USD",
				"expected_deal_value": 100,
				"probability": 50,
			}
		).insert()
		if kind != "Open":
			doc.db_set("status", self.statuses[kind], update_modified=False)
		return doc

	def lead(self, converted=False):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": f"Report {self.key}",
				"lead_owner": self.actor,
				"pipeline": self.pipeline.name,
			}
		).insert()
		if converted:
			doc.db_set("converted", 1, update_modified=False)
		return doc

	def test_cohorts_and_closed_denominator_are_independent(self):
		self.lead(True)
		self.lead()
		self.deal("Won")
		self.deal("Lost")
		self.deal()
		result = get_report(self.filters)
		self.assertEqual(result["summary"]["conversion_percent"], 50)
		self.assertEqual(result["summary"]["closed_win_percent"], 50)
		self.assertEqual(result["summary"]["deals"], 3)
		self.assertEqual(result["summary"]["weighted_forecast"], 50)
		self.assertEqual(sum(row.count for row in result["stages"]), 3)
		self.assertEqual(result["sources"][0]["source"], "")
		self.assertEqual(result["sources"][0]["converted_leads"], 1)
		self.assertEqual(get_records(self.filters, "deals", {"outcome": "Won"})["total"], 1)

	def test_owner_filter_never_expands_native_record_scope(self):
		own = self.deal()
		hidden = self.deal(owner="Administrator")
		frappe.set_user(self.actor)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", hidden))
		self.assertEqual(get_report(self.filters)["summary"]["deals"], 1)
		self.assertEqual([row.name for row in get_records(self.filters)["items"]], [own.name])
		self.assertEqual(get_report({**self.filters, "owner": "Administrator"})["summary"]["deals"], 0)
		self.assertEqual(get_records(self.filters, bucket={"owner": "Administrator"})["total"], 0)

	def test_site_day_bounds_and_missing_history_remain_explicit(self):
		included = self.deal()
		included.db_set("creation", today() + " 23:59:59", update_modified=False)
		excluded = self.deal()
		excluded.db_set("creation", str(add_days(today(), 1)) + " 00:00:00", update_modified=False)
		frappe.db.delete("CRM Status Change Log", {"parent": included.name, "parenttype": "CRM Deal"})
		result = get_report(self.filters)
		self.assertEqual(result["summary"]["deals"], 1)
		self.assertEqual(result["stages"][0].approximate_count, 1)
		self.assertEqual(result["stages"][0].average_age_days, 0)

	def test_task_workload_requires_visible_parent_and_reconciles(self):
		visible, hidden = self.deal(), self.deal(owner="Administrator")
		for doc in (visible, hidden):
			frappe.get_doc(
				{
					"doctype": "CRM Task",
					"title": f"Due {self.key}",
					"status": "Todo",
					"assigned_to": self.actor,
					"reference_doctype": "CRM Deal",
					"reference_docname": doc.name,
					"due_date": str(add_days(today(), -1)) + " 10:00:00",
				}
			).insert()
		frappe.set_user(self.actor)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", hidden))
		result = get_report(self.filters)
		row = next(row for row in result["owners"] if row["owner"] == self.actor)
		self.assertEqual(row["overdue_tasks"], 1)
		detail = get_records(self.filters, "tasks", {"owner": self.actor, "task_state": "overdue"})
		self.assertEqual(detail["total"], 1)
		self.assertEqual(detail["items"][0].reference_docname, visible.name)

	def test_page_count_covers_all_matching_records(self):
		for _ in range(51):
			self.deal()
		first = get_records(self.filters)
		last = get_records(self.filters, offset=first["next_offset"])
		self.assertEqual(first["total"], 51)
		self.assertTrue(first["has_more"])
		self.assertEqual(len(first["items"]), 50)
		self.assertEqual(len(last["items"]), 1)
		self.assertFalse(last["has_more"])
		self.assertEqual(get_report(self.filters)["summary"]["deals"], 51)

	def test_malformed_filters_and_inapplicable_buckets_fail(self):
		for filters in (
			{"ignore_permissions": 1},
			{"owner": ["like", "%"]},
			{"from_date": "2040-02-02", "to_date": "2040-02-01"},
		):
			with self.assertRaises(frappe.ValidationError):
				get_report(filters)
		with self.assertRaises(frappe.ValidationError):
			get_records(self.filters, "tasks", {"source": "x"})
