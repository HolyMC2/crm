"""Move existing deals onto the shop sales pipeline (CRM program S1.3, decision D2).

``preview()`` is the dry run: counts per mapping, sample deals, the lost
reasons it would record and what it cannot map. It writes nothing.
``apply()`` moves the deals that ``preview()`` maps, in batches, without
running deal or repair hooks:

- ``pipeline`` becomes the shop sales pipeline and ``status`` the mapped stage;
- the stage history gets the move (the open interval is closed and a new one
  opened), so the previous repair-flavoured stage stays readable;
- Won/Lost keep or get a ``closed_date`` (the last change of the deal) and Lost
  gets a lost reason when it has none;
- probability follows the stage (the pipeline's Stage policy);
- ``modified`` is untouched: lists keep their order and nobody's "last updated"
  changes.

Repair Orders keep their own status (the repair state shown as a chip).
Production waits for Marco (SPEC §7, D2); the lab may apply.
"""

from collections import defaultdict
from datetime import datetime

import frappe
from frappe.utils import cint, flt, getdate, now_datetime

from crm.pipeline.services import shop_sales
from crm.pipeline.services.configuration import LEGACY_PIPELINE

# Stage names seen on tenants (Taller's two language sets per vertical, upstream
# CRM's defaults) → the D1 stage. Unknown names fall back on their outcome type.
MAPPING = {
	# leads and first contact
	"New Lead": "Nuevo",
	"Por Contactar": "Nuevo",
	"Qualification": "Nuevo",
	"Awaiting Drop-Off": "Contactado",
	"Esperando Recepción": "Contactado",
	"Scheduled Drop-Off": "Contactado",
	"Awaiting RMA Shipment": "Contactado",
	"Demo/Making": "Contactado",
	# quoted, waiting for the customer
	"Awaiting Approval": "Cotizado",
	"En Cotización": "Cotizado",
	"Estimate Sent": "Cotizado",
	"Quote Sent": "Cotizado",
	"Awaiting Authorization": "Cotizado",
	"Proposal/Quotation": "Cotizado",
	# the customer agreed; the sale closes at payment / pickup
	"Approved": "Negociación",
	"Aprobado": "Negociación",
	"Authorized": "Negociación",
	"In Repair": "Negociación",
	"Ready for Pickup": "Negociación",
	"Listo para Entregar": "Negociación",
	"Por Entregar": "Negociación",
	"Ready to Ship": "Negociación",
	"Negotiation": "Negociación",
	"Ready to Close": "Negociación",
	# warranty work is after-sales: no new sale is being decided (see report)
	"Warranty Repair": "Contactado",
	"Garantía en Curso": "Contactado",
	"Warranty RMA": "Contactado",
	# outcomes
	"Picked Up": "Ganado",
	"Completado": "Ganado",
	"Shipped": "Ganado",
	"Won": "Ganado",
	"Declined": "Perdido",
	"Cancelado": "Perdido",
	"Unclaimed": "Perdido",
	"Abandonado": "Perdido",
	"Beyond Economical Repair": "Perdido",
	"Reparación No Viable": "Perdido",
	"Total Loss": "Perdido",
	"Pérdida Total": "Perdido",
	"No Fault Found": "Perdido",
	"Sin Falla Detectada": "Perdido",
	"Lost": "Perdido",
}
TYPE_FALLBACK = {
	"Won": "Ganado",
	"Lost": "Perdido",
	"Open": "Nuevo",
	"Ongoing": "Contactado",
	"On Hold": "Contactado",
}
# A Lost deal without a reason gets the first of these that exists.
LOST_REASONS = {
	"Declined": ("Rechazó cotización", "Cliente canceló la reparación", "Customer Declined Repair"),
	"Cancelado": ("Rechazó cotización", "Cliente canceló la reparación", "Customer Declined Repair"),
	"Unclaimed": ("Equipo abandonado", "Device Unclaimed"),
	"Abandonado": ("Equipo abandonado", "Device Unclaimed"),
	"Beyond Economical Repair": ("Reparación no rentable", "Beyond Economical Repair"),
	"Reparación No Viable": ("Reparación no rentable", "Beyond Economical Repair"),
	"Total Loss": ("Reparación no rentable", "Beyond Economical Repair"),
	"Pérdida Total": ("Reparación no rentable", "Beyond Economical Repair"),
	"No Fault Found": ("Sin falla detectada", "No Fault Found"),
	"Sin Falla Detectada": ("Sin falla detectada", "No Fault Found"),
}
DEFAULT_LOST_REASON = (shop_sales.QUOTE_DECLINED_REASON, "Other")
# Names that look like lab/test fixtures; reported, never treated differently.
TEST_MARKERS = ("TWIP DEV", "TWRW DEV", "Test ", "test deal", "Prueba", "+5215555550", "+521555001")
BATCH = 500


def _stage_types():
	return {row.name: row.type for row in frappe.get_all("CRM Deal Status", fields=["name", "type"])}


def _target(status, types):
	if status in shop_sales_stage_names():
		return status, "already a sales stage"
	if status in MAPPING:
		return MAPPING[status], None
	fallback = TYPE_FALLBACK.get(types.get(status))
	return fallback, "mapped by its outcome type" if fallback else "unknown stage"


