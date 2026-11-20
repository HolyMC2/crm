"""Cuadre: does an account's books agree with its bank, and if not, why (Bancos, Shell DD19).

- ``cuadre``: the bank's balance (syncfy_connector's, or the one the person types), the
  books' balance, and the difference split into reasons, each with the movements behind
  it: the same money on both sides not linked yet (pairs), bank movements the books do
  not have, book entries the bank does not have, connection movements that never became
  bank movements, and the history before the bank's movements start in Muelle.
- ``ligar``: links the pairs the person confirmed, each through the same engine as one
  tap in the movement sheet (Contador's audited service where it owns reconciliation,
  ERPNext's tool elsewhere). Every link is undone from its movement.

The arithmetic is crm/bancos_cuadre.py (pure). Reads go through the same walls as the
rest of Bancos: the account is resolved with its read permission, raw sums run only
for users who read GL Entry and Bank Transaction, and links run as the user.
"""

import hashlib
import json
import re

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today

from crm import bancos_cuadre as math
from crm.api import bancos
from crm.bancos_words import movement_words, voucher_word

PAIRS_SHOWN = 200
ROWS_SHOWN = 50
LINK_MAX = 100
# Syncfy Transaction states of a movement the connector has but Bancos does not:
# waiting for a link, held for review, skipped by a person or still to be routed.
CONNECTION_OUT = ("Pending", "Not linked", "Held", "Skipped")
REMOVED = "Removed at source"


# ---------------------------------------------------------------- reads


def _typed_balance(text):
	"""«4,663.09», «$ -120», «1500» → float (sign kept); None when it is not an amount."""
	cleaned = re.sub(r"[\s$]", "", str(text or "")).replace(",", "").replace("-", "-")
	if not re.fullmatch(r"[-+]?\d+(?:\.\d{1,2})?", cleaned):
		return None
	return float(cleaned)


def _months(bank_name):
	rows = frappe.db.sql(
		"""SELECT DATE_FORMAT(date, '%%Y-%%m'), MIN(date) FROM `tabBank Transaction`
		WHERE bank_account = %s AND docstatus = 1 GROUP BY 1""",
		(bank_name,),
	)
	return {month: str(first) for month, first in rows}


def _bank_since(bank_name, start):
	"""Net of every bank movement since start, and the unreconciled part of each."""
	total = frappe.db.sql(
		"""SELECT COALESCE(SUM(deposit - withdrawal), 0) FROM `tabBank Transaction`
		WHERE bank_account = %s AND docstatus = 1 AND date >= %s""",
		(bank_name, start),
	)[0][0]
	rows = frappe.db.sql(
		"""SELECT name, date, deposit, withdrawal, unallocated_amount, description,
			party_type, party, bank_party_name, reference_number
		FROM `tabBank Transaction`
		WHERE bank_account = %s AND docstatus = 1 AND date >= %s AND unallocated_amount > 0
		ORDER BY date, name""",
		(bank_name, start),
		as_dict=True,
	)
	pending = []
	for row in rows:
		sign = 1 if flt(row.deposit) > 0 else -1
		pending.append({**row, "date": str(row.date), "amount": sign * flt(row.unallocated_amount, 2)})
	return flt(total, 2), pending


def _before(bank_name, start):
	"""Unreconciled bank movements older than the run: history, counted in the opening."""
	row = frappe.db.sql(
		"""SELECT COUNT(*), MIN(date), MAX(date) FROM `tabBank Transaction`
		WHERE bank_account = %s AND docstatus = 1 AND date < %s AND unallocated_amount > 0""",
		(bank_name, start),
	)[0]
	return {"count": cint(row[0]), "from": str(row[1] or ""), "to": str(row[2] or "")} if row[0] else None


def _book_since(ledger, bank_name, start, to_date):
	"""Book entries on the ledger since start, one per voucher, linked to no bank movement."""
	linked = {
		(doctype, name)
		for doctype, name in frappe.db.sql(
			"""SELECT btp.payment_document, btp.payment_entry
			FROM `tabBank Transaction Payments` btp
			JOIN `tabBank Transaction` bt ON bt.name = btp.parent
			WHERE bt.bank_account = %s AND bt.docstatus = 1""",
			(bank_name,),
		)
	}
	rows = frappe.db.sql(
		"""SELECT voucher_type, voucher_no, MIN(posting_date) AS date,
			SUM(debit_in_account_currency - credit_in_account_currency) AS amount,
			MAX(party_type) AS party_type, MAX(party) AS party
		FROM `tabGL Entry`
		WHERE account = %s AND is_cancelled = 0 AND posting_date >= %s AND posting_date <= %s
		GROUP BY voucher_type, voucher_no
		HAVING ABS(SUM(debit_in_account_currency - credit_in_account_currency)) >= 0.005
		ORDER BY MIN(posting_date), voucher_no""",
		(ledger, start, to_date),
		as_dict=True,
	)
	return [
		{
			"doctype": row.voucher_type,
			"name": row.voucher_no,
			"date": str(row.date),
			"amount": flt(row.amount, 2),
			"matchable": row.voucher_type in bancos.MATCHABLE,
			"party_type": row.party_type,
			"party": row.party,
		}
		for row in rows
		if (row.voucher_type, row.voucher_no) not in linked
	]


