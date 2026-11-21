# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""«Ajustes del negocio» (crm.business_settings): curated rows, every other switch, writes."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from crm import business_settings as hub

STATE = {"value": False}


def stand_in_rows():
	return [
		{
			"key": "demo.screen",
			"area": "ventas",
			"kind": "screen",
			"label": "Pantalla",
			"help": "Abre la pantalla.",
			"to": "/demo",
		},
		{
			"key": "demo.custom",
			"area": "caja",
			"kind": "switch",
			"label": "Propio",
			"on": "Prendido",
			"off": "Apagado",
			"get": "crm.tests.test_business_settings.stand_in_get",
			"set": "crm.tests.test_business_settings.stand_in_set",
		},
		{
			"key": "demo.single",
			"area": "nowhere",
			"kind": "switch",
			"label": "De Single",
			"doctype": "FCRM Settings",
			"field": "auto_mark_replied_on_response",
		},
		{"key": "demo.broken", "label": "Sin destino", "kind": "screen"},
	]


def stand_in_get():
	return STATE["value"]


def stand_in_set(value):
	STATE["value"] = bool(value)


class TestBusinessSettings(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		STATE["value"] = False
		self.original = frappe.db.get_single_value("FCRM Settings", "auto_mark_replied_on_response")
		paths = patch.object(hub, "_paths", return_value=["demo.rows"])
		load = patch.object(hub, "_load", return_value=stand_in_rows)
		for context in (paths, load):
			context.start()
			self.addCleanup(context.stop)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", "auto_mark_replied_on_response", self.original)
		super().tearDown()

	def test_curated_rows_resolve_their_values_and_drop_what_cannot_work(self):
		rows = {row["key"]: row for row in hub.curated()}
		self.assertEqual(set(rows), {"demo.screen", "demo.custom", "demo.single"})
		self.assertEqual(rows["demo.screen"]["to"], "/demo")
		self.assertFalse(rows["demo.custom"]["value"])
		# An unknown area reads «Otros».
		self.assertEqual(rows["demo.single"]["area"], "otros")
		self.assertTrue(rows["demo.single"]["can_change"])

	def test_a_provider_that_fails_hides_only_its_rows(self):
		def broken():
			raise RuntimeError("boom")

		with patch.object(hub, "_load", return_value=broken):
			self.assertEqual(hub.curated(), [])

	def test_every_other_switch_lists_settings_checks_but_not_the_curated_ones(self):
		page = hub.page()
		keys = {row["key"] for row in page["advanced"]}
		self.assertNotIn("FCRM Settings:auto_mark_replied_on_response", keys)
		self.assertTrue(all(row["app"] not in hub.SKIPPED_APPS for row in page["advanced"]))
		self.assertTrue(all(":" in key for key in keys))

	def test_a_custom_switch_is_written_by_its_app(self):
		answer = hub.set_switch("demo.custom", 1)
		self.assertTrue(answer["value"])
		self.assertTrue(STATE["value"])

	def test_a_single_check_is_written_through_its_document(self):
		answer = hub.set_switch("demo.single", 0)
		self.assertFalse(answer["value"])
		self.assertEqual(frappe.db.get_single_value("FCRM Settings", "auto_mark_replied_on_response"), 0)

	def test_an_unknown_or_non_settings_field_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			hub.set_switch("System Settings:enable_scheduler", 1)
		with self.assertRaises(frappe.ValidationError):
			hub.set_switch("FCRM Settings:no_such_field", 1)
		with self.assertRaises(frappe.ValidationError):
			hub.set_switch("demo.custom", "maybe")

	def test_someone_who_may_not_write_the_settings_is_refused(self):
		email = f"zz-negocio-{frappe.generate_hash(length=6)}@example.invalid"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Cajera",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		)
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		self.addCleanup(frappe.delete_doc, "User", email, force=True, ignore_missing=True)
		frappe.set_user(email)
		with self.assertRaises(frappe.PermissionError):
			hub.set_switch("demo.single", 1)
