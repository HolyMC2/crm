"""Bancos y catálogo de cuentas in the shell (Shell SPEC §6 DD19, session D11).

Screen-shaped reads and one-tap actions over ERPNext's ledger:

- ``cuentas``: bank, card and cash accounts as cards (book balance from the GL, the bank's
  own balance where syncfy_connector keeps it, movements still to reconcile).
- ``movimientos``: one account's movements, the bank's (Bank Transaction) or the books' (GL).
- ``movimiento`` / ``conciliar`` / ``deshacer`` / ``crear_pago``: reconcile a bank movement.
  Where Contador (erpnext_mexico_compliance) is installed and its «bank_automation» tier is on,
  it owns bank reconciliation on the site: these calls go through its audited service
  (fingerprints, period locks, undo). Anywhere else they use ERPNext's own Bank
  Reconciliation Tool functions (``get_linked_payments``, ``reconcile_vouchers``).
- ``catalogo`` / ``cuenta_contable`` / ``balanza`` / ``crear_cuenta``: the chart of accounts as
  drill-down lists with balances, SAT código agrupador in words, the ledger (Mayor) of one
  account and the trial balance (Balanza).

Frappe permissions are the only wall: every list goes through ``frappe.get_list`` (User
Permissions by company apply), raw sums run only over accounts that list returned and only
for users who read GL Entry / Bank Transaction, and writes run as the user.
"""

import json
import re
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, get_first_day, get_last_day, getdate, today

from crm.bancos_words import (
	account_display,
	last4,
	movement_words,
	natural_sign,
	parse_amount,
	root_word,
	voucher_word,
)

CONTADOR = "erpnext_mexico_compliance"
PAGE = 50
MATCHABLE = ("Payment Entry", "Journal Entry")
OPEN_INVOICE = {"deposit": "Sales Invoice", "withdrawal": "Purchase Invoice"}
PERIODOS = ("mes", "mes-pasado", "anio", "todo")
ROOT_ORDER = {"Asset": 0, "Liability": 1, "Equity": 2, "Income": 3, "Expense": 4}


# ---------------------------------------------------------------- gates and helpers


def _erpnext():
	return "erpnext" in frappe.get_installed_apps() and bool(frappe.db.exists("DocType", "Bank Account"))


def _blocked():
	modules = frappe.get_all("Block Module", filters={"parent": frappe.session.user}, pluck="module")
	return "Accounts" in modules


def _may(doctype, ptype="read", doc=None):
	"""A capability flag for the screen, never a gate.

	The wall is elsewhere: every list goes through ``frappe.get_list``, every document
	through ``check_permission`` and every write runs as the user, so a flag that says
	«show this button» cannot grant anything on its own.
	"""
	# nosemgrep: unchecked-frappe-permission-call
	return bool(frappe.has_permission(doctype, ptype, doc))


def get_capabilities():
	"""What this worker may do here; the module is on when they read Bank Account or Account."""
	if not _erpnext():
		return {"enabled": False, "reason": "Este sitio no lleva contabilidad.", "capabilities": {}}
	if frappe.session.user == "Guest" or _blocked():
		return {"enabled": False, "reason": "Pide a tu encargado acceso a Bancos.", "capabilities": {}}
	bancos = _may("Bank Account")
	saldos = _may("GL Entry")
	# ERPNext lets sellers and cashiers read Account (for their pickers); the catalog with
	# balances is for who also reads the ledger, so the account names alone do not open it.
	catalogo = saldos and _may("Account")
	return {
		"enabled": bancos or catalogo,
		"reason": None if (bancos or catalogo) else "Pide a tu encargado acceso a Bancos.",
		"capabilities": {
			"bancos": bancos,
			"catalogo": catalogo,
			"saldos": saldos,
			"movimientos": _may("Bank Transaction"),
			"conciliar": _may("Bank Transaction", "write"),
			"crear_cuenta": _may("Account", "create"),
		},
	}


def check_bancos_permission():
	return bool(get_capabilities().get("enabled"))


def _require():
	answer = get_capabilities()
	if not answer["enabled"]:
		frappe.throw(answer["reason"], frappe.PermissionError)
	return answer["capabilities"]


def _company(company=None):
	company = (
		company
		or frappe.defaults.get_user_default("company")
		or frappe.defaults.get_global_default("company")
	)
	if (
		not company
		or not frappe.db.exists("Company", company)
		or not frappe.has_permission("Company", "read", company)
	):
		frappe.throw(_("No tienes acceso a esta empresa."), frappe.PermissionError)
	return company


def _empresas(current):
	"""Companies to switch between: the ones with a bank account the worker reads, and theirs."""
	names = set(frappe.get_list("Bank Account", filters={"is_company_account": 1}, pluck="company"))
	names.add(current)
	return sorted(
		name
		for name in names
		if name and frappe.db.exists("Company", name) and frappe.has_permission("Company", "read", name)
	)


def _abbr(company):
	return frappe.get_cached_value("Company", company, "abbr") or ""


def _currency(company):
	return frappe.get_cached_value("Company", company, "default_currency") or "MXN"


def _gl_sums(accounts, to_date=None):
	"""debit - credit per leaf account, in each account's currency (callers filtered the names)."""
	if not accounts or not frappe.has_permission("GL Entry", "read"):
		return {}
	condition = " AND posting_date <= %(to)s" if to_date else ""
	rows = frappe.db.sql(  # nosemgrep: frappe-sql-format-injection
		"SELECT account, SUM(debit_in_account_currency - credit_in_account_currency) "
		f"FROM `tabGL Entry` WHERE account IN %(accounts)s AND is_cancelled = 0{condition} "
		"GROUP BY account",
		{"accounts": tuple(accounts), "to": to_date},
	)
	return {account: flt(total, 2) for account, total in rows}


def _party_names(pairs):
	"""{(party_type, party): display name} for Customer, Supplier and Employee."""
	fields = {"Customer": "customer_name", "Supplier": "supplier_name", "Employee": "employee_name"}
	out = {}
	by_type = {}
	for party_type, party in pairs:
		if party_type in fields and party:
			by_type.setdefault(party_type, set()).add(party)
	for party_type, names in by_type.items():
		for row in frappe.get_all(
			party_type, filters={"name": ["in", list(names)]}, fields=["name", fields[party_type]]
		):
			out[(party_type, row.name)] = row.get(fields[party_type]) or row.name
	return out


