"""One boot call for the Muelle shell (spec-muelle-shell §7).

Module providers report native capabilities; they never grant anything. Each
module route and API still checks its own permissions on every request.
"""

import json

import frappe
from frappe import _

MOBILE_SLOTS_DEFAULT = "muelle_mobile_slots"
# Desktop rail width: «expanded» shows each app's name, «collapsed» only icons.
RAIL_DEFAULT = "muelle_rail"
RAIL_STATES = ("expanded", "collapsed")
MODULE_KEYS = (
	"hoy",
	"pendientes",
	"agenda",
	"contactos",
	"ventas",
	"cobranza",
	"compras",
	"gastos",
	"resultados",
	"productos",
	"garantias",
	"encuestas",
	"equipo",
	"archivos",
	"manual",
	"avisos",
)
# Doco puesto → phone bottom-nav class (contracts registry NavRole).
NAV_ROLES = {"Cajero": "vendedor", "Técnico": "recepcion", "Encargado": "dueno", "Dueño": "dueno"}


def _hoy():
	# Every staff account's home; each Hoy section re-checks its own source.
	from crm.api.hoy import check_hoy_permission

	enabled = check_hoy_permission()
	return {
		"key": "hoy",
		"enabled": enabled,
		"reason": None
		if enabled
		else _("Hoy is available to staff accounts only. Ask your manager to check your user."),
		"capabilities": {"read": enabled},
	}


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


