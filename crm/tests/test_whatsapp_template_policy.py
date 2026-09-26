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
		self.account = frappe._dict(name="policy-account-" + uuid4().hex[:12])
		self.name = "policy_" + uuid4().hex[:12]
		self.row = frappe.get_doc(
			{
				"doctype": "WhatsApp Templates",
				"template_name": self.name,
				"actual_name": self.name,
				"language_code": "es_MX",
				"category": "UTILITY",
				"whatsapp_account": self.account.name,
				"status": "APPROVED",
				"buttons": "[]",
			}
		)
		# Native insert would register a template remotely; this is a local policy fixture.
		self.row.db_insert()
		self.payload = {
			"type": "template",
			"template": {
				"name": self.name,
				"language": {"code": "es_MX"},
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
		for button in ({"type": "CATALOG"}, {"type": "MPM"}):
			frappe.db.set_value(self.row.doctype, self.row.name, "buttons", json.dumps([button]))
			self.assertEqual(self.reason(), "catalog_template_not_ready")
		frappe.db.set_value(self.row.doctype, self.row.name, "buttons", "[]")
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
		with patch.object(frappe, "get_hooks", return_value=[]):
			self.assertEqual(self.reason(), "marketing_consent_unverified")
		with patch.object(frappe, "get_hooks", return_value=["app.consent"]):
			for value in (False, None, "yes", {"allowed": True}):
				with patch(
					"crm.api.outbox._adapter_module", return_value=SimpleNamespace(check=lambda peer: value)
				):
					self.assertEqual(self.reason(), "marketing_consent_unverified")
			with patch(
				"crm.api.outbox._adapter_module", return_value=SimpleNamespace(check=lambda peer: True)
			):
				self.assertIsNone(self.reason())

	def test_plain_text_still_requires_customer_window(self):
		self.payload = {"type": "text", "text": {"body": "Test"}}
		self.assertIsNone(self.reason())
		self.assertTrue(policy.requires_window(frappe._dict(payload=json.dumps(self.payload))))
