"""Impresión: print formats in the Muelle shell (Shell D12, SPEC §6 DD20 «PDF con Jinja»).

Frappe's own print engine, never a copy of it:

- `vista_previa` renders a record through `frappe.www.printview.get_html_and_style` as the
  caller (Frappe checks read/print), for the phone preview sheet (an iframe `srcdoc`).
- The owner screen (System Manager only): `formatos` lists the print formats per document
  type, `predeterminar` makes one the default the way Desk does (`make_default`, a Property
  Setter), `formato` opens one with its fields and a sample record, `probar` renders an
  unsaved Jinja template against a real record with printview's own context, `guardar`
  saves a custom format (Version history comes from `track_changes`), `duplicar` copies any
  format as a custom one and `versiones` lists its changes.

Standard formats are read-only here: they are edited by duplicating them. Print Designer
formats are previewed here and edited in Print Designer (desktop only).
"""

import difflib
import json
import re
import traceback
from urllib.parse import quote, urlencode

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_fullname

from crm.utils.doctypes import doctype_exists

MANAGER = "System Manager"
STANDARD = "Standard"
# The name an unsaved template renders under in `probar`; never saved.
PROBE = "__muelle_probar__"
LANG = "es-MX"
MAX_VERSIONS = 20
MAX_CHILD_FIELDS = 24

# Document types first on the owner screen (the rest follow by their Spanish name).
PRIORITY = (
	"Sales Invoice",
	"POS Invoice",
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Payment Entry",
	"Purchase Order",
	"Purchase Receipt",
	"Purchase Invoice",
	"Request for Quotation",
	"Supplier Quotation",
	"Material Request",
	"Stock Entry",
	"Repair Order",
	"Warranty Claim",
)

_LAYOUT = {
	"Section Break",
	"Column Break",
	"Tab Break",
	"HTML",
	"Button",
	"Fold",
	"Heading",
	"Image",
}
_NOT_PRINTED = _LAYOUT | {"Password", "Signature", "Geolocation", "Code", "JSON", "Table MultiSelect"}

# Version `changed` rows: Print Format fields in the owner's words.
_FIELD_WORDS = {
	"html": "el código",
	"css": "los estilos",
	"disabled": "si está apagado",
	"default_print_language": "el idioma",
	"font": "la letra",
	"font_size": "el tamaño de letra",
	"margin_top": "los márgenes",
	"margin_bottom": "los márgenes",
	"margin_left": "los márgenes",
	"margin_right": "los márgenes",
	"format_data": "el diseño",
	"print_designer_body": "el diseño",
	"print_designer_header": "el diseño",
	"print_designer_footer": "el diseño",
	"print_designer_settings": "el diseño",
	"doc_type": "el tipo de documento",
	"standard": "si es de fábrica",
}


# ── Guards ────────────────────────────────────────────────────────────────────


def _broken_message():
	return _("Este formato está dañado: no se pudo armar la vista previa.")


def is_broken(pf):
	"""Cheap check for a format printview cannot render: a Print Designer format saved without
	its design (`print_designer_settings` or `print_designer_body` empty)."""
	get = pf.get if hasattr(pf, "get") else lambda key, default=None: getattr(pf, key, default)
	return bool(cint(get("print_designer"))) and not (
		get("print_designer_settings") and get("print_designer_body")
	)


def _is_manager():
	return MANAGER in frappe.get_roles()


def _require_manager():
	if not _is_manager():
		frappe.throw(
			_("Solo el dueño (administrador del sistema) puede cambiar los formatos de impresión."),
			frappe.PermissionError,
		)


def _doctype_exists(doctype):
	return isinstance(doctype, str) and bool(doctype) and doctype_exists(doctype)


def _get_format(name):
	if not name or name == STANDARD or not frappe.db.exists("Print Format", name):
		frappe.throw(_("Ese formato de impresión ya no existe."), frappe.DoesNotExistError)
	return frappe.get_doc("Print Format", name)


def _has_pd_field():
	return frappe.get_meta("Print Format").has_field("print_designer")


# ── Kinds ─────────────────────────────────────────────────────────────────────


