"""Keep private staff assistant identities outside customer conversation brokers.

Doco's current WhatsApp principal/history keys have no account dimension. Exact
private peer evidence therefore excludes that peer across WhatsApp accounts.
Only identity existence is read; no transcript, private settings or resolver call.
"""

import frappe


def assert_customer_peer(provider, peer_id):
	from crm.api import conversations as control

	if provider != "WhatsApp":
		return
	if not isinstance(peer_id, str) or not peer_id:
		frappe.throw("Invalid customer conversation identity.", frappe.PermissionError)
	if frappe.db.exists("DocType", "Asistente Canal"):
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
		if frappe.db.exists("DocType", doctype) and frappe.db.get_value(
			doctype, {"chat_id": "wa:" + peer_id}, "name", for_update=control._locked()
		):
			_deny()


def _deny():
	# The response does not reveal whether the identity is a current principal,
	# a disabled registration or historical private staff evidence.
	frappe.throw("This identity is unavailable for customer conversations.", frappe.PermissionError)
