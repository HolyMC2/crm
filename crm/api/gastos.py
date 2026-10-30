"""Gastos entry gate. Supplier-bill capability never grants sales access."""

import frappe
from frappe import _
from frappe.utils import cint


def _bootstrap():
	try:
		# Doco owns supplier bills and payments; an older doco has no Gastos.
		from doco.workspaces.payables import bootstrap
	except ImportError:
		return None
	return bootstrap


def check_gastos_permission() -> bool:
	if frappe.session.user == "Guest" or "doco" not in frappe.get_installed_apps():
		return False
	bootstrap = _bootstrap()
	return bool(bootstrap and bootstrap().get("enabled"))


def can_create_bill() -> bool:
	"""Whether this user may start a supplier bill; the engine form re-checks on save."""
	return bool(frappe.has_permission("Purchase Invoice", "create"))


@frappe.whitelist()
def get_capabilities() -> dict:
	"""Gastos capability for the shell; the doco service re-checks every request."""
	bootstrap = _bootstrap() if "doco" in frappe.get_installed_apps() else None
	if bootstrap is None:
		return {"enabled": False, "reason": _("Gastos is not installed. Ask your manager to check the app.")}
	answer = bootstrap() or {}
	if answer.get("enabled"):
		# «Nueva factura» on Por registrar: only for bill readers who may create one.
		capabilities = answer.setdefault("capabilities", {})
		capabilities["create"] = bool(capabilities.get("read") and can_create_bill())
	return answer


# ── Escáner's side of a supplier bill ───────────────────────────────────────

_SCANNER = "scanner_kit"
_OPEN_TASKS = ("Open", "In Progress")


def _scanner_roles():
	"""Escáner's role floors (who opens it, who starts a receiving), or None without it."""
	if _SCANNER not in frappe.get_installed_apps():
		return None
	try:
		from scanner_kit.guards import is_scanner_manager, is_scanner_user
	except ImportError:
		return None
	return is_scanner_user(), is_scanner_manager()


def _readable(doctype, name):
	return bool(frappe.has_permission(doctype, "read", doc=name))


@frappe.whitelist()
def bill_warehouse(name: str) -> dict:
	"""What happens to a supplier bill's goods in the warehouse: Escáner's receiving
	(verify and put away), the receipts that brought them in, Escáner's open tasks
	on it, and whether its products can get labels. Read only; Escáner re-checks
	every step it starts."""
	doc = frappe.get_doc("Purchase Invoice", name)
	doc.check_permission("read")
	codes = sorted({row.item_code for row in doc.items if row.item_code})
	stock = (
		set(frappe.get_all("Item", filters={"name": ["in", codes], "is_stock_item": 1}, pluck="name"))
		if codes
		else set()
	)
	receipts = [
		{"name": receipt, "docstatus": frappe.db.get_value("Purchase Receipt", receipt, "docstatus")}
		for receipt in sorted({row.purchase_receipt for row in doc.items if row.get("purchase_receipt")})
		if _readable("Purchase Receipt", receipt)
	]
	roles = _scanner_roles()
	out = {
		"stock": bool(stock),
		"update_stock": bool(doc.update_stock),
		"scanner": roles is not None,
		"can_open": bool(roles and roles[0]),
		"receipts": receipts,
		"warehouses": [],
		"receive": None,
		"inbounds": [],
		"tasks": [],
	}
	if roles is None or not stock:
		return out

	sources = [("Purchase Invoice", doc.name)] + [("Purchase Receipt", r["name"]) for r in receipts]
	out["inbounds"] = [
		{
			"name": row.name,
			"status": row.status,
			"warehouse": row.warehouse,
			"verified": bool(row.verification_closed),
			"assigned_to": _user_name(row.assigned_to),
		}
		for source_doctype, source_name in sources
		for row in frappe.get_all(
			"Scan Inbound",
			filters={"source_doctype": source_doctype, "source_name": source_name},
			fields=["name", "status", "warehouse", "verification_closed", "assigned_to"],
			order_by="creation asc",
		)
	]
	out["tasks"] = [
		{
			"name": row.name,
			"task_type": row.task_type,
			"status": row.status,
			"due_date": str(row.due_date) if row.due_date else None,
			"assigned_to": _user_name(row.assigned_to),
		}
		for source_doctype, source_name in sources
		for row in frappe.get_all(
			"Scan Task",
			filters={
				"source_ref_doctype": source_doctype,
				"source_ref_name": source_name,
				"status": ["in", _OPEN_TASKS],
			},
			fields=["name", "task_type", "status", "due_date", "assigned_to"],
			order_by="due_date asc, creation asc",
			limit=20,
		)
	]
	if doc.update_stock:
		out["warehouses"] = sorted(
			{row.warehouse for row in doc.items if row.warehouse and row.item_code in stock}
		)
		out["receive"] = _receive_step(doc, roles[1], out["inbounds"])
	return out


def _user_name(user):
	if not user:
		return ""
	return frappe.get_cached_value("User", user, "full_name") or user


def _receive_step(doc, manager, inbounds):
	"""«Verificar y acomodar» on a bill that brought its goods in itself (update_stock).
	`code` says what stands in the way, so the page offers the right next step."""

	def refused(code, reason):
		return {"allowed": False, "code": code, "reason": reason}

	if inbounds:
		return {"allowed": True, "code": None, "reason": None}
	if cint(doc.is_return):
		return refused("return", _("A return sends goods back; there is nothing to receive."))
	if doc.docstatus == 0:
		return refused(
			"draft", _("Register the bill first; then its goods can be verified and put away in Escáner.")
		)
	if doc.docstatus == 2:
		return refused("cancelled", _("This bill is cancelled."))
	if not manager:
		return refused(
			"manager",
			_("Starting a receiving in Escáner takes a stock or scanner manager. Ask one to start it."),
		)
	return {"allowed": True, "code": None, "reason": None}
