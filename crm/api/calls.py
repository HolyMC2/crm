"""The calls page: its tracking board, and who the shop's line rings."""

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from crm import call_team, calls_board


@frappe.whitelist()
def board(days: int | str = 30):
	days = cint(days)
	if days not in calls_board.PERIODS:
		days = 30
	if not frappe.has_permission(calls_board.DOCTYPE, "read"):
		frappe.throw(_("You cannot see the shop's calls."), frappe.PermissionError)
	return calls_board.board(days, now_datetime())


@frappe.whitelist()
def team():
	return call_team.team()


@frappe.whitelist(methods=["POST"])
def save_team_member(
	user: str, rings: int | str = 1, device: str | None = None, mobile_no: str | None = None
):
	return call_team.save(user, rings, device or None, mobile_no)
