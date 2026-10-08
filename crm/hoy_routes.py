"""Pure URL classification for the Hoy entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_HOY_PATH = re.compile(r"^/crm/hoy/*$")


def is_hoy_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_HOY_PATH.fullmatch(parts.path))
