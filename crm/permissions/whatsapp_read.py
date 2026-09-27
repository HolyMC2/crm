"""Current, explicit-recipient scope for legacy WhatsApp reads and notifications.

No account defaults, phone suffix matching, sends or conversation creation. Caches
live only for one read/dispatch; denied records are never fetched for their body.
"""

import re

import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.permissions import has_permission as has_document_permission

BATCH_SIZE = 200
MESSAGE_FIELDS = [
	"name",
	"type",
	"from",
	"to",
	"whatsapp_account",
	"reference_doctype",
	"reference_name",
	"owner",
]
NOTIFICATION_FIELDS = [
	"name",
	"type",
	"to_user",
	"notification_type_doctype",
	"notification_type_doc",
	"reference_doctype",
	"reference_name",
]
IDENTITY = re.compile(r"[0-9]{1,40}\Z", re.ASCII)


def available():
	return "frappe_whatsapp" in frappe.get_installed_apps() and frappe.db.has_column(
		"WhatsApp Message", "whatsapp_account"
	)


def rows(doctype, filters, fields):
	"""Keyset batches, without a result cap or permission-bypassing body reads."""
	last = ""
	while True:
		page_filters = [*[list(pair) for pair in filters], ["name", ">", last]]
		# Internal identity metadata must remain exact even when its display field
		# is masked; callers authorize before fetching/projecting any content.
		page = frappe.db.get_values(
			doctype,
			filters=page_filters,
			fieldname=fields,
			as_dict=True,
			order_by="name asc",
			limit=BATCH_SIZE,
		)
		if not page:
			return
		yield from page
		last = page[-1].name


def readable_field(doctype, fieldname, user=None, *, parenttype=None):
	"""Native field levels and masks, evaluated for the recipient, not sender."""
	user = user or frappe.session.user
	meta = frappe.get_meta(doctype)
	df = meta.get_field(fieldname)
	if not df or df.fieldtype == "Password":
		return False
	if user == "Administrator":
		return True
	if df.fieldtype in {"Table", "Table MultiSelect"}:
		# Native get_permitted_fields excludes Table columns. Apply the same
		# read-level + native level-zero share fallback to this parent edge.
		levels = set(meta.get_permlevel_access("read", user=user))
		if not meta.get_permissions() or frappe.share.get_shared(doctype, user, rights=["read"], limit=1):
			levels.add(0)
		if (df.permlevel or 0) not in levels:
			return False
	elif fieldname not in get_permitted_fields(
		doctype, parenttype=parenttype, user=user, permission_type="read"
	):
		return False
	return not df.get("mask") or (df.permlevel or 0) in meta.get_permlevel_access(
		"mask", parenttype, user=user
	)


def readable_reference_fields(user=None):
	return all(
		readable_field("WhatsApp Message", field, user) for field in ("reference_doctype", "reference_name")
	)


