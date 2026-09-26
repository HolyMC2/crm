"""Native regression fixtures for commercial metrics, scopes and period boundaries."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.dashboard import get_chart, get_forecasted_revenue, get_pipeline_funnel
from crm.api.doc import aggregate_deal_metrics


class TestSalesMetrics(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", "currency", "USD")
		self.key = frappe.generate_hash(length=8)
		self.user = f"metrics-{self.key}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.user,
				"first_name": "Metrics",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert()
		self.statuses = {}
		for index, kind in enumerate(("Open", "Ongoing", "On Hold", "Won", "Lost")):
			self.statuses[kind] = (
				frappe.get_doc(
					{
						"doctype": "CRM Deal Status",
						"deal_status": f"Metrics {kind} {self.key}",
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
				"pipeline_name": f"Metrics {self.key}",
				"currency": "USD",
				"probability_policy": "Manual",
				"stages": [{"status": name, "probability": 50} for name in self.statuses.values()],
			}
		).insert()

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def deal(self, kind="Ongoing", expected=100, value=0, probability=50, **overrides):
		# Insert through native validation, then persist legacy/outcome fixtures without
		# fetching FX from the network or invoking unrelated ERP/repair integrations.
		# Ownership must be set at insert: the native lifecycle shares and assigns the
		# deal. Changing it with db_set would leave the original owner's access intact.
		deal_owner = overrides.pop("deal_owner", self.user)
		doc = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"pipeline": self.pipeline.name,
				"status": self.statuses["Open"],
				"deal_owner": deal_owner,
				"currency": "USD",
				"expected_deal_value": 100,
				"expected_closure_date": "2040-02-10",
				"probability": 50,
			}
		).insert()
		doc.db_set(
			{
				"status": self.statuses[kind],
				"expected_deal_value": expected,
				"deal_value": value,
				"probability": probability,
				"exchange_rate": 1,
				"creation": "2040-02-10 12:00:00",
				**overrides,
			},
			update_modified=False,
		)
		return doc

	def metrics(self, **filters):
		result = aggregate_deal_metrics({"pipeline": self.pipeline.name, **filters})
		self.assertEqual(result["currency"], "USD")
		return {row.status: row for row in result["stages"]}

	def test_heterogeneous_values_and_per_deal_probability_reconcile(self):
		self.deal(expected=100, value=10, probability=80)
		self.deal(expected=0, value=900, probability=20)
		row = self.metrics()[self.statuses["Ongoing"]]
		self.assertEqual(row.count, 2)
		self.assertEqual(row.commercial_value, 1000)  # Previous MAX(SUMs) returned 910.
		self.assertEqual(row.open_expected_value, 1000)
		self.assertEqual(row.weighted_forecast, 260)  # Stage-level 50% returned 500.

	def test_lost_won_and_explicit_zero_do_not_inflate_open_forecast(self):
		self.deal("Lost", expected=9000, probability=99)
		self.deal("Won", expected=100, value=800, probability=99, closed_date="2040-02-15")
		self.deal("Open", expected=1000, probability=0)
		self.deal("On Hold", expected=200, probability=25)
		metrics = self.metrics()
		self.assertEqual(metrics[self.statuses["Lost"]].weighted_forecast, 0)
		self.assertEqual(metrics[self.statuses["Won"]].weighted_forecast, 0)
		self.assertEqual(metrics[self.statuses["Won"]].won_value, 800)
		self.assertEqual(metrics[self.statuses["Open"]].weighted_forecast, 0)
		self.assertEqual(metrics[self.statuses["On Hold"]].weighted_forecast, 50)
		chart = get_forecasted_revenue("2040-02-01", "2040-02-29", self.user)
		self.assertEqual(chart["data"], [{"month": "2040-02-01", "forecasted": 50, "actual": 800}])

	def test_forecast_honours_both_period_bounds_and_won_closed_date(self):
		self.deal(expected=100, probability=50, expected_closure_date="2040-02-29")
		self.deal(expected=10000, expected_closure_date="2040-01-31")
		self.deal(expected=10000, expected_closure_date="2040-03-01")
		self.deal("Won", value=700, closed_date="2040-02-29", expected_closure_date="2040-03-10")
		self.deal("Won", value=9000, closed_date="2040-03-01", expected_closure_date="2040-02-10")
		chart = get_forecasted_revenue("2040-02-01", "2040-02-29", self.user)
		self.assertEqual(chart["data"], [{"month": "2040-02-01", "forecasted": 50, "actual": 700}])

	def test_foreign_currency_is_converted_and_missing_rate_is_explicit(self):
		self.deal(expected=200, currency="MXN", exchange_rate=0.05)
		self.deal(expected=10000, currency="MXN", exchange_rate=0)
		row = self.metrics()[self.statuses["Ongoing"]]
		self.assertEqual(row.commercial_value, 10)
		self.assertEqual(row.weighted_forecast, 5)
		self.assertEqual(row.missing_exchange_rate_count, 1)
		chart = get_forecasted_revenue("2040-02-01", "2040-02-29", self.user)
		self.assertEqual(chart["missing_exchange_rate_count"], 1)
		self.assertEqual(chart["data"][0]["forecasted"], 5)

	def test_funnel_end_date_includes_entire_day_and_preserves_history(self):
		self.deal("Open", creation="2040-02-29 23:59:59")
		self.deal("On Hold", creation="2040-03-01 00:00:00")
		historical = self.deal("Ongoing")
		self.pipeline.stages[1].archived = 1
		self.pipeline.save()
		stale = self.deal("Open")
		stale.db_set("status", f"Missing {self.key}", update_modified=False)
		result = get_pipeline_funnel("2040-02-01", "2040-02-29", {"pipeline": self.pipeline.name})
		counts = {row["stage"]: row["count"] for row in result["stages"]}
		self.assertEqual(result["total"], 3)
		self.assertEqual(counts[self.statuses["Open"]], 1)
		self.assertEqual(counts[self.statuses["On Hold"]], 0)
		self.assertEqual(result["historical_stages"][0]["stage"], historical.status)
		self.assertEqual(result["unclassified_stages"][0]["count"], 1)
		self.assertEqual(self.metrics()[historical.status].weighted_forecast, 0)

	def test_totals_cover_rows_beyond_list_pagination(self):
		for _ in range(51):
			self.deal(expected=100, probability=50)
		page = frappe.get_list("CRM Deal", filters={"pipeline": self.pipeline.name}, page_length=50)
		self.assertEqual(len(page), 50)
		row = self.metrics()[self.statuses["Ongoing"]]
		self.assertEqual(row.count, 51)
		self.assertEqual(row.commercial_value, 5100)
		self.assertEqual(row.weighted_forecast, 2550)

	def test_restricted_actor_cannot_expand_metrics_with_another_owner_filter(self):
		self.deal(expected=100)
		unrelated = self.deal(expected=9000, deal_owner="Administrator")
		self.assertFalse(
			frappe.db.exists(
				"DocShare", {"share_doctype": "CRM Deal", "share_name": unrelated.name, "user": self.user}
			)
		)
		self.assertFalse(
			frappe.db.exists(
				"ToDo",
				{"reference_type": "CRM Deal", "reference_name": unrelated.name, "allocated_to": self.user},
			)
		)
		frappe.set_user(self.user)
		self.assertEqual(self.metrics()[self.statuses["Ongoing"]].commercial_value, 100)
		self.assertEqual(self.metrics(deal_owner="Administrator"), {})
		self.assertEqual(get_forecasted_revenue("2040-02-01", "2040-02-29", "Administrator")["data"], [])
		self.assertEqual(
			get_pipeline_funnel("2040-02-01", "2040-02-29", {"pipeline": self.pipeline.name})["total"], 1
		)

	def test_assigned_deal_is_included_in_both_list_metrics_and_dashboard_chart(self):
		self.deal(expected=100)
		assigned = self.deal(expected=800, deal_owner="Administrator")
		self.deal(expected=9000, deal_owner="Administrator")
		frappe.get_doc(
			{
				"doctype": "ToDo",
				"reference_type": "CRM Deal",
				"reference_name": assigned.name,
				"allocated_to": self.user,
				"description": "Metrics assignment",
				"status": "Open",
			}
		).insert()
		frappe.set_user(self.user)
		row = self.metrics()[self.statuses["Ongoing"]]
		self.assertEqual(row.count, 2)
		self.assertEqual(row.weighted_forecast, 450)
		chart = get_chart("forecasted_revenue", "axis", "2040-02-01", "2040-02-29")
		self.assertEqual(chart["data"][0]["forecasted"], 450)

	def test_owner_share_cannot_bypass_pipeline_restriction_in_metrics(self):
		deal = self.deal(expected=9000)
		self.assertTrue(
			frappe.db.exists(
				"DocShare", {"share_doctype": "CRM Deal", "share_name": deal.name, "user": self.user}
			)
		)
		self.pipeline.append("roles", {"role": "System Manager"})
		self.pipeline.save()
		frappe.set_user(self.user)
		self.assertEqual(self.metrics(), {})
		self.assertEqual(get_chart("forecasted_revenue", "axis", "2040-02-01", "2040-02-29")["data"], [])
		funnel = get_pipeline_funnel("2040-02-01", "2040-02-29", {"pipeline": self.pipeline.name})
		self.assertEqual(funnel["total"], 0)
		self.assertEqual(funnel["stages"], [])
		self.assertEqual(funnel["unclassified_stages"], [])

	def test_all_pipeline_history_does_not_merge_an_archived_stage_with_an_active_twin(self):
		self.deal("Ongoing")
		self.pipeline.stages[1].archived = 1
		self.pipeline.save()
		other = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": f"Other {self.key}",
				"probability_policy": "Manual",
				"stages": [{"status": self.statuses["Ongoing"], "probability": 50}],
			}
		).insert()
		active = self.deal("Open")
		active.db_set({"pipeline": other.name, "status": self.statuses["Ongoing"]}, update_modified=False)
		result = get_pipeline_funnel("2040-02-01", "2040-02-29", {"deal_owner": self.user})
		historical = [row for row in result["historical_stages"] if row["pipeline"] == self.pipeline.name]
		current = [row for row in result["stages"] if row["pipeline"] == other.name]
		self.assertEqual(historical[0]["count"], 1)
		self.assertEqual(current[0]["count"], 1)
		self.assertEqual(result["total"], 2)
