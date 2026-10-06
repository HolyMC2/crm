"""Customer links for issued offers: a tokenized page to read, accept, reject and message.

The customer page shows only the issued snapshot. Link, view and message state live in
CRM Offer Link / CRM Offer Message so customer activity never changes the offer's
`modified` (seller edits keep their stale-check) and internal deal comments are never
exposed. Decisions reuse `service.decide`, the same guard staff decisions use.
"""

import hashlib
import hmac
import json
import secrets

import frappe
from frappe import _
from frappe.utils import escape_html, get_url, now_datetime

from crm.offers import service
from crm.offers.contract import calculate, text

ONLINE = "Online"
ROUTE = "o"
MESSAGE_LIMIT = 2000
NAME_LIMIT = 140
VIEW_WINDOW = 30 * 60
# (limit, seconds) per bucket; writes are per token and per client IP.
LIMITS = {
	"write-token": (10, 600),
	"write-ip": (30, 600),
	"view-ip": (120, 600),
}
_WRITER = object()

# Frozen exposure contract: the only keys a customer page receives. A test locks them.
PUBLIC_KEYS = frozenset(
	{
		"title",
		"revision",
		"status",
		"valid_until",
		"currency",
		"currency_precision",
		"products",
		"total",
		"net_total",
		"terms",
		"terms_hash",
		"seller_company",
		"seller_logo",
		"seller_contact",
		"customer_name",
		"issued_at",
		"decision",
		"decided_at",
		"decided_by_name",
		"newer_url",
		"messages",
		"can_decide",
	}
)
PUBLIC_LINE_KEYS = frozenset({"product_name", "qty", "rate", "discount_percentage", "amount", "net_amount"})


def _fail(message, exception=frappe.ValidationError):
	frappe.throw(_(message), exception)


def guard_write(doc):
	if doc.flags.get("crm_offer_share") is not _WRITER:
		_fail("Use the offer actions to change customer links and messages.", frappe.PermissionError)


def _persist(doc):
	doc.flags.crm_offer_share = _WRITER
	doc.flags.ignore_permissions = True
	doc.save() if not doc.is_new() else doc.insert()
	return doc


def _hash(token):
	return hashlib.sha256(token.encode()).hexdigest()


def url_for(token):
	return get_url(f"/{ROUTE}/{token}")


# Token resolution --------------------------------------------------------------


def resolve(token):
	"""The CRM Offer Link for a customer token, or None. Never raises on garbage."""
	if not isinstance(token, str) or not 20 <= len(token) <= 128 or not token.isascii():
		return None
	wanted = _hash(token)
	row = frappe.db.get_value(
		"CRM Offer Link", {"token_hash": wanted}, ["name", "token_hash", "offer"], as_dict=True
	)
	if not row or not hmac.compare_digest(row.token_hash, wanted):
		return None
	if frappe.db.get_value("CRM Offer", row.offer, "status") in (None, "Draft"):
		return None
	return row


# Rate limiting (atomic, fail-closed) ------------------------------------------


def _user_agent():
	request = getattr(frappe.local, "request", None)
	return ((request and request.headers.get("User-Agent")) or "")[:300]


def client_ip():
	return getattr(frappe.local, "request_ip", None) or "unknown"


def _key(*parts):
	# Raw Redis commands skip Frappe's site prefix; add it so tenants never share counters.
	return ":".join(("crm-offer-share", frappe.local.site, *parts))


def _limited(bucket, key):
	limit, window = LIMITS[bucket]
	cache_key = _key(bucket, hashlib.sha256(str(key).encode()).hexdigest()[:32])
	try:
		cache = frappe.cache()
		count = cache.incrby(cache_key, 1)
		if count == 1:
			cache.expire(cache_key, window)
		return count > limit
	except Exception:
		return True


def _throttle(*buckets):
	for bucket, key in buckets:
		if _limited(bucket, key):
			_fail("Too many attempts. Wait a few minutes and try again.", frappe.RateLimitExceededError)


# Customer page context ----------------------------------------------------------


def _full_name(user):
	if not user or user in ("Guest", "Administrator"):
		return ""
	return frappe.db.get_value("User", user, "full_name") or ""


def _customer_name(deal):
	values = frappe.db.get_value("CRM Deal", deal, ["organization", "lead_name"], as_dict=True) or {}
	return values.get("organization") or values.get("lead_name") or ""


def _newer_url(doc):
	latest = frappe.get_all(
		"CRM Offer",
		filters={"root_offer": doc.root_offer, "revision": [">", doc.revision], "status": ["!=", "Draft"]},
		fields=["name"],
		order_by="revision desc",
		limit=1,
	)
	if not latest:
		return ""
	link = frappe.db.get_value("CRM Offer Link", {"offer": latest[0].name}, "name")
	if not link:
		return ""
	token = frappe.get_doc("CRM Offer Link", link).get_password("token", raise_exception=False)
	return url_for(token) if token else ""


