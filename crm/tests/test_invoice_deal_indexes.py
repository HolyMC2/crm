"""A page of deals reads its invoices and contacts through an index, not the whole table.

Bench suite: needs real frappe, on a site migrated with this code. ALTER TABLE commits, so the
index test leaves the indexes in place, which is the state every migrated site is in.
"""

from unittest import mock

import frappe
from frappe.tests import IntegrationTestCase

from crm.install import add_invoice_deal_indexes
from crm.pipeline.queries import stages

INVOICE_DOCTYPES = ("Sales Invoice", "POS Invoice")
DEAL_INDEX = "crm_deal_docstatus_index"


def linked_invoice_doctypes():
	return [
		doctype
		for doctype in INVOICE_DOCTYPES
		if frappe.db.table_exists(doctype) and frappe.db.has_column(doctype, "crm_deal")
	]


def indexes_with_columns(doctype, columns):
	by_index = {}
	for row in sorted(
		frappe.db.sql(f"SHOW INDEX FROM `tab{doctype}`", as_dict=True),
		key=lambda r: (r.Key_name, r.Seq_in_index),
	):
		by_index.setdefault(row.Key_name, []).append(row.Column_name)
	return sorted(name for name, cols in by_index.items() if cols == columns)


def explain(read, marker):
	"""EXPLAIN rows of every statement the read sends whose text contains `marker`."""
	seen = []
	real_sql = frappe.db.sql

	def spy(query, values=(), *args, **kwargs):
		if marker in str(query):
			seen.append((str(query), values))
		return real_sql(query, values, *args, **kwargs)

	with mock.patch.object(frappe.db, "sql", side_effect=spy):
		read()
	return [row for query, values in seen for row in real_sql(f"EXPLAIN {query}", values, as_dict=True)]


class TestInvoiceDealIndexes(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		add_invoice_deal_indexes()

	def test_migrate_adds_the_deal_index_once(self):
		doctypes = linked_invoice_doctypes()
		if not doctypes:
			self.skipTest("ERP invoices are not linked to deals on this site")
		self.addCleanup(add_invoice_deal_indexes)
		for doctype in doctypes:
			frappe.db.sql_ddl(f"ALTER TABLE `tab{doctype}` DROP INDEX IF EXISTS `{DEAL_INDEX}`")
		add_invoice_deal_indexes()
		add_invoice_deal_indexes()
		for doctype in doctypes:
			self.assertEqual(indexes_with_columns(doctype, ["crm_deal", "docstatus"]), [DEAL_INDEX], doctype)

	def test_a_page_reads_only_the_invoices_of_its_deals(self):
		doctypes = linked_invoice_doctypes()
		if not doctypes:
			self.skipTest("ERP invoices are not linked to deals on this site")
		company = frappe.db.get_value("Company", {}, ["name", "default_currency"], as_dict=True)
		if not company:
			self.skipTest("No company on this site")
		key = frappe.generate_hash(length=8)
		page_deal, other_deal = f"CRM-DEAL-PAGE-{key}", f"CRM-DEAL-OTHER-{key}"
		for doctype in doctypes:
			for crm_deal in (page_deal, other_deal):
				name = f"{crm_deal}-{doctype}"
				frappe.get_doc(
					{
						"doctype": doctype,
						"name": name,
						"company": company.name,
						"currency": company.default_currency,
						"party_account_currency": company.default_currency,
						"conversion_rate": 1,
						"crm_deal": crm_deal,
						"docstatus": 1,
						"base_grand_total": 100,
						"grand_total": 100,
						"outstanding_amount": 0,
						"customer": "_deal_index",
					}
				).db_insert()
				self.addCleanup(frappe.db.delete, doctype, {"name": name})

		def deals_read(deals):
			erp = stages._erp_amounts_table(company.default_currency, deals)
			rows = frappe.db.sql(frappe.qb.from_(erp).select(erp.deal).get_sql())
			return {deal for (deal,) in rows} & {page_deal, other_deal}

		self.assertEqual(deals_read(None), {page_deal, other_deal})
		self.assertEqual(deals_read([page_deal]), {page_deal})

	def test_per_deal_amounts_can_read_invoices_by_deal(self):
		doctypes = linked_invoice_doctypes()
		if not doctypes:
			self.skipTest("ERP invoices are not linked to deals on this site")
		erp = stages._erp_amounts_table(stages._base_currency(), ["CRM-DEAL-INDEX-TEST"])
		self.assertIsNotNone(erp)
		rows = frappe.db.sql(f"EXPLAIN {frappe.qb.from_(erp).select(erp.deal).get_sql()}", as_dict=True)
		for doctype in doctypes:
			invoice_rows = [row for row in rows if row.table == f"tab{doctype}"]
			self.assertTrue(invoice_rows, doctype)
			for row in invoice_rows:
				self.assertIn(DEAL_INDEX, (row.possible_keys or "").split(","), doctype)

	def test_contact_lookups_can_use_the_contact_index(self):
		self.assertTrue(frappe.get_meta("CRM Contacts").get_field("contact").search_index)
		rows = explain(
			lambda: frappe.get_all(
				"CRM Contacts", filters={"contact": "_none", "is_primary": 1}, fields=["parent"]
			),
			"tabCRM Contacts",
		)
		index = frappe.db.get_column_index("tabCRM Contacts", "contact", unique=False)
		self.assertTrue(index)
		self.assertIn(index.Key_name, (rows[0].possible_keys or "").split(","))
