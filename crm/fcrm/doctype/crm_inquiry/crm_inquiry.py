"""Document invariants apply equally to the inquiry API, Desk and generic REST."""

from uuid import uuid4

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.permissions import has_permission as has_document_permission
from frappe.utils import get_datetime

from crm.api.inquiries import (
	DOCTYPE, MANAGER_ROLES, MAX_PEOPLE, PERSON_FIELDS, SOURCES, STATUSES,
	_choice, _date, _digest, _eligible, _person, _source_url, _text,
)

# Object identity cannot be forged through JSON flags on a generic document save.
_SERVICE_TOKEN = object()
PROVENANCE = ("owner", "creation", "source_type", "source_url", "source_text", "capture_key", "capture_payload_hash")


def prepare_capture(doc, key, fingerprint):
	doc.flags.inquiry_capture = (_SERVICE_TOKEN, key, fingerprint)


def prepare_conversion(doc, person, lead, converted_at):
	doc.flags.inquiry_conversion = (_SERVICE_TOKEN, person.person_key, lead, converted_at)
	person.lead = lead
	person.converted_at = converted_at


def _service_flag(doc, name):
	value = doc.flags.get(name)
	return value if isinstance(value, tuple) and value and value[0] is _SERVICE_TOKEN else None


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if not _eligible(user):
		return "1=0"
	if user == "Administrator" or MANAGER_ROLES.intersection(frappe.get_roles(user)):
		return ""
	actor = frappe.db.escape(user)
	return f"(`tabCRM Inquiry`.`owner` = {actor} OR `tabCRM Inquiry`.`assigned_to` = {actor})"


def has_permission(doc, ptype=None, user=None, permission_type=None):
	user = user or frappe.session.user
	ptype = ptype or permission_type or "read"
	if not _eligible(user) or ptype in ("delete", "share", "submit", "cancel", "amend"):
		return False
	if ptype == "create":
		return True
	if user == "Administrator" or MANAGER_ROLES.intersection(frappe.get_roles(user)):
		return True
	if not doc.name or doc.is_new():
		return doc.owner in (None, "", user)
	# Ignore caller-supplied ownership fields: access follows the persisted row.
	stored = frappe.db.get_value(DOCTYPE, doc.name, ["owner", "assigned_to"], as_dict=True, for_update=True)
	return bool(stored and user in (stored.owner, stored.assigned_to))


