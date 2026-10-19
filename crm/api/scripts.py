# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Scripts de usuario (Shell D12, goal 5): the owner's desktop view of Server Scripts, Client
Scripts and Custom Fields: what each applies to in words, on/off, the code, its versions.

System Manager only (a Spanish 403 for anyone else); Server Scripts also need Frappe's own
«Script Manager» role, which their DocType requires. Saves go through `doc.save()`, so Frappe
validates them and writes the Version history. Nothing new runs unless the owner turns it on:
`crear` makes a Client Script switched off.

Custom Fields have no on/off: hiding one only hides it in the form; its column, its data and
the scripts or reports reading it stay. So they are listed and shown, never toggled here.
"""

import difflib
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_fullname

TIPOS = {"servidor": "Server Script", "cliente": "Client Script", "campos": "Custom Field"}
MAX_PAGE = 100
MAX_CODE = 200_000
MAX_VERSIONS = 20
MAX_DIFF_LINES = 40

# Event → (short, as in the list; the clause after «cada vez que un documento «X»…»).
EVENTOS = {
	"Before Insert": ("antes de crear", "va a crearse"),
	"Before Validate": ("antes de revisar", "va a revisarse"),
	"Before Save": ("antes de guardar", "va a guardarse"),
	"After Insert": ("después de crear", "se crea"),
	"After Save": ("después de guardar", "se guarda"),
	"Before Rename": ("antes de cambiar el nombre", "va a cambiar de nombre"),
	"After Rename": ("después de cambiar el nombre", "cambia de nombre"),
	"Before Submit": ("antes de confirmar", "va a confirmarse"),
	"After Submit": ("después de confirmar", "se confirma"),
	"Before Cancel": ("antes de cancelar", "va a cancelarse"),
	"After Cancel": ("después de cancelar", "se cancela"),
	"Before Discard": ("antes de descartar", "va a descartarse"),
	"After Discard": ("después de descartar", "se descarta"),
	"Before Delete": ("antes de borrar", "va a borrarse"),
	"After Delete": ("después de borrar", "se borra"),
	"Before Save (Submitted Document)": ("antes de guardar ya confirmado", "ya confirmado va a guardarse"),
	"After Save (Submitted Document)": ("después de guardar ya confirmado", "ya confirmado se guarda"),
	"Before Print": ("antes de imprimir", "va a imprimirse"),
}
FRECUENCIAS = {
	"All": "cada pocos minutos",
	"Hourly": "cada hora",
	"Daily": "cada día",
	"Weekly": "cada semana",
	"Monthly": "cada mes",
	"Yearly": "cada año",
	"Hourly Long": "cada hora (tarea larga)",
	"Daily Long": "cada día (tarea larga)",
	"Weekly Long": "cada semana (tarea larga)",
	"Monthly Long": "cada mes (tarea larga)",
}
TIPOS_CAMPO = {
	"Data": "texto",
	"Small Text": "texto largo",
	"Text": "texto largo",
	"Long Text": "texto largo",
	"Text Editor": "texto con formato",
	"Select": "opciones",
	"Link": "enlace",
	"Dynamic Link": "enlace",
	"Check": "casilla",
	"Date": "fecha",
	"Datetime": "fecha y hora",
	"Time": "hora",
	"Int": "número entero",
	"Float": "número",
	"Currency": "importe",
	"Percent": "porcentaje",
	"Table": "tabla",
	"Table MultiSelect": "tabla",
	"Attach": "archivo",
	"Attach Image": "imagen",
	"Section Break": "sección",
	"Column Break": "columna",
	"Tab Break": "pestaña",
	"HTML": "bloque de HTML",
	"Button": "botón",
	"Phone": "teléfono",
}
MOTOR_APAGADO = "En este sitio los scripts de servidor están apagados; ninguno se ejecuta."
_NAME = re.compile(r"[^A-Za-z0-9 _-]+")


# ── Access ────────────────────────────────────────────────────────────────────


def _solo_dueno():
	if "System Manager" not in frappe.get_roles():
		frappe.throw(
			_("Solo el dueño o quien administra el sistema puede ver y cambiar los scripts."),
			frappe.PermissionError,
		)


def _doctype(tipo, ptype="read"):
	_solo_dueno()
	doctype = TIPOS.get(cstr(tipo))
	if not doctype:
		frappe.throw(_("Elige Servidor, Cliente o Campos."), frappe.ValidationError)
	if not frappe.has_permission(doctype, ptype):
		frappe.throw(
			_("Tu usuario no tiene permiso para esto ({0}); pídelo a quien administra el sistema.").format(
				_(doctype)
			),
			frappe.PermissionError,
		)
	return doctype


def motor_activo():
	from frappe.utils.safe_exec import is_safe_exec_enabled

	return bool(is_safe_exec_enabled())


# ── Words ─────────────────────────────────────────────────────────────────────


def _dt(doctype):
	return _(doctype) if doctype else _("ningún documento")


def describir(tipo, row):
	"""(aplica, cuando): what the row applies to, and the sentence the switch's confirm reads."""
	if tipo == "servidor":
		kind = row.get("script_type")
		if kind == "DocType Event":
			event = row.get("doctype_event")
			short, clause = EVENTOS.get(event, (cstr(event).lower(), cstr(event).lower()))
			dt = _dt(row.get("reference_doctype"))
			return (
				f"{dt} · {short}",
				_("Se ejecutará cada vez que un documento «{0}» {1}.").format(dt, clause),
			)
		if kind == "Scheduler Event":
			freq = row.get("event_frequency")
			when = (
				_("programado ({0})").format(row.get("cron_format") or "cron")
				if freq == "Cron"
				else FRECUENCIAS.get(freq, cstr(freq).lower())
			)
			return _("Tarea programada · {0}").format(when), _("Se ejecutará solo, {0}.").format(when)
		if kind == "API":
			path = f"/api/method/{row.get('api_method') or ''}"
			guest = _(", también sin iniciar sesión") if cint(row.get("allow_guest")) else ""
			return (
				_("Dirección de API {0}{1}").format(path, guest),
				_("Se ejecutará cada vez que algo llame a {0}{1}.").format(path, guest),
			)
		if kind == "Permission Query":
			dt = _dt(row.get("reference_doctype"))
			return (
				_("{0} · decide qué ve cada usuario").format(dt),
				_("Se ejecutará cada vez que alguien abra una lista de «{0}».").format(dt),
			)
		if kind == "Workflow Task":
			return _("Paso de un flujo de aprobación"), _(
				"Se ejecutará cuando un flujo de aprobación llegue a él."
			)
		return cstr(kind), _("Se ejecutará cuando el sistema lo llame.")
	if tipo == "cliente":
		dt = _dt(row.get("dt"))
		view = row.get("view") or "Form"
		where = _("la lista") if view == "List" else _("el formulario")
		return (
			_("{0} · {1} del escritorio").format(dt, where),
			_("Se ejecutará cada vez que alguien abra {0} de «{1}» en el escritorio.").format(where, dt),
		)
	dt = _dt(row.get("dt"))
	kind = TIPOS_CAMPO.get(row.get("fieldtype"), cstr(row.get("fieldtype")).lower())
	hidden = " · " + _("oculto") if cint(row.get("hidden")) else ""
	return f"{dt} · {kind}{hidden}", ""


