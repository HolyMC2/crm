"""Read-only effective configuration with real native role/field/record checks."""

from unittest.mock import patch

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from crm.api.effective_settings import get_effective_settings
from crm.pipeline.services.configuration import default_pipeline


class TestEffectiveSettings(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.key = frappe.generate_hash(length=10)
		self.manager = self.user("manager", "Sales Manager")
		self.seller = self.user("seller", "Sales User")
		self.admin = self.user("admin", "System Manager")
		self.stage = frappe.get_doc(
			{
				"doctype": "CRM Deal Status",
				"deal_status": f"Effective {self.key}",
				"type": "Open",
				"probability": 15,
			}
		).insert()
		self.pipeline = self.make_pipeline("A")
		self.other = self.make_pipeline("B")
		self.holiday = frappe.get_doc(
			{
				"doctype": "CRM Holiday List",
				"holiday_list_name": f"Effective holiday {self.key}",
				"from_date": "2026-01-01",
				"to_date": "2026-12-31",
				"holidays": [
					{"date": "2026-12-25", "description": "Private holiday description", "weekly_off": 0}
				],
			}
		).insert()
		priority = frappe.get_list("CRM Communication Status", pluck="name", limit_page_length=1)[0]
		self.sla = frappe.get_doc(
			{
				"doctype": "CRM Service Level Agreement",
				"sla_name": f"Effective SLA {self.key}",
				"apply_on": "CRM Deal",
				"enabled": 1,
				"condition": "doc.name != 'private-condition-marker'",
				"holiday_list": self.holiday.name,
				"working_hours": [{"workday": "Monday", "start_time": "09:00:00", "end_time": "17:00:00"}],
				"priorities": [{"priority": priority, "default_priority": 1, "first_response_time": 3600}],
			}
		).insert()
		self.assignment = self.rule("CRM Deal")
		self.unrelated = self.rule("User")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		for doctype in (
			"CRM Pipeline",
			"CRM Service Day",
			"FCRM Settings",
			"System Settings",
			"User",
			"CRM Holiday List",
		):
			frappe.clear_cache(doctype=doctype)
		super().tearDown()

	def user(self, label, role):
		return (
			frappe.get_doc(
				{
					"doctype": "User",
					"email": f"effective-{label}-{self.key}@example.invalid",
					"first_name": label,
					"send_welcome_email": 0,
					"roles": [{"role": role}],
				}
			)
			.insert()
			.name
		)

	def make_pipeline(self, label, **values):
		return frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": f"Effective {label} {self.key}",
				"currency": "USD",
				"probability_policy": "Stage",
				"stages": [{"status": self.stage.name, "probability": 27}],
				**values,
			}
		).insert()

	def rule(self, doctype):
		return frappe.get_doc(
			{
				"doctype": "Assignment Rule",
				"document_type": doctype,
				"disabled": 1,
				"rule": "Round Robin",
				"priority": 3,
				"assign_condition": "name != 'private-assignment-marker'",
				"users": [{"user": self.admin}],
				"assignment_days": [{"day": "Tuesday"}],
			}
		).insert(set_name=f"Effective {doctype} {self.key}")

	def test_sales_user_cannot_discover_manager_configuration(self):
		frappe.set_user(self.seller)
		with self.assertRaises(frappe.PermissionError):
			get_effective_settings(pipeline=self.pipeline.name)

	def test_read_summary_preserves_records_and_uses_canonical_sources(self):
		before = {
			doc.doctype + doc.name: doc.reload().as_dict()
			for doc in (self.pipeline, self.sla, self.holiday, self.assignment)
		}
		frappe.set_user(self.admin)
		result = get_effective_settings(pipeline=self.pipeline.name)
		sections = result["sections"]
		self.assertEqual(sections["pipeline"]["state"], "configured")
		self.assertEqual(sections["pipeline"]["values"]["currency"], "USD")
		self.assertEqual(sections["pipeline"]["values"]["default"]["name"], default_pipeline())
		self.assertEqual(sections["pipeline"]["items"][0]["probability"], 27)
		self.assertEqual(sections["pipeline"]["source"]["editor"], "Sales pipelines")
		self.assertEqual(sections["slas"]["applicability"], "record_conditions_required")
		rule = next(item for item in sections["slas"]["items"] if item["name"] == self.sla.name)
		self.assertTrue(rule["conditional"])
		self.assertEqual(rule["hours"][0]["day"], "Monday")
		self.assertEqual(str(rule["holiday"]["items"][0]["date"]), "2026-12-25")
		assignment = next(
			item for item in sections["assignment"]["items"] if item["name"] == self.assignment.name
		)
		self.assertEqual(assignment["weekdays"], ["Tuesday"])
		self.assertNotIn(self.unrelated.name, [item["name"] for item in sections["assignment"]["items"]])
		serialized = frappe.as_json(result)
		for private in (
			"private-condition-marker",
			"private-assignment-marker",
			"Private holiday description",
		):
			self.assertNotIn(private, serialized)
		self.assertEqual(
			before,
			{
				doc.doctype + doc.name: doc.reload().as_dict()
				for doc in (self.pipeline, self.sla, self.holiday, self.assignment)
			},
		)

	def test_pipeline_record_scope_excludes_other_pipeline_and_known_name(self):
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.manager,
				"allow": "CRM Pipeline",
				"for_value": self.pipeline.name,
			}
		).insert()
		frappe.set_user(self.manager)
		result = get_effective_settings(pipeline=self.other.name)
		self.assertEqual(result["sections"]["pipeline"], {"state": "denied"})
		self.assertNotIn(self.other.name, [row["name"] for row in result["choices"].get("pipelines", [])])
		self.assertNotIn(self.other.pipeline_name, frappe.as_json(result))

	def test_masked_pipeline_field_never_leaks_value_or_sibling_details(self):
		make_property_setter("CRM Pipeline", "currency", "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Pipeline")
		frappe.set_user(self.manager)
		result = get_effective_settings(pipeline=self.pipeline.name)
		self.assertEqual(result["sections"]["pipeline"], {"state": "denied"})

	def test_child_hours_permlevel_is_enforced_using_parent_permissions(self):
		make_property_setter("CRM Service Day", "start_time", "permlevel", 9, "Int")
		frappe.clear_cache(doctype="CRM Service Day")
		frappe.set_user(self.manager)
		result = get_effective_settings(pipeline=self.pipeline.name)
		self.assertEqual(result["sections"]["slas"]["state"], "denied")
		self.assertNotIn("09:00:00", frappe.as_json(result["sections"]["slas"]))

	def test_site_and_personal_timezones_have_separate_readable_sources(self):
		frappe.db.set_single_value("System Settings", "time_zone", "America/Mazatlan")
		frappe.db.set_value("User", self.admin, "time_zone", "Europe/Madrid")
		frappe.clear_cache(doctype="System Settings")
		frappe.set_user(self.admin)
		sections = get_effective_settings()["sections"]
		self.assertEqual(sections["site_timezone"]["values"]["effective_timezone"], "America/Mazatlan")
		self.assertEqual(sections["personal_timezone"]["values"]["effective_timezone"], "Europe/Madrid")
		self.assertFalse(sections["personal_timezone"]["values"]["inherits_site"])

	def test_unreadable_site_timezone_is_not_leaked_by_personal_fallback(self):
		frappe.db.set_value("User", self.admin, "time_zone", "")
		make_property_setter("System Settings", "time_zone", "mask", 1, "Check")
		frappe.clear_cache(doctype="System Settings")
		frappe.set_user(self.admin)
		sections = get_effective_settings()["sections"]
		self.assertEqual(sections["site_timezone"], {"state": "denied"})
		self.assertEqual(sections["personal_timezone"]["state"], "not_configured")
		self.assertIsNone(sections["personal_timezone"]["values"]["effective_timezone"])

	def test_unconfigured_holidays_and_empty_weekdays_are_not_unified(self):
		self.sla.holiday_list = None
		self.sla.save()
		self.assignment.assignment_days = []
		self.assignment.save()
		frappe.set_user(self.admin)
		sections = get_effective_settings()["sections"]
		rule = next(item for item in sections["slas"]["items"] if item["name"] == self.sla.name)
		assignment = next(
			item for item in sections["assignment"]["items"] if item["name"] == self.assignment.name
		)
		self.assertEqual(rule["holiday"], {"state": "not_configured"})
		self.assertEqual(assignment["weekdays"], [])
		self.assertEqual(rule["hours"][0]["day"], "Monday")

	def test_read_failure_is_unavailable_not_false_empty_configuration(self):
		original = frappe.get_doc

		def interrupted(*args, **kwargs):
			if args and args[0] == "FCRM Settings":
				raise RuntimeError("simulated source outage")
			return original(*args, **kwargs)

		with patch("frappe.get_doc", side_effect=interrupted):
			sections = get_effective_settings(pipeline=self.pipeline.name)["sections"]
		self.assertEqual(sections["crm_currency"], {"state": "unavailable"})
		self.assertEqual(sections["hierarchy"], {"state": "unavailable"})
		self.assertEqual(sections["pipeline"]["state"], "configured")

	def test_company_specific_default_uses_native_resolution(self):
		if frappe.db.exists("DocType", "Company"):
			companies = frappe.get_list("Company", pluck="name", limit_page_length=1)
			company = (
				companies[0]
				if companies
				else frappe.get_doc(
					{
						"doctype": "Company",
						"company_name": f"Effective scope {self.key}",
						"abbr": self.key[:5].upper(),
						"default_currency": "MXN",
						"country": "Mexico",
						"chart_of_accounts": "Standard",
					}
				)
				.insert()
				.name
			)
		else:
			company = f"Standalone company scope {self.key}"
		# Reuse an existing default if the full-app fixture configured this company.
		default = default_pipeline(company)
		if default and frappe.get_doc("CRM Pipeline", default).sales_company == company:
			expected = default
		else:
			expected = self.make_pipeline("Company", sales_company=company, is_default=1).name
		result = get_effective_settings(company=company)
		self.assertEqual(result["sections"]["pipeline"]["values"]["name"], expected)
		self.assertIn(self.pipeline.name, [row["name"] for row in result["choices"]["pipelines"]])
		self.assertEqual(result["sections"]["pipeline"]["values"]["default"]["company"], company)
