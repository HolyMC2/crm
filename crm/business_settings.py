"""«Ajustes del negocio»: every switch the owner may change, in one place in Muelle.

Two kinds of rows:

* **Curated** — an app lists owner-facing settings under the
  ``muelle_business_settings`` hook: a provider returns rows
  ``{"key", "area", "kind", "label", "on", "off" | "help", …}``.
  ``kind="switch"`` is either a Single's Check (``doctype`` + ``field``) or
  read and written by the app itself (``get`` / ``set``, dotted paths that take
  and return a bool), so its own rules apply. ``kind="screen"`` opens the app's
  own settings screen (``to``, a /crm route, or ``href``).
* **Every other switch** — the Check fields of the settings Singles of the
  installed Muelle apps (Frappe and ERPNext stay in Desk), with their own label
  and description. A new setting shows up here without anybody listing it.

Who may change a switch is who may write its Single (the same as Desk), or the
app's own rule for a ``set`` switch. Writes go through the Single document, so
its validations run.
"""

import frappe
from frappe import _
from frappe.utils import cint, cstr

HOOK = "muelle_business_settings"
SKIPPED_APPS = frozenset({"frappe", "erpnext"})
MAX_ADVANCED = 600

# The areas, in the order the page shows them.
AREAS = (
	("ventas", "Sales and prospects"),
	("caja", "Cash register"),
	("taller", "Workshop"),
	("inventario", "Inventory"),
	("equipo", "Team"),
	("hoy", "Hoy and pendientes"),
	("mensajes", "Messages"),
	("otros", "Other settings"),
)


def areas() -> list[dict]:
	return [{"key": key, "label": _(label)} for key, label in AREAS]


# ── curated rows ────────────────────────────────────────────────────────────


def curated() -> list[dict]:
	rows = []
	for path in _paths():
		try:
			answer = _load(path)() or []
		except Exception:
			# One app failing hides only its rows.
			frappe.logger("crm.business_settings").exception(f"Settings provider {path} failed")
			frappe.clear_last_message()
			continue
		for row in answer:
			clean = _resolve(row, path)
			if clean:
				rows.append(clean)
	return rows


def _paths() -> list[str]:
	return list(frappe.get_hooks(HOOK) or [])


def _load(path):
	return frappe.get_attr(path)


def _resolve(row, provider) -> dict | None:
	if not isinstance(row, dict) or not row.get("key") or not row.get("label"):
		return None
	area = row.get("area") if row.get("area") in dict(AREAS) else "otros"
	out = {
		"key": cstr(row["key"])[:140],
		"area": area,
		"kind": row.get("kind") or "switch",
		"label": cstr(row["label"]),
		"help": cstr(row.get("help") or ""),
		"on": cstr(row.get("on") or ""),
		"off": cstr(row.get("off") or ""),
		"provider": provider,
	}
	if out["kind"] == "screen":
		if not (row.get("to") or row.get("href")):
			return None
		out.update(to=row.get("to"), href=row.get("href"))
		return out
	if row.get("doctype") and row.get("field"):
		if not _single_check(row["doctype"], row["field"]):
			return None
		out.update(
			doctype=row["doctype"],
			field=row["field"],
			value=bool(cint(frappe.db.get_single_value(row["doctype"], row["field"]))),
			can_change=bool(frappe.has_permission(row["doctype"], "write")),
		)
		return out
	if row.get("get") and row.get("set"):
		try:
			value = bool(frappe.get_attr(row["get"])())
		except Exception:
			frappe.logger("crm.business_settings").exception(f"Setting {out['key']} could not be read")
			frappe.clear_last_message()
			return None
		out.update(value=value, can_change=bool(row.get("can_change", True)))
		return out
	return None


# ── every other switch ──────────────────────────────────────────────────────


