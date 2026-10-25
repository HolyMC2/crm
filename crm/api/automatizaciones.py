"""Automatizaciones nativas (Shell D12, SPEC §6 DD20): Frappe's own engines, in worker words.

* **Avisos del sistema** — Frappe `Notification`: list in words (cuándo · a quién · por
  dónde), turn on/off, and a new one built from pickers only. The condition is a field and a
  value turned into Notification `filters` (never Python from the client); the message is
  plain Spanish with «[Campo]» tokens that become Jinja only here, on save.
* **Reglas de asignación** — Frappe `Assignment Rule`: list in sentences, on/off, and a new
  one whose `assign_condition` is generated from a validated fieldname and an escaped literal.
* **Repetir** — Frappe `Auto Repeat`: the record's repetition, create and stop it as the
  caller, the «Repeticiones» list titled by the record's party, and the owner's switch that
  lets a doctype repeat (the `allow_auto_repeat` Property Setter Customize Form writes).
* **Aprobaciones** — Frappe `Workflow`: a provider for doco's Pendientes registry (hook
  `doco_approval_sources`, contract in `doco.pendientes.aprobaciones`) plus the record's
  transitions and `apply_workflow` as the caller.

Frappe permissions are the only wall. Owner-only screens check System Manager; every write is a
POST that runs as the caller; refusals carry a Spanish reason the shell shows.
"""

import ast
import json
import re
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_fullname, getdate, strip_html, today

MANAGER = "System Manager"
_FIELDNAME = re.compile(r"^[a-z_][a-z0-9_]{0,139}$")
_MACHINE_ID = re.compile(r"^(?=.*\d)[A-Za-z0-9]+[-_.][A-Za-z0-9_.-]{6,}$")
_TOKEN = re.compile(r"\[([^\[\]\n]{1,80})\]")
_JINJA_EXPR = re.compile(r"\{\{(.*?)\}\}", re.S)
_JINJA_BLOCK = re.compile(r"\{%.*?%\}|\{#.*?#\}", re.S)
_DOC_FIELD = re.compile(r"\bdoc\.([a-z_][a-z0-9_]*)")
MAX_TEXT = 2000
MAX_SUBJECT = 140
MAX_VALUE = 140
MAX_DAYS = 90
NO_ROLES = {"Guest", "All", "Administrator", "Desk User"}

# Doctypes whose workflow is a work queue with its own screen and rules: the generic provider
# and the record's bar leave them to their owner (doco Garantías asks a note on some actions).
PROPIOS = {"Warranty Claim": "Garantías"}

# The worker's noun for a doctype: (singular, gender, plural).
KINDS = {
	"Quotation": ("cotización", "f", "cotizaciones"),
	"Sales Order": ("pedido", "m", "pedidos"),
	"Delivery Note": ("entrega", "f", "entregas"),
	"Sales Invoice": ("factura", "f", "facturas"),
	"POS Invoice": ("ticket", "m", "tickets"),
	"Payment Entry": ("pago", "m", "pagos"),
	"Material Request": ("requisición", "f", "requisiciones"),
	"Request for Quotation": ("solicitud de cotización", "f", "solicitudes de cotización"),
	"Supplier Quotation": ("cotización de proveedor", "f", "cotizaciones de proveedor"),
	"Purchase Order": ("orden de compra", "f", "órdenes de compra"),
	"Purchase Receipt": ("recepción", "f", "recepciones"),
	"Purchase Invoice": ("factura de proveedor", "f", "facturas de proveedor"),
	"Journal Entry": ("póliza", "f", "pólizas"),
	"Stock Entry": ("movimiento de inventario", "m", "movimientos de inventario"),
	"Warranty Claim": ("garantía", "f", "garantías"),
	"Customer": ("cliente", "m", "clientes"),
	"Supplier": ("proveedor", "m", "proveedores"),
	"Item": ("producto", "m", "productos"),
	"Lead": ("prospecto", "m", "prospectos"),
	"CRM Lead": ("prospecto", "m", "prospectos"),
	"CRM Deal": ("trato", "m", "tratos"),
	"Opportunity": ("oportunidad", "f", "oportunidades"),
	"Issue": ("caso", "m", "casos"),
	"HD Ticket": ("caso", "m", "casos"),
	"Expense Claim": ("gasto de empleado", "m", "gastos de empleados"),
	"Leave Application": ("solicitud de ausencia", "f", "solicitudes de ausencia"),
	"Employee": ("empleado", "m", "empleados"),
	"Note": ("nota", "f", "notas"),
	"Project": ("proyecto", "m", "proyectos"),
	"Task": ("tarea", "f", "tareas"),
	"Contact": ("contacto", "m", "contactos"),
}

# Documents offered first in «Nuevo aviso» and «Nueva regla» (the rest by search).
PICKER_DOCTYPES = (
	"Sales Invoice",
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Payment Entry",
	"Material Request",
	"Purchase Order",
	"Purchase Receipt",
	"Purchase Invoice",
	"Warranty Claim",
	"CRM Lead",
	"CRM Deal",
	"Issue",
	"Customer",
	"Supplier",
	"Item",
)

EVENTS = ("New", "Submit", "Cancel", "Value Change", "Days Before", "Days After")
CHANNELS = {"Email": "Correo", "System Notification": "Aviso en Muelle", "SMS": "SMS", "Slack": "Slack"}
OFFERED_CHANNELS = ("System Notification", "Email")
RULE_MODES = {
	"Round Robin": "por turnos",
	"Load Balancing": "al que tenga menos pendientes",
	"Based on Field": "a la persona del campo",
	"Weighted Distribution": "según el peso de cada quien",
}
OFFERED_MODES = ("Round Robin", "Load Balancing", "Based on Field")
FREQUENCIES = {
	"Daily": "Cada día",
	"Weekly": "Cada semana",
	"Fortnightly": "Cada 15 días",
	"Monthly": "Cada mes",
	"Quarterly": "Cada 3 meses",
	"Half-yearly": "Cada 6 meses",
	"Yearly": "Cada año",
}
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
# Field types a simple «campo = valor» condition may use, and the ones a message may insert.
CONDITION_TYPES = {"Select", "Link", "Data", "Check", "Int", "Float", "Currency", "Percent"}
INSERT_TYPES = CONDITION_TYPES | {"Date", "Datetime", "Small Text", "Text", "Dynamic Link", "Read Only"}
FORMATTED = {"Date", "Datetime", "Currency", "Float", "Percent"}


# ── words ───────────────────────────────────────────────────────────────────


def _exists(doctype):
	return bool(doctype) and isinstance(doctype, str) and bool(frappe.db.exists("DocType", doctype))


def etiqueta(doctype):
	"""«Factura» for Sales Invoice; the translated doctype name otherwise."""
	known = KINDS.get(doctype)
	if known:
		return known[0][:1].upper() + known[0][1:]
	return _(doctype)


def con_articulo(doctype, indefinido=True):
	"""«una factura» / «la factura»; «un registro de X» when the doctype has no worker noun."""
	known = KINDS.get(doctype)
	if not known:
		return ("un registro de {0}" if indefinido else "el registro de {0}").format(_(doctype))
	noun, gender, _plural = known
	if indefinido:
		return ("una " if gender == "f" else "un ") + noun
	return ("la " if gender == "f" else "el ") + noun


