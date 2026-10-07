"""Pure URL classification for the Productos entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_PRODUCTOS_PATH = re.compile(r"^/crm/productos(?:/[^/]+)?/*$")


def is_productos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_PRODUCTOS_PATH.fullmatch(parts.path))
