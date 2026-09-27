"""A base without the Muelle framework capabilities never takes the site down."""

from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from crm.permissions import framework


class TestFrameworkGate(IntegrationTestCase):
	def request(self, path="/api/method/ping", **form):
		return (
			patch.object(frappe.local, "request", SimpleNamespace(path=path), create=True),
			patch.dict(frappe.local.form_dict, form, clear=True),
		)

	def unsupported(self):
		return patch.object(framework, "missing", return_value=["VERSION_HISTORY_FILTER_VERSION"])

	def check(self, path="/api/method/ping", **form):
		request, form_dict = self.request(path, **form)
		with self.unsupported(), request, form_dict:
			framework.check_request()

	def test_non_crm_requests_keep_working(self):
		self.check()
		self.check("/app/sales-invoice")
		self.check("/api/method/frappe.desk.form.load.getdoc", doctype="Sales Invoice")
		self.check("/api/resource/Customer")

	def test_crm_surfaces_fail_closed(self):
		for path, form in (
			("/crm/deals", {}),
			("/api/method/crm.api.doc.get_data", {}),
			("/api/method/frappe.desk.form.load.getdoc", {"doctype": "CRM Deal"}),
			("/api/method/frappe.desk.form.load.getdocinfo", {"doctype": "CRM Lead"}),
			("/api/method/frappe.client.get_list", {"reference_doctype": "CRM Deal"}),
			("/api/resource/CRM%20Lead/any", {}),
			("/api/v2/document/CRM Pipeline/any", {}),
			("/", {"cmd": "crm.api.session.get_users"}),
		):
			with self.subTest(path=path, form=form), self.assertRaises(frappe.PermissionError):
				self.check(path, **form)

	def test_jobs_install_and_migrate_only_warn(self):
		with self.unsupported():
			framework.check_job(method="frappe.email.queue.flush")
			framework.before_install()
			framework.before_migrate()
			with self.assertRaises(frappe.PermissionError):
				framework.check_job(method="crm.api.whatsapp.notify_agent")

	def test_missing_reports_each_absent_marker(self):
		from frappe.core.doctype.version import version

		with patch.object(version, "VERSION_HISTORY_FILTER_VERSION", 0, create=True):
			self.assertIn("VERSION_HISTORY_FILTER_VERSION", framework.missing())

	def test_supported_base_passes_everything(self):
		with patch.object(framework, "missing", return_value=[]):
			request, form_dict = self.request("/crm/deals")
			with request, form_dict:
				framework.check_request()
			framework.check_job(method="crm.api.whatsapp.notify_agent")