def _voucher_labels(vouchers):
	"""{(doctype, name): {word, party, payment_type}} for the vouchers the worker can read."""
	out = {}
	pes = [name for doctype, name in vouchers if doctype == "Payment Entry"]
	if pes:
		for row in frappe.get_list(
			"Payment Entry",
			filters={"name": ["in", pes]},
			fields=["name", "payment_type", "party_type", "party", "party_name", "mode_of_payment"],
		):
			out[("Payment Entry", row.name)] = {
				"word": voucher_word("Payment Entry", row.payment_type),
				"party": row.party_name or row.party or "",
				"payment_type": row.payment_type,
			}
	jes = [name for doctype, name in vouchers if doctype == "Journal Entry"]
	if jes:
		for row in frappe.get_list(
			"Journal Entry", filters={"name": ["in", jes]}, fields=["name", "title", "user_remark"]
		):
			out[("Journal Entry", row.name)] = {
				"word": voucher_word("Journal Entry"),
				# A journal's title is often an account name («Servicios públicos - GD»).
				"party": re.sub(r" - [A-Z0-9_]{1,8}$", "", row.title)
				if row.title and row.title != row.name
				else (row.user_remark or "")[:80],
				"payment_type": None,
			}
	for doctype, party_field in (
		("Sales Invoice", "customer_name"),
		("POS Invoice", "customer_name"),
		("Purchase Invoice", "supplier_name"),
	):
		names = [name for kind, name in vouchers if kind == doctype]
		if names and frappe.has_permission(doctype, "read"):
			for row in frappe.get_list(
				doctype, filters={"name": ["in", names]}, fields=["name", party_field]
			):
				out[(doctype, row.name)] = {
					"word": voucher_word(doctype),
					"party": row.get(party_field) or "",
					"payment_type": None,
				}
	return out


# ---------------------------------------------------------------- cuentas


def _bank_accounts(company):
	return frappe.get_list(
		"Bank Account",
		filters={"company": company, "is_company_account": 1, "disabled": 0},
		fields=[
			"name",
			"account_name",
			"bank",
			"account",
			"bank_account_no",
			"iban",
			"mask",
			"is_credit_card",
			"last_integration_date",
		],
		order_by="account_name asc",
		limit_page_length=0,
	)


def _bank_side_balances(names):
	"""syncfy_connector keeps the balance the bank reported and when; read-only, if installed."""
	if (
		not names
		or "syncfy_connector" not in frappe.get_installed_apps()
		or not frappe.db.exists("DocType", "Syncfy Account")
		or not frappe.has_permission("Syncfy Account", "read")
	):
		return {}
	out = {}
	for row in frappe.get_list(
		"Syncfy Account",
		filters={"bank_account": ["in", names], "is_disabled": 0},
		fields=["bank_account", "balance", "balance_at", "currency"],
		order_by="balance_at desc",
	):
		out.setdefault(row.bank_account, {"amount": flt(row.balance, 2), "at": str(row.balance_at or "")})
	return out


def _pending_counts(names):
	"""{bank account: {n, last}} of movements still to reconcile; None when unreadable."""
	if not frappe.has_permission("Bank Transaction", "read"):
		return None
	if not names:
		return {}
	rows = frappe.get_list(
		"Bank Transaction",
		filters={"bank_account": ["in", names], "docstatus": 1, "unallocated_amount": [">", 0]},
		fields=["bank_account", {"COUNT": "name", "as": "n"}, {"MAX": "date", "as": "last"}],
		group_by="bank_account",
	)
	return {row.bank_account: {"n": cint(row.n), "last": str(row.last or "")} for row in rows}


@frappe.whitelist()
def cuentas(company: str | None = None) -> dict:
	"""Bank, card and cash accounts as cards, with the total of what is in them."""
	can = _require()
	company = _company(company)
	currency = _currency(company)
	abbr = _abbr(company)
	banks = _bank_accounts(company) if can["bancos"] else []
	ledgers = [row.account for row in banks if row.account]
	readable_ledgers = set(
		frappe.get_list("Account", filters={"name": ["in", ledgers]}, pluck="name") if ledgers else []
	)
	# Bank and cash ledgers with no Bank Account record still hold money (cajas, Mercado Pago).
	others = (
		frappe.get_list(
			"Account",
			filters={
				"company": company,
				"is_group": 0,
				"disabled": 0,
				"account_type": ["in", ["Bank", "Cash"]],
				"name": ["not in", ledgers or [""]],
			},
			fields=["name", "account_name", "account_type", "account_currency"],
			limit_page_length=0,
		)
		if can["catalogo"]
		else []
	)
	sums = _gl_sums([*readable_ledgers, *(row.name for row in others)], today())
	pending = _pending_counts([row.name for row in banks])
	synced = _bank_side_balances([row.name for row in banks])
	recent = _recent_ledgers([row.name for row in others])
	cards = []
	for row in banks:
		balance = sums.get(row.account, 0.0) if row.account in readable_ledgers and can["saldos"] else None
		account_currency = (
			frappe.get_cached_value("Account", row.account, "account_currency") if row.account else None
		) or currency
		if row.is_credit_card and balance is not None:
			balance = -balance  # a card shows what is owed on it
		cards.append(
			{
				"cuenta": row.name,
				"kind": "tarjeta" if row.is_credit_card else "banco",
				"label": row.account_name or row.name,
				"bank": row.bank or "",
				"last4": last4(row.bank_account_no or row.iban or row.mask),
				"ledger": row.account,
				"currency": account_currency,
				"balance": balance,
				"bank_balance": synced.get(row.name),
				"pending": (pending.get(row.name) or {}).get("n", 0) if pending is not None else None,
				"reconcilable": True,
			}
		)
	for row in others:
		balance = sums.get(row.name, 0.0) if can["saldos"] else None
		# Leave out empty, idle ledgers (old test cajas): no balance and no entry in 90 days.
		if not balance and row.name not in recent:
			continue
		cards.append(
			{
				"cuenta": row.name,
				"kind": "efectivo" if row.account_type == "Cash" else "banco",
				"label": account_display(row.account_name or row.name, abbr),
				"bank": "",
				"last4": "",
				"ledger": row.name,
				"currency": row.account_currency or currency,
				"balance": balance,
				"bank_balance": None,
				"pending": None,
				"reconcilable": False,
			}
		)
	order = {"banco": 0, "tarjeta": 1, "efectivo": 2}
	cards.sort(key=lambda card: (order[card["kind"]], -(abs(card["balance"] or 0)), card["label"]))
	total = sum(
		card["balance"] or 0
		for card in cards
		if card["kind"] != "tarjeta" and card["currency"] == currency and card["balance"] is not None
	)
	return {
		"company": company,
		"empresas": _empresas(company),
		"currency": currency,
		"as_of": today(),
		"total": flt(total, 2) if can.get("saldos") else None,
		"pending": sum(card["pending"] or 0 for card in cards),
		"cards": cards,
		"can": can,
		"engine": "contador" if _contador_module() else "erpnext",
	}


