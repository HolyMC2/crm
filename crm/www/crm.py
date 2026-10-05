# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and Contributors
# GNU GPLv3 License. See license.txt

from urllib.parse import quote

import frappe
from frappe import _, get_installed_apps
from frappe.integrations.frappe_providers.frappecloud_billing import is_fc_site
from frappe.translate import get_messages_for_boot, get_translated_doctypes
from frappe.utils import cint, get_system_timezone
from frappe.utils.telemetry import capture

no_cache = 1


def get_context():
	from crm.api import check_app_permission
	from crm.api.contactos import check_contactos_permission, is_contactos_path
	from crm.contactos_routes import is_contactos_recovery_path

	path = frappe.local.request.environ.get("RAW_URI") or frappe.local.request.full_path.rstrip("?")
	recovery = is_contactos_recovery_path(path)
	neutral = recovery or is_contactos_path(path)
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + quote(path, safe="")
		raise frappe.Redirect
	if not recovery and not (check_contactos_permission() if neutral else check_app_permission()):
		if neutral or check_contactos_permission():
			# An authenticated permission-recovery screen exposes no identity data;
			# a Contactos worker opening a sales route gets its request/return actions
			# instead of Frappe's dead-end «No permitido» page.
			frappe.local.flags.redirect_location = "/crm/not-permitted?intended=" + quote(path[4:], safe="")
			raise frappe.Redirect
		frappe.throw(
			_("You do not have permission to open this app. Ask your manager for access."),
			frappe.PermissionError,
		)
	context = frappe._dict()
	context.boot = get_boot(neutral=neutral)
	if frappe.session.user != "Guest" and not neutral:
		capture("active_site", "crm")
	return context


@frappe.whitelist(methods=["POST"], allow_guest=True)
def get_context_for_dev():
	if not frappe.conf.developer_mode:
		frappe.throw(_("This method is only meant for developer mode"))
	return get_boot()


@frappe.whitelist(methods=["POST"])
def get_shell_context_for_dev(path: str = "/crm"):
	"""Path-aware development boot for signed-in users (Contactos gets the neutral boot)."""
	if not frappe.conf.developer_mode:
		frappe.throw(_("This method is only meant for developer mode"))
	from crm.api import check_app_permission
	from crm.api.contactos import check_contactos_permission, is_contactos_path
	from crm.contactos_routes import is_contactos_recovery_path

	recovery = is_contactos_recovery_path(path)
	neutral = recovery or is_contactos_path(path)
	if not recovery and not (check_contactos_permission() if neutral else check_app_permission()):
		frappe.throw(_("You do not have permission to open this app."), frappe.PermissionError)
	return get_boot(neutral=neutral)


def get_boot(neutral=False):
	return frappe._dict(
		{
			"frappe_version": frappe.__version__,
			"installed_apps": list(frappe.get_installed_apps()),
			"default_route": "/crm/contactos" if neutral else get_default_route(),
			"muelle_module": "contactos" if neutral else "ventas",
			"site_name": frappe.local.site,
			"lang": frappe.local.lang,
			"socketio_port": frappe.conf.socketio_port,
			"read_only_mode": frappe.flags.read_only,
			"csrf_token": frappe.sessions.get_csrf_token(),
			"setup_complete": cint(frappe.get_system_settings("setup_complete")),
			"sysdefaults": frappe.defaults.get_defaults(),
			"is_demo_site": frappe.conf.get("is_demo_site"),
			"demo_data_created": False if neutral else frappe.db.get_default("crm_demo_data_created") == "1",
			"is_fc_site": is_fc_site(),
			"translated_doctypes": get_translated_doctypes(),
			"translated_messages": get_messages_for_boot(),
			"timezone": {
				"system": get_system_timezone(),
				"user": frappe.db.get_value("User", frappe.session.user, "time_zone")
				or get_system_timezone(),
			},
			"state_options": get_state_options(),
		}
	)


def get_state_options() -> dict[str, list[str]]:
	"""Country -> list of states, so the frontend can render a state dropdown.

	Sourced from India Compliance's own constant when that app is installed, so the
	options stay in sync with the desk. Returns an empty map (state field stays free
	text) on any failure.

	This runs inside ``get_boot``, so it must never raise — a failure here would break
	the whole CRM page load. ``get_installed_apps`` can return `[]` or raise in
	unauthenticated/boot contexts (notably on v15), so the lookup is wrapped defensively.
	"""
	try:
		if "india_compliance" not in get_installed_apps():
			return {}

		from india_compliance.gst_india.constants import INDIAN_STATES

		return {"India": list(INDIAN_STATES)}
	except Exception:
		# Degrade silently to free-text: this runs in boot, so the except branch
		# must not do anything that can itself raise (e.g. logging to a missing dir).
		return {}


def get_default_route():
	return "/crm"