def kind_of(pf):
	"""How a format is built, as printview renders it: `pd` (Print Designer), `raw` (direct
	printer commands), `js` (the point of sale's browser template), `builder` (Desk's format
	builder), `jinja` (an HTML/Jinja template) or `standard` (Frappe's built-in layout)."""
	if not pf or pf == STANDARD:
		return "standard"
	get = pf.get if hasattr(pf, "get") else lambda key, default=None: getattr(pf, key, default)
	if cint(get("print_designer")):
		return "pd"
	if cint(get("raw_printing")):
		return "raw"
	if get("print_format_type") == "JS":
		return "js"
	if cint(get("print_format_builder_beta")):
		return "builder"
	if cint(get("custom_format")):
		return "jinja"
	if get("format_data") or cint(get("print_format_builder")):
		return "builder"
	if get("standard") == "Yes":
		return "jinja"
	return "builder"


def _default_of(doctype):
	return frappe.get_meta(doctype).default_print_format or STANDARD


def _desk_designer_url(name):
	"""The one desk link of this screen (Print Designer's editor), shown only at ≥1024px."""
	return "/desk/print-designer/" + quote(name, safe="")


def _pdf_url(doctype, name, formato, membrete, lang):
	params = {"doctype": doctype, "name": name, "language": lang}
	if formato and formato != STANDARD:
		params["format"] = formato
	if not cint(membrete):
		params["no_letterhead"] = 1
	return "/api/method/frappe.utils.print_format.download_pdf?" + urlencode(params)


def _lang(idioma):
	return LANG if idioma in (None, "", "es", "es-MX") else idioma


def _print_css():
	"""printview's own stylesheet (`print.bundle.css`), for the preview iframe."""
	try:
		from frappe.utils.jinja_globals import bundled_asset

		return bundled_asset("print.bundle.css")
	except Exception:
		return None


# ── Jinja errors in the owner's words ─────────────────────────────────────────


def _template_line(exc):
	"""The template line an exception points at: Jinja's own `lineno` for syntax errors, else
	the deepest traceback frame inside the template."""
	line = getattr(exc, "lineno", None)
	if line:
		return cint(line)
	found = None
	for frame in traceback.extract_tb(exc.__traceback__):
		if frame.filename in ("<template>", "<unknown>") or frame.filename.endswith(".html"):
			found = frame.lineno
	return found


def _plain(text):
	return re.sub(r"<[^>]+>", "", cstr(text)).strip()


def jinja_error(exc):
	"""A Spanish `{message, line}` for a failed render; never a traceback."""
	from jinja2 import TemplateSyntaxError, UndefinedError

	original = exc
	# printview's renderer re-raises as PrintFormatError; the Jinja error is its context.
	if isinstance(exc, frappe.PrintFormatError) and exc.__context__ is not None:
		original = exc.__context__
	line = _template_line(original)
	if not line:
		match = re.search(r"line (\d+)", cstr(exc))
		line = cint(match.group(1)) if match else None
	raw = _plain(getattr(original, "message", None) or str(original))
	missing = re.search(r"has no attribute '([^']+)'", raw) or re.search(r"'([^']+)' is undefined", raw)

	lowered = raw.lower()
	if isinstance(original, TemplateSyntaxError):
		if "unexpected end of template" in lowered:
			why = _("falta cerrar un bloque ({% endif %} o {% endfor %})")
		elif "encountered unknown tag" in lowered:
			tag = re.search(r"unknown tag '([^']+)'", raw)
			why = _("la etiqueta «{0}» no existe o le falta su inicio").format(tag.group(1) if tag else "")
		elif "no filter named" in lowered:
			name = re.search(r"named '([^']+)'", raw)
			why = _("el filtro «{0}» no existe").format(name.group(1) if name else "")
		else:
			why = _("hay un error de escritura ({0})").format(raw)
	elif isinstance(original, UndefinedError) and missing:
		why = _("«{0}» no existe en este documento").format(missing.group(1))
	elif isinstance(original, AttributeError | KeyError) and missing:
		why = _("«{0}» no existe en este documento").format(missing.group(1))
	elif isinstance(original, frappe.PermissionError):
		why = _("no tienes permiso para imprimir este documento")
	else:
		why = _("no se pudo mostrar ({0})").format(raw or original.__class__.__name__)

	message = _("Línea {0}: {1}.").format(line, why) if line else _("La plantilla falla: {0}.").format(why)
	return {"message": message, "line": line}


def _clear_messages():
	# A failed render leaves its message for the response; the screen shows ours instead.
	frappe.local.message_log = []


