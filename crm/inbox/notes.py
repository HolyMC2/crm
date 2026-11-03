"""Private notes on a conversation. The customer never sees them; @mentions notify teammates."""

import json

import frappe
from frappe import _
from frappe.utils import escape_html, strip_html

from crm.inbox import insert_private, run_command

NOTE = "CRM Conversation Note"
RECORD_NOTE = "FCRM Note"
# Sales records whose own notes (FCRM Note) meet the conversation's private notes.
NOTE_RECORDS = ("CRM Lead", "CRM Deal")
MAX_TEXT = 4000
MAX_MENTIONS = 10
RECORD_SCAN = 50


def _mentions(value):
	if isinstance(value, str):
		try:
			value = json.loads(value) if value.strip() else []
		except ValueError:
			frappe.throw(_("Send the mentioned people as a list."))
	if value is None:
		return []
	if not isinstance(value, list) or len(value) > MAX_MENTIONS:
		frappe.throw(_("A note can mention at most {0} people.").format(MAX_MENTIONS))
	return list(dict.fromkeys(v for v in value if isinstance(v, str) and v))


def add_note(name, content, command_id, mentions=None):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	if not isinstance(content, str) or not content.strip() or len(content) > MAX_TEXT:
		frappe.throw(_("Write a note of 1 to {0} characters.").format(MAX_TEXT))
	content = content.strip()
	people = _mentions(mentions)
	actor = frappe.session.user

	def apply(doc, roles):
		unreadable = [
			user
			for user in people
			if user == actor or not threads._permitted(lambda user=user: control._authorize(doc, user))
		]
		if unreadable:
			frappe.throw(
				_("These people cannot open this conversation, so they cannot be mentioned: {0}.").format(
					", ".join(unreadable)
				)
			)
		note = insert_private(
			{
				"doctype": NOTE,
				"conversation": doc.name,
				"author": actor,
				"content": content,
				"mentions": json.dumps(people) if people else None,
			}
		)
		_notify(doc, note, people, actor)
		from crm.integrations.webhooks import emit

		emit("conversation.note_created", NOTE, note.name, version="created")
		return "note:" + note.name, {"note": note.name}

	return run_command(name, command_id, "note", [content, people], apply)


def _notify(doc, note, people, actor):
	if not people:
		return
	author = frappe.db.get_value("User", actor, "full_name") or actor
	snippet = note.content[:200]
	for user in people:
		if frappe.db.exists("DocType", "CRM Notification"):
			frappe.get_doc(
				{
					"doctype": "CRM Notification",
					"from_user": actor,
					"to_user": user,
					"type": "Mention",
					"notification_type_doctype": NOTE,
					"notification_type_doc": note.name,
					"reference_doctype": "CRM Conversation",
					"reference_name": doc.name,
					"notification_text": _("{0} mentioned you in a conversation note").format(author),
					"message": "<p>{0}</p>".format(escape_html(snippet)),
				}
			).insert(ignore_permissions=True)
		frappe.publish_realtime(
			"crm_conversation_note",
			{"conversation": doc.name, "note": note.name},
			user=user,
			after_commit=True,
		)


def list_notes(name, limit=100):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	doc = control._load(name)
	control._authorize(doc)
	if threads._private_peer(doc.provider, doc.peer_id):
		control._deny()
	rows = frappe.get_all(
		NOTE,
		filters={"conversation": doc.name},
		fields=["name", "author", "content", "mentions", "creation"],
		order_by="creation asc",
		limit=min(max(int(limit), 1), 200),
		ignore_permissions=True,
	)
	names = {
		u.name: u.full_name or u.name
		for u in frappe.get_all(
			"User",
			filters={"name": ["in", list({r.author for r in rows} or {""})]},
			fields=["name", "full_name"],
		)
	}
	return [
		{
			"name": r.name,
			"author": r.author,
			"author_name": names.get(r.author, r.author),
			"content": r.content,
			"mentions": json.loads(r.mentions) if r.mentions else [],
			"creation": str(r.creation),
			"own": r.author == frappe.session.user,
		}
		for r in rows
	]


def mentionable(name, query=""):
	"""Teammates who can open this conversation, for the note's @mention picker."""
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	doc = control._load(name)
	control._authorize(doc)
	if threads._private_peer(doc.provider, doc.peer_id):
		control._deny()
	query = control._text(query, 80, required=False)
	candidates = frappe.db.sql(
		"""SELECT name, full_name FROM `tabUser`
		WHERE enabled=1 AND user_type='System User' AND name NOT IN ('Guest','Administrator', %s)
		AND (name LIKE %s OR full_name LIKE %s) ORDER BY full_name, name LIMIT 100""",
		(frappe.session.user, "%" + query + "%", "%" + query + "%"),
		as_dict=True,
	)
	return [
		{"name": row.name, "label": row.full_name or row.name}
		for row in candidates
		if threads._permitted(lambda user=row.name: control._authorize(doc, user))
	][:20]


def _readable_conversation(name):
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control

	doc = control._load(name)
	if not threads._permitted(lambda: control._authorize(doc)) or threads._private_peer(
		doc.provider, doc.peer_id
	):
		return None
	return doc


