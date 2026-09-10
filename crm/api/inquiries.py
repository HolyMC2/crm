"""Native inquiry capture. No provider, contact matching, or outbound messaging."""

import hashlib
import json
import re
from functools import wraps
from urllib.parse import urlsplit
from uuid import uuid4

import frappe
from frappe import _
from frappe.permissions import has_permission as has_document_permission
from frappe.utils import get_datetime, now_datetime, validate_email_address

DOCTYPE = "CRM Inquiry"
ROLES = frozenset({"System Manager", "Sales Manager", "Sales User"})
MANAGER_ROLES = frozenset({"System Manager", "Sales Manager"})
STATUSES = ("New", "In Progress", "Closed")
SOURCES = ("Manual", "Facebook", "Instagram", "Other")
PERSON_ROLES = ("Requester", "Referrer", "Interested Person")
MAX_PEOPLE = 50
MAX_PAYLOAD_BYTES = 65536
PERSON_FIELDS = frozenset({"display_name", "role", "email", "phone"})
CAPTURE_FIELDS = frozenset(
	{"title", "source_type", "source_url", "source_text", "client_request_id", "people"}
)
UPDATE_FIELDS = frozenset({"title", "status", "assigned_to", "next_action_at"})
SUMMARY_FIELDS = (
	"name", "title", "status", "source_type", "source_url", "assigned_to", "next_action_at",
	"owner", "creation", "modified",
)


def _public_errors(fn):
	@wraps(fn)
	def wrapped(*args, **kwargs):
		message_count = len(frappe.local.message_log)

		def sanitized_error(message, error_type):
			# Framework check_permission may already have logged a denied linked
			# document's name. Preserve earlier messages, discard this operation's.
			del frappe.local.message_log[message_count:]
			try:
				frappe.throw(message, error_type)
			except error_type as error:
				raise error from None

		try:
			return fn(*args, **kwargs)
		except frappe.PermissionError:
			sanitized_error(_("You do not have permission for this inquiry or lead."), frappe.PermissionError)
		except frappe.DoesNotExistError:
			sanitized_error(_("The inquiry or lead is unavailable."), frappe.DoesNotExistError)
		except frappe.ValidationError:
			raise
		except Exception:
			sanitized_error(_("The inquiry operation could not be completed. Please retry."), frappe.ValidationError)

	return wrapped


def _eligible(user):
	return bool(
		user and user != "Guest"
		and frappe.db.get_value("User", user, "enabled")
		and (user == "Administrator" or ROLES.intersection(frappe.get_roles(user)))
	)


def _require_member():
	if not _eligible(frappe.session.user):
		frappe.throw(_("An enabled CRM user is required."), frappe.PermissionError)
	if not frappe.db.exists("DocType", DOCTYPE) or not frappe.get_meta(DOCTYPE).has_field("capture_payload_hash"):
		frappe.throw(_("Native inquiries are not installed yet. Ask an administrator to complete the CRM upgrade."))


def _text(value, label, maximum, required=False, multiline=False):
	if value is None:
		value = ""
	if not isinstance(value, str):
		frappe.throw(_("{0} must be text.").format(label))
	value = value.strip()
	if len(value) > maximum or (required and not value):
		frappe.throw(_("{0} is required and must be at most {1} characters.").format(label, maximum)
			if required else _("{0} must be at most {1} characters.").format(label, maximum))
	if any(ord(c) < 32 and not (multiline and c in "\n\r\t") for c in value):
		frappe.throw(_("{0} contains unsupported control characters.").format(label))
	return value


def _mapping(value, allowed, label):
	if isinstance(value, str):
		if len(value.encode("utf-8")) > MAX_PAYLOAD_BYTES:
			frappe.throw(_("The inquiry payload is too large."))
		try:
			value = json.loads(value)
		except (TypeError, ValueError):
			frappe.throw(_("{0} must be a JSON object.").format(label))
	if not isinstance(value, dict) or set(value) - allowed:
		frappe.throw(_("{0} contains unsupported fields or is not an object.").format(label))
	try:
		size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
	except (TypeError, ValueError):
		frappe.throw(_("{0} must contain JSON values.").format(label))
	if size > MAX_PAYLOAD_BYTES:
		frappe.throw(_("The inquiry payload is too large."))
	return value


