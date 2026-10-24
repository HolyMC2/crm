"""One boot call for the Muelle shell (spec-muelle-shell §7).

Module providers report native capabilities; they never grant anything. Each
module route and API still checks its own permissions on every request.
"""

import hashlib
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
	"bancos",
	"productos",
	"garantias",
	"encuestas",
	"equipo",
	"archivos",
	"manual",
	"documentos",
	"inventario",
	"inmobiliaria",
	"avisos",
)
# Doco puesto → phone bottom-nav class (contracts registry NavRole).
NAV_ROLES = {"Cajero": "cajero", "Técnico": "recepcion", "Encargado": "dueno", "Dueño": "dueno"}
# Without a puesto the class comes from the worker's Frappe roles, first match wins
# (DD18: the shell keeps no permission list of its own). A shop owner holds the
# accounting roles; only cashiers hold POS User without a puesto above them.
ROLE_NAV_ROLES = (
	("System Manager", "dueno"),
	("Accounts Manager", "dueno"),
	("POS User", "cajero"),
	("Sales User", "vendedor"),
	("Purchase User", "compras"),
	("Stock User", "almacen"),
)


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

	from crm.api.gastos import can_create_bill

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
			"create": bills and can_create_bill(),
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

	answer = get_capabilities(full=False) or {}
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


def _documents_module(key):
	# Neutral modules (SPEC §6 DD3): on when the worker can read one of their doctypes and
	# their module is not blocked; each documentos call re-checks Frappe permissions.
	from crm.api.documentos import get_capabilities

	answer = get_capabilities(key)
	enabled = bool(answer.get("enabled"))
	return {
		"key": key,
		"enabled": enabled,
		"reason": None if enabled else answer.get("reason"),
		"capabilities": (answer.get("capabilities") or {}) if enabled else {},
	}


def _documentos():
	return _documents_module("documentos")


def _inventario():
	return _documents_module("inventario")


