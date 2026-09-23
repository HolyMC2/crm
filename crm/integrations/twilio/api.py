import json
import logging

import frappe
from frappe import _
from werkzeug.wrappers import Response

from crm.integrations.api import get_contact_by_phone_number

from .twilio_handler import IncomingCall, Twilio, TwilioCallDetails
from .utils import get_public_url
from .verification import request_is_authentic


def validate_twilio_request(args, require_application_sid: bool = False):
	twilio = Twilio.connect()
	if not twilio:
		frappe.throw(_("Twilio configuration is missing"), frappe.PermissionError)

	account_sid = frappe.utils.cstr(args.get("AccountSid"))
	if not account_sid or account_sid != frappe.utils.cstr(twilio.account_sid):
		frappe.throw(_("Invalid Twilio account"), frappe.PermissionError)

	request = getattr(frappe.local, "request", None)
	token = twilio.settings.get_password("auth_token", raise_exception=False)
	# Use the same public URL convention as generated callbacks, including proxy
	# HTTPS. A site's configured host_name/hostname supplies its canonical origin.
	public_url = get_public_url(request.path) if request else ""
	if not request_is_authentic(request, token, public_url):
		frappe.throw(_("Invalid Twilio request signature"), frappe.PermissionError)

	if require_application_sid:
		application_sid = frappe.utils.cstr(args.get("ApplicationSid"))
		if not application_sid or application_sid != frappe.utils.cstr(twilio.application_sid):
			frappe.throw(_("Invalid Twilio application"), frappe.PermissionError)

	return twilio


@frappe.whitelist()
def is_enabled():
	return frappe.db.get_single_value("CRM Twilio Settings", "enabled")


@frappe.whitelist()
def generate_access_token():
	"""Returns access token that is required to authenticate Twilio Client SDK."""
	twilio = Twilio.connect()
	if not twilio:
		return {}

	from_number = frappe.db.get_value("CRM Telephony Agent", frappe.session.user, "twilio_number")
	if not from_number:
		return {
			"ok": False,
			"error": "caller_phone_identity_missing",
			"detail": "Phone number is not mapped to the caller",
		}

	token = twilio.generate_voice_access_token(identity=frappe.session.user)
	return {"token": frappe.safe_decode(token)}


@frappe.whitelist(allow_guest=True)
def voice(**kwargs):
	"""This is a webhook called by twilio to get instructions when the voice call request comes to twilio server."""

	def _get_caller_number(caller):
		identity = caller.replace("client:", "").strip()
		user = Twilio.emailid_from_identity(identity)
		return frappe.db.get_value("CRM Telephony Agent", user, "twilio_number")

	args = frappe._dict(kwargs)
	twilio = validate_twilio_request(args, require_application_sid=True)

	# Generate TwiML instructions to make a call
	from_number = _get_caller_number(args.Caller)
	to_number = _normalize_e164(args.To)
	resp = twilio.generate_twilio_dial_response(from_number, to_number)

	call_details = TwilioCallDetails(args, call_from=from_number, call_to=to_number)
	create_call_log(call_details)
	return Response(resp.to_xml(), mimetype="text/xml")


# Security review: validate_twilio_request verifies account + AuthToken signature before any call/log effect.
@frappe.whitelist(allow_guest=True)  # nosemgrep: guest-whitelisted-method
def sip_voice(**kwargs):
	"""Webhook called by Twilio when an outbound call originates from a softphone
	registered against the Twilio SIP Domain. Looks up the agent by sip_username,
	normalizes the dialed number to E.164 and returns TwiML to dial the PSTN with
	the agent's twilio_number as caller_id."""

	def _get_caller_number_from_sip(caller):
		# Twilio sets `From` to `sip:<username>@<sip-domain>` for SIP-originated calls
		sip_uri = (caller or "").lower()
		if not sip_uri.startswith("sip:"):
			return None
		username = sip_uri.split(":", 1)[1].split("@", 1)[0]
		if not username:
			return None
		return frappe.db.get_value("CRM Telephony Agent", {"sip_username": username}, "twilio_number")

	args = frappe._dict(kwargs)
	# SIP Domain webhooks don't carry an ApplicationSid; validate AccountSid only.
	twilio = validate_twilio_request(args)

	if not twilio.settings.get("enable_sip_phone"):
		# SIP routing disabled — refuse with TwiML "Reject"
		from twilio.twiml.voice_response import VoiceResponse

		r = VoiceResponse()
		r.reject()
		return Response(r.to_xml(), mimetype="text/xml")

	from_number = _get_caller_number_from_sip(args.From or args.Caller)
	to_number = _normalize_e164(args.To)
	resp = twilio.generate_twilio_dial_response(from_number, to_number)

	call_details = TwilioCallDetails(args, call_from=from_number, call_to=to_number)
	create_call_log(call_details)
	return Response(resp.to_xml(), mimetype="text/xml")


