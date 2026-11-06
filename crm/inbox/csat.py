"""Satisfaction ratings: when a conversation closes, the customer gets one link to rate it.

The link carries a random token; only its hash is stored. The first answer counts and
the link stops working after CRM Inbox Settings → csat_valid_days. A conversation that
closes again within a day does not ask the same customer twice.
"""

import hashlib
import json
import secrets
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, get_url, now_datetime

from crm import inbox

RATING = "CRM Conversation Rating"
CONTROL_EVENT = "CRM Conversation Control Event"
ROUTE = "rate"
MAX_COMMENT = 1000
QUIET_HOURS = 24


def _hash(token):
	return hashlib.sha256(token.encode()).hexdigest()


def url_for(token):
	return get_url(f"/{ROUTE}/{token}")


def on_control_event(doc, method=None):
	"""A control event that moves a conversation into Closed queues the rating request."""
	if doc.from_generation == doc.to_generation:
		return
	try:
		before = json.loads(doc.previous_json or "{}")
		after = json.loads(doc.result_json or "{}")
	except ValueError:
		return
	if after.get("control_state") != "Closed" or before.get("control_state") == "Closed":
		return
	try:
		if not inbox.settings().get("csat_enabled"):
			return
		frappe.enqueue(
			"crm.inbox.csat.send_request",
			queue="short",
			timeout=120,
			enqueue_after_commit=True,
			job_id=f"crm-csat-{doc.name}",
			deduplicate=True,
			# not `event`: frappe.enqueue keeps that keyword for itself and the job never gets it
			control_event=doc.name,
		)
	except Exception:
		frappe.log_error(title="CRM rating request not queued", message=frappe.get_traceback())


def send_request(control_event):
	"""Queue the rating message for one close; returns the rating name or a refusal code."""
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control
	from crm.inbox.notices import queue_notice, render

	settings = inbox.settings()
	if not settings.get("csat_enabled"):
		return "disabled"
	if frappe.db.exists(RATING, {"closed_event": control_event}):
		return "already_sent"
	conversation = frappe.db.get_value(CONTROL_EVENT, control_event, "conversation")
	if not conversation:
		return "not_found"
	doc = control._load(conversation)
	if doc.control_state != "Closed" or threads._private_peer(doc.provider, doc.peer_id):
		return "not_closed"
	if frappe.db.exists(
		RATING, {"conversation": doc.name, "creation": [">", now_datetime() - timedelta(hours=QUIET_HOURS)]}
	):
		return "asked_recently"
	token = secrets.token_urlsafe(24)
	link = url_for(token)
	text = render(settings.get("csat_message") or "", doc)
	text = text.replace("{link}", link) if "{link}" in text else f"{text}\n{link}".strip()
	intent, refused = queue_notice(doc.name, kind="csat", key=control_event, text=text)
	if not intent:
		return refused
	days = max(cint(settings.get("csat_valid_days")) or 7, 1)
	rating = inbox.insert_private(
		{
			"doctype": RATING,
			"conversation": doc.name,
			"status": "Sent",
			"human_owner": doc.human_owner,
			"department": doc.get("department"),
			"provider": doc.provider,
			"closed_event": control_event,
			"token_hash": _hash(token),
			"expires_at": now_datetime() + timedelta(days=days),
		}
	)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- background job boundary
	return rating.name


def resolve(token, lock=False):
	"""The rating row for a customer token, or None. Never raises on garbage."""
	if not isinstance(token, str) or not 16 <= len(token) <= 64:
		return None
	name = frappe.db.get_value(RATING, {"token_hash": _hash(token)}, "name", for_update=lock)
	if not name:
		return None
	row = frappe.db.get_value(
		RATING, name, ["name", "conversation", "status", "rating", "expires_at"], as_dict=True
	)
	if row.status == "Sent" and row.expires_at and get_datetime(row.expires_at) <= now_datetime():
		row.status = "Expired"
	return row


def submit(token, rating, comment=""):
	rating = cint(rating)
	if not 1 <= rating <= 5:
		frappe.throw(_("Choose from 1 to 5 stars."))
	comment = (comment or "").strip()[:MAX_COMMENT]
	row = resolve(token, lock=True)
	if not row:
		frappe.throw(_("This link is not valid."), frappe.DoesNotExistError)
	if row.status == "Rated":
		return {"status": "Rated"}
	if row.status == "Expired":
		frappe.db.set_value(RATING, row.name, "status", "Expired", update_modified=False)
		return {"status": "Expired"}
	frappe.db.set_value(
		RATING,
		row.name,
		{"status": "Rated", "rating": rating, "comment": comment or None, "rated_at": now_datetime()},
	)
	from crm.integrations.webhooks import emit

	emit("conversation.rated", RATING, row.name, version="rated")
	return {"status": "Rated"}


def expire_due():
	"""Daily: links past their time stop counting as pending."""
	if not frappe.db.exists("DocType", RATING):
		return
	frappe.db.set_value(
		RATING,
		{"status": "Sent", "expires_at": ["<", now_datetime()]},
		"status",
		"Expired",
		update_modified=False,
	)


def recent(conversation, limit=3):
	"""The customer's latest answers on this conversation, newest first, for the inbox header."""
	if not frappe.db.exists("DocType", RATING):
		return []
	return [
		{"rating": r.rating, "comment": r.comment or "", "agent": r.human_owner, "rated_at": str(r.rated_at)}
		for r in frappe.get_all(
			RATING,
			filters={"conversation": conversation, "status": "Rated"},
			fields=["rating", "comment", "human_owner", "rated_at"],
			order_by="rated_at desc",
			limit=limit,
			ignore_permissions=True,
		)
	]
