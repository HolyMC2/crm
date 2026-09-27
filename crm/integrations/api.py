import ipaddress
import re
import socket
from urllib.parse import urlparse, urlunparse

import frappe
import requests
from frappe import _
from frappe.model import get_permitted_fields
from pypika.functions import Replace
from werkzeug.wrappers import Response

from crm.utils import are_same_phone_number, parse_phone_number


def _get_recording_credentials(telephony_medium: str) -> tuple | None:
	"""Return (api_key, secret) for the given telephony medium, or None when the
	recording needs no auth.

	A manual/unrecognized medium (a recording added by hand) is fetched as-is, and
	a provider whose credentials aren't configured yet falls back to no auth rather
	than raising — so the proxy attempts the fetch and lets the provider decide,
	instead of 500-ing before the request is even made.
	"""
	if telephony_medium == "Twilio":
		s = frappe.get_single("CRM Twilio Settings")
		secret = s.get_password("api_secret", raise_exception=False)
		return (s.api_key, secret) if s.api_key and secret else None
	elif telephony_medium == "Exotel":
		s = frappe.get_single("CRM Exotel Settings")
		token = s.get_password("api_token", raise_exception=False)
		return (s.api_key, token) if s.api_key and token else None
	# manual or unrecognized medium: no provider auth to apply
	return None


@frappe.whitelist()
def is_call_integration_enabled():
	return {
		"integrations": {
			"twilio": bool(frappe.db.get_single_value("CRM Twilio Settings", "enabled")),
			"exotel": bool(frappe.db.get_single_value("CRM Exotel Settings", "enabled")),
		},
		"default_calling_medium": get_user_default_calling_medium(),
	}


def get_user_default_calling_medium():
	if not frappe.db.exists("CRM Telephony Agent", frappe.session.user):
		return None

	default_medium = frappe.db.get_value("CRM Telephony Agent", frappe.session.user, "default_medium")

	if not default_medium:
		return None

	return default_medium


@frappe.whitelist()
def set_default_calling_medium(medium: str):
	if not frappe.db.exists("CRM Telephony Agent", frappe.session.user):
		frappe.get_doc(
			{
				"doctype": "CRM Telephony Agent",
				"user": frappe.session.user,
				"default_medium": medium,
			}
		).insert(ignore_permissions=True)
	else:
		frappe.db.set_value("CRM Telephony Agent", frappe.session.user, "default_medium", medium)

	return get_user_default_calling_medium()


@frappe.whitelist()
def add_note_to_call_log(call_sid: str, note: dict):
	"""Add/Update note to call log based on call sid."""
	if not frappe.has_permission("CRM Call Log", "write", call_sid):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	_note = None
	if not note.get("name"):
		_note = frappe.get_doc(
			{
				"doctype": "FCRM Note",
				"title": note.get("title", "Call Note"),
				"content": note.get("content"),
			}
		).insert(ignore_permissions=True)
	else:
		_note = frappe.set_value("FCRM Note", note.get("name"), "content", note.get("content"))

	call_log = frappe.get_cached_doc("CRM Call Log", call_sid)
	call_log.link_with_reference_doc("FCRM Note", _note.name)
	call_log.save(ignore_permissions=True)

	return _note


@frappe.whitelist()
def add_task_to_call_log(call_sid: str, task: dict):
	"""Add/Update task to call log based on call sid."""
	if not frappe.has_permission("CRM Call Log", "write", call_sid):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	_task = None
	if not task.get("name"):
		_task = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": task.get("title"),
				"description": task.get("description"),
				"assigned_to": task.get("assigned_to"),
				"due_date": task.get("due_date"),
				"status": task.get("status"),
				"priority": task.get("priority"),
			}
		).insert(ignore_permissions=True)
	else:
		_task = frappe.get_doc("CRM Task", task.get("name"))
		_task.update(
			{
				"title": task.get("title"),
				"description": task.get("description"),
				"assigned_to": task.get("assigned_to"),
				"due_date": task.get("due_date"),
				"status": task.get("status"),
				"priority": task.get("priority"),
			}
		)
		_task.save(ignore_permissions=True)

	call_log = frappe.get_doc("CRM Call Log", call_sid)
	call_log.link_with_reference_doc("CRM Task", _task.name)
	call_log.save(ignore_permissions=True)

	return _task


