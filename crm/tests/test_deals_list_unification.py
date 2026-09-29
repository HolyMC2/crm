# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Backend of the deals list unification (docs/DEALS_LIST_UNIFICATION.md §1-§5)."""

import csv
import datetime
import io
import json
import types
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, add_to_date, fmt_money, get_datetime, nowdate, today

from crm.api import deal_queues, list_columns, list_columns_crm
from crm.api.doc import get_data
from crm.api.list_export import build_export, export_list
from crm.api.list_tokens import open_deal_statuses, resolve_filter_tokens
from crm.patches.v1_0 import unpack_deal_list_views
from crm.tests import virtual_column_fixtures
from crm.tests.test_next_activity import open_deal_status

FIXTURE = "crm.tests.virtual_column_fixtures"
BROKEN = "crm.tests.virtual_column_fixtures_broken"
MISSING = "crm.tests.virtual_column_fixtures_not_there"
CRM = "crm.api.list_columns_crm"


def site_clock(utc: str):
	"""Pin frappe's clock to a UTC instant; system time zone conversion still applies.

	freezegun is not part of the bench image, so frappe.utils.data gets a datetime
	module whose ``datetime.now(tz)`` answers for that instant.
	"""
	instant = datetime.datetime.fromisoformat(utc).replace(tzinfo=datetime.UTC)

	class Clock(datetime.datetime):
		@classmethod
		def now(cls, tz=None):
			return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)

	module = types.SimpleNamespace(
		**{k: getattr(datetime, k) for k in dir(datetime) if not k.startswith("__")}
	)
	module.datetime = Clock
	return patch("frappe.utils.data.datetime", module)


def hooks(*paths):
	return patch.object(list_columns, "hook_paths", return_value=list(paths))


def terminal_status(kind="Won"):
	name = frappe.db.get_value("CRM Deal Status", {"type": kind}, "name")
	assert name, f"site has no {kind} CRM Deal Status"
	return name


class DealsListTestCase(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.deals: list[str] = []
		self.views: list = []
		self.users: list[str] = []
		virtual_column_fixtures.CALLS.clear()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in self.views:
			frappe.db.delete("CRM View Settings", {"name": name})
		for name in self.deals:
			frappe.delete_doc("CRM Deal", name, force=True, ignore_missing=True)
		for name in self.users:
			frappe.delete_doc("User", name, force=True, ignore_missing=True)
		super().tearDown()

	def make_deal(self, status=None, **values) -> str:
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": status or open_deal_status(),
				"deal_owner": "Administrator",
				"expected_deal_value": 100,
				"expected_closure_date": add_to_date(nowdate(), days=30),
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.deals.append(deal.name)
		if values:
			# next_activity_* are derived by crm/pipeline hooks; a direct write models
			# the stored state without creating tasks.
			frappe.db.set_value("CRM Deal", deal.name, values, update_modified=False)
		return deal.name

	def make_user(self, role: str | None) -> str:
		email = f"zz-dealslist-{frappe.generate_hash(length=8)}@example.invalid"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "ZZ Deals List",
				"send_welcome_email": 0,
				"roles": [{"role": role}] if role else [],
			}
		)
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		self.users.append(email)
		return email

	def list_names(self, filters, **kwargs):
		filters = {**filters, "name": ["in", self.deals]}
		result = get_data(
			"CRM Deal", filters, kwargs.pop("order_by", "creation asc"), page_length=100, **kwargs
		)
		return result


