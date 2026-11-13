"""«Importar productos» and «Importar clientes» in Muelle's shell (/crm/productos/importar,
/crm/contactos/importar): a new shop loads the sheet it already has, on the phone or the desktop.

The screen runs doco's importer, the one the assistant uses (`doco.docoutils.importacion` over the
pure `doco.docoutils.tabular`): it reads the .xlsx, .xls or .csv, maps the columns, plans every row
(with the shop's catalog answers), writes each one as the person and keeps one «Importacion Tabla»
record that «Deshacer» takes back. Nothing here reads a sheet or writes a product: the review is
doco's `prepare.review` (rows per kind and coded facts) and the import is doco's `apply.confirm`,
the same confirmation the chat card runs; this module says them in the screen's words.

    opciones         who may import, the limits, the fields and the person's last imports
    plantilla        an .xlsx whose titles the column mapper reads, one per field
    revisar          the uploaded file as the screen shows it: columns, first rows, rows refused and
                     why; kept 12 hours for its owner as doco's preview (`vista`)
    filas_con_error  the refused rows of a review as an .xlsx with the reason, to fix and upload again
    importar         the review into Muelle: a few rows at once, more in doco's background job
    estado           how an import goes, and what it did once it ends
    deshacer         the import taken back through its assistant action (doco's «deshacer»)

Permissions are the person's: Item create imports products, Customer create imports customers, and
each row is written by them (doco checks it again on every write).
"""

from __future__ import annotations

import hashlib
import importlib
import io
import json
import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, get_datetime, now_datetime, strip_html

ENTIDADES = ("productos", "clientes")
WHAT = {"productos": "Item", "clientes": "Customer"}
PREVIEW_ROWS = 5
SAMPLES = 3
SHOWN_ERRORS = 100
SHOWN_SKIPPED = 20
SHOWN_NOTES = 6
SHOWN_FAILURES = 50
SHOWN_GROUPS = 8
RECENT = 3
MAX_OVERRIDES = 20
TOTAL_KEY = "crm:importar:total:{}"
CLAIM_KEY = "crm:importar:importando:{}"
# What each column of the template says when the owner points at its title.
HINTS = {
	"item_code": "Required. The code you know the product by. If your products have none, leave it empty and choose «My products have no code: use the name» when you upload the sheet.",
	"item_name": "Required. The name of the product as you sell it.",
	"barcode": "The barcode printed on the package.",
	"rate": "The price you sell it at.",
	"cost": "What it costs you. Stock is recorded only for products with a cost.",
	"qty": "How many you have now.",
	"uom": "Pieza, kilo, litro, caja… Empty takes your usual unit.",
	"iva": "16, 8, 0 or exento. Empty takes your usual taxes.",
	"item_group": "The group or category. A new one is created when you may create groups.",
	"customer_name": "Required. The customer's name or business name.",
	"tax_id": "The RFC, to invoice them.",
	"mobile_no": "Their phone or WhatsApp.",
	"email_id": "Their email.",
}
# doco's names the screen calls (doco's test_importacion `test_the_shells_seams_are_public` names
# the same ones): a doco without one of them has no import here yet.
SEAMS = (
	("doco.docoutils.importacion.apply", ("confirm", "queue", "JOB", "PreviewChanged", "NothingToWrite")),
	("doco.docoutils.importacion.prepare", ("plan_for", "to_write", "review")),
	("doco.docoutils.importacion.preview_store", ("save", "load")),
	("doco.docoutils.importacion.context", ("build",)),
	("doco.docoutils.importacion.validators", ("source_file", "on_existing", "MAX_BYTES")),
	("doco.docoutils.importacion.constants", ("DOCTYPE", "INLINE_ROWS", "JOB_TIMEOUT", "MAX_ROWS")),
	("doco.docoutils.importacion.queries", ("earlier_imports",)),
	("doco.docoutils.tabular.plan", ("CREATE", "UPDATE", "SKIP", "REFUSE", "ERROR", "NOTE", "EXISTS")),
	("doco.docoutils.tabular.reader", ("read_table", "UnreadableFile")),
	("doco.docoutils.tabular.schemas", ("ENTITIES",)),
	("doco.docoutils.tabular.summary", ("counts",)),
	("doco.docoutils.assistant.herramientas.acciones", ("undo_detalle",)),
)
# doco's reader refusals that speak as the assistant («No puedo leer…»), in the screen's words.
READER_REFUSALS = {
	"XLS_UNAVAILABLE": "Excel 97-2003 (.xls) files cannot be read right now. Save it as .xlsx or .csv and upload it again.",
	"XLSX_UNAVAILABLE": ".xlsx files cannot be read right now. Save it as .csv and upload it again.",
	"UNSUPPORTED": "This file cannot be read. Upload it as .xlsx, .xls or .csv.",
}
_QUOTED = re.compile(r"\b\d{6,}\b|«[^»]*»")


# ── doco's importer ──────────────────────────────────────────────────────────


def _modules() -> dict | None:
	"""{module path: module} of SEAMS, or None where doco's importer is not installed."""
	try:
		return {path: importlib.import_module(path) for path, _names in SEAMS}
	except ImportError:
		return None


def missing_seams() -> list[str] | None:
	"""The SEAMS this site's doco lacks (an older doco), or None where it has no importer at all."""
	modules = _modules()
	if modules is None:
		return None
	return [f"{path}.{name}" for path, names in SEAMS for name in names if not hasattr(modules[path], name)]