def _activo(tipo, row):
	if tipo == "servidor":
		return not cint(row.get("disabled"))
	if tipo == "cliente":
		return bool(cint(row.get("enabled")))
	return None


def _persona(user):
	if not user or user in ("Administrator", "Guest"):
		return _("Sistema")
	name = get_fullname(user) or ""
	return name if name and "@" not in name else cstr(user).split("@")[0]


FIELDS = {
	"servidor": [
		"name",
		"script_type",
		"reference_doctype",
		"doctype_event",
		"api_method",
		"allow_guest",
		"event_frequency",
		"cron_format",
		"disabled",
		"module",
		"modified",
		"modified_by",
	],
	"cliente": ["name", "dt", "view", "enabled", "module", "modified", "modified_by"],
	"campos": [
		"name",
		"dt",
		"label",
		"fieldname",
		"fieldtype",
		"hidden",
		"module",
		"is_system_generated",
		"modified",
		"modified_by",
	],
}
SEARCH = {
	"servidor": ("name", "reference_doctype", "api_method"),
	"cliente": ("name", "dt"),
	"campos": ("name", "dt", "label", "fieldname"),
}


def _fila(tipo, row):
	aplica, cuando = describir(tipo, row)
	titulo = row.get("name")
	if tipo == "campos":
		titulo = row.get("label") or row.get("fieldname") or row.get("name")
	return {
		"name": row.get("name"),
		"titulo": titulo,
		"campo": row.get("fieldname") if tipo == "campos" else None,
		"aplica": aplica,
		"cuando": cuando,
		"activo": _activo(tipo, row),
		"modulo": row.get("module") or None,
		"modificado": cstr(row.get("modified")),
		"modificado_por": _persona(row.get("modified_by")),
	}


