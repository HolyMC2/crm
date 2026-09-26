"""Pipeline configuration and enforcement shared by Desk, imports and the SPA."""

import frappe
from frappe import _
from frappe.utils import cint, flt

LEGACY_PIPELINE = "legacy-sales"


def require_shared_scope_support():
	"""Never activate mandatory pipeline scope on a core where shares bypass it."""
	from frappe import share

	if getattr(share, "FILTER_SHARED_DOCUMENTS_VERSION", 0) != 1:
		frappe.throw(
			_(
				"CRM requires the Muelle shared-document scope hook (version 1). Install the supported base image before enabling or migrating CRM."
			),
			frappe.PermissionError,
		)


def check_request_compatibility():
	# This hook is loaded only on sites with CRM installed. Requests must also
	# fail closed if a site is rolled back onto an incompatible base image.
	if installed():
		require_shared_scope_support()


def filter_shared_documents(user, doctype, names):
	"""Sharing may grant ownership access, but never bypass pipeline/company scope."""
	if doctype not in ("CRM Lead", "CRM Deal", "CRM Pipeline"):
		raise ValueError("Unexpected pipeline share type")
	if not names:
		return []
	if not installed():
		return list(names)
	condition = record_query(doctype, user, field="name" if doctype == "CRM Pipeline" else "pipeline")
	return frappe.db.sql(
		f"SELECT name FROM `tab{doctype}` WHERE name IN %(names)s AND ({condition})",
		{"names": tuple(names)},
		pluck=True,
	)


def deny_shared_documents(user, doctype, names):
	"""Private broker records cannot be exposed through native DocShare fallback."""
	return []


def installed():
	return frappe.db.exists("DocType", "CRM Pipeline") and frappe.db.has_column("CRM Deal", "pipeline")


def lines(value):
	return [part.strip() for part in (value or "").splitlines() if part.strip()]


def required_fields(value):
	return [part.strip() for part in (value or "").replace("\n", ",").split(",") if part.strip()]


def _user_scopes(user):
	from frappe.core.doctype.user_permission.user_permission import get_user_permissions

	permissions = get_user_permissions(user)
	return {key: {row.doc for row in permissions.get(key, [])} for key in ("CRM Pipeline", "Company")}


def allowed_pipeline_names(user=None):
	"""Bounded reads; no per-deal permission query or optional app import."""
	user = user or frappe.session.user
	rows = frappe.get_all("CRM Pipeline", fields=["name", "sales_company"])
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return [row.name for row in rows]
	roles = set(frappe.get_roles(user))
	scopes = _user_scopes(user)
	restricted = {}
	for row in frappe.get_all("CRM Pipeline Role", fields=["parent", "role"]):
		restricted.setdefault(row.parent, set()).add(row.role)
	return [
		row.name
		for row in rows
		if (not restricted.get(row.name) or restricted[row.name] & roles)
		and (not scopes["CRM Pipeline"] or row.name in scopes["CRM Pipeline"])
		and (not row.sales_company or not scopes["Company"] or row.sales_company in scopes["Company"])
	]


def can_access_pipeline(name, user=None):
	return not name or not installed() or name in allowed_pipeline_names(user)


def pipeline_permission(doc, ptype=None, user=None, **kwargs):
	if ptype == "create" or doc.is_new():
		return None
	if doc.name and not can_access_pipeline(doc.name, user):
		return False
	return None


def pipeline_query(user=None):
	return record_query("CRM Pipeline", user, field="name")


def record_company_allowed(company, user=None):
	user = user or frappe.session.user
	if not company or user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	companies = _user_scopes(user)["Company"]
	return not companies or company in companies


def record_query(doctype, user=None, field="pipeline"):
	if not installed():
		return ""
	names = allowed_pipeline_names(user)
	column = f"`tab{doctype}`.`{field}`"
	allowed = ", ".join(frappe.db.escape(name) for name in names) or "NULL"
	condition = f"({column} IS NULL OR {column} = '' OR {column} IN ({allowed}))"
	user = user or frappe.session.user
	if (
		doctype != "CRM Pipeline"
		and user != "Administrator"
		and "System Manager" not in frappe.get_roles(user)
	):
		companies = _user_scopes(user)["Company"]
		if companies:
			company_values = ", ".join(frappe.db.escape(company) for company in companies)
			company_column = f"`tab{doctype}`.`sales_company`"
			condition += f" AND ({company_column} IS NULL OR {company_column} = '' OR {company_column} IN ({company_values}))"
	return condition


