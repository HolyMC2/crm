"""Pure URL classification for the Equipo entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_EQUIPO_PATH = re.compile(r"^/crm/equipo(?:/persona/[^/]+|/vacaciones)?/*$")


def is_equipo_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_EQUIPO_PATH.fullmatch(parts.path))
