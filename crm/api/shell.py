"""One boot call for the Muelle shell (spec-muelle-shell §7).

Module providers report native capabilities; they never grant anything. Each
module route and API still checks its own permissions on every request.
"""

import json

import frappe
from frappe import _

MOBILE_SLOTS_DEFAULT = "muelle_mobile_slots"
MODULE_KEYS = ("hoy", "pendientes", "agenda", "contactos", "ventas", "compras", "archivos", "avisos")
# Doco puesto → phone bottom-nav class (contracts registry NavRole).
NAV_ROLES = {"Cajero": "vendedor", "Técnico": "recepcion", "Encargado": "dueno", "Dueño": "dueno"}


def _ventas():
	from crm.api import check_app_permission

	enabled = bool(check_app_permission())
	return {
		"key": "ventas",
		"enabled": enabled,
		"reason": None if enabled else _("Ventas is not available for your role."),
		"capabilities": {"read": enabled},
	}


def _contactos():
	try:
		# A doco older than Contactos (crm updated first) leaves the module off, not the shell down.
		from doco.contactos.api import bootstrap
	except ImportError:
		bootstrap = None
	if "doco" not in frappe.get_installed_apps() or bootstrap is None:
		return {
			"key": "contactos",
			"enabled": False,
			"reason": _("Contactos is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	capabilities = bootstrap().get("capabilities", {}) or {}
	enabled = bool(capabilities.get("directory"))
	return {
		"key": "contactos",
		"enabled": enabled,
		"reason": None
		if enabled
		else _("You do not have permission to see Contactos. Ask your manager for access and try again."),
		"capabilities": {"read": enabled, "create": bool(capabilities.get("create"))},
	}


def _compras():
	try:
		# Doco owns purchasing; an older doco leaves the module off, not the shell down.
		from doco.workspaces.purchasing import bootstrap
	except ImportError:
		bootstrap = None
	if "doco" not in frappe.get_installed_apps() or bootstrap is None:
		return {
			"key": "compras",
			"enabled": False,
			"reason": _("Compras is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	answer = bootstrap() or {}
	capabilities = answer.get("capabilities") or {}
	enabled = bool(capabilities.get("orders"))
	return {
		"key": "compras",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason")
		or _("Ask your manager for permission to read purchase orders, then retry."),
		"capabilities": {"read": enabled, "create": enabled and bool(capabilities.get("create"))},
	}


def _avisos():
	# Staff accounts only, independent of Contactos and Ventas; every endpoint re-checks.
	from crm.api.avisos import get_capabilities

	answer = get_capabilities()
	enabled = bool(answer.get("enabled"))
	return {
		"key": "avisos",
		"enabled": enabled,
		"reason": answer.get("reason"),
		"capabilities": {"read": enabled},
		"badge": answer.get("badge"),
	}


def _archivos():
	try:
		# Doco owns the evidence queue; an older doco leaves the module off, not the shell down.
		from doco.docoutils.documents.bandeja import boot as bandeja_boot
	except ImportError:
		bandeja_boot = None
	if "doco" not in frappe.get_installed_apps() or bandeja_boot is None:
		return {
			"key": "archivos",
			"enabled": False,
			"reason": _("Archivos is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	answer = bandeja_boot() or {}
	enabled = bool(answer.get("enabled"))
	return {
		"key": "archivos",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason")
		or _("Ask your manager for access to your company's documents, then retry."),
		"capabilities": {"read": enabled, "create": enabled},
	}


def _providers():
	"""Built-in providers plus `muelle_shell_modules` hooks from other apps."""
	providers = [_contactos, _ventas, _compras, _avisos, _archivos]
	for path in frappe.get_hooks("muelle_shell_modules") or []:
		providers.append(frappe.get_attr(path))
	return providers


def _puesto():
	if "doco" not in frappe.get_installed_apps():
		return None
	try:
		from doco.erp_experience.puesto import puesto_of
	except ImportError:
		return None
	return puesto_of(frappe.session.user) or None


def _palette():
	if "doco" not in frappe.get_installed_apps():
		return None
	try:
		from doco.erp_experience.appearance import site_appearance
	except ImportError:
		return None
	appearance = site_appearance()
	return {
		key: appearance.get(key)
		for key in (
			"accent",
			"accent_light",
			"accent_light_ink",
			"accent_dark",
			"accent_dark_ink",
			"tone",
			"density",
			"adjusted",
		)
	}


def _saved_slots():
	raw = frappe.defaults.get_user_default(MOBILE_SLOTS_DEFAULT)
	try:
		slots = json.loads(raw) if raw else None
	except ValueError:
		return None
	return [key for key in slots if key in MODULE_KEYS] if isinstance(slots, list) else None


@frappe.whitelist()
def boot():
	"""ShellBoot for the signed-in user: identity, locale, palette and module capabilities."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	modules = {}
	for provider in _providers():
		try:
			dto = provider()
		except frappe.PermissionError:
			continue
		if dto and dto.get("key"):
			modules[dto["key"]] = dto
	if not any(dto.get("enabled") for dto in modules.values()):
		frappe.throw(
			_("You do not have permission to open this app. Ask your manager for access."),
			frappe.PermissionError,
		)
	user = frappe.db.get_value("User", frappe.session.user, ["full_name", "user_image"], as_dict=True) or {}
	puesto = _puesto()
	return {
		"user": {
			"name": frappe.session.user,
			"full_name": user.get("full_name"),
			"image": user.get("user_image"),
			"puesto": puesto,
			"nav_role": NAV_ROLES.get(puesto) if puesto else None,
			"is_admin": "System Manager" in frappe.get_roles(),
		},
		"company": frappe.defaults.get_user_default("company"),
		"locale": frappe.local.lang,
		"time_zone": frappe.db.get_value("User", frappe.session.user, "time_zone")
		or frappe.utils.get_system_timezone(),
		"currency": frappe.defaults.get_global_default("currency"),
		"palette": _palette(),
		"mobile_slots": _saved_slots(),
		"modules": modules,
		# Compatibility for the Contactos pages and NotPermitted (one release).
		"sales_access": bool(modules.get("ventas", {}).get("enabled")),
		"capabilities": {"directory": bool(modules.get("contactos", {}).get("enabled"))},
	}


@frappe.whitelist(methods=["POST"])
def save_mobile_slots(slots: str | list):
	"""The user's own bottom-nav order; only known module keys, at most four."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if isinstance(slots, str):
		slots = json.loads(slots or "[]")
	if not isinstance(slots, list):
		frappe.throw(_("Choose up to four sections for the bar."))
	clean = []
	for key in slots:
		if key in MODULE_KEYS and key not in clean:
			clean.append(key)
	frappe.defaults.set_user_default(MOBILE_SLOTS_DEFAULT, json.dumps(clean[:4]))
	return clean[:4]


RECENT_LIMIT = 8


@frappe.whitelist(methods=["POST"])
def resolve_recent(records: str | list):
	"""Titles for the palette's recent Contactos records the user may still read.

	The browser keeps only {source, name}; anything no longer readable (module or
	record revoked, deleted, unknown source) is left out, so the palette drops it.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if isinstance(records, str):
		records = json.loads(records or "[]")
	if not isinstance(records, list):
		return []
	try:
		enabled = _contactos()["enabled"]
	except frappe.PermissionError:
		enabled = False
	if not enabled:
		return []
	from doco.contactos import access

	rows = []
	for record in records[:RECENT_LIMIT]:
		source = record.get("source") if isinstance(record, dict) else None
		name = record.get("name") if isinstance(record, dict) else None
		doctype = access.SOURCES.get(source) if isinstance(source, str) else None
		if not doctype or not isinstance(name, str) or not access.available(doctype):
			continue
		if not frappe.db.exists(doctype, name):
			continue
		doc = frappe.get_doc(doctype, name)
		if not doc.has_permission("read"):
			continue
		rows.append({"source": source, "name": name, "title": access.title(doc)})
	return rows