def _engine():
	"""doco's importer modules, or None where doco is missing or older than what the screen calls."""
	modules = _modules()
	if modules is None or missing_seams():
		return None
	short = {path.rsplit(".", 1)[-1]: module for path, module in modules.items()}
	return frappe._dict(
		acciones=short["acciones"],
		apply=short["apply"],
		constants=short["constants"],
		context=short["context"],
		prepare=short["prepare"],
		preview_store=short["preview_store"],
		queries=short["queries"],
		validators=short["validators"],
		plan=short["plan"],
		reader=short["reader"],
		schemas=short["schemas"],
		counts=short["summary"].counts,
	)


def _need():
	eng = _engine()
	if not eng:
		frappe.throw(_("Importing is not available on this site yet. Ask whoever runs Muelle to update it."))
	return eng


def _entity(que) -> str:
	key = str(que or "").strip().lower()
	if key not in ENTIDADES:
		frappe.throw(_("Choose what to import: products or customers."))
	return key


def _refusal(entity: str) -> str | None:
	"""Why the person may not import this kind, or None. The doctype's own create right decides."""
	if frappe.has_permission(WHAT[entity], "create"):
		return None
	if entity == "productos":
		return _("Your user cannot add products. Ask whoever runs Muelle for that permission.")
	return _("Your user cannot add customers. Ask whoever runs Muelle for that permission.")


def _allowed(entity: str) -> None:
	refusal = _refusal(entity)
	if refusal:
		frappe.throw(refusal, frappe.PermissionError)


def _catalog_pending() -> int:
	"""How many of Abordo's catalog questions (series, lots, unit…) are still open. They come before
	the first products, from the sheet too: once there are sales their answers cannot change."""
	if "abordo" not in frappe.get_installed_apps():
		return 0
	try:
		from abordo.guides.preflight import catalog_preflight
	except ImportError:
		return 0
	return len(catalog_preflight().get("pending_hard") or ())


def _catalog_gate(entity: str) -> None:
	"""Abordo's own refusal, the open questions in the owner's words, before products are read."""
	if entity == "productos" and _catalog_pending():
		from abordo.guides.preflight import require_catalog_preflight

		require_catalog_preflight()


def _sentence(error) -> str:
	return strip_html(str(error) or "")[:300]


def _company() -> str | None:
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if company and frappe.db.exists("Company", company):
		return company
	first = frappe.get_all("Company", pluck="name", order_by="creation asc", limit=1)
	return first[0] if first else None


# ── opciones and the template ────────────────────────────────────────────────


