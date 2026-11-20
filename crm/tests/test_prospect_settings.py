"""The Prospectos settings: the shop's choices, the forms they shape and the first follow-up."""

import json
from copy import deepcopy
from datetime import datetime
from unittest import TestCase
from unittest.mock import patch

import frappe

from crm.api import prospects
from crm.lead import fields, follow_up
from crm.lead import settings as prospect_settings

OFF = {
	"companies": False,
	"inquiries": True,
	"phone_required": True,
	"first_follow_up": "none",
	"ask_salutation": False,
	"ask_gender": False,
}
ON = {**OFF, "companies": True, "ask_salutation": True, "ask_gender": True, "phone_required": False}

# The Quick Entry a CRM site ships: person, organization, lead.
QUICK_ENTRY = [
	{
		"name": "first_tab",
		"sections": [
			{
				"name": "person_section",
				"columns": [
					{"name": "c1", "fields": [{"fieldname": "salutation"}, {"fieldname": "email"}]},
					{"name": "c2", "fields": [{"fieldname": "first_name"}, {"fieldname": "mobile_no"}]},
					{"name": "c3", "fields": [{"fieldname": "gender"}, {"fieldname": "source"}]},
				],
			},
			{
				"name": "organization_section",
				"columns": [
					{"name": "c4", "fields": [{"fieldname": "organization"}, {"fieldname": "website"}]},
					{"name": "c5", "fields": [{"fieldname": "no_of_employees"}, {"fieldname": "industry"}]},
				],
			},
			{"name": "lead_section", "columns": [{"name": "c6", "fields": [{"fieldname": "status"}]}]},
		],
	}
]


def names(tabs):
	return [
		field["fieldname"] if isinstance(field, dict) else field
		for tab in tabs
		for section in tab["sections"]
		for column in section.get("columns") or []
		for field in column.get("fields") or []
	]


def sections(tabs):
	return [section["name"] for tab in tabs for section in tab["sections"]]


class SettingsTests(TestCase):
	def test_a_shop_that_never_chose_reads_the_defaults_with_its_giro(self):
		with patch.object(prospect_settings, "_stored", return_value={}):
			for giro, companies in (("celulares", False), ("refacciones", True), ("", False)):
				with self.subTest(giro=giro), patch.object(prospect_settings, "_giro", return_value=giro):
					values = prospect_settings.get()
					self.assertEqual(values["companies"], companies)
					self.assertTrue(values["inquiries"])
					self.assertTrue(values["phone_required"])
					self.assertEqual(values["first_follow_up"], "none")
					self.assertFalse(values["ask_salutation"])

	def test_a_choice_beats_the_giro_and_a_broken_value_falls_back(self):
		stored = {"companies": False, "first_follow_up": "someday", "inquiries": "yes"}
		with (
			patch.object(prospect_settings, "_stored", return_value=stored),
			patch.object(prospect_settings, "_giro", return_value="refacciones"),
		):
			values = prospect_settings.get()
		self.assertFalse(values["companies"])
		self.assertEqual(values["first_follow_up"], "none")
		self.assertTrue(values["inquiries"])

	def test_save_keeps_the_other_choices_and_stores_only_what_was_sent(self):
		written = {}
		with (
			patch.object(prospect_settings, "can_change", return_value=True),
			patch.object(prospect_settings, "_stored", return_value={"inquiries": False}),
			patch.object(prospect_settings, "_giro", return_value="celulares"),
			patch.object(
				frappe.db,
				"set_single_value",
				side_effect=lambda dt, field, value: written.update({field: value}),
			),
		):
			prospect_settings.save({"companies": 1, "first_follow_up": "tomorrow"})
		self.assertEqual(
			json.loads(written["prospect_settings"]),
			{"companies": True, "first_follow_up": "tomorrow", "inquiries": False},
		)

	def test_save_refuses_unknown_keys_values_and_people_who_are_not_managers(self):
		with (
			patch.object(prospect_settings, "can_change", return_value=True),
			patch.object(prospect_settings, "_stored", return_value={}),
			patch.object(frappe.db, "set_single_value") as write,
		):
			for changes in ({"currency": "MXN"}, {"companies": "maybe"}, {"first_follow_up": "3d"}, {}):
				with self.subTest(changes=changes), self.assertRaises(frappe.ValidationError):
					prospect_settings.save(changes)
			write.assert_not_called()
		with (
			patch.object(prospect_settings, "can_change", return_value=False),
			self.assertRaises(frappe.PermissionError),
		):
			prospect_settings.save({"companies": True})

	def test_an_origin_needs_a_short_name(self):
		with patch.object(prospect_settings, "can_change", return_value=True):
			for name in ("", "   ", "x" * 61):
				with self.subTest(name=name), self.assertRaises(frappe.ValidationError):
					prospect_settings.add_source(name)


