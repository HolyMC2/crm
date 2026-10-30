"""«En el almacén» on a supplier bill (crm.api.gastos.bill_warehouse): what Escáner
can do with its goods, on real bills of the test company."""

# ci: shell-apis

from unittest import TestCase, skipIf
from uuid import uuid4

try:
	import frappe
	from frappe.tests import IntegrationTestCase
	from frappe.utils import nowdate

	from crm.api.gastos import bill_warehouse

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestBillWarehouse(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if "erpnext" not in frappe.get_installed_apps():
			self.skipTest("ERPNext is not installed")
		self.company = frappe.db.get_single_value(
			"Global Defaults", "default_company"
		) or frappe.db.get_value("Company", {}, "name")
		self.warehouse = frappe.db.get_value("Warehouse", {"company": self.company, "is_group": 0}, "name")
		if not self.company or not self.warehouse:
			self.skipTest("The test company has no warehouse")
		tag = uuid4().hex[:8]
		group = frappe.db.get_value("Supplier Group", {"is_group": 0}, "name") or "All Supplier Groups"
		self.supplier = (
			frappe.get_doc(
				{"doctype": "Supplier", "supplier_name": f"Almacén {tag}", "supplier_group": group}
			)
			.insert()
			.name
		)
		self.uom = (
			frappe.db.get_value("UOM", {"name": ["in", ["Nos", "Unit", "Pieza", "Pza"]]}, "name") or "Nos"
		)
		self.stock_item = self.item(f"ALM-{tag}", stock=True)
		self.service_item = self.item(f"SRV-{tag}", stock=False)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		super().tearDown()

	def item(self, code, stock):
		return (
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": code,
					"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name")
					or "All Item Groups",
					"stock_uom": self.uom,
					"is_stock_item": int(stock),
					"is_purchase_item": 1,
				}
			)
			.insert()
			.name
		)

	def bill(self, item, update_stock=1):
		return frappe.get_doc(
			{
				"doctype": "Purchase Invoice",
				"supplier": self.supplier,
				"company": self.company,
				"posting_date": nowdate(),
				"due_date": nowdate(),
				"bill_no": f"ALM-{uuid4().hex[:8]}",
				"update_stock": update_stock,
				"set_warehouse": self.warehouse,
				"items": [{"item_code": item, "qty": 3, "rate": 10, "warehouse": self.warehouse}],
			}
		).insert()

	def test_a_draft_that_brings_stock_says_to_register_it_first(self):
		data = bill_warehouse(self.bill(self.stock_item).name)
		self.assertTrue(data["stock"])
		self.assertTrue(data["update_stock"])
		if not data["scanner"]:
			self.assertIsNone(data["receive"])
			return
		self.assertEqual(data["warehouses"], [self.warehouse])
		self.assertFalse(data["receive"]["allowed"])
		self.assertEqual(data["receive"]["code"], "draft")
		self.assertTrue(data["receive"]["reason"])

	def test_services_only_have_no_warehouse_side(self):
		data = bill_warehouse(self.bill(self.service_item, update_stock=0).name)
		self.assertFalse(data["stock"])
		self.assertEqual((data["warehouses"], data["inbounds"], data["tasks"]), ([], [], []))
		self.assertIsNone(data["receive"])

	def test_escaner_open_tasks_on_the_bill_are_listed(self):
		if "scanner_kit" not in frappe.get_installed_apps():
			self.skipTest("Escáner (scanner_kit) is not installed")
		bill = self.bill(self.stock_item)
		for status in ("Open", "Done"):
			# Only the reference matters to the reader: no lines, no validation.
			frappe.get_doc(
				{
					"doctype": "Scan Task",
					"name": f"ST-{uuid4().hex[:8]}",
					"task_type": "putaway",
					"status": status,
					"warehouse": self.warehouse,
					"source_ref_doctype": "Purchase Invoice",
					"source_ref_name": bill.name,
				}
			).db_insert()
		tasks = bill_warehouse(bill.name)["tasks"]
		self.assertEqual([(t["task_type"], t["status"]) for t in tasks], [("putaway", "Open")])

	def test_a_worker_who_cannot_read_the_bill_gets_nothing(self):
		name = self.bill(self.stock_item).name
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			bill_warehouse(name)
