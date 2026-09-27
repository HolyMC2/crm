"""Current recipient permissions for native CRM history, without changing stored audit data."""

import html
import math

import frappe
from frappe.model import get_permitted_fields

DOCTYPES = {"CRM Lead", "CRM Deal"}
MAX_CHANGES = 2000
MAX_VALUE = 100_000
STRUCTURAL = {"name", "idx", "doctype", "parentfield"}


def require_framework(*args, **kwargs):
	from frappe.core.doctype.version import version
	from frappe.desk.form import load

	if (
		getattr(version, "VERSION_HISTORY_FILTER_VERSION", 0) != 1
		or getattr(load, "LINK_TITLES_FILTER_VERSION", 0) != 1
	):
		frappe.throw(
			frappe._("CRM requires the supported Muelle history privacy base before installation or use."),
			frappe.PermissionError,
		)


def _scalar(value):
	return (
		value is None
		or type(value) in (bool, int)
		or (type(value) is float and math.isfinite(value))
		or (isinstance(value, str) and len(value) <= MAX_VALUE)
	)


def _fields(doctype, user, *, parenttype=None, cache=None):
	key = (doctype, parenttype, user)
	if cache is not None and key in cache:
		return cache[key]
	fields = _readable_fields(doctype, user, parenttype=parenttype)
	if cache is not None:
		cache[key] = fields
	return fields


def _readable_fields(doctype, user, *, parenttype=None):
	meta = frappe.get_meta(doctype)
	if user == "Administrator":
		return {field.fieldname: field for field in meta.fields if field.fieldtype != "Password"}
	permitted = set(get_permitted_fields(doctype, user=user, parenttype=parenttype, permission_type="read"))
	levels = set(meta.get_permlevel_access("read", parenttype=parenttype, user=user))
	if not meta.get_permissions(parenttype=parenttype) or (
		0 not in levels and frappe.share.get_shared(parenttype or doctype, user, rights=["read"], limit=1)
	):
		levels.add(0)
	# Native get_masked_fields uses the session actor, which can be Administrator
	# while a digest is being assembled for another user. Keep recipient explicit.
	unmasked = set(meta.get_permlevel_access("mask", parenttype=parenttype, user=user))
	return {
		field.fieldname: field
		for field in meta.fields
		if field.fieldtype != "Password"
		and not (field.get("mask") and (field.permlevel or 0) not in unmasked)
		and (
			field.fieldname in permitted
			or (field.fieldtype in {"Table", "Table MultiSelect"} and (field.permlevel or 0) in levels)
		)
	}


def _value(field, value, user):
	if not _scalar(value):
		return None
	if field.fieldtype in {"Link", "Dynamic Link"}:
		# Native Versions may store a historical title instead of a target ID,
		# without recording the former title field. Display/title metadata can
		# later change or disappear. Current metadata cannot authorize that text.
		# Keep the event, but never guess an old target or export its opaque title.
		return ""
	return value


def _changes(changes, fields, user, *, pseudo=False):
	if not isinstance(changes, list) or len(changes) > MAX_CHANGES:
		return []
	result = []
	for change in changes:
		if not isinstance(change, (list, tuple)) or len(change) != 3 or not isinstance(change[0], str):
			continue
		name, old, new = change
		if not _scalar(old) or not _scalar(new):
			continue
		if pseudo and name in {"name", "docstatus"}:
			result.append([name, old, new])
		elif (field := fields.get(name)) and field.fieldtype not in {"Table", "Table MultiSelect"}:
			result.append([name, _value(field, old, user), _value(field, new, user)])
	return result


def _table(name, fields, user, parenttype, cache):
	field = fields.get(name) if isinstance(name, str) else None
	if not field or field.fieldtype not in {"Table", "Table MultiSelect"} or not field.options:
		return None
	try:
		return field, _fields(field.options, user, parenttype=parenttype, cache=cache)
	except frappe.DoesNotExistError:
		return None