def _messages(offer):
	rows = frappe.get_all(
		"CRM Offer Message",
		filters={"offer": offer},
		fields=["direction", "author", "message", "creation"],
		order_by="creation asc",
		limit=200,
	)
	return [
		{
			"from_customer": row.direction == "Customer",
			"author": "" if row.direction == "Customer" else _full_name(row.author),
			"message": row.message,
			"at": str(row.creation),
		}
		for row in rows
	]


def public_view(link):
	"""Everything the customer page may show, built only from the issued snapshot."""
	doc = frappe.get_doc("CRM Offer", link.offer)
	frozen = json.loads(doc.issued_snapshot)
	status = service.effective_status(doc)
	lines = calculate(frozen["products"], frozen["currency_precision"])["products"]
	view = {
		"title": frozen["title"],
		"revision": doc.revision,
		"status": status,
		"valid_until": str(frozen["valid_until"]),
		"currency": frozen["currency"],
		"currency_precision": frozen["currency_precision"],
		"products": [{key: row[key] for key in PUBLIC_LINE_KEYS} for row in lines],
		"total": frozen["total"],
		"net_total": frozen["net_total"],
		"terms": frozen.get("terms") or "",
		"terms_hash": doc.terms_hash,
		"seller_company": frozen.get("sales_company") or _business_name(),
		"seller_logo": frappe.db.get_single_value("FCRM Settings", "brand_logo") or "",
		"seller_contact": _full_name(doc.issued_by),
		"customer_name": _customer_name(doc.deal),
		"issued_at": str(doc.issued_at or ""),
		"decision": doc.status if doc.status in ("Accepted", "Rejected") else "",
		"decided_at": str(doc.decision_at or "") if doc.status in ("Accepted", "Rejected") else "",
		"decided_by_name": _evidence(doc).get("name", "") if doc.decision_channel == ONLINE else "",
		"newer_url": _newer_url(doc) if status == "Superseded" else "",
		"messages": _messages(doc.name),
		"can_decide": status == "Issued",
	}
	return view


def _business_name():
	from crm.forms.settings import business_name

	return business_name()


def _evidence(doc):
	try:
		value = json.loads(doc.decision_evidence or "{}")
	except ValueError:
		return {}
	return value if isinstance(value, dict) else {}


# Guest actions -------------------------------------------------------------------


def _locked(token):
	"""Resolve the token and lock deal → offer in the service's lock order."""
	link = resolve(token)
	if not link:
		raise frappe.DoesNotExistError(_("This link is not valid."))
	deal = frappe.db.get_value("CRM Offer", link.offer, "deal")
	frappe.db.get_value("CRM Deal", deal, "name", for_update=True)
	return link, frappe.get_doc("CRM Offer", link.offer, for_update=True)


def _guard_writes(token):
	_throttle(("write-token", _hash(token) if isinstance(token, str) else "-"), ("write-ip", client_ip()))


def decide(token, decision, terms_hash, signer_name="", note=""):
	_guard_writes(token)
	if decision not in ("Accepted", "Rejected"):
		_fail("Choose to accept or decline the offer.")
	link, doc = _locked(token)
	try:
		signer_name = text(signer_name or "", "name", NAME_LIMIT, required=decision == "Accepted")
		note = text(note or "", "note", MESSAGE_LIMIT, required=False)
	except ValueError:
		_fail("Type your full name to accept, and keep notes under 2000 characters.")
	# Repeating the same online decision returns the recorded state, no new entries.
	if doc.status == decision and doc.decision_channel == ONLINE:
		return public_view(link)
	if not isinstance(terms_hash, str) or not hmac.compare_digest(terms_hash, doc.terms_hash or ""):
		_fail("This offer changed after you opened it. Reload the page to review the current terms.")
	if service.effective_status(doc) != "Issued":
		_fail("This offer can no longer be accepted or declined here. Send us a message for a new one.")
	evidence = json.dumps(
		{
			"name": signer_name,
			"note": note,
			"ip": client_ip(),
			"user_agent": _user_agent(),
			"terms_hash": doc.terms_hash,
			"at": str(now_datetime()),
		},
		sort_keys=True,
	)
	service.decide(doc, decision, ONLINE, evidence, "Guest", ignore_permissions=True)
	if decision == "Accepted":
		summary = _("Customer accepted the offer online as «{0}».").format(escape_html(signer_name))
	else:
		summary = _("Customer declined the offer online.")
	if note:
		summary += f"<blockquote>{escape_html(note)}</blockquote>"
	_timeline(doc, summary)
	_notify(doc, summary)
	return public_view(link)