def _recent_ledgers(accounts):
	if not accounts or not frappe.has_permission("GL Entry", "read"):
		return set()
	since = add_months(getdate(today()), -3)
	return set(
		frappe.get_list(
			"GL Entry",
			filters={"account": ["in", accounts], "is_cancelled": 0, "posting_date": [">=", since]},
			pluck="account",
			distinct=True,
			limit_page_length=0,
		)
	)


# ---------------------------------------------------------------- one account


def _resolve(cuenta):
	"""A Bank Account name, or a ledger Account (cash, wallets) the worker reads."""
	if frappe.db.exists("Bank Account", cuenta):
		bank = frappe.get_doc("Bank Account", cuenta)
		bank.check_permission("read")
		return bank, bank.account
	if frappe.db.exists("Account", cuenta):
		account = frappe.get_doc("Account", cuenta)
		account.check_permission("read")
		if account.is_group:
			frappe.throw(_("Elige una cuenta, no un grupo."))
		return None, account.name
	frappe.throw(_("No encontramos esa cuenta."), frappe.DoesNotExistError)


def _header(bank, ledger):
	account = frappe.get_cached_doc("Account", ledger) if ledger else None
	company = (bank.company if bank else None) or (account.company if account else None)
	readable = bool(ledger) and _may("Account", "read", ledger)
	balance = _gl_sums([ledger], today()).get(ledger, 0.0) if readable and _may("GL Entry") else None
	if bank and bank.is_credit_card and balance is not None:
		balance = -balance
	counts = _pending_counts([bank.name]) if bank else None
	pending = (counts.get(bank.name) or {}).get("n", 0) if counts is not None else None
	synced = _bank_side_balances([bank.name]).get(bank.name) if bank else None
	return {
		"cuenta": bank.name if bank else ledger,
		"kind": ("tarjeta" if bank.is_credit_card else "banco")
		if bank
		else ("efectivo" if account and account.account_type == "Cash" else "banco"),
		"label": (bank.account_name or bank.name)
		if bank
		else account_display(account.account_name, _abbr(company)),
		"bank": bank.bank if bank else "",
		"last4": last4(bank.bank_account_no or bank.iban or bank.mask) if bank else "",
		"ledger": ledger,
		"ledger_label": account_display(account.account_name, _abbr(company)) if account else "",
		"company": company,
		"currency": (account.account_currency if account else None) or _currency(company),
		"balance": balance,
		"bank_balance": synced,
		"pending": pending,
		"reconcilable": bool(bank),
	}


@frappe.whitelist()
def cuenta(cuenta: str) -> dict:
	"""One account's hero: balances, what is left to reconcile, and what the worker may do."""
	can = _require()
	bank, ledger = _resolve(cuenta)
	return {
		"header": _header(bank, ledger),
		"can": can,
		"engine": "contador" if _contador_module() else "erpnext",
	}


@frappe.whitelist()
def movimientos(
	cuenta: str,
	vista: str = "banco",
	filtro: str = "",
	q: str = "",
	start: int = 0,
	limit: int = PAGE,
) -> dict:
	"""Movements of one account, newest first: the bank's (vista=banco) or the books' (libros)."""
	_require()
	bank, ledger = _resolve(cuenta)
	start, limit = max(0, cint(start)), min(max(1, cint(limit) or PAGE), 100)
	if vista == "banco" and bank:
		return _bank_movements(bank, filtro, q, start, limit)
	return _book_movements(ledger, filtro, q, start, limit)


def _bank_movements(bank, filtro, q, start, limit):
	if not frappe.has_permission("Bank Transaction", "read"):
		return {"rows": [], "next": None, "readable": False}
	filters = [
		["bank_account", "=", bank.name],
		["docstatus", "=", 1],
	]
	if filtro == "entradas":
		filters.append(["deposit", ">", 0])
	elif filtro == "salidas":
		filters.append(["withdrawal", ">", 0])
	elif filtro == "pendientes":
		filters.append(["unallocated_amount", ">", 0])
	or_filters = None
	q = (q or "").strip()
	if q:
		amount = parse_amount(q)
		if amount is not None:
			or_filters = [["deposit", "=", amount], ["withdrawal", "=", amount]]
		else:
			like = f"%{q}%"
			or_filters = [
				["description", "like", like],
				["reference_number", "like", like],
				["bank_party_name", "like", like],
				["party", "like", like],
			]
	rows = frappe.get_list(
		"Bank Transaction",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"date",
			"deposit",
			"withdrawal",
			"unallocated_amount",
			"allocated_amount",
			"description",
			"reference_number",
			"party_type",
			"party",
			"bank_party_name",
			"currency",
			"status",
		],
		order_by="date desc, creation desc",
		limit_start=start,
		limit_page_length=limit + 1,
	)
	more = len(rows) > limit
	rows = rows[:limit]
	names = [row.name for row in rows]
	links = (
		frappe.get_all(
			"Bank Transaction Payments",
			filters={"parent": ["in", names], "parenttype": "Bank Transaction"},
			fields=["parent", "payment_document", "payment_entry", "allocated_amount"],
			order_by="idx asc",
		)
		if names
		else []
	)
	labels = _voucher_labels({(link.payment_document, link.payment_entry) for link in links})
	parties = _party_names({(row.party_type, row.party) for row in rows})
	matched = {}
	for link in links:
		label = labels.get((link.payment_document, link.payment_entry))
		matched.setdefault(link.parent, []).append(
			{
				"doctype": link.payment_document,
				"name": link.payment_entry,
				"word": (label or {}).get("word") or voucher_word(link.payment_document),
				"party": (label or {}).get("party") or "",
				"payment_type": (label or {}).get("payment_type"),
				"amount": flt(link.allocated_amount, 2),
				"readable": bool(label),
			}
		)
	out = []
	for row in rows:
		amount = flt(row.deposit, 2) - flt(row.withdrawal, 2)
		words = movement_words(
			row.description,
			parties.get((row.party_type, row.party)) or row.bank_party_name,
			amount,
		)
		remaining = flt(row.unallocated_amount, 2)
		out.append(
			{
				"name": row.name,
				"date": str(row.date),
				"amount": amount,
				"currency": row.currency,
				"title": words["title"],
				"detail": words["detail"],
				"reference": row.reference_number or "",
				"remaining": remaining,
				"state": "pendiente"
				if remaining > 0 and not matched.get(row.name)
				else ("parcial" if remaining > 0 else "conciliado"),
				"matches": matched.get(row.name, []),
			}
		)
	return {"rows": out, "next": start + limit if more else None, "readable": True, "vista": "banco"}


