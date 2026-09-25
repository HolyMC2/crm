"""Explicit inbound automation per exact customer account.

A policy is reviewed against the current bot route, activated binding and the
published Chatflow revision, then published by an accountable manager. Every
grant and every dispatch rechecks it: pausing, editing, a changed route/flow or
a publisher who lost authority stops new automatic effects immediately.
No keyword, historical receipt or customer text can publish or widen a policy.
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, now_datetime

from crm.api import automation_departments as departments
from crm.api import conversations as control

DOCTYPE = "CRM Automation Policy"
STATUSES = ("Draft", "Published", "Paused")
EDITABLE = ("title", "provider", "account_id", "flow", "department", "cooldown_minutes")
ACCOUNT_TYPES = {
	"Webchat": "CRM Webchat Channel",
	"WhatsApp": "WhatsApp Account",
	"Messenger": "Messenger Page",
	"Instagram": "Messenger Page",
}
MAX_COOLDOWN = 7 * 24 * 60
_SERVICE_TOKEN = object()
PUBLIC = (
	"name",
	"title",
	"provider",
	"account_id",
	"account_record",
	"flow",
	"flow_hash",
	"department",
	"cooldown_minutes",
	"status",
	"revision",
	"published_revision",
	"bot_binding",
	"bot_profile",
	"published_by",
	"published_at",
	"paused_by",
	"paused_at",
	"pause_reason",
	"modified",
)


def _mark(doc):
	doc.flags.crm_automation_policy_service = _SERVICE_TOKEN
	return doc


def route_key(provider, account_id):
	control.conversation_key(provider, account_id, "0" * 64 if provider == "Webchat" else "1")
	return control._digest([1, "crm_automation_policy", frappe.local.site, provider, account_id])


def policy_hash(doc):
	return control._digest(
		[
			1,
			doc.name,
			doc.provider,
			doc.account_id,
			doc.account_record or None,
			doc.bot_binding or None,
			doc.bot_profile or None,
			doc.flow,
			doc.flow_hash or None,
			doc.department or None,
			cint(doc.cooldown_minutes),
			cint(doc.published_revision),
		]
	)


def validate_policy_doc(doc):
	if doc.flags.get("crm_automation_policy_service") is not _SERVICE_TOKEN:
		frappe.throw(_("Use the automation policy actions."), frappe.PermissionError)
	doc.title = control._text(doc.title, 140)
	if doc.provider not in control.PROVIDERS:
		frappe.throw(_("Unsupported customer conversation provider."))
	route_key(doc.provider, doc.account_id)
	doc.flow = control._text(doc.flow, 140)
	departments.department(doc.department or None)
	cooldown = doc.cooldown_minutes
	if isinstance(cooldown, bool) or not isinstance(cooldown, int) or not 0 <= cooldown <= MAX_COOLDOWN:
		frappe.throw(_("Cooldown must be between 0 and {0} minutes.").format(MAX_COOLDOWN))
	if doc.status not in STATUSES or cint(doc.revision) < 1:
		frappe.throw(_("Invalid automation policy state."))
	if doc.status == "Published":
		if doc.route_key != route_key(doc.provider, doc.account_id) or doc.published_hash != policy_hash(doc):
			frappe.throw(_("Published automation identity is immutable."))
	elif doc.route_key:
		frappe.throw(_("Only a published policy owns an account route."))


def _require_manager(user=None):
	user = user or frappe.session.user
	roles = control._roles(user)
	if not roles & control.MANAGERS:
		control._deny()
	return roles


def _probe(provider, account_id, user=None, write=True):
	control.conversation_key(provider, account_id, "0" * 64 if provider == "Webchat" else "1")
	probe = frappe._dict(
		provider=provider,
		account_id=account_id,
		name=None,
		shop_key=None,
		reference_doctype=None,
		reference_name=None,
	)
	return control._authorize(probe, user, write=write)


def projection(doc, **extra):
	result = {field: doc.get(field) for field in PUBLIC}
	result.update(extra)
	return result


def _values(values):
	if isinstance(values, str):
		if len(values.encode()) > 20000:
			frappe.throw(_("Automation policy is too large."))
		values = frappe.parse_json(values)
	if not isinstance(values, dict) or set(values) - set(EDITABLE):
		frappe.throw(_("Automation policy contains unsupported fields."))
	return values


def _adapter():
	from crm.api.outbox import bot_adapter

	return bot_adapter()


def list_policies(provider=None, account_id=None):
	_require_manager()
	filters = {}
	if provider:
		filters["provider"] = provider
	if account_id:
		filters["account_id"] = account_id
	rows = frappe.get_all(DOCTYPE, filters=filters, fields=["name"], order_by="modified desc", limit=100)
	result = []
	for row in rows:
		doc = frappe.get_doc(DOCTYPE, row.name)
		if permitted(lambda: _probe(doc.provider, doc.account_id, write=False)):
			result.append(projection(doc))
	return result


def permitted(check):
	"""Per-row authorization probe without leaking denial messages to the response."""
	messages = list(getattr(frappe.local, "message_log", []) or [])
	try:
		check()
		return True
	except (frappe.PermissionError, frappe.DoesNotExistError, frappe.ValidationError):
		return False
	finally:
		frappe.local.message_log = messages


def get_policy(name):
	_require_manager()
	doc = frappe.get_doc(DOCTYPE, control._text(name, 140))
	_probe(doc.provider, doc.account_id, write=False)
	return projection(doc)


def save_policy(values, name=None, expected_revision=None):
	_require_manager()
	values = _values(values)
	if name:
		doc = frappe.get_doc(DOCTYPE, control._text(name, 140), for_update=True)
		if expected_revision is None or cint(expected_revision) != cint(doc.revision):
			control._conflict()
		if doc.status == "Published":
			frappe.throw(_("Pause the published policy before editing it."))
		_probe(doc.provider, doc.account_id)
		for field in EDITABLE:
			if field in values:
				doc.set(field, values[field])
		doc.revision = cint(doc.revision) + 1
		doc.status = "Draft"
		doc.flow_hash = doc.bot_binding = doc.bot_profile = doc.account_record = None
	else:
		doc = frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"status": "Draft",
				"revision": 1,
				"cooldown_minutes": 1440,
				**{k: values.get(k) for k in EDITABLE if k in values},
			}
		)
	if isinstance(doc.cooldown_minutes, str) and doc.cooldown_minutes.isdigit():
		doc.cooldown_minutes = int(doc.cooldown_minutes)
	_probe(doc.provider, doc.account_id)
	_mark(doc)
	if name:
		doc.save(ignore_permissions=True)
	else:
		doc.insert(ignore_permissions=True)
	return projection(doc)


def _site_ready():
	reasons = []
	for doctype, field in (
		("FCRM Settings", "conversation_automation_enabled"),
		("Marketing Settings", "enable_automation"),
	):
		value = frappe.db.sql(
			"SELECT value FROM `tabSingles` WHERE doctype=%s AND field=%s", (doctype, field)
		)
		if not value or str(value[0][0]) != "1":
			reasons.append(_("Enable {0}.{1} after reviewing automation.").format(doctype, field))
	return reasons


def resolve_route(provider, account_record):
	"""(binding, profile, reasons) from Doco's exact route; never a first-row fallback."""
	if "doco" not in frappe.get_installed_apps() or not frappe.db.exists("DocType", "Bot Channel Binding"):
		return None, None, [_("Install the Doco bot platform before automating customer accounts.")]
	from doco.docoutils.assistant import bot_policy

	binding = bot_policy.resolve_route(
		provider=provider, account_type=ACCOUNT_TYPES[provider], account=account_record, entry_point="default"
	)
	if not binding:
		return None, None, [_("Create and activate a customer bot connection for this exact account.")]
	connection = frappe.db.get_value(
		"Bot Channel Binding", binding, ["name", "bot_profile", "active", "activated_revision"], as_dict=True
	)
	profile = frappe.db.get_value(
		"Bot Profile",
		connection.bot_profile,
		["name", "audience", "paused", "published_revision"],
		as_dict=True,
	)
	reasons = []
	if not profile or profile.audience != "Customer":
		reasons.append(_("The account's bot must be a customer bot."))
	elif (
		not connection.active or profile.paused or connection.activated_revision != profile.published_revision
	):
		reasons.append(_("Activate the reviewed bot connection for this account first."))
	return connection, profile, reasons


