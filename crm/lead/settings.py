"""The Prospectos settings: how a shop registers and follows its prospects.

The shop's choices live in `FCRM Settings.prospect_settings` as JSON that holds only what
the owner changed. A missing key reads its default, so a site that never opened the sheet
behaves as designed (a new Check on a Single reads 0 until the Single is saved, which
would turn every default-on switch off).

Origins are CRM Lead Source rows: `disabled` keeps one out of the capture form, and the
prospects that already carry it keep it.
"""

import json

import frappe
from frappe import _
from frappe.utils import cstr

FIELD = "prospect_settings"
MANAGER_ROLES = frozenset({"System Manager", "Sales Manager"})

# Giros (doco giros.py codes) whose customers are mostly businesses: a refaccionaria sells
# to talleres, a dental lab to dentists. Every other giro, and an operator-created site that
# stores a platform vertical instead, starts with organizations hidden.
COMPANY_GIROS = frozenset({"refacciones", "laboratorio_dental"})

FOLLOW_UPS = ("none", "2h", "tomorrow")
BOOLEAN_KEYS = ("companies", "inquiries", "phone_required", "ask_salutation", "ask_gender")
MAX_SOURCE = 60


def defaults() -> dict:
	return {
		"companies": _giro() in COMPANY_GIROS,
		"inquiries": True,
		"phone_required": True,
		"first_follow_up": "none",
		"ask_salutation": False,
		"ask_gender": False,
	}


def get() -> dict:
	"""The shop's prospect settings: its choices over the defaults."""
	values = defaults()
	for key, value in _stored().items():
		if key in values and _valid(key, value):
			values[key] = value
	return values


def can_change(user: str | None = None) -> bool:
	user = user or frappe.session.user
	return user == "Administrator" or bool(MANAGER_ROLES.intersection(frappe.get_roles(user)))


def save(changes: dict) -> dict:
	"""Store the owner's choices (only the keys sent) and return the settings."""
	_require_manager()
	if not isinstance(changes, dict) or not changes:
		frappe.throw(_("Choose a setting to change."))
	clean = {}
	for key, value in changes.items():
		if key in BOOLEAN_KEYS:
			clean[key] = _boolean(value)
		elif key == "first_follow_up":
			if value not in FOLLOW_UPS:
				frappe.throw(_("Choose when the first follow-up is scheduled."))
			clean[key] = value
		else:
			frappe.throw(_("Unknown prospect setting: {0}").format(cstr(key)[:40]))
	stored = _stored()
	stored.update(clean)
	frappe.db.set_single_value("FCRM Settings", FIELD, json.dumps(stored, sort_keys=True))
	return get()


def sources() -> list[dict]:
	"""Every origin with whether the capture form offers it, in the worker's words."""
	rows = frappe.get_all(
		"CRM Lead Source",
		fields=["name", "disabled"] if origins_can_hide() else ["name"],
		order_by="creation asc",
		limit_page_length=0,
	)
	return [{"name": row.name, "label": _(row.name), "offered": not row.get("disabled")} for row in rows]


def add_source(name: str) -> list[dict]:
	"""Add an origin the form offers; one that exists comes back on instead."""
	_require_manager()
	name = " ".join(cstr(name).split())
	if not name:
		frappe.throw(_("Write the origin's name."))
	if len(name) > MAX_SOURCE:
		frappe.throw(_("Write an origin of at most {0} characters.").format(MAX_SOURCE))
	existing = frappe.db.get_value("CRM Lead Source", {"source_name": name}, "name")
	if existing:
		_set_disabled(existing, 0)
	else:
		doc = frappe.get_doc({"doctype": "CRM Lead Source", "source_name": name})
		# The manager check above is the gate; the role may lack Create on the master.
		doc.insert(ignore_permissions=True)
	return sources()


def set_source_offered(name: str, offered) -> list[dict]:
	_require_manager()
	if not name or not frappe.db.exists("CRM Lead Source", name):
		frappe.throw(_("That origin no longer exists."), frappe.DoesNotExistError)
	_set_disabled(name, 0 if _boolean(offered) else 1)
	return sources()


def _set_disabled(name, value):
	if origins_can_hide():
		frappe.db.set_value("CRM Lead Source", name, "disabled", value)


def origins_can_hide() -> bool:
	# A bind-mounted deploy can run this code before its migration adds the column.
	return frappe.db.has_column("CRM Lead Source", "disabled")


def _require_manager():
	if not can_change():
		frappe.throw(
			_("Only the owner or a sales manager changes how prospects are registered."),
			frappe.PermissionError,
		)


def _boolean(value) -> bool:
	if isinstance(value, bool):
		return value
	if value in (0, 1, "0", "1"):
		return bool(int(value))
	frappe.throw(_("Turn the setting on or off."))


def _valid(key, value) -> bool:
	if key == "first_follow_up":
		return value in FOLLOW_UPS
	return isinstance(value, bool)


def _stored() -> dict:
	raw = frappe.db.get_single_value("FCRM Settings", FIELD)
	try:
		value = json.loads(raw) if raw else {}
	except (TypeError, ValueError):
		return {}
	return value if isinstance(value, dict) else {}


def _giro() -> str:
	if not frappe.db.exists("DocType", "Abordo Settings"):
		return ""
	return cstr(frappe.db.get_single_value("Abordo Settings", "giro")).strip()
