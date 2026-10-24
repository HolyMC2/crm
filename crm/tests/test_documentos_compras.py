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

	def test_an_untitled_requisicion_reads_by_its_items(self):
		from unittest.mock import patch

		rows = [
			frappe._dict(parent="MR-1", item_name="Pantalla Redmi 13C", item_code="A", idx=1),
			frappe._dict(parent="MR-1", item_name="Pantalla iPhone 13", item_code="B", idx=2),
			frappe._dict(parent="MR-1", item_name="", item_code="C", idx=3),
			frappe._dict(parent="MR-2", item_name="", item_code="FUNDA-1", idx=1),
		]
		with patch.object(documentos_compras.frappe, "get_all", return_value=rows):
			titles = documentos_compras._items_titles("Material Request", ["MR-1", "MR-2"])
		self.assertEqual(titles, {"MR-1": "Pantalla Redmi 13C y 2 más", "MR-2": "FUNDA-1"})
		self.assertEqual(documentos_compras._items_titles("Purchase Order", ["PO-1"]), {})

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


NAMES = {
	"ernesto@x.mx": "Ernesto Encargado",
	"marco@x.mx": "Marco Dueño",
	"contabot@x.mx": "Contabot",
}


def _version(owner, when, data):
	return frappe._dict(owner=owner, creation=when, data=json.dumps(data, separators=(",", ":")))


def _store(rows):
	"""frappe.get_all over a fixture of Version rows: honours the `data like` filter, the
	order and the limit, so the read is exercised the way the database answers it."""

	def get_all(doctype, filters=None, fields=None, order_by="", limit=None, **_kw):
		assert doctype == "Version"
		out = list(rows)
		like = (filters or {}).get("data")
		if like:
			needle = like[1].strip("%")
			out = [r for r in out if needle in r.data]
		out.sort(key=lambda r: r.creation, reverse="desc" in order_by)
		return out[:limit] if limit else out

	return get_all