# ── Preview (any worker who may print the record) ─────────────────────────────


@frappe.whitelist()
def vista_previa(
	doctype: str,
	name: str,
	formato: str | None = None,
	membrete: int | str = 1,
	idioma: str | None = "es",
):
	"""The record rendered by printview in one format, as the caller: `{html, style, css,
	pdf_url, formato, kind}`. Frappe enforces read/print; a refused or failing render comes back
	as a Spanish sentence."""
	from frappe.translate import print_language
	from frappe.www.printview import get_html_and_style

	if not _doctype_exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."), frappe.DoesNotExistError)
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("Ese documento ya no existe."), frappe.DoesNotExistError)
	lang = _lang(idioma)
	used = formato or _default_of(doctype)
	if used != STANDARD and not frappe.db.exists("Print Format", used):
		if formato:
			frappe.throw(_("Ese formato de impresión ya no existe."), frappe.DoesNotExistError)
		used = STANDARD  # a default that was deleted: printview falls back the same way
	pf = frappe.get_cached_doc("Print Format", used) if used != STANDARD else None
	if pf is not None and cint(pf.disabled):
		frappe.throw(_("Ese formato está apagado; elige otro."), frappe.ValidationError)

	error = None
	try:
		with print_language(lang):
			out = get_html_and_style(
				doc=doctype,
				name=name,
				print_format=used,
				no_letterhead=0 if cint(membrete) else 1,
			)
	except frappe.PermissionError:
		_clear_messages()
		frappe.throw(_("No tienes permiso para imprimir este documento."), frappe.PermissionError)
	except Exception as exc:
		_clear_messages()
		out = {"html": None, "style": None}
		cause = jinja_error(exc)
		detalle = cause["message"]
		if kind_of(pf) == "pd":
			detalle = _("Le falta su diseño en Print Designer; ábrelo ahí y guárdalo.")
		error = {"message": _broken_message(), "detalle": detalle, "line": cause["line"]}
	if not error and out.get("html") is None:
		error = {
			"message": _broken_message(),
			"detalle": _("Este formato no tiene plantilla para mostrar."),
			"line": None,
		}

	return {
		"html": out.get("html"),
		"style": out.get("style"),
		"css": _print_css(),
		"error": error,
		"formato": used,
		"kind": kind_of(pf),
		"membrete": 1 if cint(membrete) else 0,
		"pdf_url": _pdf_url(doctype, name, used, membrete, lang),
	}


# ── Owner screen ──────────────────────────────────────────────────────────────


def _format_row(pf, default):
	kind = kind_of(pf)
	return {
		"name": pf.name,
		"label": _(pf.name),
		"kind": kind,
		"standard": pf.standard == "Yes",
		"disabled": bool(cint(pf.disabled)),
		"default": pf.name == default,
		"editable": kind == "jinja" and pf.standard != "Yes",
		"broken": is_broken(pf),
		"modified": cstr(pf.modified),
	}


def _standard_row(default):
	return {
		"name": STANDARD,
		"label": _("Estándar"),
		"kind": "standard",
		"standard": True,
		"disabled": False,
		"default": default == STANDARD,
		"editable": False,
		"broken": False,
		"modified": None,
	}


def _sort_key(group):
	doctype = group["doctype"]
	return (PRIORITY.index(doctype) if doctype in PRIORITY else len(PRIORITY), group["label"].lower())


@frappe.whitelist()
def formatos(doctype: str | None = None):
	"""Print formats per document type for the owner: `{groups: [{doctype, label, default,
	formats: [{name, label, kind, standard, disabled, default, editable}]}]}`. The default first,
	disabled ones last, Frappe's built-in «Estándar» at the end of each type."""
	_require_manager()
	fields = [
		"name",
		"doc_type",
		"standard",
		"disabled",
		"custom_format",
		"print_format_type",
		"print_format_builder",
		"print_format_builder_beta",
		"raw_printing",
		"format_data",
		"modified",
	]
	if _has_pd_field():
		fields += ["print_designer", "print_designer_settings", "print_designer_body"]
	filters = {"print_format_for": "DocType", "doc_type": ["is", "set"]}
	if doctype:
		filters["doc_type"] = doctype
	by_type = {}
	for pf in frappe.get_all("Print Format", filters=filters, fields=fields, order_by="name asc"):
		by_type.setdefault(pf.doc_type, []).append(pf)

	groups = []
	for dt, rows in by_type.items():
		if not _doctype_exists(dt) or not frappe.has_permission(dt, "print"):
			continue
		default = _default_of(dt)
		formats = [_format_row(pf, default) for pf in rows]
		formats.sort(key=lambda f: (not f["default"], f["disabled"], f["label"].lower()))
		formats.append(_standard_row(default))
		groups.append({"doctype": dt, "label": _(dt), "default": default, "formats": formats})
	groups.sort(key=_sort_key)
	return {"groups": groups}


