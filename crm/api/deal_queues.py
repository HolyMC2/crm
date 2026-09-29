# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Default public follow-up queues for the deals list.

They are ordinary public CRM View Settings, so managers edit or delete them like
any other view. A queue is identified by ``crm_seed_key``, never by its label, and
each key is seeded once: its key is recorded in FCRM Settings
``deal_queue_seeds_done`` and a queue deleted afterwards is not recreated.

The predicates are the server form of ``frontend/src/utils/dealFollowUp.js``, using
request-time tokens (crm.api.list_tokens) so a queue stays right past midnight and
follows the tenant's own stage names.
"""

import json

import frappe

from crm.api.list_tokens import OPEN_DEAL_STATUSES

DOCTYPE = "CRM Deal"
ROUTE_NAME = "Deals"
SETTINGS_FIELD = "deal_queue_seeds_done"
KEY_PREFIX = "crm.deal_queue."

TASK_SET = ["is", "set"]
# Before today 00:00. Not ``["<", "@today"]``: Frappe wraps ``<`` on a nullable
# Datetime in IFNULL(field, '0001-01-01'), so undated tasks would count as overdue;
# ``between`` on a Datetime never matches NULL and ends at 23:59:59.999999 of its
# upper day. The lower bound is MariaDB's DATETIME minimum ('0001-01-01' matches
# nothing there).
OVERDUE = ["between", ["1000-01-01", "@today-1"]]
OPEN = ["in", OPEN_DEAL_STATUSES]

# Labels are stored untranslated; the views picker renders them through __().
QUEUES = (
	{
		"key": "todos",
		"label": "Open deals",
		"filters": {"status": OPEN},
		"order_by": "modified desc",
	},
	{
		"key": "vencidos",
		"label": "Overdue follow-ups",
		"filters": {"next_activity_task": TASK_SET, "next_activity_at": OVERDUE, "status": OPEN},
		"order_by": "next_activity_at asc",
	},
	{
		"key": "para_hoy",
		"label": "Follow-ups due today",
		"filters": {"next_activity_task": TASK_SET, "next_activity_at": ["between", ["@today", "@today"]]},
		"order_by": "next_activity_at asc",
	},
	{
		"key": "sin_fecha",
		"label": "Follow-ups without a date",
		"filters": {"next_activity_task": TASK_SET, "next_activity_at": ["is", "not set"]},
		"order_by": "modified desc",
	},
	{
		"key": "sin_seguimiento",
		"label": "Deals without follow-up",
		"filters": {"next_activity_task": ["is", "not set"], "status": OPEN},
		"order_by": "modified desc",
	},
)

# (key, label, type, width, options). Virtual columns whose provider is not
# installed are hidden by get_data at request time, so a provider app installed
# later lights them up without reseeding.
QUEUE_COLUMNS = (
	("deal_name", "Deal Name", "Data", "14rem", None),
	("_v_customer", "Customer", "Data", "10rem", None),
	("_v_phone", "Phone", "Data", "9rem", None),
	("_v_device", "Device", "Data", "9rem", None),
	("_v_repair_order", "Repair Order", "Data", "9rem", None),
	("_v_repair_status", "Repair Status", "Data", "8rem", None),
	("_v_next_step", "Next step", "Data", "12rem", None),
	("deal_value", "Deal Value", "Currency", "8rem", None),
	("status", "Status", "Link", "9rem", "CRM Deal Status"),
	("modified", "Last Modified", "Datetime", "8rem", None),
	("deal_owner", "Deal Owner", "Link", "9rem", "User"),
)


def ensure_default_queues() -> list[str]:
	"""Create the missing default queues once; return the seed keys created now."""
	if not frappe.db.table_exists("CRM View Settings") or not frappe.db.has_column(
		"CRM View Settings", "crm_seed_key"
	):
		return []
	done = seeded_keys()
	created = []
	for queue in QUEUES:
		seed_key = KEY_PREFIX + queue["key"]
		if seed_key in done:
			continue
		if not frappe.db.exists("CRM View Settings", {"crm_seed_key": seed_key}):
			insert_queue(queue, seed_key)
			created.append(seed_key)
		done.append(seed_key)
	if created or done != seeded_keys():
		frappe.db.set_single_value("FCRM Settings", SETTINGS_FIELD, json.dumps(done))
	return created


def seeded_keys() -> list[str]:
	raw = frappe.db.get_single_value("FCRM Settings", SETTINGS_FIELD)
	try:
		keys = json.loads(raw or "[]")
	except ValueError:
		keys = []
	return [key for key in keys if isinstance(key, str)] if isinstance(keys, list) else []


def queue_columns() -> list[dict]:
	columns = []
	for key, label, fieldtype, width, options in QUEUE_COLUMNS:
		column = {"label": label, "type": fieldtype, "key": key, "width": width}
		if options:
			column["options"] = options
		columns.append(column)
	return columns


def insert_queue(queue: dict, seed_key: str):
	from crm.fcrm.doctype.crm_view_settings.crm_view_settings import remove_duplicates, sync_default_rows

	columns = queue_columns()
	rows = remove_duplicates([column["key"] for column in columns] + (sync_default_rows(DOCTYPE) or []))
	doc = frappe.new_doc("CRM View Settings")
	doc.update(
		{
			"label": queue["label"],
			"icon": "",
			"dt": DOCTYPE,
			"type": "list",
			"route_name": ROUTE_NAME,
			"public": 1,
			"user": "",
			"filters": json.dumps(queue["filters"]),
			"order_by": queue["order_by"],
			"columns": json.dumps(columns),
			"rows": json.dumps(rows),
			"kanban_columns": "[]",
			"kanban_fields": "[]",
			"crm_seed_key": seed_key,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc
