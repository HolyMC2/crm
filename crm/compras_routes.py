"""Pure URL classification for the Compras entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_COMPRAS_PATH = re.compile(r"^/crm/compras(?:/nueva|/(?:orden|solicitud)/[^/]+)?/*$")


def is_compras_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_COMPRAS_PATH.fullmatch(parts.path))
