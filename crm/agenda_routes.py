"""Pure URL classification for the Agenda entry gate (bench-free tests).

`/crm/calendar` is the retired CRM Calendar: it boots neutral so the client can
redirect it to `/crm/agenda` for workers without sales access too.
"""

import re
from urllib.parse import urlsplit

_AGENDA_PATH = re.compile(r"^/crm/(?:agenda|calendar)/*$")


def is_agenda_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_AGENDA_PATH.fullmatch(parts.path))
