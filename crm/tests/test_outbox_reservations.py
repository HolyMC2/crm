"""Budget holds of Bot intents that can never be sent (outbox.release_dead_reservations).

Same fixtures as test_outbox (no live requests, no committed fixtures). Only the
`test_outbox_reservation_*` cases are this module's own; run them with --test.
Ledger rows are written the way Doco's bot_budget.reserve writes them (db_insert):
their controllers refuse every other insert.
"""

import json
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import now_datetime

from crm.api import conversations as control
from crm.api import outbox as api
from crm.tests import test_outbox

RESERVATION = "Bot Budget Reservation"
BUCKET = "Bot Budget Bucket"


class TestOutboxReservations(test_outbox.TestOutbox):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Frappe's class setup returns early for a subclass of a class that already ran it, so it
		# never registers its rollback. Without this, the users TestConversations creates stay
		# pending, the next class commits them, and they count against the hourly user throttle.
		cls.addClassCleanup(frappe.db.rollback)

	def setUp(self):
		if self._testMethodName.startswith("test_outbox_reservation_") and (
			"doco" not in frappe.get_installed_apps()
		):
			self.skipTest("The bot budget ledger belongs to Doco")
		super().setUp()

	def intent(
		self, state="Blocked", *, origin="Bot", attempts=1, expired=True, submitted=False, reason=None
	):
		"""An intent frozen as bot_customer.queue_step freezes it, left where the dispatcher left it."""
		name, now = uuid4().hex + uuid4().hex, now_datetime()
		reason = reason or ("conversation_changed" if state == "Cancelled" else "native_run_changed")
		doc = frappe.get_doc(
			{
				"doctype": api.DOCTYPE,
				"name": name,
				"action_key": name,
				"conversation": self.doc.name,
				"conversation_generation": frappe.db.get_value(control.DOCTYPE, self.doc.name, "generation"),
				"provider": self.doc.provider,
				"account_id": self.doc.account_id,
				"peer_id": self.doc.peer_id,
				"actor_user": self.users["one"],
				"origin": origin,
				"purpose": "manual" if origin == "Human" else "automation",
				"run_name": "fixture-run" if origin == "Bot" else None,
				"source_doctype": "Chatflow Run",
				"source_name": "fixture-run",
				"source_action": "reply",
				"payload": api._payload({"type": "text", "text": "Fictional bot reply"}, self.doc),
				"state": state,
				"reason_code": reason,
				"attempts": attempts,
				"expires_at": now + timedelta(days=-1 if expired else 1),
				"submitted_at": now if submitted else None,
				"state_log": api._canonical(
					[
						{"state": "Queued", "at": str(now), "reason": ""},
						{"state": state, "at": str(now), "reason": reason},
					]
				),
			}
		)
		doc.payload_hash = api._fingerprint(doc)
		api._mark(doc).insert(ignore_permissions=True)
		return name

	def reserve(self, intent, *, state="Reserved", units=2):
		"""A ledger row as bot_budget.reserve and bind_outbound leave it, with its one bucket."""
		period, bucket, name = now_datetime().strftime("%Y-%m"), uuid4().hex * 2, uuid4().hex * 2
		frappe.get_doc(
			{
				"doctype": BUCKET,
				"name": bucket,
				"period": period,
				"scope": "site",
				"reserved": units if state == "Reserved" else 0,
				"consumed": units if state == "Consumed" else 0,
			}
		).db_insert()
		frappe.get_doc(
			{
				"doctype": RESERVATION,
				"name": name,
				"principal": "customer:fixture",
				"scope_key": "fixture",
				"request_hash": uuid4().hex,
				"period": period,
				"units": units,
				"state": state,
				"buckets": json.dumps([bucket]),
				"effect_key": api.DOCTYPE + ":" + intent,
			}
		).db_insert()
		return name, bucket

	def held(self, reservation, bucket):
		"""(reservation state, bucket reserved, bucket consumed)."""
		counts = frappe.db.get_value(BUCKET, bucket, ["reserved", "consumed"], as_dict=True)
		return frappe.db.get_value(RESERVATION, reservation, "state"), counts.reserved, counts.consumed

	def sweep(self, failures=0):
		# A failed row's real rollback would also discard this suite's uncommitted fixtures.
		with patch.object(frappe.db, "rollback"), patch.object(frappe, "log_error") as log:
			released = api.release_dead_reservations()
		self.assertEqual(log.call_count, failures)
		return released

	def test_outbox_reservation_expired_block_is_released_once(self):
		name = self.intent()
		hold = self.reserve(name)
		fields = ["state", "attempts", "reason_code", "state_log", "modified"]
		before = frappe.db.get_value(api.DOCTYPE, name, fields, as_dict=True)
		self.assertEqual(self.sweep(), 1)
		self.assertEqual(self.held(*hold), ("Released", 0, 0))
		# Only budget is freed: the intent row itself is never written.
		self.assertEqual(frappe.db.get_value(api.DOCTYPE, name, fields, as_dict=True), before)
		self.assertEqual(self.sweep(), 0)

	def test_outbox_reservation_retryable_block_keeps_its_hold(self):
		name = self.intent(expired=False, attempts=api.MAX_ATTEMPTS - 1)
		hold = self.reserve(name)
		# A retry can still queue it, and the claim then consumes this same hold.
		self.assertTrue(api._projection(api._load(name))["can_retry"])
		self.assertEqual(self.sweep(), 0)
		self.assertEqual(self.held(*hold), ("Reserved", 2, 0))

	def test_outbox_reservation_exhausted_attempts_release_before_expiry(self):
		name = self.intent(expired=False, attempts=api.MAX_ATTEMPTS, reason="attempts_exhausted")
		hold = self.reserve(name)
		self.assertFalse(api._projection(api._load(name))["can_retry"])
		self.assertEqual(self.sweep(), 1)
		self.assertEqual(self.held(*hold), ("Released", 0, 0))

	def test_outbox_reservation_minute_sweep_releases_a_missed_cancellation(self):
		# release_cancelled settles on the Cancelled transition; this hold missed it.
		hold = self.reserve(self.intent("Cancelled", expired=False))
		with (
			patch.object(api, "_enqueue"),
			patch.object(frappe.db, "rollback"),
			patch.object(frappe, "log_error") as log,
		):
			api.recover_intents()
		log.assert_not_called()
		self.assertEqual(self.held(*hold), ("Released", 0, 0))

	def test_outbox_reservation_submitted_intent_is_never_released(self):
		# Submitting is the irreversible boundary: the provider may have the message.
		hold = self.reserve(self.intent(submitted=True))
		self.assertEqual(self.sweep(), 0)
		self.assertEqual(self.held(*hold), ("Reserved", 2, 0))

	def test_outbox_reservation_consumed_hold_is_left_alone(self):
		name = self.intent()
		hold = self.reserve(name, state="Consumed")
		self.assertIsNone(api._dead_reservation(api._load(name)))
		self.assertEqual(self.sweep(), 0)
		self.assertEqual(self.held(*hold), ("Consumed", 0, 2))

	def test_outbox_reservation_people_and_notices_are_not_bot_budget(self):
		holds = [self.reserve(self.intent(origin=origin)) for origin in ("Human", "Automation")]
		self.assertEqual(self.sweep(), 0)
		for hold in holds:
			self.assertEqual(self.held(*hold), ("Reserved", 2, 0))

	def test_outbox_reservation_bot_intent_without_hold_is_not_counted(self):
		name = self.intent()
		self.assertIsNone(api._dead_reservation(api._load(name)))
		hold = self.reserve(self.intent())
		self.assertEqual(self.sweep(), 1)
		self.assertEqual(self.held(*hold), ("Released", 0, 0))

	def test_outbox_reservation_retry_refuses_the_expired_intent_first(self):
		name = self.intent()
		hold = self.reserve(name)
		self.assertEqual(api._eligibility(api._load(name)), "reply_expired")
		with self.assertRaises(frappe.ValidationError) as refused:
			api.retry_intent(name)
		self.assertIs(type(refused.exception), frappe.ValidationError)
		self.assertEqual((api._load(name).state, self.held(*hold)), ("Blocked", ("Reserved", 2, 0)))
		self.assertEqual(self.sweep(), 1)
		self.assertEqual(self.held(*hold), ("Released", 0, 0))

	def test_outbox_reservation_one_failed_release_does_not_stop_the_rest(self):
		from doco.docoutils.assistant import bot_budget

		failing, released = self.reserve(self.intent()), self.reserve(self.intent())
		settle = bot_budget.settle

		def flaky(name, **kwargs):
			if name == failing[0]:
				raise frappe.QueryDeadlockError("Fixture deadlock")
			return settle(name, **kwargs)

		with patch.object(bot_budget, "settle", side_effect=flaky):
			self.assertEqual(self.sweep(failures=1), 1)
		self.assertEqual(self.held(*failing), ("Reserved", 2, 0))
		self.assertEqual(self.held(*released), ("Released", 0, 0))

	def test_outbox_reservation_locked_rows_decide_not_the_candidate_query(self):
		name = self.intent()
		reservation, bucket = self.reserve(name)
		self.assertEqual(api._dead_reservation(api._load(name)), reservation)
		for field, value in (
			("origin", "Human"),
			("submitted_at", now_datetime()),
			("state", "Failed"),
			("expires_at", now_datetime() + timedelta(days=1)),
		):
			doc = api._load(name)
			doc.set(field, value)
			self.assertIsNone(api._dead_reservation(doc), field)
		load = api._load

		def settled_meanwhile(intent):
			# A cancellation or another sweep settled the hold after the candidate query.
			frappe.db.set_value(RESERVATION, reservation, "state", "Released")
			return load(intent)

		with patch.object(api, "_load", side_effect=settled_meanwhile):
			self.assertEqual(self.sweep(), 0)
		# Never settled twice: this sweep left the bucket alone.
		self.assertEqual(self.held(reservation, bucket), ("Released", 2, 0))
