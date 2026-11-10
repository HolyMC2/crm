# ci: shell-apis
"""The palette reaches what Desk reaches (Shell E7, DE9): reports, workspaces, pages, dashboards
and the forms only Desk opens, as Desk lists them for this user; Documentos recents only while
readable."""

from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe
	from unidecode import unidecode

	from crm.api import documentos, shell

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestDeskReach(TestCase):
	def setUp(self):
		self.previous = frappe.session.user
		frappe.set_user("Administrator")
		self.seller = self._user("e7-seller@example.test", ["Sales User"])
		self.nobody = self._user("e7-nobody@example.test", [])
		for user in ("Administrator", self.seller, self.nobody):
			shell.forget_desk_reach(user)

	def tearDown(self):
		frappe.set_user("Administrator")
		for user in ("Administrator", self.seller, self.nobody):
			shell.forget_desk_reach(user)
		frappe.set_user(self.previous)
		frappe.db.rollback()

	def _user(self, email, roles):
		if not frappe.db.exists("User", email):
			user = frappe.get_doc(
				{"doctype": "User", "email": email, "first_name": "E7", "send_welcome_email": 0}
			)
			user.flags.no_welcome_mail = True
			user.insert(ignore_permissions=True)
			user.add_roles(*roles)
		return email

	def test_the_stock_ledger_is_a_query_report_link_for_the_administrator(self):
		if not frappe.db.exists("Report", "Stock Ledger"):
			self.skipTest("ERPNext's Stock Ledger is not installed")
		rows = shell.reports("stock ledger")
		row = next(r for r in rows if r["name"] == "Stock Ledger")
		self.assertEqual(row["href"], "/app/query-report/Stock%20Ledger")
		self.assertEqual(row["ref_doctype"], "Stock Ledger Entry")
		self.assertTrue(row["title"] and row["ref_label"])
		self.assertEqual(shell.reports("zzz-no-such-report"), [])
		# Reports named by the term come before the ones that only report on its DocType.
		named = ["stock ledger" in (r["name"] + " " + unidecode(r["title"])).lower() for r in rows]
		self.assertEqual(named, sorted(named, reverse=True))
		self.assertTrue(named[0])

	def test_doctypes_lists_what_the_worker_reads_once_permissions_are_built(self):
		if not frappe.db.exists("DocType", "Warehouse"):
			self.skipTest("ERPNext's Warehouse is not installed")
		rows = documentos.doctypes("ware")
		self.assertIn("Warehouse", [r["doctype"] for r in rows])
		self.assertTrue(next(r for r in rows if r["doctype"] == "Warehouse")["create"])
		frappe.set_user(self.seller)
		frappe.local.user_perms = None
		self.assertIn("Customer", [r["doctype"] for r in documentos.doctypes("customer")])

	def test_the_palette_reach_is_what_the_three_searches_answer_in_one_read(self):
		def names(rows, key="name"):
			return {row[key] for row in rows}

		reach = shell.palette_reach()
		self.assertEqual(
			set(reach), {"reports", "workspaces", "lists", "desk_types", "pages", "dashboards", "tags"}
		)
		self.assertLessEqual(names(shell.reports("")), names(reach["reports"]))
		self.assertLessEqual(names(shell.workspaces("")), names(reach["workspaces"]))
		self.assertEqual(reach["lists"], documentos.listable_doctypes())
		self.assertLessEqual(names(documentos.doctypes("ware"), "doctype"), names(reach["lists"], "doctype"))
		self.assertTrue(reach["lists"])
		for row in reach["lists"]:
			self.assertEqual(set(row), {"doctype", "label", "module", "create", "report"})
		# Child, single and virtual types are never lists.
		listed = names(reach["lists"], "doctype")
		for doctype in frappe.get_all(
			"DocType", filters={"istable": 1}, pluck="name", limit=20
		) + frappe.get_all("DocType", filters={"issingle": 1}, pluck="name", limit=20):
			self.assertNotIn(doctype, listed)
		self.assertIn("ToDo", listed)

	def test_a_single_is_a_desk_form_the_palette_reaches(self):
		rows = {row["doctype"]: row for row in shell.palette_reach()["desk_types"]}
		# Every single the Administrator reads, as the awesomebar offers frappe.boot.single_types.
		singles = set(frappe.get_all("DocType", filters={"issingle": 1, "istable": 0}, pluck="name"))
		readable = set(frappe.get_user().get_can_read())
		self.assertEqual({name for name, row in rows.items() if row["kind"] == "single"}, singles & readable)
		row = rows["System Settings"]
		self.assertEqual(
			row,
			{
				"doctype": "System Settings",
				"label": frappe._("System Settings"),
				"module": frappe._("Core"),
				"kind": "single",
				"href": "/app/system-settings",
			},
		)
		# Sorted by label, and never a child table or a type the floor already lists.
		labels = [unidecode(row["label"].lower()) for row in rows.values()]
		self.assertEqual(labels, sorted(labels))
		listed = {row["doctype"] for row in shell.palette_reach()["lists"]}
		for name, row in rows.items():
			self.assertEqual(row["kind"] == "tree", name in listed, name)

	def test_a_tree_opens_its_tree_view_and_a_virtual_type_its_desk_list(self):
		rows = {row["doctype"]: row for row in shell.palette_reach()["desk_types"]}
		for name in frappe.get_all(
			"DocType", filters={"is_tree": 1, "issingle": 0, "istable": 0}, pluck="name", limit=5
		):
			self.assertEqual(rows[name]["kind"], "tree")
			self.assertRegex(rows[name]["href"], r"^/app/[a-z0-9-]+/view/tree$")
		self.assertEqual(rows["RQ Job"]["kind"], "list")
		self.assertEqual(rows["RQ Job"]["href"], "/app/rq-job")

	def test_desk_types_follow_the_worker(self):
		frappe.set_user(self.seller)
		frappe.local.user_perms = None
		reach = shell.palette_reach()
		readable = set(frappe.get_user().get_can_read())
		self.assertLessEqual({row["doctype"] for row in reach["desk_types"]}, readable)
		self.assertNotIn("System Settings", {row["doctype"] for row in reach["desk_types"]})
		frappe.set_user(self.nobody)
		frappe.local.user_perms = None
		self.assertEqual(shell.palette_reach()["desk_types"], [])

	def test_pages_are_the_desk_pages_the_worker_may_open(self):
		rows = {row["name"]: row for row in shell.palette_reach()["pages"]}
		self.assertEqual(
			rows["permission-manager"],
			{
				"name": "permission-manager",
				"title": "Role Permissions Manager",
				"label": frappe._("Role Permissions Manager"),
				"href": "/app/permission-manager",
			},
		)
		# Pages no row can open are left out: they need a route argument, or setup already ran.
		self.assertFalse(shell.DESK_PAGES_SKIPPED & set(rows))
		for row in rows.values():
			self.assertTrue(row["label"])
			self.assertRegex(row["href"], r"^/app/[^/\s]+$")
		# Desk's own set for each worker: a page with no role is everyone's, as in frappe.boot.page_info.
		from frappe.desk.desk_views import DeskViews

		for user in (self.seller, self.nobody):
			frappe.set_user(user)
			names = {row["name"] for row in shell.palette_reach()["pages"]}
			self.assertNotIn("permission-manager", names)
			allowed = DeskViews.get_allowed_pages()
			self.assertEqual(
				names,
				{
					name
					for name, info in allowed.items()
					if info.get("title") and name not in shell.DESK_PAGES_SKIPPED
				},
			)

	def test_dashboards_are_the_ones_desk_boots_with(self):
		from frappe.desk.desk_views import DeskViews

		rows = shell.palette_reach()["dashboards"]
		self.assertEqual(
			{row["name"] for row in rows}, {row["name"] for row in DeskViews.get_allowed_dashboards()}
		)
		for row in rows:
			self.assertEqual(set(row), {"name", "label", "href"})
			self.assertRegex(row["href"], r"^/app/dashboard-view/[^/\s]+$")
		frappe.set_user(self.nobody)
		self.assertEqual(shell.palette_reach()["dashboards"], [])

	def test_a_blocked_module_hides_its_forms_and_pages(self):
		frappe.set_user("Administrator")
		user = frappe.get_doc("User", self.seller)
		user.add_roles("System Manager")
		frappe.set_user(self.seller)
		frappe.local.user_perms = None
		shell.forget_desk_reach(self.seller)
		reach = shell.palette_reach()
		self.assertIn("System Settings", {row["doctype"] for row in reach["desk_types"]})
		self.assertIn("permission-manager", {row["name"] for row in reach["pages"]})
		frappe.set_user("Administrator")
		user.reload()
		user.append("block_modules", {"module": "Core"})
		user.save(ignore_permissions=True)
		frappe.clear_cache(user=self.seller)
		frappe.set_user(self.seller)
		frappe.local.user_perms = None
		shell.forget_desk_reach(self.seller)
		reach = shell.palette_reach()
		self.assertNotIn("System Settings", {row["doctype"] for row in reach["desk_types"]})
		self.assertNotIn("permission-manager", {row["name"] for row in reach["pages"]})

	def _todo(self, description):
		doc = frappe.get_doc({"doctype": "ToDo", "description": description})
		doc.insert(ignore_permissions=True)
		return doc

	def test_a_tag_reaches_the_documents_that_carry_it(self):
		from frappe.desk.doctype.tag.tag import add_tag

		todo = self._todo('<div class="ql-editor read-mode"><p>E7 llamar   al <b>proveedor</b></p></div>')
		add_tag("e7-urgente", "ToDo", todo.name)
		shell.forget_desk_reach("Administrator")
		self.assertIn("e7-urgente", shell.palette_reach()["tags"])
		rows = shell.tagged("#e7-urgente")
		self.assertEqual([(row["doctype"], row["name"]) for row in rows], [("ToDo", todo.name)])
		self.assertEqual(rows[0]["label"], frappe._("ToDo"))
		# A rich-text description reads as one plain line.
		self.assertEqual(rows[0]["title"], "E7 llamar al proveedor")
		self.assertNotIn("fields", rows[0])
		self.assertEqual(shell.tagged("e7-no-such-tag"), [])
		self.assertEqual(shell.tagged(""), [])
		# A worker who cannot read the document does not get it through its tag.
		frappe.set_user(self.nobody)
		frappe.local.user_perms = None
		self.assertEqual(shell.tagged("e7-urgente"), [])
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			shell.tagged("e7-urgente")

	def test_the_search_term_is_every_word_as_a_required_prefix(self):
		# Frappe's Match wraps the text as «+text*»: this reads «+pantalla* +samsung*».
		self.assertEqual(shell._fulltext_term("pantalla samsung"), "pantalla* +samsung")
		self.assertEqual(shell._fulltext_term("  Karla  "), "Karla")
		# Operators never pass, and words under three letters are below the index's token size.
		self.assertEqual(shell._fulltext_term('+juan -"perez" (a5) ~x*'), "juan* +perez")
		self.assertEqual(shell._fulltext_term("a5 de"), "")
		self.assertEqual(shell._fulltext_term(None), "")

	def test_records_of_other_types_are_searched_and_read_again_under_the_worker(self):
		todo = self._todo("E7 revisar la vitrina")
		listed = ["ToDo", "Customer", "Sales Invoice", "E7 No Such Type"]
		hits = [("ToDo", todo.name), ("ToDo", todo.name), ("ToDo", "e7-gone"), ("Customer", "E7 X")]
		with (
			patch(
				"frappe.desk.doctype.global_search_settings.global_search_settings.get_doctypes_for_global_search",
				return_value=listed,
			),
			patch.object(shell, "_index_hits", return_value=hits) as index,
		):
			rows = shell.search_records("revisar vitrina")
			# The types another provider searches are never asked for, nor one that is not readable.
			term, asked = index.call_args.args
			self.assertEqual(term, "revisar* +vitrina")
			self.assertEqual(asked, ["ToDo"])
			# Once each, and only what exists.
			self.assertEqual([(row["doctype"], row["name"]) for row in rows], [("ToDo", todo.name)])
			self.assertEqual(rows[0]["label"], frappe._("ToDo"))
			# Nothing to search for asks the index nothing.
			index.reset_mock()
			self.assertEqual(shell.search_records("a5"), [])
			index.assert_not_called()
			frappe.set_user(self.nobody)
			frappe.local.user_perms = None
			self.assertEqual(shell.search_records("revisar vitrina"), [])
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			shell.search_records("revisar")

	def test_the_index_query_runs(self):
		# Full-text rows only show once committed, so this checks the query itself.
		hits = shell._index_hits(shell._fulltext_term("zzz-e7-nothing"), ["ToDo"])
		self.assertEqual(hits, [])

	def test_the_palette_reach_follows_the_worker(self):
		if not frappe.db.exists("DocType", "Customer"):
			self.skipTest("ERPNext's Customer is not installed")
		frappe.set_user(self.seller)
		frappe.local.user_perms = None
		listed = {row["doctype"] for row in shell.palette_reach()["lists"]}
		self.assertIn("Customer", listed)
		self.assertNotIn("DocType", listed)
		frappe.set_user(self.nobody)
		frappe.local.user_perms = None
		self.assertEqual(shell.palette_reach()["reports"], [])
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			shell.palette_reach()

	def test_a_report_builder_report_opens_as_a_view_of_its_list(self):
		frappe.get_doc(
			{
				"doctype": "Report",
				"report_name": "E7 Facturas por cliente",
				"ref_doctype": "Sales Invoice" if frappe.db.exists("DocType", "Sales Invoice") else "ToDo",
				"report_type": "Report Builder",
				"is_standard": "No",
			}
		).insert(ignore_permissions=True)
		shell.forget_desk_reach("Administrator")
		row = next(r for r in shell.reports("e7 facturas") if r["name"] == "E7 Facturas por cliente")
		self.assertRegex(
			row["href"], r"^/app/(sales-invoice|todo)/view/report/E7%20Facturas%20por%20cliente$"
		)

	def test_a_user_without_roles_sees_no_report_rows(self):
		frappe.set_user(self.nobody)
		self.assertEqual(shell.reports(""), [])

	def test_a_seller_does_not_get_the_stock_ledger_and_the_term_narrows(self):
		frappe.set_user(self.seller)
		names = [r["name"] for r in shell.reports("")]
		self.assertNotIn("Stock Ledger", names)
		for row in shell.reports("ledger"):
			self.assertTrue(
				any("ledger" in str(v).lower() for v in (row["title"], row["name"], row["ref_label"])),
				row,
			)

	def test_workspaces_are_desk_links_of_the_pages_desk_shows(self):
		rows = shell.workspaces("")
		self.assertTrue(rows)
		self.assertLessEqual(len(rows), shell.DESK_REACH_LIMIT["workspaces"])
		self.assertEqual(len({r["name"] for r in rows}), len(rows))
		for row in rows:
			self.assertRegex(row["href"], r"^/app/(private/)?[^/\s]+$")
			self.assertTrue(row["label"])
		one = rows[0]
		self.assertIn(one["name"], [r["name"] for r in shell.workspaces(one["label"][:4])])
		self.assertEqual(shell.workspaces("zzz-no-such-workspace"), [])

	def test_a_blocked_module_hides_its_workspace(self):
		frappe.set_user(self.seller)
		rows = shell.workspaces("")
		public = next((r for r in rows if r["public"]), None)
		if not public:
			self.skipTest("the seller sees no public workspace to block")
		module = frappe.db.get_value("Workspace", public["name"], "module")
		if not module:
			self.skipTest("the workspace has no module")
		frappe.set_user("Administrator")
		user = frappe.get_doc("User", self.seller)
		user.append("block_modules", {"module": module})
		user.save(ignore_permissions=True)
		frappe.clear_cache(user=self.seller)
		frappe.set_user(self.seller)
		self.assertNotIn(public["name"], [r["name"] for r in shell.workspaces("")])

	def test_resolve_documents_keeps_only_readable_records(self):
		if not frappe.db.exists("DocType", "Warehouse"):
			self.skipTest("ERPNext is not installed")
		name = frappe.db.get_value("Warehouse", {}, "name")
		if not name:
			self.skipTest("no Warehouse on this site")
		records = [{"doctype": "Warehouse", "name": name}, {"doctype": "Warehouse", "name": "E7-no-such"}]
		rows = shell.resolve_documents(records)
		self.assertEqual([(r["doctype"], r["name"]) for r in rows], [("Warehouse", name)])
		self.assertIn("title", rows[0])
		frappe.set_user(self.nobody)
		self.assertEqual(shell.resolve_documents(records), [])