def _book_movements(ledger, filtro, q, start, limit):
	if not ledger or not frappe.has_permission("GL Entry", "read"):
		return {"rows": [], "next": None, "readable": False, "vista": "libros"}
	frappe.has_permission("Account", "read", ledger, throw=True)
	filters = [["account", "=", ledger], ["is_cancelled", "=", 0]]
	if filtro == "entradas":
		filters.append(["debit_in_account_currency", ">", 0])
	elif filtro == "salidas":
		filters.append(["credit_in_account_currency", ">", 0])
	q = (q or "").strip()
	or_filters = None
	if q:
		amount = parse_amount(q)
		if amount is not None:
			or_filters = [
				["debit_in_account_currency", "=", amount],
				["credit_in_account_currency", "=", amount],
			]
		else:
			like = f"%{q}%"
			or_filters = [["voucher_no", "like", like], ["party", "like", like], ["remarks", "like", like]]
	return _ledger_rows(ledger, filters, or_filters, start, limit, natural=False)


def _ledger_rows(ledger, filters, or_filters, start, limit, natural=True, root_type=None, closing=None):
	rows = frappe.get_list(
		"GL Entry",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"posting_date",
			"debit_in_account_currency as debit",
			"credit_in_account_currency as credit",
			"voucher_type",
			"voucher_no",
			"party_type",
			"party",
			"remarks",
			"account",
		],
		order_by="posting_date desc, creation desc",
		limit_start=start,
		limit_page_length=limit + 1,
	)
	more = len(rows) > limit
	rows = rows[:limit]
	parties = _party_names({(row.party_type, row.party) for row in rows})
	labels = _voucher_labels({(row.voucher_type, row.voucher_no) for row in rows})
	sign = natural_sign(root_type) if natural else 1
	running = closing
	out = []
	for row in rows:
		amount = flt(row.debit, 2) - flt(row.credit, 2)
		label = labels.get((row.voucher_type, row.voucher_no)) or {}
		party = parties.get((row.party_type, row.party)) or label.get("party") or ""
		out.append(
			{
				"name": row.name,
				"date": str(row.posting_date),
				"amount": flt(amount * sign, 2),
				"debit": flt(row.debit, 2),
				"credit": flt(row.credit, 2),
				"title": party or label.get("word") or voucher_word(row.voucher_type),
				"detail": label.get("word") or voucher_word(row.voucher_type),
				"voucher": {
					"doctype": row.voucher_type,
					"name": row.voucher_no,
					"payment_type": label.get("payment_type"),
				},
				"balance": flt(running, 2) if running is not None else None,
				"account": row.account,
			}
		)
		if running is not None:
			running -= amount * sign
	return {
		"rows": out,
		"next": start + limit if more else None,
		"readable": True,
		"vista": "libros",
		"carry": flt(running, 2) if running is not None else None,
	}


# ---------------------------------------------------------------- conciliar


def _contador_module():
	"""Contador's bank service when it owns reconciliation on this site, else None."""
	if CONTADOR not in frappe.get_installed_apps():
		return None
	try:
		from erpnext_mexico_compliance import entitlements
		from erpnext_mexico_compliance.fiscal import bank_automation
	except ImportError:
		return None
	return bank_automation if entitlements.allows("bank_automation") else None


def _fiscal_role():
	try:
		from erpnext_mexico_compliance.utils.permissions import has_fiscal_role
	except ImportError:
		return False
	return has_fiscal_role()


def _transaction(name):
	doc = frappe.get_doc("Bank Transaction", name)
	doc.check_permission("read")
	if doc.docstatus != 1:
		frappe.throw(_("Este movimiento no está confirmado."))
	return doc


def _movement(doc):
	parties = _party_names({(doc.party_type, doc.party)})
	amount = flt(doc.deposit, 2) - flt(doc.withdrawal, 2)
	words = movement_words(
		doc.description, parties.get((doc.party_type, doc.party)) or doc.bank_party_name, amount
	)
	bank = (
		frappe.db.get_value(
			"Bank Account",
			doc.bank_account,
			["account_name", "bank", "bank_account_no", "iban", "mask"],
			as_dict=True,
		)
		or {}
	)
	return {
		"name": doc.name,
		"cuenta": doc.bank_account,
		"account_label": bank.get("account_name") or doc.bank_account,
		"last4": last4(bank.get("bank_account_no") or bank.get("iban") or bank.get("mask")),
		"company": doc.company,
		"date": str(doc.date),
		"amount": amount,
		"currency": doc.currency,
		"title": words["title"],
		"detail": words["detail"],
		"description": doc.description or "",
		"reference": doc.reference_number or "",
		"remaining": flt(doc.unallocated_amount, 2),
		"direction": "deposit" if amount > 0 else "withdrawal",
	}


def _matches(doc):
	labels = _voucher_labels({(row.payment_document, row.payment_entry) for row in doc.payment_entries})
	out = []
	for row in doc.payment_entries:
		label = labels.get((row.payment_document, row.payment_entry))
		out.append(
			{
				"doctype": row.payment_document,
				"name": row.payment_entry,
				"word": (label or {}).get("word") or voucher_word(row.payment_document),
				"party": (label or {}).get("party") or "",
				"payment_type": (label or {}).get("payment_type"),
				"amount": flt(row.allocated_amount, 2),
				"readable": bool(label),
				"created_here": row.get("reconciliation_type") == "Voucher Created",
			}
		)
	return out


def _enrich(candidates):
	labels = _voucher_labels({(row["doctype"], row["name"]) for row in candidates})
	for row in candidates:
		label = labels.get((row["doctype"], row["name"])) or {}
		row["word"] = label.get("word") or voucher_word(row["doctype"])
		row["party"] = label.get("party") or row.get("party") or ""
		row["payment_type"] = label.get("payment_type")
	return candidates