def _connection_out(bank_name, start):
	"""Movements the bank connection has since start that Bancos does not (net, count),
	minus the ones Bancos has that the bank removed afterwards."""
	if not bancos._syncfy_environment() or not bancos._may("Syncfy Account"):
		return 0.0, 0, None
	accounts = frappe.get_list(
		"Syncfy Account",
		filters={"bank_account": bank_name, "is_disabled": 0},
		fields=["name", "connection", "import_from"],
	)
	if not accounts or not bancos._may("Syncfy Transaction"):
		return 0.0, 0, (accounts[0].connection if accounts else None)
	total, count = 0.0, 0
	for account in accounts:
		# Movements dated before the account's import start were left out on purpose
		# (a statement imported earlier covers them).
		since = max(getdate(start), getdate(account.import_from)) if account.import_from else getdate(start)
		row = frappe.db.sql(
			"""SELECT
				COALESCE(SUM(CASE WHEN lane_status IN %(out)s AND is_deleted = 0 AND is_disabled = 0
					THEN amount END), 0),
				SUM(lane_status IN %(out)s AND is_deleted = 0 AND is_disabled = 0),
				COALESCE(SUM(CASE WHEN lane_status = %(removed)s AND (is_deleted = 1 OR is_disabled = 1)
					THEN amount END), 0),
				SUM(lane_status = %(removed)s AND (is_deleted = 1 OR is_disabled = 1))
			FROM `tabSyncfy Transaction`
			WHERE account = %(account)s AND transaction_date >= %(since)s AND is_pending = 0""",
			{"out": CONNECTION_OUT, "removed": REMOVED, "account": account.name, "since": since},
		)[0]
		total += flt(row[0]) - flt(row[2])
		count += cint(row[1]) + cint(row[3])
	return flt(total, 2), count, accounts[0].connection


def _bank_rows(rows):
	parties = bancos._party_names({(row.get("party_type"), row.get("party")) for row in rows})
	out = []
	for row in rows:
		amount = flt(row["amount"], 2)
		words = movement_words(
			row.get("description"),
			parties.get((row.get("party_type"), row.get("party"))) or row.get("bank_party_name"),
			amount,
		)
		out.append(
			{
				"name": row["name"],
				"date": row["date"],
				"amount": amount,
				"title": words["title"],
				"detail": words["detail"],
			}
		)
	return out


def _book_rows(rows, labels):
	out = []
	for row in rows:
		label = labels.get((row["doctype"], row["name"])) or {}
		out.append(
			{
				"doctype": row["doctype"],
				"name": row["name"],
				"date": row["date"],
				"amount": flt(row["amount"], 2),
				"word": label.get("word") or voucher_word(row["doctype"]),
				"party": label.get("party") or row.get("party") or "",
				"matchable": row["matchable"],
				"readable": bool(label),
			}
		)
	return out


def unlinked_vouchers(ledger, bank_name):
	"""Vouchers on the ledger since the bank's unbroken run started, linked to no bank
	movement (the books' «Sin banco» filter); None when the account has no bank movements."""
	start = math.feed_run(_months(bank_name), today())["start"]
	if not start:
		return None
	return [row["name"] for row in _book_since(ledger, bank_name, start, today())]


def unlinked_entries(bank_name):
	"""The book entries on a bank account's ledger since its feed run started that no bank
	movement links, with their words (doco Por explicar's «Ya está en tus libros»). Amounts move
	as the ledger does (a deposit is positive); `matchable` ones the site's engine can link.
	[] when the person may not read them or the account has no movements."""
	can = bancos._require()
	ledger = frappe.db.get_value("Bank Account", bank_name, "account")
	if not ledger or not can.get("saldos") or not bancos._may("Bank Transaction"):
		return []
	start = math.feed_run(_months(bank_name), today())["start"]
	if not start:
		return []
	rows = _book_since(ledger, bank_name, start, today())
	labels = bancos._voucher_labels({(row["doctype"], row["name"]) for row in rows})
	return [{**row, "ledger": ledger} for row in _book_rows(rows, labels)]


