"""Hoy (`/crm/hoy`): the shell's landing page and its one batched read.

Doco answers the worker's day (pendientes, agenda, work in other apps); this
adds the avisos that ask for action, the seller's and team's follow-ups, and
today's sales and credit sales for the managers who follow them. Every section is guarded on its own, so a
missing app or permission turns that section off with a reason, never the page.
"""

import frappe
from frappe import _

from crm.avisos import stream as avisos

LANDING_DEFAULT = "muelle_landing"
AVISOS_LIMIT = 3
FOLLOW_UP_LIMIT = 5
FOLLOW_UP_CAP = 100
FOLLOW_UP_QUEUE = "sin_seguimiento"
TEAM_QUEUE = "vencidos"
TEAM_ROLES = ("Sales Manager", "System Manager")
TEAM_LIMIT = 5
TEAM_CAP = 2000
SALES_CARD = "ventas"
CREDIT_CARD = "credito"


def check_hoy_permission(user: str | None = None) -> bool:
	"""Hoy is every staff account's home; each section re-checks its own source."""
	return avisos.is_enabled(user)


def _require():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to open Muelle."), frappe.AuthenticationError)
	if not check_hoy_permission():
		frappe.throw(
			_("Hoy is available to staff accounts only. Ask your manager to check your user."),
			frappe.PermissionError,
		)


def _avisos():
	try:
		answer = avisos.stream(view="inbox", limit=AVISOS_LIMIT, actionable=True)
	except frappe.PermissionError:
		frappe.clear_last_message()
		return {"available": False, "reason": None}
	except Exception:
		frappe.logger("crm.hoy").exception("Hoy avisos failed")
		frappe.clear_last_message()
		return {"available": False, "failed": True}
	return {
		"available": True,
		"groups": answer["groups"],
		"total": answer["total"],
		"more": answer["more"],
		"badge": answer["badge"],
	}


def _deal_title(row) -> str:
	person = " ".join(part for part in (row.get("first_name"), row.get("last_name")) if part)
	return row.get("deal_name") or row.get("organization") or person or row.get("mobile_no") or row.name


def _follow_up():
	"""My open deals with no next step: the queue a seller clears first.

	The predicate is the deals list's own «Sin seguimiento» queue
	(``crm.api.deal_queues``), narrowed to deals I own, so Hoy and the list never
	disagree. The count is capped like the other Hoy counts.
	"""
	from crm.api.deal_queues import QUEUES
	from crm.api.list_tokens import resolve_filter_tokens

	if not frappe.has_permission("CRM Deal", "read"):
		return {"available": False, "reason": None}
	queue = next(queue for queue in QUEUES if queue["key"] == FOLLOW_UP_QUEUE)
	filters = resolve_filter_tokens({**queue["filters"], "deal_owner": frappe.session.user})
	# Only sellers: someone who owns no open deal (a technician, a cashier) gets no section.
	if not frappe.get_list(
		"CRM Deal", filters={"status": filters["status"], "deal_owner": frappe.session.user}, limit=1
	):
		return {"available": False, "reason": None}
	meta = frappe.get_meta("CRM Deal")
	wanted = ("deal_name", "organization", "first_name", "last_name", "mobile_no", "status", "modified")
	fields = ["name", *(field for field in wanted if field == "modified" or meta.has_field(field))]
	names = frappe.get_list(
		"CRM Deal", filters=filters, pluck="name", order_by="modified desc", limit=FOLLOW_UP_CAP + 1
	)
	rows = (
		frappe.get_list(
			"CRM Deal",
			filters={"name": ["in", names[:FOLLOW_UP_LIMIT]]},
			fields=fields,
			order_by="modified desc",
		)
		if names
		else []
	)
	return {
		"available": True,
		"count": {"value": min(len(names), FOLLOW_UP_CAP), "capped": len(names) > FOLLOW_UP_CAP},
		"rows": [
			{
				"name": row.name,
				"title": _deal_title(row),
				"status": row.get("status"),
				"modified": str(row.modified),
			}
			for row in rows
		],
		"owner": frappe.session.user,
	}