@skipIf(not HAS_FRAPPE, "Frappe is not installed")
class TestWho(TestCase):
	"""`_who` with a fixture of Versions and captures: no site."""

	def setUp(self):
		from unittest.mock import patch

		for p in (
			patch.object(documentos, "_person", side_effect=lambda u: NAMES.get(u, u)),
			patch.object(documentos_compras, "_person", side_effect=lambda u: NAMES.get(u, u)),
			patch.object(frappe, "get_installed_apps", return_value=["frappe", "erpnext", "crm", "doco"]),
		):
			p.start()
			self.addCleanup(p.stop)

	def doc(self, owner, docstatus=1):
		"""A chain row as `cadena` reads it (`get_list`): no `doctype` attribute on it."""
		return frappe._dict(name="ACC-PINV-1", owner=owner, creation="2026-10-01 10:00", docstatus=docstatus)

	def with_capture(self, requested_by, agent="contabot@x.mx"):
		"""doco's side: the agent user, and the capture that created the record."""
		import sys
		import types
		from unittest.mock import patch

		actors = types.ModuleType("doco.docoutils.books.actors")
		actors.is_agent = lambda user: user == agent
		for p in (
			patch.dict(sys.modules, {"doco.docoutils.books.actors": actors}),
			patch.object(frappe.db, "get_value", return_value=requested_by),
		):
			p.start()
			self.addCleanup(p.stop)

	def test_a_draft_edited_forty_times_then_submitted_names_its_submitter(self):
		from unittest.mock import patch

		rows = [
			# Edits that add item rows carry a child «docstatus» too: the filter cannot tell
			# them from the submit; only the order and the content do.
			_version(
				"ernesto@x.mx",
				f"2026-10-01 10:{i:02d}",
				{"added": [["items", {"item_code": f"A{i}", "docstatus": 0}]]}
				if i % 4 == 0
				else {"changed": [["remarks", f"v{i}", f"v{i + 1}"]]},
			)
			for i in range(1, 41)
		]
		rows.append(
			_version(
				"marco@x.mx",
				"2026-10-02 09:00",
				{"changed": [["docstatus", 0, 1], ["status", "Draft", "Unpaid"]]},
			)
		)
		rows.append(_version("ernesto@x.mx", "2026-10-02 09:30", {"changed": [["remarks", "x", "y"]]}))
		self.with_capture(None)
		with patch.object(frappe, "get_all", side_effect=_store(rows)):
			people = documentos_compras._who("Purchase Invoice", self.doc("ernesto@x.mx"))
		self.assertEqual(
			people,
			[
				{"verb": "Capturó", "name": "Ernesto Encargado", "when": "2026-10-01 10:00"},
				{"verb": "Registró", "name": "Marco Dueño", "when": "2026-10-02 09:00"},
			],
		)

	def test_a_record_the_bot_built_for_a_person_names_the_person_with_the_bot(self):
		self.with_capture("ernesto@x.mx")
		people = documentos_compras._who("Purchase Invoice", self.doc("contabot@x.mx", docstatus=0))
		self.assertEqual(
			people,
			[{"verb": "Capturó", "name": "Ernesto Encargado", "when": "2026-10-01 10:00", "via": "Contabot"}],
		)

	def test_a_bot_record_nobody_asked_for_stays_the_bots(self):
		self.with_capture(None)
		people = documentos_compras._who("Purchase Invoice", self.doc("contabot@x.mx", docstatus=0))
		self.assertEqual(people, [{"verb": "Capturó", "name": "Contabot", "when": "2026-10-01 10:00"}])

	def test_a_persons_own_record_never_asks_for_a_capture(self):
		from unittest.mock import patch

		self.with_capture("marco@x.mx")
		with patch.object(frappe.db, "get_value", side_effect=AssertionError("asked for a capture")):
			people = documentos_compras._who("Purchase Invoice", self.doc("ernesto@x.mx", docstatus=0))
		self.assertEqual(
			people, [{"verb": "Capturó", "name": "Ernesto Encargado", "when": "2026-10-01 10:00"}]
		)

	def test_a_doco_without_the_helper_leaves_the_record_to_its_owner(self):
		import sys
		from unittest.mock import patch

		# None in sys.modules makes the import raise ImportError (an older doco image).
		with patch.dict(sys.modules, {"doco.docoutils.books.actors": None}):
			self.assertEqual(
				documentos._made_by("Purchase Invoice", self.doc("contabot@x.mx")), ("Contabot", None)
			)

	def test_actividad_create_event_carries_the_same_attribution(self):
		self.with_capture("ernesto@x.mx")
		self.assertEqual(
			documentos._made_by("Purchase Invoice", self.doc("contabot@x.mx")),
			("Ernesto Encargado", "Contabot"),
		)
		self.with_capture(None)
		self.assertEqual(
			documentos._made_by("Purchase Invoice", self.doc("ernesto@x.mx")), ("Ernesto Encargado", None)
		)


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

	def test_an_order_from_an_old_requisicion_is_required_by_today_or_later(self):
		from frappe.utils import getdate, nowdate

		po = frappe.new_doc("Purchase Order")
		po.append("items", {"item_code": "X", "schedule_date": "2020-01-10"})
		po.append("items", {"item_code": "Y", "schedule_date": "2999-01-10"})
		documentos._header_dates(po)
		self.assertEqual(getdate(po.schedule_date), getdate(nowdate()))
		self.assertEqual(getdate(po.items[0].schedule_date), getdate(nowdate()))
		self.assertEqual(getdate(po.items[1].schedule_date), getdate("2999-01-10"))

	def test_rows_without_dates_take_the_requisicion_date(self):
		from frappe.utils import add_days, getdate, nowdate

		later = add_days(nowdate(), 5)
		po = frappe.new_doc("Purchase Order")
		po.append("items", {"item_code": "X"})
		po.append("items", {"item_code": "Y"})
		documentos._header_dates(po, later)
		self.assertEqual([getdate(r.schedule_date) for r in po.items], [getdate(later)] * 2)
		self.assertEqual(getdate(po.schedule_date), getdate(later))
		old = frappe.new_doc("Purchase Order")
		old.append("items", {"item_code": "X"})
		documentos._header_dates(old, "2020-01-01")
		self.assertEqual(getdate(old.schedule_date), getdate(nowdate()))

	def test_paying_a_supplier_is_for_accounts_managers(self):
		self.assertTrue(documentos._may_make("Purchase Invoice", "payment", "Payment Entry"))  # Administrator
		frappe.set_user("Guest")
		self.assertFalse(documentos._may_make("Purchase Invoice", "payment", "Payment Entry"))

	def test_hidden_counts_live_documents_the_caller_cannot_read(self):
		name = frappe.db.get_value("Purchase Order", {"docstatus": 1}, "name")
		if not name:
			self.skipTest("No confirmed purchase order on this site")
		self.assertEqual(documentos_compras._hidden("Purchase Order", {name}, set()), 1)
		self.assertEqual(documentos_compras._hidden("Purchase Order", {name}, {name}), 0)
		self.assertEqual(documentos_compras._hidden("Purchase Order", {"NO-EXISTE"}, set()), 0)
		answer = documentos_compras.cadena("Purchase Order", name)  # Administrator reads everything
		self.assertTrue(all(stage["hidden"] == 0 for stage in answer["stages"]))

	def test_a_mapped_order_starts_from_the_last_purchase_rate(self):
		from unittest.mock import patch

		po = frappe.new_doc("Purchase Order")
		po.append("items", {"item_code": "FUNDA", "qty": 2, "conversion_factor": 10})
		po.append("items", {"item_code": "MICA", "qty": 1, "rate": 7, "conversion_factor": 1})
		last = [frappe._dict(name="FUNDA", last_purchase_rate=3)]
		with (
			patch.object(documentos.frappe, "get_all", return_value=last),
			patch.object(type(po), "calculate_taxes_and_totals", lambda self: None),
		):
			documentos._last_purchase_rates(po)
		self.assertEqual([r.rate for r in po.items], [30, 7])
