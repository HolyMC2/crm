"""Transcript hints reach only recipients who can currently read the message."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from crm.api.outbox_bridge import _publish


class TestOutboxRealtimeScope(unittest.TestCase):
	def test_linked_transcript_defers_a_recipient_scoped_publish(self):
		row = frappe._dict(
			name="fictional-message", reference_doctype="CRM Lead", reference_name="fictional-lead", to="5200"
		)
		callbacks = []
		with (
			patch.object(frappe.db, "after_commit", SimpleNamespace(add=callbacks.append)),
			patch.object(frappe, "publish_realtime") as broadcast,
			patch("crm.permissions.whatsapp_read.publish_message") as scoped,
		):
			_publish(row)
			broadcast.assert_not_called()
			self.assertEqual(len(callbacks), 1)
			callbacks[0]()
		scoped.assert_called_once_with("fictional-message")

	def test_unlinked_or_clinical_transcript_never_broadcasts_site_wide(self):
		deferred = []
		with (
			patch.object(frappe.db, "after_commit", SimpleNamespace(add=deferred.append)),
			patch.object(frappe, "publish_realtime") as publish,
		):
			for doctype, name in ((None, None), ("CRM Lead", None), ("Patient", "fictional-patient")):
				_publish(frappe._dict(reference_doctype=doctype, reference_name=name, to="520000000000"))
		publish.assert_not_called()
		self.assertEqual(deferred, [])
