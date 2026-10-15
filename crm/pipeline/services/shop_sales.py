"""The shop sales pipeline (CRM program decision D1, proposal).

Nuevo → Contactado → Cotizado → Negociación → Ganado / Perdido. These are the
commercial stages of a deal. Repair progress (received, approved, ready,
picked up) stays on the Repair Order and is shown beside the stage, never as
the stage.

Nothing here runs on install or migrate: a tenant adopts the pipeline through
``ensure()`` (a manager action, or ``bench execute`` on the lab) because the
default pipeline of production tenants waits for Marco's decision D1.
"""

import frappe
from frappe import _

from crm.pipeline.services.configuration import LEGACY_PIPELINE

SHOP_SALES_PIPELINE = "shop-sales"
SHOP_SALES_PIPELINE_NAME = "Ventas"
QUOTE_DECLINED_REASON = "Rechazó cotización"

# (status, type, probability, color); position follows this order.
STAGES = (
	("Nuevo", "Open", 10, "blue"),
	("Contactado", "Ongoing", 25, "cyan"),
	("Cotizado", "Ongoing", 50, "orange"),
	("Negociación", "Ongoing", 75, "purple"),
	("Ganado", "Won", 100, "green"),
	("Perdido", "Lost", 0, "red"),
)
OPENING_STAGE = STAGES[0][0]
WON_STAGE = "Ganado"
LOST_STAGE = "Perdido"


def _ensure_statuses():
	has_hidden = frappe.db.has_column("CRM Deal Status", "hidden")
	for position, (name, kind, probability, color) in enumerate(STAGES, start=1):
		if frappe.db.exists("CRM Deal Status", name):
			current = frappe.db.get_value(
				"CRM Deal Status", name, ["type", "hidden"] if has_hidden else ["type"], as_dict=True
			)
			if current.type != kind:
				frappe.throw(
					_(
						"Stage {0} already exists with outcome {1}; rename it before adopting the sales pipeline."
					).format(name, current.type)
				)
			if has_hidden and current.hidden:
				frappe.db.set_value("CRM Deal Status", name, "hidden", 0)
			continue
		frappe.get_doc(
			{
				"doctype": "CRM Deal Status",
				"deal_status": name,
				"type": kind,
				"probability": probability,
				"position": position,
				"color": color,
			}
		).insert(ignore_permissions=True)


def _ensure_lost_reason():
	if frappe.db.exists("DocType", "CRM Lost Reason") and not frappe.db.exists(
		"CRM Lost Reason", QUOTE_DECLINED_REASON
	):
		frappe.get_doc({"doctype": "CRM Lost Reason", "lost_reason": QUOTE_DECLINED_REASON}).insert(
			ignore_permissions=True
		)


def ensure(make_default: bool = False) -> dict:
	"""Create (or complete) the shop sales pipeline; idempotent.

	With ``make_default`` new deals land in it: the previous default without a
	company stops being the default (it keeps its deals and stages).
	"""
	_ensure_statuses()
	_ensure_lost_reason()
	created = False
	if frappe.db.exists("CRM Pipeline", SHOP_SALES_PIPELINE):
		pipeline = frappe.get_doc("CRM Pipeline", SHOP_SALES_PIPELINE)
		present = {row.status for row in pipeline.stages}
		for name, _kind, probability, _color in STAGES:
			if name not in present:
				pipeline.append("stages", {"status": name, "probability": probability})
	else:
		created = True
		pipeline = frappe.get_doc(
			{
				"doctype": "CRM Pipeline",
				"pipeline_name": SHOP_SALES_PIPELINE_NAME,
				"probability_policy": "Stage",
				"currency": frappe.db.get_single_value("FCRM Settings", "currency") or None,
				"stages": [
					{
						"status": name,
						"probability": probability,
						# Losing a sale needs its reason (the deal controller enforces it too).
						"required_fields": "lost_reason" if name == LOST_STAGE else None,
					}
					for name, _kind, probability, _color in STAGES
				],
			}
		)
	if make_default and not pipeline.is_default:
		for other in frappe.get_all(
			"CRM Pipeline",
			filters={"is_default": 1, "name": ["!=", SHOP_SALES_PIPELINE]},
			fields=["name", "sales_company"],
		):
			if not other.sales_company:
				frappe.db.set_value("CRM Pipeline", other.name, "is_default", 0)
		pipeline.is_default = 1
	if created:
		pipeline.insert(ignore_permissions=True, set_name=SHOP_SALES_PIPELINE)
	else:
		pipeline.save(ignore_permissions=True)
	return {
		"pipeline": pipeline.name,
		"created": created,
		"is_default": bool(pipeline.is_default),
		"stages": [row.status for row in pipeline.stages],
	}


def is_sales_pipeline(pipeline: str | None) -> bool:
	"""A pipeline whose stages are commercial only (not the compatibility one)."""
	return bool(pipeline) and pipeline != LEGACY_PIPELINE


def outcome_stage(pipeline: str | None, outcome: str) -> str | None:
	"""The pipeline's first live stage with this outcome (Won/Lost), or None."""
	if not pipeline or outcome not in ("Won", "Lost"):
		return None
	stage = frappe.qb.DocType("CRM Pipeline Stage")
	rows = (
		frappe.qb.from_(stage)
		.select(stage.status)
		.where(stage.parent == pipeline)
		.where(stage.parenttype == "CRM Pipeline")
		.where(stage.outcome == outcome)
		.where(stage.archived == 0)
		.orderby(stage.idx)
		.limit(1)
		.run(pluck=True)
	)
	return rows[0] if rows else None