class TestFilterTokens(DealsListTestCase):
	def test_dict_and_list_forms_resolve_without_mutating_the_input(self):
		frappe.set_user("Administrator")
		base = today()
		stored = {
			"next_activity_at": ["<", "@today"],
			"expected_closure_date": ["between", ["@today-1", "@today+7"]],
			"modified": "@today",
			"deal_owner": "@me",
			"_assign": ["like", "%@me%"],
			"status": ["in", "@open_deal_statuses"],
			"source": ["in", ["@open_deal_statuses", "Literal"]],
			"deal_name": "not-a-token",
		}
		snapshot = json.dumps(stored, sort_keys=True)
		resolved = resolve_filter_tokens(stored)
		self.assertEqual(json.dumps(stored, sort_keys=True), snapshot, "saved view must keep its tokens")
		self.assertEqual(resolved["next_activity_at"], ["<", base])
		self.assertEqual(
			resolved["expected_closure_date"], ["between", [add_days(base, -1), add_days(base, 7)]]
		)
		self.assertEqual(resolved["modified"], base)
		self.assertEqual(resolved["deal_owner"], "Administrator")
		self.assertEqual(resolved["_assign"], ["like", "%Administrator%"])
		self.assertEqual(resolved["status"], ["in", open_deal_statuses()])
		self.assertEqual(resolved["source"], ["in", [*open_deal_statuses(), "Literal"]])
		self.assertEqual(resolved["deal_name"], "not-a-token")

		as_list = resolve_filter_tokens(
			[
				["CRM Deal", "next_activity_at", ">=", "@today+2"],
				["status", "not in", "@open_deal_statuses"],
				["deal_owner", "=", "@me"],
			]
		)
		self.assertEqual(as_list[0], ["CRM Deal", "next_activity_at", ">=", add_days(base, 2)])
		self.assertEqual(as_list[1], ["status", "not in", open_deal_statuses()])
		self.assertEqual(as_list[2], ["deal_owner", "=", "Administrator"])
		self.assertEqual(resolve_filter_tokens(json.dumps({"a": "@today"})), {"a": base})
		self.assertIsNone(resolve_filter_tokens(None))

	def test_today_is_the_site_date_across_the_utc_midnight(self):
		# 23:30 UTC is still the 28th in Mexico City and already the 29th in Tokyo.
		with site_clock("2026-09-28 23:30:00"):
			with patch("frappe.utils.data.get_system_timezone", return_value="America/Mexico_City"):
				self.assertEqual(resolve_filter_tokens({"d": "@today"}), {"d": "2026-09-28"})
				self.assertEqual(resolve_filter_tokens({"d": "@today+1"}), {"d": "2026-09-29"})
			with patch("frappe.utils.data.get_system_timezone", return_value="Asia/Tokyo"):
				self.assertEqual(resolve_filter_tokens({"d": "@today"}), {"d": "2026-09-29"})
				self.assertEqual(resolve_filter_tokens({"d": "@today-1"}), {"d": "2026-09-28"})

	def test_overdue_excludes_undated_and_today(self):
		start = get_datetime(f"{today()} 00:00:00")
		before = self.make_deal(next_activity_task="ZZ-T", next_activity_at=add_to_date(start, seconds=-1))
		at_midnight = self.make_deal(next_activity_task="ZZ-T", next_activity_at=start)
		undated = self.make_deal(next_activity_task="ZZ-T")
		names = {row["name"] for row in self.list_names({"next_activity_at": deal_queues.OVERDUE})["data"]}
		self.assertEqual(names & {before, at_midnight, undated}, {before})

	def test_open_statuses_come_from_the_status_type(self):
		statuses = open_deal_statuses()
		self.assertNotIn(terminal_status("Won"), statuses)
		self.assertNotIn(terminal_status("Lost"), statuses)
		self.assertIn(open_deal_status(), statuses)

	def test_get_data_and_totals_apply_the_tokens(self):
		overdue = self.make_deal(
			next_activity_task="ZZ-TASK", next_activity_at=add_to_date(get_datetime(), days=-2)
		)
		later = self.make_deal(
			next_activity_task="ZZ-TASK", next_activity_at=add_to_date(get_datetime(), days=3)
		)
		result = self.list_names({"next_activity_at": ["<", "@today"]})
		names = [row["name"] for row in result["data"]]
		self.assertIn(overdue, names)
		self.assertNotIn(later, names)
		self.assertEqual(result["total_count"], 1)

		from crm.api.doc import aggregate_deal_metrics

		metrics = aggregate_deal_metrics(
			filters=json.dumps({"next_activity_at": ["<", "@today"], "name": ["in", self.deals]})
		)
		self.assertEqual(sum(stage.get("count", 0) for stage in metrics["stages"]), 1)


