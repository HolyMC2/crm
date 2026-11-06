import frappe

# The bucket in the DocType slot of the connection's value cache that holds
# the set of installed names (no DocType can carry this name).
_NAMES = "__installed_doctypes__"


def doctype_exists(doctype: str) -> bool:
	"""Whether `doctype` is installed on this site.

	`frappe.db.exists("DocType", ...)` reads tabDocType on every call, and one
	shell boot asks about some 60 distinct names (F18, F23). The first ask of
	a request reads every DocType name in one query and keeps the set in the
	connection's value cache, in the DocType slot; the rest of the request
	answers from memory. Frappe clears that cache on every commit and rollback
	and drops the DocType slot whenever a DocType is saved or deleted
	(clear_document_cache), so an install or a removal is seen at the next
	ask, in the same transaction.
	crm runs without doco, so it keeps its own copy of doco's helper.
	"""
	cache = getattr(frappe.db, "value_cache", None)
	if not isinstance(cache, dict):
		# A bench-free test with a stand-in frappe: the plain read.
		return bool(frappe.db.exists("DocType", doctype))
	bucket = cache["DocType"][_NAMES]
	names = bucket.get("names")
	if not isinstance(names, frozenset):
		names = bucket["names"] = frozenset(frappe.db.sql("SELECT `name` FROM `tabDocType`", pluck=True))
	return doctype in names
