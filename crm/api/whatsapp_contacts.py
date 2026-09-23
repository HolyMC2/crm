"""Numbers a CRM Deal or Lead can be messaged on — one chat tab per number.

CRM owns this list. Numbers come from the record itself (a Lead's mobile, the
Deal's linked Contacts and each of their phones, else the Deal's own mobile);
WhatsApp state comes from this site's own messages, keyed by the last
PEER_SUFFIX digits so the 52…/521… spellings of one phone stay one tab.
The caller authorizes the record before calling ``list_numbers``.
"""

import frappe
from frappe.utils import add_to_date, get_datetime, now_datetime

from crm.api.conversation_threads import PEER_SUFFIX
from crm.utils import parse_phone_number


def list_numbers(doctype, name):
	numbers = _record_numbers(doctype, name)
	if not numbers:
		return []
	facts = _message_facts([n["key"] for n in numbers if len(n["key"]) == PEER_SUFFIX])
	manual = _manual_whatsapp_flag(doctype, name)
	region = _site_region()
	session_start = add_to_date(now_datetime(), hours=-24)
	from crm.api.outbox_bridge import usable_send_account

	usable = {}
	out = []
	for n in numbers:
		fact = facts.get(n["key"], {})
		has = bool(fact)
		last_in = fact.get("last_incoming")
		account = fact.get("incoming_account") or fact.get("outgoing_account")
		if account and account not in usable:
			usable[account] = usable_send_account(account)
		out.append(
			{
				"contact": n["contact"],
				"name": n["name"],
				# The send target: the customer's own WhatsApp spelling when they wrote
				# to us, else the spelling our sends already used, else the stored number.
				"phone": fact.get("incoming_peer")
				or fact.get("outgoing_peer")
				or _e164_digits(n["raw"], region),
				"phone_display": n["raw"],
				# Reply from the business number the customer last wrote to (else last used),
				# when this user may send from it; otherwise the default account.
				"whatsapp_account": account if account and usable[account] else None,
				"peer_key": n["key"],
				"image": n["image"],
				"is_primary": n["is_primary"],
				"has_whatsapp": has,
				"whatsapp_state": _wa_state(manual, has),
				"last_incoming": str(last_in) if last_in else None,
				# Meta's customer-service window: free-form text delivers only within
				# 24h of the customer's last message; outside it only templates do.
				"session_open": bool(last_in and get_datetime(last_in) > session_start),
			}
		)
	return out


def _digits(value):
	return "".join(c for c in str(value or "") if c.isdigit())


def _record_numbers(doctype, name):
	candidates = []
	if doctype == "CRM Lead":
		lead = frappe.db.get_value("CRM Lead", name, ["lead_name", "mobile_no", "image"], as_dict=True)
		if lead:
			candidates.append((None, lead.lead_name or lead.mobile_no, lead.mobile_no, lead.image, 1))
	else:
		contacts = frappe.db.sql(
			"""SELECT cc.contact, cc.is_primary, c.full_name, c.mobile_no, c.image
			FROM `tabCRM Contacts` cc LEFT JOIN `tabContact` c ON c.name = cc.contact
			WHERE cc.parent = %s AND cc.parenttype = 'CRM Deal'
			ORDER BY cc.is_primary DESC, cc.idx ASC""",
			(name,),
			as_dict=True,
		)
		for row in contacts:
			# Every number of the Contact is its own tab: customers often write from a
			# second phone, and the live session then exists only on that number.
			phones = [row.mobile_no] if row.mobile_no else []
			if row.contact:
				phones += frappe.get_all(
					"Contact Phone",
					filters={"parent": row.contact, "parenttype": "Contact"},
					order_by="is_primary_mobile_no desc, idx asc",
					pluck="phone",
				)
			label = row.full_name or row.contact
			for i, phone in enumerate(phones):
				candidates.append(
					(row.contact, label, phone, row.image, int(row.is_primary or 0) if i == 0 else 0)
				)
		if not candidates:
			mobile = frappe.db.get_value("CRM Deal", name, "mobile_no")
			candidates.append((None, mobile, mobile, None, 1))

	seen, numbers = set(), []
	for contact, label, raw, image, is_primary in candidates:
		key = _digits(raw)[-PEER_SUFFIX:]
		if not key or key in seen:
			continue
		seen.add(key)
		numbers.append(
			{
				"contact": contact,
				"name": label or raw,
				"raw": raw,
				"key": key,
				"image": image,
				"is_primary": is_primary,
			}
		)
	return numbers


def _message_facts(keys):
	"""Per phone key: newest inbound time, and the peer spelling and account last used each way."""
	if not keys or not frappe.db.exists("DocType", "WhatsApp Message"):
		return {}
	rows = frappe.db.sql(
		f"""SELECT t.k, t.type, t.peer, t.account, t.creation FROM (
			SELECT RIGHT(REGEXP_REPLACE(COALESCE(`from`, ''), '[^0-9]', ''), {PEER_SUFFIX}) AS k,
				type, REGEXP_REPLACE(`from`, '[^0-9]', '') AS peer, whatsapp_account AS account, creation
			FROM `tabWhatsApp Message` WHERE type = 'Incoming'
			UNION ALL
			SELECT RIGHT(REGEXP_REPLACE(COALESCE(`to`, ''), '[^0-9]', ''), {PEER_SUFFIX}),
				type, REGEXP_REPLACE(`to`, '[^0-9]', ''), whatsapp_account, creation
			FROM `tabWhatsApp Message` WHERE type = 'Outgoing'
		) t WHERE t.k IN %(keys)s ORDER BY t.creation DESC""",
		{"keys": tuple(keys)},
		as_dict=True,
	)
	facts = {}
	for row in rows:
		fact = facts.setdefault(row.k, {})
		if row.type == "Incoming" and "incoming_peer" not in fact:
			fact.update(incoming_peer=row.peer, last_incoming=row.creation, incoming_account=row.account)
		elif row.type == "Outgoing" and "outgoing_peer" not in fact:
			fact.update(outgoing_peer=row.peer, outgoing_account=row.account)
	return facts


def _site_region():
	country = frappe.db.get_single_value("System Settings", "country")
	code = country and frappe.db.get_value("Country", country, "code")
	return code.upper() if code else None


def _e164_digits(raw, region):
	"""A never-messaged number: complete its country code from the site's country."""
	if region:
		parsed = parse_phone_number(str(raw), region)
		if parsed.get("success") and parsed.get("is_possible"):
			return _digits(parsed["formats"]["E164"])
	return _digits(raw)


def _manual_whatsapp_flag(doctype, name):
	"""Operator-set ``mobile_is_whatsapp`` (1 yes, 0 no), None where the field is absent."""
	if not frappe.get_meta(doctype).has_field("mobile_is_whatsapp"):
		return None
	value = frappe.db.get_value(doctype, name, "mobile_is_whatsapp")
	return None if value is None else int(value)


def _wa_state(manual, has):
	"""A real exchange wins over a mistaken 'no'; 'no' only when the operator said so."""
	if has or manual == 1:
		return "yes"
	if manual == 0:
		return "no"
	return "unknown"
