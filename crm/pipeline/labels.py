# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""What a stage or a pipeline reads as in text the server composes.

Server twin of frontend/src/utils/stageLabel.js. Stage names (CRM Deal Status /
CRM Lead Status IDs) and pipeline names (CRM Pipeline.pipeline_name) are data a
tenant may rename, so the stored value never changes; only the label drawn for
the worker is translated:
- a stage through the catalog while its doctype is a translated doctype (the
  switch Frappe and the SPA honour); a renamed or custom stage has no catalog
  entry and comes back unchanged;
- a pipeline only when it still carries the name CRM's pipeline migration gave
  it; anything a manager typed reads exactly as typed.
"""

import frappe
from frappe import _

from crm.pipeline.constants import STATUS_DOCTYPES
from crm.pipeline.services.configuration import LEGACY_PIPELINE_NAME

STANDARD_PIPELINE_NAMES = frozenset({LEGACY_PIPELINE_NAME})


def translates(doctype: str) -> bool:
	"""Whether the site draws this doctype's record names through the catalog."""
	return bool(frappe.get_meta(doctype).translated_doctype)


def stage_label(name: str | None, doctype: str = "CRM Deal Status", translated: bool | None = None) -> str:
	"""A stage name as the worker reads it. Pass `translated` when labelling many rows."""
	if not name:
		return ""
	if translated is None:
		translated = translates(STATUS_DOCTYPES.get(doctype, doctype))
	return _(name) if translated else name


def pipeline_label(name: str | None) -> str:
	"""A pipeline name as the worker reads it."""
	if not name:
		return ""
	return _(name) if name in STANDARD_PIPELINE_NAMES else name