@frappe.whitelist()
def cuadre(cuenta: str, saldo_banco: str | None = None) -> dict:
	"""Why this account's books and its bank differ, line by line, with what to do."""
	can = bancos._require()
	bank, ledger = bancos._resolve(cuenta)
	if not ledger:
		frappe.throw(_("This account has no ledger account."))
	if not (can.get("saldos") and bancos._may("Account", "read", ledger)):
		frappe.throw(_("Ask your manager for access to the account balances."), frappe.PermissionError)
	card = bool(bank and bank.is_credit_card)
	as_of = today()
	books = bancos._gl_sums([ledger], as_of).get(ledger, 0.0)

	typed = _typed_balance(saldo_banco) if saldo_banco not in (None, "") else None
	if saldo_banco not in (None, "") and typed is None:
		frappe.throw(_("Type the balance as a number, for example 4663.09."))
	synced = bancos._bank_side_balances([bank.name]).get(bank.name) if bank else None
	source = "escrito" if typed is not None else ("conexion" if synced else None)
	bank_figure = typed if typed is not None else (synced or {}).get("amount")
	bank_asset = math.to_asset(bank_figure, card)

	readable = bool(bank) and bancos._may("Bank Transaction")
	run = math.feed_run(_months(bank.name), as_of) if readable else math.feed_run({}, as_of)
	start = run["start"]
	books_before, bank_total, pending, book_only, before = 0.0, 0.0, [], [], None
	conexion, conexion_count, connection = 0.0, 0, None
	if start:
		books_before = bancos._gl_sums([ledger], add_days(start, -1)).get(ledger, 0.0)
		bank_total, pending = _bank_since(bank.name, start)
		book_only = _book_since(ledger, bank.name, start, as_of)
		before = _before(bank.name, start)
		conexion, conexion_count, connection = _connection_out(bank.name, start)

	result = math.breakdown(
		card=card,
		books=books,
		bank=bank_asset,
		start=start,
		books_before=books_before,
		bank_total=bank_total,
		pending=pending,
		book_only=book_only,
		conexion=conexion,
		conexion_count=conexion_count,
		behind=run["behind"],
	)
	sign = -1 if card else 1
	shown = [book for _row, book in result["pairs"][:PAIRS_SHOWN]] + result["only_books"][:ROWS_SHOWN]
	labels = bancos._voucher_labels({(row["doctype"], row["name"]) for row in shown})
	bank_side = _bank_rows([row for row, _book in result["pairs"][:PAIRS_SHOWN]])
	book_side = _book_rows([book for _row, book in result["pairs"][:PAIRS_SHOWN]], labels)
	pairs = [
		{"movimiento": movement, "registro": entry, "ligable": entry["matchable"]}
		for movement, entry in zip(bank_side, book_side, strict=True)
	]
	for pair in pairs:  # the screen shows a card's movements as what they add to the debt
		pair["movimiento"]["amount"] = flt(sign * pair["movimiento"]["amount"], 2)
		pair["registro"]["amount"] = flt(sign * pair["registro"]["amount"], 2)
	only_bank = _bank_rows(result["only_bank"][:ROWS_SHOWN])
	only_books = _book_rows(result["only_books"][:ROWS_SHOWN], labels)
	for row in [*only_bank, *only_books]:
		row["amount"] = flt(sign * row["amount"], 2)
	return {
		"cuenta": bank.name if bank else ledger,
		"kind": "tarjeta" if card else ("banco" if bank else "otra"),
		"currency": frappe.get_cached_value("Account", ledger, "account_currency")
		or bancos._currency(frappe.get_cached_value("Account", ledger, "company")),
		"as_of": as_of,
		"bank": result["bank"],
		"bank_at": (synced or {}).get("at") if source == "conexion" else None,
		"bank_source": source,
		"books": result["books"],
		"difference": result["difference"],
		"agrees": result["agrees"],
		"start": result["start"],
		"first": run["first"],
		"holes": run["holes"],
		"behind": run["behind"],
		"before": before,
		"opening": result["opening"],
		"lines": result["lines"],
		"pairs": pairs,
		"pairs_total": len(result["pairs"]),
		"only_bank": only_bank,
		"only_bank_total": len(result["only_bank"]),
		"only_books": only_books,
		"only_books_total": len(result["only_books"]),
		"conexion": connection,
		"can": {
			"ligar": bool(can.get("conciliar")) and any(pair["ligable"] for pair in pairs),
			"conectar": bool(can.get("conectar")),
		},
		"engine": "contador" if bancos._contador_module() else "erpnext",
	}


