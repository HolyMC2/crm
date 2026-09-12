# Copyright (c) 2026, Marco and contributors
# For license information, please see license.txt

"""G7 — retention for Failed Lead Sync Log.

Run:
  bench --site <site> run-tests --app crm --module crm.tests.test_lead_sync_log_retention
"""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

DOCTYPE = "Failed Lead Sync Log"
TABLE = "tabFailed Lead Sync Log"
DEFAULT_DAYS = 30
# Every fixture row carries this prefix so the assertions can ignore whatever
# real rows the site already holds — clear_old_logs deletes by age, not by
# ownership, so it will (correctly) take the site's old rows too.
PREFIX = "g7ret-flsl-"


class TestFailedLeadSyncLogRetention(IntegrationTestCase):
	"""G7 retention for Failed Lead Sync Log.

	Rows hold the ad platform's raw lead payload (name, phone, email)
	plus a traceback, and their only action is retry_sync — which is
	worthless weeks later. Thirty days is the shortest window in the
	registry for exactly that reason.

	IntegrationTestCase rolls each test back. `clear_old_logs` commits by
	design (a long backlog must not sit in one transaction), so every call
	goes through `_clear`, which patches frappe.db.commit to a no-op —
	otherwise the test would permanently delete this site's real rows.

	Fixtures are inserted with raw SQL: the subject here is the purge, not
	the controller's insert-time validation, and a raw row keeps the test
	free of Failed Lead Sync Log's link fixtures.
	"""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self._wipe()

	def tearDown(self):
		self._wipe()
		super().tearDown()

	# ── helpers ──────────────────────────────────────────────────────────

	def _wipe(self):
		frappe.db.sql(f"DELETE FROM `{TABLE}` WHERE name LIKE %s", (PREFIX + "%",))

	def _row(self, suffix, age_days):
		name = PREFIX + suffix
		frappe.db.sql(
			f"""INSERT INTO `{TABLE}`
			    (name, creation, modified, owner, modified_by, docstatus)
			    VALUES (%s, DATE_SUB(NOW(), INTERVAL %s DAY), NOW(),
			            'Administrator', 'Administrator', 0)""",
			(name, age_days),
		)
		return name

	def _surviving(self):
		return {
			r[0] for r in frappe.db.sql(f"SELECT name FROM `{TABLE}` WHERE name LIKE %s", (PREFIX + "%",))
		}

	def _controller(self):
		from frappe.model.base_document import get_controller

		return get_controller(DOCTYPE)

	def _clear(self, days=None):
		with patch.object(frappe.db, "commit"):
			if days is None:
				self._controller().clear_old_logs()
			else:
				self._controller().clear_old_logs(days)

	def _clear_count(self, days=None):
		"""_clear, but hand back what clear_old_logs returned."""
		with patch.object(frappe.db, "commit"):
			if days is None:
				return self._controller().clear_old_logs()
			return self._controller().clear_old_logs(days)

	# ── tests ────────────────────────────────────────────────────────────

	def test_log_settings_accepts_this_doctype(self):
		"""The contract that actually matters. Log Settings validates every
		logs_to_clear row against its LogType protocol and SILENTLY DELETES
		the ones that fail, so a boat LOG_RETENTION entry for a doctype that
		fails this check registers nothing and sweeps nothing."""
		from frappe.core.doctype.log_settings.log_settings import _supports_log_clearing

		# @site_cache memoises per process; a stale False would make this pass
		# or fail for the wrong reason.
		_supports_log_clearing.clear_cache()
		self.assertTrue(
			_supports_log_clearing(DOCTYPE),
			f"{DOCTYPE} has no clear_old_logs staticmethod — Log Settings will drop it",
		)

	def test_rows_past_the_window_go_and_recent_rows_stay(self):
		old = self._row("old", DEFAULT_DAYS + 40)
		edge = self._row("edge", DEFAULT_DAYS + 1)
		fresh = self._row("fresh", 1)
		inside = self._row("inside", max(DEFAULT_DAYS - 10, 1))
		self.assertEqual(self._surviving(), {old, edge, fresh, inside})
		self._clear(DEFAULT_DAYS)
		self.assertEqual(self._surviving(), {fresh, inside})

	def test_default_window_is_used_when_days_is_unset(self):
		old = self._row("old", DEFAULT_DAYS + 40)
		fresh = self._row("fresh", 1)
		self._clear()
		self.assertEqual(self._surviving(), {fresh})
		self.assertFalse(frappe.db.exists(DOCTYPE, old))

	def test_zero_or_negative_days_disables_the_purge(self):
		old = self._row("old", DEFAULT_DAYS + 400)
		fresh = self._row("fresh", 1)
		self._clear(0)
		self.assertEqual(self._surviving(), {old, fresh})
		self._clear(-7)
		self.assertEqual(self._surviving(), {old, fresh})

	def test_second_run_is_idempotent(self):
		self._row("old", DEFAULT_DAYS + 40)
		fresh = self._row("fresh", 1)
		self._clear(DEFAULT_DAYS)
		self.assertEqual(self._surviving(), {fresh})
		self._clear(DEFAULT_DAYS)
		self.assertEqual(self._surviving(), {fresh})

	def test_nothing_eligible_removes_nothing(self):
		fresh = {self._row("a", 1), self._row("b", 3)}
		self._clear(DEFAULT_DAYS)
		self.assertEqual(self._surviving(), fresh)

	def test_batching_clears_more_rows_than_one_batch(self):
		"""The loop must keep going past DELETE_BATCH. Asserting it with
		5000 fixture rows would be slow, so the batch size is lowered for
		the duration of the call — the loop is what is under test."""
		module = __import__(self._controller().__module__, fromlist=["x"])
		names = {self._row(f"bulk{i}", DEFAULT_DAYS + 30) for i in range(7)}
		fresh = self._row("fresh", 1)
		with patch.object(module, "DELETE_BATCH", 3):
			self._clear(DEFAULT_DAYS)
		self.assertEqual(self._surviving(), {fresh})
		for name in names:
			self.assertFalse(frappe.db.exists(DOCTYPE, name))

	def test_the_purge_returns_its_count_as_data(self):
		"""A purge summary must be reachable without scraping stdout, because
		the obvious alternative does not work: `frappe.logger(...).info(...)`
		writes NOTHING on the lab, on cell-0 or on the boat site (frappe's
		default level is WARNING only when _dev_server is set, ERROR
		otherwise, and DEV_SERVER is unset), and frappe caches one
		logger+handler per (module, site). frappe's clear_logs() ignores this
		return value; a manual bench call and these tests do not."""
		self.assertEqual(self._clear_count(DEFAULT_DAYS), 0)
		self._row("old_a", DEFAULT_DAYS + 40)
		self._row("old_b", DEFAULT_DAYS + 41)
		self._row("fresh", 1)
		self.assertEqual(self._clear_count(DEFAULT_DAYS), 2)
		self.assertEqual(self._clear_count(DEFAULT_DAYS), 0, "idempotent")
		self.assertEqual(self._clear_count(0), 0, "disabled returns 0, not None")