@frappe.whitelist(methods=["POST"])
def predeterminar(doctype: str, formato: str):
	"""Make `formato` the default print format of `doctype`, as Desk's «Establecer como
	predeterminado» does (Print Format `make_default`: a Property Setter, or the DocType itself
	when it is custom). «Standard» puts Frappe's built-in layout back."""
	_require_manager()
	if not _doctype_exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."), frappe.DoesNotExistError)
	if formato == STANDARD:
		frappe.make_property_setter(
			{
				"doctype_or_field": "DocType",
				"doctype": doctype,
				"property": "default_print_format",
				"value": STANDARD,
			}
		)
	else:
		pf = _get_format(formato)
		if pf.doc_type != doctype:
			frappe.throw(_("Ese formato es de otro tipo de documento."), frappe.ValidationError)
		if cint(pf.disabled):
			frappe.throw(_("Ese formato está apagado; enciéndelo antes de usarlo."), frappe.ValidationError)
		from frappe.printing.doctype.print_format.print_format import make_default

		make_default(formato)
	_clear_messages()
	frappe.clear_cache(doctype=doctype)
	return {"doctype": doctype, "default": formato}


def _template_source(pf):
	"""The Jinja printview renders for this format: the app's file for standard formats,
	else the saved html (printview's `get_print_format`, without its disabled check)."""
	import os

	from frappe import get_module_path

	module = pf.module or frappe.db.get_value("DocType", pf.doc_type, "module")
	if module and not frappe.get_cached_value("Module Def", module, "custom"):
		try:
			path = os.path.join(
				get_module_path(module, "Print Format", pf.name), frappe.scrub(pf.name) + ".html"
			)
			if os.path.exists(path):
				with open(path) as handle:  # nosemgrep
					return handle.read()
		except Exception:
			pass
	return pf.html or ""


def etiqueta_campo(label, fieldname=""):
	"""A field's label in the owner's words, or None to leave it out of «Campos»: an English label
	nobody translated (custom fields of other apps: «Stamp Generation», «Original CFDI Document»)
	is not shown (Spanish sessions only); the owner can still write the field in the code."""
	from crm.api.automatizaciones import parece_ingles

	original = cstr(label or fieldname).strip()
	traducida = _(original)
	espanol = cstr(getattr(frappe.local, "lang", "")).startswith("es")
	if espanol and traducida == original and parece_ingles(original.replace("_", " ")):
		return None
	return traducida


def insertable_fields(doctype):
	"""Fields a template can print, in the owner's words: `[{fieldname, label, fieldtype,
	table?, children?}]`; child tables carry their own printable fields for a loop. Untranslated
	English labels are left out (`etiqueta_campo`)."""
	meta = frappe.get_meta(doctype)
	out = []
	for df in meta.fields:
		if df.fieldtype in _NOT_PRINTED or cint(df.hidden) or cint(df.permlevel) or cint(df.print_hide):
			continue
		label = etiqueta_campo(df.label, df.fieldname)
		if label is None:
			continue
		row = {"fieldname": df.fieldname, "label": label, "fieldtype": df.fieldtype}
		if df.fieldtype == "Table":
			child = frappe.get_meta(df.options)
			row["table"] = True
			row["children"] = [
				{
					"fieldname": c.fieldname,
					"label": etiqueta_campo(c.label, c.fieldname),
					"fieldtype": c.fieldtype,
				}
				for c in child.fields
				if c.fieldtype not in _NOT_PRINTED
				and c.fieldtype != "Table"
				and not cint(c.hidden)
				and not cint(c.permlevel)
				and not cint(c.print_hide)
				and etiqueta_campo(c.label, c.fieldname) is not None
			][:MAX_CHILD_FIELDS]
		out.append(row)
	return out


