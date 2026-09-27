"""Embed permission-scoped query builder subqueries in raw SQL safely."""

import re

import frappe
from frappe.query_builder.terms import NamedParameterWrapper

_PARAMETER = re.compile(r"%\((param\d+)\)s")


def subquery_sql(query):
	"""Render `query` with every string value escaped by the database driver.

	Plain `get_sql()` only doubles single quotes, which a trailing backslash
	defeats on MariaDB. Values are bound through Frappe's parameter wrapper and
	then escaped with `frappe.db.escape`, so the result can be embedded in raw
	SQL or returned from a permission_query_conditions hook.
	"""
	wrapper = NamedParameterWrapper()
	sql = query.get_sql(param_wrapper=wrapper)
	values = wrapper.get_parameters()
	return _PARAMETER.sub(lambda match: frappe.db.escape(values[match.group(1)]), sql)
