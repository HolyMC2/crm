# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Ediciones masivas (Shell D12, goal 4): select rows in a documentos list, then change a
field, assign, tag, print or export them, with an undo.

Frappe permissions are the only wall: `opciones` offers what the worker's role allows on the
doctype, `aplicar` checks every document again as the caller and reports the refused ones in
words. Every change is logged as D9 action lines (`{doctype, name, label, receipt, undo}`) so
«Deshacer» restores them newest first: in doco's «Asistente Accion» log when D9 exposes
`acciones.registrar`, else in the cache for 24 hours (same line format, so the switch is
trivial). Undo kinds written here: `set`, `unassign`, `unshare`, `pasos` and `untag`; a batch
goes to the cache only when the installed doco lacks one of its kinds (acciones.UNDO_KINDS).
"""

import json
import secrets
from collections import Counter
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, strip_html

from crm.api import documentos as docs

MAX_DOCS = 100
MAX_USERS = 5
MAX_TAGS = 5
MAX_TAG_LEN = 40
CACHE_TTL = 24 * 3600
TOKEN_PREFIX = "masivo-"
ACTION_LOG = "Asistente Accion"
ACCIONES = ("campo", "asignar", "etiquetar")
# The simple field types «Cambiar campo» offers (AjustesControl has a control for each).
CAMPO_TYPES = {"Select", "Link", "Data", "Check", "Date", "Int", "Float", "Currency"}
# Beyond documentos' own skip list: fields whose change re-prices or re-books a document.
_CAMPO_SKIP = {
	"company",
	"currency",
	"selling_price_list",
	"buying_price_list",
	"price_list_currency",
	"party_account_currency",
	"taxes_and_charges",
	"tax_category",
	"shipping_rule",
	"apply_discount_on",
	"debit_to",
	"credit_to",
	"docstatus",
	# the party: a different customer or supplier is a different document
	"customer",
	"supplier",
	"party",
	"party_type",
	"party_name",
	"quotation_to",
	# a payment's accounts, amounts and direction
	"payment_type",
	"paid_from",
	"paid_to",
	"paid_amount",
	"received_amount",
	"source_exchange_rate",
	"target_exchange_rate",
	# addresses and the subscription period: per document, never «all the same»
	"customer_address",
	"shipping_address_name",
	"dispatch_address_name",
	"company_address",
	"from_date",
	"to_date",
	"auto_repeat",
	"group_same_items",
}
# D9's undo kinds before `untag` (doco dd0428f adds it); the live list is acciones.UNDO_KINDS.
_D9_KINDS_DEFAULT = ("set", "delete", "unassign", "unshare", "pasos", "explain")


class Rechazo(Exception):
	"""One document is left as it was; the message is the worker's sentence."""


# ── Options ───────────────────────────────────────────────────────────────────


def _a_la_vista(df):
	"""A field a worker knows from the list or the form's top (not an accounting knob):
	in the list or its filters, bold, bulk-editable, changeable after confirming, or a date."""
	if df.in_list_view or df.in_standard_filter or df.get("allow_bulk_edit") or df.allow_on_submit:
		return True
	if df.fieldtype == "Check":
		return False
	return bool(df.bold or df.fieldtype == "Date" or df.reqd)


def campos_editables(meta):
	"""The simple fields a worker may set on many documents at once: writable at
	permlevel 0, not hidden, read-only, fetched, unique or set-once, and in sight
	(`_a_la_vista`)."""
	out = []
	for df in meta.fields:
		if df.fieldtype not in CAMPO_TYPES or not _a_la_vista(df):
			continue
		if df.hidden or df.read_only or cint(df.permlevel) or df.fetch_from:
			continue
		if df.get("is_virtual") or df.unique or df.get("set_only_once"):
			continue
		name = df.fieldname
		if name in docs._EDIT_SKIP or name in _CAMPO_SKIP or name.startswith(docs._DATOS_PREFIXES):
			continue
		if name.startswith("_") or (name == "title" and not df.reqd):
			continue
		row = {
			"fieldname": name,
			"label": _(df.label) if df.label else name,
			"fieldtype": df.fieldtype,
			"reqd": cint(df.reqd),
			# A confirmed document keeps this field: only drafts change.
			"solo_borrador": bool(meta.is_submittable and not df.allow_on_submit),
		}
		if df.fieldtype == "Select":
			row["options"] = docs._select_options(df)
		elif df.fieldtype == "Link":
			row["link"] = df.options
		elif df.fieldtype == "Currency":
			row["currency"] = df.options or None
		out.append(row)
	return out


