"""Transcript hints must only reach the authorized linked record's document room."""

import unittest
from unittest.mock import patch

import frappe

from crm.api.outbox_bridge import _publish


class TestOutboxRealtimeScope(unittest.TestCase):
	def test_linked_transcript_uses_document_room(self):
		row = frappe._dict(reference_doctype="CRM Lead", reference_name="fictional-lead", to="520000000000")
		with patch.object(frappe, "publish_realtime") as publish:
			_publish(row)
		publish.assert_called_once()
		self.assertEqual(publish.call_args.kwargs["doctype"], "CRM Lead")
		self.assertEqual(publish.call_args.kwargs["docname"], "fictional-lead")
		self.assertTrue(publish.call_args.kwargs["after_commit"])

	def test_unlinked_or_clinical_transcript_never_broadcasts_site_wide(self):
		with patch.object(frappe, "publish_realtime") as publish:
			for doctype, name in ((None, None), ("CRM Lead", None), ("Patient", "fictional-patient")):
				_publish(frappe._dict(reference_doctype=doctype, reference_name=name, to="520000000000"))
		publish.assert_not_called()