def _native_candidates(doc, scope):
	from erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool import get_linked_payments

	from crm.bancos_words import reference_key

	# ERPNext and Contador both look ±7 days around the movement; «month» widens to its month.
	date = getdate(doc.date)
	start, end = date - timedelta(days=7), date + timedelta(days=7)
	if scope == "month":
		start, end = min(start, get_first_day(date)), max(end, get_last_day(date))
	remaining = flt(doc.unallocated_amount, 2)
	rows = get_linked_payments(doc.name, ["payment_entry", "journal_entry"], start, end) or []
	out, seen = [], set()
	for row in rows:
		identity = (row.get("doctype"), row.get("name"))
		if identity[0] not in MATCHABLE or identity in seen:
			continue
		if not frappe.has_permission(identity[0], "read", identity[1]):
			continue
		seen.add(identity)
		amount = flt(row.get("paid_amount"), 2)
		exact = (
			amount == remaining
			and bool(reference_key(doc.reference_number))
			and (reference_key(doc.reference_number) == reference_key(row.get("reference_no")))
		)
		out.append(
			{
				"doctype": identity[0],
				"name": identity[1],
				"posting_date": str(row.get("posting_date") or ""),
				"amount": str(amount),
				"reference_number": row.get("reference_no") or "",
				"exact": exact,
				"apply_amount": str(min(amount, remaining)),
				"reason": "Referencia e importe exactos; misma cuenta."
				if exact
				else (
					"Mismo importe y misma cuenta. Confirma la referencia."
					if amount == remaining
					else "Misma cuenta; el importe es distinto, compáralo antes de confirmar."
				),
				"rank": cint(row.get("rank")),
			}
		)
	out.sort(key=lambda row: (not row["exact"], -row["rank"], row["posting_date"]))
	exact = [row for row in out if row["exact"]]
	if len(exact) == 1:
		exact[0]["suggested"] = True
	elif not exact:
		same = [row for row in out if flt(row["amount"]) == remaining]
		if len(same) == 1:
			same[0]["suggested"] = True
	return out


def _open_invoices(doc, remaining):
	"""Open invoices for exactly this amount: register their payment from here (a draft)."""
	if remaining <= 0 or not frappe.has_permission("Payment Entry", "create"):
		return []
	direction = "deposit" if flt(doc.deposit) > 0 else "withdrawal"
	doctype = OPEN_INVOICE[direction]
	if not frappe.has_permission(doctype, "read"):
		return []
	party = "customer_name" if doctype == "Sales Invoice" else "supplier_name"
	rows = frappe.get_list(
		doctype,
		filters={
			"company": doc.company,
			"docstatus": 1,
			"outstanding_amount": ["between", [remaining - 0.005, remaining + 0.005]],
		},
		fields=["name", party + " as party", "due_date", "posting_date", "outstanding_amount", "currency"],
		order_by="due_date asc",
		limit_page_length=5,
	)
	return [
		{
			"doctype": doctype,
			"name": row.name,
			"party": row.party or "",
			"due_date": str(row.due_date or ""),
			"amount": flt(row.outstanding_amount, 2),
			"currency": row.currency,
		}
		for row in rows
	]


@frappe.whitelist()
def movimiento(bank_transaction: str, scope: str = "near") -> dict:
	"""A bank movement with its suggested match, other candidates and what the worker may do."""
	_require()
	if scope not in ("near", "month"):
		scope = "near"
	doc = _transaction(bank_transaction)
	movement = _movement(doc)
	remaining = movement["remaining"]
	contador = _contador_module()
	blocked, candidates = [], []
	can = {"conciliar": False, "deshacer": False, "crear_pago": False, "gasto": False}
	engine = "erpnext"
	if contador:
		engine = "contador"
		if not _fiscal_role():
			blocked.append(
				{
					"code": "read_only",
					"message": "Puedes ver este movimiento, pero conciliar es del área de contabilidad. "
					"Pide al responsable que lo revise.",
				}
			)
		else:
			detail = contador.get_movement(doc.company, doc.name, scope)
			candidates = [
				{
					key: row.get(key)
					for key in (
						"doctype",
						"name",
						"posting_date",
						"amount",
						"reference_number",
						"exact",
						"outside_window",
						"reason",
						"apply_amount",
						"fingerprint",
						"suggested",
					)
				}
				for row in detail.get("candidates") or []
			]
			blocked = [
				{"code": row.get("code"), "message": row.get("message")}
				for row in detail.get("blocked") or []
			]
			flags = detail.get("can") or {}
			can["conciliar"] = bool(flags.get("operate"))
			can["deshacer"] = bool(flags.get("undo"))
	elif remaining > 0:
		candidates = _native_candidates(doc, scope)
		can["conciliar"] = _may("Bank Transaction", "write", doc)
		if not candidates:
			blocked.append(
				{
					"code": "no_candidates",
					"message": "No encontramos un pago o póliza en estas fechas."
					if scope == "near"
					else "No encontramos un pago o póliza en el mes del movimiento.",
				}
			)
	if not contador:
		can["deshacer"] = _may("Bank Transaction", "write", doc) and any(
			row.reconciliation_type != "Voucher Created" for row in doc.payment_entries
		)
	drafts = _drafts_for(doc) if remaining > 0 else []
	# A draft made here is the next step; offering the invoice again would make a second one.
	exact = any(row.get("exact") for row in candidates)
	invoices = _open_invoices(doc, remaining) if not (exact or drafts) else []
	can["crear_pago"] = bool(invoices)
	can["gasto"] = (
		remaining > 0
		and movement["direction"] == "withdrawal"
		and bool(_may("Purchase Invoice", "create") or _may("Journal Entry", "create"))
	)
	return {
		"movement": movement,
		"candidates": _enrich(candidates),
		"invoices": invoices,
		"matches": _matches(doc),
		"drafts": drafts,
		"blocked": blocked,
		"can": can,
		"scope": scope,
		"engine": engine,
	}


def _result(doc_name, ok=True, message=None, code=None):
	doc = frappe.get_doc("Bank Transaction", doc_name)
	return {
		"ok": ok,
		"code": code,
		"message": message,
		"remaining": flt(doc.unallocated_amount, 2),
		"state": "conciliado"
		if flt(doc.unallocated_amount) <= 0
		else ("parcial" if doc.payment_entries else "pendiente"),
		"matches": _matches(doc),
	}


