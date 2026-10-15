"""Pure URL classification for the Gastos entry gate (bench-free tests)."""

import re
from urllib.parse import urlsplit

# The queue, a supplier bill (`/factura/`), an employee's expense claim (`/gasto/`) and a
# captured document under review (`/captura/`, ARC-S2.6).
_GASTOS_PATH = re.compile(r"^/crm/gastos(?:/(?:factura|gasto|captura)/[^/]+)?/*$")


def is_gastos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_GASTOS_PATH.fullmatch(parts.path))
