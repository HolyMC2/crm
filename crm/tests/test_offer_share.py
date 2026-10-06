"""Customer links for issued offers: token capability, exposure contract and guest actions."""

import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate
from werkzeug.datastructures import Headers

from crm.api import offers
from crm.offers import service, share
from crm.tests.test_offers import OfferFixture


def token_of(state):
	return state["url"].rsplit("/", 1)[1]


class TestOfferShare(OfferFixture, IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.make_fixture()
		cache = frappe.cache()
		stale = cache.keys(share._key("*"))
		if stale:
			cache.delete(*stale)
		self.ip = "203.0.113.10"
		frappe.local.request_ip = self.ip

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.local.request_ip = None
		super().tearDown()

	def issued(self, **overrides):
		draft = self.draft(**overrides)
		return offers.issue(draft["name"], str(draft["modified"]))

	def shared(self, **overrides):
		issued = self.issued(**overrides)
		return issued, offers.share_link(issued["name"])

	def as_guest(self):
		frappe.set_user("Guest")

	# Token lifecycle --------------------------------------------------------

	def test_draft_cannot_be_shared_and_issued_link_is_stable_until_rotated(self):
		draft = self.draft()
		with self.assertRaises(frappe.ValidationError):
			offers.share_link(draft["name"])
		issued, state = self.shared()
		token = token_of(state)
		self.assertGreaterEqual(len(token), 40)
		self.assertEqual(offers.share_link(issued["name"])["url"], state["url"])
		stored = frappe.get_doc("CRM Offer Link", {"offer": issued["name"]})
		self.assertNotEqual(stored.token_hash, token)
		self.assertEqual(share.resolve(token).offer, issued["name"])
		rotated = offers.share_link(issued["name"], rotate=1)
		self.assertNotEqual(rotated["url"], state["url"])
		self.assertIsNone(share.resolve(token))
		self.assertEqual(share.resolve(token_of(rotated)).offer, issued["name"])

	def test_garbage_tokens_resolve_to_nothing_without_raising(self):
		for token in (None, "", "x", "a" * 500, "ñ" * 40, "../../etc/passwd" * 3, 12345):
			self.assertIsNone(share.resolve(token))
		self.as_guest()
		with self.assertRaises(frappe.DoesNotExistError):
			share.record_view("not-a-real-token-but-long-enough-0000")

	def test_offer_link_rows_cannot_be_written_outside_the_share_service(self):
		issued, _state = self.shared()
		link = frappe.get_doc("CRM Offer Link", {"offer": issued["name"]})
		link.view_count = 99
		with self.assertRaises(frappe.PermissionError):
			link.save(ignore_permissions=True)

	def test_restricted_user_cannot_share_another_deals_offer(self):
		issued, _state = self.shared()
		frappe.set_user(self.user)
		other = frappe.get_doc("CRM Deal", self.other.name)
		self.assertFalse(other.has_permission("read"))
		frappe.set_user("Administrator")
		draft = offers.save_draft(self.other.name, self.values, request_id=self.key + "o")
		other_issued = offers.issue(draft["name"], str(draft["modified"]))
		frappe.set_user(self.user)
		with self.assertRaises(frappe.PermissionError):
			offers.share_link(other_issued["name"])
		with self.assertRaises(frappe.PermissionError):
			offers.get_share_state(other_issued["name"])
		with self.assertRaises(frappe.PermissionError):
			offers.reply_to_customer(other_issued["name"], "hello")
		self.assertTrue(offers.get_share_state(issued["name"])["url"])

	# Exposure contract -------------------------------------------------------

	def test_public_view_keys_are_frozen_and_hold_no_internal_fields(self):
		issued, state = self.shared()
		view = share.public_view(share.resolve(token_of(state)))
		self.assertEqual(set(view), share.PUBLIC_KEYS)
		for row in view["products"]:
			self.assertEqual(set(row), share.PUBLIC_LINE_KEYS)
		dumped = json.dumps(view, default=str)
		for secret in (self.user, issued["name"], self.deal.name, "erp_", "request_key", token_of(state)):
			self.assertNotIn(secret, dumped)

	def test_page_renders_only_the_issued_snapshot(self):
		issued, state = self.shared()
		# A native Link rewrite must not change what the customer reads.
		frappe.db.set_value(
			"CRM Products", {"parent": issued["name"]}, "product_name", "Rewritten after issue"
		)
		view = share.public_view(share.resolve(token_of(state)))
		self.assertEqual(view["products"][0]["product_name"], "Installation")
		self.assertEqual(view["net_total"], issued["net_total"])

	def test_customer_page_escapes_seller_and_customer_text(self):
		# Frappe sanitizes stored HTML; this proves the page itself escapes, whatever reaches it.
		payload = "<script>alert(1)</script><img src=x onerror=alert(2)>"
		_issued, state = self.shared()
		token = token_of(state)
		real = share.public_view

		def hostile(link):
			view = real(link)
			view.update(title=payload, terms=payload, customer_name=payload, seller_company=payload)
			view["products"][0]["product_name"] = payload
			view["messages"] = [
				{"from_customer": True, "author": "", "message": payload, "at": "2026-10-05 10:00:00"}
			]
			return view

		frappe.local.form_dict = frappe._dict(token=token)
		with patch.object(share, "public_view", hostile):
			html = frappe.get_template("crm/www/crm_offer.html").render(self.page_context(token))
		self.assertNotIn("<script>alert(1)</script>", html)
		self.assertNotIn("<img src=x", html)
		self.assertIn("&lt;script&gt;alert(1)", html)
		self.as_guest()
		share.post_message(token, "a < b & <b>bold</b>")
		frappe.set_user("Administrator")
		comments = frappe.get_all(
			"Comment", filters={"reference_name": self.deal.name, "comment_type": "Info"}, pluck="content"
		)
		self.assertTrue(any("&lt;b&gt;bold" in c for c in comments))

	def page_context(self, token):
		from crm.www import crm_offer

		context = frappe._dict()
		# Outside a request, frappe.local has no response headers unless an earlier test made them.
		frappe.local.response_headers = getattr(frappe.local, "response_headers", None) or Headers()
		crm_offer.get_context(context)
		return context

	def test_page_404s_for_unknown_token(self):
		from crm.www import crm_offer

		frappe.local.form_dict = frappe._dict(token="unknown-token-unknown-token-unknown")
		with self.assertRaises(frappe.DoesNotExistError):
			crm_offer.get_context(frappe._dict())

	# Guest decisions ----------------------------------------------------------

	def test_customer_accepts_with_typed_name_once_and_seller_sees_it(self):
		issued, state = self.shared()
		token = token_of(state)
		self.as_guest()
		with self.assertRaises(frappe.ValidationError):
			share.decide(token, "Accepted", issued["terms_hash"], signer_name="  ")
		view = share.decide(
			token, "Accepted", issued["terms_hash"], signer_name="María López", note="Adelante"
		)
		self.assertEqual(view["decision"], "Accepted")
		self.assertFalse(view["can_decide"])
		again = share.decide(token, "Accepted", issued["terms_hash"], signer_name="María López")
		self.assertEqual(again["decided_at"], view["decided_at"])
		frappe.set_user("Administrator")
		offer = frappe.get_doc("CRM Offer", issued["name"])
		self.assertEqual(
			(offer.status, offer.decision_channel, offer.decision_by), ("Accepted", "Online", "Guest")
		)
		evidence = json.loads(offer.decision_evidence)
		self.assertEqual((evidence["name"], evidence["ip"]), ("María López", self.ip))
		self.assertEqual(evidence["terms_hash"], offer.terms_hash)
		self.assertEqual(
			frappe.db.count(
				"Comment",
				{"reference_name": self.deal.name, "content": ["like", "%María López%"]},
			),
			1,
		)
		self.assertTrue(
			frappe.db.exists("CRM Notification", {"to_user": self.user, "notification_type_doc": offer.name})
		)
		seller = offers.get_share_state(offer.name)
		self.assertEqual(seller["online_decision"]["name"], "María López")
		self.assertTrue(offers.get_offer(offer.name)["capabilities"]["can_revise"])

	def test_decision_is_bound_to_the_terms_the_customer_read(self):
		issued, state = self.shared()
		self.as_guest()
		with self.assertRaises(frappe.ValidationError):
			share.decide(token_of(state), "Accepted", "0" * 64, signer_name="María")
		self.assertEqual(frappe.db.get_value("CRM Offer", issued["name"], "status"), "Issued")

	def test_reject_and_staff_cannot_claim_online_channel(self):
		issued, state = self.shared()
		with self.assertRaises(frappe.ValidationError):
			offers.record_decision(issued["name"], "Accepted", "Online", "claimed", str(issued["modified"]))
		self.as_guest()
		view = share.decide(token_of(state), "Rejected", issued["terms_hash"], note="Too expensive")
		self.assertEqual(view["decision"], "Rejected")
		with self.assertRaises(frappe.ValidationError):
			share.decide(token_of(state), "Accepted", issued["terms_hash"], signer_name="Changed mind")

	def test_expired_offer_reads_with_banner_but_refuses_decisions(self):
		issued, state = self.shared(valid_until=nowdate())
		token = token_of(state)
		self.as_guest()
		with patch("crm.offers.service.nowdate", return_value=add_days(nowdate(), 1)):
			view = share.public_view(share.resolve(token))
			self.assertEqual(view["status"], "Expired")
			self.assertFalse(view["can_decide"])
			with self.assertRaises(frappe.ValidationError):
				share.decide(token, "Accepted", issued["terms_hash"], signer_name="Late")
			self.assertEqual(
				share.post_message(token, "Can I get a new one?")["messages"][-1]["from_customer"], True
			)

	def test_decided_revision_keeps_its_decision_after_a_new_revision(self):
		issued, state = self.shared()
		old_token = token_of(state)
		self.as_guest()
		share.decide(old_token, "Rejected", issued["terms_hash"], note="Change qty")
		frappe.set_user("Administrator")
		revision = offers.revise(issued["name"], self.key)
		view = share.public_view(share.resolve(old_token))
		self.assertEqual(view["newer_url"], "")
		new = offers.issue(revision["name"], str(revision["modified"]))
		new_state = offers.share_link(new["name"])
		# The rejected revision keeps its decision; an issued-but-superseded one links forward.
		self.assertEqual(share.public_view(share.resolve(old_token))["decision"], "Rejected")
		self.assertEqual(share.public_view(share.resolve(token_of(new_state)))["status"], "Issued")

	def test_superseded_issued_revision_shows_newer_link(self):
		issued, state = self.shared()
		revision = offers.revise(issued["name"], self.key)
		new = offers.issue(revision["name"], str(revision["modified"]))
		view = share.public_view(share.resolve(token_of(state)))
		self.assertEqual(view["status"], "Superseded")
		self.assertEqual(view["newer_url"], "")
		new_state = offers.share_link(new["name"])
		view = share.public_view(share.resolve(token_of(state)))
		self.assertEqual(view["newer_url"], new_state["url"])
		self.as_guest()
		with self.assertRaises(frappe.ValidationError):
			share.decide(token_of(state), "Accepted", issued["terms_hash"], signer_name="Old page")

	# Messages and views ---------------------------------------------------------

	def test_messages_round_trip_without_exposing_internal_deal_comments(self):
		issued, state = self.shared()
		token = token_of(state)
		frappe.get_doc(
			{
				"doctype": "Comment",
				"comment_type": "Comment",
				"reference_doctype": "CRM Deal",
				"reference_name": self.deal.name,
				"content": "Internal: margin is thin",
			}
		).insert()
		self.as_guest()
		with self.assertRaises(frappe.ValidationError):
			share.post_message(token, "x" * 2001)
		share.post_message(token, "¿Incluye instalación?")
		frappe.set_user("Administrator")
		reply = offers.reply_to_customer(issued["name"], "Sí, incluida.")
		self.assertEqual([m["from_customer"] for m in reply["messages"]], [True, False])
		view = share.public_view(share.resolve(token))
		self.assertEqual([m["message"] for m in view["messages"]], ["¿Incluye instalación?", "Sí, incluida."])
		self.assertNotIn("margin", json.dumps(view))

	def test_views_are_throttled_per_ip_and_skip_staff(self):
		issued, state = self.shared()
		token = token_of(state)
		self.assertFalse(share.record_view(token)["counted"])
		self.as_guest()
		self.assertTrue(share.record_view(token)["counted"])
		self.assertFalse(share.record_view(token)["counted"])
		frappe.local.request_ip = "198.51.100.7"
		self.assertTrue(share.record_view(token)["counted"])
		frappe.set_user("Administrator")
		self.assertEqual(offers.get_share_state(issued["name"])["view_count"], 2)
		self.assertEqual(
			frappe.db.count("Comment", {"reference_name": self.deal.name, "content": ["like", "%opened%"]})
			+ frappe.db.count("Comment", {"reference_name": self.deal.name, "content": ["like", "%abrió%"]}),
			1,
		)
		self.assertEqual(
			str(frappe.db.get_value("CRM Offer", issued["name"], "modified")), str(issued["modified"])
		)

	# Rate limits ------------------------------------------------------------------

	def test_writes_are_rate_limited_per_token(self):
		_issued, state = self.shared()
		token = token_of(state)
		self.as_guest()
		limit = share.LIMITS["write-token"][0]
		for _ in range(limit):
			share.post_message(token, "hola")
		with self.assertRaises(frappe.RateLimitExceededError):
			share.post_message(token, "hola")

	def test_rate_limit_fails_closed_when_cache_errors(self):
		_issued, state = self.shared()
		self.as_guest()

		class Broken:
			def incrby(self, *args, **kwargs):
				raise ConnectionError("redis down")

		with patch("crm.offers.share.frappe.cache", return_value=Broken()):
			with self.assertRaises(frappe.RateLimitExceededError):
				share.post_message(token_of(state), "hola")

	def test_works_without_erpnext(self):
		with patch.object(service, "get_installed_apps", return_value=["frappe", "crm"]):
			issued, state = self.shared()
			self.as_guest()
			view = share.decide(token_of(state), "Accepted", issued["terms_hash"], signer_name="Ana")
			self.assertEqual(view["decision"], "Accepted")
			frappe.set_user("Administrator")
			self.assertFalse(offers.get_offer(issued["name"])["capabilities"]["can_erp"])
