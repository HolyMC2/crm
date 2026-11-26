"""Pure URL classification for the Avisos entry gate (bench-free tests).

The old CRM notifications page redirects here in the SPA, so a worker without
sales access still reaches their avisos instead of a refusal. «Avisos del asistente»
(/crm/asistente/avisos) is a staff account's too: a stock or accounts manager sets their own
notices there without sales access."""

import re
from urllib.parse import urlsplit

_AVISOS_PATH = re.compile(r"^/crm/(?:avisos|notifications|asistente/avisos)/*$")


def is_avisos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_AVISOS_PATH.fullmatch(parts.path))
