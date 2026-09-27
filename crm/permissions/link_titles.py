"""Project native Desk titles from current readable references and target scope."""

import frappe

from crm.permissions.activity_history import DOCTYPES, _fields

MAX_REFERENCES = 2000


def _references(doc, fields, titles):
	for field in fields.values():
		if field.fieldtype == "Link":
			doctype = field.options
		elif field.fieldtype == "Dynamic Link" and field.options in fields:
			doctype = doc.get(field.options)
		else:
			continue
		name = doc.get(field.fieldname)
		if (
			isinstance(doctype, str)
			and 0 < len(doctype) <= 140
			and isinstance(name, str)
			and 0 < len(name) <= 140
			and doctype + "::" + name in titles
		):
			yield doctype, name


def project(doc, titles, user):
	"""Only remove title entries; the framework retains their original values."""
	if not isinstance(doc, dict) or not isinstance(titles, dict):
		return {}
	doctype = doc.get("doctype")
	if doctype not in DOCTYPES:
		return titles
	# This boundary belongs to the current Desk request. Refuse cross-actor
	# calls instead of evaluating session-dependent query hooks as another user.
	if (
		not isinstance(user, str)
		or user != frappe.session.user
		or not doc.get("name")
		or not frappe.has_permission(doctype, "read", doc=doc["name"], user=user)
	):
		raise frappe.PermissionError("Not permitted")
	if not titles or len(titles) > MAX_REFERENCES:
		return {}
	cache = {}
	fields = _fields(doctype, user, cache=cache)
	references = set(_references(doc, fields, titles))
	row_count = 0
	for field in fields.values():
		if field.fieldtype not in {"Table", "Table MultiSelect"} or not field.options:
			continue
		rows = doc.get(field.fieldname) or []
		if not isinstance(rows, list):
			return {}
		row_count += len(rows)
		if row_count > MAX_REFERENCES:
			return {}
		child_fields = _fields(field.options, user, parenttype=doctype, cache=cache)
		for row in rows:
			if isinstance(row, dict) and row.get("doctype") == field.options:
				references.update(_references(row, child_fields, titles))
	groups = {}
	for target_type, name in references:
		groups.setdefault(target_type, set()).add(name)
	allowed = set()
	for target_type, names in groups.items():
		try:
			meta = frappe.get_meta(target_type)
			if (
				meta.istable
				or meta.issingle
				or not meta.show_title_field_in_link
				or not meta.title_field
				or (
					meta.title_field != "name"
					and meta.title_field not in _fields(target_type, user, cache=cache)
				)
			):
				continue
			readable = frappe.get_list(
				target_type,
				filters={"name": ["in", sorted(names)]},
				fields=["name"],
				limit_page_length=len(names),
				order_by="name",
				user=user,
			)
			for row in readable:
				name = row.get("name")
				# List conditions and per-record hooks are distinct native gates.
				# Deduplicating references keeps a repeated child Link from
				# repeating its target authority check.
				if name in names and frappe.has_permission(
					target_type, "read", doc=name, user=user, print_logs=False
				):
					allowed.add(target_type + "::" + name)
		except (frappe.PermissionError, frappe.DoesNotExistError):
			continue
	return {key: value for key, value in titles.items() if key in allowed}
