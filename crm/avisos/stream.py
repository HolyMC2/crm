"""Avisos: one scoped stream over the caller's Notification Log and CRM Notification rows.

Reads and writes only rows addressed to ``frappe.session.user`` (Administrator
included: the native permission hook would let it read everyone's). Group keys
sent by the browser are re-derived from the caller's own rows, never used as
row names. Read flags are idempotent, so a replayed POST is a no-op.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, now_datetime

from crm.avisos import kinds, resolve

PREFS_DEFAULT = "muelle_avisos_prefs"
UNREAD_LIMIT = 1000
HISTORY_LIMIT = 300
HISTORY_DAYS = 30
# Raw rows one source pass may read past rejected ones before reporting «capped».
SCAN_LIMIT = 20000
SCAN_BATCH = 500
PAGE = 50
VIEWS = ("inbox", "history", "muted")
# Native direct notices whose text the stream rewrites in the reader's language.
_ASSIGNED = re.compile(r"assigned (?:a new task |a |you)|te asignó|asignó", re.I)
_MENTIONED = re.compile(r"mentioned you|te mencionó", re.I)
_SHARED = re.compile(r"shared .* with you|compartió", re.I)
_GENERIC_ASSIGNMENT = re.compile(r"assigned an? \S+(?: \S+)? \S+ to you$")


def _user():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Sign in to see your avisos."), frappe.AuthenticationError)
	return user


def is_enabled(user=None):
	user = user or frappe.session.user
	if user in (None, "", "Guest"):
		return False
	return frappe.db.get_value("User", user, ["enabled", "user_type"], as_dict=True) == {
		"enabled": 1,
		"user_type": "System User",
	}


# ── preferences ──────────────────────────────────────────────────────────────


def get_prefs(user=None):
	raw = frappe.defaults.get_user_default(PREFS_DEFAULT, user=user or frappe.session.user)
	try:
		data = json.loads(raw) if raw else {}
	except ValueError:
		data = {}
	return kinds.normalize_prefs(data)


def _save_prefs(prefs):
	clean = kinds.normalize_prefs(prefs)
	frappe.defaults.set_user_default(PREFS_DEFAULT, json.dumps(clean), user=frappe.session.user)
	return clean


def save_categories(categories):
	prefs = get_prefs()
	prefs["categories"].update(categories if isinstance(categories, dict) else {})
	return _save_prefs(prefs)


def set_muted(kind, muted):
	cat = kinds.key_category(kind)
	if cat not in kinds.MUTABLE:
		frappe.throw(
			_("Mentions and assignments cannot be muted. Mark them as read when you have handled them."),
			frappe.ValidationError,
		)
	prefs = get_prefs()
	keys = [key for key in prefs["muted"] if key != kind]
	if muted:
		keys.append(kind)
	prefs["muted"] = keys
	return _save_prefs(prefs)


# ── sources ──────────────────────────────────────────────────────────────────


def _scan(query, table, accept, limit, direct):
	"""Newest-first keyset pages, direct work first; rejected rows never use the limit.

	Returns (accepted rows, capped). Direct types get their own pass so a flood of
	alerts or unreadable WhatsApp rows cannot push an older mention out of the window.
	"""
	rows, capped, direct = [], False, sorted(direct)
	for portion in (
		query.where(table.type.isin(direct)),
		query.where(table.type.notin(direct) | table.type.isnull()),
	):
		accepted, scanned, last = 0, 0, None
		while accepted < limit:
			if scanned >= SCAN_LIMIT:
				capped = True
				break
			page = portion
			if last:
				page = page.where(
					(table.creation < last[0]) | ((table.creation == last[0]) & (table.name < last[1]))
				)
			size = min(SCAN_BATCH, SCAN_LIMIT - scanned)
			batch = (
				page.orderby(table.creation, order=frappe.qb.desc)
				.orderby(table.name, order=frappe.qb.desc)
				.limit(size)
				.run(as_dict=True)
			)
			scanned += len(batch)
			for row in batch:
				if accept(row):
					rows.append(row)
					accepted += 1
					if accepted >= limit:
						capped = True
						break
			if len(batch) < size:
				break
			last = (batch[-1].creation, batch[-1].name)
	return rows, capped


def _native_rows(user, read, since=None, limit=UNREAD_LIMIT, lock=False, names=None):
	log = frappe.qb.DocType("Notification Log")
	query = (
		frappe.qb.from_(log)
		.select(
			log.name,
			log.type,
			log.title,
			log.subject,
			log.description,
			log.email_content,
			log.document_type,
			log.document_name,
			log.link,
			log.from_user,
			log.read,
			log.creation,
		)
		.where(log.for_user == user)
	)
	if read is not None:
		query = query.where(log.read == (1 if read else 0))
	if since:
		query = query.where(log.creation >= since)
	if names is not None:
		query = query.where(log.name.isin(names or [""]))
	if lock:
		query = query.for_update()
	found, capped = _scan(query, log, lambda row: True, limit, kinds.NATIVE_DIRECT)
	rows = []
	for row in found:
		rows.append(
			{
				"source": "native",
				"name": row.name,
				"type": row.type or "Alert",
				"title": kinds.plain(row.title or row.subject, 240),
				"raw_title": kinds.plain(row.title or row.subject),
				"body": kinds.plain(row.description or row.email_content, 280),
				"doctype": row.document_type,
				"docname": row.document_name,
				"link": _local_link(row.link),
				"from_user": row.from_user,
				"read": cint(row.read),
				"creation": row.creation,
			}
		)
	return rows, capped


def _crm_available():
	return "crm" in frappe.get_installed_apps() and frappe.db.table_exists("CRM Notification")


def _crm_rows(user, read, since=None, limit=UNREAD_LIMIT, lock=False, names=None):
	if not _crm_available():
		return [], False
	from crm.permissions.whatsapp_read import ReadScope

	note = frappe.qb.DocType("CRM Notification")
	query = (
		frappe.qb.from_(note)
		.select(
			note.name,
			note.type,
			note.to_user,
			note.from_user,
			note.notification_text,
			note.message,
			note.notification_type_doctype,
			note.notification_type_doc,
			note.reference_doctype,
			note.reference_name,
			note.read,
			note.creation,
		)
		.where(note.to_user == user)
	)
	if read is not None:
		query = query.where(note.read == (1 if read else 0))
	if since:
		query = query.where(note.creation >= since)
	if names is not None:
		query = query.where(note.name.isin(names or [""]))
	if lock:
		query = query.for_update()
	scope = ReadScope()

	def accept(row):
		if not scope.notification(row, user):
			return False
		return row.reference_doctype != "CRM Inquiry" or resolve._readable("CRM Inquiry", row.reference_name)

	found, capped = _scan(query, note, accept, limit, kinds.CRM_DIRECT)
	rows = []
	for row in found:
		title = kinds.plain(row.notification_text, 240)
		if not title and row.type == "Mention":
			title = _("{0} mentioned you").format(_full_name(row.from_user))
		doctype, docname, hash = row.reference_doctype, row.reference_name, _crm_hash(row)
		if hash == "#tasks" and row.notification_type_doc:
			# The assignment is the task, not the deal it hangs on: open the task itself.
			doctype, docname, hash = "CRM Task", row.notification_type_doc, ""
		rows.append(
			{
				"source": "crm",
				"name": row.name,
				"type": row.type,
				"title": title or _("New notification"),
				"raw_title": title,
				"body": "" if row.type == "WhatsApp" else kinds.plain(row.message, 280),
				"doctype": doctype,
				"docname": docname,
				"link": None,
				"hash": hash,
				"from_user": row.from_user,
				"read": cint(row.read),
				"creation": row.creation,
			}
		)
	return rows, capped


def _crm_hash(row):
	if row.type == "Mention" and row.notification_type_doc:
		return "#" + row.notification_type_doc
	if row.type == "WhatsApp":
		return "#whatsapp"
	if row.type == "Assignment" and row.notification_type_doctype == "CRM Task":
		return "" if "has been removed by" in (row.message or "") else "#tasks"
	return ""


def _local_link(value):
	link = (value or "").strip()
	if not link.startswith("/") or link.startswith("//") or "\\" in link or len(link) > 1000:
		return None
	return link


def _full_name(user):
	return frappe.utils.get_fullname(user) if user else ""


def _rows(user, view):
	if view == "history":
		since = add_days(now_datetime(), -HISTORY_DAYS)
		native, native_capped = _native_rows(user, True, since, HISTORY_LIMIT)
		crm, crm_capped = _crm_rows(user, True, since, HISTORY_LIMIT)
	else:
		native, native_capped = _native_rows(user, False)
		crm, crm_capped = _crm_rows(user, False)
	return native + crm, native_capped or crm_capped


# ── grouping ─────────────────────────────────────────────────────────────────


def group_rows(rows, prefs):
	"""Rows → groups (newest first) with each group's visibility under prefs."""
	groups = {}
	for row in rows:
		cat = kinds.category(row)
		kind = kinds.kind_key(row, cat)
		key = kinds.group_key(row, cat)
		group = groups.get(key)
		if not group:
			group = groups[key] = {
				"key": key,
				"kind": kind,
				"category": cat,
				"source": row["source"],
				"type": row["type"],
				"title": row["title"],
				"raw_title": row.get("raw_title") or row["title"],
				"body": row["body"],
				"doctype": row.get("doctype"),
				"docname": row.get("docname"),
				"link": row.get("link"),
				"hash": row.get("hash") or "",
				"from_user": row.get("from_user"),
				"latest": row["creation"],
				"count": 0,
				"unread": 0,
				"rows": [],
				"mutable": cat in kinds.MUTABLE,
				"muted": kind in prefs["muted"],
				"visibility": kinds.visibility(cat, kind, prefs),
			}
		group["count"] += 1
		group["unread"] += 0 if row["read"] else 1
		group["rows"].append((row["source"], row["name"]))
		if get_datetime(row["creation"]) > get_datetime(group["latest"]):
			group.update(
				latest=row["creation"],
				title=row["title"],
				raw_title=row.get("raw_title") or row["title"],
				body=row["body"],
				from_user=row.get("from_user"),
				hash=row.get("hash") or group["hash"],
			)
	return sorted(groups.values(), key=lambda g: get_datetime(g["latest"]), reverse=True)