@frappe.whitelist()
def lista(tipo: str, buscar: str | None = None, inicio: int | str = 0, limite: int | str = 50):
	"""One page of scripts or custom fields, newest change first, searchable by name/doctype."""
	doctype = _doctype(tipo)
	term = cstr(buscar).strip()[:140]
	or_filters = {f: ["like", f"%{term}%"] for f in SEARCH[tipo]} if term else None
	start = max(0, cint(inicio))
	page = max(1, min(cint(limite) or 50, MAX_PAGE))
	rows = frappe.get_list(
		doctype,
		fields=FIELDS[tipo],
		or_filters=or_filters,
		order_by="modified desc",
		limit_start=start,
		limit_page_length=page + 1,
	)
	total = len(frappe.get_list(doctype, or_filters=or_filters, pluck="name", limit_page_length=0))
	out = {
		"tipo": tipo,
		"filas": [_fila(tipo, row) for row in rows[:page]],
		"total": total,
		"hay_mas": len(rows) > page,
		"puede_editar": tipo != "campos"
		and bool(frappe.has_permission(doctype, "write")),  # nosemgrep: unchecked-frappe-permission-call
		"puede_crear": tipo == "cliente"
		and bool(frappe.has_permission(doctype, "create")),  # nosemgrep: unchecked-frappe-permission-call
	}
	if tipo == "servidor":
		out["motor_activo"] = motor_activo()
		out["nota"] = None if out["motor_activo"] else _(MOTOR_APAGADO)
	return out


# ── One script ────────────────────────────────────────────────────────────────


def _diff(old, new):
	"""(+added, -removed, the first changed lines) between two versions of the code."""
	lines = list(difflib.unified_diff(cstr(old).splitlines(), cstr(new).splitlines(), lineterm="", n=0))
	body = [line for line in lines if not line.startswith(("---", "+++", "@@"))]
	added = sum(1 for line in body if line.startswith("+"))
	removed = sum(1 for line in body if line.startswith("-"))
	return added, removed, body[:MAX_DIFF_LINES]


def _valor(value):
	if value in (0, "0"):
		return _("no")
	if value in (1, "1"):
		return _("sí")
	text = cstr(value).strip()
	return text[:60] if text else _("vacío")


def resumen_version(doctype, data):
	"""A Version row's change in words: «Código: +3 -1 líneas», «Apagado: no → sí»."""
	try:
		data = json.loads(data) if isinstance(data, str) else (data or {})
	except ValueError:
		return {"texto": _("Cambio"), "diff": []}
	meta = frappe.get_meta(doctype)
	parts, diff = [], []
	for change in data.get("changed") or []:
		if not isinstance(change, list | tuple) or len(change) < 3:
			continue
		field, old, new = change[0], change[1], change[2]
		if field == "script":
			added, removed, diff = _diff(old, new)
			parts.append(_("Código: +{0} −{1} líneas").format(added, removed))
			continue
		df = meta.get_field(field)
		label = _(df.label) if df and df.label else field
		parts.append(f"{label}: {_valor(old)} → {_valor(new)}")
	return {"texto": "; ".join(parts) or _("Cambio"), "diff": diff}


def versiones(doctype, name, doc=None):
	rows = frappe.get_all(
		"Version",
		filters={"ref_doctype": doctype, "docname": name},
		fields=["name", "owner", "creation", "data"],
		order_by="creation desc",
		limit_page_length=MAX_VERSIONS,
	)
	out = [
		{"quien": _persona(row.owner), "cuando": cstr(row.creation), **resumen_version(doctype, row.data)}
		for row in rows
	]
	if doc is not None and len(rows) < MAX_VERSIONS:
		out.append(
			{"quien": _persona(doc.owner), "cuando": cstr(doc.creation), "texto": _("Creado"), "diff": []}
		)
	return out


PROPIEDADES = (
	"fieldname",
	"fieldtype",
	"options",
	"insert_after",
	"default",
	"reqd",
	"hidden",
	"read_only",
	"in_list_view",
	"depends_on",
	"fetch_from",
	"description",
)


