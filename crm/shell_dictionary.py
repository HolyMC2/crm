# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# GNU GPLv3 License. See license.txt

"""The translations the crm frontend uses, not every installed app's dictionary.

The build lists every string literal of its modules in `translation-keys.json`
(frontend/scripts/translation-keys.mjs). The shipped dictionary is the language
dictionary restricted to the keys the UI can ask for:

- the build's literals, and `message:context` keys whose parts both are keys;
- every DocType name, and the labels, descriptions and Select options of the
  DocTypes the build names, of their child tables and of the DocTypes they link
  to (labels the UI reads from DocType meta, status values the server sends, the
  fields of a "create new" dialog);
- the record names of translated DocTypes and of small DocTypes the build names
  (stages, lead sources);
- string literals in this app's Python, which sends some English the client
  translates (api/workload.py).

Values are copied as they are, so every shipped key translates exactly as before;
a key outside the set falls back to its English source in translate().
Without a translation-keys.json (vite dev server, an unbuilt tree) the whole
dictionary is shipped.
"""

import ast
import functools
import hashlib
import io
import json
import os
import tokenize

import frappe
from frappe.translate import (
	get_all_translations,
	get_parent_language,
	get_translated_doctypes,
	get_user_translations,
)

APP = "crm"
CACHE_KEY = "crm_shell_dictionary"
KEYS_FILE = ("public", "frontend", "translation-keys.json")
# A DocType the build names whose records are names the UI may translate (CRM Deal Status,
# CRM Lead Source); larger ones hold data, not vocabulary.
RECORD_LIMIT = 500
CACHE_SECONDS = 24 * 3600
# A queued build that never ran (the worker was killed, the job lost) is queued again after this.
QUEUED_SECONDS = 300
# The DocTypes a named DocType links to, whose labels open in "create new" dialogs.
TARGET_FIELDTYPES = ("Link", "Table", "Table MultiSelect")
SKIP_DIRS = ("public", "node_modules", "__pycache__", "tests", "patches")

_listing: dict[str, tuple[int, str, frozenset[str]]] = {}
_warned_missing: set[str] = set()


def build_literals() -> tuple[str, frozenset[str] | None]:
	"""The build's literals and a digest that changes with every build; (`full`, None) without a build."""
	path = frappe.get_app_path(APP, *KEYS_FILE)
	try:
		mtime = os.stat(path).st_mtime_ns
	except OSError:
		_warn_missing(path)
		return "full", None
	cached = _listing.get(path)
	if cached and cached[0] == mtime:
		return cached[1], cached[2]
	# The path is the app's own build output under get_app_path, never request input.
	with open(path, "rb") as f:  # nosemgrep: frappe-security-file-traversal
		raw = f.read()
	entry = (mtime, hashlib.sha1(raw).hexdigest()[:16], frozenset(json.loads(raw)["literals"]))
	_listing[path] = entry
	return entry[1], entry[2]


def script() -> tuple[str, bytes]:
	"""(version, classic script setting window.translated_messages) for the session language.

	Until the background build has run (a few seconds after a deploy, a build or a
	Translation edit) it is the whole dictionary under version "", which no page links.
	"""
	field = _field()
	cached = frappe.cache.hget(CACHE_KEY, "p|" + field)
	if cached is None:
		_queue_build(field)
		return "", _payload(_dictionary(frappe.local.lang))
	return cached


def version() -> str:
	"""The version the page links the script with; "" while the build is pending."""
	field = _field()
	current = frappe.cache.hget(CACHE_KEY, "v|" + field)
	if current is None:
		_queue_build(field)
		return ""
	return current


def build(lang: str, field: str) -> None:
	"""Background job: the key set reads DocType meta and the app's Python, seconds cold, so it
	never runs in a page request."""
	try:
		# A failed load raises here, so it is never cached: pages keep the whole dictionary
		# and the next page load queues the build again.
		payload = _payload(shipped_messages(_dictionary(lang, strict=True), build_literals()[1]))
		current = hashlib.sha256(payload).hexdigest()[:16]
		frappe.cache.hset(CACHE_KEY, "p|" + field, (current, payload))
		frappe.cache.hset(CACHE_KEY, "v|" + field, current)
		# The whole hash lives a day from its first field, so record names (a new stage or lead
		# source) join the set within a day, or at the next deploy (bench migrate clears the
		# cache) or Translation save, and fields of past builds do not pile up.
		if frappe.cache.ttl(frappe.cache.make_key(CACHE_KEY)) < 0:
			frappe.cache.expire_key(CACHE_KEY, CACHE_SECONDS)
	finally:
		frappe.cache.delete(_queued_key(field))


def _queue_build(field: str) -> None:
	marker = _queued_key(field)
	# The marker is already site-prefixed by make_key; set_value has no nx, which the dedupe needs.
	# nosemgrep: frappe-cache-breaks-multitenancy
	if not frappe.cache.set(marker, 1, nx=True, ex=QUEUED_SECONDS):
		return
	try:
		frappe.enqueue(
			f"{__name__}.build",
			queue="short",
			job_id=f"{CACHE_KEY}|{field}",
			deduplicate=True,
			lang=frappe.local.lang,
			field=field,
		)
	except Exception:
		frappe.cache.delete(marker)
		frappe.log_error("crm shell dictionary queue")