def _like(value):
	return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def record_conversations(doctype, name):
	"""Conversations about a lead or deal the viewer may open: those that belong to it
	(for a deal, also to the lead it came from) and those a person or run linked it to."""
	from crm.api import conversation_threads as threads
	from crm.api import conversations as control
	from crm.api import automation_departments as departments

	if doctype not in NOTE_RECORDS:
		return []
	references = [(doctype, name), *threads._converted_from(doctype, name)]
	names = []
	for ref_doctype, ref_name in references:
		names += frappe.get_all(
			control.DOCTYPE,
			filters={"reference_doctype": ref_doctype, "reference_name": ref_name},
			pluck="name",
			order_by="modified desc",
			limit=RECORD_SCAN,
		)
	# Every writer stores context_links as compact JSON with sorted keys, so
	# "doctype" and "name" sit side by side; parse_links confirms each match.
	needle = json.dumps({"doctype": doctype, "name": name}, sort_keys=True, separators=(",", ":"))[1:-1]
	names += frappe.db.sql_list(
		"SELECT name FROM `tabCRM Conversation` WHERE context_links LIKE %s ORDER BY modified DESC LIMIT %s",
		("%" + _like(needle) + "%", RECORD_SCAN),
	)
	out = []
	for conversation in dict.fromkeys(names):
		doc = _readable_conversation(conversation)
		if not doc:
			continue
		linked = {(link["doctype"], link["name"]) for link in departments.parse_links(doc.get("context_links"))}
		if (doc.reference_doctype, doc.reference_name) in references or (doctype, name) in linked:
			out.append(doc)
	return out


def notes_for_record(doctype, name):
	"""The private notes of the record's conversations, shaped like its own notes for the
	timeline. They stay read-only there and open their conversation."""
	from crm.api import conversation_threads as threads

	conversations = {doc.name: doc for doc in record_conversations(doctype, name)}
	if not conversations:
		return []
	rows = frappe.get_all(
		NOTE,
		filters={"conversation": ["in", list(conversations)]},
		fields=["name", "conversation", "author", "content", "creation"],
		order_by="creation desc",
		limit=200,
		ignore_permissions=True,
	)
	labels = {}
	for doc in conversations.values():
		labels[doc.name] = threads._display_names(doc.provider, [doc.peer_id]).get(doc.peer_id, doc.peer_id)
	return [
		{
			"name": row.name,
			"title": _("Conversation with {0}").format(labels[row.conversation]),
			"content": "<p>{0}</p>".format(escape_html(row.content).replace("\n", "<br>")),
			"owner": row.author,
			"modified": row.creation,
			"creation": row.creation,
			"source": "conversation",
			"conversation": row.conversation,
		}
		for row in rows
	]


def _note_records(doc):
	"""Leads and deals this conversation is about that the viewer may read."""
	from crm.api import automation_departments as departments

	pairs = [(doc.reference_doctype, doc.reference_name)] + [
		(link["doctype"], link["name"]) for link in departments.parse_links(doc.get("context_links"))
	]
	out = []
	for doctype, name in dict.fromkeys(pairs):
		if doctype not in NOTE_RECORDS or not name or not frappe.db.exists(doctype, name):
			continue
		if not frappe.has_permission(doctype, "read", name):
			continue
		title = frappe.get_meta(doctype).get_title_field()
		label = frappe.db.get_value(doctype, name, title) if title and title != "name" else None
		out.append({"doctype": doctype, "name": name, "label": label or name})
	return out


def record_notes(name):
	"""The linked lead's or deal's own notes, for the inbox notes panel, and where a
	new note may be saved: the conversation (private) or one of those records."""
	from crm.fcrm.doctype.crm_call_log.crm_call_log import get_permitted_docs

	doc = _readable_conversation(name)
	if not doc:
		from crm.api import conversations as control

		control._deny()
	records = _note_records(doc)
	notes = []
	for record in records:
		for row in get_permitted_docs(
			RECORD_NOTE, filters={"reference_doctype": record["doctype"], "reference_docname": record["name"]}
		):
			notes.append(
				{
					"name": row.name,
					"title": row.get("title") or "",
					"content": strip_html(row.get("content") or "").strip(),
					"author": row.get("owner"),
					"creation": str(row.get("creation") or ""),
					"record": record,
				}
			)
	notes.sort(key=lambda note: note["creation"])
	notes = notes[-100:]
	names = dict(
		frappe.get_all(
			"User",
			filters={"name": ["in", list({n["author"] for n in notes} or {""})]},
			fields=["name", "full_name"],
			as_list=True,
		)
	)
	for note in notes:
		note["author_name"] = names.get(note["author"]) or note["author"]
	return {"records": records, "notes": notes}


def add_record_note(name, doctype, docname, content):
	"""Save a note on a lead or deal this conversation is about, under that record's own
	note permissions, so it shows on the record's timeline like any other note."""
	from crm.api import conversations as control

	if not isinstance(content, str) or not content.strip() or len(content) > MAX_TEXT:
		frappe.throw(_("Write a note of 1 to {0} characters.").format(MAX_TEXT))
	doc = _readable_conversation(name)
	if not doc:
		control._deny()
	if not any((r["doctype"], r["name"]) == (doctype, docname) for r in _note_records(doc)):
		frappe.throw(
			_("Link this record to the conversation first, then save the note on it."), frappe.PermissionError
		)
	text = content.strip()
	note = frappe.get_doc(
		{
			"doctype": RECORD_NOTE,
			"title": text.splitlines()[0][:140],
			"content": "<p>{0}</p>".format(escape_html(text).replace("\n", "<br>")),
			"reference_doctype": doctype,
			"reference_docname": docname,
		}
	).insert()
	return {"note": note.name}
