"""Pure URL classification for the Bancos entry gate (bench-free tests).

/crm/bancos (cards), /crm/bancos/cuenta/<cuenta> (one account), /crm/bancos/catalogo[/<cuenta>]
(the account tree, one account's ledger) and /crm/bancos/balanza.
"""

import re
from urllib.parse import urlsplit

_BANCOS_PATH = re.compile(r"^/crm/bancos(?:/cuenta/[^/]+|/catalogo(?:/[^/]+)?|/balanza)?/*$")


def is_bancos_path(path):
	if not isinstance(path, str) or "\\" in path:
		return False
	parts = urlsplit(path)
	return not parts.scheme and not parts.netloc and bool(_BANCOS_PATH.fullmatch(parts.path))
