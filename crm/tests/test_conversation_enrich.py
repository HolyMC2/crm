# Copyright (c) 2026, Grupo Doco and contributors
# For license information, please see license.txt

"""Stored conversation compatibility — CRM layer (crm.api.whatsapp).

Covers the thread ENRICHER (template/reply/reaction resolution + from_name
fallback), the realtime `whatsapp_message` publish payload, the outbound send
path (`create_whatsapp_message` field/provenance contract + failure surfacing),
and the `validate` resolver hook at real-insert level.

Read/realtime fixtures use real stored messages, two accounts and native grants.
The legacy send/resolver cases retain rollback isolation and fictional tokens.
No live provider traffic is permitted; transport doubles prove only contracts.
"""

import json
import unittest
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.api.whatsapp import (
	_wa_message_fields,
	create_whatsapp_message,
	enrich_whatsapp_messages,
	get_from_name,
	on_update,
)
from crm.tests.test_whatsapp_read_scope import WhatsAppReadFixture

# Our frappe_whatsapp fork routes ALL Graph traffic through its `transport`
# Message sends now use the bounded message HTTP adapter after the scope guard.
# Keep that guard active and double only the provider call.
_MPR = "frappe_whatsapp.transport._message_api"


class StoredConversationFixture(WhatsAppReadFixture):
	def stored_message(self, frm=None, **over):
		from frappe.utils.password import set_encrypted_password

		frappe.set_user("Administrator")
		account = self.accounts["a"].name
		set_encrypted_password("WhatsApp Account", account, "fictional-unused", "token")
		doc = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Incoming",
				"from": frm or self.peer,
				"to": self.peer,
				"whatsapp_account": account,
				"content_type": "text",
				"message_type": "Manual",
				"message_id": "wamid.enrichment." + uuid4().hex,
				"message": "Fictional message",
				**over,
			}
		).insert()
		self.assertTrue(doc.is_demo)
		frappe.set_user(self.actor_a)
		return doc

	def row(self, frm=None, **over):
		doc = self.stored_message(frm, **over)
		return frappe.db.get_value("WhatsApp Message", doc.name, _wa_message_fields(), as_dict=True)


def _open_status() -> str:
	name = frappe.db.get_value("CRM Deal Status", {"type": "Open"}, "name") or frappe.db.get_value(
		"CRM Deal Status", {"type": "Ongoing"}, "name"
	)
	assert name, "site has no non-terminal CRM Deal Status"
	return name