def _etiquetas_usadas(doctype, limit=20):
	"""The tags this doctype already uses, most used first (suggestions for «Etiquetar»)."""
	if not frappe.db.exists("DocType", "Tag Link"):
		return []
	tags = frappe.get_all("Tag Link", filters={"document_type": doctype}, pluck="tag", limit=500)
	return [tag for tag, _n in Counter(t for t in tags if t).most_common(limit)]


@frappe.whitelist()
def opciones(doctype: str):
	"""What the worker may do to many `doctype` documents at once, by their own role."""
	meta = docs._require(doctype)
	acciones = []
	can_write = bool(frappe.has_permission(doctype, "write"))  # nosemgrep: unchecked-frappe-permission-call
	if can_write:
		campos = campos_editables(meta)
		if campos:
			acciones.append({"clave": "campo", "etiqueta": _("Cambiar campo"), "campos": campos})
	if frappe.has_permission(doctype, "read"):
		acciones.append({"clave": "asignar", "etiqueta": _("Asignar")})
	if can_write:
		acciones.append(
			{"clave": "etiquetar", "etiqueta": _("Etiquetar"), "sugeridas": _etiquetas_usadas(doctype)}
		)
	if frappe.has_permission(doctype, "print"):
		acciones.append(
			{"clave": "imprimir", "etiqueta": _("Imprimir"), "formatos": docs.print_formats(doctype)}
		)
	if frappe.has_permission(doctype, "export"):
		acciones.append({"clave": "exportar", "etiqueta": _("Exportar a Excel")})
	return {
		"doctype": doctype,
		"etiqueta": _(doctype),
		"max": MAX_DOCS,
		"acciones": acciones,
		"deshacer_horas": CACHE_TTL // 3600,
	}


# ── Input ─────────────────────────────────────────────────────────────────────


def _nombres(nombres):
	names = frappe.parse_json(nombres) if isinstance(nombres, str) else nombres
	if isinstance(names, str):
		names = [names]
	if not isinstance(names, list | tuple):
		frappe.throw(_("Elige al menos un documento."), frappe.ValidationError)
	out = list(dict.fromkeys(cstr(n).strip() for n in names if cstr(n).strip()))
	if not out:
		frappe.throw(_("Elige al menos un documento."), frappe.ValidationError)
	if len(out) > MAX_DOCS:
		frappe.throw(
			_("Puedes cambiar hasta {0} documentos a la vez; elige menos.").format(MAX_DOCS),
			frappe.ValidationError,
		)
	return out


def _datos(datos):
	value = frappe.parse_json(datos) if isinstance(datos, str) else datos
	return value if isinstance(value, dict) else {}


def _plain(value):
	"""A JSON-safe copy of a field value (dates as their server text)."""
	if isinstance(value, datetime | date | time | timedelta):
		return cstr(value)
	if isinstance(value, Decimal):
		return float(value)
	return value


