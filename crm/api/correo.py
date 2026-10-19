"""Correo: email from a record and a Gmail-style queue in the Muelle shell (Shell D12, SPEC §6 DD20).

Frappe's own engines only: `Communication` + `frappe.core.doctype.communication.email.make()` to send
(the PDF goes as a print-format attachment that the email queue renders at send time), Email Template
rendered with the record (never raw Jinja), Email Account for the sender.

Permissions are Frappe's: the record must be readable here (documentos `_require`, blocked modules
included) and `email` must be granted on it to send. The queue reads Communications through
`frappe.get_list` as the caller, so Frappe's User Email visibility applies (System Manager and Super
Email User see every account; others only their own accounts). A record's thread follows Desk's form
timeline: whoever reads the record reads its emails.

Noise (system alerts, no-reply senders, the same subject over and over) is folded into category rows
by pure functions (`es_ruido`, `clave_asunto`, `agrupar`) so 400 «Saldo TAECEL bajo…» alerts are one
row, not a flooded inbox.
"""

import json
import re
from collections import Counter
from html import unescape

import frappe
from frappe import _
from frappe.utils import cint, cstr, escape_html, flt, get_fullname, strip_html

from crm.api import documentos

# How each curated doctype is named in a subject line and on a summary card (worker words).
NOMBRES = {
	"Quotation": "Cotización",
	"Sales Order": "Pedido",
	"Delivery Note": "Nota de entrega",
	"Sales Invoice": "Factura",
	"POS Invoice": "Ticket",
	"Payment Entry": "Pago",
	"Material Request": "Solicitud de material",
	"Request for Quotation": "Solicitud de cotización",
	"Supplier Quotation": "Cotización de proveedor",
	"Purchase Order": "Orden de compra",
	"Purchase Receipt": "Recepción de compra",
	"Purchase Invoice": "Factura de proveedor",
	"Customer": "Cliente",
	"Supplier": "Proveedor",
	"Contact": "Contacto",
	"Lead": "Prospecto",
	"CRM Lead": "Prospecto",
	"CRM Deal": "Oportunidad",
	"Communication": "Correo",
}
# Fields that hold a person or company to write to, in preference order.
EMAIL_FIELDS = ("contact_email", "email_id", "email", "customer_email", "supplier_email", "email_address")
PARTY_FIELDS = (
	("customer", "Customer", "customer_primary_contact"),
	("supplier", "Supplier", "supplier_primary_contact"),
	("party_name", None, None),  # Quotation (quotation_to) / Payment Entry (party_type)
	("party", None, None),
)
MAX_PARA = 10
MAX_SUGERENCIAS = 8
MAX_ASUNTO = 240
MAX_CUERPO = 20000
VENTANA = 1000  # newest Communications the queue classifies at once
LIMITE_PAGINA = 50
SNIPPET = 140
UMBRAL_REPETIDOS = 3
IDEMPOTENCIA_SEG = 600
_EMAIL = re.compile(r"^[^@\s<>,;\"']+@[^@\s<>,;\"']+\.[^@\s<>,;\"']{2,}$")
_SISTEMA = re.compile(
	r"(^|[._+-])(no-?reply|noreply|do-?not-?reply|mailer-daemon|postmaster|notifications?|notificaciones|alertas?|bounce[s]?)([._+-]|@)",
	re.I,
)
_PREFIJOS = re.compile(r"^\s*((re|rv|fw|fwd|reenviar|respuesta)\s*:\s*)+", re.I)


# ── Pure helpers (no database: unit-tested in test_d12_correo) ────────────────────────────────


def correo_valido(value):
	"""True for one plain address (`ana@tienda.mx`), without display name or separators."""
	return bool(_EMAIL.match(cstr(value).strip()))


def separar_correos(value):
	"""Addresses from a JSON list, a list, or a comma/semicolon/newline separated string,
	lower-cased and without duplicates (order kept). `Ana <ana@x.mx>` keeps only the address."""
	if isinstance(value, str):
		text = value.strip()
		if text.startswith("["):
			try:
				value = json.loads(text)
			except ValueError:
				value = [text]
		else:
			value = re.split(r"[,;\n]+", text)
	out = []
	for item in value or []:
		email = cstr(item.get("email") if isinstance(item, dict) else item).strip()
		found = re.search(r"<([^>]+)>", email)
		if found:
			email = found.group(1).strip()
		email = email.lower()
		if email and email not in out:
			out.append(email)
	return out


def clave_asunto(subject):
	"""A subject's family: no «Re:»/«Fwd:», no emoji or symbols, numbers and document numbers as
	«#», lower case, the first 40 characters. «⚠️ Saldo TAECEL bajo en 2 bolsa(s)» and «… en 3 …»
	share a key; «Factura ACC-SINV-2026-00012» and «… -00013» too."""
	text = _PREFIJOS.sub("", cstr(subject)).lower()
	text = re.sub(r"[a-z]*[-/]?\d[\w/-]*", "#", text)  # numbers and IDs (ACC-SINV-2026-1, 3, 12/10)
	text = re.sub(r"[^\w#\s]", " ", text)  # emoji, punctuation
	text = re.sub(r"(#\s*)+", "# ", text)
	return re.sub(r"\s+", " ", text).strip()[:40]


def direccion(sender):
	"""The bare address of a sender (`Ana <ana@x.mx>` → `ana@x.mx`), lower case."""
	sender = cstr(sender).strip()
	found = re.search(r"<([^>]+)>", sender)
	return (found.group(1) if found else sender).strip().lower()


def es_ruido(row, propios=()):
	"""A message nobody wrote by hand: Frappe's automated messages, alerts without a sender, and
	no-reply / notification senders (unless the address is one of the worker's own)."""
	if cstr(row.get("communication_type")) == "Automated Message":
		return True
	sender = direccion(row.get("sender"))
	if not sender:
		return True
	if sender in propios:
		return False
	return bool(_SISTEMA.search(sender.split("@")[0] + "@"))


