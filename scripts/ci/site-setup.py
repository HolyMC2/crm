"""Prepare the disposable full-graph site the way an initialized tenant already is.

Each function runs through bench execute, which commits only after it succeeds,
so this setup lands before run-tests takes its test transaction baseline. It
creates no business records of its own: only the native fixture factories, the
owning controllers' schema helpers and the canonical setup-wizard records.
"""

from contextlib import contextmanager

import frappe

_SITE = "crm-integration.localhost"


def _site():
	if frappe.local.site != _SITE or not frappe.conf.get("allow_tests"):
		raise RuntimeError("Only the disposable CRM integration site is supported")


@contextmanager
def _native_fixture_context():
	"""Use the framework's test-mode helper only while building native fixtures."""
	from frappe.tests.utils import toggle_test_mode

	previous = frappe.in_test
	had_flag = "in_test" in frappe.flags
	previous_flag = frappe.flags.get("in_test")
	try:
		toggle_test_mode(True)
		yield
	finally:
		toggle_test_mode(previous)
		if had_flag:
			frappe.flags.in_test = previous_flag
		else:
			frappe.flags.pop("in_test", None)


def erp_fields():
	"""Commit the same-site ERPNext CRM custom fields a tenant gets from its settings."""
	_site()
	settings = frappe.get_single("ERPNext CRM Settings")
	# The owning controller's schema helper, without enabling reconciliation,
	# choosing a Company or contacting another site.
	settings.is_erpnext_in_different_site = 0
	settings.create_custom_fields()
	frappe.clear_cache()
	expected = {
		"CRM Product": "erpnext_item_code",
		"CRM Deal": "erpnext_customer",
		"Quotation": "crm_deal",
		"Item": "crm_product_code",
		"Customer": "crm_deal",
	}
	for doctype, field in expected.items():
		if not frappe.get_meta(doctype).has_field(field) or not frappe.db.has_column(doctype, field):
			raise AssertionError(f"Same-site ERP field is absent: {doctype}.{field}")
	print("Same-site ERPNext CRM fields verified before the test baseline")


def native_fixture_graph():
	"""Build ERPNext's canonical fixture graph (setup records such as Warehouse Type Transit)."""
	_site()
	from frappe.tests.utils import make_test_records

	from crm.tests import before_tests

	with _native_fixture_context():
		# CRM Lead/Deal fixture links depend on CRM's user records, which the
		# native runner creates through this hook before dependency generation.
		before_tests()
		make_test_records("Sales Order", commit=False)
		make_test_records("CRM Lead Status", commit=False)
	required = {
		"CRM Lead Status": "New Lead",
		"Warehouse Type": "Transit",
		"UOM": "Nos",
		"Item Group": "All Item Groups",
		"Customer Group": "All Customer Groups",
		"Territory": "All Territories",
	}
	for doctype, name in required.items():
		if not frappe.db.exists(doctype, name):
			raise AssertionError(f"Canonical fixture dependency is absent: {doctype}/{name}")
	if not frappe.db.count("Sales Order"):
		raise AssertionError("Canonical Sales Order fixture graph is incomplete")
	print("Canonical ERP/CRM fixture dependencies verified before the test baseline")


def storefront_schema():
	"""Provision Doco's storefront metadata before test-owned savepoints exist."""
	_site()
	from doco.docoutils.storefront.provisioning import _missing_schema
	from doco.docoutils.storefront_schema import ensure

	result = ensure(force=True, repair=True)
	if result.get("failed"):
		raise AssertionError(f"Storefront schema setup failed: {result['failed']}")
	missing = _missing_schema()
	if missing:
		raise AssertionError(f"Storefront schema remains incomplete: {missing}")
	print("Storefront metadata, columns and indexes verified before the test baseline")