def _team_overdue():
	"""For managers: open deals whose next step is overdue, counted per owner.

	The escalation view of the reminders (crm.pipeline.services.reminders). Same
	predicate as the list's «Vencidos» queue, read through get_list so the sales
	hierarchy scopes it: a team lead sees their team, a Sales Manager outside the
	tree sees everyone.
	"""
	from collections import Counter

	from crm.api.deal_queues import QUEUES
	from crm.api.list_tokens import resolve_filter_tokens

	if not set(frappe.get_roles()) & set(TEAM_ROLES) or not frappe.has_permission("CRM Deal", "read"):
		return {"available": False, "reason": None}
	queue = next(queue for queue in QUEUES if queue["key"] == TEAM_QUEUE)
	owners = frappe.get_list(
		"CRM Deal", filters=resolve_filter_tokens(queue["filters"]), pluck="deal_owner", limit=TEAM_CAP + 1
	)
	counts = Counter(owner or "" for owner in owners[:TEAM_CAP])
	names = {
		row.name: row.full_name
		for row in frappe.get_all(
			"User",
			filters={"name": ["in", [owner for owner in counts if owner]]},
			fields=["name", "full_name"],
		)
	}
	return {
		"available": True,
		"count": {"value": min(len(owners), TEAM_CAP), "capped": len(owners) > TEAM_CAP},
		"rows": [
			{"owner": owner, "name": names.get(owner) or owner, "count": count}
			for owner, count in counts.most_common(TEAM_LIMIT)
		],
		"owners": len(counts),
	}


# Resultados could not compute a card Hoy shows: the section offers a retry.
FAILED = {"available": False, "failed": True}


def _resultados_card(key):
	"""Resultados' own card `key` for today (Mercado's board, with the board's
	per-user cache and generation counter) and the currency: (card, currency),
	(None, None) when the worker may not read it or it does not apply, and
	(FAILED, None) when the card failed."""
	from crm.api import money, resultados

	# Nobody the owner keeps the business's money from sees these numbers.
	if money.hidden() or key not in (card for card, _path in resultados._providers()):
		return None, None
	answer = resultados.board(periodo="hoy", compara="anterior", card=key)
	card = next(iter(answer["cards"]), None)
	if card and card.get("retry"):
		return FAILED, None
	if not card or card.get("blocked_reason"):
		return None, None
	return card, answer.get("currency")


def _sales_today():
	"""For the managers who follow sales: what today's tickets charged so far.

	The number is Resultados' own «Ventas» card for Hoy, so its scope and
	cache are Resultados'. Hoy shows what the tickets charged (`charged`):
	the till's number. A credit sale's later payment from its provider is
	Hoy's «Credit sales», never part of today's sales.
	"""
	card, currency = _resultados_card(SALES_CARD)
	if card is FAILED:
		return dict(FAILED)
	if not card:
		return {"available": False, "reason": None}
	# A Mercado older than the split answers only its own total.
	charged = card.get("charged") or {}
	return {
		"available": True,
		"currency": currency,
		"value": charged.get("value", card.get("value")),
		# Yesterday's whole day: context, not a percentage against a day still running.
		"prev": charged.get("prev", card.get("prev")),
		"facts": charged.get("facts") or card.get("facts") or [],
		"attention": card.get("attention"),
		"drill": card.get("drill"),
	}


def _credit_today():
	"""For the same managers: today's sales on a credit provider's credit
	(Payjoy and the like), what each provider pays the shop later and the
	sales still missing their credit price. Resultados' «Credit sales» card;
	a site that sells on no provider's credit has no section.
	"""
	card, currency = _resultados_card(CREDIT_CARD)
	if card is FAILED:
		return dict(FAILED)
	if not card:
		return {"available": False, "reason": None}
	return {
		"available": True,
		"currency": currency,
		"label": card.get("label"),
		"format": card.get("format"),
		"value": card.get("value"),
		"value_label": card.get("value_label"),
		"facts": card.get("facts") or [],
		"items": card.get("items") or [],
		"attention": card.get("attention"),
		"drill": card.get("drill"),
	}


