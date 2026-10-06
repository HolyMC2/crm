"""Pure URL classification for the Archivos entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_ARCHIVOS_PATH = re.compile(r"^/crm/archivos/*$")


def is_archivos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_ARCHIVOS_PATH.fullmatch(parts.path))
