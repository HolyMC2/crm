"""The migration gate accepts only proven metadata cleanup, never record deletion."""

import copy
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class MetadataDeletionTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		frappe_stub = types.ModuleType("frappe")
		frappe_stub.db = Mock()
		frappe_stub.get_doc = Mock()
		frappe_stub.get_all = Mock()
		frappe_stub.get_app_path = Mock(return_value="/synthetic/frappe")
		cache = types.ModuleType("frappe.cache_manager")
		cache.clear_controller_cache = Mock()
		base = types.ModuleType("frappe.model.base_document")
		base.get_controller = Mock()
		spec = importlib.util.spec_from_file_location(
			"migration_probe", Path(__file__).with_name("migration-probe.py")
		)
		cls.probe = importlib.util.module_from_spec(spec)
		with patch.dict(
			sys.modules,
			{"frappe": frappe_stub, "frappe.cache_manager": cache, "frappe.model.base_document": base},
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

	def test_migration_seed_preserves_native_historical_creation(self):
		for returned_creation in [self.probe._LEGACY_CREATION, "2026-09-23 00:00:00"]:
			with (
				self.subTest(returned_creation=returned_creation),
				tempfile.TemporaryDirectory() as directory,
			):
				organization = types.SimpleNamespace(name="CI Organization")
				organization.insert = lambda: organization
				lead = types.SimpleNamespace(name="CI Lead", status="Lead", creation=returned_creation)
				lead.insert = lambda: lead
				lead.reload = Mock()
				lead.add_comment = Mock(return_value=types.SimpleNamespace(name="CI Comment"))
				self.probe.frappe.get_doc.side_effect = [organization, lead]
				self.probe.frappe.get_doc.reset_mock()
				self.probe.frappe.db.set_value.reset_mock()
				snapshot_path = Path(directory) / "baseline.json"
				with (
					patch.object(self.probe, "_seed_erp_root"),
					patch.object(self.probe, "_snapshot_path", return_value=snapshot_path),
					patch.object(self.probe, "_owner_sources", return_value={}),
					patch.object(self.probe, "_metadata_state", return_value={}),
					patch.object(self.probe, "_item_groups", return_value=[]),
					patch.object(self.probe.frappe, "get_all", return_value=[]),
					patch.object(
						self.probe.frappe, "get_installed_apps", return_value=["frappe", "crm"], create=True
					),
				):
					if returned_creation == self.probe._LEGACY_CREATION:
						self.probe.seed()
						self.assertEqual(
							json.loads(snapshot_path.read_text())["lead_creation"], returned_creation
						)
					else:
						with self.assertRaisesRegex(AssertionError, "Historical fixture date"):
							self.probe.seed()
						self.assertFalse(snapshot_path.exists())
				self.assertNotIn("creation", self.probe.frappe.get_doc.call_args_list[1].args[0])
				self.probe.frappe.db.set_value.assert_called_once_with(
					"CRM Lead", "CI Lead", "creation", self.probe._LEGACY_CREATION, update_modified=False
				)
				lead.reload.assert_called_once()

	def test_empty_base_creates_canonical_native_root(self):
		self.probe.frappe.get_doc.reset_mock(side_effect=True)
		self.probe.frappe.get_doc.return_value = types.SimpleNamespace(
			is_group=1, parent_item_group="", insert=Mock()
		)
		with patch.object(self.probe, "_item_groups", return_value=[]):
			self.probe._seed_erp_root()
		self.probe.frappe.get_doc.assert_any_call(
			{
				"doctype": "Item Group",
				"item_group_name": "All Item Groups",
				"is_group": 1,
				"parent_item_group": "",
			}
		)
		self.probe.frappe.get_doc.return_value.insert.assert_called_once()

	def test_existing_canonical_root_is_not_rewritten(self):
		self.probe.frappe.get_doc.reset_mock(side_effect=True)
		self.probe.frappe.get_doc.return_value = types.SimpleNamespace(
			is_group=1, parent_item_group="", insert=Mock()
		)
		with patch.object(
			self.probe,
			"_item_groups",
			return_value=[{"name": "All Item Groups", "parent_item_group": "", "is_group": 1}],
		):
			self.probe._seed_erp_root()
		self.probe.frappe.get_doc.return_value.insert.assert_not_called()

	def test_conflicting_or_rootless_base_is_not_repaired(self):
		for name, parent in [("Equipos Seminuevos", ""), ("Orphan", "Missing")]:
			with (
				self.subTest(name=name),
				patch.object(
					self.probe,
					"_item_groups",
					return_value=[{"name": name, "parent_item_group": parent, "is_group": 0}],
				),
			):
				with self.assertRaises(AssertionError):
					self.probe._seed_erp_root()

	def test_root_and_existing_children_must_survive_unchanged(self):
		before = [
			{"name": "All Item Groups", "parent_item_group": "", "is_group": 1},
			{"name": "Existing child", "parent_item_group": "All Item Groups", "is_group": 0},
		]
		self.probe._validate_item_groups(
			before,
			[*before, {"name": "New companion group", "parent_item_group": "All Item Groups", "is_group": 0}],
		)
		for altered in [
			[*before, {"name": "Unexpected root", "parent_item_group": "", "is_group": 1}],
			before[1:],
			[before[0]],
			[{**before[0], "is_group": 0}, before[1]],
			[before[0], {**before[1], "parent_item_group": "Elsewhere"}],
		]:
			with self.subTest(altered=altered), self.assertRaises(AssertionError):
				self.probe._validate_item_groups(before, altered)

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
