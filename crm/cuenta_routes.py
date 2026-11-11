"""Pure URL classification for the account pages: Mi cuenta and Mi perfil (bench-free tests).

Their tabs and sheets ride on the query (``/crm/cuenta?tab=facturacion``, ``?activar=1``),
so each page is one path.
"""

import re
from urllib.parse import urlsplit

_CUENTA_PATH = re.compile(r"^/crm/cuenta/*$")
_PERFIL_PATH = re.compile(r"^/crm/perfil/*$")


def _matches(pattern, path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(pattern.fullmatch(parts.path))


def is_cuenta_path(path):
	return _matches(_CUENTA_PATH, path)


def is_perfil_path(path):
	return _matches(_PERFIL_PATH, path)