class FieldsTests(TestCase):
	def test_without_companies_the_form_drops_the_organization_and_its_section(self):
		tabs = fields.apply("CRM Lead", "Quick Entry", deepcopy(QUICK_ENTRY), OFF)
		self.assertNotIn("organization_section", sections(tabs))
		for name in ("organization", "website", "no_of_employees", "industry", "salutation", "gender"):
			self.assertNotIn(name, names(tabs))
		self.assertEqual(names(tabs), ["email", "first_name", "mobile_no", "source", "status"])

	def test_with_companies_and_person_fields_the_form_keeps_everything(self):
		tabs = fields.apply("CRM Lead", "Quick Entry", deepcopy(QUICK_ENTRY), ON)
		self.assertEqual(names(tabs), names(QUICK_ENTRY))
		mobile = next(
			f for f in tabs[0]["sections"][0]["columns"][1]["fields"] if f["fieldname"] == "mobile_no"
		)
		self.assertNotIn("reqd", mobile)

	def test_the_phone_is_required_and_the_form_offers_only_the_shops_origins(self):
		with patch.object(prospect_settings, "origins_can_hide", return_value=True):
			tabs = fields.apply("CRM Lead", "Quick Entry", deepcopy(QUICK_ENTRY), OFF)
		by_name = {
			f["fieldname"]: f
			for f in (
				field for tab in tabs for s in tab["sections"] for c in s["columns"] for field in c["fields"]
			)
		}
		self.assertEqual(by_name["mobile_no"]["reqd"], 1)
		self.assertEqual(json.loads(by_name["source"]["link_filters"]), {"disabled": 0})

	def test_a_form_with_only_the_landline_requires_that(self):
		layout = [
			{"name": "t", "sections": [{"name": "s", "columns": [{"fields": [{"fieldname": "phone"}]}]}]}
		]
		tabs = fields.apply("CRM Lead", "Quick Entry", layout, OFF)
		self.assertEqual(tabs[0]["sections"][0]["columns"][0]["fields"][0]["reqd"], 1)

	def test_the_record_keeps_person_fields_and_deals_follow_companies(self):
		data = fields.apply("CRM Lead", "Data Fields", deepcopy(QUICK_ENTRY), OFF)
		self.assertIn("salutation", names(data))
		self.assertNotIn("organization", names(data))
		deal = [
			{
				"name": "t",
				"sections": [
					{
						"name": "organization_section",
						"columns": [{"fields": [{"fieldname": "organization"}]}],
					},
					{
						"name": "organization_details_section",
						"columns": [
							{"fields": [{"fieldname": "organization_name"}, {"fieldname": "territory"}]}
						],
					},
					{"name": "deal_section", "columns": [{"fields": [{"fieldname": "status"}]}]},
				],
			}
		]
		# The form drops the company sections whole (territory with them, as before)...
		self.assertEqual(
			sections(fields.apply("CRM Deal", "Quick Entry", deepcopy(deal), OFF)), ["deal_section"]
		)
		# ...the record keeps the territory.
		self.assertEqual(
			names(fields.apply("CRM Deal", "Data Fields", deepcopy(deal), OFF)), ["territory", "status"]
		)
		self.assertEqual(
			sections(fields.apply("CRM Deal", "Quick Entry", deepcopy(deal), ON)),
			["organization_section", "organization_details_section", "deal_section"],
		)

	def test_side_panels_and_other_doctypes(self):
		panel = [
			{
				"name": "details",
				"columns": [{"fields": [{"fieldname": "organization"}, {"fieldname": "email"}]}],
			},
			{"name": "org", "columns": [{"fields": [{"fieldname": "industry"}]}]},
			{"name": "empty", "columns": []},
		]
		out = fields.apply_sections("CRM Lead", deepcopy(panel), OFF)
		self.assertEqual([s["name"] for s in out], ["details", "empty"])
		self.assertEqual(out[0]["columns"][0]["fields"], [{"fieldname": "email"}])
		self.assertEqual(fields.apply_sections("Contact", deepcopy(panel), OFF), panel)


