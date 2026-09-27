"""Two real connections with an intentionally stale MariaDB read view.

Run on the disposable native test site. This separate class commits only its
synthetic fixture and cleans it afterwards; no IntegrationTestCase outer lock.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest import TestCase
from uuid import uuid4

import frappe
from frappe.utils import add_days, nowdate

from crm.api import offers
from crm.offers import service


class TestOfferConcurrency(TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		pipeline = frappe.get_doc("CRM Pipeline", "legacy-sales")
		status = next(
			row.status
			for row in pipeline.stages
			if frappe.db.get_value("CRM Deal Status", row.status, "type") == "Open" and not row.archived
		)
		currency = frappe.db.get_single_value("FCRM Settings", "currency") or "USD"
		self.deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"pipeline": pipeline.name,
				"status": status,
				"deal_owner": "Administrator",
				"currency": currency,
				"expected_deal_value": 100,
				"expected_closure_date": add_days(nowdate(), 14),
			}
		).insert()
		self.values = {
			"title": "Concurrent " + uuid4().hex,
			"currency": currency,
			"valid_until": add_days(nowdate(), 14),
			"products": [{"product_name": "Service", "qty": 1, "rate": 100}],
		}
		frappe.db.commit()  # nosemgrep: isolated synthetic two-connection fixture

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		names = frappe.get_all("CRM Offer", filters={"deal": self.deal.name}, pluck="name")
		if names:
			frappe.db.delete("CRM Products", {"parenttype": "CRM Offer", "parent": ["in", names]})
			frappe.db.delete("Version", {"ref_doctype": "CRM Offer", "docname": ["in", names]})
			frappe.db.delete("CRM Offer", {"name": ["in", names]})
		frappe.delete_doc("CRM Deal", self.deal.name, force=True)
		frappe.db.commit()  # nosemgrep: remove only this test's committed fixture

	def race(self, writer_action, reader_action):
		"""Retain an aborted request, then model one explicit caller retry.

		MariaDB snapshot isolation can refuse a current locking read with 1020;
		Frappe exposes that as QueryDeadlockError. The HTTP boundary rolls back,
		and Offers retains the exact command for the user's Retry action. This
		does not install or imply an automatic retry in the API or a scheduler.
		"""
		site, sites_path = frappe.local.site, frappe.local.sites_path
		locked, snapshot = Event(), Event()
		snapshot_isolation = bool(frappe.db.sql("SELECT @@innodb_snapshot_isolation")[0][0])

		def run(writer, *, retry=False):
			frappe.init(site=site, sites_path=sites_path)
			frappe.connect()
			try:
				frappe.set_user("Administrator")
				frappe.flags.in_test = True
				if writer:
					service._deal(self.deal.name, write=True, lock=True)
					locked.set()
					if not snapshot.wait(15):
						raise AssertionError("Reader did not establish its old snapshot")
					result = writer_action()
				elif not retry:
					if not locked.wait(15):
						raise AssertionError("Writer did not acquire the deal fence")
					frappe.db.sql("SELECT COUNT(*) FROM `tabCRM Offer` WHERE deal=%s", self.deal.name)
					snapshot.set()
					result = reader_action()  # waits for writer, retaining the old RR view
				else:
					result = reader_action()  # a new request using the unchanged command
				frappe.db.commit()  # nosemgrep: emulate each isolated request's commit
				return result, {"outcome": "committed"}
			except frappe.QueryDeadlockError as error:
				# Never continue inside the aborted transaction. A second failure or
				# a writer deadlock is unexpected and remains a failing test.
				frappe.db.rollback()
				if writer or retry:
					raise
				native_args = getattr(error.args[0], "args", ()) if error.args else ()
				return None, {
					"outcome": "aborted",
					"error": type(error).__name__,
					"errno": native_args[0] if native_args else None,
				}
			except Exception:
				frappe.db.rollback()
				raise
			finally:
				frappe.destroy()

		with ThreadPoolExecutor(max_workers=2) as pool:
			writer, reader = pool.submit(run, True), pool.submit(run, False)
			first, writer_attempt = writer.result(timeout=45)
			second, reader_attempt = reader.result(timeout=45)
			attempts = [reader_attempt]
			self.assertEqual(writer_attempt, {"outcome": "committed"})
			self.assertEqual(
				reader_attempt,
				{"outcome": "aborted", "error": "QueryDeadlockError", "errno": 1020}
				if snapshot_isolation
				else {"outcome": "committed"},
			)
			if reader_attempt["outcome"] == "aborted":
				# Both original connections are closed and the writer is committed
				# before the caller issues a single fresh request.
				second, retry_attempt = pool.submit(run, False, retry=True).result(timeout=45)
				self.assertEqual(retry_attempt, {"outcome": "committed"})
				attempts.append(retry_attempt)
		frappe.db.rollback()
		# Keep the rejected attempt visible in native evidence; never print SQL,
		# document identifiers, payloads or arbitrary exception messages.
		print(f"Offer race reader request outcomes: {attempts}")
		return first, second

	def test_waiting_retry_sees_newly_committed_offer_instead_of_duplicate_insert(self):
		request = uuid4().hex

		def create():
			return offers.save_draft(self.deal.name, self.values, request_id=request)["name"]

		first, replay = self.race(create, create)
		self.assertEqual(first, replay)
		self.assertEqual(frappe.db.count("CRM Offer", {"deal": self.deal.name}), 1)

	def test_waiting_decision_cannot_accept_revision_superseded_after_its_snapshot(self):
		draft = offers.save_draft(self.deal.name, self.values, request_id=uuid4().hex)
		issued = offers.issue(draft["name"], str(draft["modified"]))
		frappe.db.commit()  # nosemgrep: publish the issued fixture to both requests

		def decide():
			try:
				offers.record_decision(
					issued["name"], "Accepted", "Email", "Old version decision", str(issued["modified"])
				)
			except frappe.ValidationError:
				return "blocked"
			return "incorrectly accepted"

		_, result = self.race(lambda: offers.revise(issued["name"], uuid4().hex)["name"], decide)
		self.assertEqual(result, "blocked")
		self.assertEqual(frappe.db.get_value("CRM Offer", issued["name"], "status"), "Issued")
		self.assertEqual(frappe.db.count("CRM Offer", {"deal": self.deal.name}), 2)