class TestVirtualColumns(DealsListTestCase):
	def test_descriptors_are_normalised_and_failures_skipped(self):
		with hooks(FIXTURE, MISSING, BROKEN, CRM):
			columns = list_columns.get_virtual_columns("CRM Deal")
		keys = [column["key"] for column in columns]
		self.assertEqual(keys, ["_v_fixture", "_v_broken", "_v_next_step", "_v_weighted"])
		for column in columns:
			self.assertEqual((column["virtual"], column["sortable"], column["filterable"]), (1, 0, 0))
		self.assertEqual(columns[0]["groupable"], 1)
		self.assertEqual(columns[1]["groupable"], 0)

	def test_get_data_strips_virtual_keys_and_enriches_in_row_order(self):
		first, second, third = self.make_deal(), self.make_deal(), self.make_deal()
		columns = [
			{"label": "Deal Name", "type": "Data", "key": "deal_name", "width": "10rem"},
			{"label": "Fixture", "type": "Data", "key": "_v_fixture", "width": "8rem"},
			{"label": "Gone", "type": "Data", "key": "_v_uninstalled", "width": "8rem"},
		]
		with hooks(FIXTURE):
			result = self.list_names(
				{},
				order_by="_v_fixture desc",  # virtual sort falls back to the native default
				columns=json.dumps(columns),
				rows=json.dumps(["name", "deal_name", "_v_fixture", "_v_uninstalled"]),
			)
			ordered = self.list_names(
				{},
				order_by="creation desc, _v_fixture asc",
				columns=json.dumps(columns),
				rows=json.dumps(["deal_name", "_v_fixture"]),
			)
		self.assertEqual(
			[column["key"] for column in result["columns"]],
			["deal_name", "_v_fixture"],
			"a column whose provider is not installed is hidden",
		)
		self.assertEqual({row["name"] for row in result["data"]}, {first, second, third})
		for row in result["data"]:
			self.assertEqual(row["_v_fixture"], f"fx-{row['name']}")
			self.assertNotIn("_v_uninstalled", row)
		self.assertEqual([row["name"] for row in ordered["data"]], [third, second, first])
		self.assertEqual(
			[row["_v_fixture"] for row in ordered["data"]], [f"fx-{n}" for n in (third, second, first)]
		)
		self.assertEqual(virtual_column_fixtures.CALLS[-1]["keys"], {"_v_fixture"})

	def test_a_failing_provider_does_not_break_the_list(self):
		deal = self.make_deal()
		with hooks(BROKEN, FIXTURE, MISSING), patch.object(frappe, "log_error") as log_error:
			result = self.list_names({}, rows=json.dumps(["name", "_v_broken", "_v_fixture"]), columns="[]")
		row = next(row for row in result["data"] if row["name"] == deal)
		self.assertIsNone(row["_v_broken"], "a failed provider's values are cleared, never half-filled")
		self.assertEqual(row["_v_fixture"], f"fx-{deal}")
		self.assertGreaterEqual(log_error.call_count, 2)  # import failure + enrich failure

	def test_crm_provider_next_step_and_weighted(self):
		past = add_to_date(get_datetime(), days=-1)
		deal = self.make_deal(
			next_activity_task="ZZ-TASK",
			next_activity_at=past,
			next_activity_type="Call",
			next_activity_title="Llamar",
			deal_value=1000,
			probability=25,
		)
		idle = self.make_deal()
		rows = [{"name": deal}, {"name": idle}]
		with hooks(CRM):
			list_columns.enrich_rows("CRM Deal", rows, {"_v_next_step", "_v_weighted"})
		step = rows[0]["_v_next_step"]
		self.assertEqual(step["task"], "ZZ-TASK")
		self.assertEqual(step["type"], "Call")
		self.assertTrue(step["overdue"])
		self.assertEqual(step["days"], -1)
		self.assertIsNone(rows[1]["_v_next_step"])
		currency = frappe.db.get_value("CRM Deal", deal, "currency") or frappe.db.get_single_value(
			"FCRM Settings", "currency"
		)
		self.assertEqual(rows[0]["_v_weighted"], fmt_money(250, currency=currency))
		future = list_columns_crm.next_step(
			frappe._dict(next_activity_task="T", next_activity_at=add_to_date(get_datetime(), days=2))
		)
		self.assertFalse(future["overdue"])
		self.assertEqual(future["days"], 2)

	def test_provider_does_not_leak_deals_the_user_cannot_read(self):
		deal = self.make_deal(next_activity_task="ZZ-TASK", next_activity_at=get_datetime())
		outsider = self.make_user(None)
		rows = [{"name": deal}]
		frappe.set_user(outsider)
		with hooks(CRM), patch.object(frappe, "log_error"):
			list_columns.enrich_rows("CRM Deal", rows, {"_v_next_step", "_v_weighted"})
		self.assertIsNone(rows[0]["_v_next_step"])
		self.assertIsNone(rows[0]["_v_weighted"])


