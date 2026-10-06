"""Pure URL classification for the Avisos entry gate (bench-free tests).

The old CRM notifications page redirects here in the SPA, so a worker without
sales access still reaches their avisos instead of a refusal."""

import re
from urllib.parse import urlsplit

_AVISOS_PATH = re.compile(r"^/crm/(?:avisos|notifications)/*$")


def is_avisos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_AVISOS_PATH.fullmatch(parts.path))
