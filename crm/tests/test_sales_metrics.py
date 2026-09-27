"""Native regression fixtures for commercial metrics, scopes and period boundaries."""

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from crm.api.dashboard import (
	get_average_deal_value,
	get_average_ongoing_deal_value,
	get_average_won_deal_value,
	get_chart,
	get_deal_status_change_counts,
	get_deals_by_salesperson,
	get_deals_by_stage_axis,
	get_deals_by_stage_donut,
	get_deals_by_territory,
	get_forecasted_revenue,
	get_funnel_conversion,
	get_ongoing_deals,
	get_pipeline_funnel,
)
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

	def coassign_to_actor(self, deal):
		"""Keep a non-owner assignment through the supported owner-edit lifecycle."""
		owner = deal.deal_owner
		assignment = frappe.get_doc(
			{
				"doctype": "ToDo",
				"reference_type": "CRM Deal",
				"reference_name": deal.name,
				"allocated_to": self.user,
				"description": "Metrics co-assignment",
				"status": "Open",
			}
		).insert()
		# ToDo.after_insert deliberately makes its assignee the current owner.
		# A normal owner edit retains the other open assignments. Do not bypass
		# either lifecycle with db_set, or accidentally test owner access instead.
		deal.reload()
		self.assertEqual(deal.deal_owner, self.user)
		deal.deal_owner = owner
		deal.save()
		self.assertEqual(deal.reload().deal_owner, owner)
		assignment.reload()
		self.assertEqual((assignment.allocated_to, assignment.status), (self.user, "Open"))
		self.assertFalse(
			frappe.db.exists(
				"DocShare", {"share_doctype": "CRM Deal", "share_name": deal.name, "user": self.user}
			)
		)

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
		owned = self.deal(expected=100)
		assigned = self.deal(expected=800, deal_owner="Administrator")
		self.deal(expected=9000, deal_owner="Administrator")
		self.coassign_to_actor(assigned)
		frappe.set_user(self.user)
		self.assertEqual(
			set(frappe.get_list("CRM Deal", filters={"pipeline": self.pipeline.name}, pluck="name")),
			{owned.name, assigned.name},
		)
		row = self.metrics()[self.statuses["Ongoing"]]
		self.assertEqual(row.count, 2)
		self.assertEqual(row.weighted_forecast, 450)
		filtered = self.metrics(deal_owner="Administrator")[self.statuses["Ongoing"]]
		self.assertEqual((filtered.count, filtered.weighted_forecast), (1, 400))
		chart = get_chart("forecasted_revenue", "axis", "2040-02-01", "2040-02-29")
		self.assertEqual(chart["data"][0]["forecasted"], 450)
		chart = get_chart("forecasted_revenue", "axis", "2040-02-01", "2040-02-29", "Administrator")
		self.assertEqual(chart["data"][0]["forecasted"], 400)

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

	def test_dashboard_averages_use_per_record_money_and_include_real_zero(self):
		self.deal(expected=100, value=10, probability=0)
		self.deal(expected=0, value=900, probability=100)
		self.deal("On Hold", expected=0, value=0)
		self.deal("Open", expected=200, currency="MXN", exchange_rate=0.05)
		self.deal(expected=99999, currency="MXN", exchange_rate=0)
		self.deal("Won", expected=100, value=800, closed_date="2040-02-29")
		self.deal("Won", expected=600, value=0, closed_date="2040-02-29")
		self.deal("Lost", expected=9000, probability=100)
		current = get_average_ongoing_deal_value("2040-02-01", "2040-02-29", self.user)
		self.assertEqual(current["value"], 252.5)  # (100 + 900 + 0 + 10) / 4 known open amounts.
		self.assertEqual(current["sample_count"], 4)
		self.assertEqual(current["missing_exchange_rate_count"], 1)
		self.assertIn("Excluded 1", current["metric_note"])
		self.assertEqual(current["deltaSuffix"], " USD")
		won = get_average_won_deal_value("2040-02-01", "2040-02-29", self.user)
		self.assertEqual(won["value"], 700)
		self.assertEqual(won["sample_count"], 2)
		combined = get_average_deal_value("2040-02-01", "2040-02-29", self.user)
		self.assertAlmostEqual(combined["value"], 2410 / 6)
		self.assertEqual(combined["sample_count"], 6)
		# Grouped charts cover every record, including Lost, but expose it as recorded commercial value.
		for chart in (get_deals_by_territory, get_deals_by_salesperson):
			result = chart("2040-02-01", "2040-02-29", self.user)
			self.assertEqual(sum(row.deals for row in result["data"]), 8)
			self.assertEqual(sum(row.value or 0 for row in result["data"]), 11410)
			self.assertEqual(sum(row.open_expected_value or 0 for row in result["data"]), 1010)
			self.assertEqual(sum(row.weighted_forecast or 0 for row in result["data"]), 905)
			self.assertEqual(sum(row.won_value or 0 for row in result["data"]), 1400)
			self.assertEqual(result["missing_exchange_rate_count"], 1)
			self.assertIn("not forecast", result["metric_note"])

	def test_missing_rates_are_unavailable_instead_of_an_invented_zero(self):
		self.deal(currency="MXN", exchange_rate=0)
		result = get_average_ongoing_deal_value("2040-02-01", "2040-02-29", self.user)
		self.assertTrue(result["unavailable"])
		self.assertEqual(result["sample_count"], 0)
		self.assertIn("Excluded 1", result["reason"])
		group = get_deals_by_salesperson("2040-02-01", "2040-02-29", self.user)["data"][0]
		self.assertIsNone(group.value)
		self.assertEqual(group.deals, 1)
		forecast = get_forecasted_revenue("2040-02-01", "2040-02-29", self.user)
		self.assertIsNone(forecast["data"][0]["forecasted"])
		self.assertEqual(forecast["missing_exchange_rate_count"], 1)

	def test_previous_window_has_equal_inclusive_length_and_wins_use_closure(self):
		self.deal(expected=100, creation="2040-02-03 00:00:00")
		self.deal(expected=300, creation="2040-02-04 23:59:59")
		self.deal(expected=10000, creation="2040-02-05 00:00:00")
		self.deal(expected=50, creation="2040-02-01 00:00:00")
		self.deal(expected=150, creation="2040-02-02 23:59:59")
		self.deal(expected=99999, creation="2040-01-31 23:59:59")
		result = get_average_ongoing_deal_value("2040-02-03", "2040-02-04", self.user)
		self.assertEqual(result["value"], 200)
		self.assertEqual(result["delta"], 100)
		self.assertEqual(result["previous_sample_count"], 2)
		self.assertEqual(get_ongoing_deals("2040-02-03", "2040-02-04", self.user)["delta"], 0)
		self.deal("Won", value=700, creation="2040-01-01", closed_date="2040-02-04")
		self.deal("Won", value=9000, creation="2040-02-03", closed_date="2040-02-05")
		won = get_average_won_deal_value("2040-02-03", "2040-02-04", self.user)
		self.assertEqual(won["value"], 700)
		self.assertEqual(won["date_basis"], "closed_date")

	def test_stage_charts_preserve_lost_hidden_unclassified_and_pipeline_identity(self):
		self.deal("Ongoing", expected=99999)
		self.deal("Lost", expected=9000)
		self.deal("Won", value=800, closed_date="2040-02-10")
		self.deal("On Hold", expected=500)
		frappe.db.set_value("CRM Deal Status", self.statuses["On Hold"], "hidden", 1)
		self.pipeline.stages[1].archived = 1
		self.pipeline.save()
		other = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": f"Other dashboard {self.key}",
				"probability_policy": "Manual",
				"stages": [{"status": self.statuses["Ongoing"], "probability": 50}],
			}
		).insert()
		self.deal("Ongoing", expected=100, pipeline=other.name)
		stale = self.deal("Open")
		stale.db_set("status", f"Missing {self.key}", update_modified=False)
		self.deal("Open", creation="2040-03-01 00:00:00")
		for chart in (get_deals_by_stage_axis, get_deals_by_stage_donut):
			rows = chart("2040-02-01", "2040-02-29", self.user)["data"]
			self.assertEqual(sum(row["count"] for row in rows), 6)
			self.assertEqual(len({row["stage"] for row in rows}), 6)
			twins = [row for row in rows if row["status"] == self.statuses["Ongoing"]]
			self.assertEqual(len(twins), 2)
			self.assertEqual({row["pipeline"] for row in twins}, {self.pipeline.name, other.name})
			self.assertEqual(sum(row["count"] for row in rows if row.get("hidden")), 2)
			self.assertEqual(sum(row["count"] for row in rows if row["status_type"] == "Unknown"), 1)
		self.assertEqual(get_ongoing_deals("2040-02-01", "2040-02-29", self.user)["value"], 1)
		self.assertEqual(get_average_ongoing_deal_value("2040-02-01", "2040-02-29", self.user)["value"], 100)

	def test_lead_conversion_uses_one_cohort_despite_unrelated_repeated_deal_transitions(self):
		for converted, creation in ((1, "2040-02-29 23:59:59"), (0, "2040-02-10"), (1, "2040-03-01")):
			lead = frappe.get_doc(
				{
					"doctype": "CRM Lead",
					"first_name": f"Cohort {self.key}",
					"lead_owner": self.user,
					"pipeline": self.pipeline.name,
				}
			).insert()
			lead.db_set({"converted": converted, "creation": creation}, update_modified=False)
		deal = self.deal()
		for _ in range(3):
			frappe.get_doc(
				{
					"doctype": "CRM Status Change Log",
					"parent": deal.name,
					"parenttype": "CRM Deal",
					"parentfield": "status_change_log",
					"to": self.statuses["Ongoing"],
					"from": self.statuses["Open"],
					"from_date": "2040-02-10 12:00:00",
					"to_date": "2040-02-10 13:00:00",
				}
			).insert()
		result = get_funnel_conversion("2040-02-01", "2040-02-29", self.user)
		self.assertEqual(
			result["data"], [{"stage": "Leads", "count": 2}, {"stage": "Converted leads", "count": 1}]
		)
		self.assertEqual(result["conversion"], 50)

	def test_dashboard_entry_points_include_assignments_but_cannot_expand_actor_scope(self):
		self.deal(expected=100)
		assigned = self.deal(expected=800, deal_owner="Administrator")
		self.deal(expected=99999, deal_owner="Administrator")
		self.coassign_to_actor(assigned)
		frappe.set_user(self.user)
		for chart_name in ("average_deal_value", "average_ongoing_deal_value"):
			self.assertEqual(get_chart(chart_name, "number", "2040-02-01", "2040-02-29")["value"], 450)
			self.assertEqual(
				get_chart(chart_name, "number", "2040-02-01", "2040-02-29", "Administrator")["value"], 800
			)
		for chart_name in ("deals_by_stage_axis", "deals_by_stage_donut"):
			self.assertEqual(
				sum(
					row["count"] for row in get_chart(chart_name, "axis", "2040-02-01", "2040-02-29")["data"]
				),
				2,
			)
			self.assertEqual(
				sum(
					row["count"]
					for row in get_chart(chart_name, "axis", "2040-02-01", "2040-02-29", "Administrator")[
						"data"
					]
				),
				1,
			)
		self.assertEqual(
			sum(
				row.deals
				for row in get_chart("deals_by_salesperson", "axis", "2040-02-01", "2040-02-29")["data"]
			),
			2,
		)

	def test_history_counts_require_native_child_field_read_permission(self):
		# Native insertion records an open interval with `from`, not a completed
		# transition with `to`. Create the event through the owning controller;
		# the general metrics helper's legacy db_set fixture has no such event.
		deal = (
			frappe.get_doc(
				{
					"doctype": "CRM Deal",
					"pipeline": self.pipeline.name,
					"status": self.statuses["Ongoing"],
					"deal_owner": self.user,
					"currency": "USD",
					"expected_deal_value": 100,
					"expected_closure_date": "2040-02-10",
					"probability": 50,
				}
			)
			.insert()
			.reload()
		)
		self.assertFalse(any(row.to for row in deal.status_change_log))
		deal.status = self.statuses["Open"]
		deal.save()
		# Date only the synthetic parent for this existing cohort-based query.
		deal.db_set("creation", "2040-02-10 12:00:00", update_modified=False)
		transitions = [row for row in deal.reload().status_change_log if row.to]
		self.assertEqual(
			[(row.get("from"), row.to) for row in transitions],
			[(self.statuses["Ongoing"], self.statuses["Open"])],
		)
		frappe.set_user(self.user)
		self.assertEqual(
			get_deal_status_change_counts("2040-02-01", "2040-02-29"),
			[{"stage": self.statuses["Open"], "count": 1}],
		)
		for property_name, value, property_type in (("permlevel", 1, "Int"), ("mask", 1, "Check")):
			with self.subTest(property=property_name):
				frappe.set_user("Administrator")
				frappe.db.savepoint("metrics_history_field")
				try:
					make_property_setter("CRM Status Change Log", "to", property_name, value, property_type)
					frappe.clear_cache(doctype="CRM Status Change Log")
					frappe.set_user(self.user)
					with self.assertRaises(frappe.PermissionError):
						get_deal_status_change_counts("2040-02-01", "2040-02-29")
				finally:
					frappe.set_user("Administrator")
					frappe.db.rollback(save_point="metrics_history_field")
					frappe.clear_cache(doctype="CRM Status Change Log")
