"""Embedded permission subqueries keep hostile filter values inert."""

import frappe
from frappe.tests import IntegrationTestCase

from crm.utils.query import subquery_sql

PAYLOADS = ("x\\' OR 1=1 OR name=\\'", "x\\' OR 1=1 -- ", "50% off", "back\\slash")


class TestSubquerySQL(IntegrationTestCase):
	def test_hostile_values_never_widen_the_embedded_scope(self):
		for payload in PAYLOADS:
			with self.subTest(payload=payload):
				query = frappe.qb.get_query(
					"User", fields=["name"], filters=[["name", "=", payload]], ignore_permissions=True
				)
				sql = subquery_sql(query)
				count = frappe.db.sql(f"SELECT COUNT(*) FROM `tabUser` WHERE name IN ({sql})", {})[0][0]
				self.assertEqual(count, 0)

	def test_matching_values_still_match(self):
		query = frappe.qb.get_query(
			"User", fields=["name"], filters=[["name", "=", "Administrator"]], ignore_permissions=True
		)
		sql = subquery_sql(query)
		self.assertEqual(
			frappe.db.sql(f"SELECT name FROM `tabUser` WHERE name IN ({sql})", {}, pluck=True),
			["Administrator"],
		)
