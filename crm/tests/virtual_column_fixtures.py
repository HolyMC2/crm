"""A virtual column provider used by the list unification tests only."""

CALLS: list[dict] = []


def columns(doctype):
	return [
		{"key": "_v_fixture", "label": "Fixture", "fieldtype": "Data", "groupable": 1},
		# not virtual: a provider may not claim a native key
		{"key": "deal_name", "label": "Hijack"},
	]


def enrich(doctype, rows, keys):
	CALLS.append({"doctype": doctype, "names": [row.get("name") for row in rows], "keys": set(keys)})
	for row in rows:
		row["_v_fixture"] = f"fx-{row['name']}"


def format_export(doctype, key, value):
	return value
