"""Documentos engine (Shell Wave D): paths, module gates, lists, records, permissions."""

from unittest import TestCase, skipIf

from crm.documentos_routes import is_documentos_path, is_inventario_path

try:
	import frappe
	from frappe.tests import IntegrationTestCase

	from crm.api import documentos

	HAS_FRAPPE = True
except ImportError:  # bench-free run: only the path tests
	HAS_FRAPPE = False
	IntegrationTestCase = TestCase


class TestDocumentosPaths(TestCase):
	def test_hub_lists_records_and_floor(self):
		for path in (
			"/crm/documentos",
			"/crm/documentos/",
			"/crm/documentos/facturas?estado=vencidas",
			"/crm/documentos/facturas/ACC-SINV-2026-00001",
			"/crm/documentos/facturas/nuevo",
			"/crm/documentos/tipo/Journal%20Entry",
			"/crm/documentos/tipo/Journal%20Entry/ACC-JV-1",
		):
			with self.subTest(path=path):
				self.assertTrue(is_documentos_path(path))
		for path in ("/crm/inventario", "/crm/inventario/movimientos", "/crm/inventario/ajustes/MAT-RECO-1"):
			with self.subTest(path=path):
				self.assertTrue(is_inventario_path(path))

	def test_gate_rejects_other_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/documentosx",
			"/crm/documentos/a/b/c",
			"/crm/documentos/tipo/a/b/c",
			"//evil.invalid/crm/documentos",
			"https://evil.invalid/crm/documentos",
			"/crm/documentos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_documentos_path(path))
				self.assertFalse(is_inventario_path(path))


ROLE = "Documentos Test Reader"


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
@skipIf(not HAS_FRAPPE, "Frappe is not installed")
class TestDocumentosWords(TestCase):
	def test_a_yes_no_select_reads_si_or_no_never_n(self):
		df = frappe._dict(fieldtype="Select", options="N\nY")
		self.assertEqual(documentos._yes_no(df, "N"), frappe._("No"))
		self.assertEqual(documentos._yes_no(df, "Y"), frappe._("Yes"))
		self.assertIsNone(documentos._yes_no(frappe._dict(options="Draft\nPaid"), "Paid"))
		self.assertIsNone(documentos._yes_no(frappe._dict(options="No\nYes\nMaybe"), "No"))


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestDocumentosRandomNames(TestCase):
	def test_hash_uuid_and_random_rule_are_random_names_and_series_are_not(self):
		meta = frappe._dict
		self.assertTrue(documentos._random_name(meta(autoname="hash")))
		self.assertTrue(documentos._random_name(meta(autoname="UUID")))
		self.assertTrue(documentos._random_name(meta(autoname="", naming_rule="Random")))
		self.assertFalse(documentos._random_name(meta(autoname="naming_series:")))
		self.assertFalse(documentos._random_name(meta(autoname="field:title")))
		self.assertFalse(documentos._random_name(meta(autoname=None)))


