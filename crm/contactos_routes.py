"""Pure URL classification shared by the web gate and its bench-free tests."""

import re
from urllib.parse import urlsplit

_IDENTITY_PATH = re.compile(
	r"^/crm/(?:contactos(?:/(?:contact|customer|supplier|organization|lead|crm-lead|address)/[^/]+)?|contacts(?:/view(?:/[^/]+)?|/[^/]+)?|organizations(?:/view(?:/[^/]+)?|/[^/]+)?)/*$"
)


def is_contactos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_IDENTITY_PATH.fullmatch(parts.path))


def is_contactos_recovery_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and parts.path == "/crm/not-permitted"