# ---------------------------------------------------------------- links


def _pairs_arg(pares):
	rows = json.loads(pares) if isinstance(pares, str) else pares
	if not isinstance(rows, list) or not rows:
		frappe.throw(_("Choose the movements to link."))
	out, seen = [], set()
	for row in rows[:LINK_MAX]:
		if not isinstance(row, dict):
			continue
		movement, doctype, name = row.get("movimiento"), row.get("doctype"), row.get("name")
		if not (movement and doctype and name) or (movement in seen):
			continue
		seen.add(movement)
		out.append((str(movement), str(doctype), str(name)))
	return out


def _request_id(movement, doctype, name):
	"""The same pair always sends the same id (a retry replays, never links twice), in the
	shape Contador accepts: 8 to 64 letters, digits and hyphens."""
	digest = hashlib.sha1(f"{movement}\x1f{doctype}\x1f{name}".encode()).hexdigest()[:40]
	return f"cuadre-{digest}"


@frappe.whitelist(methods=["POST"])
def ligar(cuenta: str, pares: str | list) -> dict:
	"""Link each confirmed pair, one by one, as the movement sheet's «Conciliar» would.

	A pair is linked only when the engine still proposes that very payment or journal
	entry for the movement (its own candidates, fingerprint and amount); anything else
	is reported back with the engine's reason and left as it was.
	"""
	bancos._require()
	bank, _ledger = bancos._resolve(cuenta)
	if not bank:
		frappe.throw(_("Only bank and card accounts have movements to link."))
	done, refused = [], []
	pairs = _pairs_arg(pares)
	for i, (movement, doctype, name) in enumerate(pairs):
		if frappe.db.get_value("Bank Transaction", movement, "bank_account") != bank.name:
			refused.append(
				{"movimiento": movement, "name": name, "message": _("It belongs to another account.")}
			)
			continue
		savepoint = "crm_cuadre_ligar"
		frappe.db.savepoint(savepoint)
		try:
			detail = bancos.movimiento(movement)
			pick = next(
				(
					row
					for row in detail.get("candidates") or []
					if (row["doctype"], row["name"]) == (doctype, name)
				),
				None,
			)
			if not detail.get("can", {}).get("conciliar"):
				reason = next((row.get("message") for row in detail.get("blocked") or []), None)
				refused.append(
					{
						"movimiento": movement,
						"name": name,
						"message": reason or _("Your role cannot reconcile bank movements."),
					}
				)
				continue
			if not pick:
				refused.append(
					{
						"movimiento": movement,
						"name": name,
						"message": _("It is no longer proposed for this movement."),
					}
				)
				continue
			answer = bancos.conciliar(
				movement,
				doctype,
				name,
				fingerprint=pick.get("fingerprint"),
				apply_amount=pick.get("apply_amount"),
				request_id=_request_id(movement, doctype, name),
				scope=detail.get("scope") or "near",
			)
		except frappe.ValidationError as exc:
			if not _back_to(savepoint):
				return _lost(done, refused, pairs[i:])
			refused.append(
				{"movimiento": movement, "name": name, "message": frappe.utils.strip_html(str(exc))}
			)
			continue
		if answer.get("ok") is False:
			# the engine answers a lock conflict by rolling back, the whole transaction when a
			# deadlock ended it: then what this call linked before is gone too
			if not _back_to(savepoint):
				return _lost(done, refused, pairs[i:])
			refused.append({"movimiento": movement, "name": name, "message": answer.get("message") or ""})
		else:
			done.append({"movimiento": movement, "name": name, "state": answer.get("state")})
	return {"ligados": done, "rechazados": refused}


def _back_to(savepoint) -> bool:
	"""Roll back to `savepoint`; False when the database had already ended the transaction (then
	everything is rolled back)."""
	try:
		frappe.db.rollback(save_point=savepoint)
	except Exception:
		frappe.db.rollback()
		frappe.clear_messages()
		return False
	frappe.clear_messages()
	return True


def _lost(done, refused, rest):
	"""Nothing of this call was kept: every pair reads as refused, with the reason."""
	message = _("Someone else changed these movements at the same time. Nothing was saved; try again.")
	gone = [{"movimiento": row["movimiento"], "name": row["name"], "message": message} for row in done]
	gone += [{"movimiento": movement, "name": name, "message": message} for movement, _d, name in rest]
	return {"ligados": [], "rechazados": refused + gone, "perdido": True}