class ReadScope:
	def __init__(self):
		self.accounts = {}
		self.references = {}
		self.grants = {}
		self.messages = {}
		self.records = {}
		self.contacts = {}

	def reference(self, doctype, name, user):
		from crm.api.conversations import REFERENCES

		key = (doctype, name, user)
		if key not in self.references:
			if doctype not in REFERENCES or not name:
				self.references[key] = False
			else:
				self.references[key] = self._permitted(lambda: self._reference(doctype, name, user))
		return self.references[key]

	@staticmethod
	def _reference(doctype, name, user):
		if not has_document_permission(doctype, "read", doc=name, user=user, print_logs=False):
			return False
		return bool(
			frappe.get_list(doctype, user=user, fields=["name"], filters={"name": name}, limit_page_length=1)
		)

	@staticmethod
	def _permitted(check):
		# Denial is an empty projection; infrastructure/configuration failures are not.
		before = len(frappe.local.message_log or [])
		try:
			return bool(check())
		except (frappe.PermissionError, frappe.DoesNotExistError):
			del frappe.local.message_log[before:]
			return False

	def message(self, row, user=None):
		user = user or frappe.session.user
		if not row or not available():
			return False
		peer = row.get("from") if row.get("type") == "Incoming" else row.get("to")
		account_name = row.get("whatsapp_account")
		if (
			row.get("type") not in {"Incoming", "Outgoing"}
			or not isinstance(peer, str)
			or not IDENTITY.fullmatch(peer)
		):
			return False
		if not account_name:
			return False
		if account_name not in self.accounts:
			self.accounts[account_name] = frappe.db.get_value("WhatsApp Account", account_name, "phone_id")
		account_id = self.accounts[account_name]
		if not isinstance(account_id, str) or not IDENTITY.fullmatch(account_id):
			return False
		key = (user, account_name, account_id, peer, row.get("reference_doctype"), row.get("reference_name"))
		if key not in self.grants:
			self.grants[key] = self._permitted(
				lambda: self._message(row, user, account_name, account_id, peer)
			)
		return self.grants[key]

	def _message(self, row, user, account_name, account_id, peer):
		from crm.api.conversations import _authorize

		probe = frappe._dict(
			provider="WhatsApp",
			account_id=account_id,
			peer_id=peer,
			reference_doctype=row.get("reference_doctype"),
			reference_name=row.get("reference_name"),
		)
		_, account = _authorize(probe, user=user, write=False)
		if account.name != account_name:
			return False
		if row.get("reference_doctype") or row.get("reference_name"):
			return self.reference(row.get("reference_doctype"), row.get("reference_name"), user)
		return True

	def load_message(self, name):
		if name not in self.messages:
			self.messages[name] = (
				frappe.db.get_value("WhatsApp Message", name, MESSAGE_FIELDS, as_dict=True)
				if available() and name
				else None
			)
		return self.messages[name]

	def notification(self, row, user=None):
		if row.get("type") != "WhatsApp":
			return True
		if not available():
			return False
		if row.get("notification_type_doctype") != "WhatsApp Message" or not readable_reference_fields(user):
			return False
		if (row.get("message") or row.get("copied_body_length")) and not readable_field(
			"WhatsApp Message", "message", user
		):
			return False
		message = self.load_message(row.get("notification_type_doc"))
		return bool(
			message
			and message.reference_doctype
			and message.reference_name
			and (row.get("reference_doctype"), row.get("reference_name"))
			== (message.reference_doctype, message.reference_name)
			and self.message(message, user)
		)


def require_reference(doctype, name, user=None):
	if not ReadScope().reference(doctype, name, user or frappe.session.user):
		frappe.throw(_("Not permitted to read this conversation reference."), frappe.PermissionError)


def publish_message(name):
	"""After-commit callback: re-read binding and recipient grants before dispatch."""
	scope = ReadScope()
	message = scope.load_message(name)
	if not message:
		return
	payload = {
		"reference_doctype": message.reference_doctype,
		"reference_name": message.reference_name,
		"phone": message.get("from") if message.type == "Incoming" else message.get("to"),
	}
	for user in rows("User", [["enabled", "=", 1], ["name", "!=", "Guest"]], ["name"]):
		peer_field = "from" if message.type == "Incoming" else "to"
		if scope.message(message, user.name) and all(
			readable_field("WhatsApp Message", field, user.name)
			for field in (peer_field, "reference_doctype", "reference_name")
		):
			# Explicit room prevents an inherited RQ task_id from overriding user.
			frappe.publish_realtime("whatsapp_message", payload, user=user.name, room="user:" + user.name)


def notification_text(message):
	kind = message.reference_doctype.removeprefix("CRM ").lower()
	return _("You received a WhatsApp message in {0}: {1}").format(
		frappe.utils.escape_html(kind), frappe.utils.escape_html(message.reference_name)
	)


def can_read_message(message_name, user=None):
	"""Server-only ID boundary for delivery workers; no caller-supplied authority."""
	scope = ReadScope()
	return scope.message(scope.load_message(message_name), user)


