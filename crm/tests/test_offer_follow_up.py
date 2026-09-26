"""Native canonical tasks, immutable revision stops, actor scope and takeover."""

from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate

from crm.api import conversations, offers, webchat
from crm.offers import follow_up
from crm.tests import test_offer_concurrency as concurrency
from crm.tests.test_offers import OfferFixture


class TestOfferFollowUp(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.publish_realtime"))
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No provider calls"))
		)
		self.make_fixture()
		draft = self.draft()
		self.issued = offers.issue(draft["name"], str(draft["modified"]))
		self.pin = follow_up.snapshot(self.issued["name"])

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def run_followup(self, **changes):
		args = {key: self.pin[key] for key in ("revision", "terms_hash", "conversation", "generation")}
		return follow_up.reconcile(self.pin["offer"], **{**args, "due_hours": 24, **changes})

	def task(self, result):
		return frappe.get_doc("CRM Task", result["task"])

	def test_retry_and_new_run_keep_one_task_date_owner_and_native_next_activity(self):
		first, replay = self.run_followup(), self.run_followup()
		self.assertEqual(first["task"], replay["task"])
		self.assertEqual(first["due_date"], replay["due_date"])
		self.assertEqual(first["owner"], self.user)
		task = self.task(first)
		self.assertEqual(task.automation_occurrence, self.issued["name"])
		self.assertIn("/app/crm-offer/" + self.issued["name"], task.description)
		self.assertEqual(task.reference_docname, self.deal.name)
		self.assertEqual(frappe.db.count("CRM Task", {"automation_slot": task.automation_slot}), 1)
		self.deal.reload()
		self.assertEqual(str(self.deal.next_activity_task), first["task"])

	def test_decision_closes_only_unchanged_automated_task(self):
		first = self.run_followup()
		offers.record_decision(
			self.issued["name"], "Accepted", "Email", "Accepted exact revision", str(self.issued["modified"])
		)
		result = self.run_followup()
		self.assertFalse(result["active"])
		self.assertEqual(result["reason"], "accepted")
		self.assertEqual(self.task(first).status, "Canceled")
		self.assertEqual(self.run_followup()["reason"], "task_settled")

	def test_rejected_or_expired_before_first_effect_creates_nothing(self):
		offers.record_decision(
			self.issued["name"], "Rejected", "Phone", "Declined exact revision", str(self.issued["modified"])
		)
		self.assertEqual(self.run_followup()["reason"], "rejected")
		self.assertFalse(self.run_followup()["task"])
		draft = self.draft()
		issued = offers.issue(draft["name"], str(draft["modified"]))
		self.pin = follow_up.snapshot(issued["name"])
		with patch("crm.offers.service.nowdate", return_value=add_days(nowdate(), 20)):
			self.assertEqual(self.run_followup()["reason"], "expired")

	def test_new_revision_stops_old_obligation_and_new_run_pins_new_revision(self):
		old = self.run_followup()
		draft = offers.revise(self.issued["name"], uuid4().hex)
		self.assertEqual(self.run_followup()["reason"], "superseded")
		self.assertEqual(self.task(old).status, "Canceled")
		issued = offers.issue(draft["name"], str(draft["modified"]))
		self.pin = follow_up.snapshot(issued["name"])
		new = self.run_followup()
		self.assertNotEqual(old["task"], new["task"])
		self.assertEqual(self.task(new).automation_occurrence, issued["name"])

	def test_completed_canceled_and_in_progress_tasks_never_reopen(self):
		first = self.run_followup()
		for status in ("In Progress", "Done", "Canceled"):
			task = self.task(first)
			task.status = status
			task.save()
			result = self.run_followup()
			self.assertFalse(result["active"])
			self.assertEqual(self.task(first).status, status)
			self.assertEqual(result["task"], first["task"])

	def test_human_edit_survives_terminal_offer_and_new_revision(self):
		first = self.run_followup()
		task = self.task(first)
		task.description = "<p>Seller's own plan</p>"
		task.save()
		offers.record_decision(
			self.issued["name"], "Accepted", "Email", "Confirmed", str(self.issued["modified"])
		)
		self.assertEqual(self.run_followup()["reason"], "task_takeover")
		self.assertEqual(self.task(first).status, "Todo")
		draft = offers.revise(self.issued["name"], uuid4().hex)
		issued = offers.issue(draft["name"], str(draft["modified"]))
		self.pin = follow_up.snapshot(issued["name"])
		self.assertEqual(self.run_followup()["reason"], "task_takeover")
		self.assertEqual(self.task(first).description, "<p>Seller's own plan</p>")

	def test_missing_owner_requires_explicit_permitted_fallback(self):
		self.deal.deal_owner = None
		self.deal.save()
		with self.assertRaises(frappe.ValidationError):
			self.run_followup()
		result = self.run_followup(fallback_owner="Administrator")
		self.assertEqual(result["owner"], "Administrator")

	def test_wrong_company_and_executor_denial_cannot_create_task(self):
		with self.assertRaises(frappe.PermissionError):
			self.run_followup(company="Wrong scope")
		outsider = frappe.get_doc(
			{
				"doctype": "User",
				"email": f"no-offer-{self.key}@example.invalid",
				"first_name": "No role",
				"send_welcome_email": 0,
			}
		).insert()
		with self.assertRaises(frappe.PermissionError):
			self.run_followup(executor=outsider.name)
		self.assertFalse(frappe.db.exists("CRM Task", {"reference_docname": self.deal.name}))

	def test_bad_pin_and_bad_hours_refuse_effect(self):
		for changes in (
			{"revision": 999},
			{"terms_hash": "different"},
			{"due_hours": True},
			{"due_hours": 721},
		):
			with self.assertRaises(frappe.ValidationError):
				self.run_followup(**changes)

	def test_masked_offer_scope_blocks_instead_of_reading_hidden_value(self):
		setter = make_property_setter("CRM Offer", "terms_hash", "mask", 1, "Check")
		try:
			frappe.clear_cache(doctype="CRM Offer")
			with self.assertRaises(frappe.PermissionError):
				self.run_followup()
		finally:
			frappe.delete_doc("Property Setter", setter.name)
			frappe.clear_cache(doctype="CRM Offer")

	def test_closed_native_deal_stops_before_task(self):
		won = frappe.get_doc(
			{
				"doctype": "CRM Deal Status",
				"deal_status": "Follow-up Won " + self.key,
				"type": "Won",
				"probability": 100,
			}
		).insert()
		self.pipeline.append("stages", {"status": won.name, "probability": 100})
		self.pipeline.save()
		self.deal.status, self.deal.deal_value = won.name, 100
		self.deal.save()
		self.assertEqual(self.run_followup()["reason"], "deal_closed")
		self.assertFalse(frappe.db.exists("CRM Task", {"reference_docname": self.deal.name}))

	def test_native_savepoint_rollback_discards_task_before_exact_retry(self):
		frappe.db.savepoint("offer_task_effect")
		first = self.run_followup()
		frappe.db.rollback(save_point="offer_task_effect")
		self.assertFalse(frappe.db.exists("CRM Task", first["task"]))
		second = self.run_followup()
		self.assertEqual(self.run_followup()["task"], second["task"])

	def test_explicit_conversation_generation_takeover_stops_without_message(self):
		account = uuid4().hex
		origin = "https://follow-up.example.invalid"
		channel = webchat._mark(
			frappe.get_doc(
				{
					"doctype": webchat.CHANNEL,
					"name": account,
					"account_id": account,
					"binding_key": webchat._key(account, origin),
					"label": "Test follow-up",
					"profile": account,
					"public_origin": origin,
					"enabled": 1,
				}
			)
		).insert(ignore_permissions=True, set_name=account)
		thread = conversations.get_or_create(
			"Webchat", channel.name, uuid4().hex, reference_doctype="CRM Deal", reference_name=self.deal.name
		)
		self.pin = follow_up.snapshot(self.issued["name"], conversation=thread.name)
		conversations.apply_control(thread.name, "take", thread.generation, uuid4().hex)
		result = self.run_followup()
		self.assertEqual(result["reason"], "takeover")
		self.assertFalse(result["task"])

	def test_other_deal_conversation_is_never_inferred_or_allowed(self):
		# Reuse a permitted native Webchat channel, but an explicitly wrong deal.
		account, origin = uuid4().hex, "https://other-follow-up.example.invalid"
		webchat._mark(
			frappe.get_doc(
				{
					"doctype": webchat.CHANNEL,
					"name": account,
					"account_id": account,
					"binding_key": webchat._key(account, origin),
					"label": "Wrong deal",
					"profile": account,
					"public_origin": origin,
					"enabled": 1,
				}
			)
		).insert(ignore_permissions=True, set_name=account)
		thread = conversations.get_or_create(
			"Webchat", account, uuid4().hex, reference_doctype="CRM Deal", reference_name=self.other.name
		)
		with self.assertRaises(frappe.PermissionError):
			follow_up.snapshot(self.issued["name"], conversation=thread.name)


