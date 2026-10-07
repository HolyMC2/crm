"""Pure URL classification for the Cobranza entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_COBRANZA_PATH = re.compile(r"^/crm/cobranza(?:/cliente/[^/]+)?/*$")


def is_cobranza_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_COBRANZA_PATH.fullmatch(parts.path))