def shop_sales_stage_names():
	return [name for name, *_ in shop_sales.STAGES]


def _lost_reason(status):
	for reason in LOST_REASONS.get(status, ()) + DEFAULT_LOST_REASON:
		if frappe.db.exists("CRM Lost Reason", reason):
			return reason
	return None


def _candidates(pipelines=(LEGACY_PIPELINE,), names=None):
	deal = frappe.qb.DocType("CRM Deal")
	query = (
		frappe.qb.from_(deal)
		.select(
			deal.name,
			deal.deal_name,
			deal.status,
			deal.pipeline,
			deal.lost_reason,
			deal.closed_date,
			deal.modified,
			deal.expected_deal_value,
			deal.deal_value,
			deal.mobile_no,
		)
		.where((deal.pipeline.isin(list(pipelines))) | deal.pipeline.isnull() | (deal.pipeline == ""))
		.orderby(deal.creation)
	)
	if names is not None:
		query = query.where(deal.name.isin(list(names) or [""]))
	return query.run(as_dict=True)


def _looks_like_test(row):
	text = f"{row.deal_name or ''} {row.mobile_no or ''}"
	return any(marker.lower() in text.lower() for marker in TEST_MARKERS)


def _repair_quotes(names):
	"""Deals with no amount whose Repair Orders carry a quote (Taller sites only)."""
	if not names or not frappe.db.exists("DocType", "Repair Order"):
		return {}
	if not frappe.db.has_column("Repair Order", "quote_amount"):
		return {}
	rows = frappe.db.sql(
		"""SELECT crm_deal, SUM(COALESCE(quote_amount, 0)) AS quoted
		FROM `tabRepair Order` WHERE crm_deal IN %(names)s AND docstatus < 2
		GROUP BY crm_deal HAVING quoted > 0""",
		{"names": tuple(names)},
		as_dict=True,
	)
	return {row.crm_deal: flt(row.quoted) for row in rows}


def plan(include_repair_quotes=True, names=None):
	"""The per-deal moves ``apply`` would make (shared by preview and apply)."""
	types = _stage_types()
	stage_types = {name: kind for name, kind, *_ in shop_sales.STAGES}
	moves = []
	for row in _candidates(names=names):
		target, note = _target(row.status, types)
		move = frappe._dict(
			name=row.name,
			deal_name=row.deal_name,
			from_status=row.status,
			to_status=target,
			note=note,
			test_like=_looks_like_test(row),
			outcome=stage_types.get(target),
			lost_reason=None,
			closed_date=row.closed_date,
			expected_deal_value=None,
		)
		if target and stage_types.get(target) == "Lost" and not row.lost_reason:
			move.lost_reason = _lost_reason(row.status)
		if target and stage_types.get(target) in ("Won", "Lost") and not row.closed_date:
			move.closed_date = getdate(row.modified)
		move.blocked = not target or (move.outcome == "Lost" and not (row.lost_reason or move.lost_reason))
		move.amountless = not flt(row.expected_deal_value) and not flt(row.deal_value)
		moves.append(move)
	if include_repair_quotes:
		quotes = _repair_quotes([m.name for m in moves if m.amountless and m.outcome != "Lost"])
		for move in moves:
			if move.name in quotes:
				move.expected_deal_value = quotes[move.name]
	return moves


def preview(samples=5, include_repair_quotes=True, names=None):
	"""Dry run: what ``apply`` would do. Writes nothing."""
	moves = plan(include_repair_quotes=include_repair_quotes, names=names)
	groups = defaultdict(
		lambda: {"count": 0, "test_like": 0, "lost_reason_set": 0, "closed_date_set": 0, "samples": []}
	)
	for move in moves:
		group = groups[(move.from_status or "", move.to_status or "—")]
		group["count"] += 1
		group["test_like"] += int(move.test_like)
		group["lost_reason_set"] += int(bool(move.lost_reason))
		group["closed_date_set"] += int(bool(move.closed_date))
		if move.note:
			group["note"] = move.note
		if move.lost_reason:
			group["lost_reason"] = move.lost_reason
		if len(group["samples"]) < samples and not move.test_like:
			group["samples"].append({"name": move.name, "deal_name": move.deal_name})
	rows = [
		{"from": key[0], "to": key[1], **value}
		for key, value in sorted(groups.items(), key=lambda item: -item[1]["count"])
	]
	return {
		"site": frappe.local.site,
		"at": str(now_datetime()),
		"pipeline": shop_sales.SHOP_SALES_PIPELINE,
		"pipeline_exists": bool(frappe.db.exists("CRM Pipeline", shop_sales.SHOP_SALES_PIPELINE)),
		"deals": len(moves),
		"test_like": sum(m.test_like for m in moves),
		"to_stage": {
			stage: sum(1 for m in moves if m.to_status == stage) for stage in shop_sales_stage_names()
		},
		"blocked": [{"name": m.name, "from": m.from_status} for m in moves if m.blocked][:50],
		"blocked_count": sum(1 for m in moves if m.blocked),
		"expected_from_repair_quotes": {
			"deals": sum(1 for m in moves if m.expected_deal_value),
			"amount": sum(m.expected_deal_value or 0 for m in moves),
		},
		"mappings": rows,
		"preserves": ["deal name and links", "repair orders and their status", "modified", "stage history"],
	}