def _sample(doctype):
	"""The latest record of the type the user can read (submitted when the type submits)."""
	from crm.api.documentos import readable, rows

	if not readable(doctype):
		return None
	meta = frappe.get_meta(doctype)
	filters = [[doctype, "docstatus", "=", 1]] if meta.is_submittable else None
	page = rows(doctype, filters=filters, limit=1, order_by="modified desc")
	if not page["rows"]:
		return None
	row = page["rows"][0]
	return {"name": row["name"], "title": row["title"] or row["name"], "date": row.get("date")}


@frappe.whitelist()
def formato(name: str):
	"""One print format for the editor: its Jinja and CSS, kind, whether it is standard
	(read-only: «Duplicar» to edit) or Print Designer, the fields a template can insert and a
	sample record to preview against."""
	_require_manager()
	pf = _get_format(name)
	kind = kind_of(pf)
	default = _default_of(pf.doc_type) if _doctype_exists(pf.doc_type) else None
	return {
		"name": pf.name,
		"label": _(pf.name),
		"doc_type": pf.doc_type,
		"doctype_label": _(pf.doc_type) if pf.doc_type else "",
		"kind": kind,
		"standard": pf.standard == "Yes",
		"disabled": bool(cint(pf.disabled)),
		"print_designer": kind == "pd",
		"broken": is_broken(pf),
		"editable": kind == "jinja" and pf.standard != "Yes",
		"default": pf.name == default,
		"html": _template_source(pf) if kind == "jinja" else None,
		"css": pf.css or "",
		"modified": cstr(pf.modified),
		"fields": insertable_fields(pf.doc_type) if _doctype_exists(pf.doc_type) else [],
		"sample": _sample(pf.doc_type) if _doctype_exists(pf.doc_type) else None,
		"designer_url": _desk_designer_url(pf.name) if kind == "pd" else None,
	}


def _probe_format(doctype, html, css, base=None):
	"""An unsaved Print Format carrying the template, so printview renders it exactly as it
	would the saved one (same template path, context, hooks and styles)."""
	pf = frappe.new_doc("Print Format")
	if base is not None:
		for key in (
			"font",
			"font_size",
			"show_section_headings",
			"line_breaks",
			"align_labels_right",
			"absolute_value",
			"margin_top",
			"margin_bottom",
			"margin_left",
			"margin_right",
			"pdf_generator",
			"module",
		):
			pf.set(key, base.get(key))
	pf.update(
		{
			"doc_type": doctype,
			"print_format_for": "DocType",
			"standard": "No",
			"custom_format": 1,
			"print_format_type": "Jinja",
			"raw_printing": 0,
			"disabled": 0,
			"html": html or "",
			"css": css if css is not None else (base.css if base is not None else ""),
		}
	)
	if pf.meta.has_field("print_designer"):
		pf.print_designer = 0
	pf.name = PROBE
	return pf


@frappe.whitelist(methods=["POST"])
def probar(
	doctype: str,
	name: str,
	html: str,
	css: str | None = None,
	formato: str | None = None,
	membrete: int | str = 1,
	idioma: str | None = "es",
):
	"""Render an unsaved Jinja template against a real record exactly as printview would:
	`{html, style, css, error}`. A failing template returns `error: {message, line}` in Spanish."""
	from frappe.translate import print_language
	from frappe.www.printview import get_print_style, get_rendered_template, set_link_titles

	_require_manager()
	if not _doctype_exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."), frappe.DoesNotExistError)
	base = _get_format(formato) if formato and formato != STANDARD else None
	pf = _probe_format(doctype, html, css, base)
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("Ese documento ya no existe."), frappe.DoesNotExistError)
	rendered, error = None, None
	try:
		doc = frappe.get_doc(doctype, name, check_permission=True)
		set_link_titles(doc)
		with print_language(_lang(idioma)):
			rendered = get_rendered_template(
				doc=doc,
				print_format=pf,
				meta=doc.meta,
				no_letterhead=0 if cint(membrete) else 1,
			)
	except frappe.PermissionError:
		_clear_messages()
		frappe.throw(_("No tienes permiso para imprimir este documento."), frappe.PermissionError)
	except Exception as exc:
		_clear_messages()
		error = jinja_error(exc)
		error["detalle"] = error["message"]
	return {
		"html": rendered,
		"style": get_print_style(print_format=pf),
		"css": _print_css(),
		"error": error,
	}


