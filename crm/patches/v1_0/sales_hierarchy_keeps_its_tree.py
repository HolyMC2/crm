import frappe


def execute():
	"""The team tree now defaults to the organization chart. A tenant that already
	restricts visibility keeps the CRM Sales Hierarchy tree it set up."""
	if frappe.db.get_single_value("FCRM Settings", "enable_sales_hierarchy"):
		frappe.db.set_single_value("FCRM Settings", "sales_hierarchy_own_tree", 1)
