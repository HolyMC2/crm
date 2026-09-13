# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

from crm.pipeline.services.next_activity import backfill


def execute():
	"""Fill next_activity_* on records whose tasks predate the denormalisation."""
	backfill()
