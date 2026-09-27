# Copyright (c) 2026, Grupo Doco and contributors
# For license information, please see license.txt

"""Attribution ladder (crm.api.whatsapp_routing): open deal wins; terminal
deals only inside their post-sale window (RO warranty or grace); beyond that
the message stays an orphan instead of resurrecting a dead deal."""

import unittest

import frappe
from frappe.utils import add_days, now_datetime

from crm.api.whatsapp_routing import (
	POST_SALE_GRACE_DAYS,
	resolve_inbound_reference,
	resolve_reference_for_number,
)

_PHONE = "+5215559990042"


def _status(status_type: str) -> str:
	# Hidden stages refuse new entry; fixtures use a visible one.
	name = frappe.db.get_value("CRM Deal Status", {"type": status_type, "hidden": 0}, "name")
	assert name, f"site has no CRM Deal Status of type {status_type}"
	return name


# Plain unittest.TestCase on purpose: FrappeTestCase's lazy test-record loader
# pulls ERPNext fixtures (_Test Product Bundle Item) that don't build on the
# doco sites. Taller's suites use the same pattern.
class TestWhatsAppRouting(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Routing Ladder Test",
				"phone_nos": [{"phone": _PHONE, "is_primary_mobile_no": 1}],
			}
		)
		self.contact.flags.ignore_permissions = True
		self.contact.insert()

	def tearDown(self):
		frappe.db.rollback()

	def _deal(self, status_type="Open", modified=None):
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": _status(status_type),
				"contacts": [{"contact": self.contact.name, "is_primary": 1}],
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		if modified:
			# Backdate below the ORM (set_value would re-stamp modified).
			frappe.db.sql(
				"UPDATE `tabCRM Deal` SET modified=%s WHERE name=%s",
				(modified, deal.name),
			)
		return deal.name

	def test_open_deal_wins_over_newer_terminal(self):
		won = self._deal("Won")
		open_deal = self._deal("Open", modified=add_days(now_datetime(), -3))
		self.assertLess(
			frappe.db.get_value("CRM Deal", open_deal, "modified"),
			frappe.db.get_value("CRM Deal", won, "modified"),
		)
		self.assertEqual(resolve_reference_for_number(_PHONE), (open_deal, "CRM Deal"))

	def test_multiple_open_parents_remain_unresolved(self):
		self._deal("Open", modified=add_days(now_datetime(), -10))
		self._deal("Open")
		self.assertEqual(resolve_reference_for_number(_PHONE), (None, None))

	def test_recent_terminal_within_grace(self):
		won = self._deal("Won", modified=add_days(now_datetime(), -(POST_SALE_GRACE_DAYS - 2)))
		self.assertEqual(resolve_reference_for_number(_PHONE), (won, "CRM Deal"))

	def test_old_terminal_is_orphan(self):
		self._deal("Won", modified=add_days(now_datetime(), -(POST_SALE_GRACE_DAYS + 30)))
		self.assertEqual(resolve_reference_for_number(_PHONE), (None, None))

	def test_old_terminal_with_active_warranty_wins(self):
		if "taller" not in frappe.get_installed_apps():
			self.skipTest("taller not installed")
		won = self._deal("Won", modified=add_days(now_datetime(), -(POST_SALE_GRACE_DAYS + 30)))
		ro = frappe.get_doc(
			{
				"doctype": "Repair Order",
				"status": "Recibido",
				"client": self.contact.name,
				"falla_reportada": "routing warranty test",
			}
		)
		ro.flags.ignore_permissions = True
		ro.flags.ignore_mandatory = True
		# Suppress side-effect hooks (deal auto-spawn would fabricate a SECOND
		# open deal and break the ladder assertion).
		ro.flags.via_deal_creation = True
		ro.insert()
		frappe.db.set_value(
			"Repair Order",
			ro.name,
			"warranty_expires_on",
			add_days(now_datetime(), 30),
			update_modified=False,
		)
		deal = frappe.get_doc("CRM Deal", won)
		deal.append("repair_orders", {"repair_order": ro.name})
		deal.flags.ignore_permissions = True
		deal.flags.ignore_validate = True
		deal.save()
		# Re-backdate: the save above re-stamped modified into the grace window.
		frappe.db.sql(
			"UPDATE `tabCRM Deal` SET modified=%s WHERE name=%s",
			(add_days(now_datetime(), -(POST_SALE_GRACE_DAYS + 30)), won),
		)
		self.assertEqual(resolve_reference_for_number(_PHONE), (won, "CRM Deal"))

	def test_unknown_number_is_orphan(self):
		self.assertEqual(resolve_reference_for_number("+5215550000000"), (None, None))

	def test_mx_prefix_variant_resolves_by_trailing_digits(self):
		"""WhatsApp `from` = 521XXXXXXXXXX vs contact stored +52 XX… — the
		upstream substring LIKE misses both directions; the trailing-10 fallback
		must still land the open deal (the prod bug: real customers with open
		deals resolved as orphans)."""
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Routing MX Prefix Test",
				"phone_nos": [{"phone": "+52 5559990088", "is_primary_mobile_no": 1}],
			}
		)
		contact.flags.ignore_permissions = True
		contact.insert()
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": _status("Open"),
				"contacts": [{"contact": contact.name, "is_primary": 1}],
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.assertEqual(resolve_reference_for_number("5215559990088"), (deal.name, "CRM Deal"))