def agrupar(rows, propios=(), umbral=UMBRAL_REPETIDOS):
	"""Split the queue into category rows and plain rows (Gmail's «Notificaciones · 11 nuevos»).

	- every noise row (`es_ruido`) goes to the «sistema» category;
	- among the rest, `umbral` or more messages from others with the same subject family
	  (`clave_asunto`) become their own category, keyed `asunto:<clave>`;
	- everything else stays a plain row, in the given order (newest first).

	Returns `(categorias, filas)`; each category is `{clave, tipo, filas}` with its rows in order,
	and categories are ordered by their newest row."""
	sistema, otros = [], []
	for row in rows:
		(sistema if es_ruido(row, propios) else otros).append(row)
	familias = {}
	for row in otros:
		if direccion(row.get("sender")) in propios:
			continue  # what the worker wrote is never folded away
		familias.setdefault(clave_asunto(row.get("subject")), []).append(row)
	repetidas = {k: v for k, v in familias.items() if k and len(v) >= umbral}
	plegadas = {id(row) for group in repetidas.values() for row in group}
	categorias = []
	if sistema:
		categorias.append({"clave": "sistema", "tipo": "sistema", "filas": sistema})
	for key, group in repetidas.items():
		categorias.append({"clave": f"asunto:{key}", "tipo": "asunto", "filas": group})
	categorias.sort(key=lambda c: cstr(c["filas"][0].get("communication_date")), reverse=True)
	filas = [row for row in otros if id(row) not in plegadas]
	return categorias, filas


def en_categoria(rows, clave, propios=(), umbral=UMBRAL_REPETIDOS):
	"""The rows a category row opens (the same split as `agrupar`)."""
	categorias, _filas = agrupar(rows, propios, umbral)
	for categoria in categorias:
		if categoria["clave"] == clave:
			return categoria["filas"]
	return []


def texto_plano(html, limite=None):
	"""Readable text from an email body: line breaks kept, tags and entities gone."""
	text = cstr(html)
	text = re.sub(r"(?is)<(style|script|head)[^>]*>.*?</\1>", " ", text)
	text = re.sub(r"(?i)</(p|h[1-6])>", "\n\n", text)
	text = re.sub(r"(?i)<br\s*/?>|</(div|li|tr)>", "\n", text)
	text = unescape(strip_html(text)).replace("\xa0", " ")
	text = re.sub(r"[ \t]+", " ", text)
	text = re.sub(r" ?\n ?", "\n", text)
	text = re.sub(r"\n\s*\n\s*(\n\s*)+", "\n\n", text).strip()
	if limite:
		flat = re.sub(r"\s+", " ", text)
		return flat if len(flat) <= limite else flat[: limite - 1].rstrip() + "…"
	return text


_NO_CAMPOS = {
	*("_", "doc", "frappe", "loop", "range", "nowdate", "now", "today", "True", "False", "None"),
	*("if", "else", "elif", "endif", "for", "in", "endfor", "and", "or", "not", "is", "set", "endset"),
	*("true", "false", "none"),
}
_CAMPOS_BASE = {"name", "owner", "creation", "modified", "modified_by", "doctype", "docstatus", "idx"}


def variables(template):
	"""The record fields a template reads: `{{ customer }}`, `{{ doc.customer }}`, `{% if x %}`
	(filters after `|`, string literals and loop variables are not fields)."""
	found, loops = set(), set()
	for block in re.findall(r"\{\{(.*?)\}\}|\{%(.*?)%\}", cstr(template), flags=re.S):
		code = " ".join(block)
		code = re.sub(r"(['\"]).*?\1", " ", code)  # string literals
		code = re.sub(r"\|\s*\w+(\([^)]*\))?", " ", code)  # filters: | title, | default('')
		loops.update(re.findall(r"\bfor\s+(\w+)", code))
		for head, attr in re.findall(r"(?<![\w.])([A-Za-z_]\w*)(?:\.(\w+))?", code):
			if head == "doc" and attr:
				found.add(attr)
			elif head not in _NO_CAMPOS:
				found.add(head)
	return found - loops


def encaja(template, campos):
	"""True when every field the template reads exists on the record (no blanks after filling)."""
	return not (variables(template) - set(campos) - _CAMPOS_BASE)


def plantilla_visible(asunto, cuerpo, fuente, campos, usada=0):
	"""Whether the picker offers a template for this record: never one whose filled preview reads
	in English (Frappe/HR samples: «Interview Feedback Reminder…»), and only the ones whose fields
	this record has, unless the team already sends it from this kind of document."""
	from crm.api.automatizaciones import parece_ingles

	if parece_ingles(f"{cstr(asunto)} {cstr(cuerpo)}"):
		return False
	return bool(usada) or encaja(fuente, campos)


def html_de_texto(text):
	"""The email body from the sheet's plain text: escaped, paragraphs and line breaks kept."""
	paragraphs = [p for p in re.split(r"\n\s*\n", cstr(text).strip()) if p.strip()]
	return "".join(f"<p>{escape_html(p.strip()).replace(chr(10), '<br>')}</p>" for p in paragraphs)


def sin_jinja(text):
	"""Never show template code: anything still between {{ }} / {% %} after rendering goes."""
	text = re.sub(r"\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\}", "", cstr(text), flags=re.S)
	return text.replace("{{", "").replace("}}", "")


# ── Access ────────────────────────────────────────────────────────────────────────────────────


def _documento(doctype, name):
	"""The record, readable here (documentos rules) and by this worker."""
	documentos._require(doctype)
	if not name or not frappe.db.exists(doctype, name):
		frappe.throw(_("This document no longer exists."), frappe.DoesNotExistError)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return doc


def _no_email():
	frappe.throw(
		_("Your user cannot send emails from this document. Ask your manager for access."),
		frappe.PermissionError,
	)


def _cuenta_salida(doctype=None):
	"""The Email Account `make()` would send with (same lookup as Communication), or None."""
	from frappe.email.doctype.email_account.email_account import EmailAccount

	try:
		return EmailAccount.find_outgoing(
			match_by_email=frappe.session.user if "@" in cstr(frappe.session.user) else None,
			match_by_doctype=doctype,
		)
	except Exception:
		return None


def _emails_en_pausa():
	return bool(frappe.are_emails_muted())


def _propios():
	"""The worker's own addresses (never folded as noise in their own queue)."""
	user = frappe.session.user
	own = {cstr(user).lower()} if "@" in cstr(user) else set()
	for row in frappe.get_all("User Email", filters={"parent": user}, fields=["email_id"]):
		if row.email_id:
			own.add(row.email_id.lower())
	return own


