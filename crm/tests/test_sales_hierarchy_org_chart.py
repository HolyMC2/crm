# ci: shell-apis
"""The team tree is the organization chart (Employee «Reports To»).

Needs ERPNext's Employee, so it runs in the Shell APIs job; elsewhere it skips.
Users, employees and records are real and rolled back.
"""

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import sales_hierarchy as api
from crm.permissions import org_hierarchy as H
from crm.permissions.test_org_hierarchy import make_deal, make_lead
from crm.pipeline.services import reminders


class TestSalesHierarchyOrgChart(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not H.employee_tree_available():
			self.skipTest("Employee is not installed on this site")
		frappe.db.savepoint("org_chart_tree")
		self.suffix = frappe.generate_hash(length=6)
		self.company = frappe.get_all("Company", limit=1, pluck="name")
		if not self.company:
			self.skipTest("No company on this site")
		self.company = self.company[0]
		frappe.db.set_single_value("FCRM Settings", "sales_hierarchy_own_tree", 0)
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 1)
		# owner (System Manager)
		# └── encargado (Sales Manager)
		#     ├── cajera (Sales User)
		#     └── tecnico (no sales role, no user of interest)
		#         └── aprendiz (Sales User)
		# otro_encargado (Sales Manager), another team
		self.owner = self.user("owner", ["System Manager", "Sales Manager"])
		self.encargado = self.user("encargado", ["Sales Manager", "Sales User"])
		self.cajera = self.user("cajera", ["Sales User"])
		self.tecnico = self.user("tecnico", ["Stock User"])
		self.aprendiz = self.user("aprendiz", ["Sales User"])
		self.otro = self.user("otro", ["Sales Manager", "Sales User"])
		top = self.employee(self.owner)
		mid = self.employee(self.encargado, reports_to=top)
		self.employee(self.cajera, reports_to=mid)
		tec = self.employee(self.tecnico, reports_to=mid)
		self.aprendiz_employee = self.employee(self.aprendiz, reports_to=tec)
		self.employee(self.otro, reports_to=top)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point="org_chart_tree")

	# ── helpers ──

	def user(self, name, roles):
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": f"{name}-{self.suffix}@org-chart.test",
				"first_name": name,
				"send_welcome_email": 0,
				"roles": [{"role": r} for r in roles if frappe.db.exists("Role", r)],
			}
		)
		doc.flags.no_welcome_mail = True
		return doc.insert(ignore_permissions=True).name

	def employee(self, user=None, reports_to=None, first=None):
		return (
			frappe.get_doc(
				{
					"doctype": "Employee",
					"first_name": first or (user or "nobody").split("-")[0],
					"last_name": self.suffix,
					"gender": frappe.get_all("Gender", limit=1, pluck="name")[0],
					"date_of_birth": "1990-01-01",
					"date_of_joining": "2026-01-01",
					"company": self.company,
					"status": "Active",
					"user_id": user,
					"reports_to": reports_to,
					"create_user_permission": 0,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def sees(self, record, user):
		check = H.has_lead_permission if record.doctype == "CRM Lead" else H.has_deal_permission
		return check(record, "read", user)

	# ── the tree ──

	def test_the_org_chart_is_the_default_tree(self):
		self.assertTrue(H.follows_org_chart())
		self.assertTrue(H._in_hierarchy(self.cajera))
		self.assertEqual(
			set(H.team_users(self.encargado)), {self.encargado, self.cajera, self.tecnico, self.aprendiz}
		)

	def test_a_boss_sees_the_whole_team_and_a_peer_does_not(self):
		lead = make_lead(self.aprendiz)
		deal = make_deal(self.cajera)
		self.assertTrue(self.sees(lead, self.encargado))  # under the técnico, still their team
		self.assertTrue(self.sees(deal, self.encargado))
		self.assertFalse(self.sees(lead, self.cajera))
		self.assertFalse(self.sees(deal, self.otro))  # another team's Sales Manager

	def test_someone_who_left_stays_with_their_boss(self):
		lead = make_lead(self.aprendiz)
		frappe.db.set_value("Employee", self.aprendiz_employee, "status", "Left")
		self.assertTrue(self.sees(lead, self.encargado))

	def test_a_manager_in_the_tree_still_sees_what_nobody_owns(self):
		lead = make_lead(None)
		self.assertTrue(self.sees(lead, self.otro))
		self.assertFalse(self.sees(lead, self.cajera))

	def test_a_separate_sales_tree_leaves_the_org_chart_alone(self):
		frappe.db.set_single_value("FCRM Settings", "sales_hierarchy_own_tree", 1)
		self.assertFalse(H.follows_org_chart())
		self.assertFalse(H._in_hierarchy(self.cajera))  # the sales tree is empty
		self.assertTrue(self.sees(make_lead(self.cajera), self.otro))  # outside a tree: sees all

	def test_off_a_sales_manager_sees_everything_again(self):
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		self.assertTrue(self.sees(make_lead(self.cajera), self.otro))

	def test_the_dashboard_counts_the_whole_team(self):
		from crm.api.dashboard import _scoped_users

		frappe.set_user(self.encargado)
		self.assertEqual(set(_scoped_users(None)), {self.encargado, self.cajera, self.tecnico, self.aprendiz})

	# ── the overdue step's boss ──

	def test_the_boss_is_the_nearest_one_above_who_can_open_deals(self):
		self.assertEqual(H.manager_of(self.cajera), self.encargado)
		# The técnico has no sales role: the aprendiz's step goes past them.
		self.assertEqual(H.manager_of(self.aprendiz), self.encargado)
		self.assertEqual(reminders.managers_of(self.aprendiz), [self.encargado])
		self.assertEqual(H.manager_of(self.owner), None)
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		self.assertEqual(reminders.managers_of(self.cajera), [])

	# ── words for the organigrama ──

	def test_scope_in_the_organigrama_words(self):
		self.assertEqual(H.scope_of(self.owner), {"scope": "all"})
		mine = H.scope_of(self.encargado)
		self.assertEqual((mine["scope"], mine["team"], mine["unowned"]), ("team", 3, True))
		self.assertEqual(H.scope_of(self.cajera)["team"], 0)
		self.assertIsNone(H.scope_of(self.tecnico))  # cannot read prospects
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		self.assertEqual(H.scope_of(self.encargado), {"scope": "all"})
		self.assertEqual(H.scope_of(self.cajera)["scope"], "own")

	def test_people_scope_only_describes_records_the_reader_can_open(self):
		answer = api.people_scope([self.encargado, self.cajera, "nobody@org-chart.test"])
		self.assertEqual(set(answer["people"]), {self.encargado, self.cajera})
		self.assertTrue(answer["state"]["follows_org_chart"])
		reader = self.user("reader", ["Sales User"])  # no Employee read
		frappe.set_user(reader)
		self.assertEqual(api.people_scope([self.encargado])["people"], {})

	# ── who changes it ──

	def test_only_an_administrator_turns_it_on_or_off(self):
		frappe.set_user(self.otro)
		with self.assertRaises(frappe.PermissionError):
			api.follow_org_chart(0)
		settings = frappe.get_single("FCRM Settings")
		settings.enable_sales_hierarchy = 0
		with self.assertRaises(frappe.PermissionError):
			settings.save()
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", "sales_hierarchy_own_tree", 1)
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		answer = api.follow_org_chart(1)
		self.assertTrue(answer["state"]["enabled"])
		self.assertTrue(answer["state"]["follows_org_chart"])
		self.assertFalse(api.follow_org_chart(0)["state"]["enabled"])

	def test_the_patch_keeps_a_tenant_on_the_tree_it_set_up(self):
		from crm.patches.v1_0 import sales_hierarchy_keeps_its_tree

		sales_hierarchy_keeps_its_tree.execute()
		self.assertEqual(frappe.db.get_single_value("FCRM Settings", "sales_hierarchy_own_tree"), 1)
		frappe.db.set_single_value("FCRM Settings", "sales_hierarchy_own_tree", 0)
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		sales_hierarchy_keeps_its_tree.execute()
		self.assertEqual(frappe.db.get_single_value("FCRM Settings", "sales_hierarchy_own_tree"), 0)
