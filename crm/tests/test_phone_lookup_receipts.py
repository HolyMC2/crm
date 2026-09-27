"""Native verified receipt attribution; full WhatsApp graph, separate from standalone lookup."""

import unittest

import frappe

from crm.api import conversations as control
from crm.api.whatsapp import validate
from crm.api.whatsapp_routing import verified_receipt_reference
from crm.tests import test_conversation_activity as fixtures


class TestPhoneLookupReceipts(unittest.TestCase):
	# Reuse actual receipt/claim fixtures without inheriting and re-running unrelated tests.
	seed = fixtures.TestConversationActivitySql.seed
	receipt = fixtures.TestConversationActivitySql.receipt
	context = fixtures.TestConversationActivitySql.context
	apply = fixtures.TestConversationActivitySql.apply

	def setUp(self):
		create_conversation = control.get_or_create
		self.create_conversation = create_conversation
		fixtures.TestConversationActivitySql.setUp(self)
		self.lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Receipt reference", "lead_owner": "Administrator"}
		).insert()
		# Known reference is set through the normal finite broker at creation.
		# The shared fixture subsequently forbids lookup-created identities at runtime.
		self.peer = str(int(self.peer) + 1)
		self.doc = create_conversation(
			"WhatsApp",
			self.account_id,
			self.peer,
			reference_doctype="CRM Lead",
			reference_name=self.lead.name,
		)
		self.seed("Human")

	def message(self, receipt):
		return frappe._dict(
			type="Incoming",
			whatsapp_account=self.account.name,
			message_id=receipt.event_id,
			**{"from": self.peer},
		)

	def scoped_conversation(self):
		"""Bind through the same physical account field used by the normal broker."""
		self.assertTrue(self.account.meta.has_field("doco_shop"))
		shop = frappe.get_doc(
			{"doctype": "Social Shop", "shop_name": "Receipt scope " + self.account_id, "enabled": 1}
		).insert()
		self.account.doco_shop = shop.name
		self.account.save()
		self.peer = str(int(self.peer) + 1)
		self.doc = self.create_conversation(
			"WhatsApp",
			self.account_id,
			self.peer,
			reference_doctype="CRM Lead",
			reference_name=self.lead.name,
		)
		self.assertEqual(self.doc.shop_key, shop.name)
		self.seed("Human")
		return shop

	def test_scoped_account_receipt_preserves_explicit_reference(self):
		self.scoped_conversation()
		receipt = self.receipt()
		frappe.set_user("Guest")
		with self.context(receipt):
			self.apply(receipt)
			message = self.message(receipt)
			validate(message, None)
			self.assertEqual(
				(message.reference_name, message.reference_doctype), (self.lead.name, "CRM Lead")
			)

	def test_changed_account_shop_cannot_reuse_prior_scoped_receipt(self):
		self.scoped_conversation()
		receipt = self.receipt()
		with self.context(receipt):
			self.apply(receipt)
			self.assertEqual(verified_receipt_reference(self.message(receipt)), (self.lead.name, "CRM Lead"))
			other = frappe.get_doc(
				{
					"doctype": "Social Shop",
					"shop_name": "Other receipt scope " + self.account_id,
					"enabled": 1,
				}
			).insert()
			self.account.doco_shop = other.name
			self.account.save()
			self.assertEqual(verified_receipt_reference(self.message(receipt)), (None, None))

	def test_verified_native_receipt_preserves_only_scoped_conversation_reference(self):
		receipt = self.receipt()
		frappe.set_user("Guest")
		with self.context(receipt):
			self.apply(receipt)
			message = self.message(receipt)
			validate(message, None)
			self.assertEqual(
				(message.reference_name, message.reference_doctype), (self.lead.name, "CRM Lead")
			)

	def test_claim_without_applied_control_event_does_not_attribute(self):
		receipt = self.receipt()
		with self.context(receipt):
			self.assertEqual(verified_receipt_reference(self.message(receipt)), (None, None))

	def test_other_message_peer_and_account_cannot_reuse_receipt(self):
		receipt = self.receipt()
		with self.context(receipt):
			self.apply(receipt)
			for field, value in (
				("message_id", "wamid.other"),
				("from", "521111111111"),
				("whatsapp_account", "nonexistent-account"),
			):
				message = self.message(receipt)
				message[field] = value
				self.assertEqual(verified_receipt_reference(message), (None, None))

	def test_expired_claim_cannot_reuse_previously_applied_event(self):
		from frappe.utils import add_to_date, now_datetime

		receipt = self.receipt()
		with self.context(receipt):
			self.apply(receipt)
			frappe.db.set_value(
				"Meta Webhook Receipt",
				receipt.name,
				"lease_until",
				add_to_date(now_datetime(), minutes=-1),
				update_modified=False,
			)
			self.assertEqual(verified_receipt_reference(self.message(receipt)), (None, None))
