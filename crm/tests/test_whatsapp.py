# Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import unittest
from unittest.mock import MagicMock, patch

import frappe

from crm.api.whatsapp import notify_agent, validate


# Plain unittest.TestCase: FrappeTestCase's test-record loader pulls ERPNext
# fixtures that don't build on the doco sites (see test_whatsapp_routing).
class TestWhatsAppHooks(unittest.TestCase):
	def tearDown(self):
		frappe.db.rollback()

	# --- validate() ---

	@staticmethod
	def _doc(phone="+15551234567", ref_dt=None, ref_dn=None):
		"""MagicMock whose .get() answers per-key — validate() now reads
		reference_doctype/reference_name via .get() before the phone."""
		doc = MagicMock()
		doc.type = "Incoming"
		values = {"from": phone, "to": phone, "reference_doctype": ref_dt, "reference_name": ref_dn}
		doc.get.side_effect = lambda k, *a: values.get(k)
		doc.reference_doctype = ref_dt
		doc.reference_name = ref_dn
		return doc

	def test_validate_sets_reference_when_contact_found(self):
		"""validate() links the doc when the routing ladder resolves a match"""
		doc = self._doc()
		with patch(
			"crm.api.whatsapp_routing.resolve_reference_for_number",
			return_value=("LEAD-0001", "CRM Lead"),
		):
			validate(doc, None)

		self.assertEqual(doc.reference_doctype, "CRM Lead")
		self.assertEqual(doc.reference_name, "LEAD-0001")

	def test_validate_skips_reference_when_no_contact_found(self):
		"""validate() leaves reference fields untouched when number is unknown"""
		doc = self._doc(phone="+15559999999")
		with patch(
			"crm.api.whatsapp_routing.resolve_reference_for_number",
			return_value=(None, None),
		):
			validate(doc, None)

		self.assertIsNone(doc.reference_doctype)
		self.assertIsNone(doc.reference_name)

	def test_validate_respects_preset_reference(self):
		"""An explicitly-threaded message (inbox composer, taller review queue)
		must NOT be re-routed by the resolver."""
		doc = self._doc(ref_dt="CRM Deal", ref_dn="CRM-DEAL-PRESET")
		with patch(
			"crm.api.whatsapp_routing.resolve_reference_for_number",
			return_value=("CRM-DEAL-OTHER", "CRM Deal"),
		) as mock_resolve:
			validate(doc, None)

		mock_resolve.assert_not_called()
		self.assertEqual(doc.reference_name, "CRM-DEAL-PRESET")

	def test_validate_logs_error_on_exception(self):
		"""validate() catches lookup exceptions and logs them instead of raising"""
		doc = self._doc(phone="invalid-number")
		with (
			patch(
				"crm.api.whatsapp_routing.resolve_reference_for_number",
				side_effect=Exception("parse error"),
			),
			patch("frappe.log_error") as mock_log,
		):
			validate(doc, None)  # must not raise

		mock_log.assert_called_once()

	# --- notify_agent() ---

	def test_notify_agent_returns_early_when_no_reference(self):
		"""notify_agent() skips notification when reference_doctype and reference_name are absent"""
		doc = MagicMock()
		doc.type = "Incoming"
		doc.reference_doctype = None
		doc.reference_name = None

		with patch("crm.api.whatsapp.get_assigned_users") as mock_users:
			notify_agent(doc)  # must not raise

		mock_users.assert_not_called()

	def test_notify_agent_returns_early_when_reference_doctype_missing(self):
		"""notify_agent() skips notification when only reference_doctype is absent"""
		doc = MagicMock()
		doc.type = "Incoming"
		doc.reference_doctype = ""
		doc.reference_name = "LEAD-0001"

		with patch("crm.api.whatsapp.get_assigned_users") as mock_users:
			notify_agent(doc)

		mock_users.assert_not_called()