@frappe.whitelist(methods=["POST"])
def conciliar(
	bank_transaction: str,
	doctype: str,
	name: str,
	fingerprint: str | None = None,
	apply_amount: str | None = None,
	request_id: str | None = None,
	scope: str = "near",
) -> dict:
	"""Link the movement to an existing payment or journal entry the worker saw proposed."""
	_require()
	if doctype not in MATCHABLE or not name:
		frappe.throw(_("Solo se concilian pagos o pólizas existentes."))
	doc = _transaction(bank_transaction)
	if any(row.payment_document == doctype and row.payment_entry == name for row in doc.payment_entries):
		return _result(doc.name)  # already linked: the same tap twice is a no-op
	contador = _contador_module()
	if contador:
		answer = contador.confirm_movement(
			doc.company,
			doc.name,
			doctype,
			name,
			fingerprint or "",
			apply_amount or "0",
			request_id=request_id,
			scope=scope if scope in ("near", "month") else "near",
		)
		if isinstance(answer, dict) and answer.get("ok") is False:
			return _result(doc.name, ok=False, message=answer.get("message"), code=answer.get("code"))
		return _result(doc.name)
	doc.check_permission("write")
	current = next(
		(
			row
			for row in _native_candidates(doc, scope if scope in ("near", "month") else "near")
			if (row["doctype"], row["name"]) == (doctype, name)
		),
		None,
	)
	if not current:
		return _result(
			doc.name,
			ok=False,
			code="not_candidate",
			message="Ese pago ya no es un candidato para este movimiento. Actualiza la propuesta.",
		)
	if apply_amount is not None and flt(apply_amount, 2) != flt(current["apply_amount"], 2):
		return _result(
			doc.name,
			ok=False,
			code="changed",
			message="El importe cambió; revisa la propuesta antes de confirmar.",
		)
	from erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool import reconcile_vouchers

	savepoint = "crm_bancos_conciliar"
	frappe.db.savepoint(savepoint)
	try:
		reconcile_vouchers(
			doc.name,
			json.dumps(
				[{"payment_doctype": doctype, "payment_name": name, "amount": flt(current["apply_amount"])}]
			),
		)
	except frappe.ValidationError as exc:
		frappe.db.rollback(save_point=savepoint)
		return _result(doc.name, ok=False, code="blocked", message=frappe.utils.strip_html(str(exc)))
	return _result(doc.name)


@frappe.whitelist(methods=["POST"])
def deshacer(bank_transaction: str, doctype: str | None = None, name: str | None = None) -> dict:
	"""Undo a link: Contador's audited undo, or ERPNext's unlink of one matched voucher."""
	_require()
	doc = _transaction(bank_transaction)
	contador = _contador_module()
	if contador:
		answer = contador.undo_movement(doc.company, doc.name)
		if isinstance(answer, dict) and answer.get("ok") is False:
			return _result(doc.name, ok=False, message=answer.get("message"), code=answer.get("code"))
		return _result(doc.name)
	doc.check_permission("write")
	rows = [
		row
		for row in doc.payment_entries
		if (not doctype or (row.payment_document, row.payment_entry) == (doctype, name))
		and row.reconciliation_type != "Voucher Created"
	]
	if not rows:
		return _result(
			doc.name, ok=False, code="undo_unsafe", message="No hay un vínculo que se pueda deshacer aquí."
		)
	for row in rows:
		doc.remove_payment_entry(row)
	doc.save()
	return _result(doc.name)


@frappe.whitelist(methods=["POST"])
def crear_pago(bank_transaction: str, invoice_doctype: str, invoice: str) -> dict:
	"""A draft cobro/pago of an open invoice for this movement: same bank, date and reference."""
	_require()
	if invoice_doctype not in OPEN_INVOICE.values():
		frappe.throw(_("Elige una factura de cliente o de proveedor."))
	doc = _transaction(bank_transaction)
	remaining = flt(doc.unallocated_amount, 2)
	if _drafts_for(doc):
		frappe.throw(_("Ya hay un cobro o pago en borrador para este movimiento: confírmalo o revísalo."))
	if not any(row["name"] == invoice for row in _open_invoices(doc, remaining)):
		frappe.throw(_("Esa factura ya no está abierta por este importe. Actualiza y revisa de nuevo."))
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	ledger = frappe.db.get_value("Bank Account", doc.bank_account, "account")
	pe = get_payment_entry(invoice_doctype, invoice, bank_account=ledger, reference_date=doc.date)
	pe.posting_date = doc.date
	pe.reference_no = doc.reference_number or doc.name
	pe.reference_date = doc.date
	pe.bank_account = doc.bank_account
	pe.insert()
	return {"doctype": "Payment Entry", "name": pe.name, "payment_type": pe.payment_type}


@frappe.whitelist(methods=["POST"])
def confirmar_pago(bank_transaction: str, payment_entry: str) -> dict:
	"""Confirm (submit) the draft cobro/pago made here for this movement, then show its match."""
	_require()
	doc = _transaction(bank_transaction)
	pe = frappe.get_doc("Payment Entry", payment_entry)
	pe.check_permission("submit")
	if (
		pe.docstatus != 0
		or pe.bank_account != doc.bank_account
		or pe.reference_no
		not in (
			doc.reference_number,
			doc.name,
		)
	):
		frappe.throw(_("Ese cobro no es el borrador de este movimiento."))
	pe.submit()
	return movimiento(doc.name)


def _drafts_for(doc):
	"""Draft cobros/pagos made from this movement (same bank account and reference), newest first."""
	if not frappe.has_permission("Payment Entry", "read"):
		return []
	refs = [ref for ref in (doc.reference_number, doc.name) if ref]
	rows = frappe.get_list(
		"Payment Entry",
		filters={"docstatus": 0, "bank_account": doc.bank_account, "reference_no": ["in", refs]},
		fields=["name", "payment_type", "party_name", "paid_amount", "posting_date"],
		order_by="creation desc",
		limit_page_length=3,
	)
	return [
		{
			"doctype": "Payment Entry",
			"name": row.name,
			"word": voucher_word("Payment Entry", row.payment_type),
			"party": row.party_name or "",
			"payment_type": row.payment_type,
			"amount": flt(row.paid_amount, 2),
			"can_submit": _may("Payment Entry", "submit", row.name),
		}
		for row in rows
	]


# ---------------------------------------------------------------- catálogo de cuentas


def _account_fields():
	fields = [
		"name",
		"account_name",
		"account_number",
		"is_group",
		"root_type",
		"account_type",
		"account_currency",
		"parent_account",
		"lft",
		"rgt",
		"company",
	]
	meta = frappe.get_meta("Account")
	for extra in ("mx_codigo_agrupador", "muelle_sat_agrupador"):
		if meta.has_field(extra):
			fields.append(extra)
	return fields


def _agrupador_words(codes):
	"""{code: description} from Contador's SAT catalogue, when installed."""
	codes = [code for code in codes if code]
	if not codes or not frappe.db.exists("DocType", "SAT Codigo Agrupador"):
		return {}
	rows = frappe.get_all(
		"SAT Codigo Agrupador",
		filters={"codigo": ["in", codes]},
		fields=["name", "codigo", "descripcion"],
	)
	out = {row.codigo: row.descripcion for row in rows}
	out.update({row.name: row.descripcion for row in rows})
	return out