def _in_view(group, view):
	if view == "muted":
		return group["visibility"] == "off"
	if view == "inbox":
		return group["visibility"] != "off"
	return True


def _matches(group, category, q):
	if category not in (None, "", "all") and group["category"] != category:
		return False
	if q:
		haystack = " ".join(
			str(group.get(field) or "") for field in ("title", "body", "docname", "doctype")
		).lower()
		return all(term in haystack for term in q.lower().split())
	return True


def badge_count(groups):
	return sum(1 for group in groups if group["unread"] and group["visibility"] == "badge")


# ── targets and worker text ──────────────────────────────────────────────────


def _direct_title(group, out):
	"""«Ana assigned a CRM Task 418 to you» → «Ana te asignó «Avisar equipo listo»» in the reader's language."""
	label = out["target"].get("label")
	who = out["from_name"]
	if not (label and who and group["category"] == "direct" and group.get("doctype")):
		return None
	text = group.get("raw_title") or group["title"]
	if "removed" in text or "quitó" in text:
		return None
	if group["type"] in ("Assignment", "Task") and _ASSIGNED.search(text):
		return _("{0} assigned you «{1}»").format(who, label)
	if group["type"] == "Mention" and _MENTIONED.search(text):
		return _("{0} mentioned you in «{1}»").format(who, label)
	if group["type"] == "Share" and _SHARED.search(text):
		return _("{0} shared «{1}» with you").format(who, label)
	return None


