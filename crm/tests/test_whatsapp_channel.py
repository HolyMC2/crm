"""CRM's manual (wa.me) WhatsApp path, from fictional records; nothing is sent.

The site's channel (mode, digits, link) belongs to ``frappe_whatsapp.channel``;
these tests stand in for it so CRM's own rules are checked on any site.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import quote
from uuid import uuid4

import frappe

from crm.api import whatsapp_channel as crm_channel


def _fake_digits(raw, region=None):
	# Stand-in for frappe_whatsapp.channel.wa_digits: the region completes a
	# 10-digit national number, anything shorter is not diallable.
	digits = "".join(c for c in str(raw or "") if c.isdigit())
	return f"52{digits[-10:]}" if region == "MX" and len(digits) >= 10 else None


def _fake_channel(mode="manual", shop="", hint=None):
	return SimpleNamespace(
		resolve_mode=lambda: mode,
		site_region=lambda: "MX",
		wa_digits=_fake_digits,
		wa_link=lambda d, text=None: f"https://wa.me/{d}" + (f"?text={quote(text, safe='')}" if text else ""),
		shop_number=lambda: shop,
		sender_hint=lambda: hint,
	)


class TestWithoutChannelModule(unittest.TestCase):
	def test_missing_frappe_whatsapp_channel_means_off(self):
		with patch.object(crm_channel, "channel", None):
			self.assertEqual(crm_channel.resolve_mode(), "off")
			with self.assertRaises(frappe.ValidationError):
				crm_channel._require_manual()


class TestManualChannel(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.point = "wa_channel_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.channel = _fake_channel(shop="+52 55 0000 0000", hint="Envía desde el WhatsApp del negocio.")
		self.enterContext(patch.object(crm_channel, "channel", self.channel))

	def tearDown(self):
		frappe.db.rollback(save_point=self.point)

	def lead(self, **values):
		name = uuid4().hex
		# new_doc applies field defaults (a site's `mobile_is_whatsapp` defaults to 1).
		doc = frappe.new_doc("CRM Lead")
		doc.update({"name": name, "first_name": "Fictional", "lead_name": "Fictional Uno", **values})
		doc.db_insert()
		return name

	def template(self, body, field_names="", status="APPROVED", sample_values=""):
		if not frappe.db.exists("DocType", "WhatsApp Templates"):
			self.skipTest("frappe_whatsapp not installed")
		name = "wa-channel-" + uuid4().hex[:10]
		frappe.get_doc(
			{
				"doctype": "WhatsApp Templates",
				"name": name,
				"template_name": name,
				"actual_name": name,
				"template": body,
				"field_names": field_names,
				"sample_values": sample_values,
				"status": status,
				"for_doctype": "CRM Lead",
			}
		).db_insert()
		return name

	def test_recipient_is_the_mobile(self):
		lead = self.lead(mobile_no="55 1234 5678", phone="33 1234 5678")
		self.assertEqual(crm_channel.recipient("CRM Lead", lead), "525512345678")

	def test_recipient_skips_a_mobile_marked_not_whatsapp(self):
		lead = self.lead(mobile_no="55 1234 5678", phone="33 1234 5678")
		doc = frappe.get_doc("CRM Lead", lead)
		doc.mobile_is_whatsapp = 0
		with (
			patch.object(crm_channel.frappe, "get_doc", return_value=doc),
			patch.object(type(doc.meta), "has_field", lambda meta, f: True),
		):
			self.assertEqual(crm_channel.recipient("CRM Lead", lead), "523312345678")

	def test_recipient_falls_through_undiallable_numbers(self):
		lead = self.lead(mobile_no="12345", phone="33 1234 5678")
		self.assertEqual(crm_channel.recipient("CRM Lead", lead), "523312345678")

	def test_recipient_refuses_a_number_the_record_does_not_hold(self):
		lead = self.lead(mobile_no="55 1234 5678")
		self.assertEqual(crm_channel.recipient("CRM Lead", lead, "5215512345678"), "525512345678")
		with self.assertRaises(frappe.PermissionError):
			crm_channel.recipient("CRM Lead", lead, "5599998888")

	def test_template_is_filled_into_the_wa_me_link(self):
		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Hola {{1}}, gracias por escribir.", field_names="lead_name")
		out = crm_channel.prepare_manual_message("CRM Lead", lead, template=tpl)
		self.assertEqual(out["text"], "Hola Fictional Uno, gracias por escribir.")
		self.assertEqual(out["url"], "https://wa.me/525512345678?text=" + quote(out["text"], safe=""))
		self.assertEqual(out["missing"], [])

	def test_empty_record_field_is_reported_missing(self):
		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Hola {{1}}, tu correo es {{2}}.", field_names="lead_name,email")
		out = crm_channel.prepare_manual_message("CRM Lead", lead, template=tpl)
		self.assertEqual(out["missing"], [frappe._(frappe.get_meta("CRM Lead").get_field("email").label)])

	def test_sample_values_never_reach_a_customer(self):
		"""No field mapping: frappe_whatsapp would send Meta's samples. The manual
		message keeps the hole visible and asks the worker for it instead."""
		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Hola {{1}}, tu pedido {{2}}.", sample_values="Marco,abc123")
		out = crm_channel.prepare_manual_message("CRM Lead", lead, template=tpl)
		self.assertEqual(out["text"], "Hola {{1}}, tu pedido {{2}}.")
		self.assertNotIn("Marco", out["text"])
		self.assertEqual(len(out["missing"]), 2)

	def test_unmapped_placeholder_is_reported(self):
		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Hola {{1}}, ver {{2}}.", field_names="lead_name")
		out = crm_channel.prepare_manual_message("CRM Lead", lead, template=tpl)
		self.assertEqual(out["text"], "Hola Fictional Uno, ver {{2}}.")
		self.assertEqual(len(out["missing"]), 1)

	def test_composer_preview_and_manual_link_carry_the_same_values(self):
		"""The composer (API send) and the manual box resolve through one contract."""
		from crm.api.whatsapp import get_template_preview

		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Hola {{1}} ({{2}}).", field_names="customer_first_name,customer_name")
		preview = get_template_preview("CRM Lead", lead, tpl)
		self.assertEqual([v["value"] for v in preview["variables"]], ["Fictional", "Fictional Uno"])
		out = crm_channel.prepare_manual_message("CRM Lead", lead, template=tpl)
		self.assertEqual(out["text"], preview["rendered"])
		self.assertEqual(out["text"], "Hola Fictional (Fictional Uno).")

	def test_composer_preview_never_prefills_meta_samples(self):
		from crm.api.whatsapp import get_template_preview

		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Orden {{1}} lista.", sample_values="REP-2026-0001")
		preview = get_template_preview("CRM Lead", lead, tpl)
		self.assertEqual(preview["variables"][0]["value"], "")
		self.assertEqual(len(preview["missing"]), 1)
		self.assertNotIn("REP-2026-0001", preview["rendered"])

	def test_unapproved_template_is_not_offered(self):
		lead = self.lead(mobile_no="55 1234 5678")
		tpl = self.template("Borrador {{1}}", field_names="lead_name", status="REJECTED")
		self.assertNotIn(tpl, [t["name"] for t in crm_channel.list_manual_templates("CRM Lead")])
		with self.assertRaises(frappe.ValidationError):
			crm_channel.prepare_manual_message("CRM Lead", lead, template=tpl)

	def test_free_text_link_and_bare_link(self):
		lead = self.lead(mobile_no="55 1234 5678")
		out = crm_channel.prepare_manual_message("CRM Lead", lead, text="¿Sigue en pie la cita?")
		self.assertEqual(out["url"], "https://wa.me/525512345678?text=%C2%BFSigue%20en%20pie%20la%20cita%3F")
		info = crm_channel.get_record_channel("CRM Lead", lead)
		self.assertEqual(info["url"], "https://wa.me/525512345678")
		self.assertEqual(info["shop_number"], "+52 55 0000 0000")
		self.assertEqual(info["sender_hint"], "Envía desde el WhatsApp del negocio.")

	def test_log_says_opened_not_delivered(self):
		lead = self.lead(mobile_no="55 1234 5678")
		has_messages = frappe.db.exists("DocType", "WhatsApp Message")
		messages = frappe.db.count("WhatsApp Message") if has_messages else 0
		name = crm_channel.log_manual_open("CRM Lead", lead, text="Hola <b>Uno</b>")
		comment = frappe.get_doc("Comment", name)
		self.assertEqual((comment.reference_doctype, comment.reference_name), ("CRM Lead", lead))
		self.assertEqual(comment.comment_type, "Comment")
		self.assertIn("manualmente", comment.content)
		self.assertIn("no confirmado", comment.content)
		self.assertIn("&lt;b&gt;Uno", comment.content)
		if has_messages:
			self.assertEqual(frappe.db.count("WhatsApp Message"), messages)

	def test_api_and_off_never_produce_a_wa_me_link(self):
		lead = self.lead(mobile_no="55 1234 5678")
		for mode in ("api", "off"):
			with patch.object(crm_channel, "channel", _fake_channel(mode=mode, shop="+52 55 0000 0000")):
				info = crm_channel.get_record_channel("CRM Lead", lead)
				self.assertEqual(info["mode"], mode)
				self.assertIsNone(info["url"])
				self.assertEqual(info["shop_number"], "")
				with self.assertRaises(frappe.ValidationError):
					crm_channel.prepare_manual_message("CRM Lead", lead, text="Hola")
				with self.assertRaises(frappe.ValidationError):
					crm_channel.log_manual_open("CRM Lead", lead, text="Hola")


class TestRealChannelDigits(unittest.TestCase):
	"""Once frappe_whatsapp ships `channel`, CRM relies on its digits rule."""

	def setUp(self):
		if crm_channel.channel is None:
			self.skipTest("frappe_whatsapp.channel not installed")

	def test_region_completion_and_legacy_mobile_fold(self):
		wa_digits = crm_channel.channel.wa_digits
		self.assertEqual(wa_digits("55 1234 5678", "MX"), "525512345678")
		self.assertEqual(wa_digits("+52 1 55 1234 5678", "MX"), "525512345678")
		self.assertEqual(wa_digits("5215512345678", "MX"), "525512345678")
		self.assertIsNone(wa_digits("12345", "MX"))
