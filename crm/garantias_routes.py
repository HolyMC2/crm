"""Pure URL classification for the Garantías entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_GARANTIAS_PATH = re.compile(r"^/crm/garantias(?:/[^/]+)?/*$")


def is_garantias_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_GARANTIAS_PATH.fullmatch(parts.path))
