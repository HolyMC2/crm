"""Native template policy with real template rows and no provider transport."""

import json
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import outbox_policy as policy


class TestWhatsAppTemplatePolicy(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.point = "template_policy_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.addCleanup(lambda: frappe.db.rollback(save_point=self.point))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No provider transport"))
		)
		# Double only the provider boundary. Parent and button children are saved
		# by the native template controller, including naming/link validation.
		self.provider = self.enterContext(
			patch("frappe_whatsapp.transport.api", return_value={"id": "fixture", "status": "APPROVED"})
		)
		self.account = frappe.get_doc(
			{
				"doctype": "WhatsApp Account",
				"account_name": "policy-account-" + uuid4().hex[:12],
				"mode": "Demo",
				"token": "fixture-only-token",
				"url": "https://provider.example.invalid",
				"version": "v23.0",
				"business_id": "12345",
			}
		).insert()
		self.name = "policy_" + uuid4().hex[:12]
		self.row = (
			frappe.get_doc(
				{
					"doctype": "WhatsApp Templates",
					"template_name": self.name,
					"actual_name": self.name,
					"language": "en",
					"template": "Synthetic policy fixture",
					"category": "UTILITY",
					"whatsapp_account": self.account.name,
					"buttons": [],
				}
			)
			.insert()
			.reload()
		)
		self.assertEqual(self.row.status, "APPROVED")
		self.assertTrue(self.provider.called)
		self.payload = {
			"type": "template",
			"template": {
				"name": self.name,
				"language": {"code": self.row.language_code},
				"components": [],
			},
		}

	def reason(self):
		intent = frappe._dict(payload=json.dumps(self.payload), peer_id="525550001234")
		return policy.whatsapp_template_reason(intent, self.account)

	def test_approved_account_and_language_required_on_every_check(self):
		self.assertIsNone(self.reason())
		for values in ({"status": "PAUSED"}, {"whatsapp_account": "different"}, {"language_code": "en_US"}):
			with self.subTest(values=values):
				old = {field: self.row.get(field) for field in values}
				frappe.db.set_value(self.row.doctype, self.row.name, values)
				self.assertEqual(self.reason(), "template_unavailable")
				frappe.db.set_value(self.row.doctype, self.row.name, old)

	def test_static_catalog_and_dynamic_multi_product_templates_cannot_skip_catalog_checks(self):
		for button_type in ("Catalog", "Multi-Product Message"):
			self.row.set("buttons", [{"button_type": button_type, "button_label": "Browse"}])
			self.row.save()
			self.assertEqual(self.reason(), "catalog_template_not_ready")
		self.row.set("buttons", [{"button_type": "Quick Reply", "button_label": "Confirm"}])
		self.row.save()
		self.assertIsNone(self.reason())
		for component in (
			{"type": "button", "sub_type": "mpm", "parameters": []},
			{
				"type": "button",
				"sub_type": "url",
				"parameters": [{"type": "action", "action": {"sections": []}}],
			},
		):
			self.payload["template"]["components"] = [component]
			self.assertEqual(self.reason(), "catalog_template_not_ready")

	def test_marketing_requires_one_installed_consent_owner_and_literal_true(self):
		frappe.db.set_value(self.row.doctype, self.row.name, "category", "MARKETING")
		original_hooks = frappe.get_hooks

		def hooks(paths):
			return lambda key, *args, **kwargs: (
				paths if key == "crm_whatsapp_marketing_consent" else original_hooks(key, *args, **kwargs)
			)

		with patch.object(frappe, "get_hooks", side_effect=hooks([])):
			self.assertEqual(self.reason(), "marketing_consent_unverified")
		with patch.object(frappe, "get_hooks", side_effect=hooks(["app.consent"])):
			for value in (False, None, "yes", {"allowed": True}):
				with patch(
					"crm.api.outbox._adapter_module", return_value=SimpleNamespace(check=lambda peer: value)
				):
					self.assertEqual(self.reason(), "marketing_consent_unverified")
			with patch(
				"crm.api.outbox._adapter_module", return_value=SimpleNamespace(check=lambda peer: True)
			):
				self.assertIsNone(self.reason())

	def test_catalog_button_is_bound_to_its_native_template_parent(self):
		other = frappe.copy_doc(self.row)
		other.template_name = "other_" + uuid4().hex[:12]
		other.set("buttons", [{"button_type": "Catalog", "button_label": "Browse"}])
		other.insert()
		self.assertIsNone(self.reason())
		self.payload["template"]["name"] = other.actual_name
		self.assertEqual(self.reason(), "catalog_template_not_ready")

	def test_plain_text_still_requires_customer_window(self):
		self.payload = {"type": "text", "text": {"body": "Test"}}
		self.assertIsNone(self.reason())
		self.assertTrue(policy.requires_window(frappe._dict(payload=json.dumps(self.payload))))