def _tree_sums(nodes, from_date=None, to_date=None, fy_start=None):
	"""Per node (group or leaf): opening, debit, credit in company currency, over its subtree."""
	if not nodes or not frappe.has_permission("GL Entry", "read"):
		return {}
	names = tuple(node.name for node in nodes)
	params = {"names": names, "from": from_date, "to": to_date, "fy": fy_start}
	in_period = []
	if from_date:
		in_period.append("g.posting_date >= %(from)s")
	if to_date:
		in_period.append("g.posting_date <= %(to)s")
	period = " AND ".join(in_period) or "1=1"
	before = "g.posting_date < %(from)s" if from_date else "0=1"
	before_fy = "g.posting_date < %(from)s AND g.posting_date >= %(fy)s" if from_date and fy_start else before
	rows = frappe.db.sql(  # nosemgrep: frappe-sql-format-injection
		f"""
		SELECT c.name,
			SUM(CASE WHEN {before} THEN g.debit - g.credit ELSE 0 END) AS opening,
			SUM(CASE WHEN {before_fy} THEN g.debit - g.credit ELSE 0 END) AS opening_fy,
			SUM(CASE WHEN {period} THEN g.debit ELSE 0 END) AS debit,
			SUM(CASE WHEN {period} THEN g.credit ELSE 0 END) AS credit
		FROM `tabAccount` c
		JOIN `tabAccount` a ON a.company = c.company AND a.lft >= c.lft AND a.rgt <= c.rgt
		JOIN `tabGL Entry` g ON g.account = a.name AND g.is_cancelled = 0
		WHERE c.name IN %(names)s
		GROUP BY c.name
		""",
		params,
		as_dict=True,
	)
	return {row.name: row for row in rows}


def _node(row, sums, words, abbr, children=None):
	sign = natural_sign(row.root_type)
	total = sums.get(row.name)
	balance = None
	if total is not None:
		balance = flt((flt(total.opening) + flt(total.debit) - flt(total.credit)) * sign, 2)
	elif frappe.has_permission("GL Entry", "read"):
		balance = 0.0
	code = row.get("mx_codigo_agrupador") or row.get("muelle_sat_agrupador") or ""
	return {
		"name": row.name,
		"label": account_display(row.account_name, abbr),
		"number": row.account_number or "",
		"group": bool(row.is_group),
		"root_type": row.root_type,
		"root_word": root_word(row.root_type),
		"account_type": row.account_type or "",
		"currency": row.account_currency,
		"balance": balance,
		"agrupador": {"code": code, "words": words.get(code) or ""} if code else None,
		"children": children,
	}


@frappe.whitelist()
def catalogo(company: str | None = None, parent: str | None = None, q: str = "") -> dict:
	"""One level of the chart of accounts (roots, or a group's children) with balances, or a search."""
	can = _require()
	if not can["catalogo"]:
		frappe.throw(_("Pide a tu encargado acceso al catálogo de cuentas."), frappe.PermissionError)
	header = None
	if parent:
		group = frappe.get_doc("Account", parent)
		group.check_permission("read")
		company = group.company
	company = _company(company)
	abbr = _abbr(company)
	fields = _account_fields()
	q = (q or "").strip()
	if q:
		like = f"%{q}%"
		rows = frappe.get_list(
			"Account",
			filters={"company": company, "disabled": 0},
			or_filters=[
				["account_name", "like", like],
				["account_number", "like", like],
				["name", "like", like],
			],
			fields=fields,
			order_by="lft asc",
			limit_page_length=40,
		)
	else:
		rows = frappe.get_list(
			"Account",
			filters={"company": company, "disabled": 0, "parent_account": parent or ["is", "not set"]},
			fields=fields,
			order_by="lft asc",
			limit_page_length=0,
		)
	nodes = list(rows)
	if parent:
		group_row = frappe.get_list("Account", filters={"name": parent}, fields=fields)
		nodes += group_row
	sums = _tree_sums(nodes, None, today())  # balances as of today, as a bank app shows them
	words = _agrupador_words(
		{row.get("mx_codigo_agrupador") or row.get("muelle_sat_agrupador") for row in nodes}
	)
	counts = {}
	groups = [row.name for row in rows if row.is_group]
	if groups:
		for row in frappe.get_list(
			"Account",
			filters={"parent_account": ["in", groups], "disabled": 0},
			fields=["parent_account", {"COUNT": "name", "as": "n"}],
			group_by="parent_account",
		):
			counts[row.parent_account] = cint(row.n)
	items = []
	for row in rows:
		node = _node(row, sums, words, abbr, children=counts.get(row.name, 0) if row.is_group else None)
		if q:
			node["path"] = _path_text(row.parent_account, abbr)
		items.append(node)
	if not parent and not q:
		# The roots in the order an accountant reads them: Activo, Pasivo, Capital, Ingresos, Gastos.
		items.sort(key=lambda node: ROOT_ORDER.get(node.get("root_type"), len(ROOT_ORDER)))
	if parent and group_row:
		header = _node(group_row[0], sums, words, abbr, children=len(rows))
		header["path"] = _ancestors(group_row[0].parent_account, abbr)
	return {
		"company": company,
		"empresas": _empresas(company),
		"currency": _currency(company),
		"header": header,
		"rows": items,
		"can": {
			**can,
			"crear_cuenta": bool(can.get("crear_cuenta") and parent),
		},
	}


def _ancestors(parent, abbr):
	out = []
	while parent and len(out) < 12:
		row = frappe.db.get_value("Account", parent, ["name", "account_name", "parent_account"], as_dict=True)
		if not row or not frappe.has_permission("Account", "read", row.name):
			break
		out.insert(0, {"name": row.name, "label": account_display(row.account_name, abbr)})
		parent = row.parent_account
	return out


def _path_text(parent, abbr):
	return " › ".join(step["label"] for step in _ancestors(parent, abbr)[-2:])


def _period(periodo):
	day = getdate(today())
	if periodo == "mes":
		return get_first_day(day), day
	if periodo == "mes-pasado":
		first = get_first_day(add_months(day, -1))
		return first, get_last_day(first)
	if periodo == "todo":
		return None, day
	return day.replace(month=1, day=1), day


def _fiscal_year_start(company, date):
	if not date:
		return None
	try:
		from erpnext.accounts.utils import get_fiscal_year

		return get_fiscal_year(date, company=company)[1]
	except Exception:
		return date.replace(month=1, day=1)


