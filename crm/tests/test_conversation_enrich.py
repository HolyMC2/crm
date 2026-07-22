# Copyright (c) 2026, Grupo Doco and contributors
# For license information, please see license.txt

"""FCRM conversation contract — CRM layer (crm.api.whatsapp).

Covers the thread ENRICHER (template/reply/reaction resolution + from_name
fallback), the realtime `whatsapp_message` publish payload, the outbound send
path (`create_whatsapp_message` field/provenance contract + failure surfacing),
and the `validate` resolver hook at real-insert level.

Base class: plain `unittest.TestCase` with a per-test `frappe.db.rollback()`,
matching the existing crm WhatsApp suites (test_whatsapp.py /
test_whatsapp_routing.py). Those deliberately avoid IntegrationTestCase because
its lazy test-record loader pulls ERPNext fixtures (_Test Product Bundle Item)
that don't build on the doco sites.

Meta HTTP is always mocked — the lab WhatsApp token is broken and a real send
would hit live Meta. See the module-path note on `_MPR` below.
"""

import json
import unittest
from unittest.mock import MagicMock, patch

import frappe

from crm.api.whatsapp import (
	create_whatsapp_message,
	enrich_whatsapp_messages,
	get_from_name,
	on_update,
)

# frappe_whatsapp imports make_post_request into its doctype module namespace,
# so the send path resolves it THERE — patch that binding, not the util origin.
_MPR = "frappe_whatsapp.frappe_whatsapp.doctype.whatsapp_message.whatsapp_message.make_post_request"


def _row(frm=None, **over) -> dict:
	"""A raw WhatsApp Message thread row (the shape `_wa_message_fields` returns,
	which is what `enrich_whatsapp_messages` consumes). Overridable per test.
	`frm` maps to the `from` key (a Python keyword, unusable as a kwarg)."""
	base = {
		"name": frappe.generate_hash(length=8),
		"type": "Incoming",
		"to": None,
		"from": frm,
		"content_type": "text",
		"message_type": "Manual",
		"attach": None,
		"template": None,
		"use_template": 0,
		"message_id": None,
		"is_reply": 0,
		"reply_to_message_id": None,
		"creation": frappe.utils.now(),
		"message": "",
		"status": None,
		"reference_doctype": None,
		"reference_name": None,
		"template_parameters": None,
		"template_header_parameters": None,
	}
	base.update(over)
	return base


def _open_status() -> str:
	name = frappe.db.get_value("CRM Deal Status", {"type": "Open"}, "name") or frappe.db.get_value(
		"CRM Deal Status", {"type": "Ongoing"}, "name"
	)
	assert name, "site has no non-terminal CRM Deal Status"
	return name