class TestEnrich(StoredConversationFixture, IntegrationTestCase):
	# --- from_name fallbacks (regression da65a951) ---

	def test_orphan_message_falls_back_from_name_to_sender_number(self):
		"""A reference-less orphan row must not crash and must name itself from the
		sender number (there's no reference doc to name from)."""
		row = self.row(frm="5215559990123", message="hola", reference_doctype=None, reference_name=None)
		out = enrich_whatsapp_messages([row])
		self.assertEqual(len(out), 1)
		self.assertEqual(out[0]["from_name"], "5215559990123")

	def test_deleted_reference_does_not_crash(self):
		"""A dangling legacy parent is excluded without revealing its sender."""
		row = self.row(
			frm="5215559990124",
			reference_doctype="CRM Deal",
			reference_name=self.deal.name,
		)
		# Simulate a retained historical row whose parent no longer exists.
		frappe.db.set_value("WhatsApp Message", row.name, "reference_name", "CRM-DEAL-DOES-NOT-EXIST")
		out = enrich_whatsapp_messages([row])
		self.assertEqual(out, [])
		self.assertEqual(get_from_name(row), "")

	def test_get_from_name_direct_orphan(self):
		row = self.row(frm="5215559990125", reference_doctype=None, reference_name=None)
		self.assertEqual(get_from_name(row), "5215559990125")
		# Presentation data alone cannot supply a persisted account identity.
		self.assertEqual(get_from_name({"from": "521999", "reference_doctype": None}), "")

	# --- template resolution ---

	def test_template_message_resolves_body_header_footer_with_params(self):
		tpl_name = "test_enrich_tpl-es"
		if not frappe.db.exists("WhatsApp Templates", tpl_name):
			tpl = frappe.new_doc("WhatsApp Templates")
			tpl.name = tpl_name
			tpl.update(
				{
					"template_name": "test_enrich_tpl",
					"actual_name": "test_enrich_tpl",
					"template": "Hola {{1}}, tu folio {{2}}",
					"header": "Aviso {{1}}",
					"footer": "Gracias por tu compra",
					"language_code": "es",
					"status": "APPROVED",
				}
			)
			tpl.db_insert()  # bypass validate/after_insert -> no Meta POST

		row = self.row(
			message_type="Template",
			template=tpl_name,
			use_template=1,
			content_type="text",
			message=None,  # unresolved Template rows arrive body-less
			template_parameters=json.dumps(["Juan", "F-42"]),
			template_header_parameters=json.dumps(["URGENTE"]),
		)
		out = enrich_whatsapp_messages([row])
		self.assertEqual(out[0]["template"], "Hola Juan, tu folio F-42")
		self.assertEqual(out[0]["header"], "Aviso URGENTE")
		self.assertEqual(out[0]["footer"], "Gracias por tu compra")
		self.assertEqual(out[0]["template_name"], "test_enrich_tpl")

	# --- reply resolution ---

	def test_reply_message_resolves_reply_message(self):
		original = self.row(
			type="Incoming",
			frm="5215551230777",
			message="Mensaje original",
			message_id="wamid.origreply",
		)
		reply = self.row(
			type="Outgoing",
			to=original["from"],
			message="Es una respuesta",
			is_reply=1,
			reply_to_message_id="wamid.origreply",
		)
		out = enrich_whatsapp_messages([original, reply])
		reply_out = next(m for m in out if m["name"] == reply["name"])
		self.assertEqual(reply_out["reply_message"], "Mensaje original")
		self.assertEqual(reply_out["reply_to"], original["name"])
		self.assertEqual(reply_out["reply_to_type"], "Incoming")
		# reply_to_from labels the REPLIED-TO sender (audit L3 fix: derived from the
		# replied-to row, not the replying one) — here the orphan original's number.
		self.assertEqual(reply_out["reply_to_from"], "5215551230777")

	def test_corrupt_template_params_keep_thread_alive(self):
		"""Audit M6: a Template row with corrupt stored JSON params must not 500 the
		whole thread (deal + orphan views share this enricher) — the raw template body
		is kept and the other bubbles still render."""
		tpl_name = "test_enrich_tpl-es"
		if not frappe.db.exists("WhatsApp Templates", tpl_name):
			tpl = frappe.new_doc("WhatsApp Templates")
			tpl.name = tpl_name
			tpl.update(
				{
					"template_name": "test_enrich_tpl",
					"actual_name": "test_enrich_tpl",
					"template": "Hola {{1}}, tu folio {{2}}",
					"header": "Aviso {{1}}",
					"footer": "Gracias por tu compra",
					"language_code": "es",
					"status": "APPROVED",
				}
			)
			tpl.db_insert()

		normal = self.row(frm="5215551230999", message="mensaje normal")
		corrupt = self.row(
			message_type="Template",
			template=tpl_name,
			use_template=1,
			message=None,
			template_parameters="{not valid json",  # corrupt
			template_header_parameters="[oops",  # corrupt
		)
		out = enrich_whatsapp_messages([normal, corrupt])  # must NOT raise
		self.assertEqual(len(out), 2)
		tpl_out = next(m for m in out if m["message_type"] == "Template")
		# substitution skipped, raw template body kept (not a blank bubble / 500)
		self.assertEqual(tpl_out["template"], "Hola {{1}}, tu folio {{2}}")
		self.assertEqual(tpl_out["header"], "Aviso {{1}}")

	# --- reaction folding ---

	def test_reaction_attaches_to_reacted_message_and_is_dropped(self):
		original = self.row(
			type="Incoming",
			frm="5215551230888",
			message="Foto lista",
			message_id="wamid.reactorig",
		)
		reaction = self.row(
			type="Incoming",
			frm="5215551230888",
			content_type="reaction",
			message="\U0001f44d",
			reply_to_message_id="wamid.reactorig",
		)
		out = enrich_whatsapp_messages([original, reaction])
		# reaction row is folded into its target and dropped from the list
		self.assertEqual([m["name"] for m in out], [original["name"]])
		self.assertEqual(out[0]["reaction"], "\U0001f44d")


