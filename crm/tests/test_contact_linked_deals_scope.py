"""Native reverse Contact relationships expose only permitted Deal list data."""

from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.model import get_permitted_fields
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.api.contact import get_linked_deals
from crm.tests.test_offers import OfferFixture


class TestContactLinkedDealsScope(OfferFixture, IntegrationTestCase):
	columns = frozenset(
		{
			"name",
			"organization",
			"currency",
			"deal_value",
			"status",
			"email",
			"mobile_no",
			"deal_owner",
			"modified",
		}
	)

	def setUp(self):
		super().setUp()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "contact_deals_" + frappe.generate_hash(length=8)
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
		self.manager = f"linked-deals-manager-{self.key}@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.manager,
				"first_name": "Linked deals manager",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales Manager"}],
			}
		).insert()
		self.contact = self.make_contact("linked")
		self.other_contact = self.make_contact("unrelated")
		self.organization = frappe.get_doc(
			{
				"doctype": "CRM Organization",
				"organization_name": "Linked organization " + self.key,
				"currency": "USD",
			}
		).insert()
		for deal in (self.deal, self.other):
			deal.organization = self.organization.name
			deal.next_step = "Outside DTO private detail " + deal.name
			deal.deal_value = 125
			self.attach(deal, self.contact)
			deal.save()
			deal.reload()
			self.assertEqual(deal.email, self.contact.email_id)
		self.deals = [self.deal, self.other]
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
				for doctype in ("CRM Deal", "CRM Contacts", "Contact", "CRM Organization", "User"):
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

	def make_contact(self, suffix):
		return (
			frappe.get_doc(
				{
					"doctype": "Contact",
					"first_name": f"Contact {suffix} {self.key}",
					"email_ids": [{"email_id": f"{suffix}-{self.key}@example.invalid", "is_primary": 1}],
					"phone_nos": [{"phone": "+12025550123", "is_primary_mobile_no": 1}],
				}
			)
			.insert(set_name=f"reverse-contact-{self.key}-{suffix}")
			.reload()
		)

	def attach(self, deal, contact, *, is_primary=1):
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
		names = [deal.name for deal in self.deals]
		return {
			"deals": frappe.get_all(
				"CRM Deal",
				filters={"name": ["in", names]},
				fields=sorted(self.columns | {"next_step"}),
				order_by="name",
			),
			"relationships": frappe.get_all(
				"CRM Contacts",
				filters={"parent": ["in", names]},
				fields=["name", "parent", "parenttype", "parentfield", "contact", "is_primary", "modified"],
				order_by="name",
			),
			"contact": frappe.db.get_value(
				"Contact",
				self.contact.name,
				["name", "full_name", "email_id", "mobile_no", "modified"],
				as_dict=True,
			),
		}

	def read(self, user=None):
		frappe.set_user(user or self.user)
		frappe.db.value_cache.clear()
		self.assertTrue(frappe.has_permission("Contact", "read", self.contact.name))
		self.assertEqual(
			frappe.get_list("Contact", filters={"name": self.contact.name}, pluck="name"), [self.contact.name]
		)
		result = get_linked_deals(self.contact.name)
		self.assertEqual(frappe.session.user, user or self.user)
		self.assertEqual(self.stored_values(), self.before)
		return result

	def expected(self, *deals):
		return [{key: deal.get(key) for key in self.columns} for deal in sorted(deals, key=lambda d: d.name)]

	def protect(self, doctype, field, prop, value):
		frappe.set_user("Administrator")
		make_property_setter(
			doctype, field, prop, value, {"mask": "Check", "permlevel": "Int", "fieldtype": "Data"}[prop]
		)
		frappe.clear_cache(doctype=doctype)
		frappe.cache.delete_keys(f"masked_fields::{doctype}::*")
		self.assertEqual(str(frappe.get_meta(doctype, cached=False).get_field(field).get(prop)), str(value))

	def restrict(self, doctype, allowed, *, user=None):
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

	def test_owner_gets_only_owned_deal_and_exact_list_dto(self):
		result = self.read()
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		self.assertEqual(result, self.expected(self.deal))
		self.assertEqual(set(result[0]), self.columns)
		self.assertNotIn(self.deal.next_step, frappe.as_json(result))
		self.assertNotIn("contacts", result[0])

	def test_sales_manager_gets_both_permitted_deals(self):
		result = self.read(self.manager)
		for deal in self.deals:
			self.assertTrue(frappe.has_permission("CRM Deal", "read", deal.name))
		self.assertEqual(result, self.expected(*self.deals))

	def test_denied_contact_cannot_return_deal_identity_or_count(self):
		self.restrict("Contact", self.other_contact.name)
		self.assertFalse(frappe.has_permission("Contact", "read", self.contact.name))
		self.assertEqual(frappe.get_list("Contact", filters={"name": self.contact.name}), [])
		with self.assertRaises(frappe.PermissionError):
			get_linked_deals(self.contact.name)

	def test_readable_contact_does_not_admit_foreign_deal(self):
		frappe.set_user(self.user)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name))
		self.assertEqual(frappe.get_list("CRM Deal", filters={"name": self.other.name}), [])
		result = self.read()
		self.assertEqual(result, self.expected(self.deal))
		self.assertNotIn(self.other.name, frappe.as_json(result))
		self.assertNotIn(self.other.next_step, frappe.as_json(result))

	def test_no_permitted_linked_deal_returns_empty_without_hidden_count(self):
		self.deal.contacts = []
		self.deal.save()
		self.before = self.stored_values()
		frappe.set_user(self.user)
		self.assertFalse(frappe.has_permission("CRM Deal", "read", self.other.name))
		self.assertEqual(frappe.get_list("CRM Deal", filters={"name": self.other.name}), [])
		self.assertEqual(self.read(), [])

	def test_masked_relationship_table_hides_edges(self):
		self.assertEqual(self.read(), self.expected(self.deal))
		self.protect("CRM Deal", "contacts", "mask", 1)
		self.assertEqual(self.read(), [])

	def test_relationship_table_permlevel_hides_edges(self):
		self.protect("CRM Deal", "contacts", "permlevel", 9)
		self.assertEqual(self.read(), [])

	def test_masked_child_contact_link_hides_deal_identity_and_count(self):
		self.protect("CRM Contacts", "contact", "mask", 1)
		self.assertEqual(self.read(), [])

	def test_child_contact_link_permlevel_hides_deal_identity_and_count(self):
		self.protect("CRM Contacts", "contact", "permlevel", 9)
		self.assertEqual(self.read(), [])

	def test_primary_marker_permission_does_not_hide_an_admitted_edge(self):
		self.protect("CRM Contacts", "is_primary", "mask", 1)
		self.assertEqual(self.read(), self.expected(self.deal))

	def test_masked_deal_scalars_are_null_and_extra_document_fields_never_escape(self):
		self.assertEqual(self.read(), self.expected(self.deal))
		protected = ("organization", "currency", "deal_value", "status", "email", "mobile_no", "deal_owner")
		for field in protected:
			self.protect("CRM Deal", field, "mask", 1)
		result = self.read()
		self.assertEqual(result, [{**self.expected(self.deal)[0], **dict.fromkeys(protected)}])
		self.assertEqual(set(result[0]), self.columns)
		self.assertNotIn(self.deal.next_step, frappe.as_json(result))

	def test_deal_scalar_permlevels_are_respected(self):
		protected = ("organization", "currency", "deal_value", "status", "email", "mobile_no", "deal_owner")
		for field in protected:
			self.protect("CRM Deal", field, "permlevel", 9)
		frappe.set_user(self.user)
		self.assertNotIn("email", get_permitted_fields("CRM Deal", permission_type="read"))
		self.assertEqual(self.read(), [{**self.expected(self.deal)[0], **dict.fromkeys(protected)}])

	def test_password_projection_is_excluded_for_administrator(self):
		self.protect("CRM Deal", "email", "fieldtype", "Password")
		self.assertEqual(
			self.read("Administrator"), [{**row, "email": None} for row in self.expected(*self.deals)]
		)

	def test_other_contact_relationship_is_not_returned(self):
		self.other.contacts = []
		self.attach(self.other, self.other_contact)
		self.other.save()
		self.before = self.stored_values()
		self.assertEqual(self.read(self.manager), self.expected(self.deal))

	def test_other_parentfield_does_not_create_a_contact_relationship(self):
		row = self.other.contacts[0]
		# Deliberately malformed fixture edge, after normal owning creation.
		row.db_set("parentfield", "unrelated_contacts")
		self.before = self.stored_values()
		result = self.read(self.manager)
		self.assertEqual(result, self.expected(self.deal))
		self.assertNotIn(self.other.name, frappe.as_json(result))
		self.assertEqual(frappe.db.get_value("CRM Contacts", row.name, "parentfield"), "unrelated_contacts")

	def test_duplicate_relationship_rows_do_not_duplicate_a_deal(self):
		self.attach(self.deal, self.contact, is_primary=0)
		self.deal.save()
		self.deal.reload()
		self.assertEqual(len(self.deal.contacts), 2)
		self.before = self.stored_values()
		self.assertEqual(self.read(), self.expected(self.deal))

	def test_readable_link_keeps_native_id_without_enriching_a_denied_target(self):
		allowed = frappe.get_doc(
			{
				"doctype": "CRM Organization",
				"organization_name": "Other organization " + self.key,
				"currency": "USD",
			}
		).insert()
		self.restrict("CRM Organization", allowed.name)
		self.assertFalse(frappe.has_permission("CRM Organization", "read", self.organization.name))
		self.assertEqual(frappe.get_list("CRM Organization", filters={"name": self.organization.name}), [])
		self.assertIn("organization", get_permitted_fields("CRM Deal", permission_type="read"))
		result = self.read()
		self.assertEqual(result, self.expected(self.deal))
		self.assertEqual(result[0]["organization"], self.organization.name)
		self.assertEqual(set(result[0]), self.columns)

	def test_authorized_deals_beyond_native_default_page_size_are_retained(self):
		for _ in range(21):
			deal = frappe.copy_doc(self.deal)
			deal.contacts = []
			self.attach(deal, self.contact)
			deal.insert()
			self.deals.append(deal.reload())
		self.before = self.stored_values()
		self.assertEqual(len(self.deals), 23)
		self.assertEqual(self.read(self.manager), self.expected(*self.deals))
