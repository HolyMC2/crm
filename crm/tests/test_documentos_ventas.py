"""Ventas (Shell D2): the «Creado desde» chain, attribution, estado de cuenta and the draft cobro."""

# ci: shell-apis

from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe
	from frappe.tests import IntegrationTestCase
	from frappe.utils import add_days, flt, nowdate

	from crm.api import documentos_ventas as ventas

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestVentasWithoutERPNext(IntegrationTestCase):
	def test_readers_answer_unavailable_without_erpnext(self):
		with patch.object(ventas, "_erpnext", return_value=False):
			self.assertEqual(ventas.cadena("Sales Order", "X"), {"available": False, "steps": []})
			self.assertEqual(ventas.atribucion("Sales Order", "X"), {"available": False})
			self.assertFalse(ventas.origen("Sales Order", "X")["available"])
			self.assertEqual(ventas.estado_de_cuenta("X"), {"available": False})

	def test_only_sales_documents_have_a_chain(self):
		if not ventas._erpnext():
			self.skipTest("ERPNext is not installed")
		with self.assertRaises(frappe.ValidationError):
			ventas.cadena("Note", "x")

	def test_datos_skips_a_field_desk_shows_only_under_an_off_switch(self):
		from crm.api import documentos

		def df(fieldname, fieldtype="Data", depends_on=None):
			return frappe._dict(
				fieldname=fieldname,
				fieldtype=fieldtype,
				label=fieldname,
				depends_on=depends_on,
				hidden=0,
				options="Faltante\nCompleto" if fieldtype == "Select" else None,
			)

		class Doc:
			def __init__(self, **values):
				self.__dict__.update(values)

			def get(self, key, default=None):
				return self.__dict__.get(key, default)

		doc = Doc(
			doctype="Sales Invoice", is_financed=0, financing_compliance="Faltante", remarks="En la tarde"
		)
		doc.meta = frappe._dict(
			fields=[
				df("is_financed", "Check"),
				df("financing_compliance", "Select", "eval:doc.is_financed"),
				df("remarks"),
			]
		)
		self.assertEqual([f["fieldname"] for f in documentos._data_fields(doc)], ["remarks"])
		doc.is_financed = 1  # financed: «Cumplimiento» is real information again
		self.assertIn("financing_compliance", [f["fieldname"] for f in documentos._data_fields(doc)])


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestVentasChain(IntegrationTestCase):
	"""One real chain on the test company: Cotización → Pedido → Entrega → Factura → Cobro."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not ventas._erpnext():
			self.skipTest("ERPNext is not installed")
		company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
			"Company", {}, "name"
		)
		if not company:
			self.skipTest("No company on this site")
		self.company = company
		self.customer = self._customer("Cliente cadena D2")
		self.item = self._item("D2-SERVICIO", "Servicio de prueba D2")

	def _customer(self, name):
		if frappe.db.exists("Customer", name):
			return name
		return (
			frappe.get_doc({"doctype": "Customer", "customer_name": name, "customer_type": "Individual"})
			.insert(ignore_permissions=True)
			.name
		)

	def _item(self, code, name):
		if frappe.db.exists("Item", code):
			return code
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
		return (
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": name,
					"item_group": group,
					"stock_uom": frappe.db.get_value("UOM", {}, "name") or "Nos",
					"is_stock_item": 0,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def _quotation(self):
		q = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": self.customer,
				"company": self.company,
				"transaction_date": nowdate(),
				"valid_till": add_days(nowdate(), 10),
				"items": [{"item_code": self.item, "qty": 2, "rate": 150}],
			}
		)
		q.insert(ignore_permissions=True)
		q.submit()
		return q

	def _chain(self):
		from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
		from erpnext.selling.doctype.quotation.quotation import make_sales_order
		from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
		from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

		try:
			q = self._quotation()
			so = make_sales_order(q.name)
			so.delivery_date = add_days(nowdate(), 3)
			so.insert(ignore_permissions=True)
			so.submit()
			dn = make_delivery_note(so.name)
			dn.insert(ignore_permissions=True)
			dn.submit()
			si = make_sales_invoice(dn.name)
			si.insert(ignore_permissions=True)
			si.submit()
			pe = get_payment_entry("Sales Invoice", si.name)
			pe.reference_no = "D2-TEST"
			pe.reference_date = nowdate()
			pe.paid_amount = pe.received_amount = 100
			pe.references[0].allocated_amount = 100
			pe.insert(ignore_permissions=True)
		except frappe.ValidationError as e:  # a test site without accounts set up for sales
			self.skipTest(f"Sales chain cannot be built on this site: {e}")
		return q, so, dn, si, pe

	def test_the_chain_reads_the_same_from_every_step(self):
		q, so, dn, si, pe = self._chain()
		for doctype, name, current in (
			("Quotation", q.name, "cotizacion"),
			("Sales Order", so.name, "pedido"),
			("Delivery Note", dn.name, "entrega"),
			("Sales Invoice", si.name, "factura"),
			("Payment Entry", pe.name, "cobro"),
		):
			with self.subTest(doctype=doctype):
				steps = ventas.cadena(doctype, name)["steps"]
				self.assertEqual(
					[s["key"] for s in steps], ["cotizacion", "pedido", "entrega", "factura", "cobro"]
				)
				self.assertEqual([s["key"] for s in steps if s["current"]], [current])
				by_key = {s["key"]: s for s in steps}
				self.assertEqual([d["name"] for d in by_key["factura"]["docs"]], [si.name])
				self.assertEqual(by_key["pedido"]["state"], "done")
				# The draft payment is a draft, and the invoice is still owed: partial.
				self.assertEqual(by_key["cobro"]["state"], "draft")
				# Titles are the customer, never the ID.
				self.assertEqual(by_key["pedido"]["docs"][0]["title"], "Cliente cadena D2")

	def test_a_new_order_starts_its_chain_at_the_order(self):
		so = frappe.get_doc(
			{
				"doctype": "Sales Order",
				"customer": self.customer,
				"company": self.company,
				"transaction_date": nowdate(),
				"delivery_date": add_days(nowdate(), 2),
				"items": [{"item_code": self.item, "qty": 1, "rate": 50}],
			}
		).insert(ignore_permissions=True)
		steps = ventas.cadena("Sales Order", so.name)["steps"]
		self.assertEqual([s["key"] for s in steps], ["pedido", "entrega", "factura", "cobro"])
		self.assertEqual(steps[0]["state"], "draft")
		self.assertEqual({s["state"] for s in steps[1:]}, {"none"})

	def test_attribution_names_the_channel_seller_and_steps(self):
		q, so, dn, si, pe = self._chain()
		out = ventas.atribucion("Sales Invoice", si.name)
		self.assertTrue(out["available"])
		self.assertEqual(out["canal"]["kind"], "mostrador")
		self.assertEqual(out["vendedor"]["kind"], "captura")
		self.assertNotIn("@", out["vendedor"]["people"][0]["name"])
		steps = {p["step"] for p in out["pasos"]}
		self.assertTrue({"cotizacion", "pedido", "entrega", "factura"} <= steps)
		confirmed = next(p for p in out["pasos"] if p["step"] == "factura")
		# «Confirmó» reads the Version that moved docstatus 0 → 1; a test site may not
		# write Versions on submit, so pin the reader with one written by hand.
		if not frappe.db.exists("Version", {"ref_doctype": "Sales Invoice", "docname": si.name}):
			frappe.get_doc(
				{
					"doctype": "Version",
					"ref_doctype": "Sales Invoice",
					"docname": si.name,
					"data": frappe.as_json({"changed": [["docstatus", 0, 1]], "added": [], "removed": []}),
				}
			).insert(ignore_permissions=True)
			out = ventas.atribucion("Sales Invoice", si.name)
			confirmed = next(p for p in out["pasos"] if p["step"] == "factura")
		self.assertIn("confirmed_by", confirmed)
		self.assertNotIn("@", confirmed["confirmed_by"])
		panel = ventas.origen("Sales Order", so.name)
		self.assertEqual(len(panel["steps"]), 5)
		self.assertIn("canal", panel)

	def test_a_web_order_reads_as_the_online_store(self):
		if not frappe.get_meta("Sales Order").has_field("is_storefront_order"):
			self.skipTest("No storefront fields on this site")
		so = frappe.get_doc(
			{
				"doctype": "Sales Order",
				"customer": self.customer,
				"company": self.company,
				"transaction_date": nowdate(),
				"delivery_date": add_days(nowdate(), 2),
				"items": [{"item_code": self.item, "qty": 1, "rate": 50}],
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Sales Order", so.name, "is_storefront_order", 1)
		self.assertEqual(ventas.atribucion("Sales Order", so.name)["canal"]["kind"], "web")

	def test_estado_de_cuenta_and_a_draft_cobro(self):
		q, so, dn, si, pe = self._chain()
		state = ventas.estado_de_cuenta(self.customer)
		self.assertIn(si.name, [i["name"] for i in state["invoices"]])
		self.assertGreater(state["owed"], 0)
		draft = ventas.registrar_cobro(si.name, amount=50, reference_no="D2-BOT")
		self.assertEqual(draft["docstatus"], 0)
		self.assertEqual(flt(draft["amount"]), 50)
		self.assertTrue(draft["route"].startswith("/documentos/cobros/"))
		with self.assertRaises(frappe.ValidationError):
			ventas.registrar_cobro(si.name, amount=0)
