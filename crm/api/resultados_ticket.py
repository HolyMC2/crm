"""The ticket page in Resultados: what crm and the other apps add to one sale.

`crm.api.resultados.document` asks the selling app (Mercado) for the ticket,
then this module adds what the owner wants next to it:

- `customer`: who bought, read from their own sales (tickets, total spent,
  first and previous visit, what they still owe), only when the reader may
  read the customer and it is a real customer, never the walk-in one;
- `cfdi`: whether the sale carries a CFDI and, where the shop lets customers
  invoice themselves, the link that opens it prefilled;
- `register`: whether the register (POS) is here and until when the sale can
  be returned there;
- `blocks`: what other apps say about the sale through the
  `muelle_resultados_ticket` hook (Taller: the repair it charged). Each dotted
  path is one block (the function name is its key) and returns a dict or None;
  a failing block is logged and left out, never takes the ticket down.

The ticket's own read permission was checked by the selling app before this
runs; every extra read here checks its own.
"""

import re

import frappe
from frappe.utils import cint, flt, getdate

WALK_IN = re.compile(r"^p[uú]blico en general$", re.IGNORECASE)
FISCAL_APP = "erpnext_mexico_compliance"
POS_APP = "posawesome"
HEAD_FIELDS = (
	"customer",
	"customer_name",
	"pos_profile",
	"docstatus",
	"is_return",
	"grand_total",
	"posting_date",
	"mx_uuid",
	"posa_return_valid_upto",
)


def compose(doctype: str, name: str, out: dict) -> dict:
	"""Add the customer, CFDI, register and app blocks to a ticket (Sales
	Invoice only; a cash closing stays as the selling app sent it)."""
	if doctype != "Sales Invoice":
		return out
	meta = frappe.get_meta(doctype)
	head = frappe.db.get_value(
		doctype, name, [f for f in HEAD_FIELDS if f in meta.get_valid_columns()], as_dict=True
	)
	if not head:
		return out
	out["customer"] = customer_summary(head, name)
	out["cfdi"] = cfdi_state(meta, head, name)
	out["register"] = register_state(head)
	out["blocks"] = blocks(doctype, name, cost_visible="margin" in out)
	return out


def is_walk_in(head: dict) -> bool:
	"""The register's default customer, or a «Público en general» by name."""
	customer = head.get("customer")
	if not customer:
		return True
	if WALK_IN.match((head.get("customer_name") or customer).strip()):
		return True
	profile = head.get("pos_profile")
	return bool(profile and frappe.db.get_value("POS Profile", profile, "customer") == customer)


def customer_summary(head: dict, name: str) -> dict | None:
	customer = head.get("customer")
	if is_walk_in(head) or not frappe.has_permission("Customer", "read", customer):
		return None
	base = {"customer": customer, "docstatus": 1}
	sales = frappe.get_list(
		"Sales Invoice",
		filters={**base, "is_return": 0},
		fields=[
			{"COUNT": "name", "as": "tickets"},
			{"SUM": "base_grand_total", "as": "spent"},
			{"MIN": "posting_date", "as": "first"},
		],
	)
	stats = sales[0] if sales else {}
	before = frappe.get_list(
		"Sales Invoice",
		filters={
			**base,
			"is_return": 0,
			"name": ["!=", name],
			"posting_date": ["<", head.get("posting_date")],
		},
		fields=["posting_date"],
		order_by="posting_date desc, posting_time desc",
		limit_page_length=1,
	)
	owed = frappe.get_list(
		"Sales Invoice",
		filters={**base, "outstanding_amount": [">", 0]},
		fields=[{"SUM": "outstanding_amount", "as": "owed"}],
	)
	return {
		"customer": customer,
		"name": head.get("customer_name") or customer,
		"tickets": cint(stats.get("tickets")),
		"spent": flt(stats.get("spent"), 2),
		"since": str(stats["first"]) if stats.get("first") else None,
		"previous": str(before[0].posting_date) if before else None,
		"owed": flt(owed[0].get("owed") if owed else 0, 2),
	}


def cfdi_state(meta, head: dict, name: str) -> dict | None:
	"""None where the site keeps no CFDI on its sales (no Contador app)."""
	if not meta.has_field("mx_uuid"):
		return None
	stamped = bool(head.get("mx_uuid"))
	out = {"stamped": stamped, "self_billing_url": None}
	if (
		not stamped
		and cint(head.get("docstatus")) == 1
		and not cint(head.get("is_return"))
		and FISCAL_APP in frappe.get_installed_apps()
		and _self_billing_open()
	):
		from erpnext_mexico_compliance.utils.print_helpers import facturacion_url

		out["self_billing_url"] = facturacion_url(
			frappe._dict(name=name, grand_total=head.get("grand_total"))
		)
	return out


def _self_billing_open() -> bool:
	try:
		return bool(frappe.db.get_single_value("CFDI Stamping Settings", "public_facturation_enabled"))
	except Exception:
		return False


def register_state(head: dict) -> dict:
	until = head.get("posa_return_valid_upto")
	return {
		"pos": POS_APP in frappe.get_installed_apps(),
		"return_until": str(getdate(until)) if until else None,
	}


def blocks(doctype: str, name: str, cost_visible: bool) -> dict:
	ctx = {"doctype": doctype, "name": name, "user": frappe.session.user, "cost_visible": cost_visible}
	out = {}
	for path in frappe.get_hooks("muelle_resultados_ticket") or []:
		key = path.rsplit(".", 1)[-1]
		try:
			block = frappe.get_attr(path)(ctx)
		except Exception:
			frappe.log_error(title=f"Resultados ticket block {key}")
			continue
		if block:
			out[key] = block
	return out
