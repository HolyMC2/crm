"""Tablero sources from the shell (doco docs/TABLEROS.md §1).

Every Resultados card (`muelle_resultados_cards`: Mercado, Taller, CRM,
Encuestas) is a board source `resultados.<card key>`, so a card is a widget
with no code in the app that owns it. The resolver reads the card through
`resultados.board` as the person looking at the board: the same cache, the
same refusal, the same drill. Registered with `doco_tablero_sources`.
"""

import frappe
from frappe import _

from crm.api import resultados

RESOLVER = "crm.tableros.resolver"
PREFIX = "resultados."
# The board's period (doco resolve_period keywords) as a Resultados period;
# any other one is a Resultados «rango» of the same dates.
PERIODO = {
	"hoy": "hoy",
	"ayer": "ayer",
	"esta_semana": "semana",
	"este_mes": "mes",
	"mes_pasado": "mes_anterior",
}
# The card's name before its first answer (the frontend's useResultados TITLES).
TITLES = {
	"ventas": "Sales",
	"tickets": "Tickets",
	"ticket_promedio": "Average ticket",
	"promedio_diario": "Daily average",
	"tratos": "Won deals",
	"tendencia": "Daily trend",
	"meta": "Monthly goal",
	"margen": "Margin",
	"descuentos": "Discounts",
	"devoluciones": "Returns",
	"cancelaciones": "Cancellations",
	"efectivo": "Cash",
	"clientes": "Customers",
	"por_cobrar": "To collect",
	"reparaciones": "Repairs",
	"encuestas": "Recommendation",
	"tiendas": "Sales by shop",
	"mix_grupos": "Sales by group",
	"top_articulos": "Top products",
	"vendedores": "Sales by seller",
	"formas_pago": "Payment methods",
	"por_hora": "Sales by hour",
	"dia_semana": "Sales by weekday",
	"hora_dia": "Hour × day",
}
APPS = {"tratos": "crm", "encuestas": "crm", "reparaciones": "taller"}
PARAMS = {
	"compara": {"default": "anterior", "opciones": list(resultados.COMPARAS)},
	"empresa": {"default": None, "opciones": None},
	"tienda": {"default": None, "opciones": None},
}


def board_query(periodo):
	"""The Resultados query for a board period."""
	if periodo in PERIODO:
		return {"periodo": PERIODO[periodo]}
	from doco.docoutils.books.analytics_query import resolve_period

	desde, hasta = resolve_period(periodo or "este_mes")
	return {"periodo": "rango", "desde": str(desde), "hasta": str(hasta)}


def catalogo(ctx):
	"""The cards this person may see, each one a source."""
	user = ctx.get("user") or frappe.session.user
	check = {"user": user, "check": 1, **resultados.query()}
	out = []
	for key, path in resultados._providers():
		card = resultados._call(key, path, check)
		if card is None or card.get("blocked_reason"):
			continue
		out.append(
			{
				"id": PREFIX + key,
				"titulo": _(TITLES.get(key) or key.replace("_", " ").capitalize()),
				"descripcion": _("The «{0}» card of Resultados, for the board's period.").format(
					_(TITLES.get(key) or key)
				),
				"app": APPS.get(key, "mercado"),
				"tipos": ["numero", "grafica", "lista"],
				"params": PARAMS,
				"resolver": RESOLVER,
			}
		)
	return out


def _blocked(reason, retry=False):
	return {"kind": "blocked", "reason": reason, "retry": retry}


def resolver(source_id, params, ctx):
	"""One card for the viewer and the board's period."""
	key = source_id[len(PREFIX) :] if source_id.startswith(PREFIX) else ""
	if not key:
		raise LookupError(source_id)
	params = params or {}
	out = resultados.board(
		card=key,
		compara=params.get("compara"),
		empresa=params.get("empresa"),
		tienda=params.get("tienda"),
		**board_query(ctx.get("periodo")),
	)
	card = next(iter(out.get("cards") or []), None)
	if not card:
		return _blocked(_("This card does not apply to you."))
	if card.get("blocked_reason"):
		return _blocked(card["blocked_reason"], bool(card.get("retry")))
	return {
		"kind": "card",
		"card": card,
		"currency": out.get("currency") or "",
		"period": out.get("period"),
		"query": out.get("query"),
	}
