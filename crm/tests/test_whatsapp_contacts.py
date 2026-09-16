"""Deal/Lead chat numbers from fictional records; nothing is sent."""

import random
import unittest
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import add_to_date, now_datetime

from crm.api import whatsapp_contacts as contacts


def _phone():
	return "555" + "".join(random.choice("0123456789") for _ in range(7))


class TestWhatsAppContacts(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.point = "wa_contacts_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.enterContext(patch.object(contacts, "_site_region", return_value="MX"))
		from crm.api import outbox_bridge

		self.usable = self.enterContext(patch.object(outbox_bridge, "usable_send_account", return_value=True))

	def tearDown(self):
		frappe.db.rollback(save_point=self.point)

	def deal(self, mobile_no=None):
		name = uuid4().hex
		frappe.get_doc({"doctype": "CRM Deal", "name": name, "mobile_no": mobile_no}).db_insert()
		return name

	def contact(self, deal, *phones, is_primary=1, idx=1):
		name = uuid4().hex
		frappe.get_doc(
			{"doctype": "Contact", "name": name, "full_name": "Fictional " + name[:6], "mobile_no": phones[0]}
		).db_insert()
		for i, phone in enumerate(phones, 1):
			frappe.get_doc(
				{"doctype": "Contact Phone", "name": uuid4().hex, "parent": name, "parenttype": "Contact",
				"parentfield": "phone_nos", "idx": i, "phone": phone, "is_primary_mobile_no": int(i == 1)}
			).db_insert()
		frappe.get_doc(
			{"doctype": "CRM Contacts", "name": uuid4().hex, "parent": deal, "parenttype": "CRM Deal",
			"parentfield": "contacts", "idx": idx, "contact": name, "is_primary": is_primary}
		).db_insert()
		return name

	def message(self, type, peer, hours_ago, account=None):
		field = "from" if type == "Incoming" else "to"
		frappe.get_doc(
			{"doctype": "WhatsApp Message", "name": uuid4().hex, "type": type, field: peer,
			"message": "Fictional", "content_type": "text", "whatsapp_account": account,
			"creation": add_to_date(now_datetime(), hours=-hours_ago)}
		).db_insert()

	def test_each_contact_number_is_a_tab_that_sends_where_the_customer_wrote(self):
		primary, second = _phone(), _phone()
		deal = self.deal()
		contact = self.contact(deal, primary, "+52 1 " + second)
		self.message("Outgoing", "52" + second, hours_ago=30, account="fictional-default")
		self.message("Incoming", "521" + second, hours_ago=2, account="fictional-branch")

		first, other = contacts.list_numbers("CRM Deal", deal)

		self.assertEqual((first["contact"], first["is_primary"], first["peer_key"]), (contact, 1, primary))
		self.assertEqual(first["phone"], "52" + primary)  # completed from the site's country
		self.assertFalse(first["has_whatsapp"])
		self.assertFalse(first["session_open"])
		self.assertEqual((other["is_primary"], other["peer_key"]), (0, second))
		self.assertEqual(other["phone"], "521" + second)
		self.assertEqual(other["whatsapp_account"], "fictional-branch")  # where the customer wrote
		self.assertIsNone(first["whatsapp_account"])
		self.assertEqual(other["whatsapp_state"], "yes")
		self.assertTrue(other["session_open"])

	def test_an_account_this_user_cannot_send_from_is_not_suggested(self):
		number = _phone()
		deal = self.deal(mobile_no=number)
		self.message("Incoming", "521" + number, hours_ago=1, account="fictional-inactive")
		self.usable.return_value = False

		(tab,) = contacts.list_numbers("CRM Deal", deal)

		self.assertIsNone(tab["whatsapp_account"])
		self.assertTrue(tab["session_open"])

	def test_spellings_of_one_phone_are_one_tab_and_outgoing_spelling_is_reused(self):
		number = _phone()
		deal = self.deal()
		self.contact(deal, "521" + number, "+52 " + number)
		self.message("Outgoing", "52" + number, hours_ago=48)

		(tab,) = contacts.list_numbers("CRM Deal", deal)

		self.assertEqual(tab["phone"], "52" + number)
		self.assertTrue(tab["has_whatsapp"])
		self.assertIsNone(tab["last_incoming"])
		self.assertFalse(tab["session_open"])

	def test_deal_without_contacts_uses_its_own_mobile(self):
		number = _phone()
		deal = self.deal(mobile_no=number)

		(tab,) = contacts.list_numbers("CRM Deal", deal)

		self.assertEqual((tab["contact"], tab["phone_display"], tab["peer_key"]), (None, number, number))

	def test_lead_is_a_single_tab_and_empty_records_have_none(self):
		number = _phone()
		lead = uuid4().hex
		frappe.get_doc({"doctype": "CRM Lead", "name": lead, "lead_name": "Fictional lead", "mobile_no": number}).db_insert()

		(tab,) = contacts.list_numbers("CRM Lead", lead)

		self.assertEqual((tab["name"], tab["is_primary"]), ("Fictional lead", 1))
		self.assertEqual(contacts.list_numbers("CRM Deal", self.deal()), [])

	def test_operator_flag_only_says_no_without_an_exchange(self):
		self.assertEqual(contacts._wa_state(0, False), "no")
		self.assertEqual(contacts._wa_state(0, True), "yes")
		self.assertEqual(contacts._wa_state(None, False), "unknown")
