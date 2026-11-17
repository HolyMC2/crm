"""«Who reads it» for one mailbox, from Settings > Email (rules in crm.permissions.correo).

Shared: the people chosen here have it in their «User Emails»; System Managers read every shared
mailbox anyway (Frappe's rule). Personal: only its owner reads it. Only a System Manager changes a
shared mailbox, and only the owner changes a personal one.

The change writes the scope fields directly instead of saving the Email Account: a full save
logs in to the IMAP and SMTP servers again, which is slow and fails on any password hiccup that
has nothing to do with who reads the mail.
"""

import frappe
from frappe import _
from frappe.utils import get_fullname

from crm.permissions import correo as privado


def _account(name):
	if (
		not name
		or not frappe.db.exists("Email Account", name)
		or not frappe.has_permission("Email Account", "read", name)
	):
		frappe.throw(_("This mailbox does not exist or you cannot see it."), frappe.PermissionError)
	return frappe.get_doc("Email Account", name)


def _scope(doc):
	return privado.PERSONAL if doc.get("crm_alcance") == privado.PERSONAL else privado.SHARED


def _can_edit(doc):
	if frappe.session.user == "Administrator":
		return True
	if _scope(doc) == privado.PERSONAL:
		return doc.get("crm_dueno") == frappe.session.user
	return "System Manager" in frappe.get_roles()


def _person(user):
	return {"user": user, "name": get_fullname(user)}


@frappe.whitelist()
def audience(account: str):
	"""Who reads this mailbox, and whether this person may change it."""
	doc = _account(account)
	scope = _scope(doc)
	owner = doc.get("crm_dueno") or ""
	return {
		"account": doc.name,
		"scope": scope,
		"owner": _person(owner) if owner and scope == privado.PERSONAL else None,
		"readers": [_person(user) for user in privado.readers(doc.name)] if scope == privado.SHARED else [],
		"can_edit": _can_edit(doc),
		"is_owner": owner == frappe.session.user,
	}


@frappe.whitelist(methods=["POST"])
def save_audience(account: str, scope: str, readers: list | str | None = None):
	"""Make the mailbox Personal (the person saving owns it) or Shared with `readers`."""
	doc = _account(account)
	if not _can_edit(doc):
		if _scope(doc) == privado.PERSONAL:
			frappe.throw(_("Only its owner can change a personal mailbox."), frappe.PermissionError)
		frappe.throw(_("Ask an administrator to change who reads this mailbox."), frappe.PermissionError)
	if isinstance(readers, str):
		readers = frappe.parse_json(readers)
	wanted = {
		user
		for user in (readers or [])
		if isinstance(user, str) and frappe.db.exists("User", {"name": user, "enabled": 1})
	}
	if scope == privado.PERSONAL:
		_apply_personal(doc, frappe.session.user)
	else:
		_apply_shared(doc, wanted)
	return audience(doc.name)


def _apply_personal(doc, owner):
	values = {
		"crm_alcance": privado.PERSONAL,
		"crm_dueno": owner,
		"default_incoming": 0,
		"default_outgoing": 0,
		"create_contact": 0,
		"append_to": None,
	}
	if doc.meta.has_field("create_lead_from_incoming_email"):
		values["create_lead_from_incoming_email"] = 0
	frappe.db.set_value("Email Account", doc.name, values)
	frappe.db.set_value("IMAP Folder", {"parent": doc.name, "parenttype": "Email Account"}, "append_to", None)
	_after(doc.name)


def _apply_shared(doc, wanted):
	frappe.db.set_value("Email Account", doc.name, {"crm_alcance": privado.SHARED, "crm_dueno": None})
	current = set(privado.readers(doc.name))
	for user in sorted(wanted - current):
		privado.set_reader(user, doc.name, True)
	for user in sorted(current - wanted):
		privado.set_reader(user, doc.name, False)
	_after(doc.name)


def _after(name):
	frappe.clear_document_cache("Email Account", name)
	privado.email_account_changed(frappe.get_doc("Email Account", name), "on_update")