def validate_company(company):
	if company and frappe.db.exists("DocType", "Company"):
		if not frappe.db.exists("Company", company):
			frappe.throw(_("Company {0} does not exist.").format(company))
		frappe.get_doc("Company", company).check_permission("read")


def default_pipeline(company=None):
	allowed = allowed_pipeline_names()
	rows = (
		frappe.get_all(
			"CRM Pipeline",
			filters={"archived": 0, "name": ["in", allowed]},
			fields=["name", "sales_company", "is_default"],
			order_by="creation asc, name asc",
		)
		if allowed
		else []
	)
	# A default in a different company is never used implicitly.
	for scope in dict.fromkeys((company or "", "")):
		candidates = [row for row in rows if (row.sales_company or "") == scope]
		defaults = [row for row in candidates if row.is_default]
		if len(defaults) > 1:
			frappe.throw(_("Multiple default pipelines exist. Ask a manager to choose one."))
		if defaults:
			return defaults[0].name
		if len(candidates) == 1:
			return candidates[0].name
	return None


def validate_record(doc):
	if not installed():
		return
	before = doc.get_doc_before_save()
	if before and (
		not can_access_pipeline(before.pipeline) or not record_company_allowed(before.get("sales_company"))
	):
		frappe.throw(_("You do not have access to the previous pipeline."), frappe.PermissionError)
	if not doc.pipeline:
		doc.pipeline = default_pipeline(doc.get("sales_company"))
	if not doc.pipeline:
		frappe.throw(_("Select an available sales pipeline. Ask a manager to configure a default."))
	if not can_access_pipeline(doc.pipeline):
		frappe.throw(_("You do not have access to this sales pipeline."), frappe.PermissionError)
	pipeline = frappe.get_doc("CRM Pipeline", doc.pipeline, for_update=True)
	changed_pipeline = not before or before.pipeline != doc.pipeline
	if pipeline.archived and changed_pipeline:
		frappe.throw(_("This pipeline is archived. Select an active pipeline."))
	if pipeline.sales_company:
		if doc.sales_company and doc.sales_company != pipeline.sales_company:
			frappe.throw(_("The record company must match its pipeline company."))
		doc.sales_company = pipeline.sales_company
	if not record_company_allowed(doc.sales_company):
		frappe.throw(_("You do not have access to this company scope."), frappe.PermissionError)
	validate_company(doc.sales_company)
	if doc.doctype == "CRM Lead":
		return
	status_metadata = {
		row.name: row
		for row in frappe.get_all(
			"CRM Deal Status",
			filters={"name": ["in", [row.status for row in pipeline.stages]]},
			fields=["name", "type", "hidden"],
		)
	}
	if not doc.currency and pipeline.currency:
		doc.currency = pipeline.currency
	if not doc.status:
		doc.status = next(
			(
				row.status
				for row in pipeline.stages
				if not row.archived
				and not row.allowed_from
				and not status_metadata.get(row.status, {}).get("hidden")
				and status_metadata.get(row.status, {}).get("type") not in ("Won", "Lost")
			),
			None,
		)
	stage = next((row for row in pipeline.stages if row.status == doc.status), None)
	if not stage:
		frappe.throw(_("Stage {0} is not part of pipeline {1}.").format(doc.status, pipeline.pipeline_name))
	stage_archived = stage.archived or status_metadata.get(stage.status, {}).get("hidden")
	entering = changed_pipeline or not before or before.status != doc.status
	if entering:
		if stage_archived:
			frappe.throw(
				_("This stage is archived. Existing records retain their history; select an active stage.")
			)
		roles = set(lines(stage.transition_roles))
		if roles and frappe.session.user != "Administrator" and not roles.intersection(frappe.get_roles()):
			frappe.throw(_("Your role cannot enter this stage."), frappe.PermissionError)
		allowed_from = lines(stage.allowed_from)
		if allowed_from and (not before or changed_pipeline or before.status not in allowed_from):
			frappe.throw(_("Enter this stage from one of: {0}.").format(", ".join(allowed_from)))
	# Existing archived stages remain editable, even if requirements changed later.
	if not stage_archived:
		missing = [name for name in required_fields(stage.required_fields) if doc.get(name) in (None, "", [])]
		if missing:
			labels = [doc.meta.get_label(name) for name in missing]
			frappe.throw(
				_("Complete these fields for this stage: {0}.").format(", ".join(labels)),
				frappe.MandatoryError,
			)
	if pipeline.probability_policy == "Stage" or (
		pipeline.probability_policy == "Legacy" and doc.is_new() and not doc.probability
	):
		doc.probability = flt(stage.probability)
	elif doc.probability is None:
		doc.probability = flt(stage.probability)
	if not 0 <= flt(doc.probability) <= 100:
		frappe.throw(_("Probability must be between 0 and 100."))