def review(doc):
	reasons = list(_site_ready())
	account_record = None
	try:
		account_record = control._account(doc.provider, doc.account_id).name
	except frappe.PermissionError:
		reasons.append(_("The exact customer account is unavailable or disabled."))
	connection = profile = None
	if account_record:
		connection, profile, route_reasons = resolve_route(doc.provider, account_record)
		reasons.extend(route_reasons)
	try:
		from crm.api.outbox import automation_ready

		if automation_ready(doc.provider) is not True:
			reasons.append(_("Customer automation is not ready for {0}.").format(doc.provider))
	except Exception:
		reasons.append(_("Customer automation readiness could not be verified."))
	flow = {}
	adapter = _adapter()
	if not adapter:
		reasons.append(_("Install the Chatflow automation adapter (doco_marketing) and its hooks."))
	else:
		try:
			flow = adapter.policy_flow(doc.flow, doc.provider, profile.name if profile else None) or {}
		except frappe.ValidationError as error:
			reasons.append(str(error) or _("The Chatflow cannot be used for automatic starts."))
		reasons.extend(flow.get("blockers") or [])
		if profile and flow.get("run_as_user"):
			from doco.docoutils.assistant import bot_policy

			published = bot_policy.published(frappe.get_doc("Bot Profile", profile.name)) or {}
			if published.get("execution_user") != flow.get("run_as_user"):
				reasons.append(
					_("The flow and the account's bot must use the same dedicated execution User.")
				)
	other = frappe.db.get_value(
		DOCTYPE, {"route_key": route_key(doc.provider, doc.account_id), "name": ["!=", doc.name]}, "name"
	)
	if other:
		reasons.append(_("Another published policy already owns this account. Pause it first."))
	state = {
		"account_record": account_record,
		"bot_binding": connection.name if connection else None,
		"bot_profile": profile.name if profile else None,
		"bot_revision": profile.published_revision if profile else None,
		"flow_hash": flow.get("hash"),
		"flow_department": flow.get("department"),
		"blockers": reasons,
	}
	state["review_hash"] = control._digest(
		[
			doc.name,
			cint(doc.revision),
			state["account_record"],
			state["bot_binding"],
			state["bot_profile"],
			state["bot_revision"],
			state["flow_hash"],
			reasons,
		]
	)
	return state