def _visible(comm_name):
	"""A Communication the worker may open: in their queue (Frappe's User Email rule) or on a
	record they can read (Desk's timeline rule)."""
	if frappe.get_list("Communication", filters={"name": comm_name}, pluck="name", limit_page_length=1):
		return True
	ref = frappe.db.get_value(
		"Communication", comm_name, ["reference_doctype", "reference_name"], as_dict=True
	)
	if ref and ref.reference_doctype and ref.reference_name and documentos.readable(ref.reference_doctype):
		return bool(frappe.has_permission(ref.reference_doctype, "read", ref.reference_name))
	return False


def _require_mensaje(name):
	if not name or not frappe.db.exists("Communication", name) or not _visible(name):
		frappe.throw(_("You cannot open this email. Ask your manager for access."), frappe.PermissionError)
	return frappe.get_doc("Communication", name)


# ── Display ───────────────────────────────────────────────────────────────────────────────────


def etiqueta(doctype):
	return NOMBRES.get(doctype) or _(doctype)


def _titulo(doc):
	"""The record's title as a worker says it (party or name), never its ID when there is one."""
	meta = doc.meta
	display = documentos._display(meta)
	row = documentos._row(doc, display)
	documentos._party_titles(doc.doctype, [doc], [row])
	title = cstr(row.get("title")).strip()
	if not title:
		try:
			title = cstr(doc.get_title()).strip()
		except Exception:
			title = ""
	return title if title and title != doc.name else ""


def _nombres(emails):
	"""Display names for addresses: the coworker's full name, else the contact's, else none."""
	emails = [e for e in {cstr(e).lower() for e in emails} if e]
	if not emails:
		return {}
	out = {}
	for user in frappe.get_all("User", filters={"name": ["in", emails]}, fields=["name", "full_name"]):
		if user.full_name:
			out[user.name.lower()] = user.full_name
	missing = [e for e in emails if e not in out]
	if missing:
		rows = frappe.get_all(
			"Contact Email",
			filters={"email_id": ["in", missing], "parenttype": "Contact"},
			fields=["email_id", "parent"],
		)
		names = {
			c.name: c.full_name
			for c in frappe.get_all(
				"Contact",
				filters={"name": ["in", list({r.parent for r in rows})]},
				fields=["name", "full_name"],
			)
		}
		for row in rows:
			if names.get(row.parent):
				out.setdefault(row.email_id.lower(), names[row.parent])
	return out


def _iniciales(nombre):
	words = [w for w in re.split(r"[\s._@-]+", cstr(nombre)) if w and w[0].isalnum()]
	if not words:
		return ""
	return (words[0][0] + (words[-1][0] if len(words) > 1 else "")).upper()


def _remitente(row, nombres):
	"""`{nombre, correo, iniciales}` of who wrote it; «Sistema» for alerts without a sender."""
	sender = cstr(row.get("sender")).strip()
	found = re.search(r"<([^>]+)>", sender)
	email = direccion(sender)
	if not email:
		nombre = _("System")
	else:
		nombre = (
			cstr(row.get("sender_full_name")).strip()
			or nombres.get(email)
			or (sender.split("<")[0].strip().strip('"') if found else "")
			or email
		)
		if "@" in nombre and nombre.lower() != email:
			nombre = email
	return {
		"nombre": nombre,
		"correo": email,
		"iniciales": _iniciales(nombre if "@" not in nombre else email),
	}


def _documentos_de(rows):
	"""`{(doctype, name): {doctype, etiqueta, titulo, nombre, ruta}}` for the rows' linked records,
	titled through `frappe.get_list` as the worker (unreadable ones carry no title or route)."""
	wanted = {}
	for row in rows:
		dt, dn = row.get("reference_doctype"), row.get("reference_name")
		if dt and dn and dt != "Communication":
			wanted.setdefault(dt, set()).add(dn)
	blocked = documentos._blocked_modules()
	out = {}
	for dt, names in wanted.items():
		if not documentos._exists(dt):
			continue
		meta = frappe.get_meta(dt)
		base = {"doctype": dt, "etiqueta": etiqueta(dt)}
		if meta.issingle:
			for dn in names:
				out[(dt, dn)] = {**base, "titulo": etiqueta(dt), "nombre": dn, "ruta": None}
			continue
		if not documentos.readable(dt, blocked):
			for dn in names:
				out[(dt, dn)] = {**base, "titulo": "", "nombre": dn, "ruta": None}
			continue
		display = documentos._display(meta)
		fields = ["name", *[f for f in display["title"] if meta.has_field(f)]]
		spec = documentos.DISPLAY.get(dt, {}).get("party")
		if spec:
			fields += [f for f in spec if meta.has_field(f) and f not in fields]
		docs = frappe.get_list(dt, filters={"name": ["in", list(names)]}, fields=fields)
		found = [documentos._row(d, display) for d in docs]
		documentos._party_titles(dt, docs, found)
		for d, row in zip(docs, found, strict=False):
			out[(dt, d.name)] = {
				**base,
				"titulo": row["title"] or "",
				"nombre": d.name,
				"ruta": documentos_ruta(dt, d.name),
			}
	return out


def documentos_ruta(doctype, name):
	"""The shell's generic record route; the shell maps it to a richer page when it has one."""
	from urllib.parse import quote

	return f"/documentos/tipo/{quote(doctype)}/{quote(cstr(name))}"


def _adjuntos(names):
	"""Files attached to each Communication (plain rows counted here: no SQL aggregates, which
	newer Frappe only takes in its dict syntax)."""
	if not names:
		return {}
	return dict(
		Counter(
			frappe.get_all(
				"File",
				filters={"attached_to_doctype": "Communication", "attached_to_name": ["in", list(names)]},
				pluck="attached_to_name",
			)
		)
	)


# ── Compose ───────────────────────────────────────────────────────────────────────────────────


