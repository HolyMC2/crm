import frappe
from frappe import _
from frappe.utils.password import get_decrypted_password
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import Dial, VoiceResponse

from .utils import get_public_url, merge_dicts


class Twilio:
	"""Twilio connector over TwilioClient."""

	def __init__(self, settings):
		"""
		:param settings: `CRM Twilio Settings` doctype
		"""
		self.settings = settings
		self.account_sid = settings.account_sid
		self.application_sid = settings.twiml_sid
		self.api_key = settings.api_key
		self.api_secret = settings.get_password("api_secret")
		self.twilio_client = self.get_twilio_client()

	@classmethod
	def connect(cls):
		"""Read CRM Twilio Settings and return a configured Twilio instance, or None if not enabled."""
		settings = frappe.get_doc("CRM Twilio Settings")
		if not (settings and settings.enabled):
			return
		return Twilio(settings=settings)

	def get_phone_numbers(self):
		"""Get account's twilio phone numbers."""
		numbers = self.twilio_client.incoming_phone_numbers.list()
		return [n.phone_number for n in numbers]

	def generate_voice_access_token(self, identity: str, ttl=60 * 60):
		"""Generates a token required to make voice calls from the browser."""
		# identity is used by twilio to identify the user uniqueness at browser(or any endpoints).
		identity = self.safe_identity(identity)

		# Create access token with credentials
		token = AccessToken(self.account_sid, self.api_key, self.api_secret, identity=identity, ttl=ttl)

		# Create a Voice grant and add to token
		voice_grant = VoiceGrant(
			outgoing_application_sid=self.application_sid,
			incoming_allow=True,  # Allow incoming calls
		)
		token.add_grant(voice_grant)
		return token.to_jwt()

	@classmethod
	def safe_identity(cls, identity: str):
		"""Create a safe identity by replacing unsupported special charaters `@` with (at)).
		Twilio Client JS fails to make a call connection if identity has special characters like @, [, / etc)
		https://www.twilio.com/docs/voice/client/errors (#31105)
		"""
		return identity.replace("@", "(at)")

	@classmethod
	def emailid_from_identity(cls, identity: str):
		"""Convert safe identity string into emailID."""
		return identity.replace("(at)", "@")

	def get_recording_status_callback_url(self):
		url_path = "/api/method/crm.integrations.twilio.api.update_recording_info"
		return get_public_url(url_path)

	def get_update_call_status_callback_url(self):
		url_path = "/api/method/crm.integrations.twilio.api.update_call_status_info"
		return get_public_url(url_path)

	def generate_twilio_dial_response(self, from_number: str, to_number: str):
		"""Generates voice call instructions to forward the call to agents Phone."""
		resp = VoiceResponse()
		dial = Dial(
			caller_id=from_number,
			record=self.settings.record_calls,
			recording_status_callback=self.get_recording_status_callback_url(),
			recording_status_callback_event="completed",
		)
		dial.number(
			to_number,
			status_callback_event="initiated ringing answered completed",
			status_callback=self.get_update_call_status_callback_url(),
			status_callback_method="POST",
		)
		resp.append(dial)
		return resp

	def get_call_info(self, call_sid):
		return self.twilio_client.calls(call_sid).fetch()

	def generate_twilio_client_response(self, client, ring_tone="at"):
		"""Generates voice call instructions to forward the call to agents computer."""
		resp = VoiceResponse()
		dial = Dial(
			ring_tone=ring_tone,
			record=self.settings.record_calls,
			recording_status_callback=self.get_recording_status_callback_url(),
			recording_status_callback_event="completed",
		)
		dial.client(
			client,
			status_callback_event="initiated ringing answered completed",
			status_callback=self.get_update_call_status_callback_url(),
			status_callback_method="POST",
		)
		resp.append(dial)
		return resp

	def generate_twilio_sip_response(self, sip_uri, caller_id=None, ring_tone="at"):
		"""Generates voice call instructions to forward the call to a SIP endpoint
		(softphone registered against the Twilio SIP Domain)."""
		resp = VoiceResponse()
		dial = Dial(
			caller_id=caller_id,
			ring_tone=ring_tone,
			record=self.settings.record_calls,
			recording_status_callback=self.get_recording_status_callback_url(),
			recording_status_callback_event="completed",
		)
		dial.sip(
			sip_uri,
			status_callback_event="initiated ringing answered completed",
			status_callback=self.get_update_call_status_callback_url(),
			status_callback_method="POST",
		)
		resp.append(dial)
		return resp

	def get_dial_outcome_url(self):
		return get_public_url("/api/method/crm.integrations.twilio.api.twilio_dial_outcome")

	def get_message_done_url(self):
		return get_public_url("/api/method/crm.integrations.twilio.api.twilio_message_done")

	def generate_twilio_parallel_response(
		self, targets, caller_id=None, ring_tone="at", timeout=None, action=None
	):
		"""Ring multiple endpoints simultaneously. First to answer wins, others hang up.

		`targets` is a list of (kind, value) tuples where kind is one of:
		  - "sip"    : value is a sip: URI (e.g. sip:marco@docomexico.sip.twilio.com)
		  - "client" : value is a Twilio Client identity (e.g. marco(at)gmail.com)
		  - "number" : value is a PSTN E.164 number
		With `action`, Twilio asks that URL what to do once the dial ends (nobody
		answered, busy, or the call is over); `timeout` is how long they ring.
		"""
		resp = VoiceResponse()
		extra = {}
		if timeout:
			extra["timeout"] = timeout
		if action:
			extra["action"] = action
			extra["method"] = "POST"
		dial = Dial(
			caller_id=caller_id,
			ring_tone=ring_tone,
			record=self.settings.record_calls,
			recording_status_callback=self.get_recording_status_callback_url(),
			recording_status_callback_event="completed",
			**extra,
		)
		cb_kwargs = {
			"status_callback_event": "initiated ringing answered completed",
			"status_callback": self.get_update_call_status_callback_url(),
			"status_callback_method": "POST",
		}
		for kind, value in targets:
			if not value:
				continue
			if kind == "sip":
				dial.sip(value, **cb_kwargs)
			elif kind == "client":
				dial.client(value, **cb_kwargs)
			elif kind == "number":
				dial.number(value, **cb_kwargs)
		resp.append(dial)
		return resp

	@classmethod
	def get_twilio_client(self):
		twilio_settings = frappe.get_doc("CRM Twilio Settings")
		if not twilio_settings.enabled:
			frappe.throw(_("Please enable twilio settings before making a call."))

		auth_token = get_decrypted_password("CRM Twilio Settings", "CRM Twilio Settings", "auth_token")
		client = TwilioClient(twilio_settings.account_sid, auth_token)

		return client


