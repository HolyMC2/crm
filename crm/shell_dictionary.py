# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# GNU GPLv3 License. See license.txt

"""The translations the crm frontend uses, not every installed app's dictionary.

The build lists every string literal of its modules in `translation-keys.json`
(frontend/scripts/translation-keys.mjs). The shipped dictionary is the language
dictionary restricted to the keys the UI can ask for:

- the build's literals, and `message:context` keys whose parts both are keys;
- every DocType name but child tables' (a notification or a link names its
  DocType), and the labels and Select options of the DocTypes the build names,
  of their child tables and of the DocTypes they link to (labels the UI reads
  from DocType meta, status values the server sends, the fields of a "create
  new" dialog). Field descriptions are not shipped: the UI shows them as they
  are, and they were a fifth of the payload;
- the record names of small DocTypes the build names (stages, lead sources) and
  of translated DocTypes among the named ones and their link targets (a
  country list the whole site translates is vocabulary only where a form
  shows it);
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
import re
import time
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
# The site folder that keeps each built set across cache clears, deploys and meta changes.
STORE_DIR = "crm-shell-dictionary"
# In STORE_DIR: when a DocType, Custom Field or Property Setter last changed. A set built before
# it is still served (its labels are at most that change behind) while its rebuild runs.
CHANGED_FILE = "changed"
# Built sets kept per language: the current one and the one before it.
KEEP_PER_LANGUAGE = 2
STORED_NAME = re.compile(r"^(?P<lang>[0-9a-f]{8})-[0-9a-f]{24}\.json$")
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

	While the set for this build is being built (a few seconds after a deploy, a meta change or a
	Translation edit) it is the last set stored for the language, under its own version; only a
	language with no stored set yet gets the whole dictionary under version "", which no page
	links.
	"""
	field = _field()
	entry = _entry(field)
	if entry is None:
		_queue_build(field)
		return "", _payload(_dictionary(frappe.local.lang))
	return entry


def version() -> str:
	"""The version the page links the script with; "" while a language's first build is pending."""
	field = _field()
	current = frappe.cache.hget(CACHE_KEY, "v|" + field)
	if current is not None:
		return current
	entry = _entry(field)
	if entry is None:
		_queue_build(field)
		return ""
	return entry[0]


def _entry(field: str) -> tuple[str, bytes] | None:
	"""The set to serve for this field: its own build, or while that is pending the last set stored
	for its language (queuing the build); None when the language has no set yet."""
	cached = frappe.cache.hget(CACHE_KEY, "p|" + field)
	if cached is not None:
		if frappe.cache.hget(CACHE_KEY, "v|" + field) is None:
			# A set served while its build runs: queue again if that job was lost (the marker lapsed).
			_queue_build(field)
		return tuple(cached[:2])
	restored = _restore(field)
	if restored is None:
		return None
	current, payload, fresh = restored
	_cache(field, current, payload, fresh=fresh)
	if not fresh:
		_queue_build(field)
	return current, payload


def build(lang: str, field: str) -> None:
	"""Background job: the key set reads DocType meta and the app's Python, seconds cold, so it
	never runs in a page request."""
	built = time.time()
	try:
		# A failed load raises here, so it is never cached: pages keep the last stored set (or
		# the whole dictionary) and the next page load queues the build again.
		payload = _payload(shipped_messages(_dictionary(lang, strict=True), build_literals()[1]))
		current = hashlib.sha256(payload).hexdigest()[:16]
		_store(field, current, payload, built)
		# A meta change while this ran: the set is served, but built again.
		_cache(field, current, payload, fresh=_changed_at() <= built)
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
	"""A DocType, Custom Field or Property Setter change: labels, options and DocType names may
	have moved, so the next page load builds the set again. The stored sets stay and are served
	meanwhile: during a migrate every app's hooks save custom fields after crm's rebuild, and
	without them each first page after a deploy would ship the whole dictionary."""
	frappe.cache.delete_value(CACHE_KEY)
	try:
		_write_atomic(_changed_path(), repr(time.time()))
	except OSError:
		# Without the mark a stored set would look current: drop them as before.
		for name in _stored_files():
			try:
				os.remove(name)
			except OSError:
				pass


def _cache(field: str, current: str, payload: bytes, fresh: bool = True) -> None:
	frappe.cache.hset(CACHE_KEY, "p|" + field, (current, payload))
	if fresh:
		frappe.cache.hset(CACHE_KEY, "v|" + field, current)
	else:
		frappe.cache.hdel(CACHE_KEY, "v|" + field)
	# The whole hash lives a day from its first field, so record names (a new stage or lead
	# source) join the set within a day, or at the next deploy (bench migrate clears the cache)
	# or Translation save, and fields of past builds do not pile up.
	if frappe.cache.ttl(frappe.cache.make_key(CACHE_KEY)) < 0:
		frappe.cache.expire_key(CACHE_KEY, CACHE_SECONDS)


# The built sets also live in site files, one per field (language, keys file, translation
# edits), at most KEEP_PER_LANGUAGE per language. A cache clear (bench clear-cache after a
# deploy, a worker restart) empties the hash; the file puts the set back. A set is current when
# it was built after the last meta change and within CACHE_SECONDS; an older one, or the
# language's last set when its field has none (a new build's keys, a Translation edit), is
# served while the page load's queued build runs, so a page never waits for the whole
# dictionary once its language was built.
def _lang_tag(lang: str) -> str:
	return hashlib.sha1(lang.encode()).hexdigest()[:8]