def valor_campo(df, value):
	"""The worker's value as the field stores it; a Spanish error when it cannot be."""
	empty = value is None or (isinstance(value, str) and not value.strip())
	if df.fieldtype == "Check":
		return 1 if value in (True, 1, "1", "true", "True") else 0
	if empty:
		if df.reqd:
			frappe.throw(_("«{0}» no puede quedar vacío.").format(_(df.label or df.fieldname)))
		return None if df.fieldtype in ("Date", "Link", "Int", "Float", "Currency") else ""
	if df.fieldtype == "Int":
		return cint(value)
	if df.fieldtype in ("Float", "Currency"):
		return flt(value)
	if df.fieldtype == "Date":
		try:
			return cstr(getdate(value))
		except Exception:
			frappe.throw(_("Esa fecha no se entiende; elígela en el calendario."))
	value = cstr(value).strip()
	if df.fieldtype == "Select":
		options = [o for o in cstr(df.options).split("\n") if o.strip()]
		if value not in options:
			frappe.throw(_("Elige una de las opciones de «{0}».").format(_(df.label or df.fieldname)))
	elif df.fieldtype == "Link":
		if not df.options or not frappe.db.exists(df.options, value):
			frappe.throw(_("No encontré «{0}»; elígelo de la lista.").format(value))
	elif df.fieldtype == "Data":
		value = value[: cint(df.length) or 140]
	return value


def _usuarios(datos):
	wanted = datos.get("usuarios") or ([datos["usuario"]] if datos.get("usuario") else [])
	users = list(dict.fromkeys(cstr(u).strip() for u in wanted if cstr(u).strip()))[:MAX_USERS]
	if not users:
		frappe.throw(_("Elige a quién asignar."), frappe.ValidationError)
	for user in users:
		row = frappe.db.get_value("User", user, ["enabled", "user_type"], as_dict=True)
		if not row or not row.enabled or row.user_type != "System User" or user in ("Guest",):
			frappe.throw(_("Esa persona no está en tu equipo."), frappe.ValidationError)
	return users


def _etiquetas(datos):
	wanted = datos.get("etiquetas") or ([datos["etiqueta"]] if datos.get("etiqueta") else [])
	out = []
	for tag in wanted:
		tag = " ".join(cstr(tag).replace(",", " ").split())[:MAX_TAG_LEN]
		if tag and tag.lower() not in {t.lower() for t in out}:
			out.append(tag)
	if not out:
		frappe.throw(_("Escribe la etiqueta."), frappe.ValidationError)
	return out[:MAX_TAGS]


def _titulos(meta, names):
	"""name → the document's title in words (party or name field), the ID when it has none
	or the worker cannot read it (get_list: their own permissions)."""
	display = docs._display(meta)
	fields = [f for f in display["title"] if meta.has_field(f)]
	out = {n: n for n in names}
	if fields:
		for row in frappe.get_list(
			meta.name, filters={"name": ["in", names]}, fields=["name", *fields], limit_page_length=len(names)
		):
			title = next((cstr(row.get(f)).strip() for f in fields if cstr(row.get(f)).strip()), "")
			if title:
				out[row.name] = title
	return out


def _why(error):
	if isinstance(error, frappe.PermissionError):
		return _("No tienes permiso para cambiar este documento.")
	if isinstance(error, frappe.DoesNotExistError):
		return _("Ya no existe.")
	if isinstance(error, frappe.TimestampMismatchError):
		return _("Alguien lo cambió al mismo tiempo; inténtalo de nuevo.")
	text = strip_html(cstr(error) or type(error).__name__)
	return " ".join(text.split())[:240] or _("No se pudo cambiar.")


# ── Per-document appliers: a list of action lines, [] when nothing changed ────


def _doc_para(doctype, name, ptype):
	doc = frappe.get_doc(doctype, name)
	if not frappe.has_permission(doctype, ptype, doc=doc):
		raise Rechazo(_("No tienes permiso para cambiar este documento."))
	return doc


def _same(before, after):
	if before in (None, "") and after in (None, ""):
		return True
	return cstr(_plain(before)) == cstr(_plain(after)) or (
		isinstance(after, int | float) and not isinstance(after, bool) and flt(before) == flt(after)
	)


