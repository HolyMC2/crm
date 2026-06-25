"""Phase 1 message attribution: provenance fields on WhatsApp Message.

Lets the inbox show WHO sent each message and HOW — a human (and which user
typed/triggered it), an automation (and which rule), or a bot/chatflow. The
fields are polymorphic-actor friendly so a future chatflow engine drops in
without a schema change. See doco_marketing / taller / crm send paths.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	if not frappe.db.exists("DocType", "WhatsApp Message"):
		return

	create_custom_fields(
		{
			"WhatsApp Message": [
				{
					"fieldname": "doco_provenance_section",
					"fieldtype": "Section Break",
					"label": "Provenance",
					"insert_after": "reference_name",
					"collapsible": 1,
				},
				{
					"fieldname": "doco_sent_by_type",
					"fieldtype": "Select",
					"label": "Sent By Type",
					"options": "Human\nAutomation\nBot",
					"default": "Human",
					"insert_after": "doco_provenance_section",
					"read_only": 1,
					"in_standard_filter": 1,
				},
				{
					"fieldname": "doco_actor_user",
					"fieldtype": "Link",
					"options": "User",
					"label": "Actor (typed / triggered by)",
					"insert_after": "doco_sent_by_type",
					"read_only": 1,
				},
				{
					"fieldname": "doco_automation_source",
					"fieldtype": "Data",
					"label": "Automation Source",
					"description": "e.g. taller.tracker_notify:Recibido",
					"insert_after": "doco_actor_user",
					"read_only": 1,
				},
				{
					# Reserved for the Phase-2 chatflow engine. Data (not Link) so it
					# exists before any Chatflow/Agent Bot doctype does.
					"fieldname": "doco_bot",
					"fieldtype": "Data",
					"label": "Bot / Chatflow",
					"insert_after": "doco_automation_source",
					"read_only": 1,
				},
				{
					"fieldname": "doco_bot_step",
					"fieldtype": "Data",
					"label": "Bot Step",
					"insert_after": "doco_bot",
					"read_only": 1,
				},
			]
		},
		ignore_validate=True,
	)

	# Light backfill — existing rows have NULL. We can't recover the exact trigger
	# of old automatic sends, so attribute everything to its creator as Human
	# (the honest floor). New rows are stamped at the send points going forward.
	frappe.db.sql(
		"""UPDATE `tabWhatsApp Message`
		      SET doco_sent_by_type = 'Human',
		          doco_actor_user = owner
		    WHERE doco_sent_by_type IS NULL OR doco_sent_by_type = ''"""
	)