class TestRealtimePayload(StoredConversationFixture, IntegrationTestCase):
	"""The native stored binding keeps the legacy payload in explicit user rooms."""

	def _wa_event(self, direction, frm, to):
		doc = self.stored_message(
			frm,
			type=direction,
			to=to,
			reference_doctype="CRM Deal",
			reference_name=self.deal.name,
		)
		frappe.db.after_commit = CallbackManager()
		self.realtime.reset_mock()
		on_update(doc, None)
		self.assertFalse(self.realtime.called)
		# Run the actual callback without committing this rollback fixture.
		frappe.db.after_commit.run()
		calls = [call for call in self.realtime.call_args_list if call.args[0] == "whatsapp_message"]
		self.assertTrue(calls)
		self.assertNotIn(self.actor_b, [call.kwargs["user"] for call in calls])
		for call in calls:
			self.assertEqual(call.kwargs["room"], "user:" + call.kwargs["user"])
			self.assertNotIn("doctype", call.kwargs)
			if call.kwargs["user"] == self.actor_a:
				return call.args[1], call.kwargs
		self.fail("no authorized recipient event published")

	def test_incoming_payload_phone_is_from(self):
		payload, _ = self._wa_event("Incoming", "5215551111111", "5215552222222")
		self.assertEqual(payload["reference_doctype"], "CRM Deal")
		self.assertEqual(payload["reference_name"], self.deal.name)
		self.assertEqual(payload["phone"], "5215551111111")

	def test_outgoing_payload_phone_is_to(self):
		payload, _ = self._wa_event("Outgoing", "5215551111111", "5215552222222")
		self.assertEqual(payload["phone"], "5215552222222")


