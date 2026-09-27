"""Mandatory native absence tests, explicitly run on the Frappe+CRM-only cohort.

This module intentionally has no ``test_`` prefix: full-app discovery cannot
prove provider absence. The standalone CI job must execute it explicitly.
"""

import importlib.util

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import conversations as api

OPTIONAL_APPS = (
	"erpnext",
	"payments",
	"frappe_whatsapp",
	"doco",
	"doco_marketing",
	"doco_meta_catalog",
	"mercadopago_connector",
	"mercado",
	"posawesome",
	"scanner_kit",
	"taller",
)


class TestConversationCore(IntegrationTestCase):
	"""Runs with frappe+crm only: optional channels never become hard imports."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.assertEqual(set(frappe.get_installed_apps()), {"frappe", "crm"})
		self.assertEqual(set(frappe.get_all_apps()), {"frappe", "crm"})
		for app in OPTIONAL_APPS:
			with self.subTest(optional_app=app):
				self.assertIsNone(importlib.util.find_spec(app), f"Optional app remains importable: {app}")

	def test_private_schema_has_no_optional_doctype_links(self):
		allowed = {"CRM Conversation", "User"}
		for name in (api.DOCTYPE, api.EVENT):
			meta = frappe.get_meta(name)
			self.assertFalse(meta.permissions)
			for field in meta.fields:
				if field.fieldtype == "Link":
					self.assertIn(field.options, allowed)
		self.assertEqual(frappe.get_meta(api.DOCTYPE).get_field("control_state").default, "Human")
		self.assertEqual(frappe.get_meta(api.DOCTYPE).get_field("bot_enabled").default, "0")

	def test_absent_channel_adapter_is_denied_without_import(self):
		for provider in ("WhatsApp", "Messenger", "Instagram"):
			with self.subTest(provider=provider), self.assertRaises(frappe.PermissionError):
				api.get_or_create(provider, "980000111", "5215550100888")
		with self.assertRaises(frappe.ValidationError):
			api.get_or_create("Web", "980000111", "visitor-opaque")
		with self.assertRaises(frappe.ValidationError):
			api.get_or_create("Desk", "980000111", "Administrator")

	def test_administrator_generic_create_cannot_forge_service(self):
		doc = frappe.get_doc(
			{
				"doctype": api.DOCTYPE,
				"provider": "WhatsApp",
				"account_id": "980000112",
				"peer_id": "5215550100777",
				"account_record": "fictional",
				"control_state": "Bot",
				"bot_enabled": 1,
			}
		)
		with self.assertRaises(frappe.PermissionError):
			doc.insert(ignore_permissions=True)
