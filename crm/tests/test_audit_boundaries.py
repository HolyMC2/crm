"""Focused regression checks that do not provision unrelated ERP test fixtures."""

from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

import frappe

from crm.api.activities import get_readable_fields
from crm.fcrm.doctype.crm_call_log.crm_call_log import get_call_log
from crm.fcrm.doctype.crm_deal.api import get_deal_contacts
from crm.www.crm_form import _link_field_options


class TestAuditBoundaries(TestCase):
	def test_record_endpoints_reject_before_loading_data(self):
		for endpoint in (get_deal_contacts, get_call_log):
			with (
				self.subTest(endpoint=endpoint.__name__),
				patch.object(frappe, "has_permission", return_value=False),
				patch.object(frappe, "throw", side_effect=frappe.PermissionError),
				patch.object(frappe, "get_all") as query,
				patch.object(frappe, "get_cached_doc") as cached,
			):
				with self.assertRaises(frappe.PermissionError):
					endpoint("restricted-record")
				query.assert_not_called()
				cached.assert_not_called()

	def test_timeline_field_catalog_respects_readable_permlevels(self):
		fields = [
			SimpleNamespace(fieldname="public", label="Public", options="", permlevel=0),
			SimpleNamespace(fieldname="private", label="Private", options="", permlevel=1),
		]
		for allowed, expected in (([], {"public"}), ([1], {"public", "private"})):
			with (
				self.subTest(allowed=allowed),
				patch("crm.api.activities.get_permlevel_access", return_value=allowed),
				patch.object(frappe, "get_meta", return_value=SimpleNamespace(fields=fields)),
			):
				self.assertEqual(set(get_readable_fields("CRM Lead")), expected)

	def test_link_preview_restores_author_session_even_when_query_fails(self):
		for query_error in (False, True):
			session_data = {"marker": "preserve"}
			session = SimpleNamespace(user="author", sid="original-session", data=session_data)

			def switch_user(user):
				session.user, session.sid, session.data = user, user, {}

			with (
				self.subTest(query_error=query_error),
				patch.object(frappe, "session", session),
				patch.object(frappe, "db", SimpleNamespace(exists=lambda *args: True)),
				patch("crm.www.crm_form.guest_can_select", return_value=True),
				patch.object(frappe, "get_meta", return_value=SimpleNamespace(title_field="name")),
				patch.object(frappe, "set_user", side_effect=switch_user),
				patch.object(frappe, "get_list", return_value=[{"name": "Option"}]) as query,
			):
				if query_error:
					query.side_effect = RuntimeError("query failed")
					with self.assertRaises(RuntimeError):
						_link_field_options("CRM Industry")
				else:
					self.assertEqual(_link_field_options("CRM Industry"), [{"value": "Option", "label": "Option"}])
				self.assertEqual((session.user, session.sid), ("author", "original-session"))
				self.assertIs(session.data, session_data)