class TestSendPath(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# A new WhatsApp Message defaults type=Outgoing (Frappe picks the first
		# Select option), so the composer send dispatches via the default OUTGOING
		# account with Meta mocked; ensure one exists.
		_ensure_account("Conv Send Acct", phone_id="9800011001", incoming=True, outgoing=True)

	def tearDown(self):
		frappe.db.rollback()

	def _deal(self):
		deal = frappe.get_doc({"doctype": "CRM Deal", "status": _open_status()})
		deal.flags.ignore_permissions = True
		return deal.insert()

	def test_create_whatsapp_message_persists_reference_and_provenance(self):
		"""The composer send stores the reference + recipient + Human provenance and
		dispatches through the (mocked) Meta layer, ending Success with a message_id."""
		deal = self._deal()
		with patch(_MPR, return_value={"messages": [{"id": "wamid.mock"}]}) as mock_send:
			name = create_whatsapp_message(
				reference_doctype="CRM Deal",
				reference_name=deal.name,
				message="Hola mundo",
				to="5215551110000",
				attach="",
				reply_to="",
				content_type="text",
			)
		mock_send.assert_called_once()  # the send path reached Meta (mocked), not silently skipped
		doc = frappe.get_doc("WhatsApp Message", name)
		self.assertEqual(doc.to, "5215551110000")
		self.assertEqual(doc.reference_doctype, "CRM Deal")
		self.assertEqual(doc.reference_name, deal.name)
		self.assertEqual(doc.message, "Hola mundo")
		self.assertEqual(doc.content_type, "text")
		self.assertEqual(doc.status, "Success")
		self.assertEqual(doc.message_id, "wamid.mock")
		if frappe.db.has_column("WhatsApp Message", "doco_sent_by_type"):
			self.assertEqual(doc.doco_sent_by_type, "Human")
			self.assertEqual(doc.doco_actor_user, "Administrator")

	def test_outgoing_http_failure_surfaces_not_silent(self):
		"""A failed Meta send must raise (status Failed + throw), never be swallowed
		into a silent 'Sent' — the frappe_whatsapp send contract create_whatsapp_message
		relies on."""
		acct = _ensure_account("Conv Send Fail Acct", phone_id="9800011002")
		msg = frappe.new_doc("WhatsApp Message")
		msg.update(
			{
				"type": "Outgoing",
				"to": "5215551110000",
				"message": "boom",
				"content_type": "text",
				"whatsapp_account": acct,
			}
		)

		class _FakeResp:
			def json(self):
				return {"error": {"message": "network down"}}

		orig_flag = getattr(frappe.flags, "integration_request", None)
		frappe.flags.integration_request = _FakeResp()
		try:
			with patch(_MPR, side_effect=Exception("network down")):
				with self.assertRaises(Exception):
					msg.insert(ignore_permissions=True)
		finally:
			frappe.flags.integration_request = orig_flag


class TestValidateResolverIntegration(unittest.TestCase):
	"""Unverified inbound text cannot infer authority from a matching phone.
	An explicitly authorized preset reference survives the normal insert.
	Verified receipt attribution is covered in test_phone_lookup_receipts.
	"""

	_PHONE = "+5215559990042"

	def setUp(self):
		frappe.set_user("Administrator")
		self.acct = _ensure_account("Conv Resolver Acct", phone_id="conv_resolver_pid", incoming=True)
		self.contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Conversation Resolver Test",
				"phone_nos": [{"phone": self._PHONE, "is_primary_mobile_no": 1}],
			}
		)
		self.contact.flags.ignore_permissions = True
		self.contact.insert()
		self.deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": _open_status(),
				"contacts": [{"contact": self.contact.name, "is_primary": 1}],
			}
		)
		self.deal.flags.ignore_permissions = True
		self.deal.insert()

	def tearDown(self):
		frappe.db.rollback()

	def _incoming(self, **over):
		doc = frappe.new_doc("WhatsApp Message")
		doc.update(
			{
				"type": "Incoming",
				"from": "5215559990042",
				"message": "hola",
				"content_type": "text",
				"message_id": frappe.generate_hash(length=10),
				"whatsapp_account": self.acct,
			}
		)
		doc.update(over)
		return doc

	def test_unverified_incoming_does_not_resolve_open_deal_on_real_insert(self):
		with patch(_MPR, return_value={"messages": [{"id": "wamid.mock"}]}):
			doc = self._incoming()
			doc.insert(ignore_permissions=True)
		self.assertFalse(doc.reference_doctype)
		self.assertFalse(doc.reference_name)

	def test_validate_respects_preset_reference(self):
		other = frappe.get_doc({"doctype": "CRM Deal", "status": _open_status()})
		other.flags.ignore_permissions = True
		other.insert()
		with patch(_MPR, return_value={"messages": [{"id": "wamid.mock"}]}):
			doc = self._incoming(reference_doctype="CRM Deal", reference_name=other.name)
			doc.insert(ignore_permissions=True)
		self.assertEqual(doc.reference_name, other.name)


def _ensure_account(account_name: str, phone_id: str, incoming: bool = False, outgoing: bool = False) -> str:
	"""A minimal WhatsApp Account fixture (no default flags unless asked, so it
	never disturbs the site's real defaults). Rolled back by the test."""
	if frappe.db.exists("WhatsApp Account", account_name):
		return account_name
	acct = frappe.get_doc(
		{
			"doctype": "WhatsApp Account",
			"account_name": account_name,
			"status": "Active",
			"url": "https://graph.facebook.com",
			"version": "v19.0",
			"phone_id": phone_id,
			"business_id": f"{phone_id}_biz",
			"app_id": f"{phone_id}_app",
			"webhook_verify_token": f"{phone_id}_vt",
			"is_default_incoming": 1 if incoming else 0,
			"is_default_outgoing": 1 if outgoing else 0,
		}
	)
	acct.insert(ignore_permissions=True)
	# notify()/send_outgoing read get_password("token") BEFORE the (mocked) HTTP
	# call — a fake token keeps the send path off a real credential.
	from frappe.utils.password import set_encrypted_password

	set_encrypted_password("WhatsApp Account", acct.name, "lab-fake-token", "token")
	return acct.name
