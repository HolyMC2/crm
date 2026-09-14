"""An empty tenant must not invoke demo users, conversion or remote currency APIs."""
from unittest import TestCase
from unittest.mock import MagicMock, patch

import frappe

from crm.demo.api import create_demo_data


class DemoProvisioningGuardTests(TestCase):
	def test_explicit_empty_tenant_exits_before_reading_or_creating_demo_state(self):
		for value in (0, False, "0", "false", ""):
			with self.subTest(value=value), patch.object(frappe, "db", new=MagicMock()) as db:
				create_demo_data({"setup_demo": value, "currency": "MXN"})
				db.get_default.assert_not_called()
				db.set_default.assert_not_called()

	def test_explicit_demo_and_legacy_calls_keep_the_existing_idempotence_path(self):
		for args in (None, {}, {"setup_demo": 1}, {"setup_demo": "1"}):
			with self.subTest(args=args), patch.object(frappe, "db", new=MagicMock()) as db:
				db.get_default.return_value = "1"
				create_demo_data(args)
				db.get_default.assert_called_once_with("crm_demo_data_created")
				db.set_default.assert_not_called()
