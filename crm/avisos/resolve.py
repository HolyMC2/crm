"""Where an aviso gets resolved: one map from its source to the place that settles it.

Order of resolution for a group:
1. A producer whose notices name a tool (a stable subject tag or prefix, see
   ``kinds.notice``): the Contador page, the Ventas list or the Desk view that
   settles it. Aggregates («Higiene CRM: 39 tratos») land on a list, not on the
   first record they happen to mention.
2. The record the notice names: its Muelle shell module page, else the sibling
   app that owns it (Taller, Escáner), else its native Desk form.
3. The producer's own link.
Every target is re-authorized for the caller now. One the caller cannot open
becomes a reason and «Marcar leído», never a dead link.
"""

from urllib.parse import quote, urlencode

import frappe
from frappe import _
from frappe.utils import add_days, getdate

from crm.avisos import kinds

# Shell modules hosted in this SPA (router base /crm): doctype → (module, path).
SHELL_RECORDS = {
	"Customer": ("contactos", "/contactos/customer/{}"),
	"Supplier": ("contactos", "/contactos/supplier/{}"),
	"Contact": ("contactos", "/contactos/contact/{}"),
	"CRM Organization": ("contactos", "/contactos/organization/{}"),
	"CRM Lead": ("ventas", "/leads/{}"),
	"CRM Deal": ("ventas", "/deals/{}"),
	"CRM Inquiry": ("ventas", "/inquiries?name={}"),
	"Web Form": ("ventas", "/forms/{}?tab=submissions"),
	"ToDo": ("pendientes", "/pendientes/todo/{}"),
	"CRM Task": ("pendientes", "/pendientes/crm-task/{}"),
	"Purchase Order": ("compras", "/compras/orden/{}"),
	"Material Request": ("compras", "/compras/solicitud/{}"),
	"Purchase Invoice": ("gastos", "/gastos/factura/{}"),
	"Warranty Claim": ("garantias", "/garantias/{}"),
	"Item": ("productos", "/productos/{}"),
}
# Records whose worker screen is a sibling SPA on the same site: doctype → (app, path).
SIBLING_RECORDS = {
	"Repair Order": ("taller", "/taller/orders/{}"),
	"Scan Task": ("scanner_kit", "/scan/tasks/{}"),
}
# Records settled from a tool rather than their own page.
TOOL_RECORDS = {"Linea de Captura": "contador_declaracion"}

MODULE_LABELS = {
	"pendientes": "Pendientes",
	"agenda": "Agenda",
	"contactos": "Contactos",
	"ventas": "Ventas",
	"cobranza": "Cobranza",
	"compras": "Compras",
	"gastos": "Gastos",
	"productos": "Productos",
	"garantias": "Garantías",
}
APP_LABELS = {"taller": "Taller", "scanner_kit": "Escáner", "erpnext_mexico_compliance": "Contador"}
FISCAL_APP = "erpnext_mexico_compliance"

# Tool targets: key → (kind, path, gate). kind «route» is under /crm, «href» a sibling
# SPA, «desk» a Desk view. The gate is checked by Access.tool.
TOOLS = {
	"contador_global": ("href", "/contador/global", "fiscal"),
	"contador_pendientes": ("href", "/contador/pendientes", "fiscal"),
	"contador_obligaciones": ("href", "/contador/obligaciones", "fiscal"),
	"contador_cartera": ("href", "/contador/cartera", "fiscal"),
	"contador_declaracion": ("href", "/contador/declaracion", "fiscal"),
	"contador_credenciales": ("href", "/contador/credenciales", "fiscal"),
	"contador_regimen": ("href", "/contador/regimen", "fiscal"),
	"contador_cierre": ("href", "/contador/cierre", "fiscal"),
	"contador_plataforma": ("href", "/contador/plataforma", "fiscal"),
	"contador_cfdis": ("href", "/contador/cfdis", "fiscal"),
	"ventas_hygiene": ("route", "/reports?tab=marketing", "marketing"),
	"ventas_drift": ("route", "/deals", "sales"),
	"agenda_shifts": ("route", "/agenda", "agenda"),
	"desk_error_log": ("desk", "/app/error-log", "Error Log"),
	"desk_failed_jobs": ("desk", "/app/scheduled-job-log?status=Failed", "Scheduled Job Log"),
	"desk_job_log": ("desk", "/app/scheduled-job-log", "Scheduled Job Log"),
	"desk_dark_jobs": ("desk", "/app/scheduled-job-type?create_log=0", "Scheduled Job Type"),
	"desk_impersonation": ("desk", "/app/activity-log?operation=Impersonate", "Activity Log"),
}


