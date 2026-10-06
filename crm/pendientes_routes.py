"""Pure URL classification for the Pendientes entry gate (bench-free tests).

Legacy CRM task lists belong here too: the SPA redirects them to Pendientes,
so a worker without sales access still reaches the queue instead of a refusal."""

import re
from urllib.parse import urlsplit

_PENDIENTES_PATH = re.compile(
	r"^/crm/(?:pendientes(?:/(?:todo|crm-task)/[^/]+)?|tasks(?:/view(?:/[^/]+)?)?)/*$"
)


def is_pendientes_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_PENDIENTES_PATH.fullmatch(parts.path))


def is_shell_root(path):
	"""The SPA root (`/crm`, the installed app's start URL), with or without a query."""
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and parts.path.rstrip("/") == "/crm"
