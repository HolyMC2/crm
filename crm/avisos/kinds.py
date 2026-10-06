"""Pure Avisos classification: category, kind and group keys (bench-free tests).

One aviso row is one notification addressed to one person. Rows that say the
same thing about the same record collapse into one group, so 451 copies of a
recurring alert read as one line with a count of 451 instead of burying the mentions.
"""

import html
import re

CATEGORIES = ("direct", "messages", "alerts", "system")
MODES = ("badge", "quiet", "off")
DEFAULT_MODES = {"direct": "badge", "messages": "badge", "alerts": "badge", "system": "quiet"}
# Direct work addressed to a person by a person is never muted wholesale.
MUTABLE = frozenset(("messages", "alerts", "system"))

NATIVE_DIRECT = frozenset(("Mention", "Assignment", "Share"))
CRM_DIRECT = frozenset(("Mention", "Assignment", "Task"))
_CRM_MESSAGES = frozenset(("WhatsApp", "Form"))
_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")
# The stable part of an alert title ends where its variable detail starts.
_DETAIL = re.compile(r"\s*(?::|\s—\s|\s-\s|\.\s)")
KEY_SEPARATOR = "|"


def plain(value, limit=None):
	"""Notification HTML as one line of text (never rendered as HTML)."""
	text = html.unescape(_TAG.sub(" ", str(value or "")))
	text = _SPACE.sub(" ", text).strip()
	if limit and len(text) > limit:
		return text[: limit - 1].rstrip() + "…"
	return text


def fold(title):
	"""The repeatable part of an alert title: digits folded, detail after ':'/'—' dropped."""
	text = plain(title)
	head = _DETAIL.split(text, maxsplit=1)[0]
	if len(head) >= 8:
		text = head
	text = _NUMBER.sub("#", text)
	return text[:120]


def category(row):
	"""direct · messages · alerts · system for a normalized aviso row."""
	kind = row.get("type") or ""
	if row.get("source") == "crm":
		if kind in _CRM_MESSAGES:
			return "messages"
		return "direct" if kind in CRM_DIRECT else "alerts"
	if kind in NATIVE_DIRECT:
		return "direct"
	if kind == "Energy Point":
		return "system"
	return "alerts" if (row.get("doctype") and row.get("docname")) or row.get("link") else "system"


def _clean(part):
	return str(part or "").replace(KEY_SEPARATOR, "/")


def kind_key(row, cat=None):
	"""What a «Silenciar este tipo» mutes: the same kind of alert on any record."""
	cat = cat or category(row)
	detail = fold(row.get("title")) if cat in ("alerts", "system") else ""
	parts = (cat, row.get("source"), row.get("type"), row.get("doctype"), detail)
	return KEY_SEPARATOR.join(_clean(part) for part in parts)


def group_key(row, cat=None):
	"""Rows that collapse into one line: same kind on the same record."""
	cat = cat or category(row)
	base = kind_key(row, cat)
	if cat == "system":
		return base
	record = row.get("docname") or row.get("link")
	if not record:
		# A direct notice with nothing to open stays its own line.
		record = f"#{row.get('name')}"
	return base + KEY_SEPARATOR + _clean(record)


def key_category(key):
	"""Category encoded in a kind or group key, or None for a forged key."""
	head = str(key or "").split(KEY_SEPARATOR, 1)[0]
	return head if head in CATEGORIES else None


def kind_label(key):
	"""Readable name of a muted kind: its alert title, else type and record type."""
	parts = str(key or "").split(KEY_SEPARATOR)
	parts += [""] * (5 - len(parts))
	_cat, _source, kind, doctype, detail = parts[:5]
	return detail or " · ".join(part for part in (kind, doctype) if part) or str(key)


def normalize_prefs(raw):
	"""User preferences with unknown categories/modes dropped and defaults filled."""
	raw = raw if isinstance(raw, dict) else {}
	modes = dict(DEFAULT_MODES)
	for cat, mode in (raw.get("categories") or {}).items():
		if cat in CATEGORIES and mode in MODES:
			modes[cat] = mode
	if modes["direct"] == "off":
		modes["direct"] = "quiet"
	muted = []
	for key in raw.get("muted") or []:
		if isinstance(key, str) and key_category(key) in MUTABLE and key not in muted and len(key) <= 400:
			muted.append(key)
	return {"categories": modes, "muted": muted[-200:]}


def visibility(row_cat, row_kind, prefs):
	"""badge · quiet · off for a row under the user's preferences."""
	if row_kind in prefs["muted"]:
		return "off"
	return prefs["categories"].get(row_cat, "badge")
