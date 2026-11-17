"""Personal mailboxes: only their owner reads their mail.

Frappe lets System Managers and Super Email Users read every Email Account's mail, and a
Communication linked to a record is readable by whoever reads that record (Desk's timeline reads
them with raw SQL). An Email Account whose «Who reads it» (`crm_alcance`) is Personal narrows all
of that for everyone but its owner (`crm_dueno`):

- its mail is left out of every permission-aware list and refused on open;
- its mail never links itself to records (contacts, leads, deals), so no timeline shows it;
- the mailbox never creates contacts or leads and is never a default for sending or receiving;
- the account itself is hidden from other users' settings lists.

Shared mailboxes keep Frappe's rule: System Managers read all of them, other users the ones on
their «User Emails». Administrator keeps full access for support and scheduled jobs.
"""

import frappe
from frappe import _

PERSONAL = "Personal"
SHARED = "Shared"
CACHE_KEY = "crm:correo:personal_accounts"


# --------------------------------------------------------------------------- #
# which mailboxes are personal
# --------------------------------------------------------------------------- #
def personal_accounts():
	"""{Email Account name: owner} of every personal mailbox, cached until an Email Account changes."""
	cached = frappe.cache.get_value(CACHE_KEY)
	if cached is not None:
		return cached
	accounts = {}
	if frappe.db.has_column("Email Account", "crm_alcance"):
		for row in frappe.get_all(
			"Email Account", filters={"crm_alcance": PERSONAL}, fields=["name", "crm_dueno"]
		):
			accounts[row.name] = row.crm_dueno or ""
	frappe.cache.set_value(CACHE_KEY, accounts)
	return accounts


def clear_cache(doc=None, method=None):
	frappe.cache.delete_value(CACHE_KEY)


def hidden_from(user=None):
	"""Personal mailboxes this user may not read: every one owned by someone else."""
	user = user or frappe.session.user
	if user == "Administrator":
		return []
	return sorted(name for name, owner in personal_accounts().items() if owner != user)


def is_personal(account):
	return bool(account) and account in personal_accounts()


def _in_list(names):
	return ", ".join(frappe.db.escape(name) for name in names)


# --------------------------------------------------------------------------- #
# Communication
# --------------------------------------------------------------------------- #
def communication_query(user=None, doctype=None):
	"""ANDed with Frappe's own Communication condition (permission_query_conditions hook)."""
	hidden = hidden_from(user)
	if not hidden:
		return ""
	return (
		"(`tabCommunication`.email_account is null"
		f" or `tabCommunication`.email_account not in ({_in_list(hidden)}))"
	)


def communication_permission(doc, ptype=None, user=None, debug=False):
	"""has_permission hook: every hook must allow, so anything but someone else's personal mail is True."""
	return doc.get("email_account") not in hidden_from(user)


def communication_validate(doc, method=None):
	"""Personal mail stays out of shared records: Frappe re-links matching contacts on every save,
	so the links (and an automatic reference) are dropped every time."""
	if not is_personal(doc.get("email_account")):
		return
	doc.timeline_links = []
	if doc.reference_doctype and doc.reference_doctype != "Communication":
		doc.reference_doctype = None
		doc.reference_name = None


def refuse_link(account):
	"""correo.vincular on personal mail: say why, and what to do instead."""
	if is_personal(account):
		frappe.throw(
			_(
				"This email is in a personal mailbox, which only its owner reads. "
				"Forward it to a shared mailbox to link it to a record."
			),
			frappe.PermissionError,
		)


# --------------------------------------------------------------------------- #
# Email Account
# --------------------------------------------------------------------------- #
def email_account_query(user=None, doctype=None):
	hidden = hidden_from(user)
	if not hidden:
		return ""
	return f"`tabEmail Account`.name not in ({_in_list(hidden)})"


def email_account_permission(doc, ptype=None, user=None, debug=False):
	return doc.name not in hidden_from(user) if not doc.is_new() else True


def email_account_validate(doc, method=None):
	"""A personal mailbox has an owner, is nobody's default, and creates nothing in the CRM."""
	if (doc.get("crm_alcance") or SHARED) != PERSONAL:
		return
	if not doc.get("crm_dueno"):
		doc.crm_dueno = frappe.session.user
	doc.default_incoming = 0
	doc.default_outgoing = 0
	doc.create_contact = 0
	if doc.meta.has_field("create_lead_from_incoming_email"):
		doc.create_lead_from_incoming_email = 0
	doc.append_to = None
	for folder in doc.get("imap_folder") or []:
		folder.append_to = None


def email_account_changed(doc, method=None):
	"""After a save or delete: forget the cached list, and keep «User Emails» in line with a
	personal mailbox (only its owner has it)."""
	clear_cache()
	if method == "on_trash" or (doc.get("crm_alcance") or SHARED) != PERSONAL:
		return
	owner = doc.get("crm_dueno")
	for user in readers(doc.name):
		if user != owner:
			set_reader(user, doc.name, False)
	if owner:
		set_reader(owner, doc.name, True)


def readers(account):
	"""Users who have the mailbox in their «User Emails» (Frappe's per-user mail rule)."""
	return frappe.get_all("User Email", filters={"email_account": account}, pluck="parent")


READER_ROLE = "Inbox User"


def set_reader(user, account, reads):
	"""Add or remove one mailbox in one user's «User Emails». A reader also gets «Inbox User»,
	Frappe's role for reading mail; their «User Emails» still decide which mailboxes they see.
	The role stays when a mailbox is removed: with no «User Emails» it shows no mail."""
	has = bool(frappe.db.exists("User Email", {"parent": user, "email_account": account}))
	needs_role = (
		reads
		and frappe.db.exists("Role", READER_ROLE)
		and READER_ROLE not in frappe.get_roles(user)
		and "System Manager" not in frappe.get_roles(user)
	)
	if has == bool(reads) and not needs_role:
		return
	user_doc = frappe.get_doc("User", user)
	if reads and not has:
		user_doc.append("user_emails", {"email_account": account})
	elif not reads:
		user_doc.user_emails = [row for row in user_doc.user_emails if row.email_account != account]
	if needs_role:
		user_doc.append("roles", {"role": READER_ROLE})
	user_doc.flags.ignore_permissions = True
	user_doc.save()