@frappe.whitelist()
def get_contact_lead_or_deal_from_number(number: str):
	"""Get contact, lead or deal from the given number."""
	contact = get_contact_by_phone_number(number)
	if contact.get("name"):
		doctype = "Contact"
		docname = contact.get("name")
		if contact.get("lead"):
			doctype = "CRM Lead"
			docname = contact.get("lead")
		elif contact.get("deal"):
			doctype = "CRM Deal"
			docname = contact.get("deal")
		return docname, doctype
	return None, None


@frappe.whitelist()
def get_contact_by_phone_number(phone_number: str):
	"""Get contact by phone number."""
	return _lookup_phone_number(phone_number)


def _resolve_validated_ip(hostname: str, port: int) -> str:
	# Refuse any host that resolves to a non-public address (cloud metadata, localhost,
	# private/link-local ranges) and return a single validated IP to connect to. Returning
	# the exact resolved IP — rather than re-resolving at connect time — is what closes the
	# DNS-rebinding TOCTOU window.
	try:
		addrinfos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
	except socket.gaierror:
		frappe.throw(_("Invalid recording URL"), frappe.ValidationError)

	ips = [info[4][0] for info in addrinfos]
	if not ips:
		frappe.throw(_("Invalid recording URL"), frappe.ValidationError)

	for ip in ips:
		if not ipaddress.ip_address(ip).is_global:
			frappe.throw(_("Recording URL is not allowed"), frappe.ValidationError)

	return ips[0]


class _PinnedIPAdapter(requests.adapters.HTTPAdapter):
	# Connect to a pre-validated IP while keeping the original hostname for the Host header,
	# TLS SNI and certificate verification. The socket therefore reaches the exact IP that was
	# checked, so DNS can't be rebound to an internal address between check and connect.
	def __init__(self, pinned_ip: str, hostname: str, **kwargs):
		self._pinned_ip = pinned_ip
		self._hostname = hostname
		super().__init__(**kwargs)

	def send(self, request, **kwargs):
		parsed = urlparse(request.url)
		literal_ip = (
			f"[{self._pinned_ip}]" if ipaddress.ip_address(self._pinned_ip).version == 6 else self._pinned_ip
		)
		netloc = f"{literal_ip}:{parsed.port}" if parsed.port else literal_ip
		request.url = urlunparse(parsed._replace(netloc=netloc))
		host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
		request.headers["Host"] = f"{host}:{parsed.port}" if parsed.port else host
		if parsed.scheme == "https":
			self.poolmanager.connection_pool_kw["server_hostname"] = self._hostname
			self.poolmanager.connection_pool_kw["assert_hostname"] = self._hostname
		return super().send(request, **kwargs)


def _safe_get(url: str, auth, headers: dict):
	# TODO: this SSRF-safe fetch (host validation + IP pinning) will likely need to be shared
	# with domain enrichment; until that feature ships, this local helper is the interim workaround.
	parsed = urlparse(url)
	if parsed.scheme not in ("http", "https") or not parsed.hostname:
		frappe.throw(_("Invalid recording URL"), frappe.ValidationError)

	port = parsed.port or (443 if parsed.scheme == "https" else 80)
	pinned_ip = _resolve_validated_ip(parsed.hostname, port)

	session = requests.Session()
	session.mount(f"{parsed.scheme}://", _PinnedIPAdapter(pinned_ip, parsed.hostname))
	resp = session.get(url, auth=auth, headers=headers, stream=True, timeout=30, allow_redirects=False)
	return resp, session


def _fetch_recording(url: str, auth, headers: dict):
	# Follow redirects manually so every hop is validated and IP-pinned: a provider URL can
	# 302 to a signed CDN URL (legitimate), but without per-hop checks a redirect to an
	# internal address would bypass validation. Provider credentials are dropped after the
	# first hop so they aren't leaked to the redirect target.
	current_url = url
	current_auth = auth
	for _hop in range(5):
		resp, session = _safe_get(current_url, current_auth, headers)
		if resp.is_redirect and resp.headers.get("Location"):
			current_url = requests.compat.urljoin(current_url, resp.headers["Location"])
			current_auth = None
			resp.close()
			session.close()
			continue
		resp._pinned_session = session
		return resp

	frappe.throw(_("Too many redirects while fetching recording"), frappe.ValidationError)