def review_policy(name):
	_require_manager()
	doc = frappe.get_doc(DOCTYPE, control._text(name, 140))
	_probe(doc.provider, doc.account_id)
	return projection(doc, review=review(doc))


def publish_policy(name, expected_revision, review_hash, approval_note):
	_require_manager()
	doc = frappe.get_doc(DOCTYPE, control._text(name, 140), for_update=True)
	_probe(doc.provider, doc.account_id)
	if cint(expected_revision) != cint(doc.revision):
		control._conflict()
	if doc.status == "Published":
		frappe.throw(_("This policy is already published."))
	note = control._text(approval_note, 500)
	state = review(doc)
	if state["blockers"]:
		frappe.throw(" ".join(state["blockers"]))
	if review_hash != state["review_hash"]:
		frappe.throw(_("The account, bot or flow changed. Review the policy again."))
	doc.update(
		{
			"status": "Published",
			"account_record": state["account_record"],
			"bot_binding": state["bot_binding"],
			"bot_profile": state["bot_profile"],
			"flow_hash": state["flow_hash"],
			"department": doc.department or state.get("flow_department"),
			"published_revision": cint(doc.revision),
			"published_by": frappe.session.user,
			"published_at": now_datetime(),
			"approval_note": note,
			"paused_by": None,
			"paused_at": None,
			"pause_reason": None,
			"route_key": route_key(doc.provider, doc.account_id),
		}
	)
	doc.published_hash = policy_hash(doc)
	try:
		_mark(doc).save(ignore_permissions=True)
	except (frappe.UniqueValidationError, frappe.DuplicateEntryError):
		frappe.throw(_("Another published policy already owns this account. Pause it first."))
	return projection(doc)


