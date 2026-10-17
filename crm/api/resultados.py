"""Resultados: the owner's numbers for a period, each one opening its records.

Resultados owns no records; the only thing it writes is the caller's own
choice of hidden cards («Personalizar»), a user default that follows them to
every device. The cards come from the apps
that own the numbers through the `muelle_resultados_cards` hook: each dotted
path is one card (its function name is the card key) and returns a card, a card
blocked with its reason, or None when the card does not apply to the caller.
Mercado provides Ventas, Margen, Efectivo and Por cobrar; Taller provides
Reparaciones. This module composes them: one try/except per card (a failing
card shows its own retry, never takes the board down) and a per-user cache
keyed by the query and a generation counter that a submitted or cancelled
sale, cash closing or repair order moves after commit.
"""

import json
import re

import frappe
from frappe import _

CARD_ORDER = (
	# Headline numbers, one small card each.
	"ventas",
	"tickets",
	"ticket_promedio",
	"promedio_diario",
	# CRM: deals won in the period (the Dashboard, folded in on a phone).
	"tratos",
	# The period's shape, and the shops it came from.
	"tendencia",
	"tiendas",
	# Health of the money.
	"meta",
	"margen",
	"descuentos",
	"devoluciones",
	"cancelaciones",
	"efectivo",
	"clientes",
	"por_cobrar",
	"reparaciones",
	# What sold, who sold it and how it was paid.
	"mix_grupos",
	"top_articulos",
	"vendedores",
	"formas_pago",
	"por_hora",
	"dia_semana",
	"hora_dia",
)
# Hoy, Ayer, Semana (Monday to today), Mes (month to date), Mes anterior and
# Rango (desde..hasta, both ISO dates, at most a year).
PERIODOS = ("hoy", "ayer", "semana", "mes", "mes_anterior", "rango")
COMPARAS = ("anterior", "anio", "no")
TTL = {"hoy": 60, "ayer": 600, "semana": 300, "mes": 300, "mes_anterior": 900, "rango": 300}
GEN_KEY = "resultados:gen"
MAX_TEXT = 140
# «Personalizar»: the card keys the user hides, as a JSON list in a user
# default. Keys are card function names; unknown ones are kept (a card the user
# may not see today stays hidden once they may), malformed ones are dropped.
HIDDEN_DEFAULT = "muelle_resultados_hidden"
MAX_HIDDEN = 64
_CARD_KEY = re.compile(r"^[a-z][a-z0-9_]{0,59}$")


def _providers():
	"""(card key, dotted path) of every installed card, in board order."""
	paths = frappe.get_hooks("muelle_resultados_cards") or []
	rows = [(path.rsplit(".", 1)[-1], path) for path in paths]
	order = {key: index for index, key in enumerate(CARD_ORDER)}
	return sorted(rows, key=lambda row: order.get(row[0], len(order)))


def _text(value):
	return value.strip()[:MAX_TEXT] if isinstance(value, str) else ""


def _iso(value):
	"""An ISO date (YYYY-MM-DD) or ""; anything else is dropped, never an error."""
	value = _text(value)
	try:
		return str(frappe.utils.getdate(value)) if len(value) == 10 and value[4] == "-" else ""
	except Exception:
		return ""


def query(periodo=None, compara=None, empresa=None, tienda=None, desde=None, hasta=None):
	"""The normalised board query; unknown values fall back to Mes vs. anterior.
	Rango carries `desde`/`hasta` (ordered); without both it is Mes."""
	q = {
		"periodo": periodo if periodo in PERIODOS else "mes",
		"compara": compara if compara in COMPARAS else "anterior",
		"empresa": _text(empresa),
		"tienda": _text(tienda),
	}
	if q["periodo"] == "rango":
		start, end = _iso(desde), _iso(hasta)
		if not (start and end):
			q["periodo"] = "mes"
		else:
			q["desde"], q["hasta"] = sorted((start, end))
	return q


def generation():
	# Site-scoped by make_key; the same key the tests bump with cache.incr.
	raw = frappe.cache.get(frappe.cache.make_key(GEN_KEY))  # nosemgrep: frappe-cache-breaks-multitenancy
	return int(raw or 0)


def cache_key(user, card, q, gen):
	periodo = q["periodo"]
	if periodo == "rango":
		periodo = "rango={0}..{1}".format(q["desde"], q["hasta"])
	return "resultados:{0}:{1}:{2}:{3}:{4}:{5}:{6}".format(
		user, card, periodo, q["compara"], q["empresa"], q["tienda"], gen
	)


def clean_hidden(keys):
	"""Card keys only, once each, in the order given, at most MAX_HIDDEN."""
	if isinstance(keys, str):
		try:
			keys = json.loads(keys)
		except ValueError:
			keys = None
	if not isinstance(keys, list | tuple):
		return []
	out = []
	for key in keys:
		if isinstance(key, str) and _CARD_KEY.match(key) and key not in out:
			out.append(key)
	return out[:MAX_HIDDEN]


def saved_hidden(user=None):
	"""The user's hidden cards, or None when they never chose (the device's
	own older choice may then be adopted)."""
	raw = frappe.defaults.get_user_default(HIDDEN_DEFAULT, user=user or frappe.session.user)
	if not raw:
		return None
	try:
		value = json.loads(raw)
	except ValueError:
		return None
	return clean_hidden(value) if isinstance(value, list) else None