def _sugerencias(doc):
	"""Who the record says to write to: its email fields, its contact, its party's contacts."""
	meta = doc.meta
	out, seen = [], set()
	can_contact = frappe.has_permission("Contact", "read")

	def add(email, nombre, origen):
		email = cstr(email).strip().lower()
		if not correo_valido(email) or email in seen or len(out) >= MAX_SUGERENCIAS:
			return
		seen.add(email)
		out.append({"email": email, "nombre": cstr(nombre).strip() or email, "origen": origen})

	party_name = ""
	for fieldname, _dt, _pc in PARTY_FIELDS:
		for title_field in (f"{fieldname}_name", "title"):
			if meta.has_field(title_field) and doc.get(title_field):
				party_name = cstr(doc.get(title_field))
				break
		if party_name:
			break
	contact_name = cstr(doc.get("contact_display")).strip() if meta.has_field("contact_display") else ""

	fields = list(EMAIL_FIELDS) + [
		df.fieldname for df in meta.fields if df.fieldtype == "Data" and df.options == "Email"
	]
	for fieldname in fields:
		if meta.has_field(fieldname) and doc.get(fieldname):
			for email in separar_correos(doc.get(fieldname)):
				add(email, contact_name or party_name, "documento")

	def contact_emails(contact, origen):
		if not contact or not can_contact or not frappe.db.exists("Contact", contact):
			return
		if not frappe.has_permission("Contact", "read", contact):
			return
		full_name = frappe.db.get_value("Contact", contact, "full_name") or contact
		for row in frappe.get_all(
			"Contact Email",
			filters={"parent": contact, "parenttype": "Contact"},
			fields=["email_id", "is_primary"],
			order_by="is_primary desc, idx asc",
		):
			add(row.email_id, full_name, origen)

	if meta.has_field("contact_person"):
		contact_emails(doc.get("contact_person"), "contacto")

	for fieldname, party_type, primary_field in PARTY_FIELDS:
		if not meta.has_field(fieldname) or not doc.get(fieldname):
			continue
		party_type = party_type or doc.get("quotation_to") or doc.get("party_type")
		if not party_type or not documentos._exists(party_type):
			continue
		party = doc.get(fieldname)
		if primary_field and frappe.get_meta(party_type).has_field(primary_field):
			contact_emails(frappe.db.get_value(party_type, party, primary_field), "contacto")
		if can_contact:
			linked = frappe.get_all(
				"Dynamic Link",
				filters={"parenttype": "Contact", "link_doctype": party_type, "link_name": party},
				pluck="parent",
				limit_page_length=5,
			)
			for contact in linked:
				contact_emails(contact, "contacto")
		if frappe.get_meta(party_type).has_field("email_id") and frappe.has_permission(
			party_type, "read", party
		):
			add(frappe.db.get_value(party_type, party, "email_id"), party_name, "cliente")
	return out


def _empresa(doc):
	company = cstr(doc.get("company")).strip() if doc.meta.has_field("company") else ""
	if not company:
		company = cstr(frappe.defaults.get_user_default("Company") or frappe.db.get_default("company"))
	return company


def dinero(amount, symbol=""):
	"""«$420.00» as es-MX writes it: a one-character symbol sticks to the number, a code
	(«USD») keeps its space. Frappe's fmt_money always puts a space after the symbol."""
	from frappe.utils import fmt_money

	number = fmt_money(flt(amount))
	symbol = cstr(symbol).strip()
	if not symbol:
		return number
	return f"{symbol}{number}" if len(symbol) == 1 else f"{symbol} {number}"


def _monto(doc):
	for field in ("grand_total", "rounded_total", "paid_amount", "total"):
		if doc.meta.has_field(field) and flt(doc.get(field)):
			currency = doc.get("currency")
			symbol = (
				(frappe.db.get_value("Currency", currency, "symbol", cache=True) or currency)
				if currency
				else ""
			)
			return dinero(doc.get(field), symbol)
	return ""


def _asunto_base(doc):
	empresa = _empresa(doc)
	asunto = f"{etiqueta(doc.doctype)} {doc.name}"
	return f"{asunto} de {empresa}" if empresa else asunto


def articulo(noun):
	"""«la» or «el» for a document noun (its first word decides: la factura, el pedido)."""
	first = cstr(noun).strip().lower().split(" ")[0]
	return "la" if first.endswith(("a", "ón", "d")) or first == "orden" else "el"


def _cuerpo_base(doc, para_nombre=""):
	saludo = f"Hola {para_nombre}," if para_nombre and "@" not in para_nombre else "Hola,"
	noun = etiqueta(doc.doctype).lower()
	monto = _monto(doc)
	linea = f"Te compartimos {articulo(noun)} {noun} {doc.name}"
	if monto:
		linea += f" por {monto}"
	user = frappe.session.user
	firma = "" if user in ("Administrator", "Guest") else (get_fullname(user) or "")
	empresa = _empresa(doc)
	return "\n\n".join(
		p
		for p in (
			saludo,
			linea + ".",
			"Cualquier duda, responde a este correo.",
			"Saludos,\n" + "\n".join(x for x in (firma if "@" not in firma else "", empresa) if x),
		)
		if p
	).strip()


def _render(plantilla, doc):
	"""`{asunto, cuerpo}` of an Email Template filled with the record (plain text, no Jinja)."""
	from frappe.email.doctype.email_template.email_template import get_email_template

	data = doc.as_dict(convert_dates_to_str=True)
	# Frappe passes the fields bare (`{{ title }}`); Notifications and most templates in the
	# wild write `{{ doc.title }}`, so both work.
	data["doc"] = frappe._dict(data)
	rendered = get_email_template(plantilla, data)
	return {
		"asunto": sin_jinja(texto_plano(rendered.get("subject"), limite=MAX_ASUNTO)),
		"cuerpo": sin_jinja(texto_plano(rendered.get("message"))),
	}


def _plantillas(doc):
	"""Email Templates the worker can read, each previewed against this record; the ones that
	do not fill in are left out and counted, English or other-document ones are left out
	(`plantilla_visible`)."""
	usadas = Counter(
		frappe.get_all(
			"Communication",
			filters={"reference_doctype": doc.doctype, "email_template": ["is", "set"]},
			pluck="email_template",
			order_by="creation desc",
			limit_page_length=500,
		)
	)
	out, fallidas = [], 0
	campos = {df.fieldname for df in doc.meta.fields}
	for row in frappe.get_list(
		"Email Template",
		fields=["name", "subject", "response", "response_html", "use_html"],
		order_by="name asc",
		limit_page_length=50,
	):
		name = row.name
		try:
			filled = _render(name, doc)
		except Exception:
			fallidas += 1
			continue
		fuente = cstr(row.subject) + " " + cstr(row.response_html if row.use_html else row.response)
		if not plantilla_visible(filled["asunto"], filled["cuerpo"], fuente, campos, usadas.get(name, 0)):
			continue
		resumen = re.sub(r"\s+", " ", f"{filled['asunto']} · {filled['cuerpo']}").strip(" ·")
		out.append(
			{
				"name": name,
				"label": _(name),
				"asunto": filled["asunto"],
				"vista": resumen[: SNIPPET - 1] + "…" if len(resumen) > SNIPPET else resumen,
				"usada": usadas.get(name, 0),
				"encaja": encaja(fuente, campos),
			}
		)
	out.sort(key=lambda p: (-p["usada"], not p["encaja"], p["label"].lower()))
	return out, fallidas