def _campo(doctype, name, plan, label):
	df, value = plan["df"], plan["value"]
	doc = _doc_para(doctype, name, "write")
	docstatus = cint(doc.docstatus)
	if docstatus == 2:
		raise Rechazo(_("Está cancelado; ya no se cambia."))
	if docstatus == 1 and not df.allow_on_submit:
		raise Rechazo(_("Ya está confirmado; este campo solo cambia en borradores."))
	before = _plain(doc.get(df.fieldname))
	if _same(before, value):
		return []
	doc.set(df.fieldname, value)
	doc.save()
	return [
		{
			"doctype": doctype,
			"name": name,
			"label": label,
			"receipt": _("{0}: {1} → {2}").format(
				plan["label"], cstr(before) or _("vacío"), cstr(value) or _("vacío")
			),
			"undo": {
				"kind": "set",
				"doctype": doctype,
				"name": name,
				"before": {df.fieldname: before},
				"modified": cstr(doc.modified),
				"allow_submitted": docstatus == 1,
			},
		}
	]


def _shared(doctype, name, user):
	return bool(frappe.db.exists("DocShare", {"share_doctype": doctype, "share_name": name, "user": user}))


def _asignar(doctype, name, plan, label):
	from frappe.desk.form import assign_to

	doc = _doc_para(doctype, name, "read")
	nuevos = [
		u
		for u in plan["usuarios"]
		if not frappe.db.exists(
			"ToDo", {"reference_type": doctype, "reference_name": name, "allocated_to": u, "status": "Open"}
		)
	]
	if not nuevos:
		return []
	shared_before = {u for u in nuevos if _shared(doctype, name, u)}
	assign_to.add({"assign_to": nuevos, "doctype": doctype, "name": name})
	# only to offer the unshare step; Frappe's own unshare checks the right again
	can_share = bool(doc.has_permission("share"))
	lines = []
	for user in nuevos:
		step = {"kind": "unassign", "doctype": doctype, "name": name, "user": user}
		# Frappe shared the document with an assignee who could not read it; undo takes
		# that back too when the worker may manage shares (else the share stays).
		undo = step
		if can_share and user not in shared_before and _shared(doctype, name, user):
			undo = {
				"kind": "pasos",
				"pasos": [step, {"kind": "unshare", "doctype": doctype, "name": name, "user": user}],
			}
		lines.append(
			{
				"doctype": doctype,
				"name": name,
				"label": label,
				"receipt": _("Asignado a {0}").format(docs._person(user)),
				"undo": undo,
			}
		)
	return lines


def _etiquetar(doctype, name, plan, label):
	from frappe.desk.doctype.tag.tag import DocTags

	_doc_para(doctype, name, "write")
	tags = DocTags(doctype)
	current = {t.strip().lower() for t in tags.get_tags(name).split(",") if t.strip()}
	lines = []
	for tag in plan["etiquetas"]:
		if tag.lower() in current:
			continue
		tags.add(name, tag)
		lines.append(
			{
				"doctype": doctype,
				"name": name,
				"label": label,
				"receipt": _("Etiqueta «{0}»").format(tag),
				"undo": {"kind": "untag", "doctype": doctype, "name": name, "tag": tag},
			}
		)
	return lines


APPLIERS = {"campo": _campo, "asignar": _asignar, "etiquetar": _etiquetar}


def _plan(meta, accion, datos):
	"""Validate the action's data once, before touching any document."""
	if accion == "campo":
		fieldname = cstr(datos.get("campo") or datos.get("fieldname"))
		allowed = {row["fieldname"]: row for row in campos_editables(meta)}
		if fieldname not in allowed:
			frappe.throw(
				_("Ese campo no se puede cambiar en varios documentos a la vez."), frappe.ValidationError
			)
		df = meta.get_field(fieldname)
		return {"df": df, "label": allowed[fieldname]["label"], "value": valor_campo(df, datos.get("valor"))}
	if accion == "asignar":
		return {"usuarios": _usuarios(datos)}
	if accion == "etiquetar":
		return {"etiquetas": _etiquetas(datos)}
	frappe.throw(_("Esa acción no existe."), frappe.ValidationError)


