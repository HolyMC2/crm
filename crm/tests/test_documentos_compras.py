"""Documentos · Compras (Shell Wave D, D3): the purchase chain and who did each step."""

import json
from unittest import TestCase, skipIf

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import documentos, documentos_compras

	HAS_FRAPPE = True
except ImportError:  # bench-free run
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


@skipIf(not HAS_FRAPPE, "Frappe is not installed")
class TestConfirmedBy(TestCase):
	def test_the_save_that_moved_docstatus_to_one_names_who_confirmed(self):
		versions = [
			{
				"owner": "ana@x.mx",
				"creation": "2026-10-01 10:00",
				"data": json.dumps({"changed": [["qty", 1, 2]]}),
			},
			{
				"owner": "marco@x.mx",
				"creation": "2026-10-02 09:00",
				"data": json.dumps({"changed": [["docstatus", 0, 1], ["status", "Draft", "To Bill"]]}),
			},
		]
		self.assertEqual(documentos_compras.confirmed_by(versions), ("marco@x.mx", "2026-10-02 09:00"))

	def test_no_confirmation_logged(self):
		self.assertEqual(documentos_compras.confirmed_by([{"data": "not json"}]), (None, None))
		self.assertEqual(documentos_compras.confirmed_by([]), (None, None))

	def test_stages_run_from_requisicion_to_pago(self):
		self.assertEqual(
			[key for key, _label, _doctypes in documentos_compras.STAGES],
			["requisicion", "cotizacion", "orden", "recepcion", "factura", "pago"],
		)
		self.assertEqual(documentos_compras.STAGE_OF["Purchase Receipt"], "recepcion")

	def test_purchase_mappers_are_on_the_allowlist(self):
		for key in [
			("Material Request", "purchase_order"),
			("Material Request", "supplier_quotation"),
			("Request for Quotation", "supplier_quotation"),
			("Supplier Quotation", "purchase_order"),
			("Purchase Order", "purchase_receipt"),
			("Purchase Receipt", "purchase_invoice"),
			("Purchase Invoice", "payment"),
		]:
			self.assertIn(key, documentos.MAKERS)


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestCadenaERPNext(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if "erpnext" not in frappe.get_installed_apps():
			self.skipTest("ERPNext is not installed")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_every_chain_link_is_a_real_field(self):
		for child, parent, field, target in documentos_compras.EDGES:
			meta = frappe.get_meta(child)
			self.assertTrue(meta.istable, child)
			df = meta.get_field(field)
			self.assertIsNotNone(df, f"{child}.{field}")
			self.assertEqual(df.options, target, f"{child}.{field}")
			self.assertTrue(
				any(t.options == child for t in frappe.get_meta(parent).get_table_fields()), (parent, child)
			)

	def test_a_doctype_outside_the_chain_has_no_chain(self):
		self.assertEqual(documentos_compras.chain("Sales Invoice", "X")["stages"], [])

	def test_a_guest_cannot_read_a_chain(self):
		name = frappe.db.get_value("Purchase Order", {}, "name")
		if not name:
			self.skipTest("No purchase order on this site")
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			documentos_compras.cadena("Purchase Order", name)

	def test_an_order_stands_in_its_own_stage(self):
		name = frappe.db.get_value("Purchase Order", {"docstatus": ("<", 2)}, "name")
		if not name:
			self.skipTest("No purchase order on this site")
		answer = documentos_compras.cadena("Purchase Order", name)
		orden = next(s for s in answer["stages"] if s["key"] == "orden")
		here = [d for d in orden["docs"] if d["here"]]
		self.assertEqual([d["name"] for d in here], [name])
		for stage in answer["stages"]:
			for doc in stage["docs"]:
				for person in doc["people"]:
					self.assertNotIn("@", person["name"])

	def test_a_mapper_step_needs_create_on_its_target(self):
		name = frappe.db.get_value("Material Request", {"docstatus": 1}, "name")
		if not name:
			self.skipTest("No confirmed material request on this site")
		actions = documentos._actions(frappe.get_doc("Material Request", name))
		self.assertTrue(actions["make_purchase_order"]["allowed"])
		self.assertIn("make_supplier_quotation", actions)
		draft = frappe.db.get_value("Material Request", {"docstatus": 0}, "name")
		if draft:
			self.assertNotIn(
				"make_purchase_order", documentos._actions(frappe.get_doc("Material Request", draft))
			)