def plural(doctype):
	"""«las facturas» / «los pedidos» / «los registros de X»."""
	known = KINDS.get(doctype)
	if not known:
		return "los registros de {0}".format(_(doctype))
	_noun, gender, many = known
	return ("las " if gender == "f" else "los ") + many


def lista_y(items):
	items = [cstr(i) for i in items if cstr(i)]
	if not items:
		return ""
	if len(items) == 1:
		return items[0]
	return ", ".join(items[:-1]) + " y " + items[-1]


def acciones_texto(labels):
	"""«Acciones: Aprobar · Rechazar» — each action its own word, never one «Aprobar y Rechazar»."""
	labels = [cstr(i) for i in labels if cstr(i)]
	return _("Acciones: {0}").format(" · ".join(labels)) if labels else ""


def _label(meta, fieldname):
	if fieldname == "name":
		return "Número"
	if fieldname == "owner":
		return "Quien lo creó"
	df = meta.get_field(fieldname) if meta else None
	return _(df.label) if df and df.label else fieldname.replace("_", " ").capitalize()


def minuscula(label):
	"""A field label inside a sentence: «Estado» → «estado»; acronyms stay («RFC», «UUID»)."""
	label = cstr(label)
	if len(label) > 1 and label[0].isupper() and label[1].islower():
		return label[0].lower() + label[1:]
	return label


def _fecha_de(label):
	low = label.lower()
	return "la " + low if low.startswith("fecha") else "la fecha «{0}»".format(label)


def frase_evento(event, doctype, label="", dias=0):
	"""The moment a Notification fires, in words («3 días antes de la fecha de vencimiento»)."""
	what = con_articulo(doctype)
	dias = cint(dias)
	if event == "New":
		return "Al crear {0}".format(what)
	if event == "Save":
		return "Cada vez que se guarda {0}".format(what)
	if event == "Submit":
		return "Al confirmar {0}".format(what)
	if event == "Cancel":
		return "Al cancelar {0}".format(what)
	if event in ("Days Before", "Days After"):
		fecha = _fecha_de(label or "Fecha")
		if not dias:
			return "El mismo día de {0}".format(fecha)
		unidad = "día" if dias == 1 else "días"
		lado = "antes" if event == "Days Before" else "después"
		return "{0} {1} {2} de {3}".format(dias, unidad, lado, fecha)
	if event in ("Minutes Before", "Minutes After"):
		lado = "antes" if event == "Minutes Before" else "después"
		return "{0} minutos {1} de {2}".format(dias, lado, _fecha_de(label or "Fecha"))
	if event == "Value Change":
		return "Cuando cambia {0}".format(minuscula(label) if label else "un campo")
	if event == "Method":
		return "Cuando el sistema lo indica"
	return "Con una regla a la medida"


# Standard ERPNext/HR Notifications keep English subjects («{{ doc.name }} has been received»).
_INGLES = frozenset(
	"has have been the is are was for new scheduled received notification notifications your you "
	"please reminder due submitted created updated cancelled approved rejected pending of to and "
	"with on at by from".split()
)
_ESPANOL = frozenset(
	"de del la las el los un una unos unas para por con que se es está están nuevo nueva su sus "
	"recordatorio aviso vence vencida factura pedido cuando ya lista listo pago cliente cita "
	"entrega pendiente hoy mañana".split()
)
_ACENTOS = re.compile(r"[áéíóúüñ¿¡«»]", re.I)


def parece_ingles(texto):
	"""True when a subject reads as English: its words (Jinja left out) lean English, or it has
	letters but neither Spanish characters nor a common Spanish word."""
	limpio = _JINJA_BLOCK.sub(" ", _JINJA_EXPR.sub(" ", cstr(texto))).lower()
	palabras = re.findall(r"[a-záéíóúüñ]+", limpio)
	if not palabras:
		return False
	ingles = sum(1 for w in palabras if w in _INGLES)
	espanol = sum(1 for w in palabras if w in _ESPANOL or _ACENTOS.search(w))
	if ingles:
		return ingles > espanol
	return not espanol and not _ACENTOS.search(limpio) and len(palabras) > 1


def solo_etiquetas(asunto):
	"""True for a subject that is a tag and a placeholder only («[Error] {{ doc.title }}»): no
	words of its own outside `[…]` and Jinja, so it says nothing as a title."""
	texto = cstr(asunto)
	if "[" not in texto:
		return False
	resto = re.sub(r"\[[^\]]*\]", " ", _JINJA_BLOCK.sub(" ", _JINJA_EXPR.sub(" ", texto)))
	return not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}", resto)


def asunto_legible(texto):
	"""Whether the owner's «Asunto:» line is worth showing: Spanish, no «…» left where a
	placeholder could not be put in words."""
	texto = cstr(texto).strip()
	return bool(texto) and "…" not in texto and not parece_ingles(texto)


def titulo_aviso(asunto, traducido, cuando):
	"""(title, original) for a Notification card: the subject when it reads in Spanish (or `_()`
	translated it); else the event sentence («Al confirmar un resultado de capacitación») as the
	title and the untranslated subject as `original` (shown to the owner only)."""
	asunto = cstr(asunto).strip()
	traducido = cstr(traducido).strip()
	if not asunto:
		return cuando, None
	if traducido and traducido != asunto:
		return traducido, None
	if solo_etiquetas(asunto):
		return cuando, None
	if parece_ingles(asunto):
		return cuando, asunto
	return asunto, None


def valor_en_palabras(df, value):
	if df is not None and df.fieldtype == "Check":
		return "sí" if cint(value) else "no"
	if df is not None and df.fieldtype == "Select":
		return _(cstr(value))
	return cstr(value)


def frase_condicion(meta, fieldname, value):
	df = meta.get_field(fieldname) if meta else None
	return "{0} es {1}".format(_label(meta, fieldname), valor_en_palabras(df, value))


def frase_regla(doctype, modo, usuarios=(), condicion="", campo=""):
	"""«Las garantías nuevas se reparten por turnos entre Ana y Beto»."""
	sujeto = plural(doctype)
	sujeto = sujeto[:1].upper() + sujeto[1:]
	cuando = " cuando {0}".format(condicion) if condicion else ""
	if modo == "Based on Field":
		return "{0}{1} se asignan a la persona de «{2}»".format(sujeto, cuando, campo or "un campo")
	como = RULE_MODES.get(modo, "")
	quienes = lista_y(usuarios)
	entre = " entre {0}".format(quienes) if quienes else ""
	return "{0}{1} se reparten {2}{3}".format(sujeto, cuando, como, entre)


def _person(user):
	if not user or user in ("Administrator", "Guest"):
		return "Sistema"
	name = get_fullname(user) or ""
	if not name or "@" in name:
		local = cstr(user).split("@")[0].replace(".", " ").replace("_", " ").strip()
		return local.title() if local else "Alguien"
	return name


def _texto_plantilla(meta, template):
	"""A Jinja subject or message as words: `{{ doc.employee }}` → «Empleado», blocks dropped."""
	text = _JINJA_BLOCK.sub("", cstr(template))

	def field(match):
		found = _DOC_FIELD.search(match.group(1))
		return _label(meta, found.group(1)) if found else "…"

	text = _JINJA_EXPR.sub(field, text)
	return re.sub(r"\s+", " ", strip_html(text)).strip()