class TestDocumentosAccess(IntegrationTestCase):
	"""A non-manager reads only what Frappe grants; blocked modules close their doctypes."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		self.email = "documentos-reader@example.com"
		if not frappe.db.exists("User", self.email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": self.email,
					"first_name": "Lectora",
					"last_name": "Documentos",
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", self.email)
		user.set("roles", [])
		user.append("roles", {"role": ROLE})
		user.set("block_modules", [])
		user.save(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _grant(self, doctype):
		from frappe.permissions import add_permission

		add_permission(doctype, ROLE, 0)
		frappe.clear_cache(doctype=doctype)

	def test_a_user_without_document_permissions_gets_both_modules_off_with_a_reason(self):
		frappe.set_user(self.email)
		for key in ("documentos", "inventario"):
			answer = documentos.get_capabilities(key)
			self.assertFalse(answer["enabled"], key)
			self.assertTrue(answer["reason"])
		# Every desk user reads Note («Desk User»); Email Account is the System Manager's only.
		with self.assertRaises(frappe.PermissionError):
			documentos.rows("Email Account")

	def test_reads_exactly_what_frappe_grants(self):
		self._grant("Note")
		frappe.set_user(self.email)
		self.assertTrue(documentos.readable("Note"))
		self.assertFalse(documentos.readable("User Permission"))
		self.assertFalse(documentos.readable("Has Role"))  # child table
		self.assertFalse(documentos.readable("System Settings"))  # single
		with self.assertRaises(frappe.PermissionError):
			documentos.rows("User Permission")

	def test_a_blocked_module_closes_its_doctypes(self):
		self._grant("Note")
		module = frappe.get_meta("Note").module
		user = frappe.get_doc("User", self.email)
		user.append("block_modules", {"module": module})
		user.save(ignore_permissions=True)
		frappe.set_user(self.email)
		self.assertFalse(documentos.readable("Note"))
		self.assertNotIn("Note", [row["doctype"] for row in documentos.doctypes("Note")])

	def test_floor_rows_record_and_activity_with_full_names(self):
		self._grant("Note")
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Pedido especial de Ana", "public": 1}).insert()
		frappe.get_doc(
			{
				"doctype": "Comment",
				"comment_type": "Comment",
				"reference_doctype": "Note",
				"reference_name": note.name,
				"content": "<p>Llamar el lunes</p>",
				"comment_email": self.email,
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Comment", {"reference_name": note.name}, "owner", self.email)
		frappe.set_user(self.email)
		page = documentos.rows("Note", search="especial de")
		names = [row["name"] for row in page["rows"]]
		self.assertIn(note.name, names)
		row = next(r for r in page["rows"] if r["name"] == note.name)
		self.assertEqual(row["title"], "Pedido especial de Ana")
		bundle = documentos.record("Note", note.name)
		self.assertEqual(bundle["header"]["title"], "Pedido especial de Ana")
		# Note names by hash: the header says so and the app bar leaves the name out.
		self.assertTrue(bundle["header"]["random_name"])
		self.assertIn("comment", bundle["actions"])
		comments = [e for e in bundle["activity"]["events"] if e["kind"] == "comment"]
		self.assertEqual(comments[0]["who"], "Lectora Documentos")
		self.assertEqual(comments[0]["text"].strip(), "Llamar el lunes")
		for event in bundle["activity"]["events"]:
			self.assertNotIn("@", event["who"])

	def test_a_reader_opens_a_record_without_a_message_for_each_action_it_lacks(self):
		# Asking which actions are allowed is a question, not a refusal: no «no tiene acceso» toast.
		self._grant("Note")
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Solo lectura", "public": 1}).insert()
		frappe.set_user(self.email)
		frappe.clear_messages()
		actions = documentos.record("Note", note.name)["actions"]
		self.assertFalse(actions["edit"]["allowed"])
		self.assertFalse(actions["delete"]["allowed"])
		self.assertEqual(frappe.local.message_log, [])

	def test_a_status_label_is_a_status_event_and_other_info_stays_info(self):
		self._grant("Note")
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Estado de Ana", "public": 1}).insert()
		note.add_comment("Label", "To Bill")
		note.add_comment("Info", "Pedí precios al proveedor")
		frappe.set_user(self.email)
		events = documentos.record("Note", note.name)["activity"]["events"]
		by_text = {e["text"]: e["kind"] for e in events if e.get("text")}
		self.assertEqual(by_text.get("To Bill"), "status")
		self.assertEqual(by_text.get("Pedí precios al proveedor"), "info")

	def test_counts_and_order_are_validated(self):
		frappe.set_user("Administrator")
		counts = documentos.counts("Note", {"todos": None, "publicas": [["public", "=", 1]]})
		self.assertEqual(set(counts), {"todos", "publicas"})
		self.assertGreaterEqual(counts["todos"], counts["publicas"])
		# An unknown or injected sort falls back to the default instead of reaching SQL.
		documentos.rows("Note", order_by="name; drop table x")
		documentos.rows("Note", order_by="nonexistent desc")

	# ── D1.2: editing, tools ──

	def test_a_draft_is_created_edited_and_deleted_with_the_workers_permissions(self):
		frappe.set_user(self.email)
		shape = documentos.form("Note")
		self.assertIn("title", [f["fieldname"] for f in shape["fields"]])
		for field in shape["fields"]:
			self.assertNotIn(field["fieldname"], ("name", "owner", "docstatus"))
		made = documentos.save("Note", values={"title": "Nota del turno D1", "public": 1})
		note = frappe.get_doc("Note", made["name"])
		self.assertEqual(note.owner, self.email)
		documentos.save(
			"Note",
			name=note.name,
			values={"title": "Nota del turno D1 (corregida)"},
			modified=str(note.modified),
		)
		self.assertEqual(frappe.db.get_value("Note", note.name, "title"), "Nota del turno D1 (corregida)")
		# Someone else saved in between: the worker is told, nothing is overwritten.
		with self.assertRaises(frappe.TimestampMismatchError):
			documentos.save("Note", name=note.name, values={"title": "x"}, modified="2000-01-01 00:00:00")
		# Standard fields never come from the sheet.
		documentos.save("Note", name=note.name, values={"owner": "Administrator", "docstatus": 1})
		self.assertEqual(frappe.db.get_value("Note", note.name, "owner"), self.email)
		self.assertEqual(frappe.db.get_value("Note", note.name, "docstatus"), 0)
		with self.assertRaises(frappe.PermissionError):
			documentos.act("Note", note.name, "submit")  # not submittable
		self.assertTrue(documentos.act("Note", note.name, "delete")["deleted"])
		self.assertFalse(frappe.db.exists("Note", note.name))

	def test_comment_and_assign_name_people_not_emails(self):
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Nota para asignar D1", "public": 1}).insert()
		frappe.set_user(self.email)
		activity = documentos.comment("Note", note.name, "Revisar <b>hoy</b>")
		comment = next(e for e in activity["events"] if e["kind"] == "comment")
		self.assertEqual(comment["who"], "Lectora Documentos")
		self.assertIn("Revisar <b>hoy</b>", comment["text"])  # escaped, shown as typed
		with self.assertRaises(frappe.ValidationError):
			documentos.comment("Note", note.name, "   ")
		people = documentos.people("Lectora")
		self.assertIn(self.email, [p["user"] for p in people])
		for person in people:
			self.assertNotIn("@", person["name"])
		frappe.set_user("Administrator")
		activity = documentos.assign("Note", note.name, add=[self.email])
		self.assertIn(self.email, [a["user"] for a in activity["assigned"]])
		activity = documentos.assign("Note", note.name, remove=[self.email])
		self.assertNotIn(self.email, [a["user"] for a in activity["assigned"]])

	def test_tags_are_cleaned_kept_once_and_suggested(self):
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Nota para etiquetar", "public": 1}).insert()
		activity = documentos.tag("Note", note.name, add=["Urgente", "urgente", "  Cliente,  VIP  "])
		self.assertEqual(activity["tags"], ["Urgente", "Cliente VIP"])
		self.assertTrue(activity["can"]["tag"])
		self.assertIn("Cliente VIP", documentos.tag_suggestions("Note", "vip"))
		activity = documentos.tag("Note", note.name, remove=["urgente"])
		self.assertEqual(activity["tags"], ["Cliente VIP"])

	def test_share_names_the_person_and_can_be_taken_back(self):
		frappe.set_user("Administrator")
		note = frappe.get_doc({"doctype": "Note", "title": "Nota para compartir", "public": 0}).insert()
		activity = documentos.share("Note", note.name, add=[self.email])
		shared = [s for s in activity["shared"] if s["user"] == self.email]
		self.assertEqual(shared[0]["name"], "Lectora Documentos")
		self.assertFalse(shared[0]["write"])
		self.assertTrue(frappe.has_permission("Note", "read", note.name, user=self.email))
		activity = documentos.share("Note", note.name, remove=[self.email])
		self.assertNotIn(self.email, [s["user"] for s in activity["shared"]])
		with self.assertRaises(frappe.ValidationError):
			documentos.share("Note", note.name, add=["nadie@example.com"])

	def test_only_allowlisted_mappers_run(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.PermissionError):
			documentos._maker("Quotation", "frappe.client.delete")
		with self.assertRaises(frappe.PermissionError):
			documentos._maker("Note", "sales_order")
		for (source, key), (path, target) in documentos.MAKERS.items():
			self.assertTrue(path.startswith("erpnext."), (source, key))
			self.assertTrue(target)

	def test_a_worker_saves_renames_and_deletes_their_own_list_views(self):
		from crm.api.views import get_views

		self._grant("Note")
		frappe.set_user(self.email)
		answer = documentos.save_view(
			"Note", "  Mis   notas ", {"q": "hoy", "f_public": "1", "evil": "x", "f_bad key": "y"}
		)
		self.assertFalse(answer["can_publish"])
		[view] = [v for v in answer["views"] if v["label"] == "Mis notas"]
		self.assertEqual(view["query"], {"q": "hoy", "f_public": "1"})
		self.assertTrue(view["mine"] and view["can_change"] and not view["public"])
		# The same name again updates that view instead of adding another.
		answer = documentos.save_view("Note", "Mis notas", {"q": "mañana"})
		mine = [v for v in answer["views"] if v["label"] == "Mis notas"]
		self.assertEqual([v["query"] for v in mine], [{"q": "mañana"}])
		# Only a manager saves for the whole team; the CRM's own pickers never list them.
		with self.assertRaises(frappe.PermissionError):
			documentos.save_view("Note", "Para todos", {"q": "x"}, public=1)
		with self.assertRaises(frappe.ValidationError):
			documentos.save_view("Note", "   ", {})
		self.assertNotIn(view["name"], [str(v.name) for v in get_views("Note")])
		# Someone else's private view is neither listed nor deletable.
		frappe.set_user("Administrator")
		self.assertNotIn(view["name"], [v["name"] for v in documentos.views("Note")["views"]])
		other = documentos.save_view("Note", "De la jefa", {"q": "x"})["views"]
		other_name = next(v["name"] for v in other if v["label"] == "De la jefa")
		frappe.set_user(self.email)
		with self.assertRaises(frappe.PermissionError):
			documentos.delete_view(other_name)
		answer = documentos.delete_view(view["name"])
		self.assertNotIn("Mis notas", [v["label"] for v in answer["views"]])
		with self.assertRaises(frappe.PermissionError):
			documentos.views("Email Account")


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestDocumentosERPNext(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if "erpnext" not in frappe.get_installed_apps():
			self.skipTest("ERPNext is not installed")

	def test_documentos_module_turns_on_for_the_owner_with_curated_doctypes(self):
		answer = documentos.get_capabilities("documentos")
		self.assertTrue(answer["enabled"])
		self.assertIn("Sales Invoice", answer["capabilities"]["doctypes"])
		self.assertTrue(documentos.get_capabilities("inventario")["enabled"])

	def test_boot_reports_both_modules(self):
		from crm.api import shell

		modules = shell.boot()["modules"]
		self.assertTrue(modules["documentos"]["enabled"])
		self.assertIn("Quotation", modules["documentos"]["capabilities"]["doctypes"])
		self.assertTrue(modules["inventario"]["enabled"])

	def test_customer_record_lists_its_connections_by_group(self):
		customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": "Cliente Conexiones D1",
				"customer_type": "Individual",
			}
		).insert(ignore_permissions=True)
		bundle = documentos.record("Customer", customer.name)
		doctypes = {item["doctype"] for group in bundle["connections"] for item in group["items"]}
		self.assertIn("Sales Invoice", doctypes)
		for group in bundle["connections"]:
			for item in group["items"]:
				self.assertTrue(item["filters"])
		self.assertTrue(bundle["actions"]["duplicate"]["allowed"] in (True, False))
		self.assertFalse(bundle["actions"]["submit"]["allowed"])  # not submittable

	def test_a_record_carries_how_to_reach_its_person(self):
		customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": "Cliente Alcance D4",
				"customer_type": "Individual",
			}
		).insert(ignore_permissions=True)
		customer.db_set({"mobile_no": "+52 667 100 2000", "email_id": "alcance@example.com"})
		self.assertEqual(
			documentos.record("Customer", customer.name)["header"]["reach"],
			{"phone": "+52 667 100 2000", "email": "alcance@example.com"},
		)
		quote = frappe.new_doc("Quotation")
		quote.update(
			{"quotation_to": "Customer", "party_name": customer.name, "contact_email": "compras@example.com"}
		)
		party = {"doctype": "Customer", "name": customer.name}
		self.assertEqual(
			documentos._reach(quote, party),
			{"phone": "+52 667 100 2000", "email": "compras@example.com"},
		)

	def test_hub_counts_only_readable_lists(self):
		out = documentos.hub("documentos")
		self.assertIn("Sales Invoice", out)
		self.assertIn("attention", out["Sales Invoice"])
		self.assertGreaterEqual(out["Sales Invoice"]["drafts"], 0)

	def test_palette_search_needs_two_characters(self):
		self.assertEqual(documentos.search("a"), [])
		self.assertIsInstance(documentos.search("Cliente"), list)

	def test_sales_invoice_form_draft_and_print_formats(self):
		shape = documentos.form("Sales Invoice", fields=["customer", "due_date", "debit_to"])
		self.assertEqual([f["fieldname"] for f in shape["fields"]][:2], ["customer", "due_date"])
		self.assertEqual(shape["fields"][0]["options"], "Customer")
		self.assertEqual(shape["items"]["fieldname"], "items")
		self.assertIn("qty", shape["items"]["fields"])
		blank = documentos.draft("Sales Invoice")
		self.assertEqual(blank["doc"]["doctype"], "Sales Invoice")
		self.assertEqual(blank["doc"]["docstatus"], 0)
		formats = documentos.print_formats("Sales Invoice")
		self.assertEqual(formats[-1]["name"], "Standard")
		self.assertEqual(sum(1 for f in formats if f["default"]) >= 1, True)

	def test_every_mapper_on_the_allowlist_is_whitelisted_in_erpnext(self):
		for path, _target in documentos.MAKERS.values():
			fn = frappe.get_attr(path)
			self.assertIn(fn, frappe.whitelisted, path)

	def test_rows_carry_an_items_summary_when_asked(self):
		page = documentos.rows("Sales Invoice", limit=5, fields=["_items", "customer"])
		for row in page["rows"]:
			self.assertIn("items", row)
			self.assertLessEqual(len(row["items"]["first"]), documentos.ITEMS_IN_ROW)
			self.assertGreaterEqual(row["items"]["count"], len(row["items"]["first"]))
		plain = documentos.rows("Sales Invoice", limit=2)
		for row in plain["rows"]:
			self.assertNotIn("items", row)

	def test_rows_filter_on_a_child_table(self):
		# «Vendedor» filters on the Sales Team child table (D2 profiles).
		page = documentos.rows(
			"Sales Order", filters=[["Sales Team", "sales_person", "=", "No existe D2"]], limit=2
		)
		self.assertEqual(page["rows"], [])
