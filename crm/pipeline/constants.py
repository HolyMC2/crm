# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Vocabulary shared by the pipeline services, queries and hooks."""

# A task still owed to the customer. "Done" and "Canceled" are settled and never
# surface as the next activity.
OPEN_TASK_STATUSES = ("Backlog", "Todo", "In Progress")

# The records that carry denormalised next-activity fields. A CRM Task can point
# at anything through its dynamic link; only these two are mirrored.
REFERENCE_DOCTYPES = ("CRM Lead", "CRM Deal")

NEXT_ACTIVITY_FIELDS = (
	"next_activity_at",
	"next_activity_title",
	"next_activity_type",
	"next_activity_task",
)

# Accepts either the record doctype or its status doctype, so a caller asking for
# "the stages of a deal" and one asking for "the CRM Deal Status set" both work.
# It doubles as the allow-list: anything else is rejected.
STATUS_DOCTYPES = {
	"CRM Deal": "CRM Deal Status",
	"CRM Deal Status": "CRM Deal Status",
	"CRM Lead": "CRM Lead Status",
	"CRM Lead Status": "CRM Lead Status",
}

# CRM Lead Status carries neither column; the stage payload stays one shape for
# the frontend by defaulting them.
STATUS_OPTIONAL_COLUMNS = {"hidden": 0, "probability": None}