def _handover():
	"""«Entrega de turno»: the handover waiting for me and the last one given (crm.handover)."""
	from crm import handover

	return handover.hoy_state()


def _morning():
	"""«Resumen de ayer»: for the owners and managers who get it each morning (crm.morning)."""
	from crm import morning

	if not set(frappe.get_roles()) & set(morning.RECIPIENT_ROLES):
		return {"available": False, "reason": None}
	return {"available": True}


def _section(build):
	try:
		return build()
	except frappe.PermissionError:
		frappe.clear_last_message()
		return {"available": False, "reason": None}
	except Exception:
		frappe.logger("crm.hoy").exception("Hoy section failed")
		frappe.clear_last_message()
		return {"available": False, "failed": True}


def _doco_day():
	try:
		# A doco older than Hoy (crm updated first) leaves those sections off, not the page.
		from doco.workspaces.hoy import today
	except ImportError:
		today = None
	if "doco" not in frappe.get_installed_apps() or today is None:
		off = {"available": False, "reason": None}
		return {"pendientes": off, "agenda": off, "continuar": off}
	return today()


@frappe.whitelist()
def page() -> dict:
	"""Everything Hoy shows, in one round trip, scoped to the signed-in user."""
	_require()
	day = _doco_day()
	day["avisos"] = _avisos()
	day["seguimiento"] = _section(_follow_up)
	day["equipo"] = _section(_team_overdue)
	day["ventas"] = _section(_sales_today)
	day["credito"] = _section(_credit_today)
	day["turno"] = _section(_handover)
	day["resumen"] = _section(_morning)
	day["landing"] = frappe.defaults.get_user_default(LANDING_DEFAULT) or ""
	return day


def dedicated_app():
	"""The SPA this worker's puesto works in (POS, Taller), or None."""
	if "doco" not in frappe.get_installed_apps():
		return None
	try:
		from doco.workspaces.hoy import dedicated_app as resolve
	except ImportError:
		return None
	try:
		return resolve()
	except Exception:
		frappe.logger("crm.hoy").exception("Hoy landing lookup failed")
		frappe.clear_last_message()
		return None


def landing_choices():
	"""Where Muelle may open for this worker: Hoy, or another module they have."""
	from crm.api.shell import MODULE_KEYS, _hosted, _ventas

	providers = {**_hosted(), "ventas": _ventas}
	keys = []
	for key in MODULE_KEYS:
		provider = providers.get(key)
		if key == "hoy" or key == "avisos" or not provider:
			continue
		try:
			answer = provider()
		except frappe.PermissionError:
			continue
		# A module whose owning app is absent answers nothing at all (Resultados
		# without Mercado or Taller): it is not a choice, and it must not keep the
		# worker from choosing where Muelle opens.
		if answer and answer.get("enabled"):
			keys.append(key)
	return keys


def saved_landing():
	"""The worker's own choice of where Muelle opens, while they still have that module."""
	key = frappe.defaults.get_user_default(LANDING_DEFAULT) or ""
	if key == "hoy":
		return key
	return key if key and key in landing_choices() else ""


@frappe.whitelist(methods=["POST"])
def save_landing(key: str = "") -> dict:
	"""Remember where Muelle opens for me: Hoy, another module I have, or the default."""
	_require()
	key = (key or "").strip()
	if key and key != "hoy" and key not in landing_choices():
		frappe.throw(_("Choose a section you can open."))
	if key:
		frappe.defaults.set_user_default(LANDING_DEFAULT, key)
	else:
		frappe.defaults.clear_user_default(LANDING_DEFAULT)
	return {"landing": key}


def root_landing():
	"""Where `/crm` (and the installed app's start) opens, or None for the Ventas root.

	Order: the worker's own choice, the app their puesto works in (cashier →
	POS, technician → Taller), then Hoy.
	"""
	chosen = saved_landing()
	if chosen == "ventas":
		return None
	if chosen:
		return f"/crm/{chosen}"
	spa = dedicated_app()
	if spa:
		return spa
	return "/crm/hoy" if check_hoy_permission() else None