class CRMInquiry(Document):
	def as_dict(self, *args, **kwargs):
		result = super().as_dict(*args, **kwargs)
		# Generic save/insert/set_value responses do not consistently apply field
		# read levels. Redact the returned copy; never clear a stored receipt.
		for row in result.get("people", []):
			if row.get("lead") and not has_document_permission("CRM Lead", "read", doc=row["lead"], print_logs=False):
				row["lead"] = None
		return result

	def validate_higher_perm_levels(self):
		super().validate_higher_perm_levels()
		# lead is hidden from generic reads and unwritable at permission level 1.
		# Restore only the server-authorized conversion after Frappe resets fields.
		conversion = _service_flag(self, "inquiry_conversion")
		if conversion:
			for person in self.people:
				if person.person_key == conversion[1]:
					person.lead = conversion[2]

	def before_insert(self):
		if not _eligible(frappe.session.user):
			frappe.throw(_("An enabled CRM user is required."), frappe.PermissionError)
		if self.owner and self.owner != frappe.session.user:
			frappe.throw(_("Inquiry ownership is set by the server."), frappe.PermissionError)
		self.owner = frappe.session.user
		self.assigned_to = self.assigned_to or frappe.session.user
		capture = _service_flag(self, "inquiry_capture")
		if capture:
			self.capture_key, self.capture_payload_hash = capture[1:]
		elif self.capture_key or self.capture_payload_hash:
			frappe.throw(_("Capture receipts are set by the server."))
		else:
			self.capture_key = _digest([self.owner, "desk", uuid4().hex])
			self.capture_payload_hash = _digest({
				"title": self.title, "source_type": self.source_type, "source_url": self.source_url,
				"source_text": self.source_text,
				"people": [{f: row.get(f) for f in PERSON_FIELDS} for row in self.people],
			})

	def validate(self):
		previous = None
		if not self.is_new():
			previous = frappe.get_doc(DOCTYPE, self.name, for_update=True)
			previous.check_permission("write")
			original_modified = self.get("_original_modified") or self.modified
			if get_datetime(original_modified) != get_datetime(previous.modified):
				frappe.throw(_("This inquiry changed. Reload it and retry your changes."), frappe.TimestampMismatchError)
			for field in PROVENANCE:
				current, stored = self.get(field), previous.get(field)
				if field == "creation":
					current, stored = get_datetime(current), get_datetime(stored)
				if current != stored:
					frappe.throw(_("Inquiry provenance and capture receipts cannot be changed."))
		self.title = _text(self.title, _("Title"), 140, required=True)
		self.status = _choice(self.status or "New", STATUSES, _("status"))
		self.source_type = _choice(self.source_type or "Manual", SOURCES, _("source type"))
		self.source_url = _source_url(self.source_url)
		validated_source = _text(self.source_text, _("Source text"), 20000, multiline=True)
		if not previous:
			self.source_text = validated_source
		self.next_action_at = _date(self.next_action_at, _("Next action"))
		self.assigned_to = _text(self.assigned_to, _("Assignee"), 140, required=True)
		if not _eligible(self.assigned_to):
			frappe.throw(_("Assign inquiries only to enabled CRM users."))
		if len(self.people) > MAX_PEOPLE:
			frappe.throw(_("An inquiry may contain at most {0} people.").format(MAX_PEOPLE))
		self._validate_people(previous)

	def _validate_people(self, previous):
		old = {row.name: row for row in previous.people} if previous else {}
		conversion = _service_flag(self, "inquiry_conversion")
		generated = _service_flag(self, "inquiry_generated_keys")
		generated_keys = generated[1] if generated else {}
		seen = set()
		for row in self.people:
			before = old.get(row.name)
			validated_person = _person({field: row.get(field) for field in PERSON_FIELDS})
			if not (before and before.lead):
				row.update(validated_person)
			if before:
				if row.person_key != before.person_key:
					frappe.throw(_("Person keys cannot be changed."))
				for field in ("owner", "creation", "parent", "parenttype", "parentfield"):
					current, stored = row.get(field), before.get(field)
					if field == "creation":
						current, stored = get_datetime(current), get_datetime(stored)
					if current != stored:
						frappe.throw(_("A person's provenance cannot be changed."))
				if before.lead and any(row.get(f) != before.get(f) for f in PERSON_FIELDS):
					frappe.throw(_("A converted person's identity cannot be changed."))
				current_time = get_datetime(row.converted_at) if row.converted_at else None
				old_time = get_datetime(before.converted_at) if before.converted_at else None
				changed = row.lead != before.lead or current_time != old_time
				permitted = (
					conversion and not before.lead and row.role in ("Requester", "Interested Person")
					and conversion[1] == row.person_key and conversion[2] == row.lead
					and get_datetime(conversion[3]) == current_time
				)
				if changed and not permitted:
					frappe.throw(_("Use the inquiry conversion action to link a lead."))
			else:
				if row.name and frappe.db.exists("CRM Inquiry Person", row.name):
					frappe.throw(_("A person cannot be moved between inquiries."))
				if row.lead or row.converted_at:
					frappe.throw(_("New people cannot include conversion receipts."))
				if row.person_key and generated_keys.get(id(row)) != row.person_key:
					frappe.throw(_("Person keys are generated by the server."))
				row.person_key = row.person_key or uuid4().hex
				generated_keys[id(row)] = row.person_key
			if row.person_key in seen:
				frappe.throw(_("Each inquiry person must have a distinct key."))
			seen.add(row.person_key)
		if any(row.lead and row.person_key not in seen for row in old.values()):
			frappe.throw(_("Converted people cannot be removed from an inquiry."))
		self.flags.inquiry_generated_keys = (_SERVICE_TOKEN, generated_keys)

	def on_update(self):
		recipients = {self.owner, self.assigned_to}
		before = self.get_doc_before_save()
		if before:
			recipients.add(before.assigned_to)
		if self.assigned_to != frappe.session.user and (not before or before.assigned_to != self.assigned_to):
			frappe.get_doc({
				"doctype": "CRM Notification", "type": "Assignment",
				"from_user": frappe.session.user, "to_user": self.assigned_to,
				"notification_text": _("Se te asignó una consulta"),
				"reference_doctype": DOCTYPE, "reference_name": self.name,
				"notification_type_doctype": DOCTYPE, "notification_type_doc": self.name,
			}).insert()
			# The existing notification controller also emits before commit. Refresh
			# this user's notification list after the durable record becomes visible.
			frappe.publish_realtime("crm_notification", {}, user=self.assigned_to, after_commit=True)
		for user in recipients:
			if _eligible(user):
				frappe.publish_realtime("crm_inquiry_updated", {}, user=user, after_commit=True)

	def on_trash(self):
		frappe.throw(_("Close inquiries to preserve their capture and conversion history."))

	def before_rename(self, old, new, merge=False):
		frappe.throw(_("Inquiry names cannot be changed."))