class TestDealQueues(DealsListTestCase):
	def setUp(self):
		super().setUp()
		self.saved_setting = frappe.db.get_single_value("FCRM Settings", deal_queues.SETTINGS_FIELD)
		self.saved_views = [
			frappe.get_doc("CRM View Settings", name).as_dict()
			for name in frappe.get_all(
				"CRM View Settings",
				filters={"crm_seed_key": ["like", f"{deal_queues.KEY_PREFIX}%"]},
				pluck="name",
			)
		]
		frappe.db.delete("CRM View Settings", {"crm_seed_key": ["like", f"{deal_queues.KEY_PREFIX}%"]})
		frappe.db.set_single_value("FCRM Settings", deal_queues.SETTINGS_FIELD, "[]")

	def tearDown(self):
		frappe.db.delete("CRM View Settings", {"crm_seed_key": ["like", f"{deal_queues.KEY_PREFIX}%"]})
		for view in self.saved_views:
			doc = frappe.get_doc(view)
			doc.db_insert()
		frappe.db.set_single_value("FCRM Settings", deal_queues.SETTINGS_FIELD, self.saved_setting)
		super().tearDown()

	def seeded(self):
		return {
			row.crm_seed_key: row
			for row in frappe.get_all(
				"CRM View Settings",
				filters={"crm_seed_key": ["like", f"{deal_queues.KEY_PREFIX}%"]},
				fields=[
					"name",
					"crm_seed_key",
					"public",
					"user",
					"dt",
					"type",
					"filters",
					"columns",
					"label",
				],
			)
		}

	def test_seeding_is_idempotent_and_respects_deletions(self):
		created = deal_queues.ensure_default_queues()
		self.assertEqual(len(created), 5)
		seeded = self.seeded()
		self.assertEqual(set(seeded), {deal_queues.KEY_PREFIX + q["key"] for q in deal_queues.QUEUES})
		for row in seeded.values():
			self.assertEqual((row.public, row.user or "", row.dt, row.type), (1, "", "CRM Deal", "list"))
			self.assertIn("_v_next_step", row.columns)

		self.assertEqual(deal_queues.ensure_default_queues(), [])
		self.assertEqual(len(self.seeded()), 5)

		removed = seeded[deal_queues.KEY_PREFIX + "sin_fecha"].name
		frappe.db.delete("CRM View Settings", {"name": removed})
		self.assertEqual(deal_queues.ensure_default_queues(), [], "a deleted queue is not recreated")
		self.assertEqual(len(self.seeded()), 4)

		# identity is the seed key: renaming the label does not cause a duplicate
		todos = seeded[deal_queues.KEY_PREFIX + "todos"].name
		frappe.db.set_value("CRM View Settings", todos, "label", "Renamed by a manager")
		frappe.db.set_single_value("FCRM Settings", deal_queues.SETTINGS_FIELD, "[]")
		self.assertEqual(deal_queues.ensure_default_queues(), [deal_queues.KEY_PREFIX + "sin_fecha"])
		self.assertEqual(len(self.seeded()), 5)

	def test_queue_predicates_match_the_follow_up_rules(self):
		now = get_datetime()
		start_of_today = get_datetime(f"{today()} 00:00:00")
		overdue = self.make_deal(
			next_activity_task="ZZ-T", next_activity_at=add_to_date(start_of_today, minutes=-1)
		)
		due_today = self.make_deal(next_activity_task="ZZ-T", next_activity_at=f"{today()} 23:59:00")
		undated = self.make_deal(next_activity_task="ZZ-T")
		missing = self.make_deal()
		won_missing = self.make_deal(status=terminal_status("Won"))
		won_overdue = self.make_deal(
			status=terminal_status("Won"),
			next_activity_task="ZZ-T",
			next_activity_at=add_to_date(now, days=-3),
		)
		expected = {
			"todos": {overdue, due_today, undated, missing},
			"vencidos": {overdue},
			"para_hoy": {due_today},
			"sin_fecha": {undated},
			"sin_seguimiento": {missing},
		}
		for queue in deal_queues.QUEUES:
			with self.subTest(queue=queue["key"]):
				names = {row["name"] for row in self.list_names(queue["filters"])["data"]}
				self.assertEqual(names - {won_missing, won_overdue}, expected[queue["key"]])
				if queue["key"] in ("todos", "vencidos", "sin_seguimiento"):
					self.assertFalse(names & {won_missing, won_overdue}, "terminal deals are not open")