def apply(include_repair_quotes=True, limit=None, names=None, commit=True):
	"""Move the mapped deals. Lab only until Marco approves D2 for production."""
	if not frappe.db.exists("CRM Pipeline", shop_sales.SHOP_SALES_PIPELINE):
		frappe.throw("Create the shop sales pipeline first (crm.pipeline.services.shop_sales.ensure).")
	probabilities = {
		row.status: flt(row.probability)
		for row in frappe.get_all(
			"CRM Pipeline Stage",
			filters={"parent": shop_sales.SHOP_SALES_PIPELINE, "parenttype": "CRM Pipeline"},
			fields=["status", "probability"],
		)
	}
	types = _stage_types()
	planned = plan(include_repair_quotes=include_repair_quotes, names=names)
	moves = [m for m in planned if not m.blocked]
	if limit:
		moves = moves[: cint(limit)]
	now = now_datetime()
	user = frappe.session.user
	moved = 0
	for start in range(0, len(moves), BATCH):
		batch = moves[start : start + BATCH]
		_close_open_intervals(batch, types, now, user)
		for move in batch:
			values = {
				"pipeline": shop_sales.SHOP_SALES_PIPELINE,
				"status": move.to_status,
				"probability": probabilities.get(move.to_status, 0),
			}
			if move.lost_reason:
				values["lost_reason"] = move.lost_reason
			if move.closed_date:
				values["closed_date"] = move.closed_date
			if move.expected_deal_value:
				values["expected_deal_value"] = move.expected_deal_value
			frappe.db.set_value("CRM Deal", move.name, values, update_modified=False)
			moved += 1
		if commit:
			frappe.db.commit()  # nosemgrep: frappe-manual-commit -- batched lab backfill
	return {"moved": moved, "skipped_blocked": sum(1 for m in planned if m.blocked)}


def _close_open_intervals(batch, types, now, user):
	"""Record each move in the deal's stage history, as a stage change does."""
	names = [move.name for move in batch]
	# ascending idx: the newest open interval of a deal is the one kept
	open_rows = {
		row.parent: row
		for row in frappe.db.sql(
			"""SELECT name, parent, `from` AS from_status, from_date, idx FROM `tabCRM Status Change Log`
			WHERE parent IN %(names)s AND parenttype = 'CRM Deal' AND parentfield = 'status_change_log'
			AND (`to` IS NULL OR `to` = '') ORDER BY idx ASC""",
			{"names": tuple(names)},
			as_dict=True,
		)
	}
	last_idx = {
		parent: cint(idx)
		for parent, idx in frappe.db.sql(
			"""SELECT parent, MAX(idx) FROM `tabCRM Status Change Log`
			WHERE parent IN %(names)s AND parenttype = 'CRM Deal' AND parentfield = 'status_change_log'
			GROUP BY parent""",
			{"names": tuple(names)},
		)
	}
	for move in batch:
		if move.from_status == move.to_status:
			continue
		row = open_rows.get(move.name)
		to_type = types.get(move.to_status) or ""
		logged_from = None
		if row:
			# The open interval ends now, at the stage the deal actually holds
			# (a direct write may have skipped the history before).
			logged_from = row.from_status
			ends_at = move.to_status if row.from_status == move.from_status else move.from_status
			frappe.db.set_value(
				"CRM Status Change Log",
				row.name,
				{
					"to": ends_at,
					"to_type": types.get(ends_at) or "",
					"to_date": now,
					"duration": max(0, (now - _as_datetime(row.from_date or now)).total_seconds()),
					"log_owner": user,
				},
				update_modified=False,
			)
		if logged_from != move.from_status:
			_insert_log(
				move.name,
				last_idx.get(move.name, 0) + 1,
				move.from_status,
				types,
				move.to_status,
				to_type,
				now,
				user,
				closed=True,
			)
			last_idx[move.name] = last_idx.get(move.name, 0) + 1
		_insert_log(
			move.name, last_idx.get(move.name, 0) + 1, move.to_status, types, "", "", now, user, closed=False
		)
		last_idx[move.name] = last_idx.get(move.name, 0) + 1


def _as_datetime(value):
	return value if isinstance(value, datetime) else frappe.utils.get_datetime(value)


def _insert_log(parent, idx, from_status, types, to_status, to_type, now, user, *, closed):
	frappe.get_doc(
		{
			"doctype": "CRM Status Change Log",
			"parent": parent,
			"parenttype": "CRM Deal",
			"parentfield": "status_change_log",
			"idx": idx,
			"from": from_status,
			"from_type": types.get(from_status) or "",
			"to": to_status,
			"to_type": to_type,
			"from_date": now,
			"to_date": now if closed else None,
			"duration": 0 if closed else None,
			"log_owner": user,
		}
	).db_insert()
