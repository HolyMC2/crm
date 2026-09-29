# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Request-time filter tokens shared by list data, totals and export.

Saved views store the token, never its value, so a view keeps meaning the same
thing after midnight or after a tenant renames its stages:

- ``@me``: the session user (``%@me%`` becomes ``%<user>%`` for LIKE filters).
- ``@today``, ``@today+N``, ``@today-N``: the site-local date, offset by N days.
- ``@open_deal_statuses``: the tenant's CRM Deal Status names whose type is not
  terminal (Won/Lost). Inside a value list it expands in place.
"""

import copy
import re

import frappe
from frappe.utils import add_days, today

TODAY_TOKEN = re.compile(r"^@today(?:([+-])(\d{1,4}))?$")
OPEN_DEAL_STATUSES = "@open_deal_statuses"
# Stage *types* (the Select options of CRM Deal Status.type) that end a deal.
# Stage names are tenant data and are always read from the table.
TERMINAL_DEAL_STATUS_TYPES = ("Won", "Lost")


def resolve_filter_tokens(filters):
	"""Return a copy of ``filters`` (dict, list or JSON string) with every token resolved.

	Handles the dict form ``{field: value | [op, value]}`` and the list form
	``[[doctype, field, op, value], [field, op, value], ...]``, recursing into list
	values. Anything that is not a token passes through unchanged.
	"""
	if not filters:
		return filters
	if isinstance(filters, str):
		filters = frappe.parse_json(filters)
	return _Resolver().resolve(copy.deepcopy(filters))


def open_deal_statuses() -> list[str]:
	"""Names of the non-terminal CRM Deal Status rows, read at request time."""
	return frappe.get_all(
		"CRM Deal Status",
		filters={"type": ["not in", TERMINAL_DEAL_STATUS_TYPES]},
		pluck="name",
		order_by="position asc, name asc",
	)


class _Resolver:
	"""One request's resolution: each token is computed at most once."""

	def __init__(self):
		self._today = None
		self._open_statuses = None

	def resolve(self, filters):
		if isinstance(filters, dict):
			return {field: self.condition_value(value) for field, value in filters.items()}
		if isinstance(filters, list | tuple):
			return [self.condition(item) for item in filters]
		return filters

	def condition(self, item):
		"""One entry of the list form: ``[field, op, value]``, ``[dt, field, op, value]`` or a dict."""
		if isinstance(item, dict):
			return self.resolve(item)
		if isinstance(item, list | tuple) and len(item) >= 3:
			return [*item[:-1], self.operand(item[-1])]
		return item

	def condition_value(self, value):
		"""A dict-form value: a scalar, ``[op, operand]`` or a bare list of values."""
		if isinstance(value, list | tuple) and len(value) == 2 and isinstance(value[0], str):
			if not value[0].startswith(("@", "%@")):
				return [value[0], self.operand(value[1])]
		return self.operand(value)

	def operand(self, value):
		if isinstance(value, str):
			return self.scalar(value)
		if isinstance(value, list | tuple):
			resolved = []
			for item in value:
				if item == OPEN_DEAL_STATUSES:
					# inside a value list the token stands for the names themselves
					resolved.extend(self.open_statuses())
				elif isinstance(item, str):
					resolved.append(self.scalar(item))
				else:
					resolved.append(item)
			return resolved
		return value

	def scalar(self, value: str):
		if not value.startswith(("@", "%@")):
			return value
		if value == "@me":
			return frappe.session.user
		if value == "%@me%":
			return f"%{frappe.session.user}%"
		if value == OPEN_DEAL_STATUSES:
			return self.open_statuses()
		match = TODAY_TOKEN.match(value)
		if match:
			sign, days = match.groups()
			offset = int(days or 0) * (-1 if sign == "-" else 1)
			return add_days(self.today(), offset) if offset else self.today()
		return value

	def today(self) -> str:
		if self._today is None:
			self._today = today()
		return str(self._today)

	def open_statuses(self) -> list[str]:
		if self._open_statuses is None:
			self._open_statuses = open_deal_statuses()
		return list(self._open_statuses)
