"""A virtual column provider that fails while enriching (list unification tests)."""


def columns(doctype):
	return [{"key": "_v_broken", "label": "Broken"}]


def enrich(doctype, rows, keys):
	for row in rows:
		row["_v_broken"] = "partial"
	raise RuntimeError("provider failure under test")
