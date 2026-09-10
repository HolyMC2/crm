"""CRM entrypoint works even before Doco's provider protocol is deployed."""

from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

import frappe
from crm.api import capabilities


class VerticalCapabilitiesTests(TestCase):
	def setUp(self):
		self.local = SimpleNamespace(response={}, message_log=[])
		self.doc = Mock()
		self.apps = ["frappe", "crm"]
		for item in (
			patch.object(frappe, "local", self.local),
			patch.object(frappe, "session", SimpleNamespace(user="fictional")),
			patch.object(frappe, "db", SimpleNamespace(get_value=lambda *args: True)),
			patch.object(frappe, "get_doc", return_value=self.doc),
			patch.object(capabilities, "get_session_role_flags"),
			patch.object(capabilities, "get_installed_apps", side_effect=lambda: self.apps),
		):
			item.start()
			self.addCleanup(item.stop)

	def test_core_only_is_empty_and_permission_checked_without_optional_imports(self):
		with patch.dict("sys.modules", {"doco": None}):
			result = capabilities.get_vertical_config({"doctype": "CRM Deal", "name": "fictional"})
		self.assertEqual(result["providers"], [])
		self.assertEqual(result["sections"], [])
		self.doc.check_permission.assert_called_once_with("read")

	def test_denied_context_stops_before_discovery(self):
		self.doc.check_permission.side_effect = frappe.PermissionError
		with self.assertRaises(frappe.PermissionError):
			capabilities.get_vertical_config({"doctype": "CRM Deal", "name": "denied"})

	def test_arbitrary_entity_inputs_rejected(self):
		for entity in ({"doctype": "Patient", "name": "x"}, [], "x" * 513,
				{"doctype": "CRM Deal", "name": "x", "provider": "evil"}):
			with self.subTest(entity=entity), self.assertRaises(frappe.ValidationError):
				capabilities.get_vertical_config(entity)
		self.doc.check_permission.assert_not_called()

	def test_old_doco_and_bad_layout_do_not_break_core(self):
		self.apps += ["doco"]
		with patch.dict("sys.modules", {"doco.crm.api": None}), \
				patch("doco.docoutils.boot.get_active_vertical_config", side_effect=RuntimeError("sensitive")):
			result = capabilities.get_vertical_config()
		self.assertEqual(result["providers"], [])
		self.assertNotIn("sensitive", str(result))

	def test_legacy_sections_require_their_actual_apps_and_ignore_unsafe_props(self):
		self.apps += ["doco", "taller"]
		sections = [
			{"enabled": 1, "vue_component": "RepairOrdersSection", "render_in": "data_tab",
			 "config": {"docname": "other-record", "onClick": "evil", "initiallyOpen": True}},
			{"enabled": 1, "vue_component": "DealDocumentsSection", "render_in": "data_tab"},
			{"enabled": 1, "vue_component": "ArbitraryComponent", "render_in": "data_tab"},
		]
		with patch("doco.crm.api.discover", return_value={"providers": []}), \
				patch("doco.docoutils.boot.get_active_vertical_config", return_value={"sections": sections}), \
				patch.object(frappe, "has_permission", return_value=True):
			result = capabilities.get_vertical_config()
		self.assertEqual([s["vue_component"] for s in result["sections"]], ["RepairOrdersSection"])
		self.assertEqual(result["sections"][0]["config"], {"initiallyOpen": True})
		self.assertNotIn("other-record", str(result))
