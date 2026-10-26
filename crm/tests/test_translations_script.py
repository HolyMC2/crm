# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
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


class TestTranslationsScript(FrappeTestCase):
	def setUp(self):
		frappe.cache.delete_value(shell_dictionary.CACHE_KEY)
		frappe.local.cache.pop(frappe.cache.make_key(shell_dictionary.CACHE_KEY), None)

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
			'window.translated_messages = {"Año":"Year","Ventas":"Sales"};',
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
			'window.translated_messages = {"Compras":"Compras","Open":"Abrir",'
			'"Open:Compras":"Abrir pedido","Save":"Guardar"};',
		)

	def test_runtime_keys_cover_doctypes_records_and_server_strings(self):
		if not frappe.db.exists("CRM Deal Status", "Won"):
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": "Won"}).insert(
				ignore_permissions=True
			)
		keys = shell_dictionary.runtime_keys(frozenset({"CRM Deal", "CRM Deal Status"}))
		# Every DocType name, the labels and Select options of named DocTypes, their records,
		# and English the crm server code sends for __() (api/workload.py OPEN).
		self.assertIn("ToDo", keys)
		self.assertIn(frappe.get_meta("CRM Deal").get_field("status").label, keys)
		self.assertIn("Won", keys)
		self.assertIn("On Hold", keys)

	def test_while_the_build_is_pending_the_page_gets_the_whole_dictionary_revalidating(self):
		queued = []
		messages = {"Ventas": "Sales"}
		self.assertEqual(self.page_version(messages, enqueue=lambda method, **kw: queued.append(kw)), "")
		response = self.serve(messages, v="", enqueue=lambda method, **kw: queued.append(kw))
		self.assertEqual(response.headers["Cache-Control"], "private, no-cache")
		self.assertIn('"Ventas":"Sales"', response.get_data(as_text=True))
		# Queued once, however many pages load before the job runs.
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