@frappe.whitelist()
def cuenta_contable(account: str, periodo: str = "anio", start: int = 0, carry: str | None = None) -> dict:
	"""One account's Mayor: opening, cargos, abonos, closing for the period, and its movements."""
	can = _require()
	if periodo not in PERIODOS:
		periodo = "anio"
	doc = frappe.get_doc("Account", account)
	doc.check_permission("read")
	abbr = _abbr(doc.company)
	from_date, to_date = _period(periodo)
	pnl = doc.root_type in ("Income", "Expense")
	fy = _fiscal_year_start(doc.company, from_date) if pnl else None
	row = frappe.get_list("Account", filters={"name": doc.name}, fields=_account_fields())[0]
	sums = _tree_sums([row], from_date, to_date, fy)
	words = _agrupador_words({row.get("mx_codigo_agrupador") or row.get("muelle_sat_agrupador")})
	node = _node(row, _tree_sums([row], None, today()), words, abbr)
	node["path"] = _ancestors(doc.parent_account, abbr)
	sign = natural_sign(doc.root_type)
	total = sums.get(doc.name)
	mayor = None
	if total is not None or frappe.has_permission("GL Entry", "read"):
		opening = flt((total.opening_fy if pnl and total else (total.opening if total else 0)) * sign, 2)
		debit = flt(total.debit if total else 0, 2)
		credit = flt(total.credit if total else 0, 2)
		mayor = {
			"opening": opening,
			"debit": debit,
			"credit": credit,
			"closing": flt(opening + (debit - credit) * sign, 2),
			"from": str(from_date or ""),
			"to": str(to_date),
		}
	movements = {"rows": [], "next": None, "readable": False}
	if frappe.has_permission("GL Entry", "read"):
		if doc.is_group:
			leaves = frappe.get_list(
				"Account",
				filters={
					"company": doc.company,
					"lft": [">=", doc.lft],
					"rgt": ["<=", doc.rgt],
					"is_group": 0,
				},
				pluck="name",
				limit_page_length=0,
			)
		else:
			leaves = [doc.name]
		filters = [
			["account", "in", leaves or [""]],
			["is_cancelled", "=", 0],
			["posting_date", "<=", to_date],
		]
		if from_date:
			filters.append(["posting_date", ">=", from_date])
		closing = flt(carry) if carry not in (None, "") else (mayor or {}).get("closing")
		movements = _ledger_rows(
			doc.name,
			filters,
			None,
			max(0, cint(start)),
			PAGE,
			natural=True,
			root_type=doc.root_type,
			closing=closing,
		)
	return {
		"account": node,
		"company": doc.company,
		"currency": doc.account_currency or _currency(doc.company),
		"periodo": periodo,
		"mayor": mayor,
		"movements": movements,
		"can": can,
	}


@frappe.whitelist()
def balanza(company: str | None = None, periodo: str = "mes", parent: str | None = None) -> dict:
	"""Balanza de comprobación for one level of the tree: opening, cargos, abonos and closing."""
	can = _require()
	if not can["catalogo"]:
		frappe.throw(_("Pide a tu encargado acceso al catálogo de cuentas."), frappe.PermissionError)
	if not can["saldos"]:
		frappe.throw(_("Pide a tu encargado acceso a los saldos contables."), frappe.PermissionError)
	if periodo not in PERIODOS:
		periodo = "mes"
	if parent:
		group = frappe.get_doc("Account", parent)
		group.check_permission("read")
		company = group.company
	company = _company(company)
	abbr = _abbr(company)
	from_date, to_date = _period(periodo)
	fy = _fiscal_year_start(company, from_date)
	rows = frappe.get_list(
		"Account",
		filters={"company": company, "disabled": 0, "parent_account": parent or ["is", "not set"]},
		fields=_account_fields(),
		order_by="lft asc",
		limit_page_length=0,
	)
	if not parent:
		rows.sort(key=lambda row: ROOT_ORDER.get(row.root_type, len(ROOT_ORDER)))
	sums = _tree_sums(rows, from_date, to_date, fy)
	out, totals = [], {"debit": 0.0, "credit": 0.0}
	for row in rows:
		total = sums.get(row.name)
		if not total:
			continue
		pnl = row.root_type in ("Income", "Expense")
		sign = natural_sign(row.root_type)
		opening = flt((total.opening_fy if pnl else total.opening) * sign, 2)
		debit, credit = flt(total.debit, 2), flt(total.credit, 2)
		closing = flt(opening + (debit - credit) * sign, 2)
		if not (opening or debit or credit):
			continue
		totals["debit"] += debit
		totals["credit"] += credit
		out.append(
			{
				"name": row.name,
				"label": account_display(row.account_name, abbr),
				"number": row.account_number or "",
				"group": bool(row.is_group),
				"root_word": root_word(row.root_type),
				"opening": opening,
				"debit": debit,
				"credit": credit,
				"closing": closing,
			}
		)
	header = None
	if parent:
		header = {
			"name": group.name,
			"label": account_display(group.account_name, abbr),
			"path": _ancestors(group.parent_account, abbr),
		}
	return {
		"company": company,
		"empresas": _empresas(company),
		"currency": _currency(company),
		"periodo": periodo,
		"from": str(from_date or ""),
		"to": str(to_date),
		"header": header,
		"rows": out,
		"totals": {
			"debit": flt(totals["debit"], 2),
			"credit": flt(totals["credit"], 2),
			"balanced": abs(totals["debit"] - totals["credit"]) < 0.01,
		},
	}


@frappe.whitelist(methods=["POST"])
def crear_cuenta(
	parent: str,
	account_name: str,
	is_group: int = 0,
	account_number: str | None = None,
	account_type: str | None = None,
) -> dict:
	"""A child account under a group; Frappe's create permission (Accounts Manager) decides."""
	_require()
	group = frappe.get_doc("Account", parent)
	group.check_permission("read")
	if not group.is_group:
		frappe.throw(_("Solo se agregan cuentas dentro de un grupo."))
	account_name = re.sub(r"\s+", " ", (account_name or "")).strip()
	if not account_name:
		frappe.throw(_("Escribe el nombre de la cuenta."))
	doc = frappe.get_doc(
		{
			"doctype": "Account",
			"account_name": account_name,
			"account_number": (account_number or "").strip() or None,
			"parent_account": group.name,
			"company": group.company,
			"is_group": 1 if cint(is_group) else 0,
			"account_type": account_type or None,
			"root_type": group.root_type,
			"report_type": group.report_type,
			"account_currency": group.account_currency,
		}
	)
	doc.insert()
	return {"name": doc.name, "label": account_display(doc.account_name, _abbr(doc.company))}