# ── access ──────────────────────────────────────────────────────────────────


def es_dueno():
	return MANAGER in frappe.get_roles()


def _dueno_o_error():
	if not es_dueno():
		frappe.throw(_("Solo el dueño puede cambiar las automatizaciones."), frappe.PermissionError)


def _parse(value):
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except ValueError:
			frappe.throw(_("Los datos no se pudieron leer. Vuelve a intentarlo."))
	if not isinstance(value, dict):
		frappe.throw(_("Los datos no se pudieron leer. Vuelve a intentarlo."))
	return value


def _doctype_valido(doctype):
	if not _exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."))
	meta = frappe.get_meta(doctype)
	if meta.istable or meta.issingle or meta.is_virtual:
		frappe.throw(_("Ese tipo de documento no se puede usar aquí."))
	return meta


def _campo(meta, fieldname, tipos=None):
	"""A real field of the doctype (validated name and type), or a Spanish refusal."""
	if not isinstance(fieldname, str) or not _FIELDNAME.match(fieldname):
		frappe.throw(_("Elige un campo de la lista."))
	df = meta.get_field(fieldname)
	if not df or (tipos and df.fieldtype not in tipos):
		frappe.throw(_("Ese campo no existe en {0}.").format(plural(meta.name)))
	return df


def _valor(df, value):
	"""A condition value checked against its field: Select options, numbers, a real link."""
	text = cstr(value).strip()
	if len(text) > MAX_VALUE:
		frappe.throw(_("El valor es demasiado largo."))
	if df.fieldtype == "Check":
		if text not in ("0", "1"):
			frappe.throw(_("Elige sí o no."))
		return int(text)
	if df.fieldtype in ("Int",):
		try:
			return int(text)
		except ValueError:
			frappe.throw(_("Escribe un número entero."))
	if df.fieldtype in ("Float", "Currency", "Percent"):
		try:
			return float(text)
		except ValueError:
			frappe.throw(_("Escribe un número."))
	if not text:
		frappe.throw(_("Escribe el valor de la condición."))
	if df.fieldtype == "Select":
		options = [o for o in cstr(df.options).split("\n") if o]
		if text not in options:
			frappe.throw(_("Elige uno de los valores de la lista."))
	if df.fieldtype == "Link" and _exists(df.options) and not frappe.db.exists(df.options, text):
		frappe.throw(_("No encontramos «{0}».").format(text))
	return text


def condicion_python(fieldname, value):
	"""`status == "Open"` from a validated fieldname and a literal (Assignment Rule)."""
	if not _FIELDNAME.match(cstr(fieldname)):
		frappe.throw(_("Elige un campo de la lista."))
	if isinstance(value, bool) or not isinstance(value, int | float | str):
		frappe.throw(_("El valor no es válido."))
	literal = json.dumps(value, ensure_ascii=True) if isinstance(value, str) else repr(value)
	expression = "{0} == {1}".format(fieldname, literal)
	ast.parse(expression, mode="eval")  # a single comparison, nothing else
	return expression


def leer_condicion(expression):
	"""(fieldname, value) when `expression` is one of ours (`campo == literal`), else None."""
	match = re.match(r"^\s*([a-z_][a-z0-9_]*)\s*==\s*(.+?)\s*$", cstr(expression))
	if not match:
		return None
	try:
		value = ast.literal_eval(match.group(2))
	except (ValueError, SyntaxError):
		return None
	if not isinstance(value, int | float | str):
		return None
	return match.group(1), value


# ── avisos del sistema (Notification) ───────────────────────────────────────


def _a_quien(meta, notification, recipients):
	out = []
	for row in recipients:
		if row.receiver_by_role:
			out.append(_(row.receiver_by_role))
		field = cstr(row.receiver_by_document_field)
		if field == "owner":
			out.append("el dueño del documento")
		elif field:
			data_field, _sep, child = field.partition(",")
			if child:
				table = meta.get_field(child) if meta else None
				child_meta = frappe.get_meta(table.options) if table and _exists(table.options) else None
				out.append("{0} de cada fila".format(_label(child_meta, data_field).lower()))
			else:
				out.append(_label(meta, data_field).lower())
		if row.cc or row.bcc:
			out.append("otros correos")
	if notification.get("send_to_all_assignees"):
		out.append("las personas asignadas")
	seen = []
	for item in out:
		if item not in seen:
			seen.append(item)
	return seen


def _por_donde(notification):
	channel = CHANNELS.get(notification.channel, notification.channel or "")
	if notification.get("send_system_notification") and notification.channel != "System Notification":
		return "{0} y aviso en Muelle".format(channel)
	return channel


def _condicion_aviso(meta, notification):
	if notification.condition_type == "Filters" and notification.filters:
		try:
			filters = json.loads(notification.filters)
		except ValueError:
			return "solo con una condición"
		parts = []
		for f in filters if isinstance(filters, list) else []:
			if isinstance(f, list) and len(f) >= 3:
				field, op, value = (f[1], f[2], f[3]) if len(f) >= 4 else (f[0], f[1], f[2])
				if op in ("=", "=="):
					parts.append(frase_condicion(meta, field, value))
				else:
					parts.append("{0} {1} {2}".format(_label(meta, field), op, value))
		return "solo si " + " y ".join(parts) if parts else ""
	if notification.condition:
		return "solo cuando se cumple una condición del sistema"
	return ""


def _fila_aviso(notification, recipients=None):
	doctype = notification.document_type
	meta = frappe.get_meta(doctype) if _exists(doctype) else None
	if recipients is None:
		recipients = frappe.get_all(
			"Notification Recipient",
			filters={"parent": notification.name, "parenttype": "Notification"},
			fields=["receiver_by_document_field", "receiver_by_role", "cc", "bcc"],
		)
	label = ""
	if notification.event in ("Days Before", "Days After"):
		label = _label(meta, notification.date_changed) if notification.date_changed else ""
	elif notification.event in ("Minutes Before", "Minutes After"):
		label = _label(meta, notification.datetime_changed) if notification.get("datetime_changed") else ""
	elif notification.event == "Value Change" and notification.value_changed:
		label = _label(meta, notification.value_changed)
	dias = (
		notification.get("minutes_offset")
		if notification.event in ("Minutes Before", "Minutes After")
		else notification.days_in_advance
	)
	subject = notification.subject or notification.get("notification_title") or ""
	cuando = frase_evento(notification.event, doctype, label, dias)
	# An English subject `_()` leaves as is reads as the event sentence; the owner still sees
	# the subject (field names in words, never raw Jinja) on a second line.
	titulo, original = titulo_aviso(subject, _(subject) if subject else "", cuando)
	titulo = _texto_plantilla(meta, titulo) or cuando or notification.name
	original = _texto_plantilla(meta, original) if original and es_dueno() else None
	if original and (not asunto_legible(original) or parece_ingles(subject)):
		# «Asunto: Número has been received» says nothing; judge the raw subject too, since a
		# field label put in words («Número») would make English read as Spanish.
		original = None
	a_quien = _a_quien(meta, notification, recipients)
	return {
		"name": notification.name,
		"activo": bool(cint(notification.enabled)),
		"estandar": bool(cint(notification.is_standard)),
		"titulo": titulo[:MAX_SUBJECT],
		"asunto_original": original[:MAX_SUBJECT] if original else None,
		"cuando": cuando,
		"condicion": _condicion_aviso(meta, notification) if meta else "",
		"a_quien": lista_y(a_quien) or "Nadie todavía",
		"por_donde": _por_donde(notification),
		"documento": etiqueta(doctype) if meta else _(doctype or ""),
	}


