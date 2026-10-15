"""Ctrl+K record provider for deals (CRM-S3.3): find the customer's work, not only their card.

A query matches a deal by its title, person, organization, email, phone (any spelling:
«695 122 3254», «+52 1 695…») or repair order number. Every word must appear somewhere,
so «karolina quevedo» and «quevedo iphone» both find «Apple iPhone 12 — Karolina
Quevedo». Results are permission-scoped through the native list query, open deals first,
then most recently touched.
"""

import re

import frappe
from frappe import _

LIMIT = 5
SCAN = 60
# Text a seller types to find a deal; all are plain Data columns on CRM Deal.
TEXT_FIELDS = (
	"name",
	"deal_name",
	"first_name",
	"last_name",
	"lead_name",
	"organization",
	"email",
	"mobile_no",
	"phone",
	"repair_order",
)
CLOSED_TYPES = ("Won", "Lost")


def _digits_sql(column, table="`tabCRM Deal`"):
	"""SQL that strips the separators people type in phone numbers."""
	expr = f"ifnull({table}.`{column}`, '')"
	for char in (" ", "-", "+", "(", ")", "."):
		expr = f"replace({expr}, '{char}', '')"
	return expr


def _words(q):
	return [word for word in re.split(r"\s+", q.strip()) if word][:6]


def _phone_digits(q):
	"""The national digits of a phone-like query (MX: last 10), or None."""
	if re.search(r"[^\d\s()+.-]", q):
		return None
	digits = re.sub(r"\D", "", q)
	if len(digits) < 6:
		return None
	return digits[-10:]


def _has_column(doctype, column):
	return frappe.get_meta(doctype).has_field(column) or column == "name"


def _candidates(q):
	"""Deal names matching the query (no permission yet; the native list applies it next)."""
	params = {}
	clauses = []
	fields = [field for field in TEXT_FIELDS if _has_column("CRM Deal", field)]
	haystack = "concat_ws(' ', {})".format(", ".join(f"`tabCRM Deal`.`{field}`" for field in fields))
	word_clauses = []
	for index, word in enumerate(_words(q)):
		params[f"w{index}"] = "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
		word_clauses.append(f"{haystack} like %(w{index})s")
	if word_clauses:
		clauses.append("(" + " and ".join(word_clauses) + ")")
		if frappe.db.table_exists("CRM Contacts"):
			# Older deals keep the person only in their contacts table.
			people = " and ".join(
				f"concat_ws(' ', c.contact, c.full_name) like %(w{index})s"
				for index in range(len(word_clauses))
			)
			clauses.append(
				"exists (select 1 from `tabCRM Contacts` c where c.parenttype = 'CRM Deal' "
				f"and c.parent = `tabCRM Deal`.name and {people})"
			)
	digits = _phone_digits(q)
	if digits:
		params["digits"] = f"%{digits}%"
		for column in ("mobile_no", "phone"):
			if _has_column("CRM Deal", column):
				clauses.append(f"{_digits_sql(column)} like %(digits)s")
		if frappe.db.table_exists("CRM Contacts"):
			# CRM Deal.validate derives mobile_no from the primary contact and clears it
			# otherwise: the number often lives only on the deal's contacts.
			clauses.append(
				"exists (select 1 from `tabCRM Contacts` c join `tabContact Phone` p "
				"on p.parenttype = 'Contact' and p.parent = c.contact "
				"where c.parenttype = 'CRM Deal' and c.parent = `tabCRM Deal`.name "
				f"and {_digits_sql('phone', 'p')} like %(digits)s)"
			)
	ro_tables = []
	if frappe.db.table_exists("CRM Deal Repair Order"):
		ro_tables.append(
			"`tabCRM Deal`.name in (select parent from `tabCRM Deal Repair Order` "
			"where parenttype = 'CRM Deal' and repair_order like %(ro)s)"
		)
	if _has_column("CRM Deal", "repair_order"):
		ro_tables.append("`tabCRM Deal`.repair_order like %(ro)s")
	if ro_tables and re.search(r"\d", q):
		params["ro"] = "%" + q.strip().replace("%", "\\%").replace("_", "\\_") + "%"
		clauses.extend(ro_tables)
	if not clauses:
		return []
	return frappe.db.sql_list(
		f"""select `tabCRM Deal`.name from `tabCRM Deal`
		where {" or ".join(clauses)}
		order by `tabCRM Deal`.modified desc limit {SCAN}""",
		params,
	)


def _closed_statuses():
	if not frappe.db.exists("DocType", "CRM Deal Status"):
		return set()
	return set(frappe.get_all("CRM Deal Status", filters={"type": ["in", CLOSED_TYPES]}, pluck="name"))


def deal_title(row, contact=None):
	"""The deal's title, unless it only repeats a channel («ana@…», a phone)."""
	person = " ".join(part for part in (row.get("first_name"), row.get("last_name")) if part)
	title = row.get("deal_name")
	if title and title in (row.get("email"), row.get("mobile_no"), row.get("phone")):
		title = None
	return title or row.get("organization") or row.get("lead_name") or person or contact or row.name


@frappe.whitelist(methods=["GET", "POST"])
def search_deals(q: str = "", limit: int = LIMIT):
	"""Deals for the command palette: open first, then most recently touched."""
	from crm.api import check_app_permission

	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if not check_app_permission():
		return []
	q = (q or "").strip()[:120] if isinstance(q, str) else ""
	if len(q) < 2:
		return []
	limit = min(max(int(limit or LIMIT), 1), 20)
	names = _candidates(q)
	if not names:
		return []
	fields = ["name", "status", "modified", "mobile_no", "email", "phone"] + [
		field
		for field in ("deal_name", "organization", "lead_name", "first_name", "last_name", "repair_order")
		if _has_column("CRM Deal", field)
	]
	# The native list applies role permissions, user permissions and CRM's query conditions.
	rows = frappe.get_list(
		"CRM Deal",
		filters={"name": ["in", names]},
		fields=fields,
		order_by="modified desc",
		limit_page_length=len(names),
	)
	closed = _closed_statuses()
	contacts = {}
	if frappe.db.table_exists("CRM Contacts"):
		for row in frappe.get_all(
			"CRM Contacts",
			filters={"parenttype": "CRM Deal", "parent": ["in", [row.name for row in rows]]},
			fields=["parent", "full_name", "contact", "is_primary"],
			order_by="is_primary desc, idx asc",
		):
			contacts.setdefault(row.parent, row.full_name or row.contact)
	rows.sort(key=lambda row: (row.status in closed, -(row.modified.timestamp() if row.modified else 0)))
	return [
		{
			"name": row.name,
			"title": deal_title(row, contacts.get(row.name)),
			"person": " ".join(part for part in (row.get("first_name"), row.get("last_name")) if part)
			or row.get("lead_name")
			or contacts.get(row.name),
			"organization": row.get("organization"),
			"mobile_no": row.get("mobile_no"),
			"repair_order": row.get("repair_order"),
			"status": row.status,
			"status_label": _(row.status) if row.status else None,
			"closed": row.status in closed,
			"modified": str(row.modified),
		}
		for row in rows[:limit]
	]
