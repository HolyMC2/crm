"""Pure URL classification for the Documentos and Inventario entry gates (bench-free tests)."""

import re
from urllib.parse import urlsplit

# /crm/documentos, a profile list (/facturas), a record or /nuevo (/facturas/X), and the
# generic floor for any readable doctype (/tipo/<doctype>[/<name>]).
_DOCUMENTOS_PATH = re.compile(r"^/crm/documentos(?:/tipo/[^/]+(?:/[^/]+)?|/[^/]+(?:/[^/]+)?)?/*$")
# Inventario pages (kardex, stock entries, adjustments, stores) live one or two levels down.
_INVENTARIO_PATH = re.compile(r"^/crm/inventario(?:/[^/]+(?:/[^/]+)?)?/*$")


def _local(path):
	if not isinstance(path, str) or "\\" in path:
		return None
	parts = urlsplit(path)
	if parts.scheme or parts.netloc:
		return None
	return parts.path


def is_documentos_path(path):
	local = _local(path)
	return bool(local and _DOCUMENTOS_PATH.fullmatch(local))


def is_inventario_path(path):
	local = _local(path)
	return bool(local and _INVENTARIO_PATH.fullmatch(local))