def post_message(token, message):
	_guard_writes(token)
	link, doc = _locked(token)
	try:
		message = text(message, "message", MESSAGE_LIMIT)
	except ValueError:
		_fail("Write a message of up to 2000 characters.")
	_persist(
		frappe.get_doc(
			{
				"doctype": "CRM Offer Message",
				"offer": doc.name,
				"deal": doc.deal,
				"direction": "Customer",
				"message": message,
				"client_ip": client_ip(),
			}
		)
	)
	summary = _("Customer message on offer «{0}»:").format(escape_html(doc.title))
	summary += f"<blockquote>{escape_html(message)}</blockquote>"
	_timeline(doc, summary)
	_notify(doc, summary)
	return public_view(link)


def record_view(token):
	"""Counted by the page's script (link unfurlers don't run it), at most once per window per IP."""
	_throttle(("view-ip", client_ip()))
	link = resolve(token)
	if not link:
		raise frappe.DoesNotExistError(_("This link is not valid."))
	if (
		frappe.session.user != "Guest"
		and frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"
	):
		return {"counted": False}
	try:
		cache = frappe.cache()
		seen = _key("viewed", link.token_hash[:32], _hash(client_ip())[:16])
		fresh = cache.incrby(seen, 1) == 1
		if fresh:
			cache.expire(seen, VIEW_WINDOW)
	except Exception:
		fresh = False
	if not fresh:
		return {"counted": False}
	doc = frappe.get_doc("CRM Offer Link", link.name, for_update=True)
	first = not doc.view_count
	now = now_datetime()
	doc.view_count = (doc.view_count or 0) + 1
	doc.first_viewed_at = doc.first_viewed_at or now
	doc.last_viewed_at = now
	_persist(doc)
	if first:
		offer = frappe.get_doc("CRM Offer", link.offer)
		_timeline(offer, _("Customer opened the offer «{0}».").format(escape_html(offer.title)))
	return {"counted": True}


def _timeline(doc, content):
	frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": "CRM Deal",
			"reference_name": doc.deal,
			"content": content,
		}
	).insert(ignore_permissions=True)


def _notify(doc, summary):
	from crm.fcrm.doctype.crm_notification.crm_notification import notify_user

	owner = frappe.db.get_value("CRM Deal", doc.deal, "deal_owner")
	for user in {u for u in (owner, doc.issued_by) if u and u not in ("Guest", "Administrator")}:
		if not frappe.db.get_value("User", user, "enabled"):
			continue
		notify_user(
			{
				"owner": "Guest",
				"assigned_to": user,
				"notification_type": "Form",
				"message": "",
				"notification_text": f'<div class="mb-2 leading-5 text-ink-gray-5">{summary}</div>',
				"reference_doctype": "CRM Offer",
				"reference_docname": doc.name,
				"redirect_to_doctype": "CRM Deal",
				"redirect_to_docname": doc.deal,
			}
		)


# Seller actions (permission-checked through the offer service) ------------------


def _seller_offer(name, write=False):
	doc = service._load(name, write=write)
	if doc.status == "Draft":
		_fail("Issue the offer before sharing it with the customer.")
	return doc


def _link_state(doc, link=None):
	link = link or frappe.db.get_value(
		"CRM Offer Link",
		{"offer": doc.name},
		["name", "view_count", "first_viewed_at", "last_viewed_at"],
		as_dict=True,
	)
	url = ""
	if link:
		token = frappe.get_doc("CRM Offer Link", link.name).get_password("token", raise_exception=False)
		url = url_for(token) if token else ""
	evidence = _evidence(doc) if doc.decision_channel == ONLINE else {}
	return {
		"offer": doc.name,
		"url": url,
		"view_count": (link and link.view_count) or 0,
		"first_viewed_at": str((link and link.first_viewed_at) or ""),
		"last_viewed_at": str((link and link.last_viewed_at) or ""),
		"online_decision": {"name": evidence.get("name", ""), "note": evidence.get("note", "")}
		if evidence
		else None,
		"messages": _messages(doc.name),
	}


def link_state(name):
	return _link_state(_seller_offer(name))


def share(name, rotate=False):
	doc = _seller_offer(name, write=True)
	existing = frappe.db.get_value("CRM Offer Link", {"offer": doc.name}, "name", for_update=True)
	if existing and not rotate:
		return _link_state(doc)
	token = secrets.token_urlsafe(32)
	link = frappe.get_doc("CRM Offer Link", existing) if existing else frappe.new_doc("CRM Offer Link")
	link.update({"offer": doc.name, "deal": doc.deal, "token_hash": _hash(token), "token": token})
	if existing:
		link.rotated_at = now_datetime()
	else:
		link.created_by = frappe.session.user
	_persist(link)
	return _link_state(doc)


def reply(name, message):
	doc = _seller_offer(name, write=True)
	try:
		message = text(message, "message", MESSAGE_LIMIT)
	except ValueError:
		_fail("Write a message of up to 2000 characters.")
	_persist(
		frappe.get_doc(
			{
				"doctype": "CRM Offer Message",
				"offer": doc.name,
				"deal": doc.deal,
				"direction": "Seller",
				"author": frappe.session.user,
				"message": message,
			}
		)
	)
	return _link_state(doc)