def _tool_action(key):
	return {
		"contador_global": _("Issue the global invoice"),
		"contador_pendientes": _("Review fiscal pending items"),
		"contador_obligaciones": _("Review the fiscal calendar"),
		"contador_cartera": _("Review compliance"),
		"contador_declaracion": _("Open the tax return"),
		"contador_credenciales": _("Review credentials"),
		"contador_regimen": _("Review the tax regime"),
		"contador_cierre": _("Review the month close"),
		"contador_plataforma": _("Review platform sales"),
		"contador_cfdis": _("Review invoices against SAT"),
		"ventas_hygiene": _("Review deals with pending items"),
		"ventas_drift": _("Review the affected deals"),
		"agenda_shifts": _("See the shifts"),
	}.get(key) or _("Open in {0}").format(_("Desk"))


class Access:
	"""What the caller may open, memoized for one stream call."""

	def __init__(self, sales=None):
		self._memo = {}
		if sales is not None:
			self._memo["module:ventas"] = bool(sales)

	def _once(self, key, compute):
		if key not in self._memo:
			try:
				self._memo[key] = bool(compute())
			except Exception:
				frappe.clear_last_message()
				self._memo[key] = False
		return self._memo[key]

	def app(self, app):
		return self._once("app:" + app, lambda: app in frappe.get_installed_apps())

	def module(self, key):
		def enabled():
			if key == "ventas":
				from crm.api import check_app_permission

				return check_app_permission()
			from crm.api import shell

			provider = shell._hosted().get(key)
			return provider and provider().get("enabled")

		return self._once("module:" + key, enabled)

	def fiscal(self):
		def allowed():
			if not self.app(FISCAL_APP):
				return False
			from erpnext_mexico_compliance.utils.permissions import has_fiscal_role

			return has_fiscal_role()

		return self._once("fiscal", allowed)

	def gate(self, gate):
		if gate == "fiscal":
			return self.fiscal()
		if gate == "sales":
			return self.module("ventas")
		if gate == "marketing":
			return self.module("ventas") and self.app("doco_marketing")
		if gate == "agenda":
			return self.module("agenda")
		# A Desk view: read on its doctype.
		return self._once("read:" + gate, lambda: frappe.has_permission(gate, "read"))


def _target(route=None, href=None, desk=None, reason=None, label=None, where=None, action=None):
	return {
		"route": route,
		"href": href,
		"desk": desk,
		"reason": reason,
		"label": label,
		"where": where,
		"action": action,
	}


def desk_url(doctype, name):
	return f"/app/{frappe.scrub(doctype).replace('_', '-')}/{quote(str(name), safe='')}"


def _refused(where):
	return _(
		"This aviso is settled in {0}, which your role cannot open. Let your manager know, then mark it as read."
	).format(where)


def tool_target(key, group, access, label=None):
	kind, path, gate = TOOLS[key]
	if kind == "href":
		where = APP_LABELS[FISCAL_APP]
	elif kind == "desk":
		where = _("Desk")
	else:
		where = MODULE_LABELS.get(gate, MODULE_LABELS["ventas"])
	if not access.gate(gate):
		return _target(reason=_refused(where), label=label, where=where)
	if key == "ventas_drift":
		names = kinds.deal_names(group.get("raw_title") or group.get("title"))
		if group.get("doctype") == "CRM Deal" and group.get("docname") not in names:
			names.insert(0, group["docname"])
		if names:
			path += "?" + urlencode([("report", "avisos")] + [("deal", name) for name in names[:50]])
	if key == "agenda_shifts":
		day = add_days(getdate(group.get("latest")), 1)
		path += "?" + urlencode({"view": "day", "date": str(day), "cal": "Event,Turno"})
	action = _tool_action(key)
	if kind == "route":
		return _target(route=path, label=label, where=where, action=action)
	if kind == "href":
		return _target(href=path, label=label, where=where, action=action)
	return _target(desk=path, label=label, where=where, action=action)


def _readable(doctype, name):
	try:
		return bool(
			name and frappe.db.exists(doctype, name) and frappe.has_permission(doctype, "read", doc=name)
		)
	except Exception:
		frappe.clear_last_message()
		return False