def _formatos(doctype):
	if not frappe.has_permission(doctype, "print"):
		return []
	try:
		return documentos.print_formats(doctype)
	except frappe.PermissionError:
		return []


@frappe.whitelist()
def borrador(doctype: str, name: str, plantilla: str | None = None):
	"""Everything «Enviar por correo» needs for a record: who to write to, subject and body (from a
	template filled with the record, or a short default), the templates with previews, the PDF
	formats, the sending account, and whether this worker may send (with the reason when not)."""
	doc = _documento(doctype, name)
	sugerencias = _sugerencias(doc)
	plantillas, fallidas = _plantillas(doc)
	asunto, cuerpo, aviso = (
		_asunto_base(doc),
		_cuerpo_base(doc, sugerencias[0]["nombre"] if sugerencias else ""),
		None,
	)
	if plantilla:
		try:
			filled = _render(plantilla, doc)
			asunto, cuerpo = filled["asunto"] or asunto, filled["cuerpo"] or cuerpo
		except frappe.PermissionError:
			aviso = _("You cannot use that template. Ask your manager for access.")
		except Exception:
			aviso = _("That template could not be filled with this document; the default message is shown.")
	cuenta = _cuenta_salida(doctype)
	pausa = _emails_en_pausa()
	puede, motivo = True, None
	if not frappe.has_permission(doctype, "email", doc):
		puede, motivo = (
			False,
			_("Your user cannot send emails from this document. Ask your manager for access."),
		)
	elif not cuenta:
		puede, motivo = (
			False,
			_("There is no email account to send from. Ask the owner to set one up in Ajustes."),
		)
	return {
		"doctype": doctype,
		"name": doc.name,
		"etiqueta": etiqueta(doctype),
		"titulo": _titulo(doc),
		"para": sugerencias,
		"asunto": asunto,
		"cuerpo": cuerpo,
		"plantilla": plantilla or None,
		"aviso": aviso,
		"plantillas": plantillas,
		"plantillas_omitidas": fallidas,
		"plantillas_aviso": (
			_("{0} templates could not be filled with this document and are not shown.").format(fallidas)
			if fallidas
			else None
		),
		"formatos": _formatos(doctype),
		"remitente": (
			{"nombre": cstr(cuenta.get("email_account_name") or cuenta.name), "correo": cstr(cuenta.email_id)}
			if cuenta
			else None
		),
		"en_pausa": pausa,
		"puede_enviar": puede,
		"motivo": motivo,
	}


def _clave_idem(request_id):
	return f"crm:correo:enviar:{frappe.session.user}:{cstr(request_id)[:80]}"


def _idioma_pdf():
	lang = cstr(frappe.local.lang)
	if lang.startswith("es"):
		return lang
	return "es-MX" if frappe.db.exists("Language", "es-MX") else (lang or None)


@frappe.whitelist(methods=["POST"])
def enviar(
	doctype: str,
	name: str,
	para: str | list,
	asunto: str,
	cuerpo: str,
	cc: str | list | None = None,
	formato: str | None = None,
	adjuntar_pdf: int | str = 1,
	plantilla: str | None = None,
	request_id: str | None = None,
	en_respuesta_a: str | None = None,
):
	"""Send the email exactly as the worker confirmed it, through Frappe's `make()` (it checks
	`email` on the record, queues the message and attaches the PDF of `formato`). The same
	`request_id` within 10 minutes returns the first result instead of sending twice."""
	from frappe.core.doctype.communication.email import make

	cache = frappe.cache()
	key = _clave_idem(request_id) if request_id else None
	if key:
		previous = cache.get_value(key)
		if previous:
			return previous

	if doctype == "Communication":
		original = _require_mensaje(name)
		doc = None
		if not frappe.has_permission("Communication", "email", original):
			_no_email()
	else:
		doc = _documento(doctype, name)
		original = None
		if not frappe.has_permission(doctype, "email", doc):
			_no_email()
	if en_respuesta_a:
		_require_mensaje(en_respuesta_a)

	recipients = separar_correos(para)
	copies = [e for e in separar_correos(cc) if e not in recipients] if cc else []
	if not recipients:
		frappe.throw(_("Add at least one recipient."), frappe.ValidationError)
	if len(recipients) + len(copies) > MAX_PARA:
		frappe.throw(_("Send to at most {0} addresses at a time.").format(MAX_PARA), frappe.ValidationError)
	for email in recipients + copies:
		if not correo_valido(email):
			frappe.throw(_("Check this address: {0}").format(escape_html(email)), frappe.ValidationError)
	asunto = re.sub(r"\s+", " ", cstr(asunto)).strip()[:MAX_ASUNTO]
	cuerpo = cstr(cuerpo).strip()[:MAX_CUERPO]
	if not asunto:
		frappe.throw(_("Write a subject."), frappe.ValidationError)
	if not cuerpo:
		frappe.throw(_("Write the message."), frappe.ValidationError)

	print_format = None
	if doc is not None and cint(adjuntar_pdf):
		if not frappe.has_permission(doctype, "print", doc):
			frappe.throw(
				_("Your user cannot print this document, so the PDF cannot go."), frappe.PermissionError
			)
		valid = {f["name"] for f in _formatos(doctype)}
		print_format = formato or frappe.get_meta(doctype).default_print_format or "Standard"
		if print_format not in valid:
			frappe.throw(_("That PDF format is not available for this document."), frappe.ValidationError)
	if plantilla and not frappe.db.exists("Email Template", plantilla):
		plantilla = None
	if not _cuenta_salida(doctype):
		frappe.throw(
			_("There is no email account to send from. Ask the owner to set one up in Ajustes."),
			frappe.ValidationError,
		)

	ref_doctype, ref_name = (doctype, doc.name) if doc is not None else (None, None)
	if original is not None and original.reference_doctype and original.reference_name:
		ref_doctype, ref_name = original.reference_doctype, original.reference_name
	sent = make(
		doctype=ref_doctype,
		name=ref_name,
		content=html_de_texto(cuerpo),
		subject=asunto,
		recipients=", ".join(recipients),
		cc=", ".join(copies) or None,
		send_email=1,
		print_format=print_format,
		print_letterhead=1,
		print_language=_idioma_pdf(),
		email_template=plantilla,
		in_reply_to=en_respuesta_a or (original.name if original is not None else None),
	)
	result = {
		"comunicacion": sent.get("name"),
		"para": recipients,
		"cc": copies,
		"asunto": asunto,
		"pdf": print_format,
		"no_enviado_a": [e for e in separar_correos(sent.get("emails_not_sent_to") or "")],
		"ruta": documentos_ruta(ref_doctype, ref_name) if ref_doctype else None,
	}
	if key:
		cache.set_value(key, result, expires_in_sec=IDEMPOTENCIA_SEG)
	return result


