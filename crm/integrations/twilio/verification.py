"""Validate Twilio's signed webhook against the configured public callback URL."""

from twilio.request_validator import RequestValidator


def request_is_authentic(request, auth_token: str | None, public_url: str) -> bool:
	if not request or not auth_token or not public_url or request.method not in {"GET", "POST"}:
		return False
	# Frappe merges body fields over query fields even for GET. Twilio signs only
	# that GET URL, so no unsigned form/JSON body may override the signed arguments.
	if request.method == "GET" and (
		request.content_length not in (None, 0) or request.form or request.get_data(cache=True)
	):
		return False
	if request.method == "POST" and request.mimetype != "application/x-www-form-urlencoded":
		return False
	signature = request.headers.get("X-Twilio-Signature", "")
	if not signature:
		return False
	try:
		# Preserve the raw query bytes: decoding and re-encoding changes Twilio's signature input.
		if request.query_string:
			public_url += "?" + request.query_string.decode("ascii")
		parameters = request.form if request.method == "POST" else {}
		return RequestValidator(auth_token).validate(public_url, parameters, signature)
	except (TypeError, ValueError, UnicodeError):
		return False
