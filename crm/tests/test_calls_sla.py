"""Calls picked up and missed calls returned in time, on a site: the Metas indicators
read the call log per person, and the round's list of missed calls not returned."""

from datetime import timedelta
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, getdate, now_datetime

from crm import calls_sla, metas

SHOP = "6691112233"


class TestCallsSla(IntegrationTestCase):
	def setUp(self):
		self.addCleanup(frappe.db.rollback)
		frappe.set_user("Administrator")
		self.tere = (
			frappe.get_doc(
				{
					"doctype": "User",
					"email": f"tere-{uuid4().hex[:6]}@example.invalid",
					"first_name": "Tere",
					"send_welcome_email": 0,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		self.number = "669" + str(uuid4().int)[:7]

	def _log(self, kind, status, minutes_ago, duration=0, frm=None, to=None, receiver=None, caller=None):
		start = add_to_date(now_datetime(), minutes=-minutes_ago)
		return frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"id": uuid4().hex,
				"type": kind,
				"status": status,
				"start_time": start,
				"end_time": start + timedelta(seconds=duration),
				"duration": duration,
				"from": frm or SHOP,
				"to": to or SHOP,
				"receiver": receiver,
				"caller": caller,
				"telephony_medium": "Manual",
			}
		).insert(ignore_permissions=True)

	def test_pickup_and_returned_calls_per_person(self):
		self._log("Incoming", "Completed", 120, duration=60, frm=self.number, receiver=self.tere)
		self._log("Incoming", "No Answer", 100, frm=self.number, receiver=self.tere)
		self._log("Outgoing", "Completed", 90, duration=30, to=self.number, caller=self.tere)
		since, today = getdate(add_to_date(now_datetime(), hours=-3)), getdate()
		values = {i["key"]: i["values"] for i in metas.indicators() if i["key"].startswith("llamadas.")}
		picked = values["llamadas.contestadas"](since, today)[self.tere]
		self.assertEqual((picked["value"], picked["n"]), (50.0, 2))
		returned = values["llamadas.devueltas_a_tiempo"](since, today)[self.tere]
		self.assertEqual((returned["value"], returned["n"]), (100.0, 1))
		self.assertEqual(values["llamadas.hechas"](since, today)[self.tere]["value"], 1)

	def test_a_missed_call_nobody_returned_is_on_the_round_list(self):
		self._log("Incoming", "No Answer", 90, frm=self.number, receiver=self.tere)
		late = calls_sla.missed_open()
		self.assertIn(self.number[-7:], [calls_sla.digits(r["from"])[-7:] for r in late])
