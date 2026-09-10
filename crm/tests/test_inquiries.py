"""SQL-backed inquiry boundaries; run on a dedicated Frappe + CRM test site.

Fixtures use fictional identities. User creation intentionally respects seat limits.
Outbound mail, realtime delivery and lead assignment are mocked; documents,
permissions, transaction savepoints, uniqueness and receipt writes use the database.
"""

import json
import traceback
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import inquiries as api
from crm.fcrm.doctype.crm_inquiry.crm_inquiry import has_permission


class TestInquiries(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		if not frappe.db.exists("DocType", "CRM Inquiry"):
			raise RuntimeError("Install the inquiry DocTypes on a dedicated CRM test site before running this suite.")
		cls.prefix = "inquiry-" + uuid4().hex[:10]
		cls.users = {}
		with patch("frappe.sendmail"):
			for label, role in (("owner", "Sales User"), ("assignee", "Sales User"),
				("outsider", "Sales User"), ("manager", "Sales Manager"), ("noncrm", None)):
				name = f"{cls.prefix}-{label}@example.invalid"
				frappe.get_doc({
					"doctype": "User", "email": name, "first_name": "Inquiry " + label,
					"send_welcome_email": 0, "enabled": 1,
					"roles": [{"role": role}] if role else [],
				}).insert()
				cls.users[label] = name

	def setUp(self):
		super().setUp()
		frappe.set_user(self.users["owner"])
		self.savepoint = "test_inquiry_" + uuid4().hex
		frappe.db.savepoint(self.savepoint)
		self.realtime = self.enterContext(patch("frappe.publish_realtime"))
		self.mail = self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("crm.fcrm.doctype.crm_lead.crm_lead.CRMLead.assign_agent"))

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point=self.savepoint)
		super().tearDown()

	def capture(self, request_id=None, **values):
		return api.create_inquiry({
			"title": "Fictional public referral", "source_type": "Manual",
			"source_url": "https://example.invalid/public/post", "source_text": "Public context only.",
			"client_request_id": request_id or uuid4().hex,
			"people": [{"display_name": "Public Referrer", "role": "Referrer"}],
			**values,
		})

	def prospect(self):
		return self.capture(people=[
			{"display_name": "Public Referrer", "role": "Referrer", "phone": "555-0100"},
			{"display_name": "Selected Prospect", "role": "Interested Person", "phone": "555-0100"},
			{"display_name": "Second Prospect", "role": "Requester"},
		])

	def make_lead(self, owner=None):
		previous_user = frappe.session.user
		try:
			frappe.set_user(owner or self.users["owner"])
			return frappe.get_doc({"doctype": "CRM Lead", "first_name": "Fictional existing lead",
				"lead_owner": frappe.session.user}).insert()
		finally:
			frappe.set_user(previous_user)

	def test_actor_scoped_capture_replay_and_changed_payload(self):
		key = uuid4().hex
		first = self.capture(key)
		self.assertEqual(first["name"], self.capture(key)["name"])
		self.assertEqual(first["people"][0]["person_key"], self.capture(key)["people"][0]["person_key"])
		with self.assertRaises(frappe.ValidationError):
			self.capture(key, title="Different capture")
		frappe.set_user(self.users["outsider"])
		self.assertNotEqual(first["name"], self.capture(key)["name"])

	def test_replay_uses_immutable_hash_after_edits(self):
		key = uuid4().hex
		first = self.capture(key)
		updated = api.update_inquiry(first["name"], str(first["modified"]), {"title": "Triaged title"})
		api.add_person(first["name"], str(updated["modified"]), {"display_name": "New Person", "role": "Requester"})
		self.assertEqual("Triaged title", self.capture(key)["title"])
		with self.assertRaises(frappe.ValidationError):
			self.capture(key, title="Triaged title")

	def test_source_capture_owner_and_manager_replay_one_record(self):
		source = "doco_marketing:Social Mention:" + uuid4().hex
		payload = {"title": "Known public source", "source_type": "Facebook", "people": [
			{"display_name": "Source author", "role": "Referrer"},
		]}
		before = frappe.db.count("CRM Inquiry")
		first = api.capture_source_inquiry(source, payload)
		self.assertNotIn(api.capture_source_inquiry, frappe.whitelisted)
		self.assertEqual(self.users["owner"], first["owner"])
		self.assertEqual(first["name"], api.capture_source_inquiry(source, payload)["name"])
		frappe.set_user(self.users["manager"])
		replay = api.capture_source_inquiry(source, payload)
		self.assertEqual(first["name"], replay["name"])
		self.assertEqual(first["people"], replay["people"])
		self.assertEqual(before + 1, frappe.db.count("CRM Inquiry"))

	def test_source_capture_denied_staff_cannot_create_copy_or_read_receipt(self):
		source = "doco_marketing:Social Mention:" + uuid4().hex
		first = api.capture_source_inquiry(source, {"title": "Private inquiry title", "source_text": "Stored context"})
		before = frappe.db.count("CRM Inquiry")
		for actor in (self.users["outsider"], self.users["noncrm"], "Guest"):
			frappe.set_user(actor)
			message_start = len(frappe.local.message_log)
			with self.subTest(actor=actor), self.assertRaises(frappe.PermissionError):
				api.capture_source_inquiry(source, {})
			self.assertEqual(before, frappe.db.count("CRM Inquiry"))
			messages = frappe.as_json(frappe.local.message_log[message_start:])
			for denied in (first["name"], first["owner"], first["title"], first["source_text"]):
				self.assertNotIn(denied, messages)

	def test_source_capture_namespace_cannot_collide_with_manual_request_id(self):
		source = "doco_marketing:Social Mention:" + uuid4().hex
		manual = self.capture(source)
		captured = api.capture_source_inquiry(source, {"title": manual["title"]})
		self.assertNotEqual(manual["name"], captured["name"])
		self.assertNotEqual(
			frappe.db.get_value("CRM Inquiry", manual["name"], "capture_key"),
			frappe.db.get_value("CRM Inquiry", captured["name"], "capture_key"),
		)
		self.assertEqual(manual["name"], self.capture(source)["name"])
		self.assertEqual(captured["name"], api.capture_source_inquiry(source, {})["name"])
		with self.assertRaises(frappe.ValidationError):
			self.capture(source, source_key=source)

	def test_source_enrichment_never_overwrites_original_context_or_people(self):
		from frappe.utils import get_datetime

		source = "doco_marketing:Social Mention:" + uuid4().hex
		first = api.capture_source_inquiry(source, {
			"title": "Original mention", "source_url": "https://example.invalid/original",
			"source_text": "Original context", "people": [{"display_name": "Original author", "role": "Referrer"}],
		})
		frappe.set_user(self.users["manager"])
		replay = api.capture_source_inquiry(source, {
			"title": "Enriched title", "source_url": "https://example.invalid/enriched",
			"source_text": "Enriched context", "people": [{"display_name": "Another identity", "role": "Requester"}],
		})
		for field in ("name", "title", "source_url", "source_text", "people"):
			self.assertEqual(first[field], replay[field])
		self.assertEqual(get_datetime(first["modified"]), get_datetime(replay["modified"]))
		# Reuse the receipt even if later provider enrichment is no longer valid capture input.
		self.assertEqual(first["name"], api.capture_source_inquiry(source, {"source_url": "bad-url"})["name"])

	def test_source_unique_collision_replays_authorized_snapshot_without_overwrite(self):
		source = "doco_marketing:Social Mention:" + uuid4().hex
		first = api.capture_source_inquiry(source, {"title": "Original source"})
		unrelated = self.capture(title="Earlier transaction work")
		original = frappe.db.get_value
		misses = 2

		def lookup(doctype, filters=None, *args, **kwargs):
			nonlocal misses
			if misses and doctype == "CRM Inquiry" and isinstance(filters, dict) and "capture_key" in filters:
				misses -= 1
				return None  # Miss both optimistic lookups; the unique index must recover.
			return original(doctype, filters, *args, **kwargs)

		frappe.set_user(self.users["manager"])
		with patch.object(frappe.db, "get_value", side_effect=lookup):
			replay = api.capture_source_inquiry(source, {"title": "Later enrichment"})
		self.assertEqual(first["name"], replay["name"])
		self.assertEqual(first["title"], replay["title"])
		self.assertTrue(frappe.db.exists("CRM Inquiry", unrelated["name"]))

	def test_internal_finder_is_actor_scoped_and_not_whitelisted(self):
		key = "social-mention:" + uuid4().hex
		first = self.capture(key)
		self.assertEqual(first["name"], api.find_inquiry_for_request(key)["name"])
		self.assertNotIn(api.find_inquiry_for_request, frappe.whitelisted)
		frappe.set_user(self.users["outsider"])
		self.assertIsNone(api.find_inquiry_for_request(key))
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			api.find_inquiry_for_request(key)

	def source_fixture(self):
		identity = "meta:v2:Messenger:910001:lead_ad:" + uuid4().hex
		person = {"display_name": "Original respondent", "role": "Requester",
			"email": "respondent@example.invalid", "phone": "555-0100"}
		payload = {"title": "Fictional service request", "source_type": "Facebook", "people": [person]}
		context = {
			"version": 1, "mode": "automatic", "provider": "Messenger", "account_id": "910001",
			"source_kind": "lead_ad", "source_id": "910003", "source_identity": identity,
			"receipt_name": "fictional-receipt", "policy_hash": "a" * 64,
			"form_id": "910002", "leadgen_id": "910003", "purpose_statement": "Please email me about this repair.",
			"response_channel": "Email", "form_revision_hash": "b" * 64,
			"submitted_at": "2026-09-09 12:00:00", "original_respondent": person.copy(),
		}
		return identity, payload, context

	def test_source_evidence_uses_normal_actor_and_redacts_adapter_internals(self):
		identity, payload, context = self.source_fixture()
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		stored = json.loads(frappe.db.get_value("CRM Inquiry", first["name"], "capture_context"))
		self.assertEqual(self.users["owner"], stored["capture_user"])
		self.assertEqual(context["original_respondent"], stored["original_respondent"])
		self.assertEqual(context["purpose_statement"], first["source_evidence"]["purpose_statement"])
		for private in ("receipt_name", "policy_hash", "capture_user", "requested_by", "source_identity", "form_revision_hash"):
			self.assertNotIn(private, first["source_evidence"])
		self.assertNotIn("capture_context", frappe.get_doc("CRM Inquiry", first["name"]).as_dict())
		self.assertEqual(first["name"], api.find_source_inquiry(identity)["name"])
		self.assertNotIn(api.find_source_inquiry, frappe.whitelisted)
		self.assertIsNone(self.capture()["source_evidence"])

	def test_source_evidence_does_not_follow_added_people_or_create_leads(self):
		identity, payload, context = self.source_fixture()
		leads = frappe.db.count("CRM Lead")
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		updated = api.add_person(first["name"], str(first["modified"]), {
			"display_name": "Someone else", "role": "Interested Person", "email": "different@example.invalid",
		})
		self.assertEqual(first["source_evidence"], updated["source_evidence"])
		self.assertEqual(2, len(updated["people"]))
		self.assertEqual(leads, frappe.db.count("CRM Lead"))
		self.mail.assert_not_called()

	def test_source_evidence_replay_preserves_original_policy_across_actors(self):
		identity, payload, context = self.source_fixture()
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		frappe.set_user(self.users["manager"])
		later = {**context, "policy_hash": "c" * 64, "purpose_statement": "Later wording."}
		replay = api.capture_source_inquiry(identity, {}, capture_context=later)
		self.assertEqual(first["source_evidence"], replay["source_evidence"])
		self.assertEqual(first["name"], replay["name"])
		for changes in ({"account_id": "910009"}, {"form_id": "910008"},
			{"source_id": "910007", "leadgen_id": "910007"}):
			with self.subTest(changes=changes), self.assertRaises(frappe.ValidationError):
				api.capture_source_inquiry(identity, {}, capture_context={**context, **changes})

	def test_source_evidence_legacy_receipt_cannot_be_automatically_reinterpreted(self):
		identity, payload, context = self.source_fixture()
		first = api.capture_source_inquiry(identity, payload)
		with self.assertRaises(frappe.ValidationError):
			api.capture_source_inquiry(identity, payload, capture_context=context)
		self.assertEqual(first["name"], api.find_source_inquiry(identity)["name"])
		self.assertFalse(frappe.db.get_value("CRM Inquiry", first["name"], "capture_context"))

	def test_source_evidence_is_denied_to_unrelated_users_and_disabled_actor(self):
		identity, payload, context = self.source_fixture()
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		for actor in (self.users["outsider"], self.users["noncrm"], "Guest"):
			frappe.set_user(actor)
			for action in (lambda: api.find_source_inquiry(identity), lambda: api.get_inquiry(first["name"]),
				lambda: api.capture_source_inquiry(identity, payload, capture_context=context)):
				with self.subTest(actor=actor), self.assertRaises(frappe.PermissionError):
					action()

	def test_source_evidence_context_allowlist_actor_and_respondent_bounds(self):
		identity, payload, context = self.source_fixture()
		bad = [{"version": True}, {"version": 2}, {"marketing_consent": True},
			{"source_identity": "another-key"}, {"provider": "Instagram"}, {"account_id": "a"},
			{"policy_hash": "bad"}, {"receipt_name": ""}, {"form_id": ""}, {"form_revision_hash": ""},
			{"purpose_statement": ""}, {"purpose_statement": "x" * 4001}, {"response_channel": "All"},
			{"submitted_at": "yesterday"}, {"source_id": "different-lead"},
			{"mode": "manager_reprocess"}, {"original_respondent": {**context["original_respondent"], "role": "Referrer"}},
			{"original_respondent": {**context["original_respondent"], "email": ""}},
			{"original_respondent": {**context["original_respondent"], "lead": "forged"}}]
		for changes in bad:
			with self.subTest(fields=list(changes)), self.assertRaises(frappe.ValidationError):
				api.capture_source_inquiry(identity, payload, capture_context={**context, **changes})
		with self.assertRaises(frappe.PermissionError):
			api.capture_source_inquiry(identity, payload, capture_context={**context, "capture_user": "Administrator"})
		for changes in ({"source_type": "Instagram"}, {"people": []},
			{"people": [*payload["people"], {"display_name": "Other", "role": "Requester"}]}):
			with self.subTest(fields=list(changes)), self.assertRaises(frappe.ValidationError):
				api.capture_source_inquiry(identity, {**payload, **changes}, capture_context=context)

	def test_public_social_evidence_cannot_claim_form_purpose_or_buyer_identity(self):
		identity, payload, context = self.source_fixture()
		from crm.fcrm.doctype.crm_inquiry.source_evidence import FORM_FIELDS

		context = {key: value for key, value in context.items() if key not in FORM_FIELDS}
		context["source_kind"] = "fb_mention"
		with self.assertRaises(frappe.ValidationError):
			api.capture_source_inquiry(identity, payload, capture_context=context)
		payload["people"][0]["role"] = "Referrer"
		with self.assertRaises(frappe.ValidationError):
			api.capture_source_inquiry(identity, payload, capture_context={**context, "purpose_statement": "Contact me"})
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		self.assertEqual("Referrer", first["people"][0]["role"])
		self.assertNotIn("purpose_statement", first["source_evidence"])

	def test_generic_capture_evidence_forgery_and_update_cannot_change_snapshot(self):
		identity, payload, context = self.source_fixture()
		for actor in (self.users["owner"], "Administrator"):
			frappe.set_user(actor)
			with self.subTest(actor=actor), self.assertRaises(frappe.ValidationError):
				frappe.get_doc({"doctype": "CRM Inquiry", "title": "Forged evidence",
					"capture_context": json.dumps(context), "flags": {"inquiry_capture": ["token", "a", "b", context]}}).insert()
		frappe.set_user(self.users["owner"])
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		original = doc.capture_context
		doc.capture_context = "{}"
		doc.title = "Ordinary staff triage"
		doc.save()  # Restricted field is restored; ordinary triage still works.
		self.assertEqual(original, frappe.db.get_value("CRM Inquiry", doc.name, "capture_context"))
		frappe.set_user("Administrator")
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		doc.capture_context = "{}"
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_capture_evidence_preserves_literal_form_text_and_existing_transaction(self):
		identity, payload, context = self.source_fixture()
		context["purpose_statement"] = '<b>Email me</b> <script>literal evidence only</script>'
		first = api.capture_source_inquiry(identity, payload, capture_context=context)
		self.assertEqual(context["purpose_statement"], first["source_evidence"]["purpose_statement"])
		anchor = self.capture(title="Earlier transaction work")
		lookup = frappe.db.get_value
		misses = 2

		def missed(doctype, filters=None, *args, **kwargs):
			nonlocal misses
			if misses and doctype == "CRM Inquiry" and isinstance(filters, dict) and "capture_key" in filters:
				misses -= 1
				return None
			return lookup(doctype, filters, *args, **kwargs)

		with patch.object(frappe.db, "get_value", side_effect=missed):
			replay = api.capture_source_inquiry(identity, payload, capture_context=context)
		self.assertEqual(first["name"], replay["name"])
		self.assertTrue(frappe.db.exists("CRM Inquiry", anchor["name"]))

	def test_replay_permission_is_checked_before_receipt_content(self):
		key = uuid4().hex
		first = self.capture(key)
		# Simulates access revocation by an administrative ownership repair.
		frappe.db.set_value("CRM Inquiry", first["name"], {
			"owner": self.users["outsider"], "assigned_to": self.users["outsider"],
		}, update_modified=False)
		with self.assertRaises(frappe.PermissionError):
			self.capture(key, title="Changed payload should not disclose a receipt")
		with self.assertRaises(frappe.PermissionError):
			api.find_inquiry_for_request(key)

	def test_payload_allowlist_bounds_url_and_explicit_role(self):
		bad = [
			{"unknown": "value"}, {"title": "x" * 141}, {"source_text": "x" * 20001},
			{"source_url": "javascript:alert(1)"}, {"source_url": "https://user:secret@example.invalid"},
			{"source_url": "https://example.invalid:bad"}, {"source_type": "Unverified"},
			{"people": [{"display_name": "No role"}]},
			{"people": [{"display_name": "Alias", "role": "Requester", "lead": "forged"}]},
			{"people": [{"display_name": "Alias", "role": "Requester", "email": "bad address"}]},
			{"people": [{"display_name": "Alias", "role": "Requester"}] * 51},
		]
		for values in bad:
			with self.subTest(values=list(values)), self.assertRaises(frappe.ValidationError):
				self.capture(**values)
		first = self.capture(source_text="<script>never executed</script>\nPlain text", people=[])
		# Frappe sanitizes HTML on document insertion; ordinary context survives.
		self.assertIn("Plain text", first["source_text"])
		self.assertNotIn("<script>", first["source_text"])
		updated = api.update_inquiry(first["name"], str(first["modified"]), {"title": "Triaged"})
		self.assertEqual(first["source_text"], updated["source_text"])

	def test_database_unique_capture_key(self):
		first = self.capture()
		key = frappe.db.get_value("CRM Inquiry", first["name"], "capture_key")
		second = self.capture()
		point = "inquiry_unique_" + uuid4().hex
		frappe.db.savepoint(point)
		with self.assertRaises(Exception):
			frappe.db.set_value("CRM Inquiry", second["name"], "capture_key", key)
		frappe.db.rollback(save_point=point)
		self.assertNotEqual(key, frappe.db.get_value("CRM Inquiry", second["name"], "capture_key"))

	def test_duplicate_insert_replay_rolls_back_only_its_savepoint(self):
		key = uuid4().hex
		first = self.capture(key)
		unrelated = self.capture(title="Earlier transaction work")
		original = frappe.db.get_value
		initial_lookup = True

		def lookup(doctype, filters=None, *args, **kwargs):
			nonlocal initial_lookup
			if initial_lookup and doctype == "CRM Inquiry" and isinstance(filters, dict) and "capture_key" in filters:
				initial_lookup = False
				return None  # Exercise the real unique-index collision and savepoint recovery.
			return original(doctype, filters, *args, **kwargs)

		with patch.object(frappe.db, "get_value", side_effect=lookup):
			self.assertEqual(first["name"], self.capture(key)["name"])
		self.assertTrue(frappe.db.exists("CRM Inquiry", unrelated["name"]))

	def test_list_and_direct_access_enforce_owner_assignee_manager(self):
		first = self.capture()
		api.update_inquiry(first["name"], str(first["modified"]), {"assigned_to": self.users["assignee"]})
		for label in ("owner", "assignee", "manager"):
			frappe.set_user(self.users[label])
			self.assertEqual(first["name"], api.get_inquiry(first["name"])["name"])
			self.assertIn(first["name"], frappe.get_list("CRM Inquiry", pluck="name"))
		frappe.set_user(self.users["outsider"])
		self.assertNotIn(first["name"], frappe.get_list("CRM Inquiry", pluck="name"))
		self.assertNotIn(first["name"], [row["name"] for row in api.list_inquiries()["items"]])
		with self.assertRaises(frappe.PermissionError):
			api.get_inquiry(first["name"])
		with self.assertRaises(frappe.PermissionError):
			api.update_inquiry(first["name"], str(first["modified"]), {"title": "Forged"})
		with self.assertRaises(frappe.PermissionError):
			api.add_person(first["name"], str(first["modified"]), {"display_name": "Forged", "role": "Requester"})
		with self.assertRaises(frappe.PermissionError):
			api.convert_person(first["name"], first["people"][0]["person_key"])
		forged = frappe.get_doc("CRM Inquiry", first["name"])
		forged.owner = forged.assigned_to = frappe.session.user
		self.assertFalse(has_permission(forged, "write", frappe.session.user))
		with self.assertRaises(frappe.PermissionError):
			forged.save()

	def test_noncrm_guest_and_disabled_actor_are_denied(self):
		first = self.capture()
		for actor in ("Guest", self.users["noncrm"]):
			frappe.set_user(actor)
			for method in (lambda: self.capture(), api.list_inquiries, api.get_assignees,
				lambda: api.get_inquiry(first["name"])):
				with self.assertRaises(frappe.PermissionError):
					method()
		frappe.set_user("Administrator")
		frappe.db.set_value("User", self.users["owner"], "enabled", 0)
		frappe.set_user(self.users["owner"])
		with self.assertRaises(frappe.PermissionError):
			api.get_inquiry(first["name"])

	def test_generic_create_rejects_forged_owner_capture_and_child_keys(self):
		# Frappe stamps owner before the controller sees a new document. Verify
		# persisted ownership rather than requiring a rejection of normalized input.
		generic = frappe.get_doc({"doctype": "CRM Inquiry", "title": "Generic capture",
			"owner": self.users["outsider"]}).insert()
		self.assertEqual(frappe.session.user, frappe.db.get_value("CRM Inquiry", generic.name, "owner"))
		for values in ({"capture_key": "a" * 64},
			{"capture_payload_hash": "b" * 64},
			{"people": [{"display_name": "Forged", "role": "Requester", "person_key": "forged"}]},
			{"people": [{"display_name": "Forged", "role": "Requester", "lead": "forged"}]}):
			with self.subTest(values=list(values)), self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
				frappe.get_doc({"doctype": "CRM Inquiry", "title": "Generic capture", **values}).insert()

	def test_generic_save_rejects_provenance_child_key_and_flags_forgery(self):
		first = self.capture()
		for field, value in (("capture_key", "c" * 64), ("capture_payload_hash", "d" * 64),
			("source_url", "https://example.invalid/changed"), ("source_text", "Changed"),
			("source_type", "Other"), ("owner", self.users["assignee"])):
			doc = frappe.get_doc("CRM Inquiry", first["name"])
			doc.set(field, value)
			with self.subTest(field=field), self.assertRaises(frappe.ValidationError):
				doc.save()
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		doc.people[0].person_key = "forged"
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		lead = self.make_lead()
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		doc.people[0].lead = lead.name
		doc.flags.inquiry_conversion = ["token", doc.people[0].person_key, lead.name, None]
		doc.save()  # Frappe resets fields outside the caller's write permission level.
		self.assertFalse(frappe.get_doc("CRM Inquiry", first["name"]).people[0].lead)

	def test_generic_child_write_and_cross_parent_row_move_are_denied(self):
		first = self.capture()
		second = self.capture()
		original = frappe.get_doc("CRM Inquiry", first["name"])
		child = frappe.get_doc("CRM Inquiry Person", original.people[0].name)
		child.display_name = "Tampered"
		with self.assertRaises(frappe.PermissionError):
			child.save()
		other = frappe.get_doc("CRM Inquiry", second["name"])
		other.append("people", original.people[0].as_dict())
		with self.assertRaises(frappe.ValidationError):
			other.save()

	def test_generic_child_list_returns_only_authorized_parent_people(self):
		from frappe.client import get_list

		first_person = {
			"display_name": "Owned fictional prospect", "role": "Requester",
			"email": "owned-person@example.invalid", "phone": "555-0101",
		}
		second_person = {
			"display_name": "Other fictional prospect", "role": "Requester",
			"email": "other-person@example.invalid", "phone": "555-0102",
		}
		first = self.capture(people=[first_person])
		converted = api.convert_person(first["name"], first["people"][0]["person_key"])
		api.update_inquiry(first["name"], str(converted["inquiry"]["modified"]), {
			"assigned_to": self.users["assignee"],
		})
		frappe.set_user(self.users["outsider"])
		self.assertEqual([], get_list(doctype="CRM Inquiry Person", parent="CRM Inquiry",
			fields=["parent", "display_name", "email", "phone", "lead"]))
		second = self.capture(title="Another owner's inquiry", people=[second_person])
		people = {first["name"]: first_person, second["name"]: second_person}
		expected = {
			"outsider": {second["name"]}, "assignee": {first["name"]},
			"owner": {first["name"]}, "manager": {first["name"], second["name"]},
		}
		for label in ("outsider", "assignee", "owner", "manager"):
			frappe.set_user(self.users[label])
			with self.subTest(actor=label):
				rows = get_list(doctype="CRM Inquiry Person", parent="CRM Inquiry",
					fields=["parent", "display_name", "email", "phone", "lead"],
					filters={"parent": ["in", list(people)]})
				self.assertEqual(expected[label], {row["parent"] for row in rows})
				self.assertEqual(len(expected[label]), len(rows))
				for row in rows:
					for field in ("display_name", "email", "phone"):
						self.assertEqual(people[row["parent"]][field], row[field])
					self.assertFalse(row.get("lead"))  # Generic child field remains level 1.
				self.assertNotIn(converted["lead"], frappe.as_json(rows))
				for denied_parent in set(people) - expected[label]:
					self.assertNotIn(people[denied_parent]["email"], frappe.as_json(rows))
				for allowed_parent in expected[label]:
					self.assertEqual(people[allowed_parent]["display_name"],
						api.get_inquiry(allowed_parent)["people"][0]["display_name"])

	def test_assignees_exclude_noncrm_and_disabled_users(self):
		frappe.db.set_value("User", self.users["outsider"], "enabled", 0)
		rows = api.get_assignees()
		names = {row["name"] for row in rows}
		self.assertIn(self.users["assignee"], names)
		self.assertNotIn(self.users["noncrm"], names)
		self.assertNotIn(self.users["outsider"], names)
		self.assertTrue(all(set(row) == {"name", "full_name"} for row in rows))
		first = self.capture()
		for assignee in (self.users["noncrm"], self.users["outsider"], "Guest"):
			with self.assertRaises(frappe.ValidationError):
				api.update_inquiry(first["name"], str(first["modified"]), {"assigned_to": assignee})

	def test_assignment_notification_is_durable_content_free_and_not_replayed(self):
		request_id = uuid4().hex
		first = self.capture(request_id)
		filters = {"reference_doctype": "CRM Inquiry", "reference_name": first["name"]}
		self.assertEqual(0, frappe.db.count("CRM Notification", filters))
		assigned = api.update_inquiry(first["name"], str(first["modified"]), {
			"assigned_to": self.users["assignee"],
		})
		self.assertEqual(1, frappe.db.count("CRM Notification", filters))
		notification = frappe.get_doc("CRM Notification", frappe.db.get_value("CRM Notification", filters, "name"))
		self.assertEqual(self.users["assignee"], notification.to_user)
		self.assertEqual("Assignment", notification.type)
		self.assertEqual("CRM Inquiry", notification.notification_type_doctype)
		self.assertEqual(first["name"], notification.notification_type_doc)
		self.assertEqual("Se te asignó una consulta", notification.notification_text)
		self.assertFalse(notification.message)
		for source in (first["title"], first["source_url"], first["source_text"], first["people"][0]["display_name"]):
			self.assertNotIn(source, frappe.as_json(notification))
		api.update_inquiry(first["name"], str(assigned["modified"]), {"title": "Still assigned"})
		self.capture(request_id)
		self.assertEqual(1, frappe.db.count("CRM Notification", filters))
		self.assertTrue(any(call.args[0] == "crm_notification" and call.kwargs.get("after_commit")
			and call.kwargs.get("user") == self.users["assignee"] for call in self.realtime.call_args_list))
		self.mail.assert_not_called()

	def test_nonowner_assignee_can_handoff_with_only_minimal_success_response(self):
		first = self.capture()
		assigned = api.update_inquiry(first["name"], str(first["modified"]), {
			"assigned_to": self.users["assignee"],
		})
		frappe.set_user(self.users["assignee"])
		result = api.update_inquiry(first["name"], str(assigned["modified"]), {
			"assigned_to": self.users["outsider"],
		})
		self.assertEqual({"name": first["name"], "access_revoked": True}, result)
		self.assertEqual(self.users["outsider"], frappe.db.get_value("CRM Inquiry", first["name"], "assigned_to"))
		with self.assertRaises(frappe.PermissionError):
			api.get_inquiry(first["name"])
		frappe.set_user(self.users["outsider"])
		self.assertEqual(first["name"], api.get_inquiry(first["name"])["name"])

	def test_optimistic_api_and_generic_stale_save_are_rejected(self):
		first = self.capture()
		stale = frappe.get_doc("CRM Inquiry", first["name"])
		updated = api.update_inquiry(first["name"], str(first["modified"]), {"title": "Fresh"})
		with self.assertRaises(frappe.TimestampMismatchError):
			api.update_inquiry(first["name"], str(first["modified"]), {"title": "Stale"})
		with self.assertRaises(frappe.TimestampMismatchError):
			api.add_person(first["name"], str(first["modified"]), {"display_name": "Stale", "role": "Requester"})
		stale.title = "Stale generic"
		with self.assertRaises(frappe.TimestampMismatchError):
			stale.save()
		self.assertEqual(updated["title"], api.get_inquiry(first["name"])["title"])

	def test_selected_prospect_conversion_is_replay_safe_and_does_not_merge(self):
		first = self.prospect()
		with self.assertRaises(frappe.ValidationError):
			api.convert_person(first["name"], first["people"][0]["person_key"])
		before = frappe.db.count("CRM Lead")
		selected = first["people"][1]["person_key"]
		converted = api.convert_person(first["name"], selected)
		self.assertTrue(converted["created"])
		self.assertEqual(before + 1, frappe.db.count("CRM Lead"))
		replay = api.convert_person(first["name"], selected)
		self.assertEqual(converted["lead"], replay["lead"])
		self.assertFalse(replay["created"])
		self.assertEqual(before + 1, frappe.db.count("CRM Lead"))
		second = api.convert_person(first["name"], first["people"][2]["person_key"])
		self.assertNotEqual(converted["lead"], second["lead"])
		self.assertEqual(before + 2, frappe.db.count("CRM Lead"))
		self.assertIsNone(second["inquiry"]["people"][0]["lead"])
		self.assertEqual("https://example.invalid/public/post", second["inquiry"]["source_url"])
		self.mail.assert_not_called()

	def test_explicit_existing_link_requires_target_write(self):
		first = self.prospect()
		foreign = self.make_lead(self.users["outsider"])
		with self.assertRaises(frappe.PermissionError):
			api.convert_person(first["name"], first["people"][1]["person_key"], foreign.name)
		allowed = self.make_lead()
		before = frappe.db.count("CRM Lead")
		result = api.convert_person(first["name"], first["people"][1]["person_key"], allowed.name)
		self.assertEqual(allowed.name, result["lead"])
		self.assertFalse(result["created"])
		self.assertEqual(before, frappe.db.count("CRM Lead"))
		with self.assertRaises(frappe.ValidationError):
			api.convert_person(first["name"], first["people"][1]["person_key"], foreign.name)

	def test_converted_identity_receipt_and_removal_are_immutable(self):
		first = self.prospect()
		api.convert_person(first["name"], first["people"][1]["person_key"])
		other_lead = self.make_lead()
		for field, value in (("display_name", "Changed"), ("role", "Referrer"), ("phone", "999"),
			("converted_at", None)):
			doc = frappe.get_doc("CRM Inquiry", first["name"])
			doc.people[1].set(field, value)
			with self.subTest(field=field), self.assertRaises(frappe.ValidationError):
				doc.save()
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		original_lead = doc.people[1].lead
		doc.people[1].lead = other_lead.name
		doc.save()
		self.assertEqual(original_lead, frappe.get_doc("CRM Inquiry", first["name"]).people[1].lead)
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		doc.remove(doc.people[1])
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		# A JSON round trip preserves semantic datetime values on an ordinary save.
		doc = frappe.get_doc(json.loads(frappe.as_json(frappe.get_doc("CRM Inquiry", first["name"]))))
		doc.title = "Still editable"
		doc.save()
		with self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
			frappe.delete_doc("CRM Inquiry", first["name"])

	def test_denied_lead_is_redacted_and_replay_is_denied(self):
		first = self.prospect()
		converted = api.convert_person(first["name"], first["people"][1]["person_key"])
		latest = converted["inquiry"]
		api.update_inquiry(first["name"], str(latest["modified"]), {"assigned_to": self.users["assignee"]})
		frappe.set_user(self.users["assignee"])
		message_start = len(frappe.local.message_log)
		person = api.get_inquiry(first["name"])["people"][1]
		self.assertIsNone(person["lead"])
		self.assertFalse(person["lead_accessible"])
		self.assertTrue(person["converted_at"])
		self.assertNotIn(converted["lead"], frappe.as_json(frappe.local.message_log[message_start:]))
		with self.assertRaises(frappe.PermissionError):
			api.convert_person(first["name"], person["person_key"])
		self.assertNotIn(converted["lead"], frappe.as_json(frappe.local.message_log[message_start:]))

	def test_generic_responses_redact_lead_without_erasing_receipt(self):
		from frappe.client import get, get_list, save, set_value

		first = self.prospect()
		converted = api.convert_person(first["name"], first["people"][1]["person_key"])
		api.update_inquiry(first["name"], str(converted["inquiry"]["modified"]), {
			"assigned_to": self.users["assignee"],
		})
		frappe.set_user(self.users["assignee"])
		message_start = len(frappe.local.message_log)
		doc = frappe.get_doc("CRM Inquiry", first["name"])
		self.assertIsNone(doc.as_dict()["people"][1]["lead"])
		self.assertEqual(converted["lead"], doc.people[1].lead)
		public = get("CRM Inquiry", name=first["name"])
		self.assertNotIn(converted["lead"], frappe.as_json(public))
		# Generic read applies level 1 field redaction; roundtrip must restore the
		# server-owned receipt while changing only permitted fields.
		public["title"] = "Generic roundtrip"
		saved = save(frappe.as_json(public))
		self.assertNotIn(converted["lead"], frappe.as_json(saved))
		self.assertEqual(converted["lead"], frappe.get_doc("CRM Inquiry", first["name"]).people[1].lead)
		updated = set_value("CRM Inquiry", first["name"], "title", "Generic set value")
		self.assertNotIn(converted["lead"], frappe.as_json(updated))
		listed = get_list("CRM Inquiry", fields=["name", "people.lead"], filters={"name": first["name"]})
		self.assertNotIn(converted["lead"], frappe.as_json(listed))
		self.assertNotIn(converted["lead"], frappe.as_json(frappe.local.message_log[message_start:]))

	def test_error_boundary_preserves_prior_messages_and_hides_internal_errors(self):
		frappe.msgprint("Earlier unrelated notification")
		message_start = len(frappe.local.message_log)

		def internal_failure(*args, **kwargs):
			frappe.msgprint("Private internal failure detail")
			raise RuntimeError("Private internal failure detail")

		with patch.object(api, "_document", side_effect=internal_failure):
			with self.assertRaises(frappe.ValidationError) as captured:
				api.get_inquiry("fictional-inquiry")
		self.assertIn("Earlier unrelated notification", frappe.as_json(frappe.local.message_log[:message_start]))
		self.assertNotIn("Private internal failure detail", frappe.as_json(frappe.local.message_log[message_start:]))
		self.assertNotIn("Private internal failure detail", "".join(traceback.format_exception(captured.exception)))

	def test_conversion_failure_rolls_back_lead_but_preserves_earlier_work(self):
		first = self.prospect()
		before = frappe.db.count("CRM Lead")
		with patch("crm.fcrm.doctype.crm_inquiry.crm_inquiry.CRMInquiry.save", side_effect=frappe.ValidationError("Test failure")):
			with self.assertRaises(frappe.ValidationError):
				api.convert_person(first["name"], first["people"][1]["person_key"])
		self.assertEqual(before, frappe.db.count("CRM Lead"))
		self.assertTrue(frappe.db.exists("CRM Inquiry", first["name"]))
		self.assertIsNone(api.get_inquiry(first["name"])["people"][1]["lead"])

	def test_campaign_guard_is_scoped_to_lead_insert_and_restored_on_failure(self):
		from crm.fcrm.doctype.crm_lead.crm_lead import CRMLead

		first = self.prospect()
		original_after_insert = CRMLead.after_insert
		observed = []
		previous_guard = frappe.flags.get("crm_inquiry_capture")
		had_guard = "crm_inquiry_capture" in frappe.flags

		def after_insert(lead):
			observed.append(frappe.flags.get("crm_inquiry_capture"))
			return original_after_insert(lead)

		def failed_insert(lead):
			observed.append(frappe.flags.get("crm_inquiry_capture"))
			raise RuntimeError("Fictional insert failure")

		try:
			frappe.flags.crm_inquiry_capture = "earlier scope"
			with patch.object(CRMLead, "after_insert", new=after_insert):
				api.convert_person(first["name"], first["people"][1]["person_key"])
			self.assertEqual("earlier scope", frappe.flags.crm_inquiry_capture)
			frappe.flags.pop("crm_inquiry_capture")
			with patch.object(CRMLead, "insert", new=failed_insert):
				with self.assertRaises(frappe.ValidationError):
					api.convert_person(first["name"], first["people"][2]["person_key"])
			self.assertNotIn("crm_inquiry_capture", frappe.flags)
			self.assertEqual([True, True], observed)
		finally:
			if had_guard:
				frappe.flags.crm_inquiry_capture = previous_guard
			else:
				frappe.flags.pop("crm_inquiry_capture", None)

	def test_old_marketing_blocks_new_lead_but_allows_existing_link(self):
		first = self.prospect()
		lead = self.make_lead()
		before = frappe.db.count("CRM Lead")
		get_hooks = frappe.get_hooks

		def hooks(name=None, *args, **kwargs):
			return [] if name == "crm_inquiry_capture_guard" else get_hooks(name, *args, **kwargs)

		installed = list(dict.fromkeys([*frappe.get_installed_apps(), "doco_marketing"]))
		with patch("frappe.get_installed_apps", return_value=installed), \
			patch("frappe.get_hooks", side_effect=hooks):
			with self.assertRaises(frappe.ValidationError) as error:
				api.convert_person(first["name"], first["people"][1]["person_key"])
			self.assertIn("Upgrade", str(error.exception))
			self.assertEqual(before, frappe.db.count("CRM Lead"))
			self.assertIsNone(api.get_inquiry(first["name"])["people"][1]["lead"])
			linked = api.convert_person(first["name"], first["people"][1]["person_key"], lead.name)
			self.assertEqual(lead.name, linked["lead"])
			self.assertFalse(linked["created"])

	def test_closed_inquiry_reads_reopens_and_replays_conversion(self):
		first = self.prospect()
		converted = api.convert_person(first["name"], first["people"][1]["person_key"])
		closed = api.update_inquiry(first["name"], str(converted["inquiry"]["modified"]), {"status": "Closed"})
		self.assertEqual("Closed", api.get_inquiry(first["name"])["status"])
		self.assertEqual(converted["lead"], api.convert_person(first["name"], first["people"][1]["person_key"])["lead"])
		with self.assertRaises(frappe.ValidationError):
			api.convert_person(first["name"], first["people"][2]["person_key"])
		reopened = api.update_inquiry(first["name"], str(closed["modified"]), {"status": "In Progress"})
		self.assertEqual("In Progress", reopened["status"])

	def test_list_paginates_summaries_and_realtime_contains_no_content(self):
		self.capture()
		self.capture()
		result = api.list_inquiries(page_length=1)
		self.assertEqual(1, len(result["items"]))
		self.assertTrue(result["has_more"])
		self.assertNotIn("source_text", result["items"][0])
		self.assertNotIn("people", result["items"][0])
		self.assertNotIn("capture_key", result["items"][0])
		for call in self.realtime.call_args_list:
			if call.args and call.args[0] == "crm_inquiry_updated":
				self.assertEqual({}, call.args[1])
				self.assertTrue(call.kwargs["after_commit"])
				self.assertEqual(self.users["owner"], call.kwargs["user"])
