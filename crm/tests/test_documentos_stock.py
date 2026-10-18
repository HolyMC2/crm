"""Documentos on Inventario's lists (Shell D4.3): stock documents read by what they do and where,
an Ajuste counts its rows, and a new Ajuste starts as a count whose rows take its store."""

import re
from pathlib import Path
from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import documentos

	HAS_FRAPPE = True
except ImportError:  # bench-free run: nothing here runs without a site
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase

STOCK_MANAGER = "documentos-stock@example.com"
_PO = Path(__file__).resolve().parents[1] / "locale" / "es.po"


def _spanish():
	"""The worker's words from crm/locale/es.po: the test needs no compiled .mo catalogue."""
	text = _PO.read_text(encoding="utf-8")
	return dict(re.findall(r'^msgid "(.*)"\nmsgstr "(.*)"$', text, flags=re.M))


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestDocumentosStock(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		if "erpnext" not in frappe.get_installed_apps():
			self.skipTest("ERPNext is not installed")
		self.company = frappe.db.get_single_value("Global Defaults", "default_company") or next(
			iter(frappe.get_all("Company", pluck="name", limit=1)), None
		)
		if not self.company:
			self.skipTest("this site has no company")
		self.abbr = frappe.get_cached_value("Company", self.company, "abbr")
		self.key = frappe.generate_hash(length=6).upper()
		self.centro = self._warehouse(f"Centro {self.key}")
		self.bodega = self._warehouse(f"Bodega {self.key}")
		self.item_a = self._item("A")
		self.item_b = self._item("B")
		# A count posts against a Balance Sheet account when the site has no stock ledger yet
		# (ERPNext treats it as an opening entry); Temporary Opening always qualifies.
		self.opening_account = frappe.db.get_value(
			"Account", {"company": self.company, "account_type": "Temporary", "is_group": 0}, "name"
		)
		if not self.opening_account:
			self.skipTest("this company has no Temporary Opening account")
		self.fresh_ledger = not frappe.db.sql("select name from `tabStock Ledger Entry` limit 1")
		words = _spanish()
		self.translate = patch.object(documentos, "_", side_effect=lambda s: words.get(s, s))
		self.translate.start()

	def _stock_adjustment_default(self):
		# A count takes the company's default Stock Adjustment account, as Desk does; a bare
		# test company (the CI image's) may have the account but not the default.
		if frappe.get_cached_value("Company", self.company, "stock_adjustment_account"):
			return
		account = frappe.db.get_value(
			"Account",
			{"company": self.company, "account_type": "Stock Adjustment", "is_group": 0},
			"name",
		)
		if not account:
			self.skipTest("this company has no Stock Adjustment account")
		frappe.db.set_value("Company", self.company, "stock_adjustment_account", account)
		frappe.clear_document_cache("Company", self.company)
		self.addCleanup(
			lambda: (
				frappe.db.set_value("Company", self.company, "stock_adjustment_account", None),
				frappe.clear_document_cache("Company", self.company),
			)
		)

	def tearDown(self):
		self.translate.stop()
		frappe.set_user("Administrator")
		super().tearDown()

	def _warehouse(self, name):
		parent = frappe.db.get_value("Warehouse", {"company": self.company, "is_group": 1}, "name")
		doc = frappe.get_doc(
			{
				"doctype": "Warehouse",
				"warehouse_name": name,
				"company": self.company,
				**({"parent_warehouse": parent} if parent else {}),
			}
		).insert(ignore_permissions=True)
		self.assertEqual(doc.name, f"{name} - {self.abbr}")
		return doc.name

	def _item(self, suffix):
		return (
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": f"DOCS-STK-{self.key}-{suffix}",
					"item_name": f"Tornillo {suffix}",
					"item_group": "All Item Groups",
					"stock_uom": "Nos",
					"is_stock_item": 1,
					"valuation_rate": 10,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def _stock_manager(self):
		if not frappe.db.exists("User", STOCK_MANAGER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": STOCK_MANAGER,
					"first_name": "Almacenista",
					"last_name": "Documentos",
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", STOCK_MANAGER)
		user.set("roles", [])
		for role in ("Stock Manager", "Stock User"):
			user.append("roles", {"role": role})
		user.set("block_modules", [])
		user.save(ignore_permissions=True)
		return STOCK_MANAGER

	def _reconciliation(self, items, purpose="Stock Reconciliation"):
		return frappe.get_doc(
			{
				"doctype": "Stock Reconciliation",
				"company": self.company,
				"purpose": purpose,
				"set_warehouse": self.centro,
				"expense_account": self.opening_account,
				"items": [
					{"item_code": code, "warehouse": self.centro, "qty": qty, "valuation_rate": 10}
					for code, qty in items
				],
			}
		).insert(ignore_permissions=True)

	def test_store_names_drop_the_company_suffix(self):
		self.assertEqual(documentos._store(self.centro), f"Centro {self.key}")
		self.assertEqual(documentos._store("Bodega - Norte - DM"), "Bodega - Norte")
		self.assertEqual(documentos._store("Stores"), "Stores")
		self.assertEqual(documentos._store(None), "")

	def test_stock_entry_rows_read_by_purpose_and_stores_never_the_id(self):
		if not frappe.db.exists("Stock Entry Type", "Material Transfer"):
			self.skipTest("this site has no «Material Transfer» stock entry type")
		entry = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Transfer",
				"purpose": "Material Transfer",
				"company": self.company,
				"from_warehouse": self.centro,
				"to_warehouse": self.bodega,
				"items": [
					{
						"item_code": self.item_a,
						"qty": 2,
						"uom": "Nos",
						"conversion_factor": 1,
						"s_warehouse": self.centro,
						"t_warehouse": self.bodega,
						"basic_rate": 10,
					}
				],
			}
		).insert(ignore_permissions=True)
		frappe.set_user(self._stock_manager())
		page = documentos.rows("Stock Entry", filters=[["name", "=", entry.name]])
		self.assertEqual([r["name"] for r in page["rows"]], [entry.name])
		row = page["rows"][0]
		self.assertEqual(row["title"], f"Traspaso · Centro {self.key} → Bodega {self.key}")
		self.assertNotIn(entry.name, row["title"])
		self.assertNotIn("lines", row)  # only lists that count their rows
		for field in ("purpose", "from_warehouse", "to_warehouse"):
			self.assertIn(field, row["fields"])
		# The palette and the record header read the same title.
		found = [r for r in documentos.search(f"Centro {self.key}") if r["name"] == entry.name]
		self.assertEqual(found[0]["title"], row["title"])
		self.assertEqual(documentos.record("Stock Entry", entry.name)["header"]["title"], row["title"])

	def test_reconciliation_rows_say_the_store_and_count_only_their_own_rows(self):
		two = self._reconciliation([(self.item_a, 5), (self.item_b, 3)])
		one = self._reconciliation([(self.item_a, 7)], purpose="Opening Stock")
		frappe.set_user(self._stock_manager())
		page = documentos.rows("Stock Reconciliation", filters=[["name", "=", two.name]])
		self.assertEqual([r["name"] for r in page["rows"]], [two.name])
		self.assertEqual(page["rows"][0]["title"], f"Ajuste · Centro {self.key}")
		self.assertEqual(page["rows"][0]["lines"], 2)
		both = documentos.rows("Stock Reconciliation", filters=[["name", "in", [two.name, one.name]]])
		by_name = {r["name"]: r for r in both["rows"]}
		self.assertEqual(by_name[two.name]["lines"], 2)
		self.assertEqual(by_name[one.name]["lines"], 1)
		self.assertEqual(by_name[one.name]["title"], f"Inventario inicial · Centro {self.key}")

	def test_a_new_ajuste_starts_as_a_count_and_its_rows_take_its_store(self):
		frappe.set_user(self._stock_manager())
		blank = documentos.draft("Stock Reconciliation")
		self.assertEqual(blank["doc"]["purpose"], "Stock Reconciliation")
		self.assertEqual(blank["title"], "Ajuste")
		shape = documentos.form("Stock Reconciliation", fields=["purpose", "set_warehouse"])
		self.assertEqual([f["fieldname"] for f in shape["fields"]], ["purpose", "set_warehouse"])
		self.assertEqual(shape["items"]["fieldname"], "items")
		values = {
			"company": self.company,
			"set_warehouse": self.centro,
			"items": [{"item_code": self.item_a, "qty": 4}, {"item_code": self.item_b, "qty": 6}],
		}
		if self.fresh_ledger:  # see setUp: Stock Adjustment is refused before the first ledger entry
			values["expense_account"] = self.opening_account
		else:
			self._stock_adjustment_default()
		made = documentos.save("Stock Reconciliation", values=values)
		self.assertEqual(made["docstatus"], 0)
		doc = frappe.get_doc("Stock Reconciliation", made["name"])
		self.assertEqual(doc.owner, STOCK_MANAGER)
		self.assertEqual(doc.purpose, "Stock Reconciliation")
		self.assertEqual([r.warehouse for r in doc.items], [self.centro, self.centro])
		self.assertEqual([r.qty for r in doc.items], [4, 6])
		header = documentos.record("Stock Reconciliation", doc.name)["header"]
		self.assertEqual(header["title"], f"Ajuste · Centro {self.key}")

	def test_an_opening_count_takes_the_temporary_opening_account_as_desk_does(self):
		frappe.set_user(self._stock_manager())
		made = documentos.save(
			"Stock Reconciliation",
			values={
				"company": self.company,
				"purpose": "Opening Stock",
				"set_warehouse": self.bodega,
				"items": [{"item_code": self.item_a, "qty": 9}],
			},
		)
		doc = frappe.get_doc("Stock Reconciliation", made["name"])
		self.assertEqual(doc.purpose, "Opening Stock")
		self.assertEqual(doc.expense_account, self.opening_account)
		self.assertEqual(doc.items[0].warehouse, self.bodega)
		self.assertEqual(
			documentos.record("Stock Reconciliation", doc.name)["header"]["title"],
			f"Inventario inicial · Bodega {self.key}",
		)

	def test_a_stock_draft_skips_the_sales_totals_calculator(self):
		# ERPNext's taxes-and-totals reads item rates a stock row does not have.
		frappe.set_user("Administrator")
		doc = frappe.new_doc("Stock Reconciliation")
		doc.company = self.company
		documentos._apply(
			doc, {"set_warehouse": self.centro, "items": [{"item_code": self.item_a, "qty": 1}]}
		)
		self.assertEqual(doc.items[0].warehouse, self.centro)
