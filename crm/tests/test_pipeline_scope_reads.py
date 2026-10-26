"""Pipeline scope reads (F19): permission hooks ask for the allowed pipelines on
every deal and lead of a list; the pipeline and role rows are read once per
transaction, the answer is unchanged, and a pipeline save is seen at once."""

from contextlib import contextmanager

import frappe
from frappe.tests import IntegrationTestCase

from crm.pipeline.services import configuration
from crm.utils.doctypes import doctype_exists


@contextmanager
def reads(*tables):
	seen = []
	original = frappe.db.sql

	def counting(query, *args, **kwargs):
		if any(f"`tab{table}`" in str(query) for table in tables):
			seen.append(query)
		return original(query, *args, **kwargs)

	frappe.db.sql = counting
	try:
		yield seen
	finally:
		frappe.db.sql = original


def allowed_one_read_at_a_time(user):
	"""The answer allowed_pipeline_names gave before the rows were kept."""
	rows = frappe.get_all("CRM Pipeline", fields=["name", "sales_company"])
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return [row.name for row in rows]
	roles = set(frappe.get_roles(user))
	scopes = configuration._user_scopes(user)
	restricted = {}
	for row in frappe.get_all("CRM Pipeline Role", fields=["parent", "role"]):
		restricted.setdefault(row.parent, set()).add(row.role)
	return [
		row.name
		for row in rows
		if (not restricted.get(row.name) or restricted[row.name] & roles)
		and (not scopes["CRM Pipeline"] or row.name in scopes["CRM Pipeline"])
		and (not row.sales_company or not scopes["Company"] or row.sales_company in scopes["Company"])
	]


class TestPipelineScopeReads(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		status = frappe.get_doc(
			{
				"doctype": "CRM Deal Status",
				"deal_status": "Scope reads " + frappe.generate_hash(length=10),
				"type": "Open",
				"probability": 10,
			}
		).insert()
		self.status = status.name
		self.pipeline = self.make_pipeline()
		self.seller = "scope-reads-" + frappe.generate_hash(length=8) + "@example.invalid"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.seller,
				"first_name": "Scope reads seller",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		super().tearDown()

	def make_pipeline(self):
		return frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": "Scope reads " + frappe.generate_hash(length=8),
				"probability_policy": "Stage",
				"stages": [{"status": self.status, "probability": 30}],
			}
		).insert()

	def test_same_answer_and_one_read_for_a_whole_list(self):
		expected = allowed_one_read_at_a_time(self.seller)
		self.assertIn(self.pipeline.name, expected)
		with reads("CRM Pipeline", "CRM Pipeline Role") as seen:
			condition = configuration.record_query("CRM Deal", self.seller)
			for _ in range(50):
				self.assertEqual(configuration.allowed_pipeline_names(self.seller), expected)
				self.assertEqual(configuration.record_query("CRM Deal", self.seller), condition)
				self.assertTrue(configuration.can_access_pipeline(self.pipeline.name, self.seller))
		# one pipeline read and one role read for 150 permission checks (F18: one per check)
		self.assertEqual(len(seen), 2)
		self.assertEqual(
			configuration.allowed_pipeline_names("Administrator"),
			[row.name for row in frappe.get_all("CRM Pipeline", fields=["name"])],
		)

	def test_a_role_restriction_saved_in_the_same_transaction_is_seen(self):
		self.assertTrue(configuration.can_access_pipeline(self.pipeline.name, self.seller))
		self.pipeline.append("roles", {"role": "System Manager"})
		self.pipeline.save()
		self.assertFalse(configuration.can_access_pipeline(self.pipeline.name, self.seller))
		self.assertEqual(
			configuration.allowed_pipeline_names(self.seller), allowed_one_read_at_a_time(self.seller)
		)

	def test_a_new_pipeline_is_seen_and_a_rollback_forgets(self):
		before = configuration.allowed_pipeline_names("Administrator")
		other = self.make_pipeline()
		self.assertIn(other.name, configuration.allowed_pipeline_names("Administrator"))
		self.assertEqual(len(configuration.allowed_pipeline_names("Administrator")), len(before) + 1)
		frappe.db.rollback()
		with reads("CRM Pipeline") as seen:
			self.assertNotIn(other.name, configuration.allowed_pipeline_names("Administrator"))
		self.assertEqual(len(seen), 1)


class TestDoctypeExists(IntegrationTestCase):
	def test_same_answer_and_one_read_per_name(self):
		names = ("CRM Deal", "CRM Pipeline", "No Such DocType F19")
		expected = {name: bool(frappe.db.exists("DocType", name)) for name in names}
		self.assertEqual(expected, {"CRM Deal": True, "CRM Pipeline": True, "No Such DocType F19": False})
		frappe.db.rollback()
		with reads("DocType") as seen:
			for _ in range(10):
				self.assertEqual({name: doctype_exists(name) for name in names}, expected)
		self.assertEqual(len(seen), len(names))
		frappe.db.rollback()
		with reads("DocType") as seen:
			self.assertTrue(doctype_exists("CRM Deal"))
		self.assertEqual(len(seen), 1)
