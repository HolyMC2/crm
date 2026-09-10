"""Run staged source tests in a real lab context, with outbound network denied."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, "/tmp/crm-inquiry-candidate")
os.chdir("/home/frappe/frappe-bench/sites")
import frappe

frappe.init(site="crm-inquiry-test-20260909.lab.xoloitzcuintles.com")
frappe.connect()
# Candidate hooks must not reuse Redis app_hooks populated by active source.
# This process-local framework mode loads hooks from its own imported apps.
frappe.local.conf = frappe._dict(frappe.local.conf)
frappe.local.conf.developer_mode = 1
assert set(frappe.get_installed_apps()) == {"frappe", "crm"}, "Expected Frappe+CRM-only site"
assert frappe.get_hooks("permission_query_conditions")["CRM Inquiry"] == ["crm.fcrm.doctype.crm_inquiry.crm_inquiry.get_permission_query_conditions"]
assert frappe.get_hooks("has_permission")["CRM Inquiry"] == ["crm.fcrm.doctype.crm_inquiry.crm_inquiry.has_permission"]
print("Verified installed apps: frappe, crm; candidate permission hooks loaded")
frappe.set_user("Administrator")
frappe.flags.doco_marketing_skip_send = False
frappe.flags.in_test = True
frappe.local.test_objects = {}


def block_network(*args, **kwargs):
    raise AssertionError("External network access is prohibited in delivery tests")


try:
    suite = unittest.defaultTestLoader.loadTestsFromNames(sys.argv[1:])
    # MySQL/Redis use the configured local lab connections. Block requests and
    # SMTP transports rather than socket.connect, which would also block Redis.
    with patch("requests.sessions.Session.request", side_effect=block_network), \
            patch("smtplib.SMTP.sendmail", side_effect=block_network), \
            patch.object(frappe.db, "commit"):
        # Unit/integration suites use one connection: retain rollback isolation.
        # The separate concurrency proof owns its exact committed fixtures.
        result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
finally:
    frappe.db.rollback()
    frappe.destroy()