def record_label(doctype, name):
	"""The record's title only when its field is readable and unmasked for the caller."""
	from crm.permissions.whatsapp_read import readable_field

	try:
		meta = frappe.get_meta(doctype)
		field = meta.get_title_field()
		if (not field or field == "name") and meta.has_field("title"):
			field = "title"
		if field and field != "name" and readable_field(doctype, field):
			return frappe.db.get_value(doctype, name, field) or name
	except Exception:
		frappe.clear_last_message()
	return name


def _open_in(where):
	return _("Open in {0}").format(where)


def _task_source(name):
	"""The Repair Order an automated CRM Task follows, when the task says so."""
	try:
		row = frappe.db.get_value(
			"CRM Task", name, ["automation_source_doctype", "automation_source_name"], as_dict=True
		)
	except Exception:
		frappe.clear_last_message()
		return None
	if row and row.automation_source_doctype in SIBLING_RECORDS and row.automation_source_name:
		return row.automation_source_doctype, row.automation_source_name
	return None


def _sibling(doctype, name, access, label):
	app, pattern = SIBLING_RECORDS[doctype]
	if not access.app(app) or not _readable(doctype, name):
		return None
	where = APP_LABELS[app]
	return _target(
		href=pattern.format(quote(str(name), safe="")),
		desk=desk_url(doctype, name),
		label=label,
		where=where,
		action=_open_in(where),
	)


def record_target(group, access):
	doctype, name = group["doctype"], group["docname"]
	try:
		exists = frappe.db.exists(doctype, name)
	except Exception:
		frappe.clear_last_message()
		exists = False
	if not exists:
		return _target(reason=_("{0} {1} no longer exists. Mark the aviso as read.").format(_(doctype), name))
	if not _readable(doctype, name):
		return _target(
			reason=_("You no longer have access to {0} {1}. Ask your manager if you still need it.").format(
				_(doctype), name
			)
		)
	label = record_label(doctype, name)
	desk = desk_url(doctype, name)
	if doctype in TOOL_RECORDS:
		target = tool_target(TOOL_RECORDS[doctype], group, access, label)
		if target["href"]:
			target["desk"] = desk
			return target
	if doctype == "CRM Task":
		# A follow-up the workshop raised is done on its order (Avisar equipo listo…).
		source = _task_source(name)
		if source:
			target = _sibling(*source, access, label)
			if target:
				return target
	if doctype in SIBLING_RECORDS:
		target = _sibling(doctype, name, access, label)
		if target:
			return target
	shell = SHELL_RECORDS.get(doctype)
	if doctype == "CRM Lead" and not access.module("ventas"):
		shell = ("contactos", "/contactos/crm-lead/{}")
	if doctype == "Event":
		shell = ("agenda", None)
	if shell and access.module(shell[0]):
		module, pattern = shell
		if doctype == "Event":
			start = frappe.db.get_value("Event", name, "starts_on")
			query = {"view": "day", "date": str(getdate(start)), "event": f"Event:{name}"}
			route = "/agenda?" + urlencode(query)
		else:
			route = pattern.format(quote(str(name), safe="")) + (group.get("hash") or "")
		where = MODULE_LABELS[module]
		return _target(route=route, desk=desk, label=label, where=where, action=_open_in(where))
	link = group.get("link")
	if link and link.startswith("/app/"):
		# The producer chose a Desk view for this record (Asistencia, a report…).
		desk = link
	return _target(desk=desk, label=label, where=_("Desk"), action=_open_in(_("Desk")))


def _link_target(link, group, access):
	if link.startswith("/app/asistencia") and "v=turnos" in link:
		target = tool_target("agenda_shifts", group, access)
		if target["route"]:
			return target
	if link.startswith("/crm/"):
		return _target(route=link[4:], action=_("Open"))
	where = _("Desk") if link.startswith("/app/") else "Muelle"
	return _target(desk=link, where=where, action=_open_in(where))


def target(group, access=None):
	"""Where «Abrir» goes for one group, re-authorized now; a reason instead of a dead link."""
	access = access or Access()
	key = kinds.notice(group.get("raw_title") or group.get("title"), group.get("body"))
	if key:
		return tool_target(key, group, access)
	if group.get("doctype") and group.get("docname"):
		return record_target(group, access)
	link = group.get("link")
	if link:
		return _link_target(link, group, access)
	return _target(
		reason=_("This aviso has no linked record. Mark it as read when you have handled it."),
	)
