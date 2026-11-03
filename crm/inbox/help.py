"""Help center: published Help Articles (the site's public knowledge base) an agent can
find and share as a link while answering a customer."""

import frappe
from frappe.utils import cint, get_url, strip_html

ARTICLE = "Help Article"
MAX_RESULTS = 10
SCAN = 500


def search_help(query="", limit=MAX_RESULTS):
	"""Published articles whose title or text holds every word of the query, newest first."""
	if not frappe.db.exists("DocType", ARTICLE):
		return []
	needles = [w.casefold() for w in (query or "").split()][:5]
	size = min(max(cint(limit), 1), MAX_RESULTS)
	found = []
	for row in frappe.get_all(
		ARTICLE,
		filters={"published": 1},
		fields=["name", "title", "route", "content", "category"],
		order_by="modified desc",
		limit=SCAN,
		ignore_permissions=True,
	):
		text = " ".join(strip_html(row.content or "").split())
		haystack = f"{row.title} {text}".casefold()
		if all(n in haystack for n in needles):
			found.append(
				{
					"name": row.name,
					"title": row.title,
					"category": row.category,
					"url": get_url("/" + row.route) if row.route else None,
					"snippet": text[:200],
				}
			)
			if len(found) == size:
				break
	return found
