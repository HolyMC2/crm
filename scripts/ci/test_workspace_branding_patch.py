"""The branding patch updates only default labels, never Workspace identity/content."""

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch


class TestWorkspaceBrandingPatch(unittest.TestCase):
	def run_patch(self, current):
		frappe = SimpleNamespace(db=Mock(), clear_document_cache=Mock(), cache=Mock())
		frappe.db.get_value.return_value = current
		path = Path(__file__).resolve().parents[2] / "crm/patches/v1_0/update_crm_workspace_branding.py"
		spec = importlib.util.spec_from_file_location("workspace_branding_patch", path)
		module = importlib.util.module_from_spec(spec)
		with patch.dict(sys.modules, {"frappe": frappe}):
			spec.loader.exec_module(module)
			module.execute()
		return frappe

	def test_updates_original_labels_on_the_existing_record_only(self):
		frappe = self.run_patch({"label": "Frappe CRM", "title": "Frappe CRM"})
		frappe.db.set_value.assert_called_once_with(
			"Workspace", "Frappe CRM", {"label": "CRM · Muelle", "title": "CRM"}, update_modified=False
		)
		frappe.clear_document_cache.assert_called_once_with("Workspace", "Frappe CRM")

	def test_rerun_and_missing_workspace_do_not_write(self):
		for current in (None, {"label": "CRM · Muelle", "title": "CRM"}):
			with self.subTest(current=current):
				self.run_patch(current).db.set_value.assert_not_called()

	def test_custom_labels_survive(self):
		self.run_patch({"label": "Mi negocio", "title": "Mis ventas"}).db.set_value.assert_not_called()
		frappe = self.run_patch({"label": "Mi negocio", "title": "Frappe CRM"})
		frappe.db.set_value.assert_called_once_with(
			"Workspace", "Frappe CRM", {"title": "CRM"}, update_modified=False
		)

	def test_fixture_keeps_a_unique_label_without_triggering_workspace_export_rename(self):
		path = Path(__file__).resolve().parents[2] / "crm/fcrm/workspace/frappe_crm/frappe_crm.json"
		workspace = json.loads(path.read_text())
		self.assertEqual(workspace["name"], "Frappe CRM")
		self.assertEqual(workspace["title"], "CRM")
		self.assertEqual(workspace["label"], "CRM · Muelle")
		# Workspace.before_export renames when title != label and label == name.
		self.assertNotEqual(workspace["label"], workspace["name"])
		# ERPNext's independent CRM Workspace owns the unique label "CRM".
		self.assertNotEqual(workspace["label"], "CRM")


if __name__ == "__main__":
	unittest.main()