def pause_policy(name, reason=None):
	"""Any manager authorized on the account may stop automation; no review is needed to stop."""
	_require_manager()
	doc = frappe.get_doc(DOCTYPE, control._text(name, 140), for_update=True)
	_probe(doc.provider, doc.account_id)
	if doc.status != "Published":
		return projection(doc)
	doc.update(
		{
			"status": "Paused",
			"route_key": None,
			"published_hash": None,
			"paused_by": frappe.session.user,
			"paused_at": now_datetime(),
			"pause_reason": control._text(reason, 500, required=False) or None,
		}
	)
	_mark(doc).save(ignore_permissions=True)
	return projection(doc)


def published_for(provider, account_id):
	"""Locked current Published policy for this exact account, else None."""
	if not frappe.db.exists("DocType", DOCTYPE):
		return None
	name = frappe.db.get_value(
		DOCTYPE,
		{"route_key": route_key(provider, account_id), "status": "Published"},
		"name",
		for_update=True,
	)
	return frappe.get_doc(DOCTYPE, name, for_update=True) if name else None


def grant_reason(policy, conversation):
	"""None when this published policy can still authorize bot control here."""
	if not policy or policy.status != "Published":
		return "automation_policy_inactive"
	if policy.route_key != route_key(
		policy.provider, policy.account_id
	) or policy.published_hash != policy_hash(policy):
		return "automation_policy_changed"
	if (policy.provider, policy.account_id) != (
		conversation.provider,
		conversation.account_id,
	) or policy.account_record != conversation.account_record:
		return "automation_policy_scope"
	try:
		roles, _account = control._authorize(conversation, policy.published_by, write=True)
	except (frappe.PermissionError, frappe.DoesNotExistError):
		return "automation_policy_publisher_revoked"
	if not roles & control.MANAGERS:
		return "automation_policy_publisher_revoked"
	connection, profile, reasons = resolve_route(policy.provider, policy.account_record)
	if (
		reasons
		or not connection
		or connection.name != policy.bot_binding
		or profile.name != policy.bot_profile
	):
		return "automation_policy_route_changed"
	return None


def cooldown_reason(policy, conversation):
	"""Human or bot handling inside the window keeps the conversation with people.

	A customer reply that retired a bot counts (its human fallback must stick);
	an ordinary customer message that changed nothing does not.
	"""
	minutes = cint(policy.cooldown_minutes)
	if not minutes:
		return None
	since = add_to_date(now_datetime(), minutes=-minutes)
	recent = frappe.db.sql(
		"""SELECT name FROM `tabCRM Conversation Control Event` WHERE conversation=%s AND creation>=%s
        AND (action IN ('take','transfer','release','pause','close','reopen','start_bot','policy_start_bot',
                        'bot_handoff','route')
             OR (action IN ('customer_reply','customer_input')
                 AND reason IN ('webchat_customer_held_bot','customer_reply_held_bot','customer_input_fallback')))
        LIMIT 1""",
		(conversation.name, since),
	)
	return "automation_policy_cooldown" if recent else None