def validate_configuration(doc):
	require_shared_scope_support()
	validate_company(doc.sales_company)
	# Lock the singleton metadata row so concurrent defaults serialize in MariaDB.
	frappe.db.sql("SELECT name FROM `tabDocType` WHERE name = 'CRM Pipeline' FOR UPDATE")
	if not doc.stages:
		frappe.throw(_("Add at least one stage."))
	seen = set()
	deal_meta = frappe.get_meta("CRM Deal")
	for row in doc.stages:
		if row.status in seen:
			frappe.throw(_("A stage can occur only once in a pipeline."))
		seen.add(row.status)
		row.outcome = frappe.db.get_value("CRM Deal Status", row.status, "type")
		if not row.outcome:
			frappe.throw(_("Choose an existing deal stage."))
		if not 0 <= flt(row.probability) <= 100:
			frappe.throw(_("Stage probability must be between 0 and 100."))
		if row.outcome in ("Won", "Lost"):
			row.probability = 100 if row.outcome == "Won" else 0
		for name in required_fields(row.required_fields):
			field = deal_meta.get_field(name)
			if (
				not field
				or field.read_only
				or field.fieldtype
				in (
					"Table",
					"Table MultiSelect",
					"Password",
					"Section Break",
					"Column Break",
					"Tab Break",
					"HTML",
					"Button",
				)
			):
				frappe.throw(_("{0} cannot be a stage requirement.").format(name))
		for role in lines(row.transition_roles):
			if not frappe.db.exists("Role", role):
				frappe.throw(_("Role {0} does not exist.").format(role))
	for row in doc.stages:
		if any(name not in seen for name in lines(row.allowed_from)):
			frappe.throw(_("Allowed previous stages must belong to this pipeline."))
	if (
		doc.name != LEGACY_PIPELINE
		and not doc.archived
		and not any(
			not row.archived and row.outcome not in ("Won", "Lost") and not row.allowed_from
			for row in doc.stages
		)
	):
		frappe.throw(_("Keep an active opening stage without a previous-stage restriction."))
	before = doc.get_doc_before_save()
	if before:
		removed = {row.status for row in before.stages} - seen
		if removed:
			frappe.throw(_("Archive stages instead of removing them to preserve historical membership."))
		if before.sales_company != doc.sales_company and any(
			frappe.db.exists(dt, {"pipeline": doc.name}) for dt in ("CRM Lead", "CRM Deal")
		):
			frappe.throw(_("A pipeline with records cannot change company. Create a new pipeline."))
	if doc.archived and doc.is_default:
		frappe.throw(_("An archived pipeline cannot be the default."))
	if cint(doc.is_default):
		other = frappe.db.sql(
			"SELECT name, sales_company FROM `tabCRM Pipeline` WHERE is_default = 1 AND name != %s FOR UPDATE",
			(doc.name or "",),
			as_dict=True,
		)
		if any((row.sales_company or "") == (doc.sales_company or "") for row in other):
			frappe.throw(_("This company scope already has a default pipeline. Remove that default first."))


def add_legacy_status(doc, method=None):
	"""New optional-app/global statuses join only the compatibility pipeline."""
	if not installed() or not frappe.db.exists("CRM Pipeline", LEGACY_PIPELINE):
		return
	pipeline = frappe.get_doc("CRM Pipeline", LEGACY_PIPELINE)
	if any(row.status == doc.name for row in pipeline.stages):
		return
	pipeline.append(
		"stages",
		{"status": doc.name, "probability": flt(doc.probability), "archived": cint(doc.get("hidden"))},
	)
	pipeline.save(ignore_permissions=True)
