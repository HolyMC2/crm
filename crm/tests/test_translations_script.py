# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
import os
import time
from contextlib import suppress
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from crm import shell_dictionary
from crm.www.crm import _translations_version, get_boot, translations

FULL = ("full", None)


def _request(headers: dict | None = None) -> Request:
	return Request(EnvironBuilder(headers=headers or {}).get_environ())


def _build_now(method, **kwargs):
	# The build is a background job; run it in place.
	shell_dictionary.build(kwargs["lang"], kwargs["field"])


class TestTranslationsScript(IntegrationTestCase):
	def setUp(self):
		# The hash and the queued-build markers next to it.
		frappe.cache.delete_keys(shell_dictionary.CACHE_KEY)
		frappe.local.cache.pop(frappe.cache.make_key(shell_dictionary.CACHE_KEY), None)
		# And the site store the build writes next to the cache, with its meta-change mark.
		for name in shell_dictionary._stored_files():
			os.remove(name)
		with suppress(FileNotFoundError):
			os.remove(shell_dictionary._changed_path())

	def patched(self, messages, listing=FULL, user_translations=None, enqueue=_build_now):
		return (
			patch("crm.shell_dictionary._dictionary", return_value=messages),
			patch("crm.shell_dictionary.build_literals", return_value=listing),
			patch("crm.shell_dictionary.get_user_translations", return_value=user_translations or {}),
			patch("frappe.enqueue", side_effect=enqueue),
		)

	def serve(self, messages, v=None, headers=None, **kwargs):
		a, b, c, d = self.patched(messages, **kwargs)
		with a, b, c, d, patch("frappe.request", _request(headers)):
			return translations(v)

	def run_queued(self, job, messages, **kwargs):
		# The worker runs the queued job later, with the same dictionary and build.
		a, b, c, d = self.patched(messages, **kwargs)
		with a, b, c, d:
			shell_dictionary.build(job["lang"], job["field"])

	def page_version(self, messages, **kwargs):
		a, b, c, d = self.patched(messages, **kwargs)
		with a, b, c, d:
			return _translations_version()

	def test_boot_no_longer_inlines_the_dictionary(self):
		# get_boot asks for a CSRF token, which needs a request session that a unit test does not have.
		with patch("frappe.sessions.get_csrf_token", return_value="token"):
			self.assertNotIn("translated_messages", get_boot())

	def test_without_a_build_listing_the_whole_dictionary_is_served_as_javascript(self):
		self.serve({"Ventas": "Sales", "Año": "Year"})
		response = self.serve({"Ventas": "Sales", "Año": "Year"})
		self.assertEqual(response.mimetype, "application/javascript")
		self.assertEqual(response.headers["Cache-Control"], "private, no-cache")
		# Compact JSON with sorted keys (the same dictionary always hashes to the same version),
		# non-ASCII characters kept as UTF-8 rather than \u escapes.
		self.assertEqual(
			response.get_data(as_text=True),
			'window.translated_messages = JSON.parse(\'{"Año":"Year","Ventas":"Sales"}\');',
		)

	def test_only_the_keys_the_build_uses_are_served_with_their_values_unchanged(self):
		dictionary = {
			"Save": "Guardar",
			"Open": "Abrir",
			"Compras": "Compras",
			"Open:Compras": "Abrir pedido",
			"Open:Unused": "Otro",
			"Unused": "Sin uso",
		}
		listing = ("abc", frozenset({"Save", "Open", "Compras", "x"}))
		with patch("crm.shell_dictionary.runtime_keys", return_value=set()):
			# The first request queues the build and gets the whole dictionary meanwhile.
			self.assertIn("Sin uso", self.serve(dictionary, listing=listing).get_data(as_text=True))
			response = self.serve(dictionary, listing=listing)
		self.assertEqual(
			response.get_data(as_text=True),
			'window.translated_messages = JSON.parse(\'{"Compras":"Compras","Open":"Abrir",'
			'"Open:Compras":"Abrir pedido","Save":"Guardar"}\');',
		)

	def test_the_literal_carries_quotes_apostrophes_and_backslashes_back_to_the_same_dictionary(self):
		messages = {'It\'s "quoted" \\ ok': 'Es "citado" \\ bien\nlínea', "Año": "Year"}
		body = self.serve(messages).get_data(as_text=True)
		prefix, suffix = "window.translated_messages = JSON.parse('", "');"
		self.assertTrue(body.startswith(prefix) and body.endswith(suffix), body[:80])
		literal = body[len(prefix) : -len(suffix)]
		# What the engine's string literal evaluates to, then what JSON.parse reads from it.
		text = literal.replace("\\'", "'").replace("\\\\", "\\")
		self.assertEqual(json.loads(text), messages)

	def test_runtime_keys_cover_doctypes_records_and_server_strings(self):
		if not frappe.db.exists("CRM Deal Status", "Won"):
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": "Won"}).insert(
				ignore_permissions=True
			)
		named = {"CRM Deal", "CRM Deal Status"}
		keys = shell_dictionary.runtime_keys(frozenset(named))
		# Every DocType name but child tables', the labels and Select options of named DocTypes,
		# their records, and English the crm server code sends for __() (api/workload.py OPEN).
		self.assertIn("ToDo", keys)
		literals = shell_dictionary.python_literals(shell_dictionary.APP)
		targets = {target for name in named for target in shell_dictionary._targets(name)}
		child = next(
			name
			for name in frappe.get_all("DocType", filters={"istable": 1}, pluck="name", order_by="name")
			if name not in literals and name not in targets
		)
		self.assertNotIn(child, keys)
		meta = frappe.get_meta("CRM Deal")
		self.assertIn(meta.get_field("status").label, keys)
		self.assertIn("Won", keys)
		self.assertIn("On Hold", keys)
		# Field descriptions are shown as they are, so they are not shipped.
		described = [field.description for field in meta.fields if field.description]
		self.assertTrue(described, "CRM Deal has a field with a description")
		for description in described:
			self.assertNotIn(description, keys)
		# Records of a translated DocType no named DocType links to are not vocabulary here.
		linked = {field.options for name in named for field in frappe.get_meta(name).fields}
		self.assertNotIn("Country", linked | named)
		self.assertNotIn("Mexico", keys)

	def test_while_the_build_is_pending_the_page_gets_the_whole_dictionary_revalidating(self):
		queued = []
		messages = {"Ventas": "Sales"}
		self.assertEqual(self.page_version(messages, enqueue=lambda method, **kw: queued.append(kw)), "")
		response = self.serve(messages, v="", enqueue=lambda method, **kw: queued.append(kw))
		self.assertEqual(response.headers["Cache-Control"], "private, no-cache")
		self.assertIn('"Ventas":"Sales"', response.get_data(as_text=True))
		# Queued once, however many pages load before the job runs.
		self.assertEqual(len(queued), 1)

	def test_a_cache_clear_serves_the_built_set_from_the_site_store(self):
		messages = {"Ventas": "Sales", "Unused": "Not shipped"}
		listing = ("k1", frozenset({"Ventas"}))
		self.page_version(messages, listing=listing)
		v = self.page_version(messages, listing=listing)
		self.assertEqual(len(v), 16)
		# bench clear-cache after a deploy, or a Redis restart: the hash is gone, the file stays.
		frappe.cache.delete_value(shell_dictionary.CACHE_KEY)
		frappe.local.cache.pop(frappe.cache.make_key(shell_dictionary.CACHE_KEY), None)

		def never(method, **kwargs):
			self.fail("a stored set needs no build")

		self.assertEqual(self.page_version(messages, listing=listing, enqueue=never), v)
		response = self.serve(messages, v=v, listing=listing, enqueue=never)
		self.assertEqual(response.headers["Cache-Control"], "private, max-age=31536000, immutable")
		body = response.get_data(as_text=True)
		self.assertIn('"Ventas":"Sales"', body)
		self.assertNotIn("Not shipped", body)

	def test_a_meta_change_serves_the_stored_set_while_it_rebuilds(self):
		queued = []
		messages = {"Ventas": "Sales"}
		self.page_version(messages)
		v = self.page_version(messages)
		self.assertEqual(len(v), 16)
		self.assertTrue(shell_dictionary._stored_files())
		# A Custom Field saved by another app's after_migrate, after crm's rebuild.
		shell_dictionary.clear()
		self.assertTrue(shell_dictionary._stored_files())
		later = {"Ventas": "Revenue"}
		capture = lambda method, **kw: queued.append(kw)  # noqa: E731
		self.assertEqual(self.page_version(later, enqueue=capture), v)
		self.assertEqual(self.page_version(later, enqueue=capture), v)
		# The page's versioned URL is still the immutable set, never the whole dictionary.
		response = self.serve(later, v=v, enqueue=capture)
		self.assertEqual(response.headers["Cache-Control"], "private, max-age=31536000, immutable")
		self.assertIn('"Ventas":"Sales"', response.get_data(as_text=True))
		self.assertEqual(len(queued), 1)
		# The queued build replaces it.
		self.run_queued(queued[0], later)
		fresh = self.page_version(later)
		self.assertNotEqual(fresh, v)
		self.assertIn('"Ventas":"Revenue"', self.serve(later, v=fresh).get_data(as_text=True))

	def test_a_new_build_serves_the_last_set_of_its_language_while_it_builds(self):
		messages = {"Ventas": "Sales", "zz key of the new build": "New"}
		old = ("k1", frozenset({"Ventas"}))
		self.page_version(messages, listing=old)
		v = self.page_version(messages, listing=old)
		self.assertEqual(len(v), 16)
		# A deploy: the build names other keys, so the field is new and has no set yet.
		frappe.cache.delete_value(shell_dictionary.CACHE_KEY)
		frappe.local.cache.pop(frappe.cache.make_key(shell_dictionary.CACHE_KEY), None)
		queued = []
		new = ("k2", frozenset({"Ventas", "zz key of the new build"}))
		self.assertEqual(
			self.page_version(messages, listing=new, enqueue=lambda m, **kw: queued.append(kw)), v
		)
		self.assertEqual(len(queued), 1)
		self.run_queued(queued[0], messages, listing=new)
		built = self.page_version(messages, listing=new)
		self.assertNotEqual(built, v)
		body = self.serve(messages, v=built, listing=new).get_data(as_text=True)
		self.assertIn('"zz key of the new build":"New"', body)

	def test_another_language_never_borrows_a_set(self):
		self.page_version({"Ventas": "Sales"})
		self.assertTrue(self.page_version({"Ventas": "Sales"}))
		lang = frappe.local.lang
		frappe.local.lang = "fr" if lang != "fr" else "de"
		try:
			queued = []
			self.assertEqual(
				self.page_version({"Ventas": "Ventes"}, enqueue=lambda m, **kw: queued.append(kw)), ""
			)
			self.assertEqual(len(queued), 1)
		finally:
			frappe.local.lang = lang

	def test_each_language_keeps_its_two_newest_sets_and_old_names_go(self):
		folder = frappe.get_site_path(shell_dictionary.STORE_DIR)
		os.makedirs(folder, exist_ok=True)
		legacy = os.path.join(folder, "0" * 24 + ".json")
		with open(legacy, "w") as f:
			f.write("{}")
		lang = frappe.local.lang
		paths = []
		for n in range(3):
			field = f"{lang}|k{n}|fp"
			shell_dictionary._store(field, f"{n:016d}", b"window.translated_messages = {};", time.time())
			paths.append(shell_dictionary._store_path(field))
			# Distinct mtimes, newest last.
			os.utime(paths[-1], (time.time() + n, time.time() + n))
		other = f"{'fr' if lang != 'fr' else 'de'}|k0|fp"
		shell_dictionary._store(other, "f" * 16, b"window.translated_messages = {};", time.time())
		left = set(shell_dictionary._stored_files())
		self.assertNotIn(legacy, left)
		self.assertNotIn(paths[0], left)
		self.assertIn(paths[1], left)
		self.assertIn(paths[2], left)
		self.assertIn(shell_dictionary._store_path(other), left)

	def test_a_set_older_than_a_day_is_served_and_built_again(self):
		messages = {"Ventas": "Sales"}
		a, b, c, d = self.patched(messages)
		with a, b, c, d:
			field = shell_dictionary._field()
		old = time.time() - shell_dictionary.CACHE_SECONDS - 60
		shell_dictionary._store(field, "a" * 16, b"window.translated_messages = {};", old)
		queued = []
		self.assertEqual(self.page_version(messages, enqueue=lambda m, **kw: queued.append(kw)), "a" * 16)
		self.assertEqual(len(queued), 1)

	def test_a_meta_change_during_the_build_keeps_the_set_but_builds_again(self):
		messages = {"Ventas": "Sales"}
		a, b, c, d = self.patched(messages)

		def change_meta_midway(lang, strict=False):
			shell_dictionary.clear()
			return messages

		with a, b, c, d, patch("crm.shell_dictionary._dictionary", side_effect=change_meta_midway):
			field = shell_dictionary._field()
			shell_dictionary.build(frappe.local.lang, field)
		self.assertIsNone(frappe.cache.hget(shell_dictionary.CACHE_KEY, "v|" + field))
		queued = []
		v = self.page_version(messages, enqueue=lambda m, **kw: queued.append(kw))
		self.assertEqual(len(v), 16)
		self.assertEqual(len(queued), 1)

	def test_the_versioned_url_is_immutable_and_any_other_revalidates(self):
		messages = {"Ventas": "Sales"}
		self.page_version(messages)
		v = self.page_version(messages)
		self.assertEqual(len(v), 16)
		fresh = self.serve(messages, v=v)
		self.assertEqual(fresh.status_code, 200)
		self.assertEqual(fresh.headers["Cache-Control"], "private, max-age=31536000, immutable")
		etag = self.serve(messages, v="0000000000000000").get_etag()[0]
		stale = self.serve(messages, v="0000000000000000", headers={"If-None-Match": f'"{etag}"'})
		self.assertEqual(stale.status_code, 304)
		self.assertEqual(stale.headers["Cache-Control"], "private, no-cache")

	def test_a_translation_edit_changes_the_version_and_content(self):
		self.page_version({"Ventas": "Sales"})
		first = self.page_version({"Ventas": "Sales"})
		edited = {"Ventas": "Revenue"}
		self.page_version(edited, user_translations=edited)
		second = self.page_version(edited, user_translations=edited)
		self.assertNotEqual(first, second)
		response = self.serve(edited, v=second, user_translations=edited)
		self.assertIn("Revenue", response.get_data(as_text=True))

	def test_the_page_still_renders_when_the_version_fails(self):
		with patch("crm.shell_dictionary.version", side_effect=RuntimeError("redis down")):
			self.assertEqual(_translations_version(), "")

	def test_a_failed_dictionary_load_is_not_cached_and_the_next_page_load_retries(self):
		queued = []

		def build_now(method, **kwargs):
			queued.append(kwargs)
			_build_now(method, **kwargs)

		listing = ("abc", frozenset({"Ventas"}))
		with (
			patch("crm.shell_dictionary.get_all_translations", side_effect=RuntimeError("redis blip")),
			patch("crm.shell_dictionary.build_literals", return_value=listing),
			patch("crm.shell_dictionary.get_user_translations", return_value={}),
			patch("frappe.enqueue", side_effect=build_now),
			patch("frappe.log_error"),
		):
			self.assertEqual(_translations_version(), "")
			field = shell_dictionary._field()
			self.assertIsNone(frappe.cache.hget(shell_dictionary.CACHE_KEY, "v|" + field))
			self.assertIsNone(frappe.cache.hget(shell_dictionary.CACHE_KEY, "p|" + field))
			self.assertEqual(_translations_version(), "")
		self.assertEqual(len(queued), 2)
		# Once the dictionary loads again, the next build ships it.
		self.page_version({"Ventas": "Sales"}, listing=listing)
		self.assertEqual(len(self.page_version({"Ventas": "Sales"}, listing=listing)), 16)

	def test_the_queued_marker_expires_and_a_failed_enqueue_clears_it(self):
		queued = []
		messages = {"Ventas": "Sales"}
		self.page_version(messages, enqueue=lambda method, **kw: queued.append(kw))
		marker = shell_dictionary._queued_key(queued[0]["field"])
		self.assertTrue(0 < frappe.cache.ttl(marker) <= shell_dictionary.QUEUED_SECONDS)
		self.page_version(messages, enqueue=lambda method, **kw: queued.append(kw))
		self.assertEqual(len(queued), 1)
		# A job that never ran (the worker was killed): the marker lapses and the build is queued again.
		frappe.cache.delete(marker)
		self.page_version(messages, enqueue=lambda method, **kw: queued.append(kw))
		self.assertEqual(len(queued), 2)

		frappe.cache.delete(marker)
		with patch("frappe.log_error") as log_error:
			self.assertEqual(self.page_version(messages, enqueue=RuntimeError("rq redis down")), "")
		log_error.assert_called_once()
		self.assertFalse(frappe.cache.exists(marker))
		self.page_version(messages, enqueue=lambda method, **kw: queued.append(kw))
		self.assertEqual(len(queued), 3)

	def test_runtime_keys_cover_the_doctypes_a_named_doctype_links_to(self):
		# CRM Deal.territory links to CRM Territory, which the build does not name; its labels open
		# in the "create new" dialog (CreateDocumentModal renders __(field.label)).
		self.assertIn("CRM Territory", {f.options for f in frappe.get_meta("CRM Deal").fields})
		keys = shell_dictionary.runtime_keys(frozenset({"CRM Deal"}))
		self.assertIn(frappe.get_meta("CRM Territory").get_field("territory_manager").label, keys)

	def test_after_migrate_hooks_of_later_apps_keep_the_trimmed_set(self):
		a, b, c, d = self.patched({"Ventas": "Sales"}, enqueue=lambda m, **kw: None)
		with a, b, c, d:
			shell_dictionary.rebuild()
			version = _translations_version()
			# doco's after_migrate re-saves its custom fields, then bench clears the cache.
			shell_dictionary.clear()
			frappe.local.cache.pop(frappe.cache.make_key(shell_dictionary.CACHE_KEY), None)
			self.assertEqual(_translations_version(), version)
			response = translations(version)
		self.assertEqual(response.headers["Cache-Control"], "private, max-age=31536000, immutable")

	def test_migrate_rebuilds_the_set_for_the_site_languages_at_once(self):
		self.assertIn("crm.shell_dictionary.rebuild", frappe.get_hooks("after_migrate"))
		self.assertNotIn("crm.shell_dictionary.clear", frappe.get_hooks("after_migrate"))
		languages = shell_dictionary.site_languages()
		self.assertIn(frappe.local.lang, languages)
		self.assertIn(frappe.db.get_single_value("System Settings", "language"), languages)
		messages = {"Ventas": "Sales"}
		self.page_version(messages)
		self.assertTrue(self.page_version(messages), "a version is cached")
		a, b, c, d = self.patched({"Ventas": "Revenue"}, enqueue=RuntimeError("no queue after migrate"))
		with a, b, c, d:
			shell_dictionary.rebuild()
			# The page links the fresh build at once: nothing is queued, no whole dictionary.
			version = _translations_version()
			self.assertEqual(len(version), 16)
			self.assertIn("Revenue", translations(version).get_data(as_text=True))

	def test_meta_changes_drop_the_cached_set(self):
		messages = {"Ventas": "Sales"}
		self.page_version(messages)
		self.assertTrue(self.page_version(messages))
		frappe.make_property_setter(
			{
				"doctype": "CRM Deal",
				"fieldname": "territory",
				"property": "label",
				"value": "Zona",
				"property_type": "Data",
			}
		)
		self.assertIsNone(frappe.cache.hget(shell_dictionary.CACHE_KEY, "v|" + self._field(messages)))
		self.page_version(messages)
		self.assertTrue(self.page_version(messages))
		shell_dictionary.clear()
		self.assertIsNone(frappe.cache.hget(shell_dictionary.CACHE_KEY, "v|" + self._field(messages)))

	def _field(self, messages):
		a, b, c, d = self.patched(messages)
		with a, b, c, d:
			return shell_dictionary._field()

	def test_a_missing_keys_file_is_logged_once_outside_developer_mode(self):
		shell_dictionary._warned_missing.clear()
		logger = MagicMock()
		with (
			patch("frappe.get_app_path", return_value="/nonexistent/translation-keys.json"),
			patch("frappe.logger", return_value=logger),
			patch.dict(frappe.conf, {"developer_mode": 1}),
		):
			self.assertEqual(shell_dictionary.build_literals(), FULL)
			logger.warning.assert_not_called()
			frappe.conf.developer_mode = 0
			self.assertEqual(shell_dictionary.build_literals(), FULL)
			self.assertEqual(shell_dictionary.build_literals(), FULL)
		logger.warning.assert_called_once()
		self.assertIn("translation-keys.json", logger.warning.call_args[0][0])
		shell_dictionary._warned_missing.clear()
