"""Persist synthetic CRM records on the base, verify them after native migration.

Each function runs through bench execute, which commits only after it succeeds.
"""

import hashlib
import json
from pathlib import Path

import frappe
from frappe.cache_manager import clear_controller_cache
from frappe.model.base_document import get_controller

# Audited against the immutable image documented in docs/CI.md. These are metadata
# identities, never prefixes or permission to delete business records.
_CARD_NAMES = (
	"Mercado: Conteos activos",
	"Mercado: Cortes de caja (mes)",
	"Mercado: Cajas marcadas",
	"Mercado: Tareas de catálogo abiertas",
	"Mercado: Crédito · papelería pendiente",
	"Mercado: Crédito · por conciliar",
)
_CHART_NAME = "Mercado: Cambios de precio por día"
_REPLACEMENTS = (
	("Workspace", "Escáner"),
	*(("Number Card", name) for name in _CARD_NAMES),
	("Dashboard Chart", _CHART_NAME),
)
_OLD_ICON = ("Desktop Icon", "Frappe Framework")
_OWNER_SOURCES = {
	"frappe": {
		"revision": "988e54f3c4c291e2077a83809663f123731abe76",
		"files": {"model/sync.py": "be2e542b91bc7b9d22e162ef89004f24a60454c13629350237a06407c280b69b"},
	},
	"scanner_kit": {
		"revision": "bae4f2991116bf17dd33bf0f2bae877eefb46b94",
		"files": {
			"hooks.py": "86534057a20fddd856d49f31777c5e42d6854ccec5076929cc3f964ebcc8a7fb",
			"install.py": "bbb7c4acb8e0ef2cc354b49e0f4cbd4981a09ff5de45ab80245bed4dfef33abe",
			"desk.py": "ca522a9bb617c1e71af99cdd09f78d4246472391a70b9a8ead2c4f869270b65e",
			"fixtures/workspace.json": "342622a43d76afb245cf728488752f6149e5d612f9af21a92fd490741bbf0841",
		},
	},
	"mercado": {
		"revision": "02bfc46fb2cef16f80c226edba51b92bc2dd8f8b",
		"files": {
			"hooks.py": "b878b6c26f502133ca17efc2b0a141e15b808fe9892df91dee7381a1c33c9d80",
			"desk.py": "c22c80c527336e2c880fefb32a1bf534580f93b776a73994506b86d038964ef1",
		},
	},
}


def _owner_sources():
	for app, source in _OWNER_SOURCES.items():
		for relative, expected in source["files"].items():
			actual = hashlib.sha256(Path(frappe.get_app_path(app, relative)).read_bytes()).hexdigest()
			assert actual == expected, f"Re-audit changed metadata owner source: {app}/{relative}"
	return _OWNER_SOURCES


def _metadata_contracts():
	from mercado.desk import _NUMBER_CARDS

	assert tuple(row[0] for row in _NUMBER_CARDS) == _CARD_NAMES
	contracts = {
		("Workspace", "Escáner"): {
			"module": "Scanner Kit",
			"app": "scanner_kit",
			"public": 1,
			"is_hidden": 0,
		},
		("Dashboard Chart", _CHART_NAME): {
			"chart_name": _CHART_NAME,
			"chart_type": "Count",
			"document_type": "Mercado Price Change Log",
			"based_on": "creation",
			"filters_json": [],
			"time_interval": "Daily",
			"timespan": "Last Month",
			"timeseries": 1,
			"type": "Line",
			"is_public": 1,
			"module": "Mercado",
		},
	}
	for label, doctype, function, filters, color in _NUMBER_CARDS:
		contracts[("Number Card", label)] = {
			"label": label,
			"type": "Document Type",
			"document_type": doctype,
			"function": function,
			"filters_json": filters,
			"is_public": 1,
			"show_percentage_stats": 0,
			"module": "Mercado",
			"color": color,
		}
	return contracts


def _metadata_state():
	"""Read only the audited metadata fields; never Deleted Document.data or secrets."""
	from frappe.model.sync import check_if_record_exists

	state = {}
	for (doctype, name), expected in _metadata_contracts().items():
		key = f"{doctype}:{name}"
		state[key] = False
		if not frappe.db.exists(doctype, name):
			continue
		doc = frappe.get_doc(doctype, name)
		actual = {field: doc.get(field) for field in expected}
		if "filters_json" in actual:
			actual["filters_json"] = json.loads(actual["filters_json"] or "[]")
		state[key] = actual == expected
		if doctype == "Workspace":
			state[key] = state[key] and any(row.type == "URL" and row.url == "/scan" for row in doc.shortcuts)
	workspace = frappe.get_doc("Workspace", "Mercado")
	state["mercado_widget_links"] = (
		workspace.module == "Mercado"
		and workspace.public == 1
		and not workspace.is_hidden
		and set(_CARD_NAMES).issubset({row.number_card_name for row in workspace.number_cards})
		and _CHART_NAME in {row.chart_name for row in workspace.charts}
	)
	icons = frappe.get_all("Desktop Icon", filters={"app": "frappe", "icon_type": "App"}, pluck="name")
	old_file = bool(
		check_if_record_exists("app", frappe.get_app_path("frappe"), "Desktop Icon", _OLD_ICON[1])
	)
	new_file = bool(check_if_record_exists("app", frappe.get_app_path("frappe"), "Desktop Icon", "Framework"))
	state["obsolete_icon_is_duplicate"] = (
		_OLD_ICON[1] in icons and "Framework" in icons and not old_file and new_file
	)
	state["obsolete_icon_absent"] = not frappe.db.exists(*_OLD_ICON)
	state["canonical_icon"] = False
	if "Framework" in icons and new_file:
		icon = frappe.get_doc("Desktop Icon", "Framework")
		state["canonical_icon"] = icon.link == "/desk/build" and not icon.hidden and icon.standard == 1
	return state