def _public(group, access):
	out = {key: value for key, value in group.items() if key not in ("rows", "raw_title")}
	out["latest"] = str(group["latest"])
	out["from_name"] = _full_name(group.get("from_user")) if group.get("from_user") else ""
	out["target"] = resolve.target(group, access)
	out["title"] = _direct_title(group, out) or kinds.display(group["title"], 240) or _("New notification")
	body = kinds.display(group["body"], 280)
	if body.startswith(out["title"]):
		# Producers that repeat the subject as the first line of the body.
		body = body[len(out["title"]) :].strip()
	if body == out["title"] or _GENERIC_ASSIGNMENT.search(body) or body == out["target"].get("label"):
		body = ""
	out["body"] = body
	return out


# ── reads ────────────────────────────────────────────────────────────────────


def stream(view="inbox", category="all", q="", start=0, limit=PAGE):
	user = _user()
	view = view if view in VIEWS else "inbox"
	category = category if category in kinds.CATEGORIES else "all"
	start, limit = max(cint(start), 0), min(max(cint(limit) or PAGE, 1), 100)
	q = (q or "").strip()[:120]
	prefs = get_prefs(user)
	rows, capped = _rows(user, "history" if view == "history" else "inbox")
	groups = group_rows(rows, prefs)
	counts = {cat: 0 for cat in kinds.CATEGORIES}
	if view == "history":
		unread_groups = group_rows(_rows(user, "inbox")[0], prefs)
	else:
		unread_groups = groups
	for group in unread_groups:
		if group["unread"] and group["visibility"] != "off":
			counts[group["category"]] += 1
	visible = [g for g in groups if _in_view(g, view) and _matches(g, category, q)]
	access = resolve.Access()
	page = [_public(group, access) for group in visible[start : start + limit]]
	muted = [
		{"kind": key, "category": kinds.key_category(key), "label": kinds.kind_label(key)}
		for key in prefs["muted"]
	]
	return {
		"view": view,
		"category": category,
		"groups": page,
		"total": len(visible),
		"more": start + limit < len(visible),
		"capped": capped,
		"counts": counts,
		"badge": badge_count(unread_groups),
		"prefs": prefs,
		"muted_kinds": muted if view == "muted" else [],
	}


