"""Hoy (`/crm/hoy`): the shell's landing page and its one batched read.

Doco answers the worker's day (pendientes, agenda, work in other apps); this
adds the avisos that ask for action. Every section is guarded on its own, so a
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
		answer = avisos.stream(view="inbox", limit=AVISOS_LIMIT)
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
