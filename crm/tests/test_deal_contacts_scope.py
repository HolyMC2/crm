"""Native Deal relationships cannot lend their authority to Contact data.

Uses owning controllers, real User Permissions and Property Setters. Only
notification/transport effects are suppressed; no authority or query doubles.
"""

from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.model import get_permitted_fields
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.fcrm.doctype.crm_deal.api import get_deal_contacts
from crm.tests.test_offers import OfferFixture


class TestDealContactsScope(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "deal_contacts_" + frappe.generate_hash(length=8)
		frappe.db.savepoint(self.point)
		self.callbacks = {
			name: getattr(frappe.db, name)
			for name in ("before_commit", "after_commit", "before_rollback", "after_rollback")
		}
		self.had_realtime = hasattr(frappe.local, "_realtime_log")
		self.realtime = getattr(frappe.local, "_realtime_log", None)
		for name in self.callbacks:
			setattr(frappe.db, name, CallbackManager())
		if self.had_realtime:
			del frappe.local._realtime_log
		self.addCleanup(self.restore_fixture)
		for method in ("enqueue", "sendmail", "publish_realtime"):
			self.enterContext(patch("frappe." + method))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No transport"))
		)
		self.make_fixture()
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		self.manager = f"contact-manager-{self.key}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.manager,
				"first_name": "Contact manager",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales Manager"}],
			}
		).insert()
		self.contacts = [self.make_contact(index) for index in range(2)]
		for index, contact in enumerate(self.contacts):
			self.attach(self.deal, contact, is_primary=int(index == 0))
		self.deal.save()
		self.deal.reload()
		self.assertEqual([row.is_primary for row in self.deal.contacts], [1, 0])
		# These independently stored copies must never reconstruct denied target
		# values or a withheld relationship primary marker.
		self.assertEqual(self.deal.contacts[0].email, self.contacts[0].email_id)
		self.assertEqual(self.deal.email, self.contacts[0].email_id)
		self.before = self.stored_values()

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
				for doctype in ("CRM Deal", "CRM Contacts", "Contact", "User"):
					frappe.clear_cache(doctype=doctype)
					frappe.cache.delete_keys(f"masked_fields::{doctype}::*")
				for user in (getattr(self, "user", None), getattr(self, "manager", None)):
					if user:
						frappe.clear_cache(user=user)
				frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime:
					frappe.local._realtime_log = self.realtime
				frappe.set_user(self.previous_user)

	def make_contact(self, index):
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": f"Private contact {self.key} {index}",
				"image": f"/files/private-contact-{self.key}-{index}.png",
				"email_ids": [{"email_id": f"person-{self.key}-{index}@example.invalid", "is_primary": 1}],
				"phone_nos": [
					{"phone": f"+1202555{index:04}", "is_primary_mobile_no": 1, "is_primary_phone": 1}
				],
			}
		).insert(set_name=f"contact-scope-{self.key}-{index}")
		contact.reload()
		self.assertTrue(contact.full_name)
		self.assertTrue(contact.email_id)
		self.assertTrue(contact.mobile_no)
		return contact

	def attach(self, deal, contact, *, is_primary=0):
		deal.append(
			"contacts",
			{
				"contact": contact.name,
				"full_name": contact.full_name,
				"email": contact.email_id,
				"mobile_no": contact.mobile_no,
				"is_primary": is_primary,
			},
		)

	def stored_values(self):
		return {
			"contacts": frappe.get_all(
				"Contact",
				filters={"name": ["in", [contact.name for contact in self.contacts]]},
				fields=["name", "full_name", "image", "email_id", "mobile_no", "modified"],
				order_by="name",
			),
			"relationships": frappe.get_all(
				"CRM Contacts",
				filters={"parenttype": "CRM Deal", "parent": self.deal.name, "parentfield": "contacts"},
				fields=["name", "contact", "full_name", "email", "mobile_no", "is_primary", "modified"],
				order_by="idx",
			),
		}

	def read(self, user=None):
		frappe.set_user(user or self.user)
		frappe.db.value_cache.clear()
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		self.assertEqual(
			frappe.get_list("CRM Deal", filters={"name": self.deal.name}, pluck="name"), [self.deal.name]
		)
		result = get_deal_contacts(self.deal.name)
		self.assertEqual(frappe.session.user, user or self.user)
		self.assertEqual(self.stored_values(), self.before, "Reading must not rewrite stored identities")
		return result

	def expected(self):
		return [
			{
				"name": contact.name,
				"image": contact.image,
				"full_name": contact.full_name,
				"email": contact.email_id,
				"mobile_no": contact.mobile_no,
				"is_primary": int(index == 0),
			}
			for index, contact in enumerate(self.contacts)
		]

	def protect(self, doctype, field, prop, value):
		frappe.set_user("Administrator")
		make_property_setter(
			doctype, field, prop, value, {"mask": "Check", "permlevel": "Int", "fieldtype": "Data"}[prop]
		)
		frappe.clear_cache(doctype=doctype)
		frappe.cache.delete_keys(f"masked_fields::{doctype}::*")
		meta = frappe.get_meta(doctype, cached=False)
		self.assertEqual(str(meta.get_field(field).get(prop)), str(value))

	def restrict(self, doctype, allowed, user=None):
		frappe.set_user("Administrator")
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": user or self.user,
				"allow": doctype,
				"for_value": allowed,
				"apply_to_all_doctypes": 0,
				"applicable_for": doctype,
			}
		).insert()
		frappe.clear_cache(user=user or self.user)
		frappe.set_user(user or self.user)

	def test_owner_keeps_readable_contact_values_and_primary_marker(self):
		self.assertEqual(self.read(), self.expected())

	def test_sales_manager_keeps_readable_contact_values(self):
		self.assertEqual(self.read(self.manager), self.expected())

	def test_denied_deal_cannot_expose_contact_identity_or_count(self):
		# The owner's Deal is automatically shared by its normal controller.
		# Restrict the unshared Administrator-owned record instead of pretending
		# a User Permission revokes an existing native share.
		self.attach(self.other, self.contacts[0], is_primary=1)
		self.other.save()
		self.restrict("CRM Deal", self.deal.name)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name))
		self.assertEqual(frappe.get_list("CRM Deal", filters={"name": self.other.name}), [])
		with self.assertRaises(frappe.PermissionError):
			get_deal_contacts(self.other.name)

	def test_readable_deal_does_not_admit_out_of_scope_contact(self):
		self.restrict("Contact", self.contacts[0].name)
		denied = self.contacts[1]
		self.assertFalse(frappe.has_permission("Contact", "read", denied.name))
		self.assertEqual(frappe.get_list("Contact", filters={"name": denied.name}), [])
		result = self.read()
		self.assertEqual(result, self.expected()[:1])
		for value in (denied.name, denied.full_name, denied.email_id, denied.mobile_no, denied.image):
			self.assertNotIn(value, frappe.as_json(result))

	def test_no_readable_contacts_means_empty_result_without_hidden_count(self):
		allowed_elsewhere = self.make_contact(9)
		self.restrict("Contact", allowed_elsewhere.name)
		for contact in self.contacts:
			self.assertFalse(frappe.has_permission("Contact", "read", contact.name))
		self.assertEqual(
			frappe.get_list("Contact", filters={"name": ["in", [c.name for c in self.contacts]]}), []
		)
		self.assertEqual(self.read(), [])

	def test_masked_relationship_table_hides_all_rows(self):
		self.assertEqual(self.read(), self.expected())
		self.protect("CRM Deal", "contacts", "mask", 1)
		self.assertEqual(self.read(), [])

	def test_relationship_table_permlevel_hides_all_rows(self):
		self.protect("CRM Deal", "contacts", "permlevel", 9)
		self.assertEqual(self.read(), [])

	def test_masked_child_contact_link_hides_identity_and_count(self):
		self.protect("CRM Contacts", "contact", "mask", 1)
		self.assertEqual(self.read(), [])

	def test_child_contact_link_permlevel_hides_identity_and_count(self):
		self.protect("CRM Contacts", "contact", "permlevel", 9)
		self.assertEqual(self.read(), [])

	def test_masked_primary_marker_is_not_reconstructed_from_deal(self):
		self.protect("CRM Contacts", "is_primary", "mask", 1)
		self.assertEqual(self.read(), [{**row, "is_primary": None} for row in self.expected()])

	def test_primary_marker_permlevel_preserves_readable_contacts(self):
		self.protect("CRM Contacts", "is_primary", "permlevel", 9)
		self.assertEqual(self.read(), [{**row, "is_primary": None} for row in self.expected()])

	def test_masked_contact_values_are_not_reconstructed_from_relationship_copies(self):
		self.assertEqual(self.read(), self.expected())
		for field in ("full_name", "email_id", "mobile_no", "image"):
			self.protect("Contact", field, "mask", 1)
		self.assertEqual(
			self.read(),
			[
				{**row, "full_name": None, "email": None, "mobile_no": None, "image": None}
				for row in self.expected()
			],
		)

	def test_contact_permlevels_project_only_admitted_values(self):
		for field in ("full_name", "email_id", "mobile_no", "image"):
			self.protect("Contact", field, "permlevel", 9)
		frappe.set_user(self.user)
		self.assertNotIn("email_id", get_permitted_fields("Contact", permission_type="read"))
		self.assertEqual(
			self.read(),
			[
				{**row, "full_name": None, "email": None, "mobile_no": None, "image": None}
				for row in self.expected()
			],
		)

	def test_password_projection_is_excluded_even_for_administrator(self):
		# A designated image field must remain Attach Image. Remove that native
		# designation before exercising the Password projection boundary.
		frappe.set_user("Administrator")
		make_property_setter("Contact", None, "image_field", "", "Data", for_doctype=True)
		frappe.clear_cache(doctype="Contact")
		self.assertFalse(frappe.get_meta("Contact", cached=False).image_field)
		self.protect("Contact", "image", "fieldtype", "Password")
		self.assertEqual(self.read("Administrator"), [{**row, "image": None} for row in self.expected()])

	def test_other_deal_relationship_cannot_appear_in_result(self):
		other_contact = self.make_contact(8)
		self.attach(self.other, other_contact, is_primary=1)
		self.other.save()
		self.assertEqual(self.read(), self.expected())

	def test_other_parentfield_cannot_lend_its_contact_to_the_deal_contacts_table(self):
		unrelated = self.make_contact(8)
		self.attach(self.deal, unrelated)
		self.deal.save()
		row = self.deal.contacts[-1]
		# Deliberate fixture-only malformed relationship: owning controllers
		# created the row first. No schema or permission bypass is introduced.
		row.db_set("parentfield", "unrelated_contacts")
		self.assertEqual((row.parenttype, row.parent), ("CRM Deal", self.deal.name))
		self.before = self.stored_values()
		result = self.read()
		self.assertEqual(result, self.expected())
		for value in (unrelated.name, unrelated.full_name, unrelated.email_id, unrelated.mobile_no):
			self.assertNotIn(value, frappe.as_json(result))
		self.assertEqual(frappe.db.get_value("CRM Contacts", row.name, "parentfield"), "unrelated_contacts")

	def test_native_default_page_size_does_not_drop_authorized_contacts(self):
		for index in range(2, 23):
			contact = self.make_contact(index)
			self.contacts.append(contact)
			self.attach(self.deal, contact)
		self.deal.save()
		self.before = self.stored_values()
		self.assertEqual(len(self.contacts), 23)
		self.assertEqual(self.read(), self.expected())
