"""Native Desk title sidecar must not bypass target record or field permissions.

CRM Lead.organization is Data. These cases use the owning CRM Deal.organization
Link and actual Organization records, never an invented Lead relationship.
"""

import copy
from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.desk.form import load
from frappe.model import get_permitted_fields
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.permissions import activity_history
from crm.tests.test_offers import OfferFixture


class TestDeskLinkTitles(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "desk_titles_" + frappe.generate_hash(length=8)
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
		for prop, value, fieldtype in (
			("title_field", "organization_name", "Data"),
			("show_title_field_in_link", 1, "Check"),
		):
			make_property_setter("CRM Organization", None, prop, value, fieldtype, for_doctype=True)
		frappe.clear_cache(doctype="CRM Organization")
		self.assert_title_metadata("CRM Organization", "organization_name")
		link = frappe.get_meta("CRM Deal", cached=False).get_field("organization")
		self.assertEqual((link.fieldtype, link.options), ("Link", "CRM Organization"))
		self.organization = self.make_organization("Private title " + self.key)
		self.deal.organization = self.organization.name
		self.deal.save()
		self.title_key = "CRM Organization::" + self.organization.name
		self.history_before = self.stored_history()

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
				for doctype in ("CRM Deal", "CRM Organization", "Contact", "CRM Contacts", "User"):
					frappe.clear_cache(doctype=doctype)
				if getattr(self, "user", None):
					frappe.clear_cache(user=self.user)
				frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime:
					frappe.local._realtime_log = self.realtime
				frappe.set_user(self.previous_user)

	def assert_title_metadata(self, doctype, fieldname):
		meta = frappe.get_meta(doctype, cached=False)
		self.assertEqual(meta.title_field, fieldname)
		self.assertEqual(int(meta.show_title_field_in_link or 0), 1)
		self.assertIsNotNone(meta.get_field(fieldname))
		return meta

	def make_organization(self, title):
		# The identifier must not itself contain the confidential title. Native
		# insert(set_name=...) still runs the owning controller and validators.
		name = "title-target-" + frappe.generate_hash(length=16)
		organization = frappe.get_doc(
			{"doctype": "CRM Organization", "organization_name": title, "currency": "USD"}
		).insert(set_name=name)
		self.assertEqual(organization.name, name)
		self.assertNotEqual(organization.name, title)
		return organization

	def stored_history(self):
		return frappe.get_all(
			"Version",
			filters={"ref_doctype": "CRM Deal", "docname": self.deal.name},
			fields=["name", "data"],
			order_by="name",
		)

	def desk_load(self):
		frappe.set_user(self.user)
		# Each invocation represents a fresh Desk HTTP request. Do not let a
		# fixture's prior Administrator lookup supply a request-local DB value.
		frappe.db.value_cache.clear()
		with patch.dict(frappe.response, {"docs": []}, clear=True):
			load.getdoc("CRM Deal", self.deal.name)
			return copy.deepcopy(frappe.parse_json(frappe.as_json(frappe.response)))

	def protect_title(self, prop, value):
		frappe.set_user("Administrator")
		make_property_setter(
			"CRM Organization", "organization_name", prop, value, "Check" if prop == "mask" else "Int"
		)
		frappe.clear_cache(doctype="CRM Organization")
		meta = self.assert_title_metadata("CRM Organization", "organization_name")
		self.assertEqual(int(meta.get_field("organization_name").get(prop) or 0), value)
		frappe.set_user(self.user)

	def assert_private_title_absent(self, result):
		self.assertNotIn(self.title_key, result.get("_link_titles", {}))
		self.assertNotIn(self.organization.organization_name, frappe.as_json(result))
		document = next(doc for doc in result["docs"] if doc["doctype"] == "CRM Deal")
		self.assertEqual(document["organization"], self.organization.name)
		frappe.set_user("Administrator")
		self.assertEqual(self.stored_history(), self.history_before)
		self.assertEqual(
			frappe.get_doc("CRM Organization", self.organization.name).organization_name,
			self.organization.organization_name,
		)
		self.assertEqual(frappe.get_doc("CRM Deal", self.deal.name).organization, self.organization.name)

	def test_permitted_title_survives_native_desk_response(self):
		result = self.desk_load()
		self.assertTrue(frappe.has_permission("CRM Organization", "read", self.organization.name))
		self.assertIn("organization_name", get_permitted_fields("CRM Organization", permission_type="read"))
		self.assertEqual(result["_link_titles"][self.title_key], self.organization.organization_name)
		frappe.set_user("Administrator")
		self.assertEqual(self.stored_history(), self.history_before)

	def test_title_permlevel_cannot_leak_through_native_link_titles(self):
		self.assertEqual(
			self.desk_load()["_link_titles"][self.title_key], self.organization.organization_name
		)
		self.protect_title("permlevel", 9)
		self.assertTrue(frappe.has_permission("CRM Organization", "read", self.organization.name))
		self.assertNotIn(
			"organization_name", get_permitted_fields("CRM Organization", permission_type="read")
		)
		self.assert_private_title_absent(self.desk_load())

	def test_masked_title_is_omitted_from_native_link_titles(self):
		self.assertEqual(
			self.desk_load()["_link_titles"][self.title_key], self.organization.organization_name
		)
		self.protect_title("mask", 1)
		self.assertIn(
			"organization_name",
			[field.fieldname for field in frappe.get_meta("CRM Organization").get_masked_fields()],
		)
		self.assert_private_title_absent(self.desk_load())

	def test_readable_deal_does_not_grant_private_organization_title(self):
		allowed = self.make_organization("Permitted alternative " + self.key)
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.user,
				"allow": "CRM Organization",
				"for_value": allowed.name,
				"apply_to_all_doctypes": 0,
				"applicable_for": "CRM Organization",
			}
		).insert()
		frappe.clear_cache(user=self.user)
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Deal", "read", self.deal.name))
		self.assertTrue(frappe.has_permission("CRM Organization", "read", allowed.name))
		self.assertFalse(frappe.has_permission("CRM Organization", "read", self.organization.name))
		self.assertEqual(
			frappe.get_list("CRM Organization", filters={"name": self.organization.name}, pluck="name"), []
		)
		self.assert_private_title_absent(self.desk_load())

	def test_child_link_obeys_target_title_permission_without_hiding_the_row(self):
		for prop, value, fieldtype in (
			("title_field", "designation", "Data"),
			("show_title_field_in_link", 1, "Check"),
		):
			make_property_setter("Contact", None, prop, value, fieldtype, for_doctype=True)
		frappe.clear_cache(doctype="Contact")
		self.assert_title_metadata("Contact", "designation")
		link = frappe.get_meta("CRM Contacts", cached=False).get_field("contact")
		self.assertEqual((link.fieldtype, link.options), ("Link", "Contact"))
		secret = "Private contact title " + self.key
		contact = frappe.get_doc(
			{"doctype": "Contact", "first_name": "Desk contact", "designation": secret}
		).insert(set_name="contact-target-" + self.key)
		self.deal.append("contacts", {"contact": contact.name})
		self.deal.save()
		self.assertFalse(self.deal.reload().contact, "This case must reach the native child Link path")
		key = "Contact::" + contact.name
		self.assertEqual(self.desk_load()["_link_titles"][key], secret)
		frappe.set_user("Administrator")
		make_property_setter("Contact", "designation", "permlevel", 9, "Int")
		frappe.clear_cache(doctype="Contact")
		meta = self.assert_title_metadata("Contact", "designation")
		self.assertEqual(meta.get_field("designation").permlevel, 9)
		result = self.desk_load()
		self.assertTrue(frappe.has_permission("Contact", "read", contact.name))
		self.assertNotIn("designation", get_permitted_fields("Contact", permission_type="read"))
		self.assertNotIn(key, result.get("_link_titles", {}))
		self.assertNotIn(secret, frappe.as_json(result))
		document = next(doc for doc in result["docs"] if doc["doctype"] == "CRM Deal")
		self.assertEqual([row["contact"] for row in document["contacts"]], [contact.name])
		frappe.set_user("Administrator")
		self.assertEqual(frappe.get_doc("Contact", contact.name).designation, secret)

	def test_current_dynamic_link_uses_its_native_discriminator_and_target_permissions(self):
		# Existing CRM fields are VARCHAR-backed. Native Property Setters model a
		# supported customization without new columns, DDL or permission doubles.
		# A native Dynamic Link discriminator must be Select or Link to DocType.
		make_property_setter("CRM Deal", "organization_name", "fieldtype", "Select", "Select")
		make_property_setter("CRM Deal", "organization_name", "options", "CRM Organization", "Text")
		make_property_setter("CRM Deal", "website", "options", "organization_name", "Text")
		make_property_setter("CRM Deal", "website", "fieldtype", "Dynamic Link", "Select")
		frappe.clear_cache(doctype="CRM Deal")
		meta = frappe.get_meta("CRM Deal", cached=False)
		link = meta.get_field("website")
		self.assertEqual((link.fieldtype, link.options), ("Dynamic Link", "organization_name"))
		discriminator = meta.get_field("organization_name")
		self.assertEqual((discriminator.fieldtype, discriminator.options), ("Select", "CRM Organization"))
		self.deal = frappe.get_doc("CRM Deal", self.deal.name)
		self.deal.organization = None
		self.deal.organization_name = "CRM Organization"
		self.deal.website = self.organization.name
		self.deal.save()
		self.assertEqual(
			self.desk_load()["_link_titles"][self.title_key], self.organization.organization_name
		)
		self.protect_title("permlevel", 9)
		result = self.desk_load()
		self.assertNotIn(self.title_key, result.get("_link_titles", {}))
		self.assertNotIn(self.organization.organization_name, frappe.as_json(result))
		document = next(doc for doc in result["docs"] if doc["doctype"] == "CRM Deal")
		self.assertFalse(document["organization"])
		self.assertEqual(document["website"], self.organization.name)
		self.assertEqual(document["organization_name"], "CRM Organization")
		frappe.set_user("Administrator")
		self.assertEqual(frappe.get_doc("CRM Deal", self.deal.name).website, self.organization.name)

	def test_dispatcher_drops_unrelated_candidates_without_mutating_document_or_map(self):
		unrelated = self.make_organization("Unrelated title " + self.key)
		frappe.set_user(self.user)
		self.assertTrue(frappe.has_permission("CRM Organization", "read", unrelated.name))
		document = frappe.get_doc("CRM Deal", self.deal.name)
		document.apply_fieldlevel_read_permissions()
		before = copy.deepcopy(document.as_dict())
		candidates = {
			self.title_key: self.organization.organization_name,
			"CRM Organization::" + unrelated.name: unrelated.organization_name,
			"CRM Organization::missing-" + self.key: "Untrusted missing candidate",
			"unexpected key": "Untrusted extra candidate",
		}
		original = copy.deepcopy(candidates)
		result = load.project_link_titles(document, candidates, user=self.user)
		self.assertEqual(result, {self.title_key: self.organization.organization_name})
		self.assertEqual(candidates, original)
		self.assertEqual(document.as_dict(), before)

	def test_supported_base_rejects_missing_title_capability(self):
		self.assertEqual(load.LINK_TITLES_FILTER_VERSION, 1)
		self.assertIn(
			"crm.permissions.link_titles.project", frappe.get_hooks("filter_link_titles")["CRM Deal"]
		)
		activity_history.require_framework()
		with patch.object(load, "LINK_TITLES_FILTER_VERSION", 0):
			with self.assertRaises(frappe.PermissionError):
				activity_history.require_framework()
