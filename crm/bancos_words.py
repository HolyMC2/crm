"""Worker words for Bancos (bench-free, so the tests run without Frappe).

Bank statements arrive as «SPEI RECIBIDOMercado Pago | liquidación 17/ABR | corte 2026-04-20»;
the shell shows «Transferencia recibida · Mercado Pago», as a bank app does. Account names lose
the company suffix («Bancos - GD» → «Bancos»), balances read in their natural sign, and voucher
kinds become words («Cobro», «Póliza»).
"""

import re

# First segment of the statement line → what happened, in the worker's words.
_KINDS = (
	(re.compile(r"^SPEI\s*RECIBIDO\s*(?P<rest>.*)$", re.I), "Transferencia recibida"),
	(re.compile(r"^SPEI\s*ENVIADO\s*(?P<rest>.*)$", re.I), "Transferencia enviada"),
	(re.compile(r"^DEPOSITO\s*EFECTIVO\s*(?P<rest>.*)$", re.I), "Depósito en efectivo"),
	(re.compile(r"^DEPOSITO\s*(?:TPV|TERMINAL)\s*(?P<rest>.*)$", re.I), "Depósito de la terminal"),
	(re.compile(r"^DEPOSITO\s*CLIENTE\s*(?P<rest>.*)$", re.I), "Depósito de cliente"),
	(re.compile(r"^DEP[OÓ]SITO\s*(?P<rest>.*)$", re.I), "Depósito"),
	(re.compile(r"^PAGO\s*TARJETA\s*DE\s*CREDITO\s*(?P<rest>.*)$", re.I), "Pago de tarjeta de crédito"),
	(re.compile(r"^PAGO\s*CUENTA\s*DE\s*TERCERO\s*(?P<rest>.*)$", re.I), "Pago a cuenta de tercero"),
	(re.compile(r"^PAGO\s*REFERENCIADO\s*SAT\s*(?P<rest>.*)$", re.I), "Pago al SAT"),
	(re.compile(r"^SAT\b\s*(?P<rest>.*)$", re.I), "Pago al SAT"),
	(re.compile(r"^IVA\s*COMISI[OÓ]N\s*(?P<rest>.*)$", re.I), "IVA de la comisión"),
	(re.compile(r"^COMISI[OÓ]N\s*(?P<rest>.*)$", re.I), "Comisión del banco"),
	(re.compile(r"^RETIRO\s*(?P<rest>.*)$", re.I), "Retiro"),
	(re.compile(r"^TRASPASO\s*(?P<rest>.*)$", re.I), "Traspaso"),
	(re.compile(r"^INTERESES?\s*(?P<rest>.*)$", re.I), "Intereses"),
)
_KEEP_UPPER = {"SAT", "IVA", "OXXO", "SPEI", "CFE", "IMSS", "BBVA", "HSBC", "TPV", "ISR", "RFC"}
_SMALL = {"de", "del", "la", "las", "el", "los", "y", "en", "por", "a"}


def _words(text):
	"""«MERCADO PAGO» → «Mercado Pago»; mixed case stays as the bank wrote it."""
	text = re.sub(r"\s+", " ", (text or "")).strip(" -·|")
	if not text or text != text.upper():
		return text
	out = []
	for index, word in enumerate(text.split(" ")):
		if word in _KEEP_UPPER:
			out.append(word)
		elif index and word.lower() in _SMALL:
			out.append(word.lower())
		else:
			out.append(word[:1] + word[1:].lower())
	return " ".join(out)


def movement_words(description, party_name, amount):
	"""{title, detail} for a bank movement: who (the party) or what happened, then the rest."""
	first = (description or "").split("|")[0].strip()
	kind, rest = None, first
	for pattern, label in _KINDS:
		found = pattern.match(first)
		if found:
			kind, rest = label, found.group("rest")
			break
	rest = _words(rest)
	if party_name:
		return {"title": party_name, "detail": kind or rest or ("Entrada" if amount > 0 else "Salida")}
	if kind:
		return {"title": kind, "detail": rest}
	if first:
		text = _words(first)
		return {"title": text[:1].upper() + text[1:], "detail": ""}
	return {"title": "Entrada" if amount > 0 else "Salida", "detail": ""}


def last4(number):
	"""«••3697» from an account number, CLABE, IBAN or mask; «» without digits."""
	digits = re.sub(r"\D", "", str(number or ""))
	return digits[-4:] if digits else ""


def _sentence(text):
	"""«UTILIZACIÓN DE FONDOS (ACTIVOS)» → «Utilización de fondos (activos)»; acronyms stay."""
	if not text or text != text.upper() or not re.search(r"[A-ZÁÉÍÓÚÑ]{2}", text):
		return text
	out = []
	for index, word in enumerate(text.split(" ")):
		bare = word.strip("()[],.;:")
		if bare in _KEEP_UPPER:
			out.append(word)
		elif index == 0:
			out.append(word[:1] + word[1:].lower())
		else:
			out.append(word.lower())
	return " ".join(out)


def account_display(name, abbr=""):
	"""Account names without the company suffix ERPNext adds («Bancos - GD» → «Bancos»),
	in sentence case when the chart was typed in capitals."""
	name = (name or "").strip()
	if abbr and name.endswith(f" - {abbr}"):
		name = name[: -len(f" - {abbr}")]
	return _sentence(name)


def natural_sign(root_type):
	"""+1 where a debit grows the account (Activo, Gastos), -1 where a credit does."""
	return 1 if root_type in ("Asset", "Expense") else -1


_ROOT_WORDS = {
	"Asset": "Activo",
	"Liability": "Pasivo",
	"Equity": "Capital",
	"Income": "Ingresos",
	"Expense": "Gastos",
}


def root_word(root_type):
	return _ROOT_WORDS.get(root_type or "", "")


_VOUCHER_WORDS = {
	"Sales Invoice": "Venta",
	"POS Invoice": "Venta en caja",
	"Purchase Invoice": "Compra",
	"Journal Entry": "Póliza",
	"Expense Claim": "Gasto",
	"Stock Entry": "Movimiento de inventario",
	"Stock Reconciliation": "Ajuste de inventario",
	"Purchase Receipt": "Recepción",
	"Delivery Note": "Entrega",
	"Period Closing Voucher": "Cierre del ejercicio",
	"Bank Transaction": "Movimiento bancario",
	"Landed Cost Voucher": "Costo de importación",
	"Asset": "Activo fijo",
	"Asset Capitalization": "Capitalización",
	"Invoice Discounting": "Descuento de facturas",
}
_PAYMENT_WORDS = {"Receive": "Cobro", "Pay": "Pago", "Internal Transfer": "Traspaso"}


def voucher_word(doctype, payment_type=None):
	if doctype == "Payment Entry":
		return _PAYMENT_WORDS.get(payment_type or "", "Pago")
	return _VOUCHER_WORDS.get(doctype or "", "Documento")


def reference_key(value):
	"""Compare references as the bank and the books write them: digits and letters only."""
	return re.sub(r"[^0-9A-Z]", "", str(value or "").upper()).lstrip("0")


def parse_amount(text):
	"""«1,500», «$1500.00», «-775» → 1500.0 / 775.0; None when the search is not an amount."""
	cleaned = re.sub(r"[\s$]", "", str(text or ""))
	if re.fullmatch(r"\d{7,}", cleaned):
		return None  # a long run of digits is a reference (SPEI, folio), not an amount
	if not re.fullmatch(r"[-+−]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|[-+−]?\d+(?:\.\d{1,2})?", cleaned):
		return None
	return abs(float(cleaned.replace(",", "").replace("−", "-")))