# ── Thread of a record ────────────────────────────────────────────────────────────────────────

_HILO_FIELDS = """
	C.name, C.communication_type, C.communication_medium, C.communication_date, C.content,
	C.text_content, C.sender, C.sender_full_name, C.recipients, C.cc, C.subject,
	C.sent_or_received, C.has_attachment, C.seen, C.in_reply_to, C.delivery_status,
	C.creation AS creation
"""


def _fila_hilo(row, nombres, adjuntos):
	de = _remitente(row, nombres)
	return {
		"name": row.name,
		"asunto": cstr(row.subject).strip() or _("(no subject)"),
		"de": de,
		"para": separar_correos(row.recipients or ""),
		"fecha": cstr(row.communication_date),
		"direccion": "recibido" if row.sent_or_received == "Received" else "enviado",
		"automatico": row.communication_type == "Automated Message" or not row.sender,
		"snippet": texto_plano(row.text_content or row.content, limite=SNIPPET),
		"adjuntos": adjuntos.get(row.name, 0) or (1 if cint(row.get("has_attachment")) else 0),
		"estado": cstr(row.delivery_status) or None,
		"leido": bool(cint(row.seen)) or row.sent_or_received != "Received",
	}


@frappe.whitelist()
def hilo(doctype: str, name: str, limite: int | str = 30):
	"""The record's emails (linked by reference or timeline link), newest first, as Desk's form
	timeline shows them to whoever reads the record."""
	from frappe.desk.form.load import get_communication_data

	doc = _documento(doctype, name)
	rows = [
		frappe._dict(r)
		for r in get_communication_data(
			doctype, doc.name, start=0, limit=max(1, min(cint(limite) or 30, 100)), fields=_HILO_FIELDS
		)
	]
	rows = [r for r in rows if r.communication_medium == "Email"]
	nombres = _nombres(_remitente(r, {})["correo"] for r in rows)
	adjuntos = _adjuntos([r.name for r in rows])
	return {
		"correos": [_fila_hilo(r, nombres, adjuntos) for r in rows],
		"puede_enviar": bool(frappe.has_permission(doctype, "email", doc)),
	}


# ── Queue ─────────────────────────────────────────────────────────────────────────────────────

_BANDEJA_FIELDS = [
	"name",
	"subject",
	"sender",
	"sender_full_name",
	"recipients",
	"communication_type",
	"sent_or_received",
	"seen",
	"communication_date",
	"reference_doctype",
	"reference_name",
	"has_attachment",
	"email_account",
]
VISTAS = ("recibidos", "enviados", "todo")


def _en_vista(row, vista):
	if vista == "recibidos":
		return row.get("sent_or_received") == "Received"
	if vista == "enviados":
		return row.get("sent_or_received") != "Received"
	return True


def _cuentas(rows):
	"""Accounts this worker reads mail of (all for System Manager / Super Email User, else their
	User Email rows), with how many received messages are still unread in the window."""
	roles = frappe.get_roles()
	if "System Manager" in roles or "Super Email User" in roles:
		used = list({r.get("email_account") for r in rows if r.get("email_account")})
		accounts = frappe.get_all(
			"Email Account",
			or_filters={"enable_incoming": 1, "name": ["in", used or [""]]},
			fields=["name", "email_id", "email_account_name"],
			order_by="name asc",
		)
	else:
		accounts = [
			frappe._dict(name=r.email_account, email_id=r.email_id, email_account_name=r.email_account)
			for r in frappe.get_all(
				"User Email", filters={"parent": frappe.session.user}, fields=["email_account", "email_id"]
			)
		]
	sin_leer = {}
	for row in rows:
		if row.get("sent_or_received") == "Received" and not cint(row.get("seen")):
			sin_leer[row.get("email_account")] = sin_leer.get(row.get("email_account"), 0) + 1
	return [
		{
			"name": a.name,
			"nombre": cstr(a.email_account_name or a.name),
			"correo": cstr(a.email_id),
			"sin_leer": sin_leer.get(a.name, 0),
		}
		for a in accounts
	]


def _fila_bandeja(row, nombres, docs, snippets, adjuntos):
	de = _remitente(row, nombres)
	recibido = row.get("sent_or_received") == "Received"
	para = separar_correos(row.get("recipients") or "")
	key = (row.get("reference_doctype"), row.get("reference_name"))
	return {
		"tipo": "correo",
		"name": row.name,
		"de": de,
		"para": [{"correo": e, "nombre": nombres.get(e) or e} for e in para],
		"asunto": cstr(row.subject).strip() or _("(no subject)"),
		"snippet": snippets.get(row.name, ""),
		"fecha": cstr(row.communication_date),
		"direccion": "recibido" if recibido else "enviado",
		"leido": (not recibido) or bool(cint(row.seen)),
		"documento": docs.get(key) if key[0] else None,
		"adjuntos": adjuntos.get(row.name, 0) or (1 if cint(row.has_attachment) else 0),
	}