def _blocked(key, reason, retry=False):
	return {"key": key, "blocked_reason": reason, "retry": retry}


def _require_user():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)


def _call(key, path, ctx):
	"""One card; its refusal or failure stays on that card."""
	try:
		card = frappe.get_attr(path)(ctx)
	except frappe.PermissionError as error:
		return _blocked(key, str(error) or _("You do not have access to this card."))
	except Exception:
		frappe.log_error(title=f"Resultados card {key}")
		return _blocked(key, _("We could not load this card. Retry in a moment."), retry=True)
	if card is not None:
		card["key"] = key
	return card


def get_capabilities():
	"""Shell boot: permission checks only, no numbers. None when no app
	provides a card (neither Mercado nor Taller installed)."""
	providers = _providers()
	if not providers:
		return None
	if frappe.session.user == "Guest":
		return {"enabled": False, "reason": _("Sign in to open Muelle.")}
	ctx = {"user": frappe.session.user, "check": 1, **query()}
	reason = None
	for key, path in providers:
		card = _call(key, path, ctx)
		if card is None:
			continue
		if not card.get("blocked_reason"):
			return {"enabled": True, "reason": None}
		reason = reason or card["blocked_reason"]
	return {
		"enabled": False,
		"reason": reason
		or _(
			"Resultados shows sales, cash and repair numbers to the managers who follow them. Ask your manager for access."
		),
	}


def check_resultados_permission():
	answer = get_capabilities()
	return bool(answer and answer.get("enabled"))


def _scope(ctx):
	"""Companies and shops the caller may pick, from the providers' own scope."""
	companies, shops = set(), []
	for path in frappe.get_hooks("muelle_resultados_scope") or []:
		try:
			answer = frappe.get_attr(path)(ctx) or {}
		except Exception:
			frappe.log_error(title="Resultados scope")
			continue
		companies.update(answer.get("companies") or [])
		shops.extend(answer.get("shops") or [])
	if not companies:
		companies.update(frappe.get_list("Company", pluck="name", limit_page_length=0))
	return {"companies": sorted(companies), "shops": shops}


@frappe.whitelist(methods=["GET", "POST"])
def board(
	periodo: str | None = None,
	compara: str | None = None,
	empresa: str | None = None,
	tienda: str | None = None,
	card: str | None = None,
	desde: str | None = None,
	hasta: str | None = None,
):
	"""Every card the caller may see for the query, in board order. `card`
	reloads one card (its retry). A card the caller may not see is absent or
	blocked with its reason; it is never a zero."""
	_require_user()
	user = frappe.session.user
	q = query(periodo, compara, empresa, tienda, desde, hasta)
	ctx = {"user": user, **q}
	gen = generation()
	ttl = TTL[q["periodo"]]
	cards = []
	for key, path in _providers():
		if card and key != card:
			continue
		ck = cache_key(user, key, q, gen)
		cached = frappe.cache.get_value(ck)
		if cached is not None:
			if cached.get("absent"):
				continue
			cards.append(cached)
			continue
		answer = _call(key, path, ctx)
		if answer is None:
			frappe.cache.set_value(ck, {"absent": True}, expires_in_sec=ttl)
			continue
		if not answer.get("retry"):
			frappe.cache.set_value(ck, answer, expires_in_sec=ttl)
		cards.append(answer)
	period = next((c.get("period") for c in cards if c.get("period")), None)
	return {
		"query": q,
		"cards": cards,
		"period": period,
		"scope": None if card else _scope(ctx),
		"hidden": None if card else saved_hidden(user),
		"currency": frappe.defaults.get_global_default("currency"),
		"generated_at": frappe.utils.now(),
	}


@frappe.whitelist(methods=["POST"])
def save_hidden(hidden: str | list | None = None):
	"""The caller's own «Personalizar»: the cards they hide on every device.
	Only their user default changes; the board still computes every card."""
	_require_user()
	clean = clean_hidden(hidden)
	frappe.defaults.set_user_default(HIDDEN_DEFAULT, json.dumps(clean), user=frappe.session.user)
	return {"hidden": clean}


def _delegate(hook, *args):
	paths = frappe.get_hooks(hook) or []
	if not paths:
		frappe.throw(
			_("These documents are not available on this site. Ask your manager to check the apps."),
			frappe.PermissionError,
		)
	return frappe.get_attr(paths[0])(*args)


@frappe.whitelist(methods=["GET", "POST"])
def documents(
	tipo: str | None = None,
	periodo: str | None = None,
	compara: str | None = None,
	empresa: str | None = None,
	tienda: str | None = None,
	desde: str | None = None,
	hasta: str | None = None,
):
	"""The records behind a card for the same query (Mercado's lens), limited
	to what the caller may read."""
	_require_user()
	q = query(periodo, compara, empresa, tienda, desde, hasta)
	ctx = {"user": frappe.session.user, "tipo": _text(tipo), **q}
	out = _delegate("muelle_resultados_documents", ctx)
	out["query"] = {"tipo": ctx["tipo"], **q}
	return out


@frappe.whitelist(methods=["GET", "POST"])
def document(doctype: str, name: str):
	"""One ticket or cash closing of the lens; the document's own read
	permission decides."""
	_require_user()
	return _delegate("muelle_resultados_document", _text(doctype), str(name or "")[:MAX_TEXT])
