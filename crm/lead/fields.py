"""What the prospect and deal forms show, from the shop's prospect settings.

Applied to the layouts the forms read (`get_fields_layout(..., entry=1)`) and to the side
panels, never to what the layout editors read: an editor that saved a stripped layout would
lose the fields for good, and turning «Vendo a empresas» back on must bring them back.
"""

import json

from crm.lead import settings as prospect_settings

COMPANY_FIELDS = {
	"CRM Lead": frozenset({"organization", "website", "annual_revenue", "no_of_employees", "industry"}),
	"CRM Deal": frozenset(
		{"organization", "organization_name", "website", "annual_revenue", "no_of_employees", "industry"}
	),
}
# A form (Quick Entry) drops these sections whole: the deal form's details section holds the
# territory beside the company, and a shop that sells to people never asked for either.
# The record keeps its territory (only the company fields leave the data tab).
COMPANY_SECTIONS = frozenset({"organization_section", "organization_details_section"})
# Asked only when the shop wants them; the record keeps showing a value that is there.
PERSON_FIELDS = {"ask_salutation": "salutation", "ask_gender": "gender"}
PHONE_FIELDS = ("mobile_no", "phone")
SOURCE_FILTER = json.dumps({"disabled": 0})


def hidden(doctype: str, layout_type: str, values: dict) -> set[str]:
	out = set()
	if not values.get("companies"):
		out |= COMPANY_FIELDS.get(doctype, set())
	if doctype == "CRM Lead" and layout_type == "Quick Entry":
		out |= {field for key, field in PERSON_FIELDS.items() if not values.get(key)}
	return out


def apply(doctype: str, layout_type: str, tabs: list, values: dict | None = None) -> list:
	"""Drop the hidden fields (and the sections they leave empty); on the prospect form,
	mark the phone required and offer only the shop's origins."""
	if doctype not in COMPANY_FIELDS or not isinstance(tabs, list):
		return tabs
	values = values if values is not None else prospect_settings.get()
	drop = hidden(doctype, layout_type, values)
	entry = doctype == "CRM Lead" and layout_type == "Quick Entry"
	for tab in tabs:
		if not isinstance(tab, dict):
			continue
		if "sections" in tab:
			kept = tab.get("sections") or []
			if layout_type == "Quick Entry" and not values.get("companies"):
				kept = [s for s in kept if not (isinstance(s, dict) and s.get("name") in COMPANY_SECTIONS)]
			tab["sections"] = _sections(kept, drop)
	if entry:
		_mark_entry(tabs, values)
	return tabs


def apply_sections(doctype: str, sections: list, values: dict | None = None) -> list:
	"""The side panel's sections (no tabs)."""
	if doctype not in COMPANY_FIELDS or not isinstance(sections, list):
		return sections
	values = values if values is not None else prospect_settings.get()
	return _sections(sections, hidden(doctype, "Side Panel", values))


def _sections(sections, drop):
	if not drop:
		return sections
	kept = []
	for section in sections:
		columns = section.get("columns") if isinstance(section, dict) else None
		if not columns:
			kept.append(section)
			continue
		had_fields = False
		for column in columns:
			fields = (column or {}).get("fields") or []
			had_fields = had_fields or bool(fields)
			column["fields"] = [field for field in fields if _name(field) not in drop]
		if had_fields and not any((column or {}).get("fields") for column in columns):
			continue  # the section held only hidden fields: no hollow header
		kept.append(section)
	return kept


def _mark_entry(tabs, values):
	fields = [field for field in _fields(tabs) if isinstance(field, dict)]
	if values.get("phone_required"):
		# The first phone the form asks for carries the requirement (mobile_no is WhatsApp's).
		phone = next(
			(f for name in PHONE_FIELDS for f in fields if f.get("fieldname") == name),
			None,
		)
		if phone:
			phone["reqd"] = 1
	for field in fields:
		if field.get("fieldname") == "source" and prospect_settings.origins_can_hide():
			field["link_filters"] = _merged_filters(field.get("link_filters"))


def _merged_filters(current):
	try:
		parsed = json.loads(current) if isinstance(current, str) and current else current or {}
	except ValueError:
		parsed = {}
	if not isinstance(parsed, dict):
		return SOURCE_FILTER  # a list-style filter the form cannot merge: the origins win
	return json.dumps({**parsed, "disabled": 0})


def _fields(tabs):
	for tab in tabs:
		for section in (tab or {}).get("sections") or []:
			for column in (section or {}).get("columns") or []:
				yield from (column or {}).get("fields") or []


def _name(field):
	return field.get("fieldname") if isinstance(field, dict) else field