class TestEnrich(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.db.rollback()

	# --- from_name fallbacks (regression da65a951) ---

	def test_orphan_message_falls_back_from_name_to_sender_number(self):
		"""A reference-less orphan row must not crash and must name itself from the
		sender number (there's no reference doc to name from)."""
		row = _row(frm="5215559990123", message="hola", reference_doctype=None, reference_name=None)
		out = enrich_whatsapp_messages([row])
		self.assertEqual(len(out), 1)
		self.assertEqual(out[0]["from_name"], "5215559990123")

	def test_deleted_reference_does_not_crash(self):
		"""A row pointing at a since-deleted reference falls back to the number."""
		row = _row(
			frm="5215559990124",
			reference_doctype="CRM Deal",
			reference_name="CRM-DEAL-DOES-NOT-EXIST",
		)
		out = enrich_whatsapp_messages([row])
		self.assertEqual(out[0]["from_name"], "5215559990124")

	def test_get_from_name_direct_orphan(self):
		self.assertEqual(get_from_name({"from": "521999", "reference_doctype": None}), "521999")

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

		row = _row(
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
		original = _row(
			name="wa-orig-reply",
			type="Incoming",
			frm="5215551230777",
			message="Mensaje original",
			message_id="wamid.origreply",
		)
		reply = _row(
			name="wa-reply",
			type="Outgoing",
			message="Es una respuesta",
			is_reply=1,
			reply_to_message_id="wamid.origreply",
		)
		out = enrich_whatsapp_messages([original, reply])
		reply_out = next(m for m in out if m["name"] == "wa-reply")
		self.assertEqual(reply_out["reply_message"], "Mensaje original")
		self.assertEqual(reply_out["reply_to"], "wa-orig-reply")
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

		normal = _row(frm="5215551230999", message="mensaje normal")
		corrupt = _row(
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
		original = _row(
			name="wa-react-orig",
			type="Incoming",
			frm="5215551230888",
			message="Foto lista",
			message_id="wamid.reactorig",
		)
		reaction = _row(
			name="wa-react",
			type="Incoming",
			frm="5215551230888",
			content_type="reaction",
			message="\U0001f44d",
			reply_to_message_id="wamid.reactorig",
		)
		out = enrich_whatsapp_messages([original, reaction])
		# reaction row is folded into its target and dropped from the list
		self.assertEqual([m["name"] for m in out], ["wa-react-orig"])
		self.assertEqual(out[0]["reaction"], "\U0001f44d")


class TestRealtimePayload(unittest.TestCase):
	"""on_update publishes `whatsapp_message` with reference + phone (2d6c6c64):
	the inbox orphan catch needs `phone` to live-refresh the open Sin-asignar
	thread, and the deal thread needs reference_doctype/reference_name."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.published = []
		self._orig = frappe.publish_realtime
		frappe.publish_realtime = lambda *a, **k: self.published.append((a, k))

	def tearDown(self):
		frappe.publish_realtime = self._orig
		frappe.db.rollback()

	def _mock_doc(self, mtype, frm, to, ref_dt="CRM Deal", ref_dn="D-123"):
		doc = MagicMock()
		doc.type = mtype
		doc.reference_doctype = ref_dt
		doc.reference_name = ref_dn
		doc.get.side_effect = lambda k, *a: {"from": frm, "to": to}.get(k)
		return doc

	def _wa_event(self):
		for a, k in self.published:
			if a and a[0] == "whatsapp_message":
				return a[1], k
		self.fail("no whatsapp_message event published")

	def test_incoming_payload_phone_is_from(self):
		doc = self._mock_doc("Incoming", "5215551111111", "5215552222222")
		with patch("crm.api.whatsapp.notify_agent"):
			on_update(doc, None)
		payload, kwargs = self._wa_event()
		self.assertEqual(payload["reference_doctype"], "CRM Deal")
		self.assertEqual(payload["reference_name"], "D-123")
		self.assertEqual(payload["phone"], "5215551111111")
		self.assertTrue(kwargs.get("after_commit"))

	def test_outgoing_payload_phone_is_to(self):
		doc = self._mock_doc("Outgoing", "5215551111111", "5215552222222")
		with patch("crm.api.whatsapp.notify_agent"):
			on_update(doc, None)
		payload, _ = self._wa_event()
		self.assertEqual(payload["phone"], "5215552222222")


class TestSendPath(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# A new WhatsApp Message defaults type=Outgoing (Frappe picks the first
		# Select option), so the composer send dispatches via the default OUTGOING
		# account with Meta mocked; ensure one exists.
		_ensure_account("Conv Send Acct", phone_id="conv_send_pid", incoming=True, outgoing=True)

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
		acct = _ensure_account("Conv Send Fail Acct", phone_id="conv_send_fail_pid")
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
	"""crm.api.whatsapp.validate at real-insert level: an UNREFERENCED inbound is
	resolved to the contact's open deal; a PRESET reference is never overridden
	(the deliberately-threaded send must survive the fallback resolver)."""

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

	def test_validate_resolves_open_deal_on_real_insert(self):
		with patch(_MPR, return_value={"messages": [{"id": "wamid.mock"}]}):
			doc = self._incoming()
			doc.insert(ignore_permissions=True)
		self.assertEqual(doc.reference_doctype, "CRM Deal")
		self.assertEqual(doc.reference_name, self.deal.name)

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
