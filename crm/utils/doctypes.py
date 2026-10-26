import frappe


def doctype_exists(doctype: str) -> bool:
	"""Whether `doctype` is installed on this site.

	`frappe.db.exists("DocType", ...)` reads tabDocType on every call, and one
	Hoy load asked about the same few names 160 times (F18). `cache=True` keeps
	each answer in the connection's value cache, which Frappe clears on every
	commit and rollback. Saving or deleting a DocType also drops the cached
	answers, so a request reads each name once and still sees an install or a
	removal at the next read, in the same transaction.
	crm runs without doco, so it keeps its own copy of doco's helper.
	"""
	return bool(frappe.db.exists("DocType", doctype, cache=True))