def _syntax_check(html):
	from jinja2 import TemplateSyntaxError

	try:
		frappe.get_jenv().from_string(html or "")
	except TemplateSyntaxError as exc:
		frappe.throw(jinja_error(exc)["message"], frappe.ValidationError)


@frappe.whitelist(methods=["POST"])
def guardar(name: str, html: str, css: str | None = None, modified: str | None = None):
	"""Save a custom Jinja format's template (and CSS). Standard formats are refused (they are
	duplicated to edit), and so are Print Designer and builder formats. Version history is
	Frappe's own (`track_changes`)."""
	_require_manager()
	pf = _get_format(name)
	if pf.standard == "Yes":
		frappe.throw(_("Duplica el formato para editarlo."), frappe.ValidationError)
	kind = kind_of(pf)
	if kind == "pd":
		frappe.throw(_("Este formato se edita en Print Designer, en la computadora."), frappe.ValidationError)
	if kind != "jinja":
		frappe.throw(
			_("Este formato no es de código; duplícalo como plantilla para editarlo aquí."),
			frappe.ValidationError,
		)
	if modified and cstr(pf.modified) != cstr(modified):
		frappe.throw(
			_("Alguien más cambió este formato mientras lo editabas. Vuelve a abrirlo."),
			frappe.TimestampMismatchError,
		)
	_syntax_check(html)
	pf.html = html
	if css is not None:
		pf.css = css
	pf.save(ignore_version=False)  # the history is the feature; Frappe skips it under tests
	return {"name": pf.name, "modified": cstr(pf.modified)}


@frappe.whitelist(methods=["POST"])
def duplicar(name: str, nuevo_nombre: str):
	"""Copy any format as a custom, non-standard one the owner can edit. A standard Jinja
	format's template (kept in its app's file) is copied into the new one."""
	_require_manager()
	src = _get_format(name)
	nuevo = cstr(nuevo_nombre).strip()
	if not nuevo:
		frappe.throw(_("Escribe el nombre del formato nuevo."), frappe.ValidationError)
	if nuevo == STANDARD or frappe.db.exists("Print Format", nuevo):
		frappe.throw(_("Ya hay un formato con ese nombre."), frappe.DuplicateEntryError)
	kind = kind_of(src)
	new = frappe.copy_doc(src)
	new.name = nuevo
	new.standard = "No"
	new.disabled = 0
	if kind == "jinja":
		new.custom_format = 1
		new.html = _template_source(src)
	new.insert()
	return {"name": new.name, "kind": kind_of(new)}


def _line_counts(old, new):
	added = removed = 0
	for line in difflib.ndiff(cstr(old).splitlines(), cstr(new).splitlines()):
		if line.startswith("+ "):
			added += 1
		elif line.startswith("- "):
			removed += 1
	return added, removed


def version_summary(data):
	"""A short sentence for one Version row of a Print Format («Cambió el código (+3 -1
	líneas)», «Cambió los estilos y los márgenes»)."""
	try:
		data = json.loads(data) if isinstance(data, str) else (data or {})
	except ValueError:
		return _("Cambió el formato")
	parts, code = [], ""
	for row in data.get("changed") or []:
		if not row:
			continue
		field = row[0]
		if field == "html" and len(row) >= 3:
			added, removed = _line_counts(row[1], row[2])
			code = _("el código (+{0} −{1} líneas)").format(added, removed)
			continue
		word = _FIELD_WORDS.get(field)
		if word and word not in parts:
			parts.append(word)
	if code:
		parts.insert(0, code)
	if not parts:
		return _("Cambió el formato")
	if len(parts) == 1:
		return _("Cambió {0}").format(parts[0])
	return _("Cambió {0} y {1}").format(", ".join(parts[:-1]), parts[-1])


@frappe.whitelist()
def versiones(name: str):
	"""The format's change history (Frappe Version rows): who (full name), when, what."""
	_require_manager()
	pf = _get_format(name)
	rows = frappe.get_all(
		"Version",
		filters={"ref_doctype": "Print Format", "docname": pf.name},
		fields=["name", "owner", "creation", "data"],
		order_by="creation desc",
		limit=MAX_VERSIONS,
	)
	return [
		{
			"name": row.name,
			"who": get_fullname(row.owner),
			"when": cstr(row.creation),
			"summary": version_summary(row.data),
		}
		for row in rows
	]
