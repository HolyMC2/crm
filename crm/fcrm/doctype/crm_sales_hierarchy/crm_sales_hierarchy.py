# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.nestedset import NestedSet, update_nsm

# Rank rules mirrored from the client (frontend/src/components/Settings/Hierarchy):
# Hierarchy.vue ROLE_RANK / ALLOWED_ROLES and useDragDrop.js canDrop. The Vue tree
# refuses to place a lower rank number under a higher one, but nothing stopped a
# direct REST/API insert from inverting them — which would let a Sales User's
# subtree swallow their own manager in org_hierarchy._team_mem_query. Enforced here
# so both paths agree.
ROLE_RANK = {"Sales Manager": 0, "Sales User": 1}


def role_rank(user: str) -> int | None:
	"""Hierarchy rank of `user`, or None when they hold neither sales role.
	Holding both roles ranks as the stronger one (Sales Manager)."""
	roles = frappe.get_roles(user)
	ranks = [rank for role, rank in ROLE_RANK.items() if role in roles]
	return min(ranks) if ranks else None


class CRMSalesHierarchy(NestedSet):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		enabled: DF.Check
		full_name: DF.Data | None
		is_group: DF.Check
		lft: DF.Int
		old_parent: DF.Link | None
		reports_to: DF.Link | None
		rgt: DF.Int
		user: DF.Link | None
	# end: auto-generated types

	nsm_parent_field = "reports_to"

	def on_update(self):
		update_nsm(self)
		frappe.cache.delete_value("crm_sales_hierarchy_subtree")

	def validate(self):
		if self.user:
			# Ensure the same user is not mapped to two different nodes
			existing = frappe.db.get_value(
				"CRM Sales Hierarchy",
				{"user": self.user, "name": ["!=", self.name]},
				"name",
			)
			if existing:
				frappe.throw(
					frappe._("User {0} is already mapped to hierarchy node {1}.").format(self.user, existing)
				)

			self.validate_role()

		self.validate_rank_against_parent()

		# A node with reports_to becomes a child so its parent must be a group
		if self.reports_to and not frappe.db.get_value("CRM Sales Hierarchy", self.reports_to, "is_group"):
			frappe.db.set_value("CRM Sales Hierarchy", self.reports_to, "is_group", 1)

	def validate_role(self):
		"""Only Sales Manager / Sales User may occupy a node. Administrator never can."""
		if self.user == "Administrator":
			frappe.throw(
				frappe._("El usuario Administrator no puede formar parte de la jerarquía de ventas."),
				frappe.ValidationError,
			)

		if role_rank(self.user) is None:
			frappe.throw(
				frappe._(
					"El usuario {0} debe tener el rol Sales Manager o Sales User "
					"para formar parte de la jerarquía de ventas."
				).format(self.user),
				frappe.ValidationError,
			)

	def validate_rank_against_parent(self):
		"""A node may not outrank the node it reports to — a Sales Manager can never
		hang under a Sales User. Group nodes with no linked user carry no rank and
		are transparent to this check."""
		if not self.user or not self.reports_to:
			return

		parent_user = frappe.db.get_value("CRM Sales Hierarchy", self.reports_to, "user")
		if not parent_user:
			return

		own_rank = role_rank(self.user)
		parent_rank = role_rank(parent_user)
		if own_rank is None or parent_rank is None:
			return

		if own_rank < parent_rank:
			frappe.throw(
				frappe._(
					"{0} no puede reportar a {1}: un Sales Manager no puede depender de un Sales User."
				).format(self.user, parent_user),
				frappe.ValidationError,
			)

	def on_trash(self):
		frappe.cache.delete_value("crm_sales_hierarchy_subtree")


def on_doctype_update():
	frappe.db.add_index("CRM Sales Hierarchy", ["lft", "rgt"])
	frappe.db.add_index("CRM Sales Hierarchy", ["user"])