@frappe.whitelist()
def avisos() -> dict:
	"""Every Notification in words, for Disparadores, «Avisos del sistema» (owner only)."""
	if not es_dueno():
		return {"manager": False, "motivo": _("Solo el dueño ve los avisos del sistema."), "avisos": []}
	rows = frappe.get_list(
		"Notification",
		fields=[
			"name",
			"enabled",
			"is_standard",
			"subject",
			"notification_title",
			"document_type",
			"event",
			"days_in_advance",
			"date_changed",
			"datetime_changed",
			"minutes_offset",
			"value_changed",
			"channel",
			"send_system_notification",
			"send_to_all_assignees",
			"condition",
			"condition_type",
			"filters",
		],
		order_by="enabled desc, modified desc",
		limit_page_length=200,
	)
	recipients = {}
	if rows:
		for row in frappe.get_all(
			"Notification Recipient",
			filters={"parenttype": "Notification", "parent": ["in", [r.name for r in rows]]},
			fields=["parent", "receiver_by_document_field", "receiver_by_role", "cc", "bcc"],
		):
			recipients.setdefault(row.parent, []).append(row)
	out = [_fila_aviso(row, recipients.get(row.name, [])) for row in rows if _exists(row.document_type)]
	return {"manager": True, "motivo": None, "avisos": out}


@frappe.whitelist(methods=["POST"])
def activar_aviso(name: str, activo: int | str | bool = 1) -> dict:
	"""Turn a Notification on or off. A standard one keeps its content: only `enabled` changes."""
	_dueno_o_error()
	doc = frappe.get_doc("Notification", cstr(name))
	doc.check_permission("write")
	value = 1 if cint(activo) else 0
	if doc.is_standard:
		# Frappe refuses saving an enabled standard Notification outside developer mode; the
		# switch is the one property the owner may change, so it is written alone.
		doc.db_set("enabled", value)
		from frappe.email.doctype.notification.notification import clear_notification_cache

		clear_notification_cache()
	else:
		doc.enabled = value
		doc.save()
	return _fila_aviso(frappe.get_doc("Notification", doc.name))


def _tipos(search=""):
	search = cstr(search).strip().lower()[:60]
	out = []
	names = list(PICKER_DOCTYPES)
	if search:
		found = frappe.get_all(
			"DocType",
			filters={"istable": 0, "issingle": 0, "is_virtual": 0, "name": ["like", f"%{search}%"]},
			pluck="name",
			limit=30,
		)
		names = [n for n in names if search in n.lower() or search in etiqueta(n).lower()] + [
			n for n in found if n not in names
		]
	for doctype in names:
		if not _exists(doctype):
			continue
		meta = frappe.get_meta(doctype)
		if meta.istable or meta.issingle or meta.is_virtual or not frappe.has_permission(doctype, "read"):
			continue
		out.append({"doctype": doctype, "label": etiqueta(doctype), "plural": plural(doctype)})
	return out[:40]


@frappe.whitelist()
def tipos(search: str = "") -> list:
	"""Documents to pick in «Nuevo aviso» / «Nueva regla» (owner only)."""
	_dueno_o_error()
	return _tipos(search)


def _roles():
	return [
		{"role": r, "label": _(r)}
		for r in frappe.get_all(
			"Role", filters={"disabled": 0, "desk_access": 1}, pluck="name", order_by="name asc"
		)
		if r not in NO_ROLES and not r.startswith("_")
	]


# Bookkeeping and integration fields a worker never picks (CFDI stamping, POS internals…).
_SKIP_PREFIXES = ("base_", "mx_", "posa_", "amended_from", "naming_series", "_")
MAX_PICKS = 30


def _campos(meta, tipos, cap=MAX_PICKS):
	"""Fields a worker would pick, most useful first: the record's title, amount, dates and
	status, then the list, filter, bold and required fields, then the rest; never hidden,
	above the caller's permission levels or internal ones."""
	from crm.api.documentos import DISPLAY

	known = DISPLAY.get(meta.name) or {}
	levels = set(meta.get_permlevel_access("read"))
	first = [*known.get("title", ()), "status"] + [
		known.get(k) for k in ("amount", "date", "due", "outstanding") if known.get(k)
	]
	usable = [
		df
		for df in meta.fields
		if df.fieldtype in tipos
		and df.label
		and not df.hidden
		and cint(df.permlevel) in levels
		and _FIELDNAME.match(df.fieldname)
		and not df.fieldname.startswith(_SKIP_PREFIXES)
	]

	def rank(df):
		if df.fieldname in first:
			return (0, first.index(df.fieldname))
		if df.in_list_view or df.in_standard_filter or df.bold or df.reqd:
			return (1, 0)
		return (2, 0)

	return sorted(usable, key=rank)[:cap]


def _campos_insertables(meta):
	return [{"fieldname": "name", "label": "Número", "fieldtype": "Data"}] + [
		{"fieldname": df.fieldname, "label": _(df.label), "fieldtype": df.fieldtype}
		for df in _campos(meta, INSERT_TYPES)
	]


def _opciones_select(df):
	if df.fieldtype != "Select":
		return []
	return [{"value": o, "label": _(o)} for o in cstr(df.options).split("\n") if o]


@frappe.whitelist()
def opciones_aviso(doctype: str) -> dict:
	"""The pickers of «Nuevo aviso» for one doctype: moments, fields, people, channels."""
	_dueno_o_error()
	meta = _doctype_valido(doctype)
	events = [
		{"value": e, "label": frase_evento(e, doctype, "…" if e == "Value Change" else "")}
		for e in EVENTS
		if e not in ("Submit", "Cancel") or meta.is_submittable
	]
	return {
		"doctype": doctype,
		"label": etiqueta(doctype),
		"articulo": con_articulo(doctype),
		"plural": plural(doctype),
		"eventos": events,
		"fechas": [
			{"fieldname": df.fieldname, "label": _(df.label)} for df in _campos(meta, {"Date", "Datetime"})
		],
		"cambios": [
			{"fieldname": df.fieldname, "label": _(df.label)}
			for df in _campos(meta, CONDITION_TYPES | {"Date"})
		],
		"condiciones": [
			{
				"fieldname": df.fieldname,
				"label": _(df.label),
				"fieldtype": df.fieldtype,
				"options": _opciones_select(df),
			}
			for df in _campos(meta, CONDITION_TYPES)
		],
		"correos": [{"fieldname": "owner", "label": "El dueño del documento"}]
		+ [
			{"fieldname": df.fieldname, "label": _(df.label)}
			for df in _campos(meta, {"Data", "Link"}, cap=500)
			if (df.fieldtype == "Data" and df.options == "Email") or df.options == "User"
		],
		"roles": _roles(),
		"canales": [{"value": c, "label": CHANNELS[c]} for c in OFFERED_CHANNELS],
		"insertables": _campos_insertables(meta),
	}


