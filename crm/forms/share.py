# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""QR codes for a form's public link.

Rendered with `pyqrcode`, which Frappe already ships for two-factor setup, so no
new dependency reaches the frontend bundle. The builder turns the SVG into a PNG
for download in the browser.
"""

from io import BytesIO
from urllib.parse import urlsplit

import frappe
from frappe import _

PUBLIC_PREFIX = "/crm-form/"


def qr_svg(route: str, url: str) -> str:
	"""An SVG QR code for `url`, which must be this form's public page (optionally
	carrying query parameters such as UTM tags)."""
	parts = urlsplit(url or "")
	if parts.scheme not in ("http", "https") or parts.path.rstrip("/") != PUBLIC_PREFIX + route:
		frappe.throw(_("A QR code can only point at this form's own link."))
	if len(url) > 1000:
		frappe.throw(_("That link is too long for a QR code."))

	from pyqrcode import create

	buffer = BytesIO()
	create(url, error="M").svg(
		buffer,
		scale=8,
		quiet_zone=2,
		xmldecl=False,
		svgns=True,
		module_color="#000000",
		background="#ffffff",
	)
	return buffer.getvalue().decode()
