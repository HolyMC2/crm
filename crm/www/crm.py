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
	path = frappe.local.request.environ.get("RAW_URI") or frappe.local.request.full_path.rstrip("?")
	neutral, module = _gate(path)
	context = frappe._dict()
	context.boot = get_boot(neutral=neutral, module=module)
	if frappe.session.user != "Guest" and not neutral:
		capture("active_site", "crm")
	return context


def _gate(path):
	"""Which boot this path gets, or a redirect to where this worker can continue."""
	from crm.agenda_routes import is_agenda_path
	from crm.api import check_app_permission
	from crm.api.agenda import check_agenda_permission
	from crm.api.archivos import check_archivos_permission
	from crm.api.avisos import check_avisos_permission
	from crm.api.cobranza import check_cobranza_permission
	from crm.api.compras import check_compras_permission
	from crm.api.contactos import check_contactos_permission, is_contactos_path
	from crm.api.garantias import check_garantias_permission
	from crm.api.gastos import check_gastos_permission
	from crm.api.hoy import check_hoy_permission, root_landing
	from crm.api.pendientes import check_pendientes_permission
	from crm.api.shell import first_module
	from crm.archivos_routes import is_archivos_path
	from crm.avisos_routes import is_avisos_path
	from crm.cobranza_routes import is_cobranza_path
	from crm.compras_routes import is_compras_path
	from crm.contactos_routes import is_contactos_recovery_path
	from crm.garantias_routes import is_garantias_path
	from crm.gastos_routes import is_gastos_path
	from crm.hoy_routes import is_hoy_path
	from crm.pendientes_routes import is_pendientes_path, is_shell_root

	recovery = is_contactos_recovery_path(path)
	hoy = is_hoy_path(path)
	pendientes = is_pendientes_path(path)
	agenda = is_agenda_path(path)
	cobranza = is_cobranza_path(path)
	compras = is_compras_path(path)
	gastos = is_gastos_path(path)
	garantias = is_garantias_path(path)
	avisos = is_avisos_path(path)
	archivos = is_archivos_path(path)
	neutral = (
		recovery
		or hoy
		or pendientes
		or agenda
		or cobranza
		or compras
		or gastos
		or garantias
		or avisos
		or archivos
		or is_contactos_path(path)
	)
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + quote(path, safe="")
		raise frappe.Redirect
	if is_shell_root(path):
		# The installed app (and a bare /crm) opens the worker's own choice, the
		# app their puesto works in, or Hoy; the Ventas root stays for a Ventas choice.
		landing = root_landing()
		if landing:
			frappe.local.flags.redirect_location = landing
			raise frappe.Redirect
	if hoy:
		allowed = check_hoy_permission()
	elif pendientes:
		allowed = check_pendientes_permission()
	elif agenda:
		# Work accounts without Event access still get the shell's guard page (reason,
		# Pedir acceso, Reintentar); the boot itself carries no agenda data.
		allowed = (
			check_agenda_permission()
			or frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
		)
	elif cobranza:
		# A work account without Cobranza still gets its guard page (reason, Pedir
		# acceso, Reintentar) from the shell; the boot carries no receivables data.
		allowed = (
			check_cobranza_permission()
			or frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
		)
	elif compras:
		# A work account without Compras still gets its guard page (reason, Pedir
		# acceso, Reintentar) from the shell; the boot carries no purchase data.
		allowed = (
			check_compras_permission()
			or frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
		)
	elif gastos:
		# A work account without Gastos still gets its guard page (reason, Pedir
		# acceso, Reintentar) from the shell; the boot carries no bill data.
		allowed = (
			check_gastos_permission()
			or frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
		)
	elif garantias:
		# A work account without Garantías still gets its guard page (reason, Pedir
		# acceso, Reintentar) from the shell; the boot carries no claim data.
		allowed = (
			check_garantias_permission()
			or frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
		)
	elif avisos:
		allowed = check_avisos_permission()
	elif archivos:
		# A work account without Archivos still gets its guard page (reason, Pedir acceso,
		# Reintentar) from the shell; the boot carries no evidence.
		allowed = (
			check_archivos_permission()
			or frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
		)
	else:
		allowed = check_contactos_permission() if neutral else check_app_permission()
	if not recovery and not allowed:
		landing = first_module()
		if landing and is_shell_root(path):
			# The installed app (and a bare /crm) opens the first module this worker
			# has; sales access stays a separate grant.
			frappe.local.flags.redirect_location = f"/crm/{landing}"
			raise frappe.Redirect
		if neutral or landing:
			# An authenticated permission-recovery screen exposes no module data; a
			# worker refused one module gets its request/return actions instead of
			# Frappe's dead-end «No permitido» page.
			frappe.local.flags.redirect_location = "/crm/not-permitted?intended=" + quote(path[4:], safe="")
			raise frappe.Redirect
		frappe.throw(
			_("You do not have permission to open this app. Ask your manager for access."),
			frappe.PermissionError,
		)
	for key, matched in (
		("hoy", hoy),
		("pendientes", pendientes),
		("agenda", agenda),
		("cobranza", cobranza),
		("compras", compras),
		("gastos", gastos),
		("garantias", garantias),
		("avisos", avisos),
		("archivos", archivos),
	):
		if matched:
			return neutral, key
	return neutral, "contactos"


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
	from crm.agenda_routes import is_agenda_path
	from crm.api import check_app_permission
	from crm.api.contactos import check_contactos_permission, is_contactos_path
	from crm.archivos_routes import is_archivos_path
	from crm.avisos_routes import is_avisos_path
	from crm.cobranza_routes import is_cobranza_path
	from crm.compras_routes import is_compras_path
	from crm.contactos_routes import is_contactos_recovery_path
	from crm.garantias_routes import is_garantias_path
	from crm.gastos_routes import is_gastos_path
	from crm.hoy_routes import is_hoy_path
	from crm.pendientes_routes import is_pendientes_path

	if is_hoy_path(path):
		from crm.api.hoy import check_hoy_permission

		if not check_hoy_permission():
			frappe.throw(_("You do not have permission to open this app."), frappe.PermissionError)
		return get_boot(neutral=True, module="hoy")
	if is_pendientes_path(path):
		from crm.api.pendientes import check_pendientes_permission

		if not check_pendientes_permission():
			frappe.throw(_("You do not have permission to open this app."), frappe.PermissionError)
		return get_boot(neutral=True, module="pendientes")
	if is_agenda_path(path):
		return get_boot(neutral=True, module="agenda")
	if is_cobranza_path(path):
		return get_boot(neutral=True, module="cobranza")
	if is_compras_path(path):
		return get_boot(neutral=True, module="compras")
	if is_gastos_path(path):
		return get_boot(neutral=True, module="gastos")
	if is_garantias_path(path):
		return get_boot(neutral=True, module="garantias")
	if is_archivos_path(path):
		return get_boot(neutral=True, module="archivos")
	if is_avisos_path(path):
		from crm.api.avisos import check_avisos_permission

		if not check_avisos_permission():
			frappe.throw(_("You do not have permission to open this app."), frappe.PermissionError)
		return get_boot(neutral=True, module="avisos")
	recovery = is_contactos_recovery_path(path)
	neutral = recovery or is_contactos_path(path)
	if not recovery and not (check_contactos_permission() if neutral else check_app_permission()):
		frappe.throw(_("You do not have permission to open this app."), frappe.PermissionError)
	return get_boot(neutral=neutral)


def get_boot(neutral=False, module="contactos"):
	return frappe._dict(
		{
			"frappe_version": frappe.__version__,
			"installed_apps": list(frappe.get_installed_apps()),
			"default_route": f"/crm/{module}" if neutral else get_default_route(),
			"muelle_module": module if neutral else "ventas",
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
