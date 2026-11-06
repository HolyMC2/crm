"""doctype_exists: the same answer as frappe.db.exists, one tabDocType read per
transaction for every name asked (F19, F23), fresh after a rollback, and an
install or a removal is seen by the next call of the same transaction."""

from contextlib import contextmanager

import frappe
from frappe.tests import IntegrationTestCase

from crm.utils.doctypes import doctype_exists


@contextmanager
def doctype_reads():
	"""Counts the tabDocType reads issued inside the block."""
	seen = []
	original = frappe.db.sql

	def counting(query, *args, **kwargs):
		if "`tabDocType`" in str(query):
			seen.append(query)
		return original(query, *args, **kwargs)

	frappe.db.sql = counting
	try:
		yield seen
	finally:
		frappe.db.sql = original


def install_probe(name):
	"""A custom Single DocType has no table of its own, so its insert runs no DDL
	and does not commit."""
	return frappe.get_doc(
		{
			"doctype": "DocType",
			"name": name,
			"module": "Custom",
			"custom": 1,
			"issingle": 1,
			"fields": [{"fieldname": "note", "fieldtype": "Data", "label": "Note"}],
			"permissions": [{"role": "System Manager", "read": 1, "write": 1}],
		}
	).insert(ignore_permissions=True)


class DoctypeExistsTests(IntegrationTestCase):
	NAMES = ("User", "ToDo", "Company", "No Such DocType F19")

	def test_same_answer_as_frappe(self):
		for name in self.NAMES:
			self.assertEqual(doctype_exists(name), bool(frappe.db.exists("DocType", name)), name)
		self.assertFalse(doctype_exists("No Such DocType F19"))
		self.assertTrue(doctype_exists("User"))

	def test_one_read_per_transaction_for_every_name(self):
		frappe.db.rollback()
		with doctype_reads() as seen:
			for _ in range(20):
				for name in self.NAMES:
					doctype_exists(name)
		self.assertEqual(len(seen), 1)

	def test_rollback_forgets(self):
		doctype_exists("User")
		frappe.db.rollback()
		with doctype_reads() as seen:
			self.assertTrue(doctype_exists("User"))
		self.assertEqual(len(seen), 1)


class DoctypeInstallRemoveTests(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.db.rollback()
		self.name = "F19 Exists Probe " + frappe.generate_hash(length=8)

	def tearDown(self):
		frappe.db.rollback()
		if frappe.db.exists("DocType", self.name):
			frappe.delete_doc("DocType", self.name, ignore_permissions=True, force=True)
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- only after the probe leaked a commit
		super().tearDown()

	def test_an_install_is_seen_in_the_same_transaction(self):
		self.assertFalse(doctype_exists(self.name))
		with doctype_reads() as seen:
			self.assertFalse(doctype_exists(self.name))
		self.assertEqual(seen, [], "the absent answer is cached")
		install_probe(self.name)
		self.assertTrue(doctype_exists(self.name))
		frappe.db.rollback()
		self.assertFalse(frappe.db.exists("DocType", self.name), "the install did not commit")
		self.assertFalse(doctype_exists(self.name))

	def test_a_removal_is_seen_in_the_same_transaction(self):
		install_probe(self.name)
		self.assertTrue(doctype_exists(self.name))
		with doctype_reads() as seen:
			self.assertTrue(doctype_exists(self.name))
		self.assertEqual(seen, [], "the installed answer is cached")
		frappe.delete_doc("DocType", self.name, ignore_permissions=True)
		self.assertFalse(doctype_exists(self.name))
		frappe.db.rollback()
		self.assertFalse(frappe.db.exists("DocType", self.name), "the removal did not commit")
