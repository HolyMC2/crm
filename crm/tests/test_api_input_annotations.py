"""RPC annotations preserve raw values for the existing security validators."""

import unittest
from importlib import import_module
from inspect import unwrap
from typing import get_type_hints
from unittest.mock import patch

import frappe
from frappe.utils.typing_validations import transform_parameter_types


def adapt(module, method, **values):
	function = unwrap(getattr(import_module(module), method))
	# Python/Frappe releases differ in lazy annotation evaluation; exercise actual hints.
	with patch.object(function, "__annotations__", get_type_hints(function)):
		return transform_parameter_types(function, (), values)[1]


class TestAPIInputAnnotations(unittest.TestCase):
	def test_generation_booleans_and_floats_are_not_coerced_to_valid_integers(self):
		from crm.api import conversations

		for module, method in (
			("crm.api.conversations", "apply_control"),
			("crm.api.outbox", "queue_message"),
		):
			for value in (True, False, 1.0, 1.5):
				with self.subTest(method=method, value=value):
					result = adapt(module, method, expected_generation=value)["expected_generation"]
					self.assertIs(type(result), type(value))
					with (
						patch.object(frappe, "throw", side_effect=frappe.ValidationError),
						self.assertRaises(frappe.ValidationError),
					):
						conversations._generation(result)

	def test_webchat_enabled_float_stays_invalid_for_strict_endpoint_check(self):
		result = adapt("crm.api.webchat", "configure_channel", enabled=1.0)["enabled"]
		self.assertIs(type(result), float)

	def test_webchat_guest_json_reaches_its_controlled_validation_envelope_unchanged(self):
		parameters = {
			"get_channel": ("profile", "public_origin"),
			"bootstrap": ("channel_id",),
			"history": ("channel_id", "cursor"),
			"send": ("channel_id", "request_id", "text"),
			"revoke": ("channel_id",),
		}
		for method, names in parameters.items():
			for name in names:
				for value in (None, True, 1, 1.0, "fictional", [], {}):
					with self.subTest(method=method, argument=name, value=value):
						result = adapt("crm.api.webchat", method, **{name: value})[name]
						self.assertIs(type(result), type(value))
						self.assertEqual(result, value)
