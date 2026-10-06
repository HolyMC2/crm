"""Fail when a gettext catalog defines the same message twice.

crm/locale/*.po merges with git's union driver (see .gitattributes), so two lanes
adding the same string keep both copies; msgfmt and Frappe's compiler reject that.
"""

import re
import sys

ENTRY = re.compile(r'^(?:msgctxt "(?P<ctx>(?:[^"\\]|\\.)*)"\n)?msgid "(?P<id>(?:[^"\\]|\\.)*)"$', re.M)


def duplicates(path):
	seen, dupes = {}, []
	with open(path, encoding="utf-8") as catalog:
		text = catalog.read()
	for match in ENTRY.finditer(text):
		key = (match["ctx"], match["id"])
		if not key[1]:
			continue
		line = text.count("\n", 0, match.start()) + 1
		if key in seen:
			dupes.append((line, seen[key], key[1]))
		else:
			seen[key] = line
	return dupes


def main(paths):
	failed = False
	for path in paths:
		for line, first, msgid in duplicates(path):
			failed = True
			print(f"{path}:{line}: duplicate msgid (first at line {first}): {msgid[:80]}")
	return 1 if failed else 0


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
