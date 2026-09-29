# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Send a test submission and show the author exactly what it did.

The submission runs the real path — the same record insert and every hook a
public submission triggers (enrichment, assignment, notifications, follow-up,
attribution) — inside a savepoint, and everything is rolled back afterwards.
Work queued for after the commit (realtime pushes, after-commit jobs) is dropped
with it, so nothing is saved, sent or enqueued.
"""

from contextlib import contextmanager

import frappe
from frappe import _

from crm.forms import settings as form_settings
from crm.forms import wiring

SAVEPOINT = "crm_form_test_submission"
BREAKS = ("Section Break", "Column Break")
TEST_UTM = {"utm_source": "test", "utm_medium": "crm-form-test"}


@contextmanager
def _rolled_back():
	db = frappe.db
	queued = {name: list(getattr(db, name)._functions) for name in ("before_commit", "after_commit")}
	had_realtime = hasattr(frappe.local, "_realtime_log")
	realtime = list(getattr(frappe.local, "_realtime_log", []) or [])
	db.savepoint(SAVEPOINT)
	try:
		yield
	finally:
		db.rollback(save_point=SAVEPOINT)
		for name, functions in queued.items():
			manager = getattr(db, name)
			manager._functions.clear()
			manager._functions.extend(functions)
		if had_realtime:
			frappe.local._realtime_log = realtime
		elif hasattr(frappe.local, "_realtime_log"):
			del frappe.local._realtime_log


@contextmanager
def _as_web_submission(form_name: str, consent: bool):
	saved = {key: frappe.form_dict.get(key) for key in ("web_form", "crm_utm", "crm_consent")}
	had_flag = frappe.flags.get("in_web_form")
	frappe.form_dict.update(
		{"web_form": form_name, "crm_utm": dict(TEST_UTM), "crm_consent": 1 if consent else 0}
	)
	frappe.flags.in_web_form = True
	try:
		yield
	finally:
		frappe.flags.in_web_form = had_flag
		for key, value in saved.items():
			if value is None:
				frappe.form_dict.pop(key, None)
			else:
				frappe.form_dict[key] = value


def run(web_form, values: dict, consent: bool = False) -> dict:
	missing = [
		f.label or f.fieldname
		for f in web_form.web_form_fields
		if f.fieldtype not in BREAKS and f.reqd and values.get(f.fieldname) in (None, "")
	]
	if missing:
		return {"ok": False, "error": _("Fill in the required fields: {0}").format(", ".join(missing))}

	report = {"ok": True, "rolled_back": True, "document_type": web_form.doc_type}
	frappe.flags.crm_form_after_submit = None
	try:
		with _rolled_back(), _as_web_submission(web_form.name, consent):
			doc = frappe.new_doc(web_form.doc_type)
			for f in web_form.web_form_fields:
				if f.fieldtype in BREAKS:
					continue
				doc.set(f.fieldname, values.get(f.fieldname, ""))
			doc.insert(ignore_permissions=True)
			report.update(_describe(doc, web_form))
	except frappe.ValidationError as e:
		frappe.clear_last_message()
		return {"ok": False, "error": str(e) or _("The record couldn't be created.")}
	finally:
		frappe.flags.crm_form_after_submit = None
	return report


def _describe(doc, web_form) -> dict:
	"""Read back what the submission produced, before it's rolled back."""
	doc.reload()
	owner_field = wiring.OWNER_FIELD[doc.doctype]
	settings = form_settings.of_form(web_form)
	record = {
		"name": doc.name,
		"title": doc.get("lead_name") or doc.get("deal_name") or doc.get("organization") or doc.name,
		"status": doc.get("status"),
		"source": doc.get("source"),
		"owner": doc.get(owner_field),
		"utm": {k: doc.get(k) for k in wiring.UTM_KEYS if doc.get(k)},
	}
	assigned = frappe.get_all(
		"ToDo",
		filters={"reference_type": doc.doctype, "reference_name": doc.name, "status": "Open"},
		pluck="allocated_to",
	)
	if settings["assign_mode"] == "user" and record["owner"] == settings["assign_to"]:
		how = "form"
	elif record["owner"] or assigned:
		how = "rules"
	else:
		how = "nobody"
	notifications = frappe.get_all(
		"CRM Notification",
		filters={"notification_type_doctype": doc.doctype, "notification_type_doc": doc.name},
		fields=["to_user", "type"],
	)
	out = {
		"record": record,
		"assignment": {"how": how, "users": sorted(set(assigned) | ({record["owner"]} - {None}))},
		"notifications": notifications,
		"comment": bool(
			frappe.db.exists("Comment", {"reference_doctype": doc.doctype, "reference_name": doc.name})
		),
		"marketing": form_settings.marketing_installed(),
		"enrollments": [],
		"touchpoints": 0,
		"consent": False,
	}
	if out["marketing"]:
		link = "lead" if doc.doctype == "CRM Lead" else "deal"
		out["enrollments"] = frappe.get_all(
			"CRM Campaign Enrollment",
			filters={link: doc.name},
			fields=["campaign", "status"],
		)
		for row in out["enrollments"]:
			row["title"] = frappe.db.get_value("CRM Campaign", row["campaign"], "title")
			row["from_form"] = row["campaign"] == settings["campaign"]
		out["touchpoints"] = frappe.db.count(
			"CRM Touchpoint", {"reference_doctype": doc.doctype, "reference_name": doc.name}
		)
		out["consent"] = bool((frappe.flags.get("crm_form_after_submit") or {}).get("consent"))
	return out
