"""Recipient-scoped realtime delivery.

`frappe.publish_realtime(event, message)` without a user/room/doc goes to the
site room, i.e. every desk user. CRM publishers compute their recipients and
deliver through `publish_to_users`, which never falls back to the site room:
no resolved recipient means nothing is published.
"""

import frappe
from frappe.realtime import get_user_room


def enabled_users(candidates) -> list[str]:
	"""Return enabled User names for candidate user names or email addresses, in input order."""
	wanted = []
	for candidate in candidates or ():
		value = (candidate or "").strip() if isinstance(candidate, str) else ""
		if value and value != "Guest" and value not in wanted:
			wanted.append(value)
	if not wanted:
		return []

	rows = frappe.get_all(
		"User",
		filters={"enabled": 1},
		or_filters={"name": ["in", wanted], "email": ["in", wanted]},
		fields=["name", "email"],
	)
	by_key = {}
	for row in rows:
		if row.name == "Guest":
			continue
		by_key.setdefault(row.name, row.name)
		if row.email:
			by_key.setdefault(row.email, row.name)

	users = []
	for value in wanted:
		user = by_key.get(value)
		if user and user not in users:
			users.append(user)
	return users


def publish_to_users(event, message, users, *, after_commit=False, publish=None) -> list[str]:
	"""Publish `event` to each user's own room; return the users it was sent to.

	An empty recipient list publishes nothing (fail closed). The room is passed
	explicitly so a background job's task_id can never redirect the event.
	"""
	publish = publish or frappe.publish_realtime
	recipients = [user for user in dict.fromkeys(users or ()) if user and user != "Guest"]
	if not recipients:
		frappe.logger("crm.realtime").info(
			f"realtime event {event!r} has no resolved recipient; not published"
		)
		return []

	for user in recipients:
		publish(event, message, user=user, room=get_user_room(user), after_commit=after_commit)
	return recipients
