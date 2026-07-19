# Copyright (c) 2026, Grupo Doco and contributors
# For license information, please see license.txt
#
# Doco customization — WhatsApp → Deal/Lead attribution ladder.
#
# A WhatsApp thread is physically CONTACT-scoped (one thread per phone), but the
# fcrm inbox is Deal-centric: every message needs a reference to surface in a
# conversation. Upstream resolution was "newest-modified deal, LIMIT 1" — no
# open/closed filter, no time awareness — so a reply months after a job closed
# resurrected the dead deal, and every new job piled onto whichever deal was
# touched last (god-deal accretion).
#
# New file (never conflicts on upstream rebase); crm.api.whatsapp.validate is
# the only caller.

import re

import frappe
from frappe.utils import add_days, now_datetime

# Post-Entregado grace: a customer writing shortly after delivery ("olvidé el
# cargador") is almost certainly about the job just closed. Beyond this — and
# beyond any active RO warranty — the message is treated as a NEW conversation
# (orphan / lead), never a resurrection of a months-dead deal.
POST_SALE_GRACE_DAYS = 14

# Mirrors doco_marketing.services.inbox.common._TERMINAL_STATUS_TYPES —
# duplicated because crm must not import doco_marketing (marketing installs on
# fewer tenants than crm).
_TERMINAL_STATUS_TYPES = {"Won", "Lost", "Junk"}


def resolve_reference_for_number(number: str):
	"""Attribution ladder for an UNREFERENCED WhatsApp message (webhook inbound
	or a bare outbound). Returns (docname, doctype) or (None, None) → orphan.

	1. Open deal exists for the contact → newest-modified open deal.
	2. No open deal → newest terminal deal still in its post-sale window
	   (any linked Repair Order with an active warranty, or deal touched
	   within POST_SALE_GRACE_DAYS).
	3. Nothing in window → contact's lead if any, else (None, None): the
	   message stays an orphan ("Sin asignar") for a human to place — the
	   contact-level thread merge means nothing is ever hidden by this.
	"""
	from crm.integrations.api import (
		get_contact_by_phone_number,
		get_contact_lead_or_deal_from_number,
	)

	contact = get_contact_by_phone_number(number)
	contact_name = contact.get("name")
	if not contact_name:
		# MX trap: WhatsApp sends `from` as 521XXXXXXXXXX while contacts store
		# +52 XX… — the upstream substring LIKE misses in both directions, so
		# real customers with open deals resolved as orphans. Fall back to the
		# trailing-10-digit key (same convention as the orphan grouping in
		# doco_marketing).
		contact_name = _contact_by_trailing_digits(number)
	if not contact_name:
		# No Contact — upstream fallback covers the CRM Lead path.
		return get_contact_lead_or_deal_from_number(number)

	deals = frappe.db.sql(
		"""SELECT cd.name, cd.modified, st.type AS status_type
		   FROM `tabCRM Deal` cd
		   JOIN `tabCRM Contacts` cc
		     ON cc.parent = cd.name AND cc.parenttype = 'CRM Deal'
		   LEFT JOIN `tabCRM Deal Status` st ON st.name = cd.status
		   WHERE cc.contact = %s AND cc.is_primary = 1
		   ORDER BY cd.modified DESC""",
		(contact_name,),
		as_dict=True,
	)

	# Rung 1 — active job always wins. Unknown/missing status type fails OPEN
	# (treated as active) so a misconfigured status never orphans a live job.
	for d in deals:
		if d.status_type not in _TERMINAL_STATUS_TYPES:
			return d.name, "CRM Deal"

	# Rung 2 — post-sale window on the newest-first terminal deals.
	grace_floor = add_days(now_datetime(), -POST_SALE_GRACE_DAYS)
	for d in deals:
		if _deal_has_active_warranty(d.name) or d.modified >= grace_floor:
			return d.name, "CRM Deal"

	# Rung 3 — out of window: a lead still beats an orphan; a dead deal doesn't.
	if contact.get("lead"):
		return contact["lead"], "CRM Lead"
	return None, None


def _contact_by_trailing_digits(number: str) -> str | None:
	"""Contact whose phone shares the trailing 10 digits with `number` —
	prefix-agnostic (+52 / 52 1 / bare local all collapse to the same key).
	Searches the phone_nos child table so secondary numbers resolve too."""
	digits = re.sub(r"\D", "", number or "")[-10:]
	if len(digits) < 10:
		return None
	rows = frappe.db.sql(
		"""SELECT cp.parent FROM `tabContact Phone` cp
		   JOIN `tabContact` c ON c.name = cp.parent
		   WHERE cp.parenttype = 'Contact'
		     AND RIGHT(REGEXP_REPLACE(cp.phone, '[^0-9]', ''), 10) = %s
		   ORDER BY c.modified DESC LIMIT 1""",
		(digits,),
	)
	return rows[0][0] if rows else None


def _deal_has_active_warranty(deal_name: str) -> bool:
	"""Any Repair Order linked to the deal with warranty still running. Business
	clock for rung 2 — a warranty claim is the likely topic, and it feeds the
	existing "Reabrir orden" flow. Guarded: taller isn't installed everywhere."""
	if "taller" not in frappe.get_installed_apps():
		return False
	try:
		return bool(
			frappe.db.sql(
				"""SELECT 1 FROM `tabCRM Deal Repair Order` dro
				   JOIN `tabRepair Order` ro ON ro.name = dro.repair_order
				   WHERE dro.parent = %s AND dro.parenttype = 'CRM Deal'
				     AND ro.warranty_expires_on >= CURDATE()
				   LIMIT 1""",
				(deal_name,),
			)
		)
	except Exception:
		return False