def _titulo_accion(meta, accion, plan, count):
	"""The log's one line: «Asignar a Beto · 5 documentos (Factura de venta)»."""
	cuantos = (_("1 documento") if count == 1 else _("{0} documentos").format(count)) + f" ({_(meta.name)})"
	if accion == "campo":
		return _("Cambiar {0} · {1}").format(plan["label"], cuantos)
	if accion == "asignar":
		return _("Asignar a {0} · {1}").format(", ".join(docs._person(u) for u in plan["usuarios"]), cuantos)
	return _("Etiquetar con {0} · {1}").format(", ".join(plan["etiquetas"]), cuantos)


# ── Idempotency ───────────────────────────────────────────────────────────────


def _req_key(request_id):
	return f"crm:masivo:req:{cstr(request_id)[:80]}"


def _previo(request_id):
	if not request_id:
		return None
	stored = frappe.cache.get_value(_req_key(request_id), user=frappe.session.user)
	return json.loads(stored) if stored else None


def _recordar(request_id, result):
	if request_id:
		frappe.cache.set_value(
			_req_key(request_id),
			json.dumps(result, default=str),
			user=frappe.session.user,
			expires_in_sec=CACHE_TTL,
		)


@frappe.whitelist(methods=["POST"])
def aplicar(
	doctype: str,
	nombres: str | list,
	accion: str,
	datos: str | dict | None = None,
	request_id: str | None = None,
):
	"""Apply one action to up to MAX_DOCS documents as the caller, each in its own savepoint.

	→ {hechos, nombres, sin_cambio, rechazados: [{name, titulo, motivo}], deshacer, titulo}"""
	meta = docs._require(doctype)
	names = _nombres(nombres)
	previous = _previo(request_id)
	if previous:
		return previous
	if accion not in ACCIONES:
		frappe.throw(_("Esa acción no existe."), frappe.ValidationError)
	plan = _plan(meta, accion, _datos(datos))
	apply_one = APPLIERS[accion]
	titles = _titulos(meta, names)
	done, unchanged, refused, lines = [], [], [], []
	for index, name in enumerate(names):
		savepoint = f"masivo_{index}"
		frappe.db.savepoint(savepoint)
		try:
			doc_lines = apply_one(doctype, name, plan, titles.get(name) or name)
		except Exception as error:
			frappe.db.rollback(save_point=savepoint)
			motivo = cstr(error) if isinstance(error, Rechazo) else _why(error)
			refused.append({"name": name, "titulo": titles.get(name) or name, "motivo": motivo})
		else:
			if doc_lines:
				done.append(name)
				lines.extend(doc_lines)
			else:
				unchanged.append(name)
		finally:
			frappe.clear_messages()
	titulo = _titulo_accion(meta, accion, plan, len(done))
	token = _registrar(titulo, lines, request_id=request_id) if lines else None
	result = {
		"hechos": len(done),
		"nombres": done,
		"sin_cambio": unchanged,
		"rechazados": refused,
		"deshacer": token,
		"titulo": titulo,
	}
	_recordar(request_id, result)
	return result


# ── Undo log: D9's «Asistente Accion» when it is there, else the cache ────────


def _d9():
	"""doco's action log module when it is installed and exposes registrar + undo."""
	if not frappe.db.exists("DocType", ACTION_LOG):
		return None
	try:
		from doco.docoutils.assistant.herramientas import acciones
	except ImportError:
		return None
	if not (callable(getattr(acciones, "registrar", None)) and callable(getattr(acciones, "undo", None))):
		return None
	return acciones


def _kinds(undo):
	if undo.get("kind") == "pasos":
		return {"pasos", *(k for step in undo.get("pasos") or [] for k in _kinds(step))}
	return {undo.get("kind")}


def _cache_key(token):
	return f"crm:masivo:deshacer:{token}"


