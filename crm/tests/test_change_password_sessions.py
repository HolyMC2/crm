"""Mi perfil's «Cambiar contraseña» may also sign out the other devices (crm/api/user.py).

Runs without a bench: crm/api/user.py is loaded over a stub Frappe that records what
update_password is asked to do."""

import importlib.util
import sys
import types
from pathlib import Path
from unittest import TestCase
from unittest.mock import MagicMock, patch

USER_API = Path(__file__).resolve().parents[1] / "api" / "user.py"


def _stub():
	stub = types.ModuleType("frappe")
	stub.session = types.SimpleNamespace(user="owner@example.test")
	stub.AuthenticationError = type("AuthenticationError", (Exception,), {})

	def throw(message, *args, **kwargs):
		raise RuntimeError(message)

	stub.throw = throw
	stub._ = lambda text: text
	stub.whitelist = lambda *args, **kwargs: (lambda fn: fn)
	stub.only_for = lambda *args, **kwargs: None

	tracker = MagicMock()
	tracker.is_user_allowed.return_value = True
	auth = types.ModuleType("frappe.auth")
	auth.LoginAttemptTracker = MagicMock(return_value=tracker)
	rate_limiter = types.ModuleType("frappe.rate_limiter")
	rate_limiter.rate_limit = lambda *args, **kwargs: (lambda fn: fn)
	utils = types.ModuleType("frappe.utils")
	utils.cint = lambda value: int(value or 0)
	password = types.ModuleType("frappe.utils.password")
	password.check_password = MagicMock(return_value="owner@example.test")
	password.update_password = MagicMock()
	user_doctype = types.ModuleType("frappe.core.doctype.user.user")
	user_doctype.test_password_strength = lambda new_password: {
		"feedback": {"password_policy_validation_passed": True}
	}
	modules = {
		"frappe": stub,
		"frappe.auth": auth,
		"frappe.rate_limiter": rate_limiter,
		"frappe.utils": utils,
		"frappe.utils.password": password,
		"frappe.core": types.ModuleType("frappe.core"),
		"frappe.core.doctype": types.ModuleType("frappe.core.doctype"),
		"frappe.core.doctype.user": types.ModuleType("frappe.core.doctype.user"),
		"frappe.core.doctype.user.user": user_doctype,
	}
	return modules, password.update_password


def _change(**kwargs):
	modules, update = _stub()
	with patch.dict(sys.modules, modules):
		spec = importlib.util.spec_from_file_location("crm_api_user_under_test", USER_API)
		module = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(module)
		module.change_password(old_password="Old1!aaa", new_password="New2@bbbb", **kwargs)
	return update


class TestChangePasswordSessions(TestCase):
	def test_other_sessions_stay_unless_asked(self):
		update = _change()
		update.assert_called_once_with(user="owner@example.test", pwd="New2@bbbb", logout_all_sessions=False)

	def test_asked_to_it_signs_out_the_other_devices(self):
		update = _change(logout_others=1)
		update.assert_called_once_with(user="owner@example.test", pwd="New2@bbbb", logout_all_sessions=True)
