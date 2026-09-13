# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

from crm.pipeline.services.deal_title import backfill


def execute():
	"""Title the deals that predate `deal_name`; the validate hook covers new ones."""
	backfill()