@frappe.whitelist()
def get_recording_url(call_log_name: str):
	"""Proxy a call recording (authenticating with the provider) so it plays in the browser.

	Forwards the browser's Range request to the provider and passes the response back with
	Accept-Ranges/Content-Length set. Without range support the HTML <audio> element can't
	read the recording's duration (shows 0:00) or seek within it.
	"""
	if not call_log_name or not frappe.db.exists("CRM Call Log", call_log_name):
		frappe.throw(_("Call log not found"), frappe.DoesNotExistError)

	log = frappe.get_doc("CRM Call Log", call_log_name)
	log.check_permission("read")

	if not log.recording_url:
		frappe.throw(_("Recording URL not found"), frappe.DoesNotExistError)

	auth = _get_recording_credentials(log.telephony_medium)
	# forward the browser's Range header so the provider (Twilio/Exotel CDN) can return
	# just the requested bytes; falls back to the full file if it doesn't support ranges
	req_headers = {}
	range_header = frappe.get_request_header("Range")
	if range_header:
		req_headers["Range"] = range_header

	# stream instead of buffering the whole file: the provider's Content-Length reaches
	# the browser immediately so the <audio> element can show the duration right away,
	# rather than waiting for the entire recording to download server-side first
	upstream = _fetch_recording(log.recording_url, auth, req_headers)
	upstream.raise_for_status()

	def _stream():
		try:
			yield from upstream.iter_content(chunk_size=64 * 1024)
		finally:
			upstream.close()
			session = getattr(upstream, "_pinned_session", None)
			if session is not None:
				session.close()

	response = Response(
		_stream(),
		status=upstream.status_code,
		mimetype=upstream.headers.get("Content-Type") or "audio/mpeg",
	)
	response.headers["Accept-Ranges"] = "bytes"
	for header in ("Content-Length", "Content-Range"):
		if upstream.headers.get(header):
			response.headers[header] = upstream.headers[header]
	return response


# Candidate ceilings protect lookup cost without ever treating a truncated set as unique.
_PHONE_CANDIDATE_LIMIT = 100
_TERMINAL_DEAL_TYPES = {"Won", "Lost", "Junk"}


def _lookup_phone_number(phone_number, *, trusted=False):
	if not isinstance(phone_number, str) or len(phone_number) > 64:
		return {"mobile_no": phone_number}
	number = parse_phone_number(_modern_mexican_number(phone_number))
	result = _resolve_contact(
		number.get("national_number") if number.get("is_valid") else phone_number,
		number.get("country") or "IN",
		exact_match=not number.get("is_valid"),
		trusted=trusted,
	)
	return result if result.get("name") else {"mobile_no": phone_number}


def _get_contact_for_verified_provider(phone_number):
	"""Internal only: invoked after the provider's native signature/token verification.

	Never whitelist this function or expose a trusted/ignore-permissions HTTP parameter.
	It still refuses ambiguous identities and bounded candidate overflow.
	"""
	return _lookup_phone_number(phone_number, trusted=True)


def get_contact(phone_number: str, country: str = "IN", exact_match: bool = False):
	"""Resolve only identities visible to the current actor, including internal UI callers."""
	return _resolve_contact(phone_number, country, exact_match=exact_match)


def _modern_mexican_number(value):
	# The historic WhatsApp 521 mobile prefix denotes the same Mexican subscriber.
	digits = re.sub(r"[ +().\t-]", "", value or "")
	return "+52" + digits[3:] if len(digits) == 13 and digits.startswith("521") else value


def _same_phone(candidate, number, country, exact_match):
	return are_same_phone_number(
		_modern_mexican_number(candidate),
		_modern_mexican_number(number),
		country or "IN",
		validate=not exact_match,
	)


def _phone_fields(doctype, *, parenttype=None):
	"""Native scalar field permissions plus explicit table and masking checks."""
	meta = frappe.get_meta(doctype)
	allowed = set(get_permitted_fields(doctype, parenttype=parenttype, permission_type="read"))
	levels = set(meta.get_permlevel_access("read", parenttype=parenttype))
	# Tables are absent from get_permitted_fields (they have no scalar SQL column).
	# Level zero still requires a permitted parent row before any value can escape.
	for field in meta.fields:
		if field.fieldtype in {"Table", "Table MultiSelect"} and (
			not field.permlevel or field.permlevel in levels
		):
			allowed.add(field.fieldname)
	return allowed - {field.fieldname for field in meta.get_masked_fields()}


