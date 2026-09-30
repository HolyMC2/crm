"""CRM realtime publishers reach only the users who act on the event, never the site room."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api.event import _send_system_notification
from crm.fcrm.doctype.erpnext_crm_settings.erpnext_crm_settings import publish_customer_created
from crm.integrations.exotel.handler import publish_exotel_call

AGENT = "rt-scope-agent@example.com"
CALLER = "rt-scope-caller@example.com"
DIALED = "rt-scope-dialed@example.com"
BYSTANDER = "rt-scope-bystander@example.com"
DISABLED = "rt-scope-disabled@example.com"


class Recorder:
	"""Stands in for frappe.publish_realtime and records every call."""

	def __init__(self):
		self.calls = []

	def __call__(self, event, message=None, room=None, user=None, after_commit=False, **kwargs):
		self.calls.append(
			frappe._dict(event=event, message=message, room=room, user=user, after_commit=after_commit)
		)

	@property
	def users(self):
		return [call.user for call in self.calls]


def _ensure_user(email, enabled=1):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"enabled": enabled,
			}
		).insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "enabled", enabled)


class TestRealtimeScope(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email in (AGENT, CALLER, DIALED, BYSTANDER):
			_ensure_user(email)
		_ensure_user(DISABLED, enabled=0)

	def assertScoped(self, recorder, event):
		for call in recorder.calls:
			self.assertEqual(call.event, event)
			self.assertTrue(call.user, "published without a user scope")
			self.assertEqual(call.room, f"user:{call.user}")
			self.assertNotIn(call.room, (None, "", "all"))
		self.assertNotIn(BYSTANDER, recorder.users)

	# exotel_call

	def test_exotel_call_reaches_only_the_handling_agents(self):
		call_sid = "rt-scope-call-0001"
		frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"id": call_sid,
				"type": "Outgoing",
				"status": "Ringing",
				"from": "5200000001",
				"to": "5200000002",
				"telephony_medium": "Exotel",
				"caller": CALLER,
			}
		).insert(ignore_permissions=True)
		if not frappe.db.exists("CRM Telephony Agent", DIALED):
			frappe.get_doc(
				{"doctype": "CRM Telephony Agent", "user": DIALED, "mobile_no": "5200000999"}
			).insert(ignore_permissions=True)
		else:
			frappe.db.set_value("CRM Telephony Agent", DIALED, "mobile_no", "5200000999")

		payload = {
			"CallSid": call_sid,
			"AgentEmail": AGENT,
			"DialWhomNumber": "5200000999",
			"CallFrom": "5200000001",
			"Status": "ringing",
		}
		recorder = Recorder()
		sent = publish_exotel_call(payload, publish=recorder)

		self.assertEqual(sorted(sent), sorted([AGENT, CALLER, DIALED]))
		self.assertEqual(sorted(recorder.users), sorted([AGENT, CALLER, DIALED]))
		self.assertScoped(recorder, "exotel_call")
		self.assertTrue(all(call.message == payload for call in recorder.calls))

	def test_exotel_call_without_a_resolvable_agent_publishes_nothing(self):
		recorder = Recorder()
		payload = {
			"CallSid": "rt-scope-no-such-call",
			"AgentEmail": "nobody-rt-scope@example.com",
			"DialWhomNumber": "5200000404",
			"Status": "ringing",
		}
		self.assertEqual(publish_exotel_call(payload, publish=recorder), [])
		self.assertEqual(publish_exotel_call({"AgentEmail": DISABLED}, publish=recorder), [])
		self.assertEqual(publish_exotel_call({}, publish=recorder), [])
		self.assertEqual(recorder.calls, [])

	# event_notification

	def test_event_notification_reaches_owner_and_user_participants(self):
		notification = {
			"event_name": "rt-scope-event",
			"subject": "Fictional reminder",
			"owner": AGENT,
			"event_participants": [CALLER, "outside-guest@example.org", DISABLED],
		}
		recorder = Recorder()
		sent = _send_system_notification(notification, publish=recorder)

		self.assertEqual(sent, [AGENT, CALLER])
		self.assertEqual(recorder.users, [AGENT, CALLER])
		self.assertScoped(recorder, "event_notification")
		self.assertTrue(all(call.message is notification for call in recorder.calls))

	def test_event_notification_without_user_recipients_publishes_nothing(self):
		recorder = Recorder()
		for notification in (
			{"event_name": "rt-scope-event", "owner": None, "event_participants": []},
			{"event_name": "rt-scope-event", "owner": "Guest", "event_participants": ["x@example.org"]},
			{"event_name": "rt-scope-event", "owner": DISABLED},
		):
			self.assertEqual(_send_system_notification(notification, publish=recorder), [])
		self.assertEqual(recorder.calls, [])

	# crm_customer_created

	def test_customer_created_reaches_the_acting_user_after_commit(self):
		recorder = Recorder()
		sent = publish_customer_created(
			"CRM-DEAL-RT-0001", "Fictional Customer", user=AGENT, publish=recorder
		)

		self.assertEqual(sent, [AGENT])
		self.assertEqual(recorder.users, [AGENT])
		self.assertScoped(recorder, "crm_customer_created")
		self.assertTrue(recorder.calls[0].after_commit)
		self.assertEqual(
			recorder.calls[0].message, {"crm_deal": "CRM-DEAL-RT-0001", "customer": "Fictional Customer"}
		)

	def test_customer_created_defaults_to_the_session_user(self):
		recorder = Recorder()
		previous = frappe.session.user
		frappe.set_user(CALLER)
		try:
			sent = publish_customer_created("CRM-DEAL-RT-0002", "Fictional Customer", publish=recorder)
		finally:
			frappe.set_user(previous)
		self.assertEqual(sent, [CALLER])
		self.assertScoped(recorder, "crm_customer_created")

	def test_customer_created_without_an_acting_user_publishes_nothing(self):
		recorder = Recorder()
		for user in ("Guest", DISABLED, "nobody-rt-scope@example.com"):
			self.assertEqual(
				publish_customer_created(
					"CRM-DEAL-RT-0003", "Fictional Customer", user=user, publish=recorder
				),
				[],
			)
		self.assertEqual(recorder.calls, [])
