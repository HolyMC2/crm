# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""«Ajustes del negocio» (crm.business_settings): curated rows, every other switch, writes."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from crm import business_settings as hub

STATE = {"value": False, "registers": {}}


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
		{
			"key": "demo.color",
			"area": "otros",
			"kind": "palette",
			"label": "Color",
			"doctype": "FCRM Settings",
			"save": "demo.save_color",
			"stored": {"accent": "", "tone": "Neutral", "density": "Comfortable"},
			"palette": {"accent": "#171717"},
			"swatches": [
				{"key": "gris", "label": "Gris", "accent": "", "light": "#171717", "dark": "#ededed"},
				{"key": "sin-color", "label": "Sin color"},
			],
		},
		{
			"key": "demo.color_without_swatches",
			"label": "Color",
			"kind": "palette",
			"save": "x",
			"doctype": "FCRM Settings",
		},
		*(
			{
				"key": f"demo.register.{register}",
				"area": "caja",
				"kind": "switch",
				"label": f"Caja {register}",
				"get": "crm.tests.test_business_settings.stand_in_register_get",
				"set": "crm.tests.test_business_settings.stand_in_register_set",
				"args": {"register": register},
			}
			for register in ("Norte", "Sur")
		),
		{
			"key": "demo.bad_args",
			"label": "Argumentos que no son un dict",
			"get": "crm.tests.test_business_settings.stand_in_get",
			"set": "crm.tests.test_business_settings.stand_in_set",
			"args": ["Norte"],
		},
	]


def stand_in_get():
	return STATE["value"]


def stand_in_set(value):
	STATE["value"] = bool(value)


def stand_in_register_get(register):
	return STATE["registers"].get(register, False)


def stand_in_register_set(value, register):
	STATE["registers"][register] = bool(value)


class TestBusinessSettings(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		STATE["value"] = False
		STATE["registers"] = {}
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
		self.assertEqual(
			set(rows),
			{
				"demo.screen",
				"demo.custom",
				"demo.single",
				"demo.color",
				"demo.register.Norte",
				"demo.register.Sur",
			},
		)
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

	def test_one_switch_per_record_carries_its_arguments(self):
		answer = hub.set_switch("demo.register.Sur", 1)
		self.assertTrue(answer["value"])
		self.assertEqual(STATE["registers"], {"Sur": True})
		rows = {row["key"]: row for row in hub.curated()}
		self.assertTrue(rows["demo.register.Sur"]["value"])
		self.assertFalse(rows["demo.register.Norte"]["value"])

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

	def test_the_shop_colour_row_passes_through_with_who_may_change_it(self):
		row = next(row for row in hub.page()["curated"] if row["key"] == "demo.color")
		self.assertEqual(row["kind"], "palette")
		self.assertEqual(row["save"], "demo.save_color")
		# a swatch without its colour is dropped, the rest keep their five keys
		self.assertEqual([swatch["key"] for swatch in row["swatches"]], ["gris"])
		self.assertEqual(row["stored"]["tone"], "Neutral")
		self.assertTrue(row["can_change"])
		with self.assertRaises(frappe.ValidationError):
			hub.set_switch("demo.color", 1)
		email = f"zz-color-{frappe.generate_hash(length=6)}@example.invalid"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Vendedora",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		)
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		self.addCleanup(frappe.delete_doc, "User", email, force=True, ignore_missing=True)
		frappe.set_user(email)
		row = next(row for row in hub.curated() if row["key"] == "demo.color")
		self.assertFalse(row["can_change"])