def _fila_categoria(categoria, nombres, vista):
	rows = categoria["filas"]
	newest = rows[0]
	remitentes, asuntos = [], []
	for row in rows:
		nombre = _remitente(row, nombres)["nombre"]
		if nombre not in remitentes and len(remitentes) < 3:
			remitentes.append(nombre)
		subject = re.sub(r"^[^\w¿¡]+", "", cstr(row.subject)).strip()
		if subject and subject not in asuntos and len(asuntos) < 2:
			asuntos.append(subject)
	nuevos = sum(1 for r in rows if r.get("sent_or_received") == "Received" and not cint(r.get("seen")))
	if categoria["tipo"] == "sistema":
		titulo = _("System alerts")
	else:
		titulo = asuntos[0] if asuntos else _("Repeated emails")
	return {
		"tipo": "categoria",
		"clave": categoria["clave"],
		"categoria": categoria["tipo"],
		"titulo": titulo,
		"total": len(rows),
		"nuevos": nuevos,
		"remitentes": remitentes,
		"asuntos": asuntos,
		"fecha": cstr(newest.get("communication_date")),
		"vista": vista,
	}


@frappe.whitelist()
def bandeja(
	cuenta: str | None = None,
	vista: str = "recibidos",
	buscar: str | None = None,
	categoria: str | None = None,
	inicio: int | str = 0,
	limite: int | str = 30,
):
	"""The Correo queue: emails this worker can read (Frappe's own visibility), newest first, with
	alerts and repeated subjects folded into category rows on the first page. `categoria` opens one
	of those rows as a plain list."""
	vista = vista if vista in VISTAS else "recibidos"
	inicio = max(0, cint(inicio))
	limite = max(1, min(cint(limite) or 30, LIMITE_PAGINA))
	filters = {
		"communication_medium": "Email",
		"communication_type": ["in", ["Communication", "Automated Message"]],
	}
	if cuenta:
		filters["email_account"] = cuenta
	or_filters = None
	term = cstr(buscar).strip()[: documentos.MAX_SEARCH]
	if term:
		like = f"%{term}%"
		or_filters = {
			"subject": ["like", like],
			"sender": ["like", like],
			"recipients": ["like", like],
			"sender_full_name": ["like", like],
		}
	window = frappe.get_list(
		"Communication",
		filters=filters,
		or_filters=or_filters,
		fields=_BANDEJA_FIELDS,
		order_by="communication_date desc, creation desc",
		limit_page_length=VENTANA,
	)
	propios = _propios()
	conteos = {
		"recibidos": sum(1 for r in window if _en_vista(r, "recibidos")),
		"enviados": sum(1 for r in window if _en_vista(r, "enviados")),
		"sin_leer": sum(1 for r in window if r.sent_or_received == "Received" and not cint(r.seen)),
	}
	rows = [r for r in window if _en_vista(r, vista)]
	if categoria:
		categorias, filas = [], en_categoria(rows, categoria, propios)
	elif term:
		categorias, filas = [], rows  # a search shows every match, alerts included
	else:
		categorias, filas = agrupar(rows, propios)
	page = filas[inicio : inicio + limite]

	nombres = _nombres(
		[_remitente(r, {})["correo"] for r in page]
		+ [e for r in page for e in separar_correos(r.recipients or "")]
		+ [_remitente(r, {})["correo"] for c in categorias for r in c["filas"][:6]]
	)
	snippets = {}
	if page:
		for r in frappe.get_list(
			"Communication",
			filters={"name": ["in", [p.name for p in page]]},
			fields=["name", "content", "text_content"],
			limit_page_length=len(page),
		):
			snippets[r.name] = texto_plano(r.text_content or r.content, limite=SNIPPET)
	docs = _documentos_de(page)
	adjuntos = _adjuntos([p.name for p in page])
	return {
		"vista": vista,
		"categoria": categoria or None,
		"categoria_titulo": (
			_fila_categoria(
				{"clave": categoria, "tipo": categoria.split(":")[0], "filas": filas}, nombres, vista
			)["titulo"]
			if categoria and filas
			else None
		),
		"categorias": [_fila_categoria(c, nombres, vista) for c in categorias] if inicio == 0 else [],
		"filas": [_fila_bandeja(r, nombres, docs, snippets, adjuntos) for r in page],
		"inicio": inicio,
		"siguiente": inicio + limite if len(filas) > inicio + limite else None,
		"total": len(filas),
		"recortado": len(window) >= VENTANA,
		"conteos": conteos,
		"cuentas": _cuentas(window) if inicio == 0 else None,
	}


# ── One message ───────────────────────────────────────────────────────────────────────────────


def _tarjeta(doctype, name):
	"""The linked record's summary card: what it is, whose, its state and total."""
	if not doctype or not name or doctype == "Communication" or not documentos._exists(doctype):
		return None
	meta = frappe.get_meta(doctype)
	card = {"doctype": doctype, "etiqueta": etiqueta(doctype), "nombre": name, "titulo": "", "ruta": None}
	if meta.issingle:
		card["titulo"] = etiqueta(doctype)
		return card
	if not documentos.readable(doctype) or not frappe.db.exists(doctype, name):
		return card
	if not frappe.has_permission(doctype, "read", name):
		return card
	doc = frappe.get_doc(doctype, name)
	card.update(
		{
			"titulo": _titulo(doc),
			"estado": cstr(doc.get("status")) or None if meta.has_field("status") else None,
			"docstatus": cint(doc.docstatus),
			"total": flt(doc.get("grand_total")) if meta.has_field("grand_total") else None,
			"moneda": cstr(doc.get("currency")) or None if meta.has_field("currency") else None,
			"ruta": documentos_ruta(doctype, name),
		}
	)
	return card


def _cadena(comm):
	"""The conversation around a message: what it answers (up the in_reply_to chain) and what
	answered it, oldest first, only what this worker may open."""
	chain, seen, current = [], {comm.name}, comm.in_reply_to
	while current and current not in seen and len(chain) < 10:
		seen.add(current)
		if not frappe.db.exists("Communication", current) or not _visible(current):
			break
		chain.insert(0, current)
		current = frappe.db.get_value("Communication", current, "in_reply_to")
	replies = [
		n
		for n in frappe.get_all(
			"Communication",
			filters={"in_reply_to": comm.name},
			pluck="name",
			order_by="communication_date asc",
			limit_page_length=10,
		)
		if n not in seen and _visible(n)
	]
	names = [*chain, *replies]
	if not names:
		return []
	rows = frappe.get_all(
		"Communication",
		filters={"name": ["in", names]},
		fields=[
			"name",
			"subject",
			"sender",
			"sender_full_name",
			"recipients",
			"communication_type",
			"communication_date",
			"content",
			"text_content",
			"sent_or_received",
			"seen",
			"has_attachment",
			"in_reply_to",
			"delivery_status",
		],
	)
	nombres = _nombres(_remitente(r, {})["correo"] for r in rows)
	by_name = {r.name: _fila_hilo(r, nombres, {}) for r in rows}
	out = [by_name[n] for n in names if n in by_name]
	for item in out:
		item["antes"] = item["name"] in chain
	return out