def _choice(value, choices, label):
	if not isinstance(value, str) or value not in choices:
		frappe.throw(_("Choose a valid {0}.").format(label))
	return value


def _source_url(value):
	value = _text(value, _("Source URL"), 2048)
	if not value:
		return ""
	try:
		url = urlsplit(value)
		valid = url.scheme.lower() in ("http", "https") and url.hostname and not url.username and not url.password
		url.port  # Reject malformed ports as well as malformed authorities.
	except ValueError:
		valid = False
	if not valid or any(c.isspace() for c in value) or "\\" in value:
		frappe.throw(_("Source URL must be an HTTP or HTTPS URL without embedded credentials."))
	return value


def _person(value):
	value = _mapping(value, PERSON_FIELDS, _("Person"))
	result = {
		"display_name": _text(value.get("display_name"), _("Display name"), 140, required=True),
		"role": _choice(value.get("role"), PERSON_ROLES, _("person role")),
		"email": _text(value.get("email"), _("Email"), 140),
		"phone": _text(value.get("phone"), _("Phone"), 40),
	}
	if result["email"] and (
		"," in result["email"] or ";" in result["email"]
		or validate_email_address(result["email"]) != result["email"]
	):
		frappe.throw(_("Enter one valid email address."))
	return result


def _capture(value, require_request_id=True):
	value = _mapping(value, CAPTURE_FIELDS, _("Inquiry"))
	people = value.get("people", [])
	if not isinstance(people, list) or len(people) > MAX_PEOPLE:
		frappe.throw(_("An inquiry may contain at most {0} people.").format(MAX_PEOPLE))
	return {
		"title": _text(value.get("title"), _("Title"), 140, required=True),
		"source_type": _choice(value.get("source_type", "Manual"), SOURCES, _("source type")),
		"source_url": _source_url(value.get("source_url")),
		"source_text": _text(value.get("source_text"), _("Source text"), 20000, multiline=True),
		"client_request_id": _text(value.get("client_request_id"), _("Request ID"), 200, required=require_request_id),
		"people": [_person(person) for person in people],
	}


def _digest(value):
	return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def _capture_key(client_request_id):
	return _digest([frappe.session.user, _text(client_request_id, _("Request ID"), 200, required=True)])