def _phone_rows(doctype, names, fields, *, trusted=False):
	if not names:
		return []
	permitted = set(fields) if trusted else _phone_fields(doctype)
	query = frappe.get_all if trusted else frappe.get_list
	try:
		rows = query(
			doctype,
			filters={"name": ["in", sorted(names)]},
			fields=[field for field in fields if field in permitted],
			limit_page_length=_PHONE_CANDIDATE_LIMIT + 1,
		)
	except frappe.PermissionError:
		return []
	if trusted:
		return rows
	# Honor record hooks too; query conditions alone are not a replacement for them.
	return [row for row in rows if frappe.has_permission(doctype, "read", doc=row.name)]


def _normalized_phone(field):
	for character in (" ", "-", "(", ")", "+", "."):
		field = Replace(field, character, "")
	return field


def _resolve_contact(phone_number, country, *, exact_match=False, trusted=False):
	fallback = {"mobile_no": phone_number}
	if not isinstance(phone_number, str) or len(phone_number) > 64:
		return fallback
	cleaned = re.sub(r"[ +().\t-]", "", phone_number)
	if not cleaned.isascii() or not cleaned.isdigit() or not (10 if exact_match else 7) <= len(cleaned) <= 15:
		return fallback
	contact_names, lead_names = set(), set()
	if trusted or (
		"phone_nos" in _phone_fields("Contact")
		and "phone" in _phone_fields("Contact Phone", parenttype="Contact")
	):
		phone = frappe.qb.DocType("Contact Phone")
		candidates = (
			frappe.qb.from_(phone)
			.select(phone.parent, phone.phone)
			.where((phone.parenttype == "Contact") & (phone.parentfield == "phone_nos"))
			.where(_normalized_phone(phone.phone).like(f"%{cleaned}%"))
			.limit(_PHONE_CANDIDATE_LIMIT + 1)
		).run(as_dict=True)
		if len(candidates) > _PHONE_CANDIDATE_LIMIT:
			return fallback
		contact_names = {
			row.parent for row in candidates if _same_phone(row.phone, phone_number, country, exact_match)
		}
	if trusted or "mobile_no" in _phone_fields("CRM Lead"):
		lead = frappe.qb.DocType("CRM Lead")
		candidates = (
			frappe.qb.from_(lead)
			.select(lead.name, lead.mobile_no)
			.where(lead.converted == 0)
			.where(_normalized_phone(lead.mobile_no).like(f"%{cleaned}%"))
			.limit(_PHONE_CANDIDATE_LIMIT + 1)
		).run(as_dict=True)
		if len(candidates) > _PHONE_CANDIDATE_LIMIT:
			return fallback
		lead_names = {
			row.name for row in candidates if _same_phone(row.mobile_no, phone_number, country, exact_match)
		}
	contacts = _phone_rows(
		"Contact", contact_names, ["name", "full_name", "image", "mobile_no"], trusted=trusted
	)
	leads = _phone_rows("CRM Lead", lead_names, ["name", "lead_name", "image", "mobile_no"], trusted=trusted)
	if len(contacts) + len(leads) != 1:
		return fallback
	if leads:
		result = dict(leads[0])
		result["lead"] = result["name"]
		if "lead_name" in result:
			result["full_name"] = result.pop("lead_name")
		return result
	result = dict(contacts[0])
	deals = _phone_deals(result["name"], trusted=trusted)
	if len(deals) == 1:
		result["deal"] = deals[0].name
	elif deals and (trusted or "status" in _phone_fields("CRM Deal")):
		statuses = _phone_rows(
			"CRM Deal Status",
			{row.status for row in deals if row.get("status")},
			["name", "type"],
			trusted=trusted,
		)
		types = {row.name: row.get("type") for row in statuses}
		opened = [
			row
			for row in deals
			if types.get(row.get("status")) and types[row.status] not in _TERMINAL_DEAL_TYPES
		]
		if len(opened) == 1:
			result["deal"] = opened[0].name
	return result


def _phone_deals(contact, *, trusted=False):
	if not trusted and not (
		"contacts" in _phone_fields("CRM Deal")
		and {"contact", "is_primary"}.issubset(_phone_fields("CRM Contacts", parenttype="CRM Deal"))
	):
		return []
	links = frappe.get_all(
		"CRM Contacts",
		filters={"contact": contact, "is_primary": 1, "parenttype": "CRM Deal", "parentfield": "contacts"},
		fields=["parent"],
		limit_page_length=_PHONE_CANDIDATE_LIMIT + 1,
	)
	if len(links) > _PHONE_CANDIDATE_LIMIT:
		return []
	return _phone_rows(
		"CRM Deal", {row.parent for row in links}, ["name", "status", "modified"], trusted=trusted
	)