def _plantilla(meta, text, corto=False):
	"""Plain Spanish with «[Campo]» tokens → Jinja. Any brace the person typed is neutralised,
	so only the expressions generated here (validated fieldnames) ever reach the template.
	`corto`: the plain `{{ doc.x }}` form (a 140-character title)."""
	text = cstr(text).replace("{", "(").replace("}", ")")
	labels = {}
	for item in _campos_insertables(meta):
		labels.setdefault(item["label"].strip().lower(), item)
		labels.setdefault(item["fieldname"], item)

	def token(match):
		item = labels.get(match.group(1).strip().lower())
		if not item:
			return match.group(0)
		fieldname = item["fieldname"]
		fieldtype = item.get("fieldtype")
		if fieldtype in FORMATTED and not corto:
			df = meta.get_field(fieldname)
			options = cstr(df.options) if df and fieldtype == "Currency" else ""
			spec = json.dumps({"fieldtype": fieldtype, "options": options})
			return "{{ frappe.format(doc.%s, %s, doc) }}" % (fieldname, spec)
		return '{{ doc.%s or "" }}' % fieldname

	return _TOKEN.sub(token, text)


def _aviso_doc(datos):
	"""An unsaved Notification from the pickers, every value validated."""
	datos = _parse(datos)
	meta = _doctype_valido(datos.get("doctype"))
	doctype = meta.name
	event = datos.get("evento")
	if event not in EVENTS:
		frappe.throw(_("Elige cuándo se manda el aviso."))
	if event in ("Submit", "Cancel") and not meta.is_submittable:
		frappe.throw(_("{0} no se confirman ni se cancelan.").format(plural(doctype).capitalize()))
	channel = datos.get("canal") or "System Notification"
	if channel not in OFFERED_CHANNELS:
		frappe.throw(_("Elige por dónde llega: correo o aviso en Muelle."))
	subject = cstr(datos.get("asunto")).strip()
	message = cstr(datos.get("mensaje")).strip()
	if not subject:
		frappe.throw(_("Escribe el título del aviso."))
	if len(subject) > MAX_SUBJECT or len(message) > MAX_TEXT:
		frappe.throw(_("El texto es demasiado largo."))

	doc = frappe.new_doc("Notification")
	doc.document_type = doctype
	doc.event = event
	doc.channel = channel
	doc.enabled = 1
	doc.message_type = "Markdown"
	if event == "Value Change":
		doc.value_changed = _campo(meta, datos.get("campo")).fieldname
	if event in ("Days Before", "Days After"):
		doc.date_changed = _campo(meta, datos.get("campo"), {"Date", "Datetime"}).fieldname
		dias = cint(datos.get("dias"))
		if dias < 0 or dias > MAX_DAYS:
			frappe.throw(_("Elige entre 0 y {0} días.").format(MAX_DAYS))
		doc.days_in_advance = dias

	condition = datos.get("condicion") or None
	if condition:
		if not isinstance(condition, dict):
			frappe.throw(_("Elige un campo de la lista."))
		df = _campo(meta, condition.get("campo"), CONDITION_TYPES)
		if cint(df.permlevel) not in meta.get_permlevel_access("read"):
			frappe.throw(_("Elige un campo de la lista."))
		value = _valor(df, condition.get("valor"))
		doc.condition_type = "Filters"
		doc.filters = json.dumps([[doctype, df.fieldname, "=", value]])
	else:
		doc.condition_type = "Filters"
		doc.filters = None

	who = datos.get("destinatarios") or {}
	if not isinstance(who, dict):
		frappe.throw(_("Elige a quién le llega."))
	roles = who.get("roles") or []
	if not isinstance(roles, list) or len(roles) > 20:
		frappe.throw(_("Elige a quién le llega."))
	valid_roles = {r["role"] for r in _roles()}
	for role in roles:
		if role not in valid_roles:
			frappe.throw(_("Ese equipo no existe."))
		doc.append("recipients", {"receiver_by_role": role})
	if cint(who.get("dueno")):
		doc.append("recipients", {"receiver_by_document_field": "owner"})
	field = who.get("campo")
	if field and field != "owner":
		df = _campo(meta, field, {"Data", "Link"})
		if not ((df.fieldtype == "Data" and df.options == "Email") or df.options == "User"):
			frappe.throw(_("Ese campo no tiene un correo."))
		doc.append("recipients", {"receiver_by_document_field": df.fieldname})
	if not doc.recipients:
		frappe.throw(_("Elige a quién le llega el aviso."))

	doc.subject = _plantilla(meta, subject, corto=True)
	if len(doc.subject) > MAX_SUBJECT:
		frappe.throw(_("El título es demasiado largo con esos campos. Quita alguno."))
	doc.message = _plantilla(meta, message) or doc.subject
	if channel == "System Notification":
		doc.notification_title = doc.subject
		doc.notification_message = doc.message
	return doc


def _ultimo(doctype):
	rows = frappe.get_list(doctype, fields=["name"], order_by="modified desc", limit_page_length=1)
	return rows[0].name if rows else None


@frappe.whitelist(methods=["GET", "POST"])
def vista_previa(datos: str | dict) -> dict:
	"""The new aviso's title and message rendered against the latest record the owner can read."""
	_dueno_o_error()
	doc = _aviso_doc(datos)
	name = _ultimo(doc.document_type)
	if not name:
		return {"registro": None, "asunto": None, "mensaje": None}
	record = frappe.get_doc(doc.document_type, name)
	return {
		"registro": _titulo(record),
		"asunto": strip_html(cstr(doc.preview_subject(name))).strip(),
		"mensaje": strip_html(cstr(doc.preview_message(name))).strip(),
		"cumple": cstr(doc.preview_meets_condition(name)),
	}


def _unico(doctype, base):
	base = cstr(base).strip()[:120] or "Aviso"
	name, n = base, 2
	while frappe.db.exists(doctype, name):
		name = f"{base} ({n})"
		n += 1
	return name


@frappe.whitelist(methods=["POST"])
def crear_aviso(datos: str | dict) -> dict:
	"""Create a Notification from the pickers (owner only); returns its row in words."""
	_dueno_o_error()
	frappe.has_permission("Notification", "create", throw=True)
	doc = _aviso_doc(datos)
	title = _TOKEN.sub(r"\1", strip_html(cstr(_parse(datos).get("asunto"))))
	doc.name = _unico("Notification", title.replace("{", "(").replace("}", ")"))
	doc.insert()
	return _fila_aviso(frappe.get_doc("Notification", doc.name))


# ── reglas de asignación (Assignment Rule) ──────────────────────────────────


def _fila_regla(rule):
	doctype = rule.document_type
	meta = frappe.get_meta(doctype) if _exists(doctype) else None
	users = [row.user for row in (rule.get("users") or rule.get("weighted_users") or [])]
	condition = ""
	ours = leer_condicion(rule.assign_condition)
	if ours and meta and meta.has_field(ours[0]):
		condition = frase_condicion(meta, ours[0], ours[1])
	elif cstr(rule.assign_condition).strip() not in ("", "True", "1"):
		condition = "se cumple una condición del sistema"
	field = _label(meta, rule.field) if rule.get("field") and meta else ""
	return {
		"name": rule.name,
		"activo": not cint(rule.disabled),
		"documento": etiqueta(doctype),
		"doctype": doctype,
		"modo": rule.rule,
		"modo_texto": RULE_MODES.get(rule.rule, ""),
		"usuarios": [_person(u) for u in users],
		"frase": frase_regla(doctype, rule.rule, [_person(u) for u in users], condition, field),
	}