def advanced(skip: set | None = None) -> list[dict]:
	"""Check fields of the installed Muelle apps' settings Singles the user may read."""
	skip = skip or set()
	modules = _app_modules()
	singles = frappe.get_all(
		"DocType",
		filters={"issingle": 1, "istable": 0, "module": ["in", list(modules)]},
		fields=["name", "module"],
		order_by="name asc",
	)
	rows = []
	for single in singles:
		if not frappe.has_permission(single.name, "read"):
			continue
		meta = frappe.get_meta(single.name)
		writable = bool(frappe.has_permission(single.name, "write"))
		values = None
		for field in meta.fields:
			if (
				field.fieldtype != "Check"
				or field.hidden
				or field.read_only
				or cint(field.permlevel)
				or (single.name, field.fieldname) in skip
			):
				continue
			if values is None:
				values = frappe.get_single(single.name)
			rows.append(
				{
					"key": f"{single.name}:{field.fieldname}",
					"app": modules[single.module],
					"doctype": single.name,
					"doctype_label": _(single.name),
					"field": field.fieldname,
					"label": _(field.label or field.fieldname),
					"help": _(field.description) if field.description else "",
					"value": bool(cint(values.get(field.fieldname))),
					"can_change": writable,
				}
			)
			if len(rows) >= MAX_ADVANCED:
				return rows
	return rows


def _app_modules() -> dict:
	"""{module: app} for the installed apps whose settings Muelle shows."""
	out = {}
	for app in frappe.get_installed_apps():
		if app in SKIPPED_APPS:
			continue
		for module in frappe.get_module_list(app) or []:
			out[module] = app
	return out


def _single_check(doctype, field) -> bool:
	if not frappe.db.exists("DocType", {"name": doctype, "issingle": 1}):
		return False
	meta_field = frappe.get_meta(doctype).get_field(field)
	return bool(meta_field and meta_field.fieldtype == "Check")


# ── the page and its writes ─────────────────────────────────────────────────


def page() -> dict:
	rows = curated()
	taken = {(row["doctype"], row["field"]) for row in rows if row.get("doctype")}
	return {"areas": areas(), "curated": rows, "advanced": advanced(skip=taken)}


def set_switch(key: str, value) -> dict:
	"""Turn a curated switch (by key) or a Single's Check (``Doctype:field``) on or off."""
	value = _boolean(value)
	row = next((row for row in curated() if row["key"] == key), None)
	if row and row["kind"] == "switch" and not row.get("doctype"):
		raw = next(
			(
				item
				for item in (_load(row["provider"])() or [])
				if isinstance(item, dict) and item.get("key") == key
			),
			None,
		)
		frappe.get_attr(raw["set"])(value)
		return {"key": key, "value": bool(frappe.get_attr(raw["get"])())}
	if row and row.get("doctype"):
		doctype, field = row["doctype"], row["field"]
	else:
		doctype, _sep, field = cstr(key).partition(":")
		if not _single_check(doctype, field) or doctype not in {
			single.name
			for single in frappe.get_all(
				"DocType", filters={"issingle": 1, "module": ["in", list(_app_modules())]}, fields=["name"]
			)
		}:
			frappe.throw(_("That setting does not exist."))
	if not frappe.has_permission(doctype, "write"):
		frappe.throw(
			_("Only who may change {0} turns this on or off.").format(_(doctype)), frappe.PermissionError
		)
	doc = frappe.get_single(doctype)
	doc.set(field, 1 if value else 0)
	doc.save()
	return {"key": key, "value": bool(cint(frappe.db.get_single_value(doctype, field)))}


def _boolean(value) -> bool:
	if isinstance(value, bool):
		return value
	if value in (0, 1, "0", "1"):
		return bool(int(value))
	frappe.throw(_("Turn the setting on or off."))


# ── crm's own rows ──────────────────────────────────────────────────────────


def crm_rows() -> list[dict]:
	"""crm's provider: its settings screens and switches."""
	from crm.lead import settings as prospect_settings

	rows = []
	if prospect_settings.can_change():
		rows.append(
			{
				"key": "crm.prospectos",
				"area": "ventas",
				"kind": "screen",
				"label": _("How you register prospects"),
				"help": _("What the prospect form asks, Consultas, the first follow-up and the origins."),
				"to": "/prospectos?ajustes=1",
			}
		)
	try:
		from crm import handover
	except ImportError:
		handover = None
	if handover and handover.can_change():
		rows.append(
			{
				"key": "crm.entrega_turno",
				"area": "hoy",
				"kind": "switch",
				"label": _("Ask for the shift handover"),
				"on": _("Hoy offers «Hand over the shift» and shows it to the next person."),
				"off": _("Nobody is asked to hand over the shift."),
				"get": "crm.business_settings.handover_on",
				"set": "crm.business_settings.set_handover",
			}
		)
	return rows


def handover_on() -> bool:
	from crm import handover

	return handover.settings()["handover"]


def set_handover(value: bool) -> None:
	from crm import handover

	handover.save_settings({"handover": bool(value)})