def _bancos():
	# Bancos y catálogo de cuentas (Shell D11, DD19): neutral like Documentos, on for who reads
	# Bank Account or the ledger; every crm.api.bancos call re-checks Frappe permissions.
	from crm.api.bancos import get_capabilities

	answer = get_capabilities()
	enabled = bool(answer.get("enabled"))
	return {
		"key": "bancos",
		"enabled": enabled,
		"reason": None if enabled else answer.get("reason"),
		"capabilities": (answer.get("capabilities") or {}) if enabled else {},
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


def _inmobiliaria():
	"""The real-estate app's screens (/crm/inmobiliaria): only where the app is installed."""
	if "inmobiliaria" not in frappe.get_installed_apps():
		return None
	try:
		# An inmobiliaria older than its shell screens leaves the module off, not the shell down.
		from inmobiliaria.api.shell import modulo
	except ImportError:
		return {
			"key": "inmobiliaria",
			"enabled": False,
			"reason": _("Ask your manager to update Inmobiliaria to open it here."),
			"capabilities": {},
		}
	answer = modulo() or {}
	enabled = bool(answer.get("enabled"))
	return {
		"key": "inmobiliaria",
		"enabled": enabled,
		"reason": None if enabled else answer.get("reason"),
		"capabilities": (answer.get("capabilities") or {}) if enabled else {},
		"nav_role": answer.get("nav_role") if enabled else None,
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
		"bancos": _bancos,
		"garantias": _garantias,
		"encuestas": _encuestas,
		"equipo": _equipo,
		"archivos": _archivos,
		"manual": _manual,
		"documentos": _documentos,
		"inventario": _inventario,
		"inmobiliaria": _inmobiliaria,
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
		_bancos,
		_garantias,
		_encuestas,
		_equipo,
		_avisos,
		_archivos,
		_manual,
		_documentos,
		_inventario,
		_inmobiliaria,
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


def nav_role(puesto: str | None, roles: list[str] | set[str], hint: str | None = None) -> str | None:
	"""Bottom-nav class: the Doco puesto when it maps (a shop worker), else a module
	provider's hint (Inmobiliaria sets one for its own workers, who also hold Sales User),
	else the first matching role."""
	if puesto and puesto in NAV_ROLES:
		return NAV_ROLES[puesto]
	if hint:
		return hint
	held = set(roles)
	for role, klass in ROLE_NAV_ROLES:
		if role in held:
			return klass
	return None


def _module_nav_hint(modules: dict) -> str | None:
	# A provider may name the bar class of its own workers (`nav_role` on its DTO, only
	# when it is enabled for this user); the first provider that names one wins.
	for dto in modules.values():
		if dto.get("enabled") and dto.get("nav_role"):
			return dto["nav_role"]
	return None


def scope_hash(user: str | None = None) -> str:
	"""Short hash of what shapes this user's shell: roles, puesto, blocked modules, User
	Permissions and the site's permission rules. The client keys its boot copy by it, so a
	role or permission change never paints the old shell (DD18). Never raises: it runs on
	every /crm page render."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return ""
	try:
		parts = [
			sorted(frappe.get_roles(user)),
			frappe.db.get_value("User", user, "muelle_puesto")
			if frappe.get_meta("User").has_field("muelle_puesto")
			else None,
			sorted(
				frappe.get_all(
					"Block Module",
					filters={"parent": user, "parenttype": "User", "parentfield": "block_modules"},
					pluck="module",
				)
			),
			sorted(
				frappe.get_all(
					"User Permission",
					filters={"user": user},
					fields=["allow", "for_value", "applicable_for", "apply_to_all_doctypes"],
					as_list=True,
				)
			),
			frappe.db.sql("select max(modified) from `tabCustom DocPerm`")[0][0],
		]
	except Exception:
		return ""
	return hashlib.sha1(json.dumps(parts, default=str).encode()).hexdigest()[:12]


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
			"nav_role": nav_role(puesto, frappe.get_roles(), _module_nav_hint(modules)),
			"is_admin": "System Manager" in frappe.get_roles(),
		},
		# What the client keys its boot copy by (also in the page boot as shell_scope).
		"scope": scope_hash(),
		"company": frappe.defaults.get_user_default("company"),
		"locale": frappe.local.lang,
		"time_zone": frappe.db.get_value("User", frappe.session.user, "time_zone")
		or frappe.utils.get_system_timezone(),
		"currency": frappe.defaults.get_global_default("currency"),
		"palette": _palette(),
		"mobile_slots": _saved_slots(),
		"rail": _saved_rail(),
		# Where Muelle opens for me (Más > Configuración); the client shows
		# «Automático» when the saved module is no longer one of mine.
		"landing": _saved_landing_key(),
		"modules": modules,
		# Compatibility for the Contactos pages and NotPermitted (one release).
		"sales_access": bool(modules.get("ventas", {}).get("enabled")),
		"capabilities": {"directory": bool(modules.get("contactos", {}).get("enabled"))},
	}


def _saved_landing_key() -> str:
	"""The raw «Abrir Muelle en» choice; Hoy owns saving it (crm.api.hoy.save_landing)."""
	from crm.api.hoy import LANDING_DEFAULT

	return frappe.defaults.get_user_default(LANDING_DEFAULT) or ""


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
	from crm.api.palette import deal_title

	# Same title as the palette's deal search (CRM-S3.3), so a recent reads like the hit.
	return {"source": "deal", "name": name, "title": deal_title(doc)}


@frappe.whitelist(methods=["POST"])
def resolve_documents(records: str | list):
	"""Titles for the palette's recent Documentos records the user may still read (E7).

	Same contract as resolve_recent: the browser keeps only {doctype, name}; anything no
	longer readable (module blocked, permission or record gone) is left out.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if isinstance(records, str):
		records = json.loads(records or "[]")
	if not isinstance(records, list):
		return []
	from crm.api import documentos

	blocked = documentos._blocked_modules()
	rows = []
	for record in records[:RECENT_LIMIT]:
		doctype = record.get("doctype") if isinstance(record, dict) else None
		name = record.get("name") if isinstance(record, dict) else None
		if not isinstance(doctype, str) or not isinstance(name, str):
			continue
		if not documentos.readable(doctype, blocked) or not frappe.db.exists(doctype, name):
			continue
		doc = frappe.get_doc(doctype, name)
		if not doc.has_permission("read"):
			continue
		row = documentos._row(doc, documentos._display(doc.meta))
		row["doctype"] = doctype
		rows.append(row)
	return rows


# ── E7: the palette reaches what Desk reaches (reports, workspaces) ─────────────

DESK_REACH_TTL = 300
DESK_REACH_LIMIT = {"reports": 20, "workspaces": 40}


def _desk_term(search):
	from unidecode import unidecode

	return unidecode(frappe.utils.cstr(search).strip().lower())[:80]


def _desk_matches(term, *values):
	from unidecode import unidecode

	return not term or any(term in unidecode(str(value).lower()) for value in values if value)


def _desk_slug(name):
	# Desk's router.slug: lower case, spaces to hyphens.
	return str(name).lower().replace(" ", "-")


def _desk_blocked():
	user = frappe.session.user
	if user == "Administrator":
		return set()
	return set(frappe.get_cached_doc("User", user).get_blocked_modules())


def _desk_cached(kind, build):
	"""Per user, five minutes, re-keyed by scope_hash so a role or permission change shows at once."""
	user = frappe.session.user
	key = f"crm:shell:{kind}:{scope_hash(user)}"
	cached = frappe.cache.get_value(key, user=user)
	if cached:
		return json.loads(cached)
	rows = build()
	frappe.cache.set_value(key, json.dumps(rows, default=str), user=user, expires_in_sec=DESK_REACH_TTL)
	return rows


def forget_desk_reach(user=None):
	"""Tests and fixtures: drop this user's cached reports and workspaces."""
	user = user or frappe.session.user
	for kind in DESK_REACH_LIMIT:
		frappe.cache.delete_value(f"crm:shell:{kind}:{scope_hash(user)}", user=user)


def _report_href(name, info):
	from urllib.parse import quote

	# The awesomebar's routes: a Report Builder report is a view of its list; the rest run as query reports.
	if info.get("report_type") == "Report Builder" and info.get("ref_doctype"):
		return f"/app/{_desk_slug(info['ref_doctype'])}/view/report/{quote(name)}"
	return f"/app/query-report/{quote(name)}"


def _allowed_reports():
	from unidecode import unidecode

	# Desk's own set (roles, Custom Role, disabled = 0, Report read permission), as frappe.boot.user.all_reports.
	allowed = frappe.get_user().get_all_reports() or {}
	if not allowed:
		return []
	blocked = _desk_blocked()
	modules = dict(
		frappe.get_all("Report", filters={"name": ("in", list(allowed))}, fields=["name", "module"], as_list=True)
	)
	rows = []
	for name, info in allowed.items():
		if modules.get(name) in blocked:
			continue
		ref = info.get("ref_doctype")
		if ref and not frappe.has_permission(ref, "read"):
			continue
		rows.append(
			{
				"name": name,
				"title": _(name),
				"report_type": info.get("report_type"),
				"ref_doctype": ref,
				"ref_label": _(ref) if ref else "",
				"href": _report_href(name, info),
			}
		)
	rows.sort(key=lambda row: unidecode(row["title"].lower()))
	return rows


@frappe.whitelist()
def reports(search: str | None = None):
	"""Palette «Reportes»: the reports this worker may run, as Desk lists them, by Spanish title or
	English name, each with the Desk URL that runs it."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	term = _desk_term(search)
	rows = _desk_cached("reports", _allowed_reports)
	return [row for row in rows if _desk_matches(term, row["title"], row["name"], row["ref_label"])][
		: DESK_REACH_LIMIT["reports"]
	]


def _allowed_workspaces():
	from frappe.desk.desktop import get_workspaces

	blocked = _desk_blocked()
	rows = []
	# Desk's own sidebar set: public pages this user's roles reach plus their private pages.
	for page in get_workspaces().get("pages") or []:
		if page.get("is_hidden") or page.get("type") in ("Link", "URL"):
			continue
		if page.get("module") in blocked or page.get("title") == "Welcome Workspace":
			continue
		name = page.get("name")
		slug = _desk_slug(name)
		rows.append(
			{
				"name": name,
				"title": page.get("title") or name,
				"label": page.get("label") or _(name),
				"public": bool(page.get("public")),
				"href": f"/app/{slug}" if page.get("public") else f"/app/private/{slug}",
			}
		)
	return rows


@frappe.whitelist()
def workspaces(search: str | None = None):
	"""Palette «Desk»: the Desk workspaces this worker sees, by label, as Desk links."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	term = _desk_term(search)
	rows = _desk_cached("workspaces", _allowed_workspaces)
	return [row for row in rows if _desk_matches(term, row["label"], row["title"], row["name"])][
		: DESK_REACH_LIMIT["workspaces"]
	]