class IncomingCall:
	def __init__(self, from_number, to_number, meta=None, call_sid=None):
		self.from_number = from_number
		self.to_number = to_number
		self.meta = meta
		self.call_sid = call_sid

	def process(self):
		"""Process the incoming call
		* Outside office hours, when the owner turned that on: the after-hours message
		  (and a message recording when allowed), without ringing anybody.
		* Otherwise ring every person who answers this number at once (CRM Telephony
		  Agent with this twilio_number: their phone, the CRM in their browser or a SIP
		  softphone). The first to answer takes it; when nobody does within the ring
		  time, crm.integrations.twilio.api.twilio_dial_outcome decides what follows.
		"""
		from crm import calls_answer
		from crm.inbox import office_hours

		twilio = Twilio.connect()
		settings = inbox_settings()
		rules = calls_answer.policy(settings)
		if rules["after_hours"] and is_closed(settings, office_hours):
			mark_unanswered(self.call_sid, "closed", after_hours=True)
			return calls_answer.unanswered(
				rules,
				closed=True,
				language=calls_answer.site_language(),
				recording_callback=twilio.get_recording_status_callback_url(),
				done_url=twilio.get_message_done_url(),
			)

		owners = get_twilio_number_owners(self.to_number)
		targets = ring_targets(twilio, owners)
		if not targets:
			mark_unanswered(self.call_sid, "no-answer")
			if rules["voicemail"]:
				return calls_answer.unanswered(
					rules,
					closed=False,
					language=calls_answer.site_language(),
					recording_callback=twilio.get_recording_status_callback_url(),
					done_url=twilio.get_message_done_url(),
				)
			resp = VoiceResponse()
			resp.say(_("Agent is unavailable to take the call, please call after some time."))
			return resp
		return twilio.generate_twilio_parallel_response(
			targets,
			caller_id=self.from_number,
			timeout=rules["ring_seconds"],
			action=twilio.get_dial_outcome_url(),
		)