def _normalize_e164(number: str, default_country_code: str = "52") -> str:
	"""Coerce a phone number to E.164 (+CCNNN...).

	Handles common malformed inputs seen on this CRM:
	- bare 10-digit MX numbers (no country code) -> prepend +52
	- 11-digit US/CA numbers starting with 1     -> prepend +
	- legacy MX format with carrier "1" after CC -> drop the 1 (+521NNN -> +52NNN)
	- already-E.164 numbers                      -> passed through
	"""
	if not number:
		return number
	# A SIP-Domain call passes `To` as a full URI (sip:5512345678@host:5060);
	# strip the scheme and everything from '@' on, else the host/port digits
	# would get merged into the dialed number.
	s = str(number).strip()
	for scheme in ("sip:", "sips:", "tel:"):
		if s.lower().startswith(scheme):
			s = s[len(scheme) :]
			break
	if "@" in s:
		s = s.split("@", 1)[0]
	digits = "".join(c for c in s if c.isdigit() or c == "+")
	body = digits[1:] if digits.startswith("+") else digits
	if body.startswith("521") and len(body) == 13:
		body = "52" + body[3:]
	elif len(body) == 10:
		body = default_country_code + body
	# 11-digit starting with "1" is left as-is (US/CA); anything else passes through
	return "+" + body


@frappe.whitelist(allow_guest=True)
def twilio_incoming_call_handler(**kwargs):
	args = frappe._dict(kwargs)
	validate_twilio_request(args)

	call_details = TwilioCallDetails(args)
	create_call_log(call_details)

	resp = IncomingCall(args.From, args.To).process()
	return Response(resp.to_xml(), mimetype="text/xml")


def create_call_log(call_details: TwilioCallDetails):
	details = call_details.to_dict()

	call_log = frappe.get_doc({**details, "doctype": "CRM Call Log", "telephony_medium": "Twilio"})

	# link call log with lead/deal
	contact_number = details.get("from") if details.get("type") == "Incoming" else details.get("to")
	link(contact_number, call_log)

	call_log.save(ignore_permissions=True)
	frappe.db.commit()
	return call_log


def link(contact_number, call_log):
	contact = get_contact_by_phone_number(contact_number)
	if contact.get("name"):
		doctype = "Contact"
		docname = contact.get("name")
		if contact.get("lead"):
			doctype = "CRM Lead"
			docname = contact.get("lead")
		elif contact.get("deal"):
			doctype = "CRM Deal"
			docname = contact.get("deal")
		call_log.link_with_reference_doc(doctype, docname)


def update_call_log(call_sid, status=None):
	"""Update call log status."""
	twilio = Twilio.connect()
	if not (twilio and frappe.db.exists("CRM Call Log", call_sid)):
		return

	try:
		call_details = twilio.get_call_info(call_sid)
		call_log = frappe.get_doc("CRM Call Log", call_sid)
		call_log.status = TwilioCallDetails.get_call_status(status or call_details.status)
		call_log.duration = call_details.duration
		call_log.start_time = get_datetime_from_timestamp(call_details.start_time)
		call_log.end_time = get_datetime_from_timestamp(call_details.end_time)
		call_log.save(ignore_permissions=True)
		frappe.db.commit()
		return call_log
	except Exception:
		frappe.log_error(title="Error while updating call record")
		frappe.db.commit()


def get_twilio_settings():
	return frappe.get_single("CRM Twilio Settings")