def badge():
	user = _user()
	rows, capped = _rows(user, "inbox")
	return {"count": badge_count(group_rows(rows, get_prefs(user))), "capped": capped}


# ── writes (lock first) ──────────────────────────────────────────────────────


def _lock_conflict(exc):
	code = exc.args[0] if getattr(exc, "args", None) else None
	return code in (1020, 1205, 1213) or frappe.db.is_deadlocked(exc) or frappe.db.is_timedout(exc)


def _locked(fetch):
	try:
		return fetch()
	except Exception as exc:
		if _lock_conflict(exc):
			raise frappe.TimestampMismatchError(
				_("Your avisos changed in another window. Refresh and try again.")
			) from None
		raise


def _set_read(rows, value):
	user = frappe.session.user
	native = [name for source, name in rows if source == "native"]
	crm = [name for source, name in rows if source == "crm"]
	if native:
		log = frappe.qb.DocType("Notification Log")
		(
			frappe.qb.update(log)
			.set(log.read, value)
			.where(log.for_user == user)
			.where(log.name.isin(native))
		).run()
	if crm:
		note = frappe.qb.DocType("CRM Notification")
		(
			frappe.qb.update(note)
			.set(note.read, value)
			.where(note.to_user == user)
			.where(note.name.isin(crm))
		).run()
	if native or crm:
		frappe.publish_realtime("avisos_changed", {}, user=user, after_commit=True)
	return {"native": native, "crm": crm}


def mark_read(keys=None, category=None, view="inbox"):
	"""Mark the caller's unread rows of the given groups (or of a whole category) read."""
	user = _user()
	keys = [str(key) for key in (keys or []) if key][:200]
	if not keys and category is None:
		frappe.throw(_("Choose which avisos to mark as read."), frappe.ValidationError)
	prefs = get_prefs(user)
	rows = _locked(
		lambda: _native_rows(user, False, lock=True, limit=5000)[0]
		+ _crm_rows(user, False, lock=True, limit=5000)[0]
	)
	chosen = []
	wanted = set(keys)
	for group in group_rows(rows, prefs):
		if wanted:
			if group["key"] not in wanted:
				continue
		elif not (_in_view(group, view) and _matches(group, category, "")):
			continue
		chosen.extend(group["rows"])
	result = _set_read(chosen, 1)
	result["groups"] = len(wanted) if wanted else None
	return result


def mark_unread(native=None, crm=None):
	"""Undo: only the caller's rows, only those currently read."""
	user = _user()
	native = [str(name) for name in (native or [])][:5000]
	crm = [str(name) for name in (crm or [])][:5000]
	rows = _locked(
		lambda: _native_rows(user, True, lock=True, limit=5000, names=native)[0]
		+ (_crm_rows(user, True, lock=True, limit=5000, names=crm)[0] if crm else [])
	)
	return _set_read([(row["source"], row["name"]) for row in rows], 0)
