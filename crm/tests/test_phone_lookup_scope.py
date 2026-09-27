"""Native phone lookup scope and provider/worker authority boundaries."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.permissions import update_permission_property
from frappe.tests import IntegrationTestCase

from crm.api import whatsapp, whatsapp_routing
from crm.integrations import api


class TestPhoneLookupScope(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.old_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "phone_lookup_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.addCleanup(self.restore)
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(patch.dict(frappe.flags, {"meta_webhook_receipt": None}))
		self.key = uuid4().hex[:10]
		self.actor = f"phone-{self.key}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.actor,
				"first_name": "Phone scope",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert()
		self.number = "+1202555" + str(1000 + int(self.key, 16) % 9000)

	def restore(self):
		frappe.set_user("Administrator")
		try:
			frappe.db.rollback(save_point=self.point)
		finally:
			for doctype in ("Contact", "Contact Phone", "CRM Lead", "CRM Deal", "CRM Contacts"):
				frappe.clear_cache(doctype=doctype)
			frappe.clear_cache(user=self.actor)
			frappe.set_user(self.old_user)

	def contact(self, number=None, secondary=None):
		phones = [{"phone": number or self.number, "is_primary_mobile_no": 1}]
		if secondary:
			phones.append({"phone": secondary})
		return frappe.get_doc(
			{"doctype": "Contact", "first_name": "Scope " + uuid4().hex[:8], "phone_nos": phones}
		).insert()

	def lead(self, owner=None, converted=False):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Phone " + self.key,
				"mobile_no": self.number,
				"lead_owner": owner or self.actor,
			}
		).insert()
		if converted:
			doc.db_set("converted", 1, update_modified=False)
		return doc

	def deal(self, contact, owner):
		return frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"deal_name": "Phone deal " + self.key,
				"deal_owner": owner,
				"contacts": [{"contact": contact.name, "is_primary": 1}],
			}
		).insert()

	def lookup(self):
		frappe.set_user(self.actor)
		return api.get_contact_by_phone_number(self.number)

	def test_guessed_phone_cannot_return_other_owners_lead(self):
		hidden = self.lead(owner="Administrator")
		self.assertNotIn("name", self.lookup())
		self.assertNotIn(hidden.name, frappe.as_json(api.get_contact_by_phone_number(self.number)))
		frappe.set_user("Administrator")
		hidden.lead_owner = self.actor
		hidden.save()
		self.assertEqual(self.lookup()["lead"], hidden.name)

	def test_native_shared_lead_remains_visible(self):
		lead = self.lead(owner="Administrator")
		frappe.share.add("CRM Lead", lead.name, self.actor, read=1)
		self.assertEqual(self.lookup()["lead"], lead.name)

	def test_contact_user_permission_blocks_guessed_identity(self):
		hidden = self.contact()
		visible = self.contact(number="+12025550000")
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.actor,
				"allow": "Contact",
				"for_value": visible.name,
				"apply_to_all_doctypes": 1,
			}
		).insert()
		frappe.clear_cache(user=self.actor)
		frappe.set_user(self.actor)
		self.assertFalse(frappe.has_permission("Contact", "read", hidden.name))
		self.assertNotIn("name", api.get_contact_by_phone_number(self.number))
		self.assertEqual(api.get_contact_by_phone_number("+12025550000")["name"], visible.name)

	def test_visible_contact_does_not_expose_denied_parent(self):
		contact = self.contact()
		deal = self.deal(contact, "Administrator")
		result = self.lookup()
		self.assertEqual(result["name"], contact.name)
		self.assertNotIn("deal", result)
		self.assertEqual(api.get_contact_lead_or_deal_from_number(self.number), (contact.name, "Contact"))
		frappe.set_user("Administrator")
		deal.deal_owner = self.actor
		deal.save()
		self.assertEqual(self.lookup()["deal"], deal.name)

	def test_shared_number_never_selects_first_contact_or_lead(self):
		self.contact()
		self.contact()
		self.assertNotIn("name", self.lookup())
		frappe.set_user("Administrator")
		self.lead()
		self.assertNotIn("name", self.lookup())

	def test_contact_and_lead_same_number_are_not_implicitly_merged(self):
		self.contact()
		self.lead()
		self.assertNotIn("name", self.lookup())

	def test_converted_lead_is_excluded(self):
		self.lead(converted=True)
		self.assertNotIn("name", self.lookup())

	def test_secondary_phone_resolves_without_duplicate_identity(self):
		contact = self.contact(number="+12025550000", secondary=self.number)
		self.assertEqual(self.lookup()["name"], contact.name)

	def test_masked_phone_cannot_be_used_to_infer_identity(self):
		self.lead()
		make_property_setter("CRM Lead", "mobile_no", "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Lead")
		self.assertNotIn("name", self.lookup())

	def test_masked_child_phone_blocks_contact_lookup(self):
		contact = self.contact()
		make_property_setter("Contact Phone", "phone", "mask", 1, "Check")
		frappe.clear_cache(doctype="Contact Phone")
		self.assertNotIn("name", self.lookup())
		frappe.set_user("Administrator")
		update_permission_property("Contact", "Sales User", 0, "mask", 1)
		frappe.clear_cache(doctype="Contact")
		frappe.clear_cache(doctype="Contact Phone")
		self.assertEqual(self.lookup()["name"], contact.name)

	def test_phone_table_requires_native_parent_read_level(self):
		contact = self.contact()
		self.assertEqual(self.lookup()["name"], contact.name)
		frappe.set_user("Administrator")
		make_property_setter("Contact", "phone_nos", "permlevel", 1, "Int")
		frappe.clear_cache(doctype="Contact")
		self.assertNotIn("name", self.lookup())

	def test_masked_contact_display_values_are_not_returned(self):
		contact = self.contact()
		for field in ("full_name", "mobile_no"):
			make_property_setter("Contact", field, "mask", 1, "Check")
		frappe.clear_cache(doctype="Contact")
		result = self.lookup()
		self.assertEqual(result["name"], contact.name)
		self.assertNotIn("full_name", result)
		self.assertNotIn("mobile_no", result)

	def test_whitespace_wildcards_and_partial_numbers_never_scan(self):
		self.contact()
		frappe.set_user(self.actor)
		with patch.object(
			api, "_phone_fields", side_effect=AssertionError("Must reject before database lookup")
		):
			for value in ("", "   ", "%", "_", "555", "202555", "9" * 65):
				self.assertNotIn("name", api.get_contact_by_phone_number(value))

	def test_candidate_overflow_cannot_appear_unique_after_permission_filtering(self):
		self.contact()
		self.contact()
		with patch.object(api, "_PHONE_CANDIDATE_LIMIT", 1):
			self.assertNotIn("name", self.lookup())

	def test_verified_provider_resolver_is_private_and_preserves_ambiguity(self):
		from crm.integrations.exotel import handler as exotel

		contact = self.contact()
		frappe.set_user("Guest")
		self.assertNotIn("name", api.get_contact_by_phone_number(self.number))
		call_log = MagicMock()
		exotel.link(self.number, call_log)
		call_log.link_with_reference_doc.assert_not_called()
		exotel.link(self.number, call_log, phone_lookup=api._get_contact_for_verified_provider)
		call_log.link_with_reference_doc.assert_called_once_with("Contact", contact.name)
		self.assertEqual(api._get_contact_for_verified_provider(self.number)["name"], contact.name)
		self.assertNotIn(api._get_contact_for_verified_provider, frappe.whitelisted)
		frappe.set_user("Administrator")
		self.contact()
		self.assertNotIn("name", api._get_contact_for_verified_provider(self.number))

	def test_provider_verification_failure_precedes_private_lookup(self):
		from crm.integrations.exotel import handler as exotel
		from crm.integrations.twilio import api as twilio

		for provider, endpoint, verify in (
			(twilio, twilio.twilio_incoming_call_handler, "validate_twilio_request"),
			(exotel, exotel.handle_request, "validate_request"),
		):
			with (
				patch.object(provider, verify, side_effect=frappe.PermissionError),
				patch.object(provider, "_get_contact_for_verified_provider") as lookup,
			):
				with self.assertRaises(frappe.PermissionError):
					endpoint()
				lookup.assert_not_called()

	def test_unverified_incoming_auto_attaches_through_system_ladder(self):
		lead = self.lead()
		doc = frappe._dict(type="Incoming", **{"from": self.number}, flags={"meta_webhook_receipt": "fake"})
		with patch.object(whatsapp_routing, "resolve_reference_for_number") as worker_lookup:
			whatsapp.validate(doc, None)
			worker_lookup.assert_not_called()
		self.assertEqual((doc.reference_doctype, doc.reference_name), ("CRM Lead", lead.name))

	def test_incoming_catalog_order_binds_only_through_verified_receipt(self):
		self.lead()
		doc = frappe._dict(type="Incoming", content_type="order", **{"from": self.number})
		with patch.object(whatsapp_routing, "resolve_inbound_reference") as ladder:
			whatsapp.validate(doc, None)
			ladder.assert_not_called()
		self.assertFalse(doc.get("reference_name"))

	def test_preset_reference_requires_actor_scope(self):
		lead = self.lead(owner="Administrator")
		doc = frappe._dict(
			type="Outgoing", to=self.number, reference_doctype="CRM Lead", reference_name=lead.name
		)
		frappe.set_user(self.actor)
		with self.assertRaises(frappe.PermissionError):
			whatsapp.validate(doc, None)
		frappe.set_user("Administrator")
		lead.lead_owner = self.actor
		lead.save()
		frappe.set_user(self.actor)
		whatsapp.validate(doc, None)
		self.assertEqual(doc.reference_name, lead.name)
