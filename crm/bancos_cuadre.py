"""Cuadre: why an account's books and its bank disagree, and how much each reason weighs.

Pure (no Frappe), so the arithmetic is pinned by bench-free tests
(crm/tests/test_bancos_cuadre.py); crm/api/bancos_cuadre.py reads the rows.

Amounts are in the asset sense: + is money in the account, - is money owed on it
(a credit card). `natural` turns a card's figures into «what is owed» at the
edge, one sign for everything, so the identity below holds in both senses.

With S the date of the first bank movement Muelle has for the account:

    bank - books = antes        the bank's balance before S - the books' balance before S
                 + solo_banco   bank movements the books do not have (unreconciled)
                 + conexion     connection movements since S that never became bank movements
                 - solo_libros  book entries since S linked to no bank movement
                 + otros        links whose amount differs from the entry on this ledger

A pair (a pending bank movement and an unlinked book entry for the same amount
within WINDOW days) sits in both solo_banco and solo_libros and cancels out: the
same money, only not linked yet. Pairs are reported apart, so solo_banco and
solo_libros only count what is really missing on one side.
"""

from __future__ import annotations

from datetime import date, datetime

WINDOW = 7  # days around the bank movement, as ERPNext's and Contador's matchers look
CENT = 0.005


def _day(value) -> date | None:
	if value is None or value == "":
		return None
	if isinstance(value, datetime):
		return value.date()
	if isinstance(value, date):
		return value
	return date.fromisoformat(str(value)[:10])


def _cents(value) -> int:
	return round(float(value or 0) * 100)


def _money(value) -> float:
	return round(float(value or 0) + 0.0, 2)


def to_asset(amount, card: bool) -> float | None:
	"""A balance as the bank or the person states it, in the asset sense.

	A card's balance is what is owed. Syncfy's sign for it varies by institution
	(BBVA and Amex report the debt negative), so a card counts as owed whatever
	the sign: -|amount|. A card paid beyond its debt reads as owed too; that is
	rare and shows in the difference instead of hiding it.
	"""
	if amount is None or amount == "":
		return None
	amount = float(amount)
	return -abs(amount) if card else amount


def natural(amount, card: bool) -> float | None:
	"""An asset-sense amount as the screen shows it: a card's as what is owed."""
	if amount is None:
		return None
	return _money(-amount if card else amount)


def bank_figure(amount, card: bool) -> float | None:
	"""The bank's balance as the screen shows it: a card's as what is owed (see to_asset)."""
	return natural(to_asset(amount, card), card)


def difference(bank_natural, books_natural) -> float | None:
	"""bank - books in the account's own terms; None without one of them."""
	if bank_natural is None or books_natural is None:
		return None
	return _money(float(bank_natural) - float(books_natural))


def agrees(diff) -> bool:
	return diff is not None and abs(diff) < CENT


def pair(bank_rows, book_rows, window: int = WINDOW) -> list[tuple[dict, dict]]:
	"""Pending bank movements and unlinked book entries for the same amount, one to one.

	bank_rows: {name, date, amount} with amount the movement's unreconciled part.
	book_rows: {doctype, name, date, amount, matchable}; only matchable ones pair.
	Closest dates pair first, across all movements of the same amount, so a run of
	equal amounts (rent, a fixed transfer) pairs each with its own month and one
	early pick never pushes another movement out of its window. Returned in the
	bank movements' date order.
	"""
	books: dict[int, list[tuple[date, dict]]] = {}
	for row in book_rows:
		booked = _day(row.get("date"))
		if booked and row.get("matchable", True):
			books.setdefault(_cents(row["amount"]), []).append((booked, row))
	edges = []
	for bank in bank_rows:
		when = _day(bank.get("date"))
		if not when:
			continue
		for booked, book in books.get(_cents(bank["amount"]), ()):
			gap = abs((booked - when).days)
			if gap <= window:
				edges.append((gap, when, str(bank["name"]), booked, str(book["name"]), bank, book))
	edges.sort(key=lambda edge: edge[:5])
	taken_bank: set[str] = set()
	taken_book: set[tuple] = set()
	out = []
	for _gap, when, name, _booked, _book_name, bank, book in edges:
		identity = (book["doctype"], book["name"])
		if name in taken_bank or identity in taken_book:
			continue
		taken_bank.add(name)
		taken_book.add(identity)
		out.append((when, name, bank, book))
	out.sort(key=lambda item: item[:2])
	return [(bank, book) for _when, _name, bank, book in out]


def months_without(months_seen, start, end) -> list[str]:
	"""«YYYY-MM» months from start's to end's (both included) with no bank movement."""
	start, end = _day(start), _day(end)
	if not start or not end or end < start:
		return []
	seen = set(months_seen or ())
	out = []
	year, month = start.year, start.month
	while (year, month) <= (end.year, end.month):
		key = f"{year:04d}-{month:02d}"
		if key not in seen:
			out.append(key)
		year, month = (year + 1, 1) if month == 12 else (year, month + 1)
	return out