@frappe.whitelist()
def reglas() -> dict:
	"""Every Assignment Rule as a sentence (owner only)."""
	if not es_dueno():
		return {"manager": False, "motivo": _("Solo el dueño ve las reglas de asignación."), "reglas": []}
	names = frappe.get_list(
		"Assignment Rule", pluck="name", order_by="disabled asc, priority desc, modified desc", limit=200
	)
	out = []
	for name in names:
		rule = frappe.get_doc("Assignment Rule", name)
		if _exists(rule.document_type):
			out.append(_fila_regla(rule))
	return {"manager": True, "motivo": None, "reglas": out}


@frappe.whitelist(methods=["POST"])
def activar_regla(name: str, activo: int | str | bool = 1) -> dict:
	_dueno_o_error()
	doc = frappe.get_doc("Assignment Rule", cstr(name))
	doc.check_permission("write")
	doc.disabled = 0 if cint(activo) else 1
	doc.save()
	return _fila_regla(doc)


@frappe.whitelist()
def opciones_regla(doctype: str) -> dict:
	"""The pickers of «Nueva regla»: condition fields and the fields that name a person."""
	_dueno_o_error()
	meta = _doctype_valido(doctype)
	data = opciones_aviso(doctype)
	return {
		"doctype": doctype,
		"label": etiqueta(doctype),
		"plural": plural(doctype),
		"condiciones": data["condiciones"],
		"personas": [
			{"fieldname": df.fieldname, "label": _(df.label)}
			for df in meta.fields
			if df.fieldtype == "Link" and df.options == "User" and df.label
		],
		"modos": [{"value": m, "label": RULE_MODES[m]} for m in OFFERED_MODES],
	}


@frappe.whitelist(methods=["POST"])
def crear_regla(datos: str | dict) -> dict:
	"""Create an Assignment Rule from the pickers (owner only)."""
	_dueno_o_error()
	frappe.has_permission("Assignment Rule", "create", throw=True)
	datos = _parse(datos)
	meta = _doctype_valido(datos.get("doctype"))
	doctype = meta.name
	if doctype == "ToDo":
		frappe.throw(_("Los pendientes no se reparten con una regla."))
	mode = datos.get("modo")
	if mode not in OFFERED_MODES:
		frappe.throw(_("Elige cómo se reparten."))
	users = datos.get("usuarios") or []
	if not isinstance(users, list) or len(users) > 50:
		frappe.throw(_("Elige a las personas."))
	clean = []
	for user in users:
		if not frappe.db.get_value("User", {"name": cstr(user), "enabled": 1, "user_type": "System User"}):
			frappe.throw(_("{0} no puede recibir documentos.").format(cstr(user)))
		if user not in clean:
			clean.append(user)
	field_label = ""
	doc = frappe.new_doc("Assignment Rule")
	doc.document_type = doctype
	doc.rule = mode
	doc.priority = 0
	if mode == "Based on Field":
		df = _campo(meta, datos.get("campo"), {"Link"})
		if df.options != "User":
			frappe.throw(_("Ese campo no nombra a una persona."))
		doc.field = df.fieldname
		field_label = _(df.label)
	elif not clean:
		frappe.throw(_("Elige al menos a una persona."))
	for user in clean:
		doc.append("users", {"user": user})

	condition = datos.get("condicion") or None
	words = ""
	if condition:
		if not isinstance(condition, dict):
			frappe.throw(_("Elige un campo de la lista."))
		df = _campo(meta, condition.get("campo"), CONDITION_TYPES)
		value = _valor(df, condition.get("valor"))
		doc.assign_condition = condicion_python(df.fieldname, value)
		words = frase_condicion(meta, df.fieldname, value)
	else:
		doc.assign_condition = "True"
	for day in WEEKDAYS:
		doc.append("assignment_days", {"day": day})
	sentence = frase_regla(doctype, mode, [_person(u) for u in clean], words, field_label)
	doc.description = sentence
	doc.name = _unico("Assignment Rule", sentence[:120])
	doc.insert()
	return _fila_regla(doc)


# ── repetir (Auto Repeat) ───────────────────────────────────────────────────


def _titulo(doc):
	"""The record as a worker names it: party or title, never the ID when avoidable."""
	from crm.api.documentos import DISPLAY

	meta = doc.meta
	fields = list((DISPLAY.get(doc.doctype) or {}).get("title", ()))
	if meta.title_field and meta.title_field != "name":
		fields.append(meta.title_field)
	fields += [
		"customer_name",
		"supplier_name",
		"party_name",
		"employee_name",
		"pay_to_recd_from",
		"title",
		"subject",
		"full_name",
		"lead_name",
	]
	for field in fields:
		if meta.has_field(field) or field == meta.title_field:
			value = cstr(doc.get(field)).strip()
			if value and not _MACHINE_ID.match(value) and value != doc.name:
				return value[:140]
	return "{0} {1}".format(etiqueta(doc.doctype), doc.name)


def _activo_de(doctype, name):
	rows = frappe.get_all(
		"Auto Repeat",
		filters={"reference_doctype": doctype, "reference_document": name},
		fields=["name", "frequency", "next_schedule_date", "start_date", "end_date", "disabled", "status"],
		order_by="disabled asc, modified desc",
		limit=1,
	)
	return rows[0] if rows else None


def _fila_repeticion(row):
	return {
		"name": row.name,
		"frecuencia": row.frequency,
		"frecuencia_texto": FREQUENCIES.get(row.frequency, row.frequency),
		"siguiente": cstr(row.next_schedule_date) or None,
		"inicio": cstr(row.start_date) or None,
		"fin": cstr(row.end_date) or None,
		"activo": not cint(row.disabled) and row.status == "Active",
		"estado": {"Active": "Activa", "Disabled": "Apagada", "Completed": "Terminada"}.get(
			row.status, row.status
		),
	}


def motivo_repetir(doc):
	"""None when the caller may repeat this record, else the reason in words."""
	meta = doc.meta
	if not _exists("Auto Repeat"):
		return _("Este sistema no puede repetir documentos.")
	if not meta.allow_auto_repeat:
		return _("{0} todavía no se pueden repetir. El dueño puede permitirlo.").format(
			plural(doc.doctype).capitalize()
		)
	if not frappe.has_permission("Auto Repeat", "create"):
		return _("Tu usuario no puede programar repeticiones. Pídelo al encargado.")
	if meta.is_submittable and cint(doc.docstatus) != 1:
		if cint(doc.docstatus) == 2:
			return _("Un documento cancelado no se repite.")
		femenino = (KINDS.get(doc.doctype) or ("", "m"))[1] == "f"
		return (
			_("Confirma {0} antes de repetirla.") if femenino else _("Confirma {0} antes de repetirlo.")
		).format(con_articulo(doc.doctype, False))
	# frappe.has_permission does not msgprint a denial; Document.has_permission does.
	if not frappe.has_permission(doc.doctype, "write", doc=doc):
		return _("Tu usuario no puede cambiar este documento.")
	return None