def _rows(rows, fields, user, parenttype, cache):
	if not isinstance(rows, list) or len(rows) > MAX_CHANGES:
		return []
	result = []
	for entry in rows:
		if not isinstance(entry, (list, tuple)) or len(entry) != 2 or not isinstance(entry[1], dict):
			continue
		table = _table(entry[0], fields, user, parenttype, cache)
		if not table:
			continue
		field, child_fields = table
		row = entry[1]
		if row.get("doctype", field.options) != field.options or len(row) > MAX_CHANGES:
			continue
		projected = {
			name: _value(child_fields[name], value, user)
			for name, value in row.items()
			if name in child_fields
			and name not in STRUCTURAL
			and child_fields[name].fieldtype not in {"Table", "Table MultiSelect"}
			and _scalar(value)
		}
		# A row of entirely denied values must not expose its structural identity.
		if not projected:
			continue
		projected.update(doctype=field.options, parentfield=field.fieldname)
		if isinstance(row.get("name"), str) and len(row["name"]) <= 140:
			projected["name"] = row["name"]
		if type(row.get("idx")) is int and row["idx"] >= 0:
			projected["idx"] = row["idx"]
		result.append([field.fieldname, projected])
	return result


def _row_changes(rows, fields, user, parenttype, cache):
	if not isinstance(rows, list) or len(rows) > MAX_CHANGES:
		return []
	result = []
	for row in rows:
		if (
			not isinstance(row, (list, tuple))
			or len(row) != 4
			or type(row[1]) is not int
			or row[1] < 0
			or not isinstance(row[2], str)
			or len(row[2]) > 140
		):
			continue
		table = _table(row[0], fields, user, parenttype, cache)
		if table and (changes := _changes(row[3], table[1], user)):
			result.append([row[0], row[1], row[2], changes])
	return result


def project(doctype, docname, data, user):
	"""Installed hook receives already selected data and an explicit native recipient."""
	if doctype not in DOCTYPES:
		return data
	if not isinstance(user, str) or not frappe.has_permission(doctype, "read", doc=docname, user=user):
		raise frappe.PermissionError("Not permitted")
	if not isinstance(data, dict):
		return None
	cache = {}
	fields = _fields(doctype, user, cache=cache)
	result = {
		"changed": _changes(data.get("changed", []), fields, user, pseudo=True),
		"added": _rows(data.get("added", []), fields, user, doctype, cache),
		"removed": _rows(data.get("removed", []), fields, user, doctype, cache),
		"row_changed": _row_changes(data.get("row_changed", []), fields, user, doctype, cache),
	}
	# Native Desk requires an updater reference to render creation. Preserve that
	# event with fixed text; historical import/batch labels and URLs can identify
	# records the current reader cannot access.
	if isinstance(data.get("updater_reference"), dict) and data["updater_reference"]:
		result["updater_reference"] = {"label": frappe._("from a recorded source")}
	if isinstance(data.get("creation"), str) and len(data["creation"]) <= 64:
		result["creation"] = data["creation"]
		if isinstance(data.get("created_by"), str) and len(data["created_by"]) <= 140:
			result["created_by"] = data["created_by"]
	if not any(result.get(key) for key in ("changed", "added", "removed", "row_changed", "created_by")):
		return None
	# Audit attribution belongs to the readable document's history. Desk inserts
	# audit_user directly into HTML; encode it once at this output boundary.
	if isinstance(data.get("audit_user"), str) and len(data["audit_user"]) <= 140:
		result["audit_user"] = html.escape(data["audit_user"])
	actor = data.get("impersonated_by")
	if (
		isinstance(actor, str)
		and len(actor) <= 140
		and frappe.db.exists("User", actor)
		and frappe.has_permission("User", "read", doc=actor, user=user)
	):
		result["impersonated_by"] = actor
	if type(data.get("data_import")) in (bool, int):
		result["data_import"] = bool(data["data_import"])
	return result