def inbox_settings():
	from crm import inbox

	return inbox.settings()


def is_closed(settings, office_hours) -> bool:
	from frappe.utils import now_datetime

	return office_hours.configured(settings) and not office_hours.is_open(settings, now_datetime())


def mark_unanswered(call_sid, outcome, after_hours=False):
	"""Note on the call's log that nobody was rung or answered (`outcome` is Twilio's
	DialCallStatus, or «closed»), so later status pushes of the caller's leg (which
	ends «completed» after a message) don't turn it into an answered call."""
	if not call_sid or not frappe.db.exists("CRM Call Log", call_sid):
		return
	meta = frappe.get_meta("CRM Call Log")
	values = {"status": OUTCOME_STATUS.get(outcome, "No Answer")}
	if meta.has_field("dial_outcome"):
		values["dial_outcome"] = outcome
	if after_hours and meta.has_field("after_hours"):
		values["after_hours"] = 1
	frappe.db.set_value("CRM Call Log", call_sid, values, update_modified=False)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- Twilio webhook, the TwiML answer follows


# Twilio's DialCallStatus → CRM Call Log status for a call nobody took.
OUTCOME_STATUS = {
	"closed": "No Answer",
	"no-answer": "No Answer",
	"busy": "Busy",
	"failed": "Failed",
	"canceled": "Canceled",
}


def ring_targets(twilio, owners) -> list:
	"""Every way to reach every person on this number, rung at once: a phone number,
	the browser dialer of a person signed in to the CRM, a SIP softphone (plus the
	browser of that person when signed in)."""
	targets = []
	if not owners:
		return targets
	signed_in = set(get_active_loggedin_users(list(owners.keys())))
	sip_domain = twilio.settings.get("sip_domain") if twilio.settings.get("enable_sip_phone") else ""
	for name, details in owners.items():
		device = details.get("call_receiving_device")
		mobile = details.get("agent_mobile") or details.get("mobile_no")
		if device == "Phone" and mobile:
			targets.append(("number", mobile))
			continue
		if device == "SIP Phone" and sip_domain and details.get("sip_username"):
			targets.append(("sip", f"sip:{details['sip_username']}@{sip_domain}"))
		if name in signed_in and device in ("Computer", "SIP Phone"):
			targets.append(("client", twilio.safe_identity(name)))
	return targets


def get_twilio_number_owners(phone_number):
	"""Get list of users who is using the phone_number.
	>>> get_twilio_number_owners("+11234567890")
	{
		'owner1': {'name': '..', 'mobile_no': '..', 'call_receiving_device': '...'},
		'owner2': {....}
	}
	"""
	# remove special characters from phone number and get only digits also remove white spaces
	# keep + sign in the number at start of the number
	phone_number = "".join([c for c in phone_number if c.isdigit() or c == "+"])
	# Raw SQL bypass: this runs in a Guest-context webhook (Twilio voice_url),
	# and Frappe's permission system filters CRM Telephony Agent / User reads
	# in that context. Talking directly to frappe.db.sql guarantees the routing
	# logic sees every agent assigned to this Twilio number.
	user_voice_settings = frappe.db.sql(
		"""SELECT name, call_receiving_device, sip_username, mobile_no AS agent_mobile
		FROM `tabCRM Telephony Agent`
		WHERE twilio_number = %s""",
		(phone_number,),
		as_dict=True,
	)
	user_wise_voice_settings = {user["name"]: user for user in user_voice_settings}

	if not user_wise_voice_settings:
		return {}

	user_general_settings = frappe.db.sql(
		"""SELECT name, mobile_no FROM `tabUser` WHERE name IN %(users)s""",
		{"users": tuple(user_wise_voice_settings.keys())},
		as_dict=True,
	)
	user_wise_general_settings = {user["name"]: user for user in user_general_settings}

	return merge_dicts(user_wise_general_settings, user_wise_voice_settings)


