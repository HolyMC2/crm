"""A transcript's producer parks its send until its own window opens (Cobranza's
reminder hours) instead of refusing it.

Fictional accounts, users and rows; no request leaves the process and nothing
is committed (inherits the outbox suite's guards).
"""

from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.utils import get_datetime, now_datetime

from crm.api import outbox as api
from crm.tests import test_outbox_bridge

DEFER = {}


def defer_transcript(intent):
	"""A producer whose sending hours are over answers with the next opening."""
	return DEFER.get("until")


def defer_breaks(intent):
	raise RuntimeError("fictional producer outage")


class TestOutboxDefer(test_outbox_bridge.TestOutboxBridge):
	@contextmanager
	def producer(self, until=None, hook="crm.tests.test_outbox_defer.defer_transcript"):
		DEFER["until"] = until
		hooks = frappe.get_hooks

		def get_hooks(name=None, *args, **kwargs):
			if name == "crm_transcript_dispatch_defer":
				return [hook]
			return hooks(name, *args, **kwargs)

		with patch.object(frappe, "get_hooks", side_effect=get_hooks):
			yield

	def transcript_intent(self):
		with self.person():
			row = self.row()
		frappe.set_user("Administrator")
		return self.intent_for(row)

	def test_outbox_defer_parks_the_intent_without_spending_an_attempt(self):
		name = self.transcript_intent()
		until = now_datetime().replace(microsecond=0) + timedelta(hours=2)
		with self.producer(until):
			doc, send = self.dispatch(name)
		send.assert_not_called()
		self.assertEqual(
			(doc.state, doc.reason_code, doc.attempts), ("Deferred", "producer_window_closed", 0)
		)
		self.assertEqual(get_datetime(doc.next_attempt_at), until)
		frappe.db.set_value(api.DOCTYPE, name, "next_attempt_at", now_datetime() - timedelta(minutes=1))
		with self.producer(None):
			doc, send = self.dispatch(name)
		send.assert_called_once()
		self.assertEqual((doc.state, doc.attempts), ("Accepted", 1))

	def test_outbox_defer_past_expiry_blocks_as_expired(self):
		name = self.transcript_intent()
		expires = get_datetime(api._load(name).expires_at)
		with self.producer(expires + timedelta(hours=1)):
			doc, send = self.dispatch(name)
		send.assert_not_called()
		self.assertEqual((doc.state, doc.reason_code, doc.attempts), ("Blocked", "reply_expired", 0))

	def test_outbox_defer_hook_failure_does_not_park(self):
		name = self.transcript_intent()
		with self.producer(hook="crm.tests.test_outbox_defer.defer_breaks"):
			doc, send = self.dispatch(name)
		send.assert_called_once()
		self.assertEqual((doc.state, doc.attempts), ("Accepted", 1))
		self.assertTrue(frappe.db.exists("Error Log", {"method": "CRM transcript dispatch defer failed"}))

	def test_outbox_recover_dispatches_a_due_deferred_intent(self):
		name = self.transcript_intent()
		frappe.db.set_value(
			api.DOCTYPE,
			name,
			{"state": "Deferred", "next_attempt_at": now_datetime() + timedelta(hours=1)},
		)
		with patch.object(api, "_enqueue") as enqueue:
			api.recover_intents()
		self.assertNotIn(name, enqueue.call_args.args[0])
		frappe.db.set_value(api.DOCTYPE, name, "next_attempt_at", now_datetime() - timedelta(minutes=1))
		with patch.object(api, "_enqueue") as enqueue:
			api.recover_intents()
		self.assertIn(name, enqueue.call_args.args[0])