def _store_path(field: str) -> str:
	lang = field.partition("|")[0]
	name = f"{_lang_tag(lang)}-{hashlib.sha1(field.encode()).hexdigest()[:24]}.json"
	return frappe.get_site_path(STORE_DIR, name)


def _changed_path() -> str:
	return frappe.get_site_path(STORE_DIR, CHANGED_FILE)


def _stored_files() -> list[str]:
	folder = frappe.get_site_path(STORE_DIR)
	try:
		return [os.path.join(folder, name) for name in os.listdir(folder) if name.endswith(".json")]
	except OSError:
		return []


def _write_atomic(path: str, text: str) -> None:
	os.makedirs(os.path.dirname(path), exist_ok=True)
	tmp = f"{path}.{os.getpid()}.tmp"
	# the path is the site folder plus a fixed name or a hash of the field; nothing from a request names it
	with open(tmp, "w", encoding="utf-8") as f:  # nosemgrep: frappe-security-file-traversal
		f.write(text)
	os.replace(tmp, path)


def _store(field: str, current: str, payload: bytes, built: float) -> None:
	lang = field.partition("|")[0]
	path = _store_path(field)
	data = {"field": field, "lang": lang, "version": current, "built": built, "payload": payload.decode()}
	try:
		_write_atomic(path, json.dumps(data))
	except OSError:
		frappe.log_error("crm shell dictionary store")
		return
	_prune(lang, path)


def _prune(lang: str, keep: str) -> None:
	"""Keep this language's newest sets and drop files of the older naming."""
	tag = _lang_tag(lang)
	mine = []
	for path in _stored_files():
		match = STORED_NAME.match(os.path.basename(path))
		try:
			if not match:
				os.remove(path)
			elif match["lang"] == tag and path != keep:
				mine.append((os.stat(path).st_mtime, path))
		except OSError:
			continue
	for _mtime, path in sorted(mine, reverse=True)[KEEP_PER_LANGUAGE - 1 :]:
		try:
			os.remove(path)
		except OSError:
			pass


def _read(path: str) -> dict | None:
	try:
		with open(path, encoding="utf-8") as f:  # nosemgrep: frappe-security-file-traversal
			data = json.load(f)
	except (OSError, ValueError):
		return None
	if not isinstance(data, dict) or not data.get("version") or not data.get("payload"):
		return None
	return data


def _changed_at() -> float:
	try:
		with open(_changed_path(), encoding="utf-8") as f:  # nosemgrep: frappe-security-file-traversal
			return float(f.read().strip() or 0)
	except (OSError, ValueError):
		return 0.0


def _restore(field: str) -> tuple[str, bytes, bool] | None:
	"""(version, payload, current) of the stored set for this field, else the newest stored set of
	its language (never current); None without one."""
	data = _read(_store_path(field))
	if data and data.get("field") == field:
		built = float(data.get("built") or 0)
		current = built >= _changed_at() and time.time() - built < CACHE_SECONDS
		return data["version"], data["payload"].encode(), current
	lang = field.partition("|")[0]
	tag = _lang_tag(lang)
	newest = []
	for path in _stored_files():
		match = STORED_NAME.match(os.path.basename(path))
		if match and match["lang"] == tag:
			try:
				newest.append((os.stat(path).st_mtime, path))
			except OSError:
				continue
	for _mtime, path in sorted(newest, reverse=True):
		data = _read(path)
		if data and data.get("lang") == lang:
			return data["version"], data["payload"].encode(), False
	return None


def rebuild(*_args) -> None:
	"""after_migrate: build the set again now for the languages the site's people use, so the
	first pages after a deploy ship the trimmed dictionary instead of the whole one while a
	queued job runs. A language whose build fails is left to the page-load queue."""
	clear()
	for lang in site_languages():
		try:
			build(lang, f"{lang}|{build_literals()[0]}|{_user_translations_fingerprint(lang)}")
		except Exception:
			frappe.log_error("crm shell dictionary rebuild")


def site_languages() -> list[str]:
	"""The system language, the languages of enabled system users, and the current one."""
	langs = [
		frappe.db.get_single_value("System Settings", "language"),
		*frappe.get_all(
			"User",
			filters={"enabled": 1, "user_type": "System User"},
			pluck="language",
			distinct=True,
			order_by=None,
		),
		frappe.local.lang,
	]
	return list(dict.fromkeys(lang for lang in langs if lang))


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
	# The dictionary travels as one string literal for JSON.parse: an engine parses a quarter
	# megabyte that way in one pass, where an object literal is code to tokenise. The JSON
	# text has no raw control characters, so a doubled backslash and an escaped apostrophe
	# make it a valid single-quoted literal.
	body = frappe.as_json(messages, indent=None, separators=(",", ":"), ensure_ascii=False)
	literal = body.replace("\\", "\\\\").replace("'", "\\'")
	return f"window.translated_messages = JSON.parse('{literal}');".encode()


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
	keys = {name for name, row in doctypes.items() if not row.istable}
	for doctype in named | targets:
		keys |= _doctype_strings(doctype)
	translated = set(get_translated_doctypes()) & (named | targets)
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
	strings = {meta.name}
	for field in meta.fields:
		strings.add(field.label)
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
