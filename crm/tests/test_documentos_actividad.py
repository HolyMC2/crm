"""Actividad's attribution ledger: each edit shows what changed, without leaking a field
the worker may not read (Shell D2, Marco 2026-10-23)."""

import json
from types import SimpleNamespace
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


def _field(fieldname, label, fieldtype="Data", permlevel=0, hidden=0, read_only=0, options=None):
	return SimpleNamespace(
		fieldname=fieldname,
		label=label,
		fieldtype=fieldtype,
		permlevel=permlevel,
		hidden=hidden,
		read_only=read_only,
		options=options,
	)


class _FakeDoc:
	"""The parts of a Document that Actividad's diff reads."""

	def __init__(self, fields, masked=(), read_permlevels=(0,), rows=None):
		self.doctype = "Fake Doc"
		self.meta = SimpleNamespace(
			fields=list(fields),
			get_field=lambda name: next((f for f in fields if f.fieldname == name), None),
			get_permlevel_access=lambda permission_type="read": list(read_permlevels),
			get_masked_fields=lambda parenttype=None: list(masked),
		)
		self._rows = rows or {}

	def get(self, name, default=None):
		return self._rows.get(name, default)


class _FakeChildMeta:
	def __init__(self, fields, masked=()):
		self._fields = list(fields)
		self._masked = list(masked)

	def has_field(self, name):
		return any(f.fieldname == name for f in self._fields)

	def get_field(self, name):
		return next((f for f in self._fields if f.fieldname == name), None)

	def get_masked_fields(self, parenttype=None):
		return list(self._masked)