def _date(value, label, required=False):
	if not value and not required:
		return None
	if isinstance(value, str) and not re.fullmatch(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?", value):
		frappe.throw(_("{0} must be a valid date and time.").format(label))
	try:
		return get_datetime(value) if value else frappe.throw(_("{0} is required.").format(label))
	except (TypeError, ValueError, OverflowError):
		frappe.throw(_("{0} must be a valid date and time.").format(label))


def _document(name, permission="read", lock=False):
	name = _text(name, _("Inquiry name"), 140, required=True)
	doc = frappe.get_doc(DOCTYPE, name, for_update=lock)
	doc.check_permission(permission)
	return doc


def _version(doc, modified):
	if _date(modified, _("Modified timestamp"), required=True) != get_datetime(doc.modified):
		frappe.throw(_("This inquiry changed. Reload it and retry your changes."), frappe.TimestampMismatchError)


def _serialized(doc):
	doc.check_permission("read")
	result = {field: doc.get(field) for field in SUMMARY_FIELDS}
	result["source_text"] = doc.source_text
	result["can_write"] = bool(doc.has_permission("write"))
	result["people"] = []
	for person in doc.people:
		visible = bool(person.lead and has_document_permission("CRM Lead", "read", doc=person.lead, print_logs=False))
		result["people"].append({
			"person_key": person.person_key,
			**{field: person.get(field) for field in PERSON_FIELDS},
			"lead": person.lead if visible else None,
			"converted_at": person.converted_at,
			"lead_accessible": visible,
		})
	return result


def find_inquiry_for_request(client_request_id):
	"""Internal adapter receipt lookup. Reuse the snapshot after source enrichment.

	This is deliberately not whitelisted and never bypasses actor or inquiry access.
	"""
	_require_member()
	name = frappe.db.get_value(DOCTYPE, {"capture_key": _capture_key(client_request_id)}, "name")
	return _serialized(_document(name)) if name else None


@frappe.whitelist(methods=["POST"])
@_public_errors
def create_inquiry(payload: dict | str):
	_require_member()
	values = _capture(payload)
	key = _capture_key(values.pop("client_request_id"))
	return _save_capture(key, values)


@_public_errors
def capture_source_inquiry(source_key: str, payload: dict | str):
	"""Internal adapter capture: one receipt per known source across CRM actors.

	Adapters must check source and branch access before calling. The receipt still
	uses normal inquiry permissions; denied staff cannot create another copy.
	Later enrichment does not replace the original source/person snapshot.
	"""
	_require_member()
	source_key = _text(source_key, _("Source key"), 500, required=True)
	# Three elements cannot collide with the manual [actor, request_id] namespace.
	key = _digest(["source", DOCTYPE, source_key])
	existing = frappe.db.get_value(DOCTYPE, {"capture_key": key}, "name")
	if existing:
		return _serialized(_document(existing, lock=True))
	values = _capture(payload, require_request_id=False)
	values.pop("client_request_id")
	return _save_capture(key, values, compare_payload=False)


def _save_capture(key, values, compare_payload=True):
	"""Shared normal insert and unique-index recovery; never exposed by RPC."""
	fingerprint = _digest(values)

	def replay(name):
		doc = _document(name, lock=True)
		if compare_payload and doc.capture_payload_hash != fingerprint:
			frappe.throw(_("This request ID was already used with different inquiry content."))
		return _serialized(doc)

	existing = frappe.db.get_value(DOCTYPE, {"capture_key": key}, "name")
	if existing:
		return replay(existing)

	from crm.fcrm.doctype.crm_inquiry.crm_inquiry import prepare_capture

	doc = frappe.get_doc({"doctype": DOCTYPE, **values, "assigned_to": frappe.session.user})
	prepare_capture(doc, key, fingerprint)
	savepoint = "inquiry_capture_" + uuid4().hex
	frappe.db.savepoint(savepoint)
	try:
		doc.insert()
	except (frappe.DuplicateEntryError, frappe.UniqueValidationError):
		frappe.db.rollback(save_point=savepoint)
		# A locking read sees a concurrently committed winner under REPEATABLE READ.
		existing = frappe.db.get_value(DOCTYPE, {"capture_key": key}, "name", for_update=True)
		if not existing:
			frappe.throw(_("The inquiry could not be captured. Please retry."))
		return replay(existing)
	return _serialized(doc)


@frappe.whitelist(methods=["POST"])
@_public_errors
def list_inquiries(status: str | None = None, assigned_to: str | None = None, start: int = 0, page_length: int = 20):
	_require_member()
	if (type(start) is not int or type(page_length) is not int or start < 0
		or start > 1000000 or not 1 <= page_length <= 100):
		frappe.throw(_("Choose a valid page between 1 and 100 records."))
	filters = {}
	if status:
		filters["status"] = _choice(status, STATUSES, _("status"))
	if assigned_to:
		filters["assigned_to"] = _text(assigned_to, _("Assignee"), 140, required=True)
	items = frappe.get_list(DOCTYPE, filters=filters, fields=list(SUMMARY_FIELDS), start=start,
		page_length=page_length + 1, order_by="modified desc, name desc")
	return {"items": items[:page_length], "has_more": len(items) > page_length}


@frappe.whitelist(methods=["POST"])
@_public_errors
def get_inquiry(name: str):
	_require_member()
	return _serialized(_document(name))


@frappe.whitelist(methods=["POST"])
@_public_errors
def update_inquiry(name: str, modified: str, values: dict | str):
	_require_member()
	values = _mapping(values, UPDATE_FIELDS, _("Changes"))
	doc = _document(name, "write", lock=True)
	_version(doc, modified)
	for field, value in values.items():
		doc.set(field, _date(value, _("Next action")) if field == "next_action_at" else value)
	doc.save()
	if not has_document_permission(DOCTYPE, "read", doc=doc, print_logs=False):
		# An authorized assignee can transfer work and lose access in this write.
		# Acknowledge only the completed operation, without rereading its content.
		return {"name": doc.name, "access_revoked": True}
	return _serialized(doc)


@frappe.whitelist(methods=["POST"])
@_public_errors
def add_person(name: str, modified: str, person: dict | str):
	_require_member()
	values = _person(person)
	doc = _document(name, "write", lock=True)
	_version(doc, modified)
	doc.append("people", values)
	doc.save()
	return _serialized(doc)


def _authorized_lead(name, permission):
	try:
		lead = frappe.get_doc("CRM Lead", _text(name, _("Lead"), 140, required=True), for_update=True)
		lead.check_permission(permission)
		lead.check_permission("read")
	except (frappe.DoesNotExistError, frappe.PermissionError):
		frappe.throw(_("The selected lead is unavailable or not permitted."), frappe.PermissionError)
	return lead


@frappe.whitelist(methods=["POST"])
@_public_errors
def convert_person(name: str, person_key: str, existing_lead: str | None = None):
	_require_member()
	person_key = _text(person_key, _("Person key"), 64, required=True)
	doc = _document(name, "write", lock=True)
	person = next((p for p in doc.people if p.person_key == person_key), None)
	if not person:
		frappe.throw(_("Select a person from this inquiry."))
	if person.role not in ("Requester", "Interested Person"):
		frappe.throw(_("A referrer cannot be converted. Add or classify an interested person explicitly."))
	if person.lead:
		lead = _authorized_lead(person.lead, "read")
		if existing_lead and existing_lead != lead.name:
			frappe.throw(_("This person has already been linked to a different lead."))
		return {"inquiry": _serialized(doc), "lead": lead.name, "created": False}
	if doc.status == "Closed":
		frappe.throw(_("Reopen this inquiry before converting a person."))

	savepoint = "inquiry_convert_" + uuid4().hex
	frappe.db.savepoint(savepoint)
	try:
		if existing_lead:
			lead = _authorized_lead(existing_lead, "write")
		else:
			if "doco_marketing" in frappe.get_installed_apps() and not frappe.get_hooks("crm_inquiry_capture_guard"):
				frappe.throw(_("Upgrade the marketing app before creating inquiry leads so campaign enrollment stays disabled. You can still link an existing lead."))
			lead = frappe.get_doc({
				"doctype": "CRM Lead", "first_name": person.display_name,
				"email": person.email or None, "phone": person.phone or None,
				"lead_owner": frappe.session.user,
			})
			lead.check_permission("create")
			previous_guard = frappe.flags.get("crm_inquiry_capture")
			had_guard = "crm_inquiry_capture" in frappe.flags
			try:
				# Optional campaign hooks honor this request-local, scoped guard.
				frappe.flags.crm_inquiry_capture = True
				lead.insert()
			finally:
				if had_guard:
					frappe.flags.crm_inquiry_capture = previous_guard
				else:
					frappe.flags.pop("crm_inquiry_capture", None)
		from crm.fcrm.doctype.crm_inquiry.crm_inquiry import prepare_conversion

		prepare_conversion(doc, person, lead.name, now_datetime())
		doc.save()
		result = {"inquiry": _serialized(doc), "lead": lead.name, "created": not bool(existing_lead)}
	except Exception:
		frappe.db.rollback(save_point=savepoint)
		raise
	return result


@frappe.whitelist(methods=["POST"])
@_public_errors
def get_assignees():
	_require_member()
	# Deliberately return only assignment identities, never a User document.
	user = frappe.qb.DocType("User")
	role = frappe.qb.DocType("Has Role")
	return (frappe.qb.from_(user).join(role).on(role.parent == user.name)
		.select(user.name, user.full_name).distinct()
		.where((user.enabled == 1) & (user.name != "Guest") & (role.parenttype == "User")
			& (role.role.isin(sorted(ROLES))))
		.orderby(user.full_name).limit(200).run(as_dict=True))