def _gastos():
	try:
		# Doco owns supplier bills and payments; an older doco leaves the module off, not the shell down.
		from doco.workspaces.payables import bootstrap
	except ImportError:
		bootstrap = None
	if "doco" not in frappe.get_installed_apps() or bootstrap is None:
		return {
			"key": "gastos",
			"enabled": False,
			"reason": _("Gastos is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	answer = bootstrap() or {}
	capabilities = answer.get("capabilities") or {}
	# Employees' expenses («De empleados»): a claim-only employee opens Gastos too.
	claims = answer.get("claims") or {}
	bills = bool(answer.get("enabled") and capabilities.get("read"))
	expenses = bool(answer.get("enabled") and claims.get("enabled"))
	enabled = bills or expenses
	return {
		"key": "gastos",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask your manager for permission to read supplier bills, then retry."),
		"capabilities": {
			"read": bills,
			"submit": bills and bool(capabilities.get("submit")),
			"pay": bills and bool(capabilities.get("pay")),
			"claims": expenses,
			"claim": expenses and bool(claims.get("file")),
			"decide": expenses and bool(claims.get("decide")),
			"reimburse": expenses and bool(claims.get("reimburse")),
		},
	}


def _cobranza():
	from crm.api.cobranza import _bootstrap

	# Doco owns receivables; an older doco (or none) leaves the module off, not the shell down.
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {
			"key": "cobranza",
			"enabled": False,
			"reason": _("Cobranza is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	answer = bootstrap() or {}
	enabled = bool(answer.get("enabled"))
	capabilities = answer.get("capabilities") or {}
	return {
		"key": "cobranza",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask your manager for permission to read sales invoices, then retry."),
		"capabilities": {"read": enabled, "create": enabled and bool(capabilities.get("remind"))},
	}


def _garantias():
	from crm.api.garantias import get_capabilities

	answer = get_capabilities() or {}
	capabilities = answer.get("capabilities") or {}
	enabled = bool(answer.get("enabled"))
	return {
		"key": "garantias",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason")
		or _("Ask your manager for permission to read warranty claims, then retry."),
		"capabilities": {
			"read": enabled,
			"create": enabled and bool(capabilities.get("create")),
			"repair": enabled and bool(capabilities.get("repair")),
		}
		if enabled
		else {},
	}


def _productos():
	try:
		# Doco owns the product services; an older doco leaves the module off, not the shell down.
		from doco.workspaces.products import bootstrap
	except ImportError:
		bootstrap = None
	if "doco" not in frappe.get_installed_apps() or bootstrap is None:
		return {
			"key": "productos",
			"enabled": False,
			"reason": _("Productos is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	answer = bootstrap() or {}
	enabled = bool(answer.get("enabled"))
	capabilities = answer.get("capabilities") or {}
	return {
		"key": "productos",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask your manager for permission to read items, then retry."),
		"capabilities": {"read": enabled, "edit": enabled and bool(capabilities.get("edit"))},
	}


def _encuestas():
	from crm.api.encuestas import get_capabilities

	answer = get_capabilities() or {}
	capabilities = answer.get("capabilities") or {}
	enabled = bool(answer.get("enabled"))
	return {
		"key": "encuestas",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask the owner for access to what customers answered, then retry."),
		"capabilities": {
			"read": enabled,
			"follow_up": enabled and bool(capabilities.get("follow_up")),
			"setup": enabled and bool(capabilities.get("setup")),
		}
		if enabled
		else {},
	}


def _resultados():
	# Mercado and Taller own the numbers; without either the module is absent.
	from crm.api.resultados import get_capabilities

	answer = get_capabilities()
	if answer is None:
		return None
	enabled = bool(answer.get("enabled"))
	return {
		"key": "resultados",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask your manager for access to the business results, then retry."),
		"capabilities": {"read": enabled},
	}


def _equipo():
	from crm.api.equipo import get_capabilities

	answer = get_capabilities() or {}
	capabilities = answer.get("capabilities") or {}
	enabled = bool(answer.get("enabled"))
	return {
		"key": "equipo",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Equipo is for the owner and managers of the shop."),
		"capabilities": {
			"read": enabled,
			"hr": enabled and bool(capabilities.get("hr")),
			"create": enabled and bool(capabilities.get("hire")),
			"configure": enabled and bool(capabilities.get("configure")),
		}
		if enabled
		else {},
		# Without HRMS the module stays on; this says why its HR queues are absent.
		"hr_reason": answer.get("hr_reason") if enabled else None,
		"badge": answer.get("badge") if enabled else None,
	}


def _manual():
	# Doco owns the articles; every worker reads the published ones for their puesto.
	from crm.api.manual import get_capabilities

	answer = get_capabilities() or {}
	capabilities = answer.get("capabilities") or {}
	enabled = bool(answer.get("enabled"))
	return {
		"key": "manual",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask the owner or the manager to check your user, then retry."),
		"capabilities": {
			"read": enabled,
			"write": enabled and bool(capabilities.get("write")),
			# Hoy «Accesos» shows the manual to a reader once something is published.
			"published": enabled and bool(capabilities.get("published")),
		}
		if enabled
		else {},
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


def _pendientes():
	try:
		# A doco older than Pendientes (crm updated first) leaves the module off, not the shell down.
		from doco.pendientes.api import bootstrap
	except ImportError:
		bootstrap = None
	if "doco" not in frappe.get_installed_apps() or bootstrap is None:
		return {
			"key": "pendientes",
			"enabled": False,
			"reason": _("Pendientes is not installed. Ask your manager to check the app."),
			"capabilities": {},
		}

	answer = bootstrap() or {}
	enabled = bool(answer.get("enabled"))
	capabilities = answer.get("capabilities") or {}
	return {
		"key": "pendientes",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason")
		or _("Ask your manager for permission to read your pendientes, then retry."),
		"capabilities": {
			"read": enabled,
			"create": enabled and bool(capabilities.get("create")),
			"create_crm": enabled and bool(capabilities.get("create_crm")),
			"team": enabled and bool(capabilities.get("team")),
			# «Por aprobar» / «Esperando respuesta»: only where some owner says they apply.
			"approve": enabled and bool(capabilities.get("approve")),
			"waiting": enabled and bool(capabilities.get("waiting")),
		},
		# The queue's own context: whose work, the site's today and which sources it reads.
		"user": answer.get("user"),
		"full_name": answer.get("full_name"),
		"today": answer.get("today"),
		"sources": answer.get("sources") or {},
	}


def _agenda():
	# Doco owns the calendar sources; crm.api.agenda answers which ones this worker may open.
	from crm.api.agenda import get_capabilities

	answer = get_capabilities()
	enabled = bool(answer.get("enabled"))
	return {
		"key": "agenda",
		"enabled": enabled,
		"reason": None
		if enabled
		else answer.get("reason") or _("Ask your manager for permission to read events, then retry."),
		"capabilities": {
			"read": enabled,
			"create": enabled and any(row.get("canCreate") for row in answer.get("sources") or []),
		},
	}


def _hosted():
	"""Providers of the modules whose screens live in this SPA under /crm/<key>, besides Ventas."""
	return {
		"hoy": _hoy,
		"pendientes": _pendientes,
		"agenda": _agenda,
		"contactos": _contactos,
		"cobranza": _cobranza,
		"compras": _compras,
		"gastos": _gastos,
		"productos": _productos,
		"resultados": _resultados,
		"garantias": _garantias,
		"encuestas": _encuestas,
		"equipo": _equipo,
		"archivos": _archivos,
		"manual": _manual,
		"avisos": _avisos,
	}


def first_module():
	"""The first module (contracts order) this worker can open without Ventas, or None."""
	hosted = _hosted()
	for key in MODULE_KEYS:
		provider = hosted.get(key)
		if not provider:
			continue
		try:
			if (provider() or {}).get("enabled"):
				return key
		except frappe.PermissionError:
			continue
	return None


def _providers():
	"""Built-in providers plus `muelle_shell_modules` hooks from other apps."""
	providers = [
		_hoy,
		_contactos,
		_ventas,
		_pendientes,
		_agenda,
		_cobranza,
		_compras,
		_gastos,
		_productos,
		_resultados,
		_garantias,
		_encuestas,
		_equipo,
		_avisos,
		_archivos,
		_manual,
	]
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


def _saved_rail():
	value = frappe.defaults.get_user_default(RAIL_DEFAULT)
	return value if value in RAIL_STATES else None


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
		"rail": _saved_rail(),
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


@frappe.whitelist(methods=["POST"])
def save_rail(state: str):
	"""The user's own desktop rail width: «expanded» (names) or «collapsed» (icons)."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if state not in RAIL_STATES:
		frappe.throw(_("Choose whether the sidebar shows the app names or only their icons."))
	frappe.defaults.set_user_default(RAIL_DEFAULT, state)
	return state


RECENT_LIMIT = 8


@frappe.whitelist(methods=["POST"])
def resolve_recent(records: str | list):
	"""Titles for the palette's recent Contactos records and Ventas deals the user may still read.

	The browser keeps only {source, name}; anything no longer readable (module or
	record revoked, deleted, unknown source) is left out, so the palette drops it.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if isinstance(records, str):
		records = json.loads(records or "[]")
	if not isinstance(records, list):
		return []
	enabled = {}
	for provider in (_contactos, _ventas):
		try:
			enabled[provider.__name__] = provider()["enabled"]
		except frappe.PermissionError:
			enabled[provider.__name__] = False
	if not any(enabled.values()):
		return []
	access = None
	if enabled["_contactos"]:
		from doco.contactos import access

	rows = []
	for record in records[:RECENT_LIMIT]:
		source = record.get("source") if isinstance(record, dict) else None
		name = record.get("name") if isinstance(record, dict) else None
		if not isinstance(source, str) or not isinstance(name, str):
			continue
		if source == "deal":
			if enabled["_ventas"]:
				row = _recent_deal(name)
				if row:
					rows.append(row)
			continue
		doctype = access.SOURCES.get(source) if access else None
		if not doctype or not access.available(doctype):
			continue
		if not frappe.db.exists(doctype, name):
			continue
		doc = frappe.get_doc(doctype, name)
		if not doc.has_permission("read"):
			continue
		rows.append({"source": source, "name": name, "title": access.title(doc)})
	return rows


def _recent_deal(name):
	if not frappe.db.exists("CRM Deal", name):
		return None
	doc = frappe.get_doc("CRM Deal", name)
	if not doc.has_permission("read"):
		return None
	person = " ".join(part for part in (doc.get("first_name"), doc.get("last_name")) if part)
	title = doc.get("organization") or doc.get("lead_name") or person or name
	return {"source": "deal", "name": name, "title": title}
