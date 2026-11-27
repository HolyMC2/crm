import frappe


def execute():
	"""The shop's line may now ring whoever sells on shift; an empty rule means «shift»
	where the shop keeps shifts. A site that already had a line keeps ringing the people
	on its number until a manager picks the rule in Bandeja de clientes > Llamadas."""
	doctype = "CRM Inbox Settings"
	if not frappe.db.exists("DocType", doctype) or not frappe.get_meta(doctype).has_field("call_ring_rule"):
		return
	if frappe.db.get_single_value(doctype, "call_ring_rule"):
		return
	if not frappe.db.count("CRM Telephony Agent", {"twilio_number": ["is", "set"]}):
		return
	if frappe.db.count("Singles", {"doctype": doctype}):
		frappe.db.set_single_value(doctype, "call_ring_rule", "list")
		return
	# Never saved: writing one value alone would drop every other default.
	doc = frappe.get_single(doctype)
	doc.call_ring_rule = "list"
	doc.flags.ignore_validate = True
	doc.save(ignore_permissions=True)
