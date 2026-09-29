# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Virtual list columns: values computed per page of rows instead of selected in SQL.

Any installed app may register providers in its hooks.py::

        crm_virtual_list_columns = {"CRM Deal": ["my_app.crm_columns"]}

A provider module exposes

- ``columns(doctype) -> list[dict]``: descriptors ``{key, label, fieldtype, width,
  virtual: 1, sortable: 0, filterable: 0, groupable: 0|1}``; keys start with ``_v_``.
- ``enrich(doctype, rows, keys) -> None``: fills ``keys`` in place, batched and
  permission-aware; a related record the user may not read stays None.
- optionally ``format_export(doctype, key, value) -> str`` for values that are not
  plain scalars (used by the export).

crm itself stays app-agnostic: a provider that fails to import or raises is logged
and skipped, and its keys stay None, so the native list always answers.
"""

import frappe
from frappe import _

HOOK = "crm_virtual_list_columns"
PREFIX = "_v_"
DESCRIPTOR_DEFAULTS = {"fieldtype": "Data", "width": "10rem", "groupable": 0}


def is_virtual(key) -> bool:
	return isinstance(key, str) and key.startswith(PREFIX)


def split_virtual(keys) -> tuple[list, list[str]]:
	"""(native keys, virtual keys) in their original order."""
	native, virtual = [], []
	for key in keys or []:
		(virtual if is_virtual(key) else native).append(key)
	return native, virtual


def strip_virtual_order_by(order_by: str | None) -> str:
	"""Drop ``_v_*`` terms from an ORDER BY; '' when nothing native is left."""
	if not order_by:
		return ""
	parts = [part.strip() for part in str(order_by).split(",")]
	kept = [part for part in parts if part and not is_virtual(part.split()[0].strip("`"))]
	return ", ".join(kept)


def hook_paths(doctype: str) -> list[str]:
	"""Dotted provider paths registered under the hook by installed apps."""
	return list(frappe.get_hooks(HOOK, {}).get(doctype) or [])


def providers(doctype: str) -> list:
	"""Provider modules registered for ``doctype`` by installed apps, in hook order."""
	paths = hook_paths(doctype)
	modules, seen = [], set()
	for path in paths:
		if path in seen:
			continue
		seen.add(path)
		try:
			modules.append(frappe.get_module(path))
		except Exception:
			frappe.log_error(title=f"Virtual column provider {path} failed to import")
	return modules


def provider_columns(doctype: str) -> list[tuple[object, dict]]:
	"""(provider, descriptor) pairs; the first provider to claim a key owns it."""
	pairs, owned = [], set()
	for provider in providers(doctype):
		try:
			descriptors = provider.columns(doctype) or []
		except Exception:
			frappe.log_error(title=f"Virtual column provider {provider.__name__} failed to describe")
			continue
		for descriptor in descriptors:
			descriptor = _normalise(descriptor)
			if descriptor and descriptor["key"] not in owned:
				owned.add(descriptor["key"])
				pairs.append((provider, descriptor))
	return pairs


@frappe.whitelist(methods=["GET"])
def get_virtual_columns(doctype: str) -> list[dict]:
	"""Descriptors of every virtual column the installed apps offer for ``doctype``."""
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return [descriptor for _provider, descriptor in provider_columns(doctype)]


def enrich_rows(doctype: str, rows: list[dict], keys) -> None:
	"""Fill the requested virtual ``keys`` on ``rows`` in place.

	Rows keep their order. Every requested key ends up present (None when no
	provider owns it or its provider failed), so the client sees a stable shape.
	"""
	keys = {key for key in keys or [] if is_virtual(key)}
	if not rows or not keys:
		return
	for row in rows:
		for key in keys:
			row.setdefault(key, None)
	by_provider: dict = {}
	for provider, descriptor in provider_columns(doctype):
		if descriptor["key"] in keys:
			by_provider.setdefault(provider, set()).add(descriptor["key"])
	for provider, provider_keys in by_provider.items():
		try:
			provider.enrich(doctype, rows, provider_keys)
		except Exception:
			frappe.log_error(title=f"Virtual column provider {provider.__name__} failed to enrich")
			for row in rows:
				for key in provider_keys:
					row[key] = None


def export_value(doctype: str, key: str, value):
	"""A virtual value as one spreadsheet cell."""
	if value is None or isinstance(value, str | int | float):
		return value
	for provider, descriptor in provider_columns(doctype):
		if descriptor["key"] == key and hasattr(provider, "format_export"):
			try:
				return provider.format_export(doctype, key, value)
			except Exception:
				frappe.log_error(title=f"Virtual column provider {provider.__name__} failed to export")
				return None
	if isinstance(value, dict):
		return value.get("label") or value.get("title") or value.get("value")
	return str(value)


def _normalise(descriptor) -> dict | None:
	if not isinstance(descriptor, dict) or not is_virtual(descriptor.get("key")):
		return None
	normalised = {**DESCRIPTOR_DEFAULTS, **descriptor}
	normalised.update(virtual=1, sortable=0, filterable=0)
	normalised["groupable"] = 1 if normalised.get("groupable") else 0
	normalised["label"] = str(normalised.get("label") or normalised["key"])
	return normalised