def _validate_deletions(deletions, before, after):
	allowed = set(_REPLACEMENTS) | {_OLD_ICON}
	seen = set()
	for row in deletions:
		identity = (row["deleted_doctype"], row["deleted_name"])
		assert identity in allowed, f"Unexpected migration deletion: {identity}"
		assert identity not in seen, f"Repeated migration deletion: {identity}"
		seen.add(identity)
		if identity == _OLD_ICON:
			assert before["obsolete_icon_is_duplicate"], "Old icon was not a source-proven duplicate"
			assert after["obsolete_icon_absent"] and after["canonical_icon"], "Canonical app icon missing"
		else:
			key = f"{identity[0]}:{identity[1]}"
			assert before[key], f"Deleted metadata did not match its owner before migration: {identity}"
			assert after[key], f"Canonical metadata replacement missing or changed: {identity}"
			if identity[0] in {"Number Card", "Dashboard Chart"}:
				assert after["mercado_widget_links"], "Replacement missing from Mercado workspace"


def _snapshot_path():
	return Path(frappe.get_site_path("private", "crm-ci-migration.json"))


def seed():
	organization = frappe.get_doc(
		{
			"doctype": "CRM Organization",
			"organization_name": "CI Migration Organization",
			"currency": "USD",
			"annual_revenue": 1234.50,
		}
	).insert()
	lead = frappe.get_doc(
		{
			"doctype": "CRM Lead",
			"first_name": "Migration",
			"last_name": "Record",
			"email": "migration@example.invalid",
			"organization": organization.name,
		}
	).insert()
	comment = lead.add_comment("Comment", "Preserve this pre-upgrade activity")
	_snapshot_path().write_text(
		json.dumps(
			{
				"apps": frappe.get_installed_apps(),
				"metadata_owner_sources": _owner_sources(),
				"metadata": _metadata_state(),
				"doctypes": frappe.get_all("DocType", pluck="name"),
				"organization": organization.name,
				"lead": lead.name,
				"lead_status": lead.status,
				"comment": comment.name,
				"deleted_documents": frappe.get_all("Deleted Document", pluck="name"),
			},
			indent=2,
		)
	)
	print("Persisted base organization, lead and linked activity for migration verification")


def guard():
	"""Check native orphan detection without deleting any DocType, before migration."""
	for rebuild in (False, True):
		if rebuild:
			frappe.clear_cache()
		clear_controller_cache()
		for app in frappe.get_installed_apps():
			if frappe.get_module_list(app) and not frappe.local.app_modules.get(app):
				raise AssertionError(f"Installed app has no mapped modules: {app}")
		overrides = frappe.get_hooks("override_doctype_class", {})
		for doctype in frappe.get_all("DocType", filters={"custom": 0}, pluck="name"):
			if doctype not in overrides:
				get_controller(doctype)  # Import/lookup failures abort before native orphan deletion.
	print("Migration guard passed with both cached and rebuilt module maps")


def verify():
	snapshot = json.loads(_snapshot_path().read_text())
	deletions = frappe.get_all(
		"Deleted Document",
		filters={"name": ["not in", snapshot["deleted_documents"] or [""]]},
		fields=["name", "deleted_doctype", "deleted_name"],
		order_by="creation asc",
	)
	print("Migration deletion audit: " + json.dumps(deletions, default=str), flush=True)
	Path("/results/migration-deletions.json").write_text(json.dumps(deletions, indent=2, default=str))
	assert set(snapshot["apps"]) == set(
		frappe.get_installed_apps()
	), "Installed apps changed during migration"
	missing = set(snapshot["doctypes"]) - set(frappe.get_all("DocType", pluck="name"))
	assert not missing, f"Migration removed DocTypes: {sorted(missing)}"
	assert snapshot["metadata_owner_sources"] == _owner_sources()
	after_metadata = _metadata_state()
	Path("/results/migration-metadata.json").write_text(json.dumps(after_metadata, indent=2))
	_validate_deletions(deletions, snapshot["metadata"], after_metadata)
	organization = frappe.get_doc("CRM Organization", snapshot["organization"])
	assert organization.currency == "USD" and float(organization.annual_revenue) == 1234.50
	lead = frappe.get_doc("CRM Lead", snapshot["lead"])
	assert lead.email == "migration@example.invalid"
	assert lead.organization == organization.name and lead.status == snapshot["lead_status"]
	comment = frappe.get_doc("Comment", snapshot["comment"])
	assert (comment.reference_doctype, comment.reference_name) == ("CRM Lead", lead.name)
	assert comment.content == "Preserve this pre-upgrade activity"
	# Exercise a real write through the new controller, not only a database read.
	lead.last_name = "Upgraded"
	lead.save()
	assert frappe.get_doc("CRM Lead", lead.name).last_name == "Upgraded"
	print(f"Migration preserved {len(snapshot['doctypes'])} DocTypes, apps, records and activity links")
