"""Pure URL classification for the Encuestas entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_ENCUESTAS_PATH = re.compile(r"^/crm/encuestas(?:/[^/]+)?/*$")


def is_encuestas_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_ENCUESTAS_PATH.fullmatch(parts.path))
