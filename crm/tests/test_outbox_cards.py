"""Product cards on Bot intents (outbox_media): frozen per provider, every URL the shop's
own, rechecked before every dispatch, sent through the exact native transport body.

Same fixtures as test_outbox (no live requests, no committed fixtures). Only the
`test_outbox_card_*` cases are this module's own. The pinned run's own grant
(bot_dispatch_reason, the producer's) and its control generation are replaced: they
are the customer adapter's tests; here the outbox's card rules are the subject.
"""

import io
import json
from types import SimpleNamespace
from typing import ClassVar
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.utils import now_datetime

from crm.api import conversations as control
from crm.api import outbox as api
from crm.api import outbox_media as media
from crm.tests import test_outbox

HOST = "tienda.example.invalid"


def jpeg():
	from PIL import Image

	picture = io.BytesIO()
	Image.new("RGB", (4, 4), (10, 120, 200)).save(picture, "JPEG")
	return picture.getvalue()


class TestOutboxCards(test_outbox.TestOutbox):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.addClassCleanup(frappe.db.rollback)

	def setUp(self):
		if not self._testMethodName.startswith("test_outbox_card_"):
			self.skipTest("test_outbox's own case; it runs there")
		super().setUp()
		frappe.set_user("Administrator")
		self.enterContext(patch.object(media, "get_url", return_value="https://" + HOST))
		self.owner = SimpleNamespace(
			public_hosts=lambda: ["shop.example.invalid"],
			public_media=lambda url: url.startswith("https://shop.example.invalid/img/files/"),
		)
		self.enterContext(patch.object(media, "_owner", side_effect=lambda: self.owner))
		self.file = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"ficha-{uuid4().hex[:8]}.jpg",
				"is_private": 0,
				"content": jpeg(),
			}
		).insert(ignore_permissions=True)
		self.photo = "https://" + HOST + self.file.file_url

	def card(self, **values):
		return {
			"type": "card",
			"title": "Funda Galaxy A15",
			"detail": "$150.00 — Disponible",
			"link": f"https://{HOST}/producto/FUN-A15",
			"image": self.photo,
			"button": "Ver producto",
			**values,
		}

	def bot_intent(self, frozen):
		"""A Bot intent as the customer run's adapter writes it (automation_customer.queue_message)."""
		name, now = uuid4().hex + uuid4().hex, now_datetime()
		doc = frappe.get_doc(
			{
				"doctype": api.DOCTYPE,
				"name": name,
				"action_key": name,
				"conversation": self.doc.name,
				"conversation_generation": frappe.db.get_value(control.DOCTYPE, self.doc.name, "generation"),
				"provider": self.doc.provider,
				"account_id": self.doc.account_id,
				"peer_id": self.doc.peer_id,
				"actor_user": self.users["one"],
				"origin": "Bot",
				"purpose": "automation",
				"run_name": "fixture-run",
				"source_doctype": "Chatflow Run",
				"source_name": "fixture-run",
				"source_action": "agent",
				"payload": frozen,
				"state": "Queued",
				"attempts": 0,
				"expires_at": frappe.utils.add_to_date(now, hours=1),
				"state_log": api._canonical([{"state": "Queued", "at": str(now), "reason": ""}]),
			}
		)
		doc.payload_hash = api._fingerprint(doc)
		api._mark(doc).insert(ignore_permissions=True)
		return name

	def granted(self):
		"""The run's grant and control as the customer adapter would answer for a live run."""
		self.enterContext(patch.object(api, "bot_dispatch_reason", return_value=None))
		self.enterContext(
			patch.object(
				control, "assert_current_generation", side_effect=lambda *a, **k: control._load(self.doc.name)
			)
		)

	def transport(self):
		from frappe.utils.password import set_encrypted_password
		from frappe_whatsapp import transport

		set_encrypted_password(
			"WhatsApp Account", self.account.name, "fictional-test-token", fieldname="token"
		)
		frappe.db.set_value("WhatsApp Account", self.account.name, "version", "v23.0")
		body = api._canonical(
			{
				"messaging_product": "whatsapp",
				"contacts": [{"input": self.peer, "wa_id": self.peer}],
				"messages": [{"id": "wamid.card-" + uuid4().hex[:8]}],
			}
		).encode()

		class Response:
			status_code = 200
			headers: ClassVar[dict[str, str]] = {
				"Content-Type": "application/json",
				"Content-Length": str(len(body)),
			}

			def iter_content(self, chunk_size):
				yield body

			def close(self):
				pass

		return patch.object(transport, "raw", return_value=Response())

	def test_outbox_card_whatsapp_photo_goes_out_as_the_exact_frozen_body(self):
		frozen = api.bot_payload(self.card(), self.doc)
		payload = json.loads(frozen)
		self.assertEqual((payload["type"], payload["image"]["link"]), ("image", self.photo))
		self.assertEqual(
			payload["image"]["caption"],
			f"*Funda Galaxy A15* — $150.00 — Disponible\nhttps://{HOST}/producto/FUN-A15",
		)
		name = self.bot_intent(frozen)
		self.granted()
		with self.transport() as http:
			self.worker(name)
		doc = api._load(name)
		self.assertEqual(doc.state, "Accepted")
		self.assertEqual(http.call_args.kwargs["data"], doc.payload.encode())
		self.assertEqual(api._projection(doc)["text"], payload["image"]["caption"])

	def test_outbox_card_without_photo_is_its_text_and_social_and_webchat_have_their_own(self):
		self.assertEqual(
			json.loads(api.bot_payload(self.card(image=None), self.doc))["text"]["body"],
			f"*Funda Galaxy A15* — $150.00 — Disponible\nhttps://{HOST}/producto/FUN-A15",
		)
		webchat = frappe._dict(provider="Webchat", account_id="a" * 64, peer_id="b" * 64)
		frozen = json.loads(api.bot_payload(self.card(), webchat))
		self.assertEqual(frozen["type"], "card")
		self.assertEqual(
			frozen["card"],
			{
				"title": "Funda Galaxy A15",
				"detail": "$150.00 — Disponible",
				"link": f"https://{HOST}/producto/FUN-A15",
				"image": self.photo,
				"button": "Ver producto",
			},
		)
		self.assertEqual(
			frozen["text"], f"Funda Galaxy A15 — $150.00 — Disponible\nhttps://{HOST}/producto/FUN-A15"
		)
		if api.channel_adapter("Messenger") is None or not hasattr(
			api.channel_adapter("Messenger"), "freeze_card"
		):
			return
		messenger = frappe._dict(provider="Messenger", account_id="1000000001", peer_id="2000000002")
		element = json.loads(api.bot_payload(self.card(), messenger))["message"]["attachment"]["payload"][
			"elements"
		][0]
		self.assertEqual(element["image_url"], self.photo)
		self.assertEqual(
			element["buttons"][0],
			{"type": "web_url", "url": f"https://{HOST}/producto/FUN-A15", "title": "Ver producto"},
		)

	def test_outbox_card_forged_urls_and_shapes_are_refused(self):
		private = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"privada-{uuid4().hex[:8]}.jpg",
				"is_private": 1,
				"content": jpeg(),
			}
		).insert(ignore_permissions=True)
		for forged in (
			{"link": "https://evil.example.invalid/producto/x"},
			{"link": "http://" + HOST + "/producto/x"},
			{"link": "javascript:alert(1)"},
			{"link": f"https://user:pw@{HOST}/producto/x"},
			{"link": f"https://{HOST}:8443/producto/x"},
			{"image": "https://evil.example.invalid/files/x.jpg"},
			{"image": f"https://{HOST}{private.file_url}"},
			{"image": f"https://{HOST}/files/no-such-file.jpg"},
			{"image": f"https://{HOST}/files/../private/files/x.jpg"},
			{"image": self.photo + "?x=1"},
			{"image": "https://shop.example.invalid/files/x.jpg"},
			{"title": ""},
			{"title": "x" * 81},
			{"script": "<b>"},
			{"type": "image"},
		):
			with self.assertRaises(frappe.ValidationError, msg=str(forged)):
				api.bot_payload(self.card(**forged), self.doc)
		self.assertIsNone(
			media.url_reason("https://shop.example.invalid/img/files/a.jpg?w=800&fmt=jpeg", media=True)
		)
		self.assertIsNone(media.url_reason("https://shop.example.invalid/producto/A", media=False))

	def test_outbox_card_a_photo_made_private_stops_the_send(self):
		name = self.bot_intent(api.bot_payload(self.card(), self.doc))
		frappe.db.set_value("File", self.file.name, "is_private", 1)
		self.granted()
		with self.transport() as http:
			self.worker(name)
		doc = api._load(name)
		self.assertEqual((doc.state, doc.reason_code), ("Blocked", "card_image_not_public"))
		http.assert_not_called()

	def test_outbox_card_a_domain_removed_stops_the_send(self):
		name = self.bot_intent(
			api.bot_payload(self.card(link="https://shop.example.invalid/producto/A"), self.doc)
		)
		self.owner = SimpleNamespace(public_hosts=lambda: [], public_media=lambda url: False)
		self.granted()
		with self.transport() as http:
			self.worker(name)
		self.assertEqual(api._load(name).reason_code, "card_host_not_public")
		http.assert_not_called()

	def test_outbox_card_people_still_send_plain_text_only(self):
		frappe.set_user(self.users["one"])
		with self.assertRaises(frappe.ValidationError):
			api.queue_message(self.doc.name, 2, uuid4().hex, self.card())

	def test_outbox_card_webchat_transcript_keeps_the_card(self):
		from crm.api import webchat

		frozen = webchat.validate_payload(
			{
				"type": "card",
				"text": "Funda — $150.00",
				"card": {
					"title": "Funda",
					"detail": "$150.00",
					"link": f"https://{HOST}/producto/F",
					"button": "Ver producto",
				},
			},
			account_id="a" * 64,
			peer_id="b" * 64,
		)
		self.assertIn(b'"card"', frozen)
		for bad in (
			{"title": "", "button": "Ver"},
			{"title": "x", "button": "Ver", "link": "http://x.example"},
			{"title": "x", "button": "Ver", "onclick": "y"},
		):
			with self.assertRaises(ValueError):
				webchat.validate_payload(
					{"type": "card", "text": "x", "card": bad}, account_id="a" * 64, peer_id="b" * 64
				)
		row = frappe._dict(
			name="c" * 64,
			text="Funda — $150.00",
			direction="Outgoing",
			creation=now_datetime(),
			card=json.dumps(
				{
					"title": "Funda",
					"detail": "$150.00",
					"button": "Ver producto",
					"link": f"https://{HOST}/producto/F",
				}
			),
		)
		self.assertEqual(webchat._message_projection(row)["card"]["link"], f"https://{HOST}/producto/F")
		row.card = '{"title": "<script>", "button": 7}'
		self.assertNotIn("card", webchat._message_projection(row))