def _registrar(titulo, lineas, request_id=None):
	"""Log the lines → the undo token (an «Asistente Accion» name, or a cache token)."""
	acciones = _d9()
	if acciones:
		known = set(getattr(acciones, "UNDO_KINDS", _D9_KINDS_DEFAULT))
		if all(_kinds(line["undo"]) <= known for line in lineas):
			try:
				return acciones.registrar(
					titulo,
					lineas,
					herramienta="masivo",
					origin="shell",
					request_id=f"masivo:{request_id}" if request_id else None,
				)
			except Exception:
				frappe.log_error(title="masivo: acciones.registrar falló; deshacer queda en caché")
	token = TOKEN_PREFIX + secrets.token_hex(8)
	frappe.cache.set_value(
		_cache_key(token),
		json.dumps({"titulo": titulo, "usuario": frappe.session.user, "lineas": lineas}, default=str),
		user=frappe.session.user,
		expires_in_sec=CACHE_TTL,
	)
	return token


def deshacer_linea(undo):
	"""Revert one line as the caller (D9's `_undo_line` semantics, plus `untag`)."""
	kind = undo.get("kind")
	doctype, name = undo.get("doctype"), undo.get("name")
	if kind == "set":
		doc = frappe.get_doc(doctype, name)
		if not frappe.has_permission(doctype, "write", doc=doc):
			raise frappe.PermissionError
		if undo.get("modified") and cstr(doc.modified) != cstr(undo["modified"]):
			raise Rechazo(_("Alguien lo cambió después; revísalo a mano."))
		if cint(doc.docstatus) == 1 and not undo.get("allow_submitted"):
			raise Rechazo(_("Ya está confirmado; no se cambia de vuelta solo."))
		for field, value in (undo.get("before") or {}).items():
			doc.set(field, value)
		doc.save()
	elif kind == "unassign":
		from frappe.desk.form import assign_to

		assign_to.remove(doctype, name, undo["user"])
	elif kind == "unshare":
		from frappe.share import set_permission

		set_permission(doctype, name, undo["user"], "read", 0)
	elif kind == "untag":
		from frappe.desk.doctype.tag.tag import DocTags

		if not frappe.has_permission(doctype, "write", doc=name):
			raise frappe.PermissionError
		DocTags(doctype).remove(name, undo["tag"])
	elif kind == "pasos":
		for step in undo.get("pasos") or []:
			deshacer_linea(step)
	else:
		raise Rechazo(_("Esto no se deshace solo."))


def _deshacer_cache(token):
	user = frappe.session.user
	stored = frappe.cache.get_value(_cache_key(token), user=user)
	data = json.loads(stored) if stored else None
	if not data or data.get("usuario") != user:
		frappe.throw(
			_("Ya no se puede deshacer: pasaron más de 24 horas o ya se deshizo."), frappe.ValidationError
		)
	lines = data.get("lineas") or []
	reverted, failed = set(), []
	for index in range(len(lines) - 1, -1, -1):
		line = lines[index]
		if line.get("deshecha"):
			continue
		savepoint = f"masivo_undo_{index}"
		frappe.db.savepoint(savepoint)
		try:
			deshacer_linea(line.get("undo") or {})
		except Exception as error:
			frappe.db.rollback(save_point=savepoint)
			motivo = cstr(error) if isinstance(error, Rechazo) else _why(error)
			failed.append({"name": line.get("name"), "titulo": line.get("label"), "motivo": motivo})
		else:
			line["deshecha"] = True
			reverted.add(line.get("name"))
		finally:
			frappe.clear_messages()
	if failed:
		frappe.cache.set_value(
			_cache_key(token), json.dumps(data, default=str), user=user, expires_in_sec=CACHE_TTL
		)
	else:
		frappe.cache.delete_value(_cache_key(token), user=user)
	return {"revertidos": len(reverted), "fallidos": failed}