class TestOfferFollowUpConcurrency(TestCase):
	"""Two connections with stale read views; synthetic committed fixtures only."""

	race = concurrency.TestOfferConcurrency.race

	def setUp(self):
		self.enterContext(patch("frappe.sendmail"))
		self.enterContext(patch("frappe.enqueue"))
		self.enterContext(patch("frappe.publish_realtime"))
		concurrency.TestOfferConcurrency.setUp(self)
		draft = offers.save_draft(self.deal.name, self.values, request_id=uuid4().hex)
		self.issued = offers.issue(draft["name"], str(draft["modified"]))
		self.pin = follow_up.snapshot(self.issued["name"])
		frappe.db.commit()  # nosemgrep: publish only the synthetic test fixture

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		for name in frappe.get_all("CRM Task", filters={"reference_docname": self.deal.name}, pluck="name"):
			frappe.delete_doc("CRM Task", name, force=True)
		frappe.db.commit()  # nosemgrep: remove only this test's committed task fixtures
		concurrency.TestOfferConcurrency.tearDown(self)

	def create(self):
		return follow_up.reconcile(
			self.pin["offer"], revision=self.pin["revision"], terms_hash=self.pin["terms_hash"], due_hours=24
		)

	def test_competing_runs_reuse_one_committed_canonical_task(self):
		first, second = self.race(self.create, self.create)
		self.assertEqual(first["task"], second["task"])
		self.assertEqual(frappe.db.count("CRM Task", {"reference_docname": self.deal.name}), 1)

	def test_waiting_followup_observes_newly_committed_decision(self):
		def accept():
			return offers.record_decision(
				self.issued["name"],
				"Accepted",
				"Phone",
				"Confirmed current version",
				str(self.issued["modified"]),
			)

		_, result = self.race(accept, self.create)
		self.assertEqual(result["reason"], "accepted")
		self.assertFalse(result["task"])

	def test_waiting_followup_observes_newly_committed_revision(self):
		_, result = self.race(lambda: offers.revise(self.issued["name"], uuid4().hex), self.create)
		self.assertEqual(result["reason"], "superseded")
		self.assertFalse(result["task"])