def accion_repetir(doc):
	"""(allowed, reason) for the record's «Repetir cada…» tool (documentos `_actions`)."""
	reason = motivo_repetir(doc)
	return reason is None, reason


@frappe.whitelist()
def repeticion(doctype: str, name: str) -> dict:
	"""The record's repetition (if any) and whether the caller may set one."""
	if not _exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	current = _activo_de(doctype, doc.name) if _exists("Auto Repeat") else None
	reason = motivo_repetir(doc)
	return {
		"titulo": _titulo(doc),
		"articulo": con_articulo(doctype, False),
		"plural": plural(doctype),
		"documento": etiqueta(doctype),
		"actual": _fila_repeticion(current) if current and not cint(current.disabled) else None,
		"permitido": reason is None,
		"motivo": reason,
		"puede_permitir": bool(
			es_dueno() and not doc.meta.allow_auto_repeat and not doc.meta.custom and _exists("Auto Repeat")
		),
		"frecuencias": [{"value": k, "label": v} for k, v in FREQUENCIES.items()],
		"puede_quitar": bool(current and frappe.has_permission("Auto Repeat", "write", current.name)),
	}


@frappe.whitelist(methods=["POST"])
def repetir(
	doctype: str,
	name: str,
	frecuencia: str,
	inicio: str | None = None,
	fin: str | None = None,
	notificar: int | str | bool = 0,
) -> dict:
	"""Repeat a record as the caller. «Avisar por correo» sends each new copy to the caller
	(never to the customer from here)."""
	if not _exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	reason = motivo_repetir(doc)
	if reason:
		frappe.throw(reason, frappe.PermissionError)
	if frecuencia not in FREQUENCIES:
		frappe.throw(_("Elige cada cuánto se repite."))
	current = _activo_de(doctype, doc.name)
	if current and not cint(current.disabled):
		frappe.throw(_("Este documento ya se repite. Quita la repetición antes de poner otra."))
	start = getdate(inicio) if inicio else getdate(today())
	if start < getdate(today()):
		frappe.throw(_("La repetición no puede empezar antes de hoy."))
	end = getdate(fin) if fin else None
	if end and (end <= start or end == getdate(today())):
		frappe.throw(_("La fecha de fin debe ser después del inicio."))

	auto = frappe.new_doc("Auto Repeat")
	auto.reference_doctype = doctype
	auto.reference_document = doc.name
	auto.frequency = frecuencia
	auto.start_date = start
	if end:
		auto.end_date = end
	if cint(notificar):
		email = frappe.db.get_value("User", frappe.session.user, "email")
		if not email:
			frappe.throw(_("Tu usuario no tiene correo para avisarte."))
		auto.notify_by_email = 1
		auto.recipients = email
		auto.subject = "{0}: {1}".format(etiqueta(doctype), _titulo(doc))[:140]
		auto.message = _("Se creó una copia nueva de {0}.").format(con_articulo(doctype, False))
	auto.insert()
	return repeticion(doctype, doc.name)


@frappe.whitelist(methods=["POST"])
def quitar_repeticion(name: str) -> dict:
	"""Stop a repetition (disable; the history stays)."""
	auto = frappe.get_doc("Auto Repeat", cstr(name))
	auto.check_permission("write")
	auto.disabled = 1
	auto.save()
	return {"ok": True, "mensaje": _("Ya no se repite.")}


@frappe.whitelist()
def repeticiones() -> dict:
	"""«Repeticiones»: every repetition the caller can read, titled by the record's party."""
	if not _exists("Auto Repeat") or not frappe.has_permission("Auto Repeat", "read"):
		return {
			"puede_ver": False,
			"motivo": _("Tu usuario no ve las repeticiones. Pídelo al encargado."),
			"filas": [],
		}
	rows = frappe.get_list(
		"Auto Repeat",
		fields=[
			"name",
			"reference_doctype",
			"reference_document",
			"frequency",
			"next_schedule_date",
			"start_date",
			"end_date",
			"disabled",
			"status",
		],
		order_by="disabled asc, next_schedule_date asc",
		limit_page_length=200,
	)
	out = []
	for row in rows:
		if not _exists(row.reference_doctype) or not frappe.db.exists(
			row.reference_doctype, row.reference_document
		):
			continue
		if not frappe.has_permission(row.reference_doctype, "read", row.reference_document):
			continue
		ref = frappe.get_doc(row.reference_doctype, row.reference_document)
		item = _fila_repeticion(row)
		item.update(
			{
				"doctype": row.reference_doctype,
				"documento": row.reference_document,
				"tipo": etiqueta(row.reference_doctype),
				"titulo": _titulo(ref),
			}
		)
		out.append(item)
	return {"puede_ver": True, "motivo": None, "filas": out}


@frappe.whitelist(methods=["POST"])
def permitir_repeticion(doctype: str) -> dict:
	"""Owner only: let a doctype repeat, as Customize Form does (Property Setter
	`allow_auto_repeat` + the `auto_repeat` link field the records need)."""
	_dueno_o_error()
	frappe.has_permission("Property Setter", "create", throw=True)
	meta = _doctype_valido(doctype)
	if meta.custom:
		frappe.throw(_("Este tipo de documento se cambia desde su propia definición."))
	from frappe.custom.doctype.customize_form.customize_form import core_doctypes_list

	if doctype in core_doctypes_list:
		frappe.throw(_("Este tipo de documento no se puede repetir."))
	if not meta.allow_auto_repeat:
		from frappe.custom.doctype.custom_field.custom_field import create_custom_field
		from frappe.custom.doctype.property_setter.property_setter import delete_property_setter

		delete_property_setter(doctype, "allow_auto_repeat")
		frappe.make_property_setter(
			{
				"doctype": doctype,
				"doctype_or_field": "DocType",
				"property": "allow_auto_repeat",
				"value": "1",
				"property_type": "Check",
			},
			is_system_generated=False,
		)
		if not meta.has_field("auto_repeat"):
			create_custom_field(
				doctype,
				{
					"fieldname": "auto_repeat",
					"label": "Auto Repeat",
					"fieldtype": "Link",
					"options": "Auto Repeat",
					"insert_after": meta.fields[-1].fieldname if meta.fields else None,
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
				},
			)
		frappe.clear_cache(doctype=doctype)
	return {"ok": True, "mensaje": _("Listo: {0} ya se pueden repetir.").format(plural(doctype))}


# ── aprobaciones (Workflow) ─────────────────────────────────────────────────


def ruta(doctype, name):
	"""The shell record for a workflow row (documentos generic floor; the lead mounts the bar there)."""
	return "/crm/documentos/tipo/{0}/{1}".format(quote(cstr(doctype), safe=""), quote(cstr(name), safe=""))


def _workflow(doctype):
	from frappe.model.workflow import get_workflow_name

	name = get_workflow_name(doctype)
	return frappe.get_cached_doc("Workflow", name) if name else None


def _mis_transiciones(doc, workflow=None):
	from frappe.model.workflow import get_transitions, has_approval_access

	try:
		rows = get_transitions(doc, workflow, raise_exception=True)
	except Exception:
		frappe.clear_last_message()
		return []
	user = frappe.session.user
	return [t for t in rows if has_approval_access(user, doc, t)]