class TestInboundAttributionLadder(unittest.TestCase):
	"""System ladder for unreferenced inbounds: newest open deal wins, then the
	post-sale window, then the lead; long-closed deals are never resurrected."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.phone = "+5215559990043"
		self.contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Inbound Ladder Test",
				"phone_nos": [{"phone": self.phone, "is_primary_mobile_no": 1}],
			}
		)
		self.contact.flags.ignore_permissions = True
		self.contact.insert()

	def tearDown(self):
		frappe.db.rollback()

	def _deal(self, status_type="Open", modified=None):
		return TestWhatsAppRouting._deal(self, status_type, modified)

	def test_newest_open_deal_wins(self):
		self._deal("Open", modified=add_days(now_datetime(), -10))
		newest = self._deal("Open")
		self.assertEqual(resolve_inbound_reference(self.phone), (newest, "CRM Deal"))

	def test_open_deal_wins_over_newer_terminal(self):
		open_deal = self._deal("Open", modified=add_days(now_datetime(), -3))
		self._deal("Won")
		self.assertEqual(resolve_inbound_reference(self.phone), (open_deal, "CRM Deal"))

	def test_recent_terminal_within_grace(self):
		won = self._deal("Won", modified=add_days(now_datetime(), -(POST_SALE_GRACE_DAYS - 2)))
		self.assertEqual(resolve_inbound_reference(self.phone), (won, "CRM Deal"))

	def test_old_terminal_is_orphan(self):
		self._deal("Won", modified=add_days(now_datetime(), -(POST_SALE_GRACE_DAYS + 30)))
		self.assertEqual(resolve_inbound_reference(self.phone), (None, None))

	def test_unconverted_lead_is_the_fallback(self):
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": "Inbound lead", "mobile_no": "+5215559990077"}
		)
		lead.flags.ignore_permissions = True
		lead.insert()
		self.assertEqual(resolve_inbound_reference("+5215559990077"), (lead.name, "CRM Lead"))

	def test_mx_prefix_variant_resolves_by_trailing_digits(self):
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Inbound MX Prefix Test",
				"phone_nos": [{"phone": "+52 5559990089", "is_primary_mobile_no": 1}],
			}
		)
		contact.flags.ignore_permissions = True
		contact.insert()
		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": _status("Open"),
				"contacts": [{"contact": contact.name, "is_primary": 1}],
			}
		)
		deal.flags.ignore_permissions = True
		deal.insert()
		self.assertEqual(resolve_inbound_reference("5215559990089"), (deal.name, "CRM Deal"))

	def test_unknown_number_is_orphan(self):
		self.assertEqual(resolve_inbound_reference("+5215550000001"), (None, None))
