"""The migration gate accepts only proven metadata cleanup, never record deletion."""

import copy
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class MetadataDeletionTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		frappe = types.ModuleType("frappe")
		frappe.db = Mock()
		frappe.get_doc = Mock()
		frappe.get_all = Mock()
		frappe.get_app_path = Mock(return_value="/synthetic/frappe")
		cache = types.ModuleType("frappe.cache_manager")
		cache.clear_controller_cache = Mock()
		base = types.ModuleType("frappe.model.base_document")
		base.get_controller = Mock()
		spec = importlib.util.spec_from_file_location(
			"migration_probe", Path(__file__).with_name("migration-probe.py")
		)
		cls.probe = importlib.util.module_from_spec(spec)
		with patch.dict(
			sys.modules, {"frappe": frappe, "frappe.cache_manager": cache, "frappe.model.base_document": base}
		):
			spec.loader.exec_module(cls.probe)

	def setUp(self):
		self.before = {f"{doctype}:{name}": True for doctype, name in self.probe._REPLACEMENTS}
		self.before.update(
			obsolete_icon_is_duplicate=True,
			obsolete_icon_absent=False,
			canonical_icon=True,
			mercado_widget_links=True,
		)
		self.after = {**self.before, "obsolete_icon_is_duplicate": False, "obsolete_icon_absent": True}
		self.rows = [
			{"deleted_doctype": doctype, "deleted_name": name}
			for doctype, name in (*self.probe._REPLACEMENTS, self.probe._OLD_ICON)
		]

	def validate(self):
		self.probe._validate_deletions(self.rows, self.before, self.after)

	def test_exact_nine_cleanup_records_with_canonical_replacements_pass(self):
		self.validate()

	def test_no_deletions_pass(self):
		self.rows = []
		self.validate()

	def test_business_records_and_other_metadata_are_never_allowed(self):
		for doctype, name in [
			("CRM Lead", "migration"),
			("DocType", "CRM Lead"),
			("Number Card", "Mercado: Other"),
			("Workspace", "Mercado"),
		]:
			with (
				self.subTest(doctype=doctype, name=name),
				self.assertRaisesRegex(AssertionError, "Unexpected"),
			):
				self.probe._validate_deletions(
					[{"deleted_doctype": doctype, "deleted_name": name}], self.before, self.after
				)

	def test_duplicate_deletion_is_rejected(self):
		self.rows.append(self.rows[0])
		with self.assertRaisesRegex(AssertionError, "Repeated"):
			self.validate()

	def test_every_replacement_must_match_before_and_after(self):
		for key in [f"{doctype}:{name}" for doctype, name in self.probe._REPLACEMENTS]:
			for stage in ["before", "after"]:
				with self.subTest(key=key, stage=stage):
					getattr(self, stage)[key] = False
					with self.assertRaises(AssertionError):
						self.validate()
					getattr(self, stage)[key] = True

	def test_missing_workspace_widgets_are_rejected(self):
		self.after["mercado_widget_links"] = False
		with self.assertRaisesRegex(AssertionError, "workspace"):
			self.validate()

	def test_old_icon_requires_proven_duplicate_and_canonical_survivor(self):
		for stage, key in [
			("before", "obsolete_icon_is_duplicate"),
			("after", "obsolete_icon_absent"),
			("after", "canonical_icon"),
		]:
			with self.subTest(stage=stage, key=key):
				getattr(self, stage)[key] = False
				with self.assertRaises(AssertionError):
					self.validate()
				getattr(self, stage)[key] = True

	def test_metadata_reader_checks_fields_queries_links_and_missing_replacements(self):
		class Document(dict):
			__getattr__ = dict.get

		card_contracts = {
			("Number Card", name): {
				"module": "Mercado",
				"filters_json": [["Sales Invoice", "docstatus", "=", 1]],
				"function": "Count",
				"is_public": 1,
			}
			for name in self.probe._CARD_NAMES
		}
		contracts = {
			**card_contracts,
			("Workspace", "Escáner"): {
				"module": "Scanner Kit",
				"app": "scanner_kit",
				"public": 1,
				"is_hidden": 0,
			},
			("Dashboard Chart", self.probe._CHART_NAME): {
				"module": "Mercado",
				"filters_json": [],
				"document_type": "Mercado Price Change Log",
			},
		}
		docs = {identity: Document(copy.deepcopy(values)) for identity, values in contracts.items()}
		for doc in docs.values():
			if "filters_json" in doc:
				doc["filters_json"] = json.dumps(doc["filters_json"])
		docs[("Workspace", "Escáner")].shortcuts = [Document(type="URL", url="/scan")]
		docs[("Workspace", "Mercado")] = Document(
			module="Mercado",
			public=1,
			is_hidden=0,
			number_cards=[Document(number_card_name=name) for name in self.probe._CARD_NAMES],
			charts=[Document(chart_name=self.probe._CHART_NAME)],
		)
		docs[("Desktop Icon", "Framework")] = Document(link="/desk/build", hidden=0, standard=1)
		sync = types.ModuleType("frappe.model.sync")
		sync.check_if_record_exists = lambda _kind, _path, _doctype, name: name == "Framework"
		self.probe.frappe.db.exists.side_effect = lambda *identity: identity in docs
		self.probe.frappe.get_doc.side_effect = lambda *identity: docs[identity]
		self.probe.frappe.get_all.return_value = ["Framework"]
		with (
			patch.dict(sys.modules, {"frappe.model.sync": sync}),
			patch.object(self.probe, "_metadata_contracts", return_value=contracts),
		):
			state = self.probe._metadata_state()
			self.probe._validate_deletions(self.rows, self.before, state)
			identity = ("Number Card", self.probe._CARD_NAMES[0])
			docs[identity]["filters_json"] = "[]"
			with self.assertRaisesRegex(AssertionError, "replacement"):
				self.probe._validate_deletions(self.rows, self.before, self.probe._metadata_state())
			del docs[identity]
			with self.assertRaisesRegex(AssertionError, "replacement"):
				self.probe._validate_deletions(self.rows, self.before, self.probe._metadata_state())


if __name__ == "__main__":
	unittest.main()
