"""Pure URL classification for the Resultados entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

_RESULTADOS_PATH = re.compile(r"^/crm/resultados(?:/documentos|/documento/[^/]+/[^/]+)?/*$")


def is_resultados_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_RESULTADOS_PATH.fullmatch(parts.path))