class TestListExport(DealsListTestCase):
	def test_headers_are_labels_and_rows_match_get_data(self):
		first, second = self.make_deal(), self.make_deal()
		fields = ["name", "deal_name", "status", "_v_fixture", "_v_uninstalled", "not_a_field"]
		filters = {"name": ["in", [first, second]], "modified": [">=", "@today-1"]}
		with hooks(FIXTURE):
			header, data = build_export(
				"CRM Deal", json.dumps(fields), filters=json.dumps(filters), order_by="creation asc"
			)
			listed = get_data("CRM Deal", filters, "creation asc", page_length=100)
		meta = frappe.get_meta("CRM Deal")
		self.assertEqual(
			header,
			[
				frappe._("ID"),
				frappe._(meta.get_label("deal_name")),
				frappe._(meta.get_label("status")),
				"Fixture",
			],
		)
		self.assertEqual([row[0] for row in data], [row["name"] for row in listed["data"]])
		self.assertEqual([row[3] for row in data], [f"fx-{first}", f"fx-{second}"])

		with hooks(FIXTURE):
			header, data = build_export(
				"CRM Deal", json.dumps(fields), filters=json.dumps(filters), selected_items=[second]
			)
		self.assertEqual([row[0] for row in data], [second])

	def test_csv_stream_and_permissions(self):
		deal = self.make_deal()
		with hooks(FIXTURE):
			export_list(
				"CRM Deal",
				json.dumps([{"key": "name", "label": "Trato"}, "_v_fixture"]),
				filters=json.dumps({"name": deal}),
				file_format="CSV",
			)
		self.assertEqual(frappe.response["type"], "binary")
		self.assertTrue(frappe.response["filename"].endswith(".csv"))
		rows = list(csv.reader(io.StringIO(frappe.response["filecontent"].decode("utf-8-sig"))))
		self.assertEqual(rows, [["Trato", "Fixture"], [deal, f"fx-{deal}"]])

		outsider = self.make_user(None)
		frappe.set_user(outsider)
		with self.assertRaises(frappe.PermissionError):
			export_list("CRM Deal", json.dumps(["name"]), file_format="CSV")

	def test_export_uses_the_same_scope_as_the_list_for_a_restricted_user(self):
		self.make_deal()
		self.make_deal()
		user = self.make_user("Sales User")
		frappe.set_user(user)
		filters = {"name": ["in", self.deals]}
		listed = get_data("CRM Deal", filters, "creation asc", page_length=100)
		_header, data = build_export(
			"CRM Deal", json.dumps(["name"]), filters=json.dumps(filters), order_by="creation asc"
		)
		self.assertEqual([row[0] for row in data], [row["name"] for row in listed["data"]])


