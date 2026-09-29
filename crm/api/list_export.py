# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""List export that sees exactly what the list sees.

Rows come from ``frappe.get_list`` with the list's resolved filter tokens and the
user's own permissions; virtual ``_v_*`` columns are filled by the same providers as
``crm.api.doc.get_data``. Headers are the column labels.
"""

import csv
import io

import frappe
from frappe import _
from frappe.model import get_permitted_fields

from crm.api.list_columns import enrich_rows, export_value, is_virtual, provider_columns
from crm.api.list_tokens import resolve_filter_tokens

STANDARD_LABELS = {
	"name": "ID",
	"owner": "Created By",
	"creation": "Created On",
	"modified": "Last Modified",
	"modified_by": "Modified By",
	"_assign": "Assigned To",
	"_liked_by": "Like",
	"_user_tags": "Tags",
}
FORMATS = ("Excel", "CSV")


@frappe.whitelist(methods=["GET"])
def export_list(
	doctype: str,
	fields: str | list,
	filters: str | dict | list | None = None,
	order_by: str | None = None,
	page_length: int | None = None,
	file_format: str = "Excel",
	selected_items: str | list | None = None,
	view: str | dict | None = None,
	or_filters: str | dict | list | None = None,
	default_filters: str | dict | None = None,
):
	"""Stream the list as Excel or CSV; see the module docstring for the guarantees."""
	if file_format not in FORMATS:
		frappe.throw(_("Unsupported export format: {0}").format(file_format))
	if not frappe.has_permission(doctype, "export"):
		frappe.throw(_("You are not allowed to export {0}").format(_(doctype)), frappe.PermissionError)

	header, data = build_export(
		doctype,
		fields,
		filters=filters,
		order_by=order_by,
		page_length=page_length,
		selected_items=selected_items,
		view=view,
		or_filters=or_filters,
		default_filters=default_filters,
	)
	title = _(doctype)
	if file_format == "CSV":
		buffer = io.StringIO()
		csv.writer(buffer, quoting=csv.QUOTE_NONNUMERIC).writerows([header, *data])
		content, extension = buffer.getvalue().encode("utf-8-sig"), "csv"
	else:
		from frappe.utils.xlsxutils import make_xlsx

		content, extension = make_xlsx([header, *data], title[:31]).getvalue(), "xlsx"

	frappe.response["filename"] = f"{title}.{extension}"
	frappe.response["filecontent"] = content
	frappe.response["type"] = "binary"


def build_export(
	doctype,
	fields,
	filters=None,
	order_by=None,
	page_length=None,
	selected_items=None,
	view=None,
	or_filters=None,
	default_filters=None,
) -> tuple[list[str], list[list]]:
	"""(header labels, rows) for the export, permission-checked by frappe.get_list."""
	from crm.api.doc import _native_order_by

	columns = _columns(doctype, frappe.parse_json(fields) or [])
	if not columns:
		frappe.throw(_("Select at least one column to export."))

	filters = resolve_filter_tokens(frappe.parse_json(filters)) or {}
	if default_filters:
		filters = _merge(filters, resolve_filter_tokens(frappe.parse_json(default_filters)))
	or_filters = resolve_filter_tokens(frappe.parse_json(or_filters)) if or_filters else None
	selected = frappe.parse_json(selected_items) if selected_items else None
	if selected:
		filters = _merge(filters, {"name": ["in", list(selected)]}, overwrite=False)

	view = frappe.parse_json(view) if view else {}
	view_name = view.get("custom_view_name") if isinstance(view, dict) else None
	native = [key for key, _label in columns if not is_virtual(key)]
	virtual = {key for key, _label in columns if is_virtual(key)}
	sql_fields = list(dict.fromkeys(["name", *native])) if virtual else native

	rows = frappe.get_list(
		doctype,
		fields=sql_fields,
		filters=filters,
		or_filters=or_filters,
		order_by=_native_order_by(doctype, order_by, view_name),
		limit_page_length=int(page_length or 0),
	)
	enrich_rows(doctype, rows, virtual)

	header = [label for _key, label in columns]
	data = [
		[
			export_value(doctype, key, row.get(key)) if is_virtual(key) else row.get(key)
			for key, _label in columns
		]
		for row in rows
	]
	return header, data


def _columns(doctype, fields) -> list[tuple[str, str]]:
	"""(key, header) pairs the user may export, in the order asked.

	Native fields the user cannot read (permlevel) and virtual keys no installed
	provider offers are left out rather than exported empty.
	"""
	meta = frappe.get_meta(doctype)
	permitted = set(get_permitted_fields(doctype, permission_type="read"))
	masked = {field.fieldname for field in meta.get_masked_fields()}
	virtual_labels = {descriptor["key"]: descriptor["label"] for _p, descriptor in provider_columns(doctype)}
	columns, seen = [], set()
	for field in fields:
		key = (field.get("key") or field.get("fieldname")) if isinstance(field, dict) else field
		if not isinstance(key, str) or key in seen:
			continue
		given = field.get("label") if isinstance(field, dict) else None
		if is_virtual(key):
			if key not in virtual_labels:
				continue
			label = virtual_labels[key]
		elif key in STANDARD_LABELS:
			label = _(STANDARD_LABELS[key])
		elif meta.get_field(key) and key in permitted and key not in masked:
			label = _(meta.get_field(key).label or key)
		else:
			continue
		seen.add(key)
		columns.append((key, _(given) if given else label))
	return columns


def _merge(filters, extra, overwrite=True):
	"""AND two filter sets, whichever of the dict/list forms they use.

	Two dicts merge like get_data's ``filters.update(default_filters)``.
	"""
	if not extra:
		return filters
	if not filters:
		return extra
	if isinstance(filters, dict) and isinstance(extra, dict) and (overwrite or not set(filters) & set(extra)):
		return {**filters, **extra}
	return _as_list(filters) + _as_list(extra)


def _as_list(filters):
	if isinstance(filters, dict):
		return [
			[key, *(value if isinstance(value, list) and len(value) == 2 else ["=", value])]
			for key, value in filters.items()
		]
	return list(filters)
