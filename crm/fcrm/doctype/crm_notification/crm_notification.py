# Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CRMNotification(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		comment: DF.Link | None
		from_user: DF.Link | None
		message: DF.HTMLEditor | None
		notification_text: DF.Text | None
		notification_type_doc: DF.DynamicLink | None
		notification_type_doctype: DF.Link | None
		read: DF.Check
		reference_doctype: DF.Link | None
		reference_name: DF.DynamicLink | None
		to_user: DF.Link
		type: DF.Literal["Mention", "Task", "Assignment", "WhatsApp"]
	# end: auto-generated types

	def validate(self):
		if self.type == "WhatsApp":
			from crm.permissions.whatsapp_read import ReadScope, notification_text

			scope = ReadScope()
			if not scope.notification(self, self.to_user):
				frappe.throw(_("Not permitted to notify this recipient."), frappe.PermissionError)
			# Canonical context, never a copied transcript or caller-provided HTML.
			self.message = ""
			self.notification_text = notification_text(scope.load_message(self.notification_type_doc))

	def on_update(self):
		if self.to_user:
			from functools import partial

			frappe.db.after_commit.add(partial(publish_notification, self.name))


def publish_notification(name):
	from pypika.terms import Function

	from crm.permissions.whatsapp_read import NOTIFICATION_FIELDS, ReadScope

	# Inspect legacy copies without loading their body before recipient checks.
	# Frappe's native SELECT parser accepts typed terms, not SQL function strings.
	notification = frappe.qb.DocType("CRM Notification")
	fields = [*NOTIFICATION_FIELDS, Function("LENGTH", notification.message).as_("copied_body_length")]
	row = frappe.db.get_value("CRM Notification", name, fields, as_dict=True)
	if row and row.to_user and ReadScope().notification(row, row.to_user):
		frappe.publish_realtime("crm_notification", user=row.to_user, room="user:" + row.to_user)


def get_permission_query_conditions(user=None):
	from crm.permissions.whatsapp_read import notification_query
	from crm.utils.query import subquery_sql

	user = user or frappe.session.user
	manager = user == "Administrator" or "System Manager" in frappe.get_roles(user)
	base = "1=1" if manager else f"`tabCRM Notification`.`to_user` = {frappe.db.escape(user)}"
	return f"({base}) AND `tabCRM Notification`.`name` IN ({subquery_sql(notification_query(user))})"


def has_permission(doc, ptype, user):
	from crm.permissions.whatsapp_read import ReadScope

	user = user or frappe.session.user
	if not ReadScope().notification(doc, user):
		return False
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	if ptype == "create" or not doc.to_user:
		return True
	return doc.to_user == user


def filter_shared_documents(user, doctype, names):
	"""Sharing cannot resurrect a revoked WhatsApp transcript/context copy."""
	from crm.permissions.whatsapp_read import BATCH_SIZE, notification_query

	query = notification_query(user)
	notification = frappe.qb.DocType("CRM Notification")
	allowed = []
	for offset in range(0, len(names), BATCH_SIZE):
		allowed.extend(
			query.where(notification.name.isin(names[offset : offset + BATCH_SIZE])).run(pluck=True)
		)
	return allowed


def notify_user(notification):
	"""
	Notify the assigned user
	"""
	notification = frappe._dict(notification)
	if notification.owner == notification.assigned_to:
		return

	values = frappe._dict(
		doctype="CRM Notification",
		from_user=notification.owner,
		to_user=notification.assigned_to,
		type=notification.notification_type,
		message=notification.message,
		notification_text=notification.notification_text,
		notification_type_doctype=notification.reference_doctype,
		notification_type_doc=notification.reference_docname,
		reference_doctype=notification.redirect_to_doctype,
		reference_name=notification.redirect_to_docname,
	)

	if values.type == "WhatsApp":
		from crm.permissions.whatsapp_read import ReadScope, notification_text

		scope = ReadScope()
		if not scope.notification(values, values.to_user):
			return
		values.message = ""
		values.notification_text = notification_text(scope.load_message(values.notification_type_doc))

	# The one-dict overload removes doctype before building column filters.
	if frappe.db.exists(values):
		return
	frappe.get_doc(values).insert(ignore_permissions=True)
