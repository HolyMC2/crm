"""Pure URL classification for the Manual de la tienda entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_MANUAL_PATH = re.compile(r"^/crm/manual(?:/nuevo|/[^/]+(?:/editar)?)?/*$")


def is_manual_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_MANUAL_PATH.fullmatch(parts.path))
