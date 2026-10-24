# ci: shell-apis
"""The palette reaches what Desk reaches (Shell E7, DE9): reports and workspaces as Desk lists
them for this user, Documentos recents only while readable."""

from unittest import TestCase, skipIf

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