def agent_for_leg(to) -> str:
	"""The CRM user a dialled leg reached: «client:<identity>», «sip:<user>@<domain>»
	or the phone number of an agent whose calls go to their phone."""
	to = (to or "").strip()
	if to.startswith("client:"):
		identity = to[len("client:") :]
		return Twilio.emailid_from_identity(identity) if identity else ""
	if to.startswith("sip:"):
		username = to[4:].split("@", 1)[0]
		return (
			frappe.db.get_value("CRM Telephony Agent", {"sip_username": username}, "user") or ""
			if username
			else ""
		)
	digits = "".join(c for c in to if c.isdigit())
	if len(digits) < 7:
		return ""
	for name, mobile in frappe.db.sql(
		"""SELECT a.name, COALESCE(NULLIF(a.mobile_no, ''), u.mobile_no) FROM `tabCRM Telephony Agent` a
		JOIN `tabUser` u ON u.name = a.name
		WHERE a.call_receiving_device = 'Phone'"""
	):
		if mobile and "".join(c for c in mobile if c.isdigit())[-10:] == digits[-10:]:
			return name
	return ""


def get_active_loggedin_users(users):
	"""Filter the current loggedin users from the given users list"""
	rows = frappe.db.sql(
		"""
		SELECT `user`
		FROM `tabSessions`
		WHERE `user` IN %(users)s
		""",
		{"users": users},
	)
	return [row[0] for row in set(rows)]


def get_the_call_attender(owners, caller=None):
	"""Get attender details from list of owners"""
	if not owners:
		return
	current_loggedin_users = get_active_loggedin_users(list(owners.keys()))

	if len(current_loggedin_users) > 1 and caller:
		deal_owner = frappe.db.get_value("CRM Deal", {"mobile_no": caller}, "deal_owner")
		if not deal_owner:
			deal_owner = frappe.db.get_value(
				"CRM Lead", {"mobile_no": caller, "converted": False}, "lead_owner"
			)
		for user in current_loggedin_users:
			if user == deal_owner:
				current_loggedin_users = [user]

	for name, details in owners.items():
		device = details["call_receiving_device"]
		if (
			(device == "Phone" and details["mobile_no"])
			or (device == "Computer" and name in current_loggedin_users)
			or (device == "SIP Phone" and details.get("sip_username"))
		):
			return details


class TwilioCallDetails:
	def __init__(self, call_info, call_from=None, call_to=None):
		self.call_info = call_info
		self.account_sid = call_info.get("AccountSid")
		self.application_sid = call_info.get("ApplicationSid")
		self.call_sid = call_info.get("CallSid")
		self.call_status = self.get_call_status(call_info.get("CallStatus"))
		self._call_from = call_from or call_info.get("From")
		self._call_to = call_to or call_info.get("To")

	def get_direction(self):
		caller = (self.call_info.get("Caller") or "").lower()
		if caller.startswith("client") or caller.startswith("sip:"):
			return "Outgoing"
		return "Incoming"

	def get_from_number(self):
		return self._call_from or self.call_info.get("From")

	def get_to_number(self):
		return self._call_to or self.call_info.get("To")

	@classmethod
	def get_call_status(cls, twilio_status):
		"""Convert Twilio given status into system status."""
		twilio_status = twilio_status or ""
		return " ".join(twilio_status.split("-")).title()

	def to_dict(self):
		"""Convert call details into dict."""
		direction = self.get_direction()
		from_number = self.get_from_number()
		to_number = self.get_to_number()
		caller = ""
		receiver = ""

		if direction == "Outgoing":
			caller = self.call_info.get("Caller") or ""
			if caller.lower().startswith("sip:"):
				# SIP softphone-originated call: sip:<username>@<domain>.
				# Resolve to the CRM user via CRM Telephony Agent.sip_username.
				sip_username = caller[4:].split("@", 1)[0]
				caller = (
					frappe.db.get_value("CRM Telephony Agent", {"sip_username": sip_username}, "user") or ""
					if sip_username
					else ""
				)
			else:
				identity = caller.replace("client:", "").strip()
				caller = Twilio.emailid_from_identity(identity) if identity else ""
		# An incoming call rings the whole team: whoever answers becomes its receiver
		# (crm.integrations.twilio.api.update_call_status_info); until then it is the team's.

		return {
			"type": direction,
			"status": self.call_status,
			"id": self.call_sid,
			"from": from_number,
			"to": to_number,
			"receiver": receiver,
			"caller": caller,
		}