def _month(day: date) -> str:
	return f"{day.year:04d}-{day.month:02d}"


def _next_month(key: str) -> str:
	year, month = int(key[:4]), int(key[5:7])
	year, month = (year + 1, 1) if month == 12 else (year, month + 1)
	return f"{year:04d}-{month:02d}"


def feed_run(months: dict, today) -> dict:
	"""Where the bank's movements in Muelle run unbroken up to their latest one.

	months: {«YYYY-MM»: first date of a bank movement in that month}. A whole
	calendar month without movements breaks the run: a statement never imported,
	or a feed connected later. The cuadre starts at the run (`start`); movements
	before it count as history. `holes` names every empty month from the first
	movement to today; `behind` says the latest movement is older than last
	month, so the bank figure of today includes movements Muelle does not have.
	"""
	today = _day(today)
	keys = sorted(months)
	if not keys or not today:
		return {"start": None, "first": None, "holes": [], "behind": False}
	first = _day(months[keys[0]])
	run = keys[-1]
	for key in reversed(keys[:-1]):
		if _next_month(key) != run:
			break
		run = key
	current = _month(today)
	previous = _month(
		date(today.year - 1, 12, 1) if today.month == 1 else date(today.year, today.month - 1, 1)
	)
	return {
		"start": str(_day(months[run])),
		"first": str(first),
		"holes": months_without(keys, first, today),
		"behind": keys[-1] not in (current, previous),
	}


def breakdown(
	*,
	card: bool,
	books: float,
	bank: float | None = None,
	start=None,
	books_before: float = 0.0,
	bank_total: float = 0.0,
	pending=(),
	book_only=(),
	conexion: float = 0.0,
	conexion_count: int = 0,
	behind: bool = False,
) -> dict:
	"""The difference and its lines, in the account's own terms (natural).

	Asset-sense inputs:
	  books         the books' balance today
	  bank          the bank's balance (None: unknown, the lines still show)
	  start         date of the first bank movement (None: Muelle has none)
	  books_before  the books' balance on the day before start
	  bank_total    every bank movement since start, net
	  pending       {name, date, amount}: the unreconciled part of each bank movement
	  book_only     {doctype, name, date, amount, matchable}: entries since start linked to none
	  conexion      connection movements since start that are not bank movements, net
	  behind        the latest bank movement is older than last month (see feed_run)

	Without a start, or behind, what the bank has and Muelle does not cannot be
	told apart from the opening: that remainder is one line, «faltan».
	"""
	pending, book_only = list(pending), list(book_only)
	pairs = pair(pending, book_only) if start else []
	paired_bank = {row["name"] for row, _book in pairs}
	paired_book = {(book["doctype"], book["name"]) for _row, book in pairs}
	only_bank = [row for row in pending if row["name"] not in paired_bank]
	only_books = [row for row in book_only if (row["doctype"], row["name"]) not in paired_book]

	bank_sum = sum(float(row["amount"]) for row in pending)
	book_sum = sum(float(row["amount"]) for row in book_only)
	pair_sum = sum(float(row["amount"]) for row, _book in pairs)

	diff = None if bank is None else float(bank) - float(books)
	lines = [
		_line("pares", len(pairs), pair_sum, 0.0, card),
		_line("solo_banco", len(only_bank), bank_sum - pair_sum, bank_sum - pair_sum, card),
		_line("conexion", conexion_count, conexion, conexion, card),
		_line("solo_libros", len(only_books), book_sum - pair_sum, -(book_sum - pair_sum), card),
	]
	opening = None
	if bank is not None and diff is not None:
		explained = bank_sum + float(conexion) - book_sum
		if start and not behind:
			bank_before = float(bank) - float(bank_total) - float(conexion)
			gap = bank_before - float(books_before)
			opening = {"bank": natural(bank_before, card), "books": natural(books_before, card)}
			lines.append(_line("antes", 0, gap, gap, card))
			lines.append(_line("otros", 0, diff - explained - gap, diff - explained - gap, card))
		else:
			lines.append(_line("faltan", 0, diff - explained, diff - explained, card))
	return {
		"bank": natural(bank, card),
		"books": natural(books, card),
		"difference": natural(diff, card),
		"agrees": agrees(diff),
		"start": str(_day(start)) if start else None,
		"opening": opening,
		"lines": [line for line in lines if line["count"] or abs(line["amount"]) >= CENT],
		"pairs": pairs,
		"only_bank": only_bank,
		"only_books": only_books,
	}


def _line(key: str, count: int, amount, effect, card: bool) -> dict:
	return {
		"key": key,
		"count": int(count),
		"amount": natural(float(amount), card),
		"effect": natural(float(effect), card),
	}
