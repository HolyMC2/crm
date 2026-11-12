"""Sites built after create_message_provenance_fields was written never ran it (a new
site marks every patch done), so WhatsApp Message had no doco_actor_user and the
Marketing reports that read it failed. Run it once more; it is idempotent."""

from crm.patches.v1_0.create_message_provenance_fields import execute as create_fields


def execute():
	create_fields()
