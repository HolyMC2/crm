# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from crm.www.crm import get_boot, translations


def _request(headers: dict | None = None) -> Request:
	return Request(EnvironBuilder(headers=headers or {}).get_environ())


class TestTranslationsScript(FrappeTestCase):
	def test_boot_no_longer_inlines_the_dictionary(self):
		self.assertNotIn("translated_messages", get_boot())

	def test_script_sets_the_dictionary_as_javascript(self):
		with (
			patch("crm.www.crm.get_messages_for_boot", return_value={"Ventas": "Sales", "Año": "Year"}),
			patch("frappe.request", _request()),
		):
			response = translations()
		self.assertEqual(response.mimetype, "application/javascript")
		self.assertEqual(response.headers["Cache-Control"], "private, no-cache")
		# Compact JSON, with the non-ASCII characters kept as UTF-8 rather than \u escapes.
		self.assertEqual(
			response.get_data(as_text=True),
			'window.translated_messages = {"Año":"Year","Ventas":"Sales"};',
		)

	def test_revalidation_answers_304_while_the_dictionary_is_unchanged(self):
		messages = {"Ventas": "Sales"}
		with (
			patch("crm.www.crm.get_messages_for_boot", return_value=messages),
			patch("frappe.request", _request()),
		):
			etag = translations().headers["ETag"]
		with (
			patch("crm.www.crm.get_messages_for_boot", return_value=messages),
			patch("frappe.request", _request({"If-None-Match": etag})),
		):
			response = translations()
		self.assertEqual(response.status_code, 304)

	def test_a_changed_dictionary_is_served_again(self):
		with (
			patch("crm.www.crm.get_messages_for_boot", return_value={"Ventas": "Sales"}),
			patch("frappe.request", _request()),
		):
			etag = translations().headers["ETag"]
		with (
			patch("crm.www.crm.get_messages_for_boot", return_value={"Ventas": "Revenue"}),
			patch("frappe.request", _request({"If-None-Match": etag})),
		):
			response = translations()
		self.assertEqual(response.status_code, 200)
		self.assertIn("Revenue", response.get_data(as_text=True))
