"""Plain routing regressions; database/controller behavior is tested in test_utils."""

import ast
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import Mock


class TestIncomingEmailCaptureGuard(TestCase):
	def setUp(self):
		path = Path(__file__).resolve().parents[1] / "utils" / "__init__.py"
		tree = ast.parse(path.read_text())
		function = next(
			node
			for node in tree.body
			if isinstance(node, ast.FunctionDef) and node.name == "create_lead_from_incoming_email"
		)
		self.frappe = Mock()
		self.frappe.db.get_value.return_value = 1
		self.frappe.db.exists.side_effect = lambda doctype, *_: doctype == "CRM Lead Source"
		self.lead = SimpleNamespace(name="CRM-LEAD-CAPTURE", insert=Mock())
		self.frappe.new_doc.return_value = self.lead
		namespace = {"frappe": self.frappe, "Communication": SimpleNamespace}
		exec(compile(ast.Module(body=[function], type_ignores=[]), str(path), "exec"), namespace)
		self.capture = namespace[function.name]
		self.doc = SimpleNamespace(
			doctype="Communication",
			sent_or_received="Received",
			communication_type="Communication",
			communication_medium="Email",
			reference_doctype=None,
			reference_name=None,
			email_account="Owned test inbox",
			sender="prospect@example.invalid",
			sender_full_name="Ada Prospect",
			save=Mock(),
		)

	def assert_not_captured(self):
		self.capture(self.doc)
		self.frappe.db.get_value.assert_not_called()
		self.frappe.new_doc.assert_not_called()
		self.doc.save.assert_not_called()

	def test_outgoing_email_never_creates_a_lead(self):
		self.doc.sent_or_received = "Sent"
		self.assert_not_captured()

	def test_received_notification_never_creates_a_lead(self):
		self.doc.communication_type = "Notification"
		self.assert_not_captured()

	def test_other_media_do_not_enter_email_capture(self):
		for medium in ("Phone", "SMS", "Chat", "", None):
			with self.subTest(medium=medium):
				self.doc.communication_medium = medium
				self.assert_not_captured()

	def test_missing_direction_or_type_is_not_assumed_incoming(self):
		for field in ("sent_or_received", "communication_type"):
			with self.subTest(field=field):
				original = getattr(self.doc, field)
				setattr(self.doc, field, None)
				self.assert_not_captured()
				setattr(self.doc, field, original)

	def test_received_email_retains_existing_creation_and_reference(self):
		self.capture(self.doc)
		self.frappe.new_doc.assert_called_once_with("CRM Lead")
		self.assertEqual(self.lead.email, "prospect@example.invalid")
		self.assertEqual((self.lead.first_name, self.lead.last_name), ("Ada", "Prospect"))
		self.assertEqual(self.lead.source, "Email")
		self.lead.insert.assert_called_once_with(ignore_permissions=True)
		self.assertEqual((self.doc.reference_doctype, self.doc.reference_name), ("CRM Lead", self.lead.name))
		self.doc.save.assert_called_once_with(ignore_permissions=True)

	def test_disabled_capture_setting_still_prevents_creation(self):
		self.frappe.db.get_value.return_value = 0
		self.capture(self.doc)
		self.frappe.new_doc.assert_not_called()
		self.doc.save.assert_not_called()


if __name__ == "__main__":
	main()
