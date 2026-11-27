"""How the shop's line answers a call nobody can take: outside office hours, or when
the team doesn't pick up in time.

The owner sets it in CRM Inbox Settings (Bandeja de clientes > Llamadas):
- `call_after_hours` with `call_after_hours_message`: outside the inbox's office hours
  the caller hears the message instead of ringing a closed shop;
- `call_voicemail` with `call_voicemail_prompt`: when nobody answers (or the shop is
  closed) the caller can leave a message, which lands on the call as its recording;
- `call_ring_seconds`: how long the team's phones ring before that.

Everything here is pure TwiML building over a settings mapping; the Twilio webhooks in
crm.integrations.twilio.api decide when to use it.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint
from twilio.twiml.voice_response import VoiceResponse

DEFAULT_RING_SECONDS = 25
MIN_RING_SECONDS, MAX_RING_SECONDS = 5, 60
MESSAGE_SECONDS = 120

# Twilio's neural voice per language; a language not listed gets Twilio's default voice.
VOICES = {
	"es-MX": "Polly.Mia-Neural",
	"es-US": "Polly.Lupe-Neural",
	"es-ES": "Polly.Lucia-Neural",
	"en-US": "Polly.Joanna-Neural",
	"en-GB": "Polly.Amy-Neural",
	"pt-BR": "Polly.Camila-Neural",
	"fr-FR": "Polly.Lea-Neural",
	"de-DE": "Polly.Vicki-Neural",
	"it-IT": "Polly.Bianca-Neural",
}


def policy(settings) -> dict:
	"""The line's answer settings from CRM Inbox Settings (a doc or a mapping)."""
	get = settings.get
	ring = cint(get("call_ring_seconds")) or DEFAULT_RING_SECONDS
	return {
		"after_hours": bool(
			cint(get("call_after_hours")) and (get("call_after_hours_message") or "").strip()
		),
		"after_hours_message": (get("call_after_hours_message") or "").strip(),
		"voicemail": bool(cint(get("call_voicemail"))),
		"voicemail_prompt": (get("call_voicemail_prompt") or "").strip(),
		"ring_seconds": min(max(ring, MIN_RING_SECONDS), MAX_RING_SECONDS),
	}


def speech_language(lang: str, country_code: str) -> str:
	"""«es» + «mx» → «es-MX»; a language that already names its region keeps it."""
	lang = (lang or "").strip().replace("_", "-")
	if not lang:
		return ""
	base, _sep, region = lang.partition("-")
	region = (region or country_code or "").strip()
	return f"{base.lower()}-{region.upper()}" if region else base.lower()


def site_language() -> str:
	lang = frappe.db.get_single_value("System Settings", "language") or frappe.local.lang or ""
	country = frappe.db.get_single_value("System Settings", "country") or ""
	code = frappe.db.get_value("Country", country, "code") if country else ""
	return speech_language(lang, code or "")


def _say(resp, text, language):
	if not text:
		return
	kwargs = {}
	if language:
		kwargs["language"] = language
		if language in VOICES:
			kwargs["voice"] = VOICES[language]
	resp.say(text, **kwargs)


def unanswered(rules: dict, *, closed: bool, language: str, recording_callback: str, done_url: str):
	"""What the caller hears when the shop is closed (`closed`) or nobody answered:
	the after-hours message when closed, then the message prompt and a recording when
	the owner allows messages. Without either, the call simply ends."""
	resp = VoiceResponse()
	if closed and rules["after_hours"]:
		_say(resp, rules["after_hours_message"], language)
	if rules["voicemail"]:
		_say(resp, rules["voicemail_prompt"], language)
		resp.record(
			max_length=MESSAGE_SECONDS,
			play_beep=True,
			timeout=5,
			finish_on_key="#",
			action=done_url,
			method="POST",
			recording_status_callback=recording_callback,
			recording_status_callback_event="completed",
		)
	resp.hangup()
	return resp


def hang_up():
	resp = VoiceResponse()
	resp.hangup()
	return resp
