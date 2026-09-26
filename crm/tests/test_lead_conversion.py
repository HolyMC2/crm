"""Native standalone conversion authorization, continuity and SQL concurrency."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.fcrm.doctype.crm_lead.crm_lead import convert_to_deal
from crm.lead.conversion import get_conversion_context


def make_lead(key=None, **values):
	key = key or uuid4().hex
	return frappe.get_doc(
		{
			"doctype": "CRM Lead",
			"first_name": "Conversion " + key,
			"email": key + "@example.invalid",
			"lead_owner": "Administrator",
			**values,
		}
	).insert()


def make_contact(email, title):
	return frappe.get_doc(
		{
			"doctype": "Contact",
			"first_name": title,
			"email_ids": [{"email_id": email, "is_primary": 1}],
		}
	).insert()


class TestLeadConversion(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		super().tearDown()

	def test_repeat_ignores_stale_timestamp_and_keeps_one_deal(self):
		lead = make_lead()
		request = {"lead": lead.name, "expected_modified": str(lead.modified), "request_id": str(uuid4())}
		first = convert_to_deal(**request)
		self.assertEqual(convert_to_deal(**request), first)
		self.assertEqual(frappe.db.count("CRM Deal", {"lead": lead.name}), 1)
		self.assertEqual(get_conversion_context(lead.name)["existing_deal"], first)

	def test_shared_email_requires_selection_and_never_merges_people(self):
		lead = make_lead()
		one = make_contact(lead.email, "First " + uuid4().hex)
		two = make_contact(lead.email, "Second " + uuid4().hex)
		review = get_conversion_context(lead.name)
		self.assertEqual({row.name for row in review["contacts"]}, {one.name, two.name})
		with self.assertRaises(frappe.ValidationError):
			convert_to_deal(lead.name)
		self.assertFalse(frappe.db.get_value("CRM Lead", lead.name, "converted"))
		deal = frappe.get_doc("CRM Deal", convert_to_deal(lead.name, existing_contact=two.name))
		self.assertEqual(deal.contact, two.name)
		self.assertTrue(frappe.db.exists("Contact", one.name))
		self.assertEqual(frappe.db.get_value("CRM Lead", lead.name, "first_name"), lead.first_name)

	def test_explicit_new_person_with_shared_email_does_not_reuse_contact(self):
		lead = make_lead()
		other = make_contact(lead.email, "Other " + uuid4().hex)
		deal = frappe.get_doc("CRM Deal", convert_to_deal(lead.name, create_new_contact=True))
		self.assertNotEqual(deal.contact, other.name)

	def test_organization_is_selected_explicitly(self):
		name = "Organization " + uuid4().hex
		organization = frappe.get_doc({"doctype": "CRM Organization", "organization_name": name}).insert()
		lead = make_lead(organization=name)
		with self.assertRaises(frappe.ValidationError):
			convert_to_deal(lead.name)
		result = convert_to_deal(lead.name, existing_organization=organization.name)
		self.assertEqual(frappe.db.get_value("CRM Deal", result, "organization"), organization.name)

	def test_stale_lead_and_protected_client_fields_fail_before_effect(self):
		lead = make_lead()
		with self.assertRaises(frappe.TimestampMismatchError):
			convert_to_deal(lead.name, expected_modified="2000-01-01 00:00:00")
		with self.assertRaises(frappe.ValidationError):
			convert_to_deal(lead.name, deal={"lead": "another-lead"})
		self.assertFalse(frappe.db.get_value("CRM Lead", lead.name, "converted"))
		self.assertEqual(frappe.db.count("CRM Deal", {"lead": lead.name}), 0)

	def test_open_tasks_move_once_finished_work_stays_and_projection_refreshes(self):
		lead = make_lead()

		def task(title, status, due=None):
			return frappe.get_doc(
				{
					"doctype": "CRM Task",
					"title": title,
					"status": status,
					"reference_doctype": "CRM Lead",
					"reference_docname": lead.name,
					"due_date": due,
					"assigned_to": "Administrator",
					"description": "Preserve notes",
				}
			).insert()

		dated = task("Dated", "Todo", "2030-01-01 10:00:00")
		undated = task("Undated", "Backlog")
		finished = task("Finished", "Done")
		name = convert_to_deal(lead.name)
		self.assertEqual(convert_to_deal(lead.name), name)
		for row in (dated, undated):
			row.reload()
			self.assertEqual((row.reference_doctype, row.reference_docname), ("CRM Deal", name))
			self.assertEqual((row.assigned_to, row.description), ("Administrator", "Preserve notes"))
		self.assertEqual(finished.reload().reference_docname, lead.name)
		self.assertFalse(frappe.db.get_value("CRM Lead", lead.name, "next_activity_task"))
		self.assertEqual(str(frappe.db.get_value("CRM Deal", name, "next_activity_task")), str(dated.name))
		dated.status = "Done"
		dated.save()
		self.assertEqual(str(frappe.db.get_value("CRM Deal", name, "next_activity_task")), str(undated.name))
		undated.status = "Done"
		undated.save()
		self.assertFalse(frappe.db.get_value("CRM Deal", name, "next_activity_task"))

	def test_task_from_stale_lead_tab_and_reopened_history_use_canonical_deal(self):
		lead = make_lead()
		finished = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": "History",
				"status": "Done",
				"reference_doctype": "CRM Lead",
				"reference_docname": lead.name,
			}
		).insert()
		name = convert_to_deal(lead.name)
		late = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": "From stale tab",
				"status": "Todo",
				"reference_doctype": "CRM Lead",
				"reference_docname": lead.name,
			}
		).insert()
		self.assertEqual((late.reference_doctype, late.reference_docname), ("CRM Deal", name))
		finished.status = "Todo"
		finished.save()
		self.assertEqual((finished.reference_doctype, finished.reference_docname), ("CRM Deal", name))
		self.assertFalse(frappe.db.get_value("CRM Lead", lead.name, "next_activity_task"))

	def test_deadlock_is_a_reviewable_stale_error_without_implicit_retry(self):
		with patch("crm.lead.conversion.convert", side_effect=frappe.QueryDeadlockError) as command:
			with self.assertRaises(frappe.TimestampMismatchError):
				convert_to_deal("synthetic-lead")
		command.assert_called_once()

	def test_pipeline_scope_and_owner_are_preserved(self):
		lead = make_lead()
		deal = frappe.get_doc("CRM Deal", convert_to_deal(lead.name))
		self.assertEqual(
			(deal.pipeline, deal.sales_company, deal.deal_owner),
			(lead.pipeline, lead.sales_company, lead.lead_owner),
		)

	def test_create_permission_is_not_elevated_by_legacy_doc_flag(self):
		lead = make_lead()
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": uuid4().hex + "@example.invalid",
				"first_name": "Conversion restricted",
				"send_welcome_email": 0,
			}
		).insert()
		frappe.share.add("CRM Lead", lead.name, user=user.name, read=1, write=1)
		lead.flags.ignore_permissions = True
		frappe.set_user(user.name)
		with self.assertRaises(frappe.PermissionError):
			convert_to_deal(lead.name, doc=lead)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.count("CRM Deal", {"lead": lead.name}), 0)

	def test_link_permission_checked_even_for_explicit_target(self):
		lead = make_lead()
		contact = make_contact("other@example.invalid", "Restricted " + uuid4().hex)
		original = type(contact).check_permission

		def deny(doc, permission, *args, **kwargs):
			if doc.doctype == "Contact" and doc.name == contact.name:
				raise frappe.PermissionError("restricted contact")
			return original(doc, permission, *args, **kwargs)

		# Native SQL/controllers, permission denial injected at the document boundary.
		with patch.object(type(contact), "check_permission", deny), self.assertRaises(frappe.PermissionError):
			convert_to_deal(lead.name, existing_contact=contact.name)
		self.assertEqual(frappe.db.count("CRM Deal", {"lead": lead.name}), 0)


class TestLeadConversionConcurrency(TestCase):
	def test_two_connections_create_exactly_one_result(self):
		"""Commits only unique synthetic fixture rows in the isolated native test site."""
		frappe.set_user("Administrator")
		lead = make_lead()
		frappe.db.commit()  # nosemgrep: cross-connection synthetic concurrency fixture
		site, sites_path = frappe.local.site, frappe.local.sites_path
		barrier = Barrier(2)

		def run():
			frappe.init(site=site, sites_path=sites_path)
			frappe.connect()
			try:
				frappe.set_user("Administrator")
				barrier.wait(timeout=15)
				result = convert_to_deal(lead.name)
				frappe.db.commit()  # nosemgrep: simulate the native request commit
				return result
			finally:
				frappe.destroy()

		try:
			with ThreadPoolExecutor(max_workers=2) as pool:
				futures = [pool.submit(run), pool.submit(run)]
				results = [future.result(timeout=45) for future in futures]
			frappe.db.rollback()  # discard parent read view, observe both committed requests
			self.assertEqual(results[0], results[1])
			self.assertEqual(frappe.db.count("CRM Deal", {"lead": lead.name}), 1)
		finally:
			frappe.db.rollback()
			contacts = []
			for row in frappe.get_all("CRM Deal", filters={"lead": lead.name}, fields=["name", "contact"]):
				contacts.append(row.contact)
				frappe.delete_doc("CRM Deal", row.name, force=True)
			frappe.delete_doc("CRM Lead", lead.name, force=True)
			for name in contacts:
				if name and frappe.db.exists("Contact", name):
					frappe.delete_doc("Contact", name, force=True)
			frappe.db.commit()  # nosemgrep: remove this test's committed synthetic fixtures