def _queued_key(field: str) -> str:
	return frappe.cache.make_key(f"{CACHE_KEY}|q|{field}")


def clear(*_args) -> None:
	"""after_migrate, and a DocType, Custom Field or Property Setter change: labels, options and
	DocType names may have moved, so the next page load builds the set again."""
	frappe.cache.delete_value(CACHE_KEY)


def _warn_missing(path: str) -> None:
	# Without the build's key list every page ships the whole dictionary; fine for vite dev, a
	# broken build anywhere else.
	if path in _warned_missing or frappe.conf.developer_mode:
		return
	_warned_missing.add(path)
	frappe.logger("crm").warning(f"{path} is missing: the whole translation dictionary is shipped")


def _field() -> str:
	lang = frappe.local.lang
	return f"{lang}|{build_literals()[0]}|{_user_translations_fingerprint(lang)}"


def _payload(messages: dict[str, str]) -> bytes:
	body = frappe.as_json(messages, indent=None, separators=(",", ":"), ensure_ascii=False)
	return f"window.translated_messages = {body};".encode()


def shipped_messages(dictionary: dict[str, str], literals: frozenset[str] | None) -> dict[str, str]:
	if literals is None:
		return dictionary
	keys = set(literals) | runtime_keys(literals)
	shipped = {key: value for key, value in dictionary.items() if key in keys}
	for key, value in dictionary.items():
		message, sep, context = key.rpartition(":")
		if sep and message in keys and context in keys:
			shipped[key] = value
	return shipped


def runtime_keys(literals: frozenset[str]) -> set[str]:
	"""Strings that reach __() at runtime without being literals of the build."""
	doctypes = {
		row.name: row
		for row in frappe.get_all("DocType", fields=["name", "istable", "issingle", "is_virtual"])
	}
	named = {name for name in doctypes if name in literals}
	# One level deep: child tables and Link targets, not what those link to.
	targets = {target for doctype in named for target in _targets(doctype) if target in doctypes}
	keys = set(doctypes)
	for doctype in named | targets:
		keys |= _doctype_strings(doctype)
	translated = set(get_translated_doctypes())
	small = {name for name in named if not (doctypes[name].istable or doctypes[name].issingle)}
	for doctype in translated | small:
		row = doctypes.get(doctype)
		if not row or row.issingle or row.is_virtual:
			continue
		names = frappe.get_all(doctype, pluck="name", limit=0 if doctype in translated else RECORD_LIMIT + 1)
		if doctype in translated or len(names) <= RECORD_LIMIT:
			keys.update(names)
	keys |= python_literals(APP)
	return keys


def _targets(doctype: str) -> set[str]:
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return set()
	return {field.options for field in meta.fields if field.fieldtype in TARGET_FIELDTYPES and field.options}


def _doctype_strings(doctype: str) -> set[str]:
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return set()
	strings = {meta.name, meta.description}
	for field in meta.fields:
		strings |= {field.label, field.description}
		if field.fieldtype == "Select" and field.options:
			strings |= set(field.options.split("\n"))
	strings.discard(None)
	return strings


@functools.cache
def python_literals(app: str) -> frozenset[str]:
	# Per process: the code only changes with a deploy, which restarts the workers.
	literals = set()
	root = frappe.get_app_path(app)
	for directory, subdirs, files in os.walk(root):
		subdirs[:] = [d for d in subdirs if d not in SKIP_DIRS and not d.startswith(".")]
		for name in files:
			# Tests never send text to the UI.
			if name.endswith(".py") and not name.startswith("test_"):
				literals |= _file_literals(os.path.join(directory, name))
	return frozenset(literals)


def _file_literals(path: str) -> set[str]:
	literals = set()
	try:
		# The path is a .py file the walk found under the app's own directory, never request input.
		with open(path, encoding="utf-8") as f:  # nosemgrep: frappe-security-file-traversal
			tokens = list(tokenize.generate_tokens(io.StringIO(f.read()).readline))
	except (OSError, SyntaxError, tokenize.TokenError, UnicodeDecodeError):
		return literals
	for token in tokens:
		if token.type != tokenize.STRING:
			continue
		try:
			value = ast.literal_eval(token.string)
		except (ValueError, SyntaxError):
			continue
		if isinstance(value, str) and value:
			literals.add(value)
	return literals


def _dictionary(lang: str, strict: bool = False) -> dict[str, str]:
	try:
		return get_all_translations(lang)
	except Exception:
		if strict:
			raise
		frappe.log_error("crm shell dictionary")
		return {}


def _user_translations_fingerprint(lang: str) -> str:
	# Saving a Translation drops Frappe's cached user translations for its language, so this
	# changes and the next page load gets a new version.
	langs = [lang, get_parent_language(lang)]
	rows = sorted(
		(code, key, value) for code in langs if code for key, value in get_user_translations(code).items()
	)
	return hashlib.sha1(repr(rows).encode()).hexdigest()[:12]