def _pdf_enviado(comm, files=()):
	"""The PDF Frappe attached when this email went with a print format: it is described in the
	Email Queue row (`print_format_attachment`), not saved as a File unless the site stores sent
	PDFs. `{nombre, formato}` or None; None too when that PDF is already among the files."""
	if not comm.reference_doctype or not comm.reference_name:
		return None
	try:
		rows = frappe.get_all(
			"Email Queue", filters={"communication": comm.name}, pluck="attachments", limit=3
		)
	except Exception:
		return None
	for raw in rows:
		try:
			items = json.loads(raw or "[]")
		except ValueError:
			continue
		for item in items if isinstance(items, list) else []:
			if not isinstance(item, dict) or not cint(item.get("print_format_attachment")):
				continue
			# as frappe.attach_print names it: no spaces, «/» → «-»
			base = cstr(item.get("name") or comm.reference_name).replace(" ", "").replace("/", "-")
			nombre = f"{base}.pdf"
			if any(cstr(f.get("file_name")) == nombre for f in files):
				return None
			return {"nombre": nombre, "formato": cstr(item.get("print_format")) or "Standard"}
	return None


@frappe.whitelist()
def mensaje(name: str):
	"""One email: sanitised HTML and plain text, who/when, attachments, its conversation and the
	linked record's summary card. Read only; `marcar_leido` marks it seen."""
	from frappe.utils.html_utils import clean_email_html

	comm = _require_mensaje(name)
	nombres = _nombres(
		[
			_remitente(comm, {})["correo"],
			*separar_correos(comm.recipients or ""),
			*separar_correos(comm.cc or ""),
		]
	)
	content = cstr(comm.content)
	es_html = bool(re.search(r"<[a-z][\s\S]*>", content, re.I))
	files = frappe.get_all(
		"File",
		filters={"attached_to_doctype": "Communication", "attached_to_name": comm.name},
		fields=["name", "file_name", "file_url", "file_size", "is_private"],
		order_by="creation asc",
	)
	recibido = comm.sent_or_received == "Received"
	can_write = bool(comm.has_permission("write"))  # a UI hint: marcar_leido/vincular check again
	return {
		"name": comm.name,
		"asunto": cstr(comm.subject).strip() or _("(no subject)"),
		"de": _remitente(comm, nombres),
		"para": [
			{"correo": e, "nombre": nombres.get(e) or e} for e in separar_correos(comm.recipients or "")
		],
		"cc": [{"correo": e, "nombre": nombres.get(e) or e} for e in separar_correos(comm.cc or "")],
		"fecha": cstr(comm.communication_date),
		"direccion": "recibido" if recibido else "enviado",
		"automatico": comm.communication_type == "Automated Message" or not comm.sender,
		"html": clean_email_html(content) if es_html else "",
		"texto": texto_plano(comm.text_content or content),
		"adjuntos": [
			{"name": f.name, "nombre": f.file_name, "url": f.file_url, "tamano": cint(f.file_size)}
			for f in files
		],
		"pdf_enviado": _pdf_enviado(comm, files),
		"documento": _tarjeta(comm.reference_doctype, comm.reference_name),
		"hilo": _cadena(comm),
		"leido": (not recibido) or bool(cint(comm.seen)),
		"estado": cstr(comm.delivery_status) or None,
		"puede_responder": bool(
			comm.reference_doctype
			and comm.reference_name
			and comm.reference_doctype != "Communication"
			and documentos._exists(comm.reference_doctype)
			and frappe.has_permission(comm.reference_doctype, "email", comm.reference_name)
		)
		or bool(frappe.has_permission("Communication", "email", comm)),
		"puede_vincular": can_write,
		"puede_marcar": can_write and recibido,
		"responder": {
			"para": (
				[_remitente(comm, nombres)["correo"]] if recibido else separar_correos(comm.recipients or "")
			),
			"asunto": cstr(comm.subject)
			if _PREFIJOS.match(cstr(comm.subject))
			else f"Re: {cstr(comm.subject)}",
			"doctype": comm.reference_doctype
			if comm.reference_doctype and comm.reference_doctype != "Communication"
			else "Communication",
			"name": comm.reference_name
			if comm.reference_doctype and comm.reference_doctype != "Communication"
			else comm.name,
		},
	}


@frappe.whitelist(methods=["POST"])
def marcar_leido(name: str, leido: int | str = 1):
	"""Mark a received email seen (or unseen) for everyone reading the account, when the worker
	may change Communications."""
	comm = _require_mensaje(name)
	if not frappe.has_permission("Communication", "write", comm):
		frappe.throw(_("Your user cannot change this email."), frappe.PermissionError)
	value = 1 if cint(leido) else 0
	if cint(comm.seen) != value:
		comm.db_set("seen", value, update_modified=False)
	return {"name": comm.name, "leido": bool(value)}


@frappe.whitelist(methods=["POST"])
def vincular(name: str, doctype: str, docname: str):
	"""Link a received email to a record (reference + timeline link) so it shows in the record's
	Actividad; returns the record's route."""
	comm = _require_mensaje(name)
	if not frappe.has_permission("Communication", "write", comm):
		frappe.throw(_("Your user cannot change this email."), frappe.PermissionError)
	target = _documento(doctype, docname)
	if (
		not comm.reference_doctype
		or comm.sent_or_received == "Received"
		or comm.reference_doctype == "Communication"
	):
		comm.reference_doctype, comm.reference_name = doctype, target.name
	if not any(
		link.link_doctype == doctype and link.link_name == target.name for link in comm.timeline_links or []
	):
		comm.add_link(doctype, target.name)
	comm.save()
	return {
		"name": comm.name,
		"documento": _tarjeta(doctype, target.name),
		"ruta": documentos_ruta(doctype, target.name),
	}