class FollowUpTests(TestCase):
	def lead(self, **values):
		return frappe._dict({"name": "CRM-LEAD-0001", "lead_owner": "ana@example.com", **values})

	def test_the_due_time_follows_the_choice(self):
		now = datetime(2026, 11, 20, 18, 30)
		self.assertEqual(follow_up.due_for("2h", now), datetime(2026, 11, 20, 20, 30))
		self.assertEqual(follow_up.due_for("tomorrow", now), datetime(2026, 11, 21, 18, 30))
		self.assertIsNone(follow_up.due_for("none", now))

	def test_a_new_prospect_gets_one_follow_up_for_its_owner(self):
		with (
			patch.object(prospect_settings, "get", return_value={**OFF, "first_follow_up": "tomorrow"}),
			patch.object(follow_up.follow_up, "upsert") as upsert,
			patch.object(frappe.db, "savepoint"),
		):
			follow_up.on_lead_insert(self.lead(mobile_no="+52 55 1234 5678"))
		kwargs = upsert.call_args.kwargs
		self.assertEqual(kwargs["slot"], "CRM Lead:CRM-LEAD-0001:primer-seguimiento")
		self.assertEqual(kwargs["owner"], "ana@example.com")
		self.assertEqual(kwargs["activity_type"], "WhatsApp")
		self.assertTrue(kwargs["ignore_permissions"])

	def test_no_follow_up_when_off_converted_or_imported(self):
		with (
			patch.object(prospect_settings, "get", return_value=OFF),
			patch.object(follow_up.follow_up, "upsert") as upsert,
		):
			follow_up.on_lead_insert(self.lead())
		upsert.assert_not_called()
		with (
			patch.object(prospect_settings, "get", return_value={**OFF, "first_follow_up": "2h"}),
			patch.object(follow_up.follow_up, "upsert") as upsert,
		):
			follow_up.on_lead_insert(self.lead(converted=1))
			# frappe.flags is a _dict (no __dict__ for patch.object): set it and put it back.
			before = frappe.flags.in_import
			frappe.flags.in_import = True
			try:
				follow_up.on_lead_insert(self.lead())
			finally:
				frappe.flags.in_import = before
		upsert.assert_not_called()

	def test_a_failed_follow_up_never_costs_the_prospect(self):
		with (
			patch.object(prospect_settings, "get", return_value={**OFF, "first_follow_up": "2h"}),
			patch.object(follow_up.follow_up, "upsert", side_effect=frappe.ValidationError("no")),
			patch.object(frappe.db, "savepoint"),
			patch.object(frappe.db, "rollback") as rollback,
			patch.object(frappe, "log_error") as log_error,
		):
			follow_up.on_lead_insert(self.lead())
		rollback.assert_called_once_with(save_point=follow_up.SAVEPOINT)
		log_error.assert_called_once()

	def test_the_follow_up_moves_to_whoever_the_lead_is_assigned_to(self):
		todo = frappe._dict(
			reference_type="CRM Lead",
			reference_name="CRM-LEAD-0001",
			allocated_to="beto@example.com",
			status="Open",
		)
		with (
			patch.object(frappe.db, "exists", return_value=True),
			patch.object(follow_up.follow_up, "reassign") as reassign,
		):
			follow_up.on_todo_insert(todo)
			follow_up.on_todo_insert(frappe._dict({**todo, "reference_type": "CRM Deal"}))
		reassign.assert_called_once_with(
			slot="CRM Lead:CRM-LEAD-0001:primer-seguimiento", owner="beto@example.com"
		)


class ProspectChipTests(TestCase):
	def test_a_source_the_vocabulary_does_not_know_is_its_own_chip(self):
		self.assertEqual(prospects.lead_chip("Website"), "web")
		self.assertEqual(prospects.lead_chip("TikTok"), "origen:TikTok")
		self.assertEqual(prospects.lead_chip(""), "otro")
		self.assertEqual(prospects.chip_label("origen:TikTok"), "TikTok")
		self.assertEqual(prospects.chip_label("web"), "Sitio web")

	def test_own_chips_filter_the_list_and_consultas_capture_follows_the_switch(self):
		with (
			patch("crm.api.check_app_permission", return_value=True),
			patch.object(prospect_settings, "get", return_value={**OFF, "inquiries": False}),
			patch.object(prospects, "_inquiries_available", return_value=True),
			patch.object(prospects, "_grouped", return_value={"TikTok": 3, "Website": 2}),
			patch.object(prospects, "_grouped_inquiries", return_value={"Manual": 1}),
			patch.object(prospects, "_lead_rows", return_value=[]) as lead_rows,
			patch.object(prospects, "_inquiry_rows", return_value=[]),
			patch.object(prospect_settings, "can_change", return_value=False),
		):
			out = prospects.list_prospects(source="origen:TikTok")
		self.assertEqual(lead_rows.call_args.args[2], ["TikTok"])
		self.assertFalse(lead_rows.call_args.args[3])  # no companies: no organization search
		self.assertIn({"key": "origen:TikTok", "label": "TikTok", "count": 3}, out["sources"])
		self.assertTrue(out["inquiries_enabled"])
		self.assertFalse(out["inquiries_capture"])
		self.assertFalse(out["can_change_settings"])


class ApiTests(TestCase):
	def test_a_save_answers_with_what_it_wrote(self):
		saved = {**OFF, "companies": True}
		with (
			patch("crm.api.check_app_permission", return_value=True),
			patch.object(prospect_settings, "save", return_value=saved) as save,
			patch.object(prospect_settings, "get", side_effect=AssertionError("re-read")),
			patch.object(prospect_settings, "sources", return_value=[]),
			patch.object(prospect_settings, "can_change", return_value=True),
		):
			from crm.api import prospect_settings as api

			out = api.save_settings('{"companies": 1}')
		save.assert_called_once_with({"companies": 1})
		self.assertEqual(out["settings"], saved)