@frappe.whitelist(allow_guest=True)
def update_recording_info(**kwargs):
	args = frappe._dict(kwargs)
	validate_twilio_request(args)

	recording_url = args.RecordingUrl
	call_sid = args.CallSid
	call_log = update_call_log(call_sid)
	if not call_log:
		frappe.throw(_("Call log not found"), frappe.DoesNotExistError)

	try:
		frappe.db.set_value("CRM Call Log", call_sid, "recording_url", recording_url)
		frappe.db.commit()
	except Exception as exc:
		frappe.log_error(title=_("Failed to capture Twilio recording"))
		raise exc


# Twilio refuses a user-defined message when the parent call is no longer in
# progress (21220) and when the parent leg is PSTN, which has no Client SDK
# listener to receive it. A status callback routinely arrives in both states.
CALL_NOT_IN_EXPECTED_STATE = 21220
_PSTN_HAS_NO_CLIENT_LISTENER = "client message not supported for pstn calls"


def is_expected_user_message_rejection(exc) -> bool:
	"""True when Twilio refused the live-status push for an ordinary reason."""
	from twilio.base.exceptions import TwilioRestException

	if not isinstance(exc, TwilioRestException):
		return False
	if getattr(exc, "code", None) == CALL_NOT_IN_EXPECTED_STATE:
		return True
	return _PSTN_HAS_NO_CLIENT_LISTENER in f"{getattr(exc, 'msg', '') or exc}".lower()


def _report_status_push_failure(exc, call_sid):
	"""Report without exposing SDK credentials, phone numbers or traceback locals."""
	message = f"Browser status push failed ({type(exc).__name__}); call log update succeeded."
	for label, value in (
		("Twilio code", getattr(exc, "code", None)),
		("HTTP status", getattr(exc, "status", None)),
	):
		if isinstance(value, int):
			message += f" {label}={value}."
	try:
		frappe.log_error(
			title="Failed to update Twilio call status",
			message=message,
			reference_doctype="CRM Call Log",
			reference_name=call_sid,
		)
	except Exception:
		# The call update has committed. Even failure of both logging outputs
		# must not turn this optional notification into a failed webhook.
		try:
			logging.getLogger(__name__).error("%s call=%s", message, call_sid)
		except Exception:
			pass


@frappe.whitelist(allow_guest=True)
def update_call_status_info(**kwargs):
	args = frappe._dict(kwargs)
	validate_twilio_request(args)

	parent_call_sid = args.ParentCallSid
	call_log = update_call_log(parent_call_sid, status=args.CallStatus)
	if not call_log:
		frappe.throw(_("Call log not found"), frappe.DoesNotExistError)

	call_info = {
		"ParentCallSid": args.ParentCallSid,
		"CallSid": args.CallSid,
		"CallStatus": args.CallStatus,
		"CallDuration": args.CallDuration,
		"From": args.From,
		"To": args.To,
	}

	# Best effort. The authoritative work — the CRM Call Log update above — is
	# already committed, so a refused live-status push must not fail this
	# callback: answering 500 only makes Twilio retry a webhook that already
	# succeeded. Twilio refuses the message in two ordinary situations, and
	# neither is a shop problem. Anything else is still recorded for a human.
	try:
		client = Twilio.get_twilio_client()
		client.calls(args.ParentCallSid).user_defined_messages.create(content=json.dumps(call_info))
	except Exception as exc:
		if not is_expected_user_message_rejection(exc):
			_report_status_push_failure(exc, parent_call_sid)


def get_datetime_from_timestamp(timestamp):
	from datetime import datetime
	from zoneinfo import ZoneInfo

	if not timestamp:
		return None

	datetime_utc_tz_str = timestamp.strftime("%Y-%m-%d %H:%M:%S%z")
	datetime_utc_tz = datetime.strptime(datetime_utc_tz_str, "%Y-%m-%d %H:%M:%S%z")
	system_timezone = frappe.utils.get_system_timezone()
	converted_datetime = datetime_utc_tz.astimezone(ZoneInfo(system_timezone))
	return frappe.utils.format_datetime(converted_datetime, "yyyy-MM-dd HH:mm:ss")