@frappe.whitelist()
def opciones(que: str) -> dict:
	"""The screen's start: whether it can import here, the limits, the fields and the last imports."""
	entity = _entity(que)
	eng = _engine()
	if not eng:
		return {
			"que": entity,
			"disponible": False,
			"puede": False,
			"motivo": _("Importing is not available on this site yet. Ask whoever runs Muelle to update it."),
		}
	refusal = _refusal(entity)
	schema = eng.schemas.ENTITIES[entity]
	return {
		"que": entity,
		"disponible": True,
		"puede": not refusal,
		"motivo": refusal,
		"limite_mb": int(eng.validators.MAX_BYTES // (1024 * 1024)),
		"limite_filas": int(eng.constants.MAX_ROWS),
		"campos": [
			{"campo": item.name, "etiqueta": item.label, "obligatorio": bool(item.required)}
			for item in schema.fields
		],
		"recientes": [] if refusal else _recientes(eng, entity),
		# Abordo's catalog questions still open: the screen asks them before the sheet.
		"preguntas": _catalog_pending() if entity == "productos" and not refusal else 0,
		# The other kind, where the person may import it too (a new shop loads both).
		"tambien": next((other for other in ENTIDADES if other != entity and not _refusal(other)), None),
	}


def _recientes(eng, entity: str) -> list[dict]:
	"""The person's own last imports of this kind (the record lists only what they confirmed)."""
	rows = frappe.get_all(
		eng.constants.DOCTYPE,
		filters={
			"confirmed_by": frappe.session.user,
			"tipo": eng.schemas.ENTITIES[entity].label.capitalize(),
		},
		fields=["name", "file_name", "status", "confirmed_on", "filas_creadas", "filas_actualizadas"],
		order_by="creation desc",
		limit=RECENT,
	)
	return [
		{
			"registro": row.name,
			"archivo": row.file_name or "",
			"estado": row.status,
			"cuando": str(row.confirmed_on or ""),
			"creadas": cint(row.filas_creadas),
			"actualizadas": cint(row.filas_actualizadas),
		}
		for row in rows
	]


@frappe.whitelist()
def plantilla(que: str) -> None:
	"""An .xlsx with one titled column per field, each title one the column mapper reads."""
	eng = _need()
	entity = _entity(que)
	_allowed(entity)
	from openpyxl import Workbook
	from openpyxl.comments import Comment
	from openpyxl.styles import Font
	from openpyxl.utils import get_column_letter

	schema = eng.schemas.ENTITIES[entity]
	book = Workbook()
	sheet = book.active
	sheet.title = schema.label.capitalize()
	sheet.append([item.label for item in schema.fields])
	for index, item in enumerate(schema.fields, start=1):
		cell = sheet.cell(row=1, column=index)
		cell.font = Font(bold=True)
		hint = HINTS.get(item.name)
		if hint:
			cell.comment = Comment(_(hint), "Muelle")
		sheet.column_dimensions[get_column_letter(index)].width = max(14, len(item.label) + 6)
	sheet.freeze_panes = "A2"
	_send_book(book, f"plantilla-{entity}.xlsx")


def _send_book(book, filename: str) -> None:
	buffer = io.BytesIO()
	book.save(buffer)
	frappe.local.response.filename = filename
	frappe.local.response.filecontent = buffer.getvalue()
	frappe.local.response.type = "binary"


# ── revisar ──────────────────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def revisar(archivo: str, que: str, columnas: str | None = None, existentes: str | None = None) -> dict:
	"""The uploaded sheet as the screen shows it, written nowhere. `columnas` is the owner's
	choice as JSON, {field: column index from 0}; `existentes` is «omitir» or «actualizar»."""
	eng = _need()
	entity = _entity(que)
	_allowed(entity)
	_catalog_gate(entity)
	user = frappe.session.user
	try:
		on_existing = eng.validators.on_existing(existentes)
		fdoc, content = eng.validators.source_file(archivo, user)
	except ValueError as error:
		frappe.throw(_sentence(error))
	overrides = _overrides(eng, entity, columnas)
	company = _company()
	try:
		ctx = eng.context.build(entity, company, user, on_existing=on_existing)
	except ValueError as error:
		frappe.throw(_sentence(error))
	plan = eng.prepare.plan_for(content, fdoc.file_name, entity, on_existing=on_existing, overrides=overrides)
	limit = int(eng.constants.MAX_ROWS)
	if not plan.blocked and len(plan.rows) > limit:
		frappe.throw(
			_("The sheet has {0} rows; up to {1} are imported at once. Split it into parts.").format(
				len(plan.rows), limit
			)
		)
	sha = hashlib.sha256(content).hexdigest()
	header, samples = _header(eng, content, fdoc.file_name, plan)
	to_write = eng.prepare.to_write(plan, ())
	refused = any(row.action == eng.plan.REFUSE for row in plan.rows)
	vista = None
	# Kept with rows to write, and with refused rows alone too: their download needs it.
	if not plan.blocked and (to_write or refused):
		vista = eng.preview_store.save(
			{
				"human": user,
				"company": company,
				"entity": entity,
				"on_existing": on_existing,
				"sheet": plan.sheet,
				"overrides": overrides,
				"dropped": [],
				"almacen": ctx.warehouse,
				"file_id": fdoc.name,
				"file_name": fdoc.file_name,
				"file_url": fdoc.file_url,
				"sha256": sha,
				"digest": plan.digest(),
				"blocked": plan.blocked,
				"counts": eng.counts(plan, ()),
			}
		)
	earlier = bool(eng.queries.earlier_imports(sha, entity))
	return _review(
		eng,
		plan,
		eng.prepare.review(plan, ctx),
		header,
		samples,
		to_write,
		vista=vista,
		earlier=earlier,
		archivo=fdoc,
		ctx=ctx,
	)


def _overrides(eng, entity: str, columnas) -> dict | None:
	"""The owner's column choices as the mapper's overrides, {field: column index}. One column per
	field, except a product's name standing in for its code («usar el nombre como código»)."""
	if columnas in (None, ""):
		return None
	wrong = _("The column choices did not arrive well. Choose them again.")
	try:
		data = json.loads(columnas)
	except ValueError:
		frappe.throw(wrong)
	if not isinstance(data, dict) or len(data) > MAX_OVERRIDES:
		frappe.throw(wrong)
	names = {item.name for item in eng.schemas.ENTITIES[entity].fields}
	out = {}
	for field, column in data.items():
		if field not in names or isinstance(column, bool) or not isinstance(column, int) or column < 0:
			frappe.throw(wrong)
		out[field] = column
	shared = Counter(out.values())
	name_as_code = (
		entity == "productos"
		and out.get("item_code") is not None
		and out.get("item_code") == out.get("item_name")
	)
	for column, times in shared.items():
		if times > 1 and not (name_as_code and times == 2 and column == out["item_code"]):
			frappe.throw(_("Each column goes to one field. Choose them again."))
	return out or None


def _header(eng, content: bytes, filename: str, plan) -> tuple[list, list[list]]:
	"""The plan's header cells and the first data rows under it, as the sheet has them."""
	if not plan.header_row:
		return [], []
	try:
		table = eng.reader.read_table(content, filename)
	except eng.reader.UnreadableFile:
		return [], []
	sheet = next((item for item in table.sheets if item.name == plan.sheet), None)
	if sheet is None or len(sheet.rows) < plan.header_row:
		return [], []
	header = list(sheet.rows[plan.header_row - 1])
	samples = []
	for row in sheet.rows[plan.header_row :]:
		if any(_texto(cell) for cell in row):
			samples.append(list(row))
		if len(samples) >= SAMPLES:
			break
	return header, samples


def _review(eng, plan, summary, header, samples, to_write, *, vista, earlier, archivo, ctx) -> dict:
	entity = eng.schemas.ENTITIES[plan.entity]
	mapped = plan.mapping.columns
	fields_at: dict[int, list[str]] = {}
	for name, column in mapped.items():
		fields_at.setdefault(column, []).append(name)
	width = len(header)
	columnas = []
	for index in range(width):
		title = _texto(header[index])
		shown = [_texto(row[index]) for row in samples if index < len(row)]
		if not title and not any(shown) and index not in fields_at:
			continue
		columnas.append(
			{
				"indice": index,
				"letra": _letter(index),
				"titulo": title,
				"campos": fields_at.get(index, []),
				"muestra": [value for value in shown if value],
			}
		)
	name_as_code = (
		plan.entity == "productos"
		and mapped.get("item_code") is not None
		and mapped.get("item_code") == mapped.get("item_name")
	)
	rows = plan.rows
	refused = [row for row in rows if row.action == eng.plan.REFUSE]
	skipped = [row for row in rows if row.action == eng.plan.SKIP]
	cuentas = summary["cuentas"]
	return {
		"vista": vista,
		"que": plan.entity,
		"archivo": archivo.file_name,
		"archivo_id": archivo.name,
		"hoja": plan.sheet,
		"encabezado": plan.header_row,
		"filas": len(rows),
		"columnas": columnas,
		"campos": [
			{
				"campo": item.name,
				"etiqueta": item.label,
				"obligatorio": bool(item.required),
				"columna": mapped.get(item.name),
			}
			for item in entity.fields
		],
		"dudas": [
			{"tipo": "ambigua", "columna": item["column"], "titulo": item["title"], "campos": item["fields"]}
			for item in plan.mapping.ambiguous
		]
		+ [
			{
				"tipo": "repetida",
				"campo": item["field"],
				"columnas": item["columns"],
				"titulos": item["titles"],
			}
			for item in plan.mapping.duplicates
		],
		"faltan": [item.name for item in entity.fields if item.required and item.name not in mapped],
		"nombre_como_codigo": name_as_code,
		# products refused for want of a code: the screen offers the name as the code
		"sin_codigo": cuentas["sin_codigo"],
		# A file that cannot be read at all, or a recognized export that cannot go in (a SICAR export
		# uploaded as the other kind, a tax rate it does not give); a missing column is `faltan`,
		# answered on the screen.
		"bloqueos": [_blocker(eng, text) for text in plan.blockers]
		if plan.header_row is None or getattr(plan, "source", None)
		else [],
		"cuentas": {
			"nuevas": cuentas["crear"],
			"actualizar": cuentas["actualizar"],
			"existentes": cuentas["existentes"],
			"repetidas": cuentas["repetidas"],
			"errores": cuentas["rechazar"],
		},
		"por_importar": len(to_write),
		"existentes": ctx.on_existing,
		"en_segundo_plano": bool(summary["segundo_plano"]),
		"moneda": _currency(ctx.company),
		"muestra": [
			{
				"fila": row.number,
				"accion": row.action,
				"valores": [
					{"campo": item.name, "valor": _plain(row.values.get(item.name))}
					for item in entity.fields
					if item.name in mapped and row.values.get(item.name) is not None
				],
			}
			for row in to_write[:PREVIEW_ROWS]
		],
		"errores": [
			{"fila": row.number, "motivo": _reasons(eng, row, eng.plan.ERROR)}
			for row in refused[:SHOWN_ERRORS]
		],
		"omitidas": [
			{"fila": row.number, "motivo": _reasons(eng, row, eng.plan.NOTE)}
			for row in skipped[:SHOWN_SKIPPED]
		],
		"notas": _row_notes(eng, to_write, name_as_code),
		"avisos": _source_note(plan)
		+ _sheet_notes(plan)
		+ [line for fact in summary["hechos"] if (line := _fact(fact, plan.entity))],
		"ya_importado": earlier,
	}


def _blocker(eng, text: str) -> str:
	"""Why the file cannot be read, in the screen's words where doco's are the assistant's."""
	for name, words in READER_REFUSALS.items():
		if text == getattr(eng.reader, name, None):
			return _(words)
	return text


def _reasons(eng, row, level: str) -> str:
	found = [issue.message for issue in row.issues if issue.level == level]
	return _capital("; ".join(found))


def _capital(text: str) -> str:
	"""doco's row messages are clauses of the assistant's sentences («falta nombre»); on the
	screen and in the download each one stands alone, so it starts with a capital."""
	text = str(text or "")
	return text[:1].upper() + text[1:]


def _generic(message: str) -> str:
	"""A note without the value it quotes, so the same note on many rows counts once."""
	return _capital(_QUOTED.sub("«…»", message))


def _row_notes(eng, rows, name_as_code: bool) -> list[dict]:
	"""What rows that do get imported carry (a cell read as empty, a code with spaces…), counted."""
	notes = Counter(
		_generic(issue.message)
		for row in rows
		for issue in row.issues
		if issue.level == eng.plan.NOTE
		and issue.code != eng.plan.EXISTS
		and not (name_as_code and issue.field == "item_code")
	)
	return [{"texto": text, "filas": count} for text, count in notes.most_common(SHOWN_NOTES)]


def _sheet_notes(plan) -> list[str]:
	"""Which sheet the rows come from and which were not read; the column questions are the
	screen's choosers, and how the file was read (encoding, separator) asks nothing of the owner."""
	if plan.header_row is None:
		return []
	notes = []
	if plan.other_sheets:
		notes.append(
			_("Rows from the sheet «{0}». The file has other sheets with data: {1}.").format(
				plan.sheet, ", ".join(f"«{name}»" for name in plan.other_sheets)
			)
		)
	if plan.hidden_sheets:
		notes.append(
			_("Hidden sheets are not read: {0}.").format(
				", ".join(f"«{name}»" for name in plan.hidden_sheets)
			)
		)
	if not plan.rows and not plan.blocked:
		notes.append(_("There are no rows of data under the titles."))
	return notes


def _fact(fact: dict, entity: str) -> str:
	"""One of doco's review facts (prepare.review) in the screen's words, or '' for none."""
	code = fact.get("codigo")
	if code == "reactivados":
		return _("{0} were turned off: they are turned on again with the data of the sheet.").format(
			fact["filas"]
		)
	if code == "grupos_nuevos":
		groups = fact.get("grupos") or []
		shown = ", ".join(f"«{name}»" for name in groups[:SHOWN_GROUPS])
		if len(groups) > SHOWN_GROUPS:
			shown = _("{0} and {1} more").format(shown, len(groups) - SHOWN_GROUPS)
		return _("New groups: {0}.").format(shown)
	if code == "sin_crear_grupos":
		return _("You cannot create product groups: {0} products go to «{1}».").format(
			fact["filas"], fact.get("grupo") or ""
		)
	if code == "unidad_inexistente":
		return _("The unit «{0}» does not exist in Muelle: {1} products take «{2}».").format(
			fact["unidad"], fact["filas"], fact.get("queda") or ""
		)
	if code == "codigos_ajenos":
		return _(
			"{0} barcodes already belong to another product: those products are added without them."
		).format(fact["filas"])
	if code == "precio_sin_guardar":
		return _("Selling prices are not saved ({0}); they stay pending in Productos.").format(
			fact.get("motivo") or ""
		)
	if code == "seguimiento":
		return _tracking(fact)
	if code == "existencia_sin_almacen":
		return _("Stock is not recorded: the shop has no default warehouse.")
	if code == "existencia_sin_permiso":
		return _("Stock is not recorded: your user cannot create the opening stock.")
	if code == "existencia_borrador":
		lines = []
		if fact.get("filas"):
			lines.append(
				_(
					"The stock of {0} products goes into a draft opening stock in «{1}» that you check and confirm in Inventario."
				).format(fact["filas"], _warehouse_label(fact.get("almacen")))
			)
		if fact.get("sin_costo"):
			lines.append(
				_("{0} products bring stock without a cost: that stock is not recorded.").format(
					fact["sin_costo"]
				)
			)
		return " ".join(lines)
	if str(code or "").startswith("sicar_"):
		return _sicar_fact(fact)
	if code == "actualiza":
		if entity == "productos":
			return _(
				"Those that already exist take the name, group and barcode of the sheet; price, cost, stock, unit and IVA stay as they are (prices change in Productos)."
			)
		return _(
			"Those that already exist take the name and RFC of the sheet; phone and email stay as they are."
		)
	return ""


def _source_note(plan) -> list[str]:
	"""The system a file came from, when doco recognized it (`Plan.source`, doco ≥ sicar-import)."""
	source = getattr(plan, "source", None) or {}
	if source.get("sistema") != "sicar":
		return []
	export = source.get("exportacion")
	if export == "articulos":
		return [_("This is SICAR's products export: its columns are read as SICAR writes them.")]
	if export == "clientes":
		return [_("This is SICAR's customers export: its columns are read as SICAR writes them.")]
	if export == "proveedores":
		return [_("This is SICAR's suppliers export: its columns are read as SICAR writes them.")]
	return []


def _sicar_fact(fact: dict) -> str:
	"""doco's `sicar_…` facts (tabular.sicar) in the screen's words, or '' for an unknown one."""
	code = fact.get("codigo")
	if code == "sicar_precios_mas_impuestos":
		taxes = [item for item in fact.get("impuestos") or [] if item.get("tasa") and item.get("productos")]
		added = ", ".join(
			_("{0} {1}% ({2} products)").format(
				item.get("impuesto") or "IVA", f"{item['tasa']:g}", item["productos"]
			)
			for item in taxes
		)
		lines = [
			_(
				"SICAR keeps prices without tax and Muelle keeps them with tax: the selling price is PRECIO 1 plus {0}."
			).format(added)
		]
		for item in fact.get("impuestos") or []:
			if item.get("origen") == "precios":
				lines.append(
					_(
						"The rate of {0} is not in the file: at {1}%, {2} of {3} prices land on a whole or half peso."
					).format(
						item.get("impuesto") or "IVA",
						f"{item['tasa']:g}",
						item.get("redondos"),
						item.get("probados"),
					)
				)
		return " ".join(lines)
	if code == "sicar_sin_impuesto":
		return _(
			"{0} products carry no IVA in SICAR: they take your company's IVA. Check them with your accountant."
		).format(fact.get("productos"))
	if code == "sicar_iva_doble":
		return _("{0} products have two IVA rates marked: the higher one is used.").format(
			fact.get("productos")
		)
	if code == "sicar_impuesto_sin_desglose":
		return _(
			"{0} {1}% ({2} products): the price includes it, but Muelle does not show it apart on the ticket or the invoice yet."
		).format(fact.get("impuesto"), f"{fact.get('tasa') or 0:g}", fact.get("productos"))
	if code == "sicar_otros_precios":
		parts = [
			_("{0} ({1} products)").format(label, fact[key])
			for key, label in (("precio_2", "PRECIO 2"), ("precio_3", "PRECIO 3"), ("precio_4", "PRECIO 4"))
			if fact.get(key)
		]
		if fact.get("mayoreo"):
			parts.append(_("wholesale prices ({0} products)").format(fact["mayoreo"]))
		return _("Not imported yet: {0}. Only PRECIO 1 becomes the selling price.").format(", ".join(parts))
	if code == "sicar_precios_raros":
		return _(
			"In {0} products a PRECIO 2, 3 or 4 looks like a code, not a price ({1}). Fix it in SICAR before those prices are imported."
		).format(fact.get("productos"), ", ".join((fact.get("claves") or [])[:5]))
	if code == "sicar_granel":
		return _(
			"{0} products are sold loose («a granel») in SICAR: they keep your usual unit. In Productos, change the unit of those sold by the kilo or the litre."
		).format(fact.get("productos"))
	if code == "sicar_claves_alternas":
		return _("{0} products have a CLAVE ALTERNA that is not added as a barcode ({1}).").format(
			fact.get("productos"), ", ".join((fact.get("claves") or [])[:5])
		)
	if code == "sicar_datos_sin_importar":
		parts = [
			label.format(fact[key])
			for key, label in (
				("representante", _("a contact person other than the name ({0})")),
				("alias", _("alias ({0})")),
				("domicilio", _("address ({0})")),
				("credito", _("credit limit and days ({0})")),
				("precio", _("a price level other than 1 ({0})")),
			)
			if fact.get(key)
		]
		lines = [_("Not imported yet: {0}.").format(", ".join(parts))] if parts else []
		if fact.get("correos"):
			lines.append(_("{0} have more than one email: the first one is used.").format(fact["correos"]))
		return " ".join(lines)
	return ""


def _tracking(fact: dict) -> str:
	"""The shop's answers on series and lots, said before the products are created."""
	if fact.get("serie") and fact.get("lote"):
		line = _(
			"The {0} new products are created with a serial number or IMEI and with lots and expiry dates, as you answered."
		)
	elif fact.get("serie"):
		line = _("The {0} new products are created with a serial number or IMEI, as you answered.")
	else:
		line = _("The {0} new products are created with lots and expiry dates, as you answered.")
	line = line.format(fact["filas"])
	if fact.get("con_existencia"):
		later = (
			_(
				"The stock of {0} of them is not loaded from the sheet: record it with each serial number in Inventario."
			)
			if fact.get("serie")
			else _(
				"The stock of {0} of them is not loaded from the sheet: record it with its lots in Inventario."
			)
		)
		line = f"{line} {later.format(fact['con_existencia'])}"
	return line


def _warehouse_label(name: str) -> str:
	"""The warehouse as the shop names it, without the company's abbreviation."""
	return frappe.db.get_value("Warehouse", name, "warehouse_name") or name


def _currency(company: str | None) -> str | None:
	return frappe.get_cached_value("Company", company, "default_currency") if company else None


def _letter(index: int) -> str:
	out = ""
	index += 1
	while index:
		index, rest = divmod(index - 1, 26)
		out = chr(ord("A") + rest) + out
	return out


def _texto(cell) -> str:
	"""A sheet cell as one short line of text."""
	if cell is None:
		return ""
	if isinstance(cell, datetime):
		return (
			cell.date().isoformat()
			if not (cell.hour or cell.minute)
			else cell.isoformat(sep=" ", timespec="minutes")
		)
	if isinstance(cell, date):
		return cell.isoformat()
	if isinstance(cell, float) and cell.is_integer():
		return str(int(cell))
	return " ".join(str(cell).split())[:80]


def _plain(value):
	if isinstance(value, Decimal):
		return float(value)
	return value


# ── filas_con_error ──────────────────────────────────────────────────────────


@frappe.whitelist()
def filas_con_error(vista: str) -> None:
	"""The refused rows of a review as an .xlsx: the sheet's own title row and cells, and a last
	column with why each row is not imported."""
	eng = _need()
	data = _preview(eng, vista)
	_allowed(data["entity"])
	fdoc, content = _source(eng, data["file_id"])
	plan = eng.prepare.plan_for(
		content,
		fdoc.file_name,
		data["entity"],
		sheet=data["sheet"],
		on_existing=data["on_existing"],
		overrides=data.get("overrides"),
	)
	refused = [row for row in plan.rows if row.action == eng.plan.REFUSE]
	if not plan.header_row or not refused:
		frappe.throw(_("This review has no rows with errors."))
	table = eng.reader.read_table(content, fdoc.file_name)
	sheet = next(item for item in table.sheets if item.name == plan.sheet)
	header = list(sheet.rows[plan.header_row - 1])
	from openpyxl import Workbook
	from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
	from openpyxl.styles import Font

	def clean(cell):
		return ILLEGAL_CHARACTERS_RE.sub("", cell) if isinstance(cell, str) else cell

	book = Workbook()
	out = book.active
	out.title = _("To fix")[:31]
	out.append([clean(cell) for cell in header] + [_("Why it is not imported")])
	for cell in out[1]:
		cell.font = Font(bold=True)
	for row in refused:
		cells = list(sheet.rows[row.number - 1])
		cells = (cells + [None] * len(header))[: len(header)]
		out.append([clean(cell) for cell in cells] + [_reasons(eng, row, eng.plan.ERROR)])
	out.freeze_panes = "A2"
	stem = (fdoc.file_name or "hoja").rsplit(".", 1)[0]
	_send_book(book, f"{frappe.scrub(stem)[:60] or 'hoja'}-errores.xlsx")


# ── importar ─────────────────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def importar(vista: str) -> dict:
	"""The reviewed rows into Muelle, as the person, through doco's own confirmation
	(apply.confirm): the file must be the one reviewed and the plan, built again now, the reviewed
	one. A few rows are written in this request; more go to doco's background job, which commits
	as it goes so «Deshacer» finds every row."""
	eng = _need()
	user = frappe.session.user
	data = _preview(eng, vista)
	_allowed(data["entity"])
	_catalog_gate(data["entity"])
	claim = frappe.cache.make_key(CLAIM_KEY.format(data["pid"]))
	# The claim is already site-prefixed by make_key; set_value has no nx, which the claim needs.
	# nosemgrep: frappe-cache-breaks-multitenancy
	if not frappe.cache.set(claim, 1, nx=True, ex=600):
		frappe.throw(_("This review is already being imported."))
	try:
		try:
			done = eng.apply.confirm(
				data, user, origin="shell", title=_("Import of «{0}»").format(data["file_name"])
			)
		except eng.apply.PreviewChanged as error:
			frappe.clear_messages()
			frappe.throw(_changed(error.why))
		except eng.apply.NothingToWrite:
			frappe.clear_messages()
			frappe.throw(_("Nothing to import: no row is new or to update."))
		frappe.cache.set_value(
			TOTAL_KEY.format(done.record.name),
			done.rows,
			expires_in_sec=int(eng.constants.JOB_TIMEOUT) + 3600,
		)
		if done.receipt is None:
			eng.apply.queue(done.record.name)
	except Exception:
		frappe.cache.delete(claim)
		raise
	return _estado(eng, done.record.name)


def _changed(why: str) -> str:
	"""Why a review can no longer be imported (doco's PreviewChanged.why), in the screen's words."""
	if why == "archivo":
		return _("The file changed since the review. Upload it again.")
	if why == "muelle":
		return _(
			"What Muelle has for these rows changed since the review (someone added or changed one). Review the file again."
		)
	return _("That review cannot be imported. Upload the file again.")


def _preview(eng, vista) -> dict:
	"""The review the person saved, or a sentence saying it is gone."""
	try:
		data = eng.preview_store.load(str(vista or "").strip())
	except frappe.ValidationError:
		frappe.clear_messages()
		frappe.throw(_("That review is gone (it lasts 12 hours). Upload the file again."))
	if data.get("human") != frappe.session.user:
		frappe.throw(_("That review is someone else's."), frappe.PermissionError)
	if data.get("entity") not in ENTIDADES or data.get("blocked"):
		frappe.throw(_("That review cannot be imported. Upload the file again."))
	return data


def _source(eng, file_id: str):
	try:
		return eng.validators.source_file(file_id, frappe.session.user)
	except ValueError as error:
		frappe.throw(_sentence(error))


# ── estado and deshacer ──────────────────────────────────────────────────────

_FIELDS = (
	"name",
	"tipo",
	"status",
	"file_name",
	"confirmed_by",
	"confirmed_on",
	"modified",
	"accion",
	"filas_creadas",
	"filas_actualizadas",
	"filas_omitidas",
	"filas_rechazadas",
	"filas_fallidas",
	"inventario_inicial",
	"resumen",
)


def _record(eng, registro) -> dict:
	"""The import's record, for the person who confirmed it or someone who may read imports."""
	name = str(registro or "").strip()
	row = frappe.db.get_value(eng.constants.DOCTYPE, name, list(_FIELDS), as_dict=True) if name else None
	if not row:
		frappe.throw(_("That import does not exist."), frappe.DoesNotExistError)
	if row.confirmed_by != frappe.session.user and not frappe.has_permission(
		eng.constants.DOCTYPE, "read", doc=name
	):
		frappe.throw(_("That import is someone else's."), frappe.PermissionError)
	return row


def _stuck(eng, row) -> bool:
	"""A background import «En curso» long after its job could run: it stopped without saying."""
	return row.status == "En curso" and get_datetime(row.modified) < add_to_date(
		now_datetime(), seconds=-int(eng.constants.JOB_TIMEOUT)
	)


@frappe.whitelist()
def estado(registro: str) -> dict:
	"""How the import goes; once it ends, what it created, what failed and whether it can be undone."""
	eng = _need()
	return _estado(eng, _record(eng, registro).name)


def _estado(eng, name: str) -> dict:
	row = frappe.db.get_value(eng.constants.DOCTYPE, name, list(_FIELDS), as_dict=True)
	total = frappe.cache.get_value(TOTAL_KEY.format(name))
	stuck = _stuck(eng, row)
	out = {
		"registro": row.name,
		"que": str(row.tipo or "").lower(),
		"archivo": row.file_name or "",
		"estado": row.status,
		"terminada": row.status != "En curso" or stuck,
		"detenida": stuck,
		"cuando": str(row.confirmed_on or ""),
		"total": cint(total) or None,
		"hechas": cint(row.filas_creadas) + cint(row.filas_actualizadas) + cint(row.filas_fallidas),
		"creadas": cint(row.filas_creadas),
		"actualizadas": cint(row.filas_actualizadas),
		"omitidas": cint(row.filas_omitidas),
		"rechazadas": cint(row.filas_rechazadas),
		"fallidas": cint(row.filas_fallidas),
	}
	if not out["terminada"]:
		return out
	record = frappe.db.get_value(eng.constants.DOCTYPE, name, ["cambios_json", "fallas_json"], as_dict=True)
	failures = _json(record.fallas_json, [])
	changes = _json(record.cambios_json, {})
	notes = Counter(
		_generic(note) for change in changes.get("filas") or [] for note in change.get("notas") or []
	)
	stock = row.inventario_inicial or (changes.get("inventario") if row.status != "Deshecho" else None)
	confirmed = bool(stock) and frappe.db.get_value("Stock Reconciliation", stock, "docstatus") == 1
	resumen = row.resumen or ""
	out.update(
		{
			"existencia": [] if row.status == "Deshecho" else _stock_lines(changes.get("inventario_nota")),
			"fallas": [
				{"fila": item.get("fila"), "motivo": _capital(item.get("motivo"))}
				for item in failures[:SHOWN_FAILURES]
				if isinstance(item, dict)
			],
			"notas": [{"texto": text, "filas": count} for text, count in notes.most_common(SHOWN_NOTES)],
			"inventario": {"documento": stock, "confirmado": confirmed}
			if stock and frappe.db.exists("Stock Reconciliation", stock)
			else None,
			"deshacible": bool(row.accion)
			and (row.status in ("Importado", "Parcial") or stuck)
			and not confirmed
			and bool(out["creadas"] + out["actualizadas"]),
			"por_que": resumen.removeprefix("Se detuvo:").strip() if resumen.startswith("Se detuvo:") else "",
			"deshecha": _undone_text(resumen, changes) if row.status == "Deshecho" else "",
		}
	)
	return out


def _stock_lines(outcome) -> list[str]:
	"""What happened to the sheet's stock besides the draft (doco's opening.draft facts, kept on the
	record), so an import that left the stock out says so instead of ending as if it were loaded."""
	if not isinstance(outcome, dict) or not outcome:
		return []
	reason = outcome.get("motivo")
	lines = []
	if reason == "sin_almacen":
		lines.append(_("The stock was not recorded: the shop has no default warehouse."))
	elif reason == "sin_permiso":
		lines.append(_("The stock was not recorded: your user cannot create the opening stock."))
	elif reason == "sin_costo":
		lines.append(_("The stock was not recorded: no product brought a cost."))
	elif reason == "sin_cuenta":
		lines.append(
			_(
				"The stock was not recorded: the company has no temporary opening account. Ask whoever keeps your books to set it."
			)
		)
	elif reason:
		lines.append(
			_("The stock was not recorded: {0}").format(outcome.get("detalle") or _("Muelle refused it."))
		)
	elif cint(outcome.get("sin_costo")):
		lines.append(
			_("{0} products brought stock without a cost: that stock was not recorded.").format(
				cint(outcome["sin_costo"])
			)
		)
	if cint(outcome.get("serie")):
		lines.append(
			_(
				"{0} products have a serial number: record their stock with each serial number in Inventario."
			).format(cint(outcome["serie"]))
		)
	if cint(outcome.get("lote")):
		lines.append(
			_("{0} products have lots: record their stock with its lots in Inventario.").format(
				cint(outcome["lote"])
			)
		)
	return lines


def _undone_text(resumen: str, changes: dict) -> str:
	"""doco's «Deshecha: …» line in the owner's words: the draft opening stock by what it is, never
	by its record name."""
	text = resumen.removeprefix("Deshecha:").strip()
	stock = changes.get("inventario")
	if stock:
		text = text.replace(f" {stock}", "")
	return _capital(text)


def _json(text, default):
	try:
		value = json.loads(text or "")
	except ValueError:
		return default
	return value if isinstance(value, type(default)) else default


@frappe.whitelist(methods=["POST"])
def deshacer(registro: str) -> dict:
	"""The import taken back, newest row first, as the person (doco's «deshacer» through the import's
	assistant action): what it created is deleted, or turned off when something already uses it,
	and what it changed gets back what it had."""
	eng = _need()
	row = _record(eng, registro)
	if row.status == "Deshecho":
		frappe.throw(_("This import was already undone."))
	if row.status == "En curso" and not _stuck(eng, row):
		frappe.throw(_("The import is still running. Wait for it to finish, then undo it."))
	if not row.accion:
		frappe.throw(_("This import cannot be undone from here."))
	if (
		row.inventario_inicial
		and frappe.db.get_value("Stock Reconciliation", row.inventario_inicial, "docstatus") == 1
	):
		frappe.throw(
			_(
				"The opening stock of this import is already confirmed. Cancel it in Inventario first, then undo the import."
			)
		)
	result = eng.acciones.undo_detalle(row.accion, frappe.session.user)
	after = _estado(eng, row.name)
	if after["estado"] != "Deshecho" and result.get("failed"):
		frappe.throw(_("It could not be undone: {0}").format(result["failed"][0].get("error") or ""))
	return after
