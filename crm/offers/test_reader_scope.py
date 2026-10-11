"""The assistant's read-only role and the administrator read every offer; writes follow the deal."""

from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.offers import permissions as offers


class TestOfferReaderScope(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", offers.ASSISTANT_READER_ROLE):
			frappe.get_doc(
				{"doctype": "Role", "role_name": offers.ASSISTANT_READER_ROLE, "desk_access": 0}
			).insert(ignore_permissions=True)
		self.reader = self._user("reader", ["Sales User", offers.ASSISTANT_READER_ROLE])
		self.manager = self._user("manager", ["Sales User", "System Manager"])
		self.rep = self._user("rep", ["Sales User"])
		# No deal: the deal-following rule refuses it for everyone else.
		self.offer = frappe._dict(doctype="CRM Offer", name=f"OFFER-{uuid4().hex[:6]}", deal=None)

	def _user(self, label, roles):
		email = f"offer-{label}-{uuid4().hex[:8]}@example.com"
		user = frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": label, "send_welcome_email": 0}
		)
		user.insert(ignore_permissions=True)
		user.add_roles(*roles)
		return email

	def test_reader_and_administrator_list_and_read_every_offer(self):
		for user in (self.reader, self.manager, "Administrator"):
			with self.subTest(user=user):
				# Evaluated for a user other than the session one, as the assistant does.
				self.assertEqual(offers.get_permission_query_conditions(user), "")
				for ptype in ("read", "select"):
					self.assertTrue(
						frappe.call(offers.has_permission, doc=self.offer, ptype=ptype, user=user)
					)

	def test_reader_never_writes_an_offer_outside_its_deal(self):
		for ptype in ("write", "create", "delete", "share", "submit", "cancel", "amend"):
			with self.subTest(ptype=ptype):
				self.assertFalse(
					frappe.call(offers.has_permission, doc=self.offer, ptype=ptype, user=self.reader)
				)
				self.assertFalse(offers.has_permission(self.offer, ptype, self.reader))

	def test_other_users_keep_following_the_deal(self):
		self.assertEqual(offers.get_permission_query_conditions(self.rep), "1=0")
		self.assertFalse(frappe.call(offers.has_permission, doc=self.offer, ptype="read", user=self.rep))
