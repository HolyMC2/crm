# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Hoy «Tratos sin seguimiento»: my open deals with no next step, in the one Hoy read."""

from unittest.mock import patch

import frappe

from crm.api import hoy
from crm.tests.test_deals_list_unification import DealsListTestCase, terminal_status


class TestHoyFollowUp(DealsListTestCase):
	def seller(self) -> str:
		user = self.make_user("Sales User")
		frappe.set_user(user)
		return user

	def own(self, user, **values) -> str:
		frappe.set_user("Administrator")
		name = self.make_deal(**values)
		frappe.db.set_value("CRM Deal", name, "deal_owner", user, update_modified=False)
		return name

	def test_lists_my_open_deals_without_a_next_step_only(self):
		user = self.make_user("Sales User")
		missing = self.own(user)
		self.own(user, next_activity_task="CRM-TASK-not-checked", next_activity_at="2099-01-01 10:00:00")
		self.own(user, status=terminal_status("Won"))
		someone_else = self.make_deal()  # Administrator's, without a next step
		frappe.set_user(user)

		section = hoy._follow_up()

		self.assertTrue(section["available"])
		self.assertEqual(section["count"], {"value": 1, "capped": False})
		self.assertEqual([row["name"] for row in section["rows"]], [missing])
		self.assertNotIn(someone_else, [row["name"] for row in section["rows"]])
		self.assertTrue(section["rows"][0]["title"])

	def test_count_is_capped_and_rows_are_limited(self):
		user = self.make_user("Sales User")
		for _ in range(hoy.FOLLOW_UP_LIMIT + 2):
			self.own(user)
		frappe.set_user(user)
		with patch.object(hoy, "FOLLOW_UP_CAP", hoy.FOLLOW_UP_LIMIT + 1):
			section = hoy._follow_up()
		self.assertEqual(section["count"], {"value": hoy.FOLLOW_UP_LIMIT + 1, "capped": True})
		self.assertEqual(len(section["rows"]), hoy.FOLLOW_UP_LIMIT)

	def test_no_section_for_someone_who_owns_no_open_deal(self):
		self.seller()
		self.assertEqual(hoy._follow_up(), {"available": False, "reason": None})

	def test_page_carries_the_section_and_a_failure_never_sinks_hoy(self):
		user = self.make_user("Sales User")
		self.own(user)
		frappe.set_user(user)
		with patch.object(hoy, "check_hoy_permission", return_value=True):
			self.assertTrue(hoy.page()["seguimiento"]["available"])
			with patch.object(hoy, "_follow_up", side_effect=RuntimeError("boom")):
				page = hoy.page()
		self.assertEqual(page["seguimiento"], {"available": False, "failed": True})
		self.assertIn("avisos", page)


class TestHoyTeamOverdue(DealsListTestCase):
	def overdue(self, owner):
		from frappe.utils import add_days, nowdate

		frappe.set_user("Administrator")
		name = self.make_deal(
			next_activity_task="CRM-TASK-not-checked", next_activity_at=f"{add_days(nowdate(), -2)} 10:00:00"
		)
		frappe.db.set_value("CRM Deal", name, "deal_owner", owner, update_modified=False)
		return name

	def test_managers_see_overdue_steps_per_owner(self):
		seller = self.make_user("Sales User")
		self.overdue(seller)
		self.overdue(seller)
		self.overdue(None)
		self.make_deal(next_activity_task="CRM-TASK-x", next_activity_at="2099-01-01 10:00:00")
		frappe.set_user(self.make_user("Sales Manager"))
		section = hoy._team_overdue()
		self.assertTrue(section["available"])
		mine = {row["owner"]: row["count"] for row in section["rows"]}
		self.assertEqual(mine.get(seller), 2)
		self.assertGreaterEqual(mine.get(""), 1)

	def test_sellers_do_not_get_the_team_section(self):
		frappe.set_user(self.make_user("Sales User"))
		self.assertEqual(hoy._team_overdue(), {"available": False, "reason": None})