_APRUEBA = re.compile(r"aprob|approve|autoriz|acept|confirm|resolver", re.I)
_RECHAZA = re.compile(r"rechaz|reject|cancel|deneg|sin procede", re.I)


def tono(accion):
	if _APRUEBA.search(cstr(accion)):
		return "filled"
	if _RECHAZA.search(cstr(accion)):
		return "danger"
	return "tonal"


def _acciones(transitions):
	out, seen = [], set()
	for t in transitions:
		if t.action in seen:
			continue
		seen.add(t.action)
		out.append(
			{"accion": t.action, "label": _(t.action), "siguiente": _(t.next_state), "tono": tono(t.action)}
		)
	if out and not any(a["tono"] == "filled" for a in out):
		out[0]["tono"] = "filled"
	return out


def _detalle(doc, state):
	from crm.api.documentos import DISPLAY

	parts = [etiqueta(doc.doctype), _(state)]
	amount_field = (DISPLAY.get(doc.doctype) or {}).get("amount")
	if amount_field and doc.get(amount_field):
		from frappe.utils import fmt_money

		parts.append(fmt_money(doc.get(amount_field), currency=doc.get("currency")))
	return " · ".join(p for p in parts if p)


def _decide_quien(workflow, state):
	roles = sorted({t.allowed for t in workflow.transitions if t.state == state})
	return lista_y([_(r) for r in roles])


def flujo_aprobaciones(view="decide", limit=20):
	"""Provider for doco's Pendientes (hook `doco_approval_sources`): open Workflow Actions.

	`decide`: documents in a state where the session user has a transition (Workflow Action
	permission query: my roles in permitted_roles; then Frappe's own transition rule and
	self-approval). `waiting`: documents I created that wait on someone else."""
	if view not in ("decide", "waiting") or not _exists("Workflow Action"):
		return None
	active = frappe.get_all("Workflow", filters={"is_active": 1}, fields=["name", "document_type"])
	active = [w for w in active if w.document_type not in PROPIOS and _exists(w.document_type)]
	if not active:
		return None
	user = frappe.session.user
	roles = set(frappe.get_roles())
	doctypes = [w.document_type for w in active]
	if view == "decide":
		allowed = frappe.get_all(
			"Workflow Transition",
			filters={"parent": ["in", [w.name for w in active]], "allowed": ["in", list(roles)]},
			pluck="parent",
			limit=1,
		)
		if not allowed:
			return None
	answer = {
		"key": "flujos",
		"label": _("Documentos"),
		"where": _("Documentos"),
		"count": 0,
		"capped": False,
		"rows": [],
	}
	limit = max(cint(limit), 0)
	if not limit:
		return answer
	cap = 100
	if view == "decide":
		actions = frappe.get_list(
			"Workflow Action",
			filters={"status": "Open", "reference_doctype": ["in", doctypes]},
			fields=["name", "reference_doctype", "reference_name", "workflow_state", "creation"],
			order_by="creation asc",
			limit_page_length=cap + 1,
		)
	else:
		actions = frappe.get_all(
			"Workflow Action",
			filters={"status": "Open", "reference_doctype": ["in", doctypes]},
			fields=["name", "reference_doctype", "reference_name", "workflow_state", "creation"],
			order_by="creation asc",
			limit_page_length=500,
		)
	rows, seen = [], set()
	for action in actions:
		key = (action.reference_doctype, action.reference_name)
		if key in seen or not frappe.db.exists(*key):
			continue
		seen.add(key)
		doc = frappe.get_doc(*key)
		if view == "waiting" and doc.owner != user:
			continue
		if not doc.has_permission("read"):
			if view == "decide":
				rows.append(
					{
						"doctype": key[0],
						"name": key[1],
						"title": etiqueta(key[0]),
						"url": None,
						"state": "pending",
						"guard": {
							"code": "no_access",
							"message": _("Tu usuario ya no puede abrir este documento."),
							"actions": [],
						},
					}
				)
			continue
		workflow = _workflow(doc.doctype)
		if not workflow:
			continue
		state = doc.get(workflow.workflow_state_field)
		resolved = state != action.workflow_state
		if view == "decide":
			mine = _mis_transiciones(doc, workflow)
			if not mine and not resolved:
				continue
			detail = _detalle(doc, state)
			if mine and not resolved:
				acciones = acciones_texto([a["label"] for a in _acciones(mine)])
				detail = " · ".join(x for x in (detail, acciones) if x)
		else:
			if resolved or _mis_transiciones(doc, workflow):
				continue
			detail = _detalle(doc, state)
		rows.append(
			{
				"doctype": doc.doctype,
				"name": doc.name,
				"title": _titulo(doc),
				"detail": detail,
				"requested_by": doc.modified_by
				if doc.modified_by not in ("Administrator", "Guest")
				else None,
				"requested_at": action.creation,
				"decider": _decide_quien(workflow, state) if view == "waiting" else None,
				"url": ruta(doc.doctype, doc.name),
				"state": "resolved" if resolved else "pending",
				"guard": None,
			}
		)
		if len(rows) >= cap:
			break
	answer.update({"count": min(len(rows), cap), "capped": len(actions) > cap, "rows": rows[:limit]})
	return answer


flujo_aprobaciones.label = "Documentos por aprobar"


@frappe.whitelist()
def transiciones(doctype: str, name: str) -> dict:
	"""The record's workflow: state in words and the caller's actions («Aprobar» first)."""
	if not _exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	workflow = _workflow(doctype)
	if not workflow:
		return {"flujo": None, "estado": None, "acciones": [], "motivo": None}
	state = doc.get(workflow.workflow_state_field)
	if doctype in PROPIOS:
		return {
			"flujo": workflow.name,
			"estado": _(state) if state else None,
			"acciones": [],
			"motivo": _("Esto se decide en {0}.").format(PROPIOS[doctype]),
		}
	mine = _mis_transiciones(doc, workflow)
	reason = None
	if not mine and state:
		who = _decide_quien(workflow, state)
		reason = _("Lo decide: {0}.").format(who) if who else None
	return {
		"flujo": workflow.name,
		"estado": _(state) if state else None,
		"acciones": _acciones(mine),
		"motivo": reason,
	}


@frappe.whitelist(methods=["POST"])
def aplicar_transicion(doctype: str, name: str, accion: str) -> dict:
	"""Apply one workflow action as the caller (Frappe's `apply_workflow`)."""
	from frappe.model.workflow import apply_workflow

	if not _exists(doctype):
		frappe.throw(_("Ese tipo de documento no existe."))
	if doctype in PROPIOS:
		frappe.throw(_("Esto se decide en {0}.").format(PROPIOS[doctype]), frappe.PermissionError)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	workflow = _workflow(doctype)
	if not workflow:
		frappe.throw(_("Este documento no pasa por aprobación."))
	if accion not in {t.action for t in _mis_transiciones(doc, workflow)}:
		frappe.throw(_("Ya no puedes hacer «{0}» en este documento.").format(_(cstr(accion))))
	apply_workflow(doc, accion)
	doc = frappe.get_doc(doctype, name)
	state = doc.get(workflow.workflow_state_field)
	return {
		"estado": _(state) if state else None,
		"mensaje": _("Listo: quedó en «{0}».").format(_(state)) if state else _("Listo."),
	}