def _event(doc, data):
	row = frappe._dict(data=json.dumps(data))
	return documentos._version_event(doc, row)


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestDocumentosActividadDiff(TestCase):
	def test_money_field_reads_as_old_and_new_numbers(self):
		doc = _FakeDoc([_field("grand_total", "Grand Total", fieldtype="Currency")])
		event = _event(doc, {"changed": [["grand_total", "$ 2,000.00", 2500.0]]})
		self.assertEqual(event["kind"], "edit")
		self.assertEqual(
			event["changes"],
			[{"label": "Grand Total", "type": "money", "from": 2000.0, "to": 2500.0}],
		)

	def test_submit_and_cancel_stay_submit_and_cancel(self):
		doc = _FakeDoc([_field("status", "Status", fieldtype="Select")])
		self.assertEqual(_event(doc, {"changed": [["docstatus", 0, 1]]})["kind"], "submit")
		self.assertEqual(_event(doc, {"changed": [["docstatus", 1, 2]]})["kind"], "cancel")

	def test_hidden_permlevel_and_masked_fields_never_show_their_values(self):
		public = _field("remarks", "Remarks")
		hidden = _field("internal_note", "Internal Note", hidden=1)
		private = _field("salary", "Salary", permlevel=1)
		masked = _field("phone", "Phone")
		doc = _FakeDoc([public, hidden, private, masked], masked=[masked])
		event = _event(
			doc,
			{
				"changed": [
					["remarks", "Antes", "Después"],
					["internal_note", "secreto oculto", "otro secreto"],
					["salary", 1000, 2000],
					["phone", "555-1000", "555-2000"],
				]
			},
		)
		self.assertEqual([change["label"] for change in event["changes"]], ["Remarks"])
		shown = json.dumps(event, ensure_ascii=False)
		for leaked in ("secreto", "1000", "2000", "555-1000", "555-2000", "Salary", "Phone"):
			self.assertNotIn(leaked, shown)

	def test_a_permlevel_the_worker_can_read_does_show(self):
		private = _field("salary", "Salary", fieldtype="Int", permlevel=1)
		doc = _FakeDoc([private], read_permlevels=(0, 1))
		event = _event(doc, {"changed": [["salary", 1000, 2000]]})
		self.assertEqual(event["changes"][0]["from"], 1000.0)
		self.assertEqual(event["changes"][0]["to"], 2000.0)

	def test_bookkeeping_only_edit_is_no_event(self):
		# Every save re-stamps the posting time and re-saves inherited columns.
		doc = _FakeDoc([_field("posting_time", "Posting Time", fieldtype="Time")])
		self.assertIsNone(_event(doc, {"changed": [["posting_time", "10:00:00", "10:00:01"]]}))

	def test_reset_to_default_child_columns_are_not_a_row_change(self):
		for old, new, noise in (
			("", None, True),
			(0, None, True),
			(0.0, None, True),
			(None, None, True),
			("IVA 16%", None, False),
			(1, 2, False),
		):
			with self.subTest(old=old, new=new):
				self.assertEqual(documentos._reset_noise(old, new), noise)

	def test_item_rows_read_which_item_and_how_much(self):
		table = _field("items", "Items", fieldtype="Table", options="Fake Item")
		quantity = _field("qty", "Quantity", fieldtype="Float")
		amount = _field("amount", "Amount", fieldtype="Currency")
		child = _FakeChildMeta(
			[
				_field("item_code", "Item Code"),
				_field("item_name", "Item Name"),
				quantity,
				amount,
				# Derived columns a save writes from qty/amount: not the worker's change.
				_field("stock_qty", "Quantity in Stock UOM", fieldtype="Float"),
				_field("base_amount", "Amount (Company Currency)", fieldtype="Currency"),
				_field("tax_code", "Tax Code"),
			],
		)
		row = frappe._dict(name="row-1", item_name="Funda iPhone", qty=2, amount=250.0)
		doc = _FakeDoc([table], rows={"items": [row]})
		data = {
			"added": [["items", {"item_name": "Funda iPhone", "qty": 1, "amount": 250.0}]],
			"removed": [["items", {"item_name": "Mica templada", "qty": 2, "amount": 100.0}]],
			"row_changed": [
				[
					"items",
					0,
					"row-1",
					[
						["tax_code", "", None],
						["qty", 1, 2],
						["stock_qty", 1, 2],
						["amount", "$ 250.00", "$ 500.00"],
						["base_amount", "$ 250.00", "$ 500.00"],
					],
				]
			],
		}
		with patch("crm.api.documentos.frappe.get_meta", return_value=child):
			event = _event(doc, data)
		# One added, one removed and one meaningful changed row: the tax_code reset is noise.
		self.assertEqual(event["rows"], 3)
		self.assertEqual(event["tables"], [{"label": "Items", "count": 3}])
		self.assertEqual(
			event["items"]["added"],
			[{"label": "Funda iPhone", "qty": 1.0, "amount": 250.0}],
		)
		self.assertEqual(
			event["items"]["removed"],
			[{"label": "Mica templada", "qty": 2.0, "amount": 100.0}],
		)
		self.assertEqual(
			event["items"]["changed"],
			[
				{
					"label": "Funda iPhone",
					"changes": [
						{"label": "Quantity", "type": "number", "from": 1.0, "to": 2.0},
						{"label": "Amount", "type": "money", "from": 250.0, "to": 500.0},
					],
				}
			],
		)

	def test_a_row_with_only_noise_leaves_no_item_detail(self):
		table = _field("items", "Items", fieldtype="Table", options="Fake Item")
		child = _FakeChildMeta([_field("item_code", "Item Code"), _field("tax_code", "Tax Code")])
		doc = _FakeDoc([table], rows={"items": []})
		data = {"row_changed": [["items", 0, "row-9", [["tax_code", "", None]]]]}
		with patch("crm.api.documentos.frappe.get_meta", return_value=child):
			self.assertIsNone(_event(doc, data))

	def test_the_same_amount_under_two_labels_reads_once(self):
		total = _field("total", "Total", fieldtype="Currency")
		grand_total = _field("grand_total", "Grand Total", fieldtype="Currency")
		doc = _FakeDoc([total, grand_total])
		event = _event(
			doc,
			{"changed": [["total", "$ 100.00", 120.0], ["grand_total", "$ 100.00", 120.0]]},
		)
		# «Grand Total» is the label the record reads; the twin «Total» would repeat it.
		self.assertEqual(
			event["changes"],
			[{"label": "Grand Total", "type": "money", "from": 100.0, "to": 120.0}],
		)

	def test_a_select_reads_its_translated_option_and_a_check_reads_si(self):
		doc = _FakeDoc(
			[
				_field("status", "Status", fieldtype="Select", options="Draft\nPaid"),
				_field("is_return", "Is Return", fieldtype="Check"),
			]
		)
		event = _event(
			doc,
			{
				"changed": [
					["status", "Draft", "Paid"],
					["is_return", 0, 1],
				]
			},
		)
		by_label = {change["label"]: change for change in event["changes"]}
		self.assertEqual(by_label["Status"]["from"], frappe._("Draft"))
		self.assertEqual(by_label["Status"]["to"], frappe._("Paid"))
		self.assertEqual(by_label["Is Return"]["from"], frappe._("No"))
		self.assertEqual(by_label["Is Return"]["to"], frappe._("Yes"))

	def test_long_text_is_stripped_and_cut_for_the_phone(self):
		doc = _FakeDoc([_field("remarks", "Remarks", fieldtype="Text")])
		long_html = "<p>" + ("palabra " * 60) + "</p>"
		event = _event(doc, {"changed": [["remarks", None, long_html]]})
		value = event["changes"][0]["to"]
		self.assertNotIn("<p>", value)
		self.assertLessEqual(len(value), documentos.MAX_DIFF_TEXT)

	def test_many_changed_fields_stay_capped(self):
		fields = [_field(f"field_{i}", f"Field {i}") for i in range(10)]
		doc = _FakeDoc(fields)
		event = _event(doc, {"changed": [[f.fieldname, "a", "b"] for f in fields]})
		self.assertEqual(len(event["changes"]), documentos.MAX_DIFF_FIELDS)
		self.assertEqual(event["changes_more"], 10 - documentos.MAX_DIFF_FIELDS)


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestDocumentosActividadEndToEnd(IntegrationTestCase):
	def test_a_stored_version_shows_its_field_diff_in_actividad(self):
		# Frappe writes this row on a save that tracks changes; the site's Note may not
		# track them, so the stored row is what this test needs (Actividad reads Versions).
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Nota del turno", "public": 1}).insert()
		frappe.get_doc(
			{
				"doctype": "Version",
				"ref_doctype": "Note",
				"docname": note.name,
				"data": json.dumps(
					{
						"added": [],
						"changed": [
							[
								"content",
								"<p>Llamar al proveedor</p>",
								"<p>Llamar al proveedor el lunes</p>",
							]
						],
						"removed": [],
						"row_changed": [],
					}
				),
			}
		).insert(ignore_permissions=True)
		events = documentos.timeline("Note", note.name)["events"]
		edit = next(event for event in events if event["kind"] == "edit")
		label = frappe._(frappe.get_meta("Note").get_field("content").label)
		change = next(change for change in edit["changes"] if change["label"] == label)
		self.assertEqual(change["type"], "text")
		self.assertEqual(change["from"], "Llamar al proveedor")
		self.assertEqual(change["to"], "Llamar al proveedor el lunes")
		self.assertNotIn("@", edit["who"])