def _deshacer_d9(acciones, token):
	"""acciones.undo_detalle (as the caller, its own savepoints and actor check) when doco has
	it; else acciones.undo, counted from the log's lines before and after (undo returns text).
	revertidos counts documents, fallidos lists each failed line in words."""

	def lines():
		return {
			line.get("n"): line
			for line in acciones.lines_of(frappe.get_doc(ACTION_LOG, token))
			if "n" in line
		}

	def doc_name(line):
		return (line.get("resultado") or {}).get("name") or line.get("label")

	before = lines()
	if callable(getattr(acciones, "undo_detalle", None)):
		answer = acciones.undo_detalle(token, frappe.session.user) or {}
		done = set(answer.get("done") or [])
		errors = {row.get("n"): row.get("error") for row in answer.get("failed") or []}
		texto = answer.get("recibo")
	else:
		texto = acciones.undo(token, frappe.session.user)
		after = lines()
		done = {
			n
			for n, line in after.items()
			if line.get("estado") == "deshecha" and (before.get(n) or {}).get("estado") != "deshecha"
		}
		errors = {
			n: line.get("undo_error")
			for n, line in after.items()
			if line.get("estado") == "aplicada" and line.get("undo_error")
		}
	reverted = {doc_name(before[n]) for n in done if n in before}
	failed = [
		{
			"name": (before.get(n) or {}).get("resultado", {}).get("name"),
			"titulo": (before.get(n) or {}).get("label"),
			"motivo": cstr(error),
		}
		for n, error in errors.items()
	]
	return {"revertidos": len(reverted), "fallidos": failed, "recibo": texto}


@frappe.whitelist(methods=["POST"])
def deshacer(token: str):
	"""Revert a bulk action newest-first, as the caller → {revertidos, fallidos: [{name, titulo, motivo}]}."""
	token = cstr(token).strip()
	if token.startswith(TOKEN_PREFIX):
		return _deshacer_cache(token)
	acciones = _d9()
	if acciones and token and frappe.db.exists(ACTION_LOG, token):
		return _deshacer_d9(acciones, token)
	frappe.throw(
		_("Ya no se puede deshacer: pasaron más de 24 horas o ya se deshizo."), frappe.ValidationError
	)


# ── Print and export (no writes) ──────────────────────────────────────────────


@frappe.whitelist(methods=["GET"])
def imprimir(doctype: str, nombres: str | list, formato: str | None = None, sin_membrete: int | str = 0):
	"""One PDF with every selected document the worker may print (Frappe's multi-PDF)."""
	from frappe.utils.print_format import download_multi_pdf

	meta = docs._require(doctype)
	names = _nombres(nombres)
	if not frappe.has_permission(doctype, "print"):
		docs._no_perm()
	formats = {row["name"] for row in docs.print_formats(doctype)}
	if formato and formato not in formats:
		frappe.throw(_("Ese formato no es de estos documentos."), frappe.ValidationError)
	allowed = [
		n
		for n in names
		if frappe.db.exists(doctype, n)
		and (frappe.has_permission(doctype, "print", doc=n) or frappe.has_permission(doctype, "read", doc=n))
	]
	if not allowed:
		docs._no_perm()
	download_multi_pdf(
		doctype,
		json.dumps(allowed),
		format=None if formato in (None, "", "Standard") else formato,
		no_letterhead=bool(cint(sin_membrete)),
	)
	frappe.local.response.filename = f"{_(meta.name)}.pdf"


def campos_exportar(meta):
	"""The export's columns: ID, the title, status, dates and amounts, then the list fields."""
	display = docs._display(meta)
	keys = ["name", *display["title"]]
	keys += [display[k] for k in ("status", "date", "due", "amount", "outstanding") if display.get(k)]
	keys += docs._list_fields(meta)
	return list(dict.fromkeys(k for k in keys if k))


@frappe.whitelist(methods=["GET"])
def exportar(doctype: str, nombres: str | list):
	"""The selected documents as Excel, through the list export (export permission, read fields)."""
	from crm.api.list_export import export_list

	meta = docs._require(doctype)
	names = _nombres(nombres)
	export_list(
		doctype,
		fields=json.dumps(campos_exportar(meta)),
		selected_items=json.dumps(names),
		file_format="Excel",
	)
