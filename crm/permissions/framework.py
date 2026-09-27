"""Muelle framework capabilities this CRM revision depends on.

A base image without them must never take the whole site down. CRM surfaces
that rely on filtered history, link titles or shared-document scope fail
closed; every other request, job, install and migration keeps running and
logs what is missing.
"""

from importlib import import_module
from urllib.parse import unquote

import frappe
from frappe import _

REQUIREMENTS = (
	("frappe.core.doctype.version.version", "VERSION_HISTORY_FILTER_VERSION"),
	("frappe.desk.form.load", "LINK_TITLES_FILTER_VERSION"),
	("frappe.share", "FILTER_SHARED_DOCUMENTS_VERSION"),
)
PROTECTED_DOCTYPES = frozenset({"CRM Lead", "CRM Deal", "CRM Pipeline"})
DOCTYPE_KEYS = ("doctype", "reference_doctype", "parenttype")
METHOD_PREFIXES = ("/api/method/", "/api/v2/method/")
DOCUMENT_PREFIXES = ("/api/resource/", "/api/v2/document/", "/api/v2/doctype/")

_warned = set()


def missing():
	return [marker for module, marker in REQUIREMENTS if getattr(import_module(module), marker, 0) != 1]


def unsupported_message():
	return _(
		"This CRM action needs the supported framework base. Ask an administrator to update the site image."
	)


def require():
	if missing():
		frappe.throw(unsupported_message(), frappe.PermissionError)


def warn_if_missing(context="migrate"):
	absent = missing()
	if not absent or (context, tuple(absent)) in _warned:
		return absent
	_warned.add((context, tuple(absent)))
	frappe.logger("crm").warning(
		"CRM framework capabilities missing (%s): %s. CRM lead, deal and pipeline surfaces stay closed until the supported base is installed.",
		context,
		", ".join(absent),
	)
	return absent


def before_install():
	warn_if_missing("install")


def before_migrate():
	warn_if_missing("migrate")


def check_request():
	if not missing():
		return
	if is_crm_request():
		require()
	warn_if_missing("request")


def check_job(method=None, **kwargs):
	if not missing():
		return
	if isinstance(method, str) and method.startswith("crm."):
		require()
	warn_if_missing("job")


def is_crm_request():
	request = getattr(frappe.local, "request", None)
	path = unquote(getattr(request, "path", "") or "")
	if path == "/crm" or path.startswith("/crm/"):
		return True
	form = frappe.local.form_dict or {}
	method = form.get("cmd") or ""
	for prefix in METHOD_PREFIXES:
		if path.startswith(prefix):
			method = path[len(prefix) :]
	if isinstance(method, str) and method.startswith("crm."):
		return True
	doctypes = {value for key in DOCTYPE_KEYS if isinstance(value := form.get(key), str)}
	for prefix in DOCUMENT_PREFIXES:
		if path.startswith(prefix):
			doctypes.add(path[len(prefix) :].split("/", 1)[0])
	return bool(doctypes & PROTECTED_DOCTYPES)