def message_query(user=None):
	"""Native list/count scope; query work is bounded by accounts + parent types."""
	from frappe.query_builder import Case
	from frappe.query_builder.functions import Coalesce
	from pypika.terms import Criterion, Function

	from crm.api import conversations as control
	from crm.conversation_scope import customer_peer_condition

	user = user or frappe.session.user
	message = frappe.qb.DocType("WhatsApp Message")
	query = frappe.qb.from_(message).select(message.name)
	if not available():
		return query.where(message.name.isnull())
	try:
		roles = control._roles(user)
	except frappe.PermissionError:
		return query.where(message.name.isnull())
	if not roles.intersection(control._channel_roles("WhatsApp")):
		return query.where(message.name.isnull())
	allowed = []
	for account in rows("WhatsApp Account", [], ["name", "phone_id"]):
		if not isinstance(account.phone_id, str) or not IDENTITY.fullmatch(account.phone_id):
			continue
		probe = frappe._dict(provider="WhatsApp", account_id=account.phone_id)
		if ReadScope._permitted(lambda: control._authorize_account(probe, user, roles).name == account.name):
			allowed.append(account.name)
	if not allowed:
		return query.where(message.name.isnull())
	peer = Case().when(message.type == "Incoming", message["from"]).else_(message.to)
	conditions = [
		message.whatsapp_account.isin(allowed),
		message.type.isin(["Incoming", "Outgoing"]),
		peer.regexp("^[0-9]{1,40}$"),
		Function("RIGHT", peer, 1).regexp("^[0-9]$"),
	]
	private = customer_peer_condition(peer)
	if private:
		conditions.append(private)
	references = []
	for doctype in sorted(control.REFERENCES):
		try:
			permitted = frappe.qb.get_query(
				doctype, fields=["name"], user=user, ignore_permissions=False, order_by=None
			)
		except frappe.PermissionError:
			continue
		references.append((message.reference_doctype == doctype) & message.reference_name.isin(permitted))
	if has_document_permission("CRM Deal", "read", user=user, print_logs=False):
		references.append(
			(Coalesce(message.reference_doctype, "") == "") & (Coalesce(message.reference_name, "") == "")
		)
	if not references:
		return query.where(message.name.isnull())
	conditions.append(Criterion.any(references))
	return query.where(Criterion.all(conditions))


def message_query_conditions(user=None):
	return "`tabWhatsApp Message`.`name` IN (" + message_query(user).get_sql() + ")"


def message_permission(doc, ptype=None, user=None, permission_type=None):
	# Native roles/controller/outbox still decide writes. A write response must
	# not resurrect an existing unreadable transcript; creation remains native.
	# Frappe treats any falsy has_permission result as a denial, so every
	# non-denying outcome must be an explicit True.
	kind = ptype or permission_type or "read"
	if kind == "create":
		return True
	return bool(can_read_message(doc.name, user))


def filter_shared_messages(user, doctype, names):
	allowed = []
	for offset in range(0, len(names), BATCH_SIZE):
		message = frappe.qb.DocType("WhatsApp Message")
		allowed.extend(
			message_query(user).where(message.name.isin(names[offset : offset + BATCH_SIZE])).run(pluck=True)
		)
	return allowed


def notification_query(user=None):
	"""Scoped source subquery; never enumerate the user's whole notification inbox."""
	from frappe.query_builder.functions import Coalesce
	from pypika.terms import ExistsCriterion

	user = user or frappe.session.user
	notification = frappe.qb.DocType("CRM Notification")
	non_whatsapp = Coalesce(notification.type, "") != "WhatsApp"
	query = frappe.qb.from_(notification).select(notification.name)
	if not available() or not readable_reference_fields(user):
		return query.where(non_whatsapp)
	message = frappe.qb.DocType("WhatsApp Message")
	source = (
		frappe.qb.from_(message)
		.select(message.name)
		.where(
			(notification.notification_type_doctype == "WhatsApp Message")
			& (notification.notification_type_doc == message.name)
			& (notification.reference_doctype == message.reference_doctype)
			& (notification.reference_name == message.reference_name)
			& (Coalesce(message.reference_doctype, "") != "")
			& (Coalesce(message.reference_name, "") != "")
			& message.name.isin(message_query(user))
		)
	)
	allowed = ExistsCriterion(source)
	if not readable_field("WhatsApp Message", "message", user):
		allowed &= Coalesce(notification.message, "") == ""
	return query.where(non_whatsapp | allowed)
