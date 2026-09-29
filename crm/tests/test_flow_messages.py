"""A Published WhatsApp Flow as a person's reply through the core outbox.

Same fixtures as test_outbox (no live requests, no committed fixtures). Only the
`test_outbox_flow_*` cases are this module's own; run them with --test.
"""

import json
from unittest.mock import patch
from uuid import uuid4

import frappe

from crm.api import flow_messages, form_links
from crm.api import outbox as api
from crm.api.outbox_policy import requires_window
from crm.tests import test_outbox


class TestFlowMessages(test_outbox.TestOutbox):
	def flow(self, status="Published", flow_id="123456789", account=None):
		from frappe_whatsapp.flow_builder import sync_flow

		frappe.set_user("Administrator")
		name = sync_flow(
			{
				"flow_name": "Flow " + uuid4().hex[:8],
				"screens": [{"title": "Quote", "fields": [{"name": "first_name", "type": "TextInput", "label": "Name", "required": True}]}],
			},
			whatsapp_account=account or self.account.name,
		)["flow"]
		frappe.db.set_value("WhatsApp Flow", name, {"status": status, "flow_id": flow_id})
		frappe.set_user(self.users["one"])
		return name

	def queue_flow(self, flow, request_id=None, body="Fill in the quote"):
		return api.queue_flow_message(
			self.doc.name, 2, request_id or uuid4().hex, {"flow": flow, "body": body, "token_prefix": "wf1.abc"}
		)

	def test_outbox_flow_freezes_one_interactive_flow_and_replays_exactly(self):
		flow = self.flow()
		request = uuid4().hex
		first = self.queue_flow(flow, request_id=request)
		self.assertEqual(self.queue_flow(flow, request_id=request)["name"], first["name"])
		intent = api._load(first["name"])
		payload = json.loads(intent.payload)
		parameters = payload["interactive"]["action"]["parameters"]
		self.assertEqual(payload["interactive"]["type"], "flow")
		self.assertEqual(parameters["flow_id"], "123456789")
		self.assertTrue(parameters["flow_token"].startswith("wf1.abc."))
		self.assertEqual(parameters["flow_action_payload"], {"screen": "SCREEN_A"})
		self.assertEqual((intent.origin, intent.purpose, intent.state), ("Human", "manual", "Queued"))
		# A flow is not a template: the 24h customer window applies.
		self.assertTrue(requires_window(intent))
		with self.assertRaises(frappe.ValidationError):
			self.queue_flow(flow, request_id=request, body="Different")

	def test_outbox_flow_evidence_only_after_provider_acceptance(self):
		flow = self.flow()
		name = self.queue_flow(flow)["name"]
		token = json.loads(api._load(name).payload)["interactive"]["action"]["parameters"]["flow_token"]
		self.assertIsNone(flow_messages.sent_with_token(token, self.peer))
		intent, _send = self.dispatch(name)
		self.assertEqual(intent.state, "Accepted", intent.reason_code)
		evidence = flow_messages.sent_with_token(token, self.peer)
		self.assertEqual((evidence.name, evidence.conversation), (name, self.doc.name))
		self.assertIsNone(flow_messages.sent_with_token(token, "5215550100111"))
		self.assertIsNone(flow_messages.sent_with_token(token + "x", self.peer))

	def test_outbox_flow_requires_published_flow_of_this_account(self):
		with self.assertRaises(frappe.ValidationError):
			self.queue_flow(self.flow(status="Draft", flow_id=None))
		frappe.set_user("Administrator")
		other = frappe.get_doc(
			{
				"doctype": "WhatsApp Account",
				"account_name": self.prefix + uuid4().hex[:8],
				"phone_id": "97" + str(int(uuid4().hex[:12], 16)),
				"status": "Active",
				"mode": "Demo",
				"is_default_incoming": 0,
				"is_default_outgoing": 0,
			}
		).insert()
		with self.assertRaises(frappe.ValidationError):
			self.queue_flow(self.flow(account=other.name))
		self.assertEqual(frappe.db.count(api.DOCTYPE, {"conversation": self.doc.name}), 0)

	def test_outbox_flow_form_link_is_additive_metadata(self):
		frappe.set_user("Administrator")
		# Any existing record: linking is metadata on this rolled-back conversation only.
		lead = frappe._dict(name=frappe.get_all("CRM Lead", pluck="name", limit=1)[0])
		generation = frappe.db.get_value("CRM Conversation", self.doc.name, "generation")
		self.assertIn(self.doc.name, form_links.whatsapp_conversations("+52 1 " + self.peer[-10:]))
		self.assertTrue(form_links.link(self.doc.name, "CRM Lead", lead.name, source="form:test"))
		self.assertTrue(form_links.link(self.doc.name, "CRM Lead", lead.name, source="form:test"))
		links = json.loads(frappe.db.get_value("CRM Conversation", self.doc.name, "context_links"))
		self.assertEqual([(r["doctype"], r["name"]) for r in links].count(("CRM Lead", lead.name)), 1)
		self.assertEqual(frappe.db.get_value("CRM Conversation", self.doc.name, "generation"), generation)