class TestPackedViewMigration(DealsListTestCase):
	def insert_view(self, **values):
		doc = frappe.get_doc(
			{
				"doctype": "CRM View Settings",
				"label": f"ZZ view {frappe.generate_hash(length=6)}",
				"dt": "CRM Deal",
				"type": "list",
				"user": "Administrator",
				"filters": "{}",
				"order_by": "modified desc",
				"columns": "[]",
				"rows": "[]",
				"kanban_columns": "[]",
				"kanban_fields": "[]",
				**values,
			}
		)
		doc.insert(ignore_permissions=True)
		self.views.append(doc.name)
		return doc.name

	def packed(self, **blob):
		state = {
			"doco_deal_list": 1,
			"followUp": "all",
			"search": "",
			"view": "list",
			"groupBy": "none",
			"columns": [],
			**blob,
		}
		return json.dumps(state)

	def row(self, name):
		return frappe.db.get_value("CRM View Settings", name, "*", as_dict=True)

	def test_packed_view_becomes_a_standard_view_once(self):
		packed = self.packed(
			followUp="overdue",
			search="Pantalla",
			groupBy="status",
			columns=["value", "customer", "next_activity", "ro", "bogus"],
		)
		name = self.insert_view(
			route_name="Deals List",
			filters=json.dumps({"pipeline": "ZZ", "source": ["in", ["Web"]]}),
			order_by="next_activity_at asc",
			group_by_field="status",
			kanban_fields=packed,
		)
		untouched_list = self.insert_view(route_name="Deals List", kanban_fields="[]")
		classic = self.insert_view(route_name="Deals", kanban_fields=json.dumps(["deal_value"]))
		before = {view: self.row(view) for view in (untouched_list, classic)}

		unpack_deal_list_views.execute()
		row = self.row(name)
		filters = json.loads(row.filters)
		self.assertEqual(filters["pipeline"], "ZZ")
		self.assertEqual(filters["source"], ["in", ["Web"]])
		self.assertEqual(filters["next_activity_task"], ["is", "set"])
		self.assertEqual(filters["next_activity_at"], deal_queues.OVERDUE)
		self.assertEqual(filters["deal_name"], ["like", "%Pantalla%"])
		self.assertEqual(
			[column["key"] for column in json.loads(row.columns)],
			["deal_name", "_v_customer", "_v_repair_order", "_v_repair_status", "deal_value", "_v_next_step"],
		)
		self.assertIn("deal_value", json.loads(row.rows))
		self.assertEqual(
			(row.type, row.group_by_field, row.order_by), ("group_by", "status", "next_activity_at asc")
		)
		self.assertEqual(row.route_name, "Deals")
		self.assertEqual(row.kanban_fields, "[]")
		self.assertEqual(json.loads(row.legacy_view_state)["kanban_fields"], packed)

		unpack_deal_list_views.execute()
		self.assertEqual(self.row(name), row, "a second run changes nothing")
		for view, original in before.items():
			self.assertEqual(self.row(view), original, "views that were never packed are not touched")

	def test_missing_queue_keeps_the_stage_choice_within_open_stages(self):
		open_status, won = open_deal_status(), terminal_status("Won")
		mixed = self.insert_view(
			route_name="Deals List",
			filters=json.dumps({"status": ["in", [open_status, won]]}),
			kanban_fields=self.packed(followUp="missing"),
		)
		plain = self.insert_view(route_name="Deals List", kanban_fields=self.packed(followUp="missing"))
		board = self.insert_view(route_name="Deals List", kanban_fields=self.packed(view="board"))
		unpack_deal_list_views.execute()
		self.assertEqual(json.loads(self.row(mixed).filters)["status"], ["in", [open_status]])
		self.assertEqual(json.loads(self.row(plain).filters)["status"], ["in", "@open_deal_statuses"])
		board_row = self.row(board)
		self.assertEqual((board_row.type, board_row.column_field), ("kanban", "status"))
		self.assertTrue(json.loads(board_row.kanban_columns))
		# the default column set of the old page when none was chosen
		self.assertIn("_v_next_step", [column["key"] for column in json.loads(self.row(plain).columns)])
