"""Keep private staff assistant identities outside customer conversation brokers.

Doco's current WhatsApp principal/history keys have no account dimension. Exact
private peer evidence therefore excludes that peer across WhatsApp accounts.
Only identity existence is read; no transcript, private settings or resolver call.
"""

import frappe

from crm.utils.doctypes import doctype_exists


def assert_customer_peer(provider, peer_id):
	from crm.api import conversations as control

	if provider != "WhatsApp":
		return
	if not isinstance(peer_id, str) or not peer_id:
		frappe.throw("Invalid customer conversation identity.", frappe.PermissionError)
	if doctype_exists("Asistente Canal"):
		channel = frappe.qb.DocType("Asistente Canal")
		query = (
			frappe.qb.from_(channel)
			.select(channel.name)
			.where(
				(channel.channel == "WhatsApp")
				& ((channel.external_id == peer_id) | channel.address.isin([peer_id, "wa:" + peer_id]))
			)
			.limit(1)
		)
		if control._locked():
			query = query.for_update()
		private = query.run()
		if private:
			_deny()
	for doctype in ("Books Assistant Chat", "Books Chat Log"):
		if doctype_exists(doctype) and frappe.db.get_value(
			doctype, {"chat_id": "wa:" + peer_id}, "name", for_update=control._locked()
		):
			_deny()


def _deny():
	# The response does not reveal whether the identity is a current principal,
	# a disabled registration or historical private staff evidence.
	frappe.throw("This identity is unavailable for customer conversations.", frappe.PermissionError)


def customer_peer_condition(peer):
	"""SQL counterpart of assert_customer_peer for transcript lists/counts.

	Correlated NOT EXISTS avoids loading private identities or transcript IDs.
	The caller separately validates the provider's numeric peer grammar.
	"""
	from frappe.query_builder.functions import Concat
	from pypika.terms import Criterion, ExistsCriterion

	conditions = []
	if doctype_exists("Asistente Canal"):
		channel = frappe.qb.DocType("Asistente Canal")
		conditions.append(
			~ExistsCriterion(
				frappe.qb.from_(channel)
				.select(channel.name)
				.where(
					(channel.channel == "WhatsApp")
					& (
						(channel.external_id == peer)
						| (channel.address == peer)
						| (channel.address == Concat("wa:", peer))
					)
				)
			)
		)
	for doctype in ("Books Assistant Chat", "Books Chat Log"):
		if doctype_exists(doctype):
			table = frappe.qb.DocType(doctype)
			conditions.append(
				~ExistsCriterion(
					frappe.qb.from_(table).select(table.name).where(table.chat_id == Concat("wa:", peer))
				)
			)
	return Criterion.all(conditions)


def private_whatsapp_suffixes():
	"""Trailing ten digits of every private assistant WhatsApp identity (same evidence as
	customer_peer_condition: registrations of any state, legacy chats, chat history).

	For raw readers that group conversations by number (the inbox's «Sin asignar»): the
	owner's and staff's chats with the assistant never surface as customer orphans. Ten
	digits, not the exact peer, so the MX 52/521 variants of one number are both private.
	"""
	import re

	ids = set()
	if doctype_exists("Asistente Canal"):
		for row in frappe.get_all(
			"Asistente Canal", filters={"channel": "WhatsApp"}, fields=["external_id", "address"]
		):
			ids.update((row.external_id, row.address))
	for doctype in ("Books Assistant Chat", "Books Chat Log"):
		if doctype_exists(doctype):
			ids.update(
				frappe.get_all(
					doctype, filters={"chat_id": ["like", "wa:%"]}, pluck="chat_id", distinct=True
				)
			)
	out = set()
	for value in ids:
		digits = re.sub(r"\D", "", str(value or ""))
		if len(digits) >= 10:
			out.add(digits[-10:])
	return out
