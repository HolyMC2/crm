"""The owner's account pages in the shell: Mi cuenta (`/crm/cuenta`) and Mi perfil (`/crm/perfil`).

Mi cuenta is a second screen over doco's Mi plan relays (doco.docoutils.miplan): every
read and payment goes through them and their role gate. This module only says who may
open the page and gives the shell boot the plan summary doco keeps on this site, so a
boot never calls the platform. Without doco the site has no account to open.
"""

import frappe


def cuenta_available() -> bool:
	"""Whether this site has an account to open (doco owns the plan and its relays)."""
	if "doco" not in frappe.get_installed_apps():
		return False
	try:
		from doco.docoutils import plan_state
	except ImportError:
		return False
	return True


def check_cuenta_permission(user: str | None = None) -> bool:
	"""Mi cuenta: the owner (System Manager) or whoever holds doco's «Mi Plan» role, with or
	without Ventas."""
	user = user or frappe.session.user
	if not user or user == "Guest" or not cuenta_available():
		return False
	from doco.docoutils.plan_state import can_open_plan

	return bool(can_open_plan(user))


def check_perfil_permission(user: str | None = None) -> bool:
	"""Mi perfil: every person the shell admits edits their own name, photo, password,
	language and time zone. The shell boots for staff accounts (System User: Hoy opens for
	every one of them); a storefront customer (Website User) gets the recovery screen
	instead of a shell that cannot boot."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	return frappe.get_cached_value("User", user, "user_type") == "System User"


def account() -> dict:
	"""The shell boot's `account`: {cuenta: may open Mi cuenta, available: this site has a
	plan to show, plan: the summary or None}. Never raises and never calls the platform;
	the summary reaches only Mi cuenta's users."""
	closed = {"cuenta": False, "available": False, "plan": None}
	if frappe.session.user == "Guest" or not cuenta_available():
		return closed
	try:
		from doco.docoutils.plan_state import shell_account

		answer = shell_account(frappe.session.user) or {}
	except Exception:
		frappe.logger("crm.cuenta").exception("account boot failed")
		return closed
	# A doco without the platform check answers no `available`: the site has one.
	available = answer.get("available", True) is not False
	allowed = available and bool(answer.get("cuenta"))
	plan = answer.get("plan") if allowed and isinstance(answer.get("plan"), dict) else None
	return {"cuenta": allowed, "available": available, "plan": plan}