@frappe.whitelist()
def ver(tipo: str, name: str):
	"""The script's code (or the field's properties), what it applies to, and its versions."""
	doctype = _doctype(tipo)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	row = doc.as_dict()
	out = _fila(tipo, row)
	out.update(
		{
			"tipo": tipo,
			"lenguaje": {"servidor": "python", "cliente": "javascript"}.get(tipo),
			"codigo": cstr(doc.get("script")) if tipo != "campos" else None,
			"versiones": versiones(doctype, name, doc),
			"puede_editar": tipo != "campos" and bool(doc.has_permission("write")),
		}
	)
	if tipo == "campos":
		meta = frappe.get_meta(doctype)
		out["propiedades"] = [
			{"campo": f, "etiqueta": _(meta.get_field(f).label or f), "valor": cstr(doc.get(f))}
			for f in PROPIEDADES
			if meta.get_field(f) and doc.get(f) not in (None, "", 0)
		]
	if tipo == "servidor":
		out["motor_activo"] = motor_activo()
		out["nota"] = None if out["motor_activo"] else _(MOTOR_APAGADO)
	return out


def _no_campos(tipo):
	if tipo == "campos":
		frappe.throw(
			_(
				"Los campos no se apagan ni se editan aquí: ocultarlo no quita sus datos ni lo que los usa. Ábrelo en el escritorio si hace falta."
			),
			frappe.ValidationError,
		)


def _al_dia(doc, modificado):
	if modificado and cstr(doc.modified) != cstr(modificado):
		frappe.throw(
			_("Alguien cambió este script mientras lo veías. Ábrelo de nuevo para ver sus cambios."),
			frappe.TimestampMismatchError,
		)


@frappe.whitelist(methods=["POST"])
def activar(tipo: str, name: str, activo: int | str | bool, modificado: str | None = None):
	"""Turn a Server or Client Script on or off (the UI confirms first)."""
	_no_campos(tipo)
	doctype = _doctype(tipo, "write")
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("write")
	_al_dia(doc, modificado)
	on = activo in (True, 1, "1", "true", "True")
	if tipo == "servidor":
		doc.disabled = 0 if on else 1
	else:
		doc.enabled = 1 if on else 0
	doc.save(ignore_version=False)  # the history is the feature; Frappe skips it under tests
	return ver(tipo, name)


@frappe.whitelist(methods=["POST"])
def guardar(tipo: str, name: str, codigo: str, modificado: str | None = None):
	"""Save new code (Frappe validates it and keeps the previous version)."""
	_no_campos(tipo)
	doctype = _doctype(tipo, "write")
	codigo = cstr(codigo)
	if len(codigo) > MAX_CODE:
		frappe.throw(_("El código es demasiado largo."), frappe.ValidationError)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("write")
	_al_dia(doc, modificado)
	if cstr(doc.script) == codigo:
		return ver(tipo, name)
	doc.script = codigo
	doc.save(ignore_version=False)  # the history is the feature; Frappe skips it under tests
	return ver(tipo, name)


@frappe.whitelist(methods=["POST"])
def crear(tipo: str, datos: str | dict):
	"""A new Client Script for a doctype's form or list: empty and switched OFF, so nothing
	runs until the owner writes it and turns it on. Other kinds are created in the Desk."""
	if tipo != "cliente":
		_solo_dueno()
		frappe.throw(_("Aquí solo se crean scripts de cliente."), frappe.ValidationError)
	doctype = _doctype(tipo, "create")
	datos = frappe.parse_json(datos) if isinstance(datos, str) else (datos or {})
	dt = cstr(datos.get("doctype") or datos.get("dt")).strip()
	if not dt or not frappe.db.exists("DocType", dt):
		frappe.throw(_("Elige el tipo de documento."), frappe.ValidationError)
	view = "List" if datos.get("vista") in ("List", "lista") else "Form"
	base = " ".join(_NAME.sub(" ", cstr(datos.get("nombre"))).split())[:80]
	name = f"{dt}-{base}" if base else f"{dt}-{'lista' if view == 'List' else 'formulario'}"
	candidate, n = name, 2
	while frappe.db.exists(doctype, candidate):
		candidate, n = f"{name}-{n}", n + 1
	doc = frappe.get_doc(
		{"doctype": doctype, "__newname": candidate, "dt": dt, "view": view, "enabled": 0, "script": ""}
	)
	doc.insert()
	return ver(tipo, doc.name)
