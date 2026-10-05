from unittest import TestCase

from crm.contactos_legacy import translate_view


class TestContactosLegacy(TestCase):
	def test_keeps_source_and_exact_field_semantics(self):
		result = translate_view(
			"contact",
			{"dt": "Contact", "type": "list", "filters": '{"first_name": ["=", "Ana"]}'},
			{"first_name"},
		)
		self.assertEqual(
			result["filters"], {"source": "contact", "native_filters": [["first_name", "=", "Ana"]]}
		)

	def test_rejects_hidden_or_foreign_fields_instead_of_widening(self):
		for view in (
			{"dt": "Customer"},
			{"dt": "Contact", "filters": {"secret": "x"}},
			{"dt": "Contact", "type": "kanban"},
			{"dt": "Contact", "filters": "invalid"},
		):
			self.assertFalse(translate_view("contact", view, {"first_name"})["supported"])
