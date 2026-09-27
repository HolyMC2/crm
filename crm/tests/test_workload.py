"""Native workload permissions, controller continuity and partial-failure evidence."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase
from frappe.utils import CallbackManager, add_days, now_datetime, today

from crm.api.workload import get_work_items, get_workload, reassign_bulk


class TestWorkload(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.key = frappe.generate_hash(length=8)
		self.fixture_users = []
		self.point = "workload_fixture_" + self.key
		frappe.db.savepoint(self.point)
		self.callbacks = {
			name: getattr(frappe.db, name)
			for name in ("before_commit", "after_commit", "before_rollback", "after_rollback")
		}
		self.had_realtime_log = hasattr(frappe.local, "_realtime_log")
		self.realtime_log = getattr(frappe.local, "_realtime_log", None)
		if self.had_realtime_log:
			del frappe.local._realtime_log
		for name in self.callbacks:
			setattr(frappe.db, name, CallbackManager())
		self.addCleanup(self.restore_fixture)
		frappe.db.set_single_value("FCRM Settings", "currency", "USD")
		frappe.db.set_single_value("FCRM Settings", "workload_advisory_capacity", 1)
		self.seller = self.user("seller")
		self.target = self.user("target")
		self.manager = self.user("manager", "Sales Manager")
		self.statuses = {}
		for kind in ("Open", "Ongoing", "On Hold", "Lost"):
			self.statuses[kind] = (
				frappe.get_doc(
					{
						"doctype": "CRM Deal Status",
						"deal_status": f"Workload {kind} {self.key}",
						"type": kind,
						"probability": 50,
					}
				)
				.insert()
				.name
			)
		self.pipeline = self.make_pipeline()
		self.filters = {"pipeline": self.pipeline.name}

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def restore_fixture(self):
		frappe.set_user("Administrator")
		try:
			try:
				frappe.db.before_rollback.run()
			finally:
				frappe.db.rollback(save_point=self.point)
		finally:
			try:
				frappe.db.after_rollback.run()
				frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
				for user in self.fixture_users:
					frappe.clear_cache(user=user)
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime_log:
					frappe.local._realtime_log = self.realtime_log

	def user(self, label, role="Sales User"):
		name = f"workload-{label}-{self.key}@example.invalid"
		self.fixture_users.append(name)
		frappe.get_doc(
			{
				"doctype": "User",
				"email": name,
				"first_name": label,
				"send_welcome_email": 0,
				"roles": [{"role": role}],
			}
		).insert()
		return name

	def make_pipeline(self):
		return frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": f"Workload {frappe.generate_hash(length=8)}",
				"currency": "USD",
				"probability_policy": "Manual",
				"stages": [{"status": status, "probability": 50} for status in self.statuses.values()],
			}
		).insert()

	def deal(self, owner=None, kind="Open", pipeline=None):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"deal_name": "Workload fixture",
				"pipeline": pipeline or self.pipeline.name,
				"deal_owner": self.seller if owner is None else owner,
				"status": self.statuses["Open"],
				"currency": "USD",
				"expected_deal_value": 10,
				"expected_closure_date": add_days(today(), 7),
			}
		).insert()
		if kind != "Open":
			# Historical stage fixture, including Lost without a sales loss workflow.
			doc.db_set("status", self.statuses[kind])
		return doc

	def task(self, parent, due=None, owner=None):
		return (
			frappe.get_doc(
				{
					"doctype": "CRM Task",
					"title": "Follow up workload",
					"status": "Todo",
					"assigned_to": owner or self.seller,
					"reference_doctype": "CRM Deal",
					"reference_docname": parent.name,
					"due_date": due,
				}
			)
			.insert()
			.reload()
		)

	def command(self, doc):
		doc.reload()
		field = "assigned_to" if doc.doctype == "CRM Task" else "deal_owner"
		return {
			"doctype": doc.doctype,
			"name": doc.name,
			"modified": str(doc.modified),
			"owner": doc.get(field) or "",
		}

	def test_absent_marketing_capability_keeps_native_workload_and_advisory_capacity(self):
		deal = self.deal()
		self.deal(owner=self.target)
		# Optional discovery double only; native hooks keep their actual app graph.
		# A genuinely standalone site remains a separate acceptance cohort.
		with patch("crm.api.workload.get_installed_apps", return_value=["frappe", "crm"]):
			result = get_workload(self.filters)
		self.assertEqual(result["capacity"]["marketing"], {"state": "absent"})
		self.assertTrue(next(row for row in result["agents"] if row["user"] == self.target)["at_capacity"])
		self.assertTrue(reassign_bulk([self.command(deal)], self.target, self.filters)["results"][0]["ok"])
		self.assertEqual(frappe.db.get_value("CRM Deal", deal.name, "deal_owner"), self.target)

	def test_all_open_types_and_pages_reconcile_with_unassigned_drilldown(self):
		names = [self.deal(kind=("Open", "Ongoing", "On Hold")[index % 3]).name for index in range(26)]
		self.deal(kind="Lost")
		unassigned = self.deal(owner="")
		result = get_workload(self.filters)
		self.assertEqual(result["summary"]["open_deals"], 27)
		self.assertEqual(result["unassigned"]["open_deals"], 1)
		first = get_work_items(self.filters, owner=self.seller)
		last = get_work_items(self.filters, owner=self.seller, offset=first["next_offset"])
		self.assertEqual(first["total"], 26)
		self.assertTrue(first["has_more"])
		self.assertFalse(last["has_more"])
		self.assertCountEqual([row.name for row in first["items"] + last["items"]], names)
		self.assertEqual(get_work_items(self.filters, owner="")["items"][0].name, unassigned.name)

	def test_overdue_excludes_undated_future_and_done_and_keeps_closed_parent_work(self):
		parent = self.deal(kind="Lost")
		overdue = self.task(parent, add_days(now_datetime(), -1))
		self.task(parent)
		self.task(parent, add_days(now_datetime(), 1))
		done = self.task(parent, add_days(now_datetime(), -2))
		done.status = "Done"
		done.save()
		result = get_workload(self.filters)
		self.assertEqual(result["summary"]["open_tasks"], 3)
		self.assertEqual(result["summary"]["overdue_tasks"], 1)
		self.assertEqual(result["summary"]["undated_tasks"], 1)
		self.assertEqual(
			get_work_items(self.filters, kind="tasks", overdue=True)["items"][0].name, str(overdue.name)
		)

	def test_nonmanager_cannot_read_or_reassign(self):
		doc = self.deal()
		command = self.command(doc)
		frappe.set_user(self.seller)
		for action in (
			lambda: get_workload(self.filters),
			lambda: get_work_items(self.filters),
			lambda: reassign_bulk([command], self.target, self.filters),
		):
			with self.assertRaises(frappe.PermissionError):
				action()

	def test_restricted_pipeline_never_leaks_parent_or_task_despite_owner_share(self):
		visible = self.deal(owner=self.manager)
		hidden_pipeline = self.make_pipeline()
		hidden = self.deal(owner=self.manager, pipeline=hidden_pipeline.name)
		self.task(hidden, add_days(now_datetime(), -1), self.manager)
		hidden_pipeline.append("roles", {"role": "System Manager"})
		hidden_pipeline.save()
		frappe.set_user(self.manager)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", doc=hidden))
		result = get_workload({"pipeline": hidden_pipeline.name})
		self.assertEqual(result["summary"]["open_deals"], 0)
		self.assertEqual(result["summary"]["open_tasks"], 0)
		self.assertEqual(get_work_items({"pipeline": hidden_pipeline.name})["total"], 0)
		self.assertEqual(get_work_items(self.filters)["items"][0].name, visible.name)

	def test_hierarchy_limits_candidates_and_rows(self):
		root = frappe.get_doc(
			{"doctype": "CRM Sales Hierarchy", "user": self.manager, "is_group": 1}
		).insert()
		frappe.get_doc(
			{"doctype": "CRM Sales Hierarchy", "user": self.seller, "reports_to": root.name}
		).insert()
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 1)
		own = self.deal()
		self.deal(owner=self.target)
		command = self.command(own)
		frappe.set_user(self.manager)
		result = get_workload(self.filters)
		self.assertEqual(result["summary"]["open_deals"], 1)
		self.assertNotIn(self.target, [row["user"] for row in result["candidates"]])
		self.assertFalse(reassign_bulk([command], self.target, self.filters)["results"][0]["ok"])

	def test_partial_bulk_retains_stale_error_and_native_assignment_task_continuity(self):
		first, stale = self.deal(), self.deal()
		task = self.task(first, add_days(now_datetime(), 1))
		commands = [self.command(first), self.command(stale)]
		stale.next_step = "Changed after manager loaded queue"
		stale.save()
		result = reassign_bulk(commands, self.target, self.filters)
		self.assertTrue(result["results"][0]["ok"])
		self.assertEqual(result["results"][1]["error_type"], "TimestampMismatchError")
		self.assertEqual(frappe.db.get_value("CRM Deal", stale.name, "deal_owner"), self.seller)
		self.assertEqual(frappe.db.get_value("CRM Task", task.name, "assigned_to"), self.seller)
		self.assertTrue(
			frappe.db.exists(
				"ToDo",
				{
					"reference_type": "CRM Deal",
					"reference_name": first.name,
					"allocated_to": self.target,
					"status": "Open",
				},
			)
		)
		result = reassign_bulk([self.command(task)], self.target, self.filters)
		self.assertTrue(result["results"][0]["ok"])
		self.assertEqual(frappe.db.get_value("CRM Task", task.name, "assigned_to"), self.target)
		self.assertFalse(
			frappe.db.exists(
				"ToDo",
				{
					"reference_type": "CRM Task",
					"reference_name": task.name,
					"allocated_to": self.seller,
					"status": "Open",
				},
			)
		)

	def test_target_current_pipeline_permission_and_disabled_status_are_rechecked(self):
		doc = self.deal()
		other = self.make_pipeline()
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.target,
				"allow": "CRM Pipeline",
				"for_value": other.name,
				"apply_to_all_doctypes": 1,
			}
		).insert()
		result = reassign_bulk([self.command(doc)], self.target, self.filters)
		self.assertFalse(result["results"][0]["ok"])
		self.assertEqual(frappe.db.get_value("CRM Deal", doc.name, "deal_owner"), self.seller)
		frappe.db.set_value("User", self.seller, "enabled", 0)
		self.assertNotIn(self.seller, [row["user"] for row in get_workload(self.filters)["candidates"]])

	def test_native_save_failure_rolls_back_only_that_row(self):
		first, second = self.deal(), self.deal()
		from crm.fcrm.doctype.crm_deal.crm_deal import CRMDeal

		original = CRMDeal.validate

		def fail_one(doc):
			original(doc)
			if doc.name == first.name:
				frappe.throw("Synthetic controller rejection")

		with patch.object(CRMDeal, "validate", fail_one):
			result = reassign_bulk([self.command(first), self.command(second)], self.target, self.filters)
		self.assertFalse(result["results"][0]["ok"])
		self.assertTrue(result["results"][1]["ok"])
		self.assertEqual(frappe.db.get_value("CRM Deal", first.name, "deal_owner"), self.seller)
		self.assertFalse(
			frappe.db.exists(
				"ToDo",
				{
					"reference_type": "CRM Deal",
					"reference_name": first.name,
					"allocated_to": self.target,
					"status": "Open",
				},
			)
		)

	def test_capacity_validation_and_unknown_shift_are_explicit(self):
		settings = frappe.get_doc("FCRM Settings")
		settings.workload_advisory_capacity = -1
		with self.assertRaises(frappe.ValidationError):
			settings.save()
		with patch("crm.api.workload.get_installed_apps", return_value=["frappe", "crm"]):
			result = get_workload(self.filters)
		self.assertTrue(all(row["shift"] == "unknown" for row in result["agents"]))

	def test_company_filter_and_user_permission_intersect_the_same_queue(self):
		companies = []
		for index in range(2):
			name = f"Workload Company {index} {self.key}"
			if frappe.db.exists("DocType", "Company"):
				name = (
					frappe.get_doc(
						{
							"doctype": "Company",
							"company_name": name,
							"abbr": f"W{index}{self.key[:4]}",
							"default_currency": "USD",
							"country": "Mexico",
						}
					)
					.insert()
					.name
				)
			companies.append(name)
		left = self.deal()
		left.sales_company = companies[0]
		left.save()
		right = self.deal()
		right.sales_company = companies[1]
		right.save()
		for company, expected in zip(companies, (left, right), strict=True):
			scope = {**self.filters, "company": company}
			self.assertEqual(get_workload(scope)["summary"]["open_deals"], 1)
			self.assertEqual(get_work_items(scope)["items"][0].name, expected.name)
		self.assertTrue(set(companies).issubset(get_workload(self.filters)["companies"]))
		# CRM alone has Data company identifiers; when ERP owns Company records,
		# its native User Permission also constrains the same CRM record queries.
		if frappe.db.exists("DocType", "Company"):
			frappe.get_doc(
				{
					"doctype": "User Permission",
					"user": self.manager,
					"allow": "Company",
					"for_value": companies[0],
					"apply_to_all_doctypes": 1,
				}
			).insert()
			frappe.set_user(self.manager)
			self.assertEqual(get_workload(self.filters)["summary"]["open_deals"], 1)
			self.assertEqual(get_work_items(self.filters)["items"][0].name, left.name)

	def test_converted_lead_is_not_open_work_even_when_legacy_status_is_open(self):
		lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Workload converted",
				"pipeline": self.pipeline.name,
				"lead_owner": self.seller,
			}
		).insert()
		self.assertEqual(get_work_items(self.filters, kind="leads")["total"], 1)
		lead.db_set("converted", 1)
		self.assertEqual(get_workload(self.filters)["summary"]["open_leads"], 0)
		self.assertEqual(get_work_items(self.filters, kind="leads")["total"], 0)

	def test_failed_row_discards_commit_callbacks_and_realtime_but_keeps_parent_and_success(self):
		from frappe.utils import CallbackManager

		from crm.fcrm.doctype.crm_deal.crm_deal import CRMDeal

		first, second = self.deal(), self.deal()
		commands = [self.command(first), self.command(second)]
		names = ("before_commit", "after_commit", "before_rollback", "after_rollback")
		original_managers = {name: getattr(frappe.db, name) for name in names}
		managers = {name: CallbackManager() for name in names}
		missing = object()
		original_log = getattr(frappe.local, "_realtime_log", missing)
		seen, emitted = [], []
		original_validate = CRMDeal.validate

		def validate(doc):
			original_validate(doc)
			for name in names:
				getattr(frappe.db, name).add(lambda name=name, docname=doc.name: seen.append((name, docname)))
			frappe.publish_realtime(
				"workload-fixture", {"record": doc.name}, user="Administrator", after_commit=True
			)
			if doc.name == first.name:
				frappe.throw("Reject after native validation and callback registration")

		try:
			for name, manager in managers.items():
				setattr(frappe.db, name, manager)
			if hasattr(frappe.local, "_realtime_log"):
				del frappe.local._realtime_log
			managers["after_commit"].add(lambda: seen.append(("after_commit", "parent")))
			frappe.publish_realtime(
				"workload-fixture", {"record": "parent"}, user="Administrator", after_commit=True
			)
			with (
				patch.object(CRMDeal, "validate", validate),
				patch(
					"frappe.realtime.emit_via_redis",
					side_effect=lambda event, message, room: emitted.append(
						{"event": event, "message": message, "room": room}
					),
				),
			):
				result = reassign_bulk(commands, self.target, self.filters)
				self.assertEqual([row["ok"] for row in result["results"]], [False, True])
				self.assertCountEqual(seen, [("before_rollback", first.name), ("after_rollback", first.name)])
				for name, manager in managers.items():
					self.assertIs(getattr(frappe.db, name), manager)
				# Exercise the real CallbackManagers without committing test fixtures
				# or publishing Redis events; only the external emission is doubled.
				managers["before_commit"].run()
				managers["after_commit"].run()
			self.assertIn(("after_commit", "parent"), seen)
			self.assertIn(("before_commit", second.name), seen)
			self.assertIn(("after_commit", second.name), seen)
			self.assertNotIn(("before_commit", first.name), seen)
			self.assertNotIn(("after_commit", first.name), seen)
			self.assertCountEqual(
				[event["message"]["record"] for event in emitted if event["event"] == "workload-fixture"],
				["parent", second.name],
			)
			self.assertEqual(frappe.db.get_value("CRM Deal", first.name, "deal_owner"), self.seller)
			self.assertEqual(frappe.db.get_value("CRM Deal", second.name, "deal_owner"), self.target)
		finally:
			for name, manager in original_managers.items():
				setattr(frappe.db, name, manager)
			if original_log is missing:
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
			else:
				frappe.local._realtime_log = original_log

	def test_user_profile_mask_never_leaks_directory_labels_or_private_fields(self):
		self.deal()
		meta_type = type(frappe.get_meta("User"))
		original = meta_type.get_masked_fields

		def masked(meta, *args, **kwargs):
			return (
				[
					frappe._dict(fieldname="full_name"),
					frappe._dict(fieldname="enabled"),
					frappe._dict(fieldname="user_type"),
				]
				if meta.name == "User"
				else original(meta, *args, **kwargs)
			)

		with patch.object(meta_type, "get_masked_fields", masked):
			result = get_workload(self.filters)
		row = next(row for row in result["agents"] if row["user"] == self.seller)
		self.assertEqual(row["full_name"], self.seller)
		self.assertNotIn("enabled", row)
		self.assertNotIn("user_type", row)
		self.assertEqual(
			next(row for row in result["candidates"] if row["user"] == self.seller)["full_name"], self.seller
		)

	def test_optional_source_outages_do_not_remove_real_core_workload(self):
		from crm.api import workload

		self.deal()
		original_doc, original_exists, original_fields = frappe.get_doc, frappe.db.exists, workload._fields

		def doc(doctype, *args, **kwargs):
			if doctype == "Marketing Settings":
				raise RuntimeError("Synthetic optional source outage")
			return original_doc(doctype, *args, **kwargs)

		def exists(doctype, name=None, *args, **kwargs):
			if doctype == "DocType" and name == "Marketing Settings":
				return True
			return original_exists(doctype, name, *args, **kwargs)

		def fields(doctype, *args, **kwargs):
			if doctype == "Employee":
				raise RuntimeError("Synthetic optional HRMS outage")
			return original_fields(doctype, *args, **kwargs)

		with (
			patch(
				"crm.api.workload.get_installed_apps",
				return_value=["frappe", "crm", "doco_marketing", "hrms"],
			),
			patch("crm.api.workload.frappe.get_doc", side_effect=doc),
			patch("crm.api.workload.frappe.db.exists", side_effect=exists),
			patch("crm.api.workload._fields", side_effect=fields),
		):
			result = get_workload(self.filters)
		self.assertEqual(result["summary"]["open_deals"], 1)
		self.assertEqual(result["capacity"]["marketing"]["state"], "unavailable")
		self.assertTrue(all(row["shift"] == "unknown" for row in result["agents"]))

	def test_optional_database_failures_are_not_reported_as_valid_core_results(self):
		from crm.api.workload import _capacity, _optional_failure, _shifts

		for error in (frappe.QueryDeadlockError, frappe.QueryTimeoutError):
			with self.assertRaises(error):
				_optional_failure(error("Synthetic wrapped database failure"))

		failure = frappe.db.OperationalError(1213, "Synthetic deadlock classification")
		with patch("crm.api.workload.get_installed_apps", side_effect=failure):
			with self.assertRaises(frappe.db.OperationalError):
				_capacity()
			with self.assertRaises(frappe.db.OperationalError):
				_shifts([self.seller])

	def test_native_numeric_task_ids_round_trip_and_malformed_ids_are_rejected(self):
		parent = self.deal(owner=self.target)
		tasks = [self.task(parent), self.task(parent)]
		rows = get_work_items(self.filters, kind="tasks")["items"]
		self.assertEqual({row.name for row in rows}, {str(task.name) for task in tasks})
		self.assertTrue(all(isinstance(row.name, str) for row in rows))
		# The first is the real queue DTO; the second is the native Document's
		# integer identity used by Desk/API callers. Both run the real controller.
		commands = [
			{key: str(rows[0][key]) for key in ("doctype", "name", "modified", "owner")},
			self.command(next(task for task in tasks if str(task.name) != rows[0].name)),
		]
		self.assertIs(type(commands[1]["name"]), int)
		result = reassign_bulk(commands, self.target, self.filters)
		self.assertTrue(all(row["ok"] for row in result["results"]), result)
		self.assertTrue(all(isinstance(row["name"], str) for row in result["results"]))
		for task in tasks:
			self.assertEqual(task.reload().assigned_to, self.target)
		for invalid in (True, 0, -1, 1.5, [], {}):
			with self.subTest(name=invalid), self.assertRaises(frappe.ValidationError):
				reassign_bulk([{**commands[0], "name": invalid}], self.seller, self.filters)


class TestWorkloadShiftEvidence(UnitTestCase):
	"""HRMS read-adapter doubles only; no claim of native HRMS integration."""

	def shift(
		self, now, *, start="09:00:00", end="17:00:00", end_date=None, hidden=False, missing_window=False
	):
		from datetime import datetime

		from crm.api.workload import _shifts

		employee = frappe._dict(name="employee-a", user_id="seller@example.invalid")
		assignment = frappe._dict(
			name="shift-a",
			employee=employee.name,
			shift_type="day",
			start_date="2026-09-24",
			end_date=end_date,
		)
		window = frappe._dict(name="day", start_time=start, end_time=end)

		def read(doctype, **kwargs):
			return {
				"Employee": [employee],
				"Shift Assignment": [assignment],
				"Shift Type": [] if missing_window else [window],
			}[doctype]

		def all_rows(doctype, **kwargs):
			if doctype == "Employee":
				return [employee]
			return (
				[assignment, frappe._dict(name="hidden", employee=employee.name)] if hidden else [assignment]
			)

		with (
			patch("crm.api.workload.get_installed_apps", return_value=["frappe", "crm", "hrms"]),
			patch("crm.api.workload.frappe.has_permission", return_value=True),
			patch("crm.api.workload._fields"),
			patch("crm.api.workload.frappe.get_list", side_effect=read),
			patch("crm.api.workload.frappe.get_all", side_effect=all_rows),
			patch("crm.api.workload.now_datetime", return_value=datetime.fromisoformat(now)),
		):
			return _shifts([employee.user_id])[employee.user_id][0]

	def test_day_shift_positive_and_complete_negative_evidence(self):
		self.assertEqual(self.shift("2026-09-26 12:00:00"), "on_shift")
		self.assertEqual(self.shift("2026-09-26 18:00:00"), "off_shift")

	def test_overnight_shift_uses_assignment_start_day_after_midnight(self):
		self.assertEqual(
			self.shift("2026-09-26 01:00:00", start="22:00:00", end="06:00:00", end_date="2026-09-25"),
			"on_shift",
		)
		self.assertEqual(
			self.shift("2026-09-26 07:00:00", start="22:00:00", end="06:00:00", end_date="2026-09-25"),
			"off_shift",
		)

	def test_hidden_assignment_or_unreadable_window_cannot_prove_off_shift(self):
		self.assertEqual(self.shift("2026-09-26 18:00:00", hidden=True), "unknown")
		self.assertEqual(self.shift("2026-09-26 18:00:00", missing_window=True), "unknown")

	def test_zero_length_window_is_unknown_not_a_fabricated_all_day_shift(self):
		self.assertEqual(self.shift("2026-09-26 12:00:00", start="09:00:00", end="09:00:00"), "unknown")

	def test_optional_hrms_runtime_outage_is_unknown(self):
		from crm.api.workload import _shifts

		with (
			patch("crm.api.workload.get_installed_apps", return_value=["frappe", "crm", "hrms"]),
			patch("crm.api.workload.frappe.has_permission", return_value=True),
			patch("crm.api.workload._fields"),
			patch(
				"crm.api.workload.frappe.get_list", side_effect=RuntimeError("Synthetic HRMS source outage")
			),
		):
			result = _shifts(["seller@example.invalid"])
		self.assertEqual(result["seller@example.invalid"][0], "unknown")
		self.assertIn("unavailable", result["seller@example.invalid"][1])
