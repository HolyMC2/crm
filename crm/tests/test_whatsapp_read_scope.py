"""Native two-account privacy: controllers, real permissions, no authority mocks.

Only transport/enqueue are doubled. Callback drains exercise registered dispatch
without committing this rollback-isolated fixture; a real commit/probe is separate.
"""

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.permissions import has_permission
from frappe.tests import IntegrationTestCase
from frappe.utils import CallbackManager

from crm.api.notifications import get_notifications
from crm.api.whatsapp import get_whatsapp_messages, notify_agent, on_update
from crm.fcrm.doctype.crm_notification.crm_notification import notify_user, publish_notification
from crm.permissions import whatsapp_read as scope
from crm.tests.test_offers import OfferFixture


class WhatsAppReadFixture(OfferFixture):
	"""Reusable normal-controller fixture; no inherited test methods."""

	def setUp(self):
		super().setUp()
		self.previous_user = frappe.session.user
		frappe.set_user("Administrator")
		self.point = "whatsapp_read_" + uuid4().hex
		frappe.db.savepoint(self.point)
		self.callbacks = {
			name: getattr(frappe.db, name)
			for name in ("before_commit", "after_commit", "before_rollback", "after_rollback")
		}
		self.had_realtime = hasattr(frappe.local, "_realtime_log")
		self.realtime_log = getattr(frappe.local, "_realtime_log", None)
		for name in self.callbacks:
			setattr(frappe.db, name, CallbackManager())
		if self.had_realtime:
			del frappe.local._realtime_log
		self.addCleanup(self.restore_fixture)
		self.enterContext(
			patch("requests.sessions.Session.request", side_effect=AssertionError("No provider HTTP"))
		)
		self.enterContext(patch("frappe.sendmail"))
		self.enqueue = self.enterContext(patch("frappe.enqueue"))
		self.realtime = self.enterContext(patch("frappe.publish_realtime"))
		self.make_fixture()
		self.actor_a = self.user
		self.actor_b = self.make_user("b")
		self.outsider = self.make_user("outsider")
		frappe.db.set_single_value("FCRM Settings", "enable_sales_hierarchy", 0)
		if not frappe.db.has_column("WhatsApp Account", "doco_shop"):
			raise RuntimeError(
				"Two-account native scope fixture requires the normal Marketing account schema"
			)
		self.shops, self.accounts, self.grants = {}, {}, {}
		for label, actor in (("a", self.actor_a), ("b", self.actor_b)):
			self.shops[label] = frappe.get_doc(
				{"doctype": "Social Shop", "shop_name": f"Scope {self.key} {label}", "enabled": 1}
			).insert()
			self.grants[label] = frappe.get_doc(
				{
					"doctype": "User Permission",
					"user": actor,
					"allow": "Social Shop",
					"for_value": self.shops[label].name,
				}
			).insert()
			self.accounts[label] = frappe.get_doc(
				{
					"doctype": "WhatsApp Account",
					"account_name": f"Scope {self.key} {label}",
					"phone_id": "98" + str(int(uuid4().hex[:12], 16)),
					"mode": "Demo",
					"status": "Active",
					"doco_shop": self.shops[label].name,
					"is_default_incoming": 0,
					"is_default_outgoing": 0,
				}
			).insert()
		frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": "Native two-account assignment",
				"allocated_to": self.actor_b,
				"reference_type": "CRM Deal",
				"reference_name": self.deal.name,
			}
		).insert()
		self.peer = "521" + str(int(uuid4().hex[:10], 16))
		self.message_a = self.make_message("a", "VISIBLE-A-" + self.key)
		self.message_b = self.make_message("b", "SECRET-B-" + self.key)
		self.assertTrue(
			has_permission("CRM Deal", "read", doc=self.deal.name, user=self.actor_a, print_logs=False)
		)
		self.assertTrue(
			has_permission("CRM Deal", "read", doc=self.deal.name, user=self.actor_b, print_logs=False)
		)
		self.assertTrue(scope.can_read_message(self.message_a.name, self.actor_a))
		self.assertTrue(scope.can_read_message(self.message_b.name, self.actor_b))
		self.assertFalse(scope.can_read_message(self.message_b.name, self.actor_a))
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_b))
		self.realtime.reset_mock()

	def make_user(self, label):
		return (
			frappe.get_doc(
				{
					"doctype": "User",
					"email": f"wa-{label}-{self.key}@example.invalid",
					"first_name": "Fictional " + label,
					"enabled": 1,
					"send_welcome_email": 0,
					"roles": [{"role": "Sales User"}],
				}
			)
			.insert()
			.name
		)

	def make_message(self, account, body, *, doctype="CRM Deal", name=None, peer=None):
		frappe.set_user("Administrator")
		return frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Incoming",
				"from": peer or self.peer,
				"to": "5215550000099",
				"whatsapp_account": self.accounts[account].name,
				"message_type": "Manual",
				"content_type": "text",
				"message": body,
				"message_id": "wamid.fictional." + uuid4().hex,
				"reference_doctype": doctype,
				"reference_name": (name or self.deal.name) if doctype else None,
			}
		).insert()

	def revoke_account(self, label="a"):
		frappe.set_user("Administrator")
		frappe.delete_doc("User Permission", self.grants[label].name)
		frappe.clear_cache(user=self.actor_a if label == "a" else self.actor_b)

	def restrict_pipeline(self):
		frappe.set_user("Administrator")
		doc = frappe.get_doc("CRM Pipeline", self.pipeline.name)
		doc.roles = [{"role": "System Manager"}]
		doc.save()

	def notice(self, message=None, actor=None):
		return frappe.db.get_value(
			"CRM Notification",
			{"notification_type_doc": (message or self.message_a).name, "to_user": actor or self.actor_a},
			"name",
		)

	def restore_fixture(self):
		frappe.set_user("Administrator")
		try:
			try:
				frappe.db.before_rollback.run()
			finally:
				frappe.db.rollback(save_point=self.point)
		finally:
			try:
				frappe.db.after_rollback.run()
				for actor in (
					getattr(self, "actor_a", None),
					getattr(self, "actor_b", None),
					getattr(self, "outsider", None),
				):
					if actor:
						frappe.clear_cache(user=actor)
				for doctype in (
					"FCRM Settings",
					"CRM Deal",
					"CRM Lead",
					"CRM Contacts",
					"Contact",
					"WhatsApp Message",
				):
					frappe.clear_cache(doctype=doctype)
			finally:
				for name, callbacks in self.callbacks.items():
					setattr(frappe.db, name, callbacks)
				if hasattr(frappe.local, "_realtime_log"):
					del frappe.local._realtime_log
				if self.had_realtime:
					frappe.local._realtime_log = self.realtime_log
				frappe.set_user(self.previous_user)


class TestWhatsAppReadScope(WhatsAppReadFixture, IntegrationTestCase):
	def test_thread_projects_only_actor_account_on_same_parent(self):
		for actor, visible, hidden in (
			(self.actor_a, self.message_a, self.message_b),
			(self.actor_b, self.message_b, self.message_a),
		):
			frappe.set_user(actor)
			rows = get_whatsapp_messages("CRM Deal", self.deal.name)
			self.assertIn(visible.name, [row.name for row in rows])
			serialized = frappe.as_json(rows)
			self.assertNotIn(hidden.name, serialized)
			self.assertNotIn(hidden.message, serialized)

	def test_generic_message_list_and_doc_keep_authorized_positive(self):
		frappe.set_user(self.actor_a)
		rows = frappe.get_list(
			"WhatsApp Message",
			filters={"name": ["in", [self.message_a.name, self.message_b.name]]},
			fields=["name", "message"],
		)
		self.assertEqual([row.name for row in rows], [self.message_a.name])
		frappe.get_doc("WhatsApp Message", self.message_a.name).check_permission("read")
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc("WhatsApp Message", self.message_b.name).check_permission("read")

	def test_sender_administrator_does_not_lend_account_authority(self):
		frappe.set_user("Administrator")
		self.assertTrue(scope.can_read_message(self.message_b.name, self.actor_b))
		self.assertFalse(scope.can_read_message(self.message_b.name, self.actor_a))
		self.assertFalse(scope.can_read_message(self.message_a.name, self.outsider))
		self.assertEqual(frappe.session.user, "Administrator")

	def test_exact_targeted_events_preserve_legacy_payload_without_body(self):
		scope.publish_message(self.message_a.name)
		calls = [call for call in self.realtime.call_args_list if call.args[0] == "whatsapp_message"]
		users = [call.kwargs["user"] for call in calls]
		self.assertIn(self.actor_a, users)
		self.assertIn("Administrator", users)
		self.assertNotIn(self.actor_b, users)
		self.assertNotIn(self.outsider, users)
		self.assertEqual(len(users), len(set(users)))
		for call in calls:
			self.assertEqual(call.kwargs["room"], "user:" + call.kwargs["user"])
			self.assertEqual(
				call.args[1],
				{"reference_doctype": "CRM Deal", "reference_name": self.deal.name, "phone": self.peer},
			)
			self.assertNotIn(self.message_a.message, frappe.as_json(call.args[1]))

	def test_notification_created_only_for_current_recipient_without_body_copy(self):
		self.assertTrue(self.notice())
		self.assertFalse(self.notice(actor=self.actor_b))
		doc = frappe.get_doc("CRM Notification", self.notice())
		self.assertFalse(doc.message)
		self.assertNotIn(self.message_a.message, frappe.as_json(doc.as_dict()))
		frappe.set_user(self.actor_a)
		self.assertIn(doc.name, [row["name"] for row in get_notifications()])
		doc.check_permission("read")

	def test_notification_replay_does_not_duplicate_after_canonical_text(self):
		before = frappe.db.count("CRM Notification", {"notification_type_doc": self.message_a.name})
		notify_agent(self.message_a)
		self.assertEqual(
			frappe.db.count("CRM Notification", {"notification_type_doc": self.message_a.name}), before
		)

	def test_account_revocation_hides_existing_bell_generic_and_thread(self):
		name = self.notice()
		self.revoke_account()
		frappe.set_user(self.actor_a)
		self.assertEqual(get_whatsapp_messages("CRM Deal", self.deal.name), [])
		self.assertNotIn(name, [row["name"] for row in get_notifications()])
		self.assertEqual(frappe.get_list("CRM Notification", filters={"name": name}), [])
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc("CRM Notification", name).check_permission("read")
		self.assertEqual(frappe.get_list("WhatsApp Message", filters={"name": self.message_a.name}), [])

	def test_parent_revocation_rechecks_both_events_and_notifications(self):
		name = self.notice()
		self.restrict_pipeline()
		self.assertFalse(
			has_permission("CRM Deal", "read", doc=self.deal.name, user=self.actor_a, print_logs=False)
		)
		scope.publish_message(self.message_a.name)
		publish_notification(name)
		self.assertFalse(
			any(call.kwargs.get("user") == self.actor_a for call in self.realtime.call_args_list)
		)
		frappe.set_user(self.actor_a)
		self.assertNotIn(name, [row["name"] for row in get_notifications()])
		with self.assertRaises(frappe.PermissionError):
			get_whatsapp_messages("CRM Deal", self.deal.name)

	def test_dispatch_callback_rechecks_revocation_after_registration(self):
		frappe.db.after_commit = CallbackManager()
		on_update(self.message_a, "on_update")
		self.assertFalse(self.realtime.called)
		self.revoke_account()
		# Explicit callback drain, not evidence of a DB commit or delivered socket.
		frappe.db.after_commit.run()
		self.assertFalse(
			any(call.kwargs.get("user") == self.actor_a for call in self.realtime.call_args_list)
		)

	def test_disabled_recipient_receives_no_event_or_notification(self):
		user = frappe.get_doc("User", self.actor_a)
		user.enabled = 0
		user.save()
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
		scope.publish_message(self.message_a.name)
		publish_notification(self.notice())
		self.assertFalse(
			any(call.kwargs.get("user") == self.actor_a for call in self.realtime.call_args_list)
		)

	def test_inactive_account_remains_readable_without_send_authority(self):
		account = self.accounts["a"]
		account.status = "Inactive"
		account.save()
		self.assertTrue(scope.can_read_message(self.message_a.name, self.actor_a))
		frappe.set_user(self.actor_a)
		self.assertIn(
			self.message_a.name, [row.name for row in get_whatsapp_messages("CRM Deal", self.deal.name)]
		)

	def test_missing_account_binding_has_no_default_fallback(self):
		# Simulates an existing legacy row, not an identity-bearing fixture insert.
		self.message_a.db_set("whatsapp_account", None, update_modified=False)
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
		frappe.set_user(self.actor_a)
		self.assertEqual(frappe.get_list("WhatsApp Message", filters={"name": self.message_a.name}), [])

	def test_named_and_everyone_shares_cannot_resurrect_foreign_account(self):
		from frappe.share import add_docshare

		for everyone in (0, 1):
			with self.subTest(everyone=everyone):
				frappe.set_user("Administrator")
				add_docshare(
					"WhatsApp Message",
					self.message_b.name,
					user=self.actor_a if not everyone else None,
					everyone=everyone,
					read=1,
				)
				frappe.set_user(self.actor_a)
				self.assertFalse(
					has_permission("WhatsApp Message", "read", doc=self.message_b.name, print_logs=False)
				)
				self.assertEqual(
					frappe.get_list("WhatsApp Message", filters={"name": self.message_b.name}), []
				)
				with self.assertRaises(frappe.PermissionError):
					frappe.get_doc("WhatsApp Message", self.message_b.name).check_permission("read")

	def test_notification_share_cannot_restore_revoked_parent(self):
		from frappe.share import add_docshare

		name = self.notice()
		add_docshare("CRM Notification", name, user=self.actor_a, read=1)
		self.restrict_pipeline()
		frappe.set_user(self.actor_a)
		self.assertFalse(has_permission("CRM Notification", "read", doc=name, print_logs=False))
		self.assertEqual(frappe.get_list("CRM Notification", filters={"name": name}), [])

	def test_private_peer_is_denied_by_native_doc_and_sql_same_as_broker(self):
		frappe.get_doc(
			{
				"doctype": "Asistente Canal",
				"channel": "WhatsApp",
				"external_id": self.peer,
				"enabled": 0,
				"user": self.actor_a,
				"role": "Staff",
			}
		).insert()
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
		frappe.set_user(self.actor_a)
		self.assertEqual(get_whatsapp_messages("CRM Deal", self.deal.name), [])
		self.assertEqual(frappe.get_list("WhatsApp Message", filters={"name": self.message_a.name}), [])
		self.assertFalse(
			has_permission("WhatsApp Message", "read", doc=self.message_a.name, print_logs=False)
		)

	def test_non_whatsapp_notification_behavior_is_preserved(self):
		notify_user(
			{
				"owner": "Administrator",
				"assigned_to": self.actor_a,
				"notification_type": "Assignment",
				"message": "Fictional assignment",
				"notification_text": "Assigned",
				"reference_doctype": "CRM Deal",
				"reference_docname": self.deal.name,
				"redirect_to_doctype": "CRM Deal",
				"redirect_to_docname": self.deal.name,
			}
		)
		self.revoke_account()
		frappe.set_user(self.actor_a)
		rows = get_notifications()
		self.assertTrue(
			any(row["type"] == "Assignment" and row["reference_name"] == self.deal.name for row in rows)
		)

	def test_account_reconfiguration_does_not_lend_previous_shop(self):
		account = self.accounts["a"]
		account.doco_shop = self.shops["b"].name
		account.save()
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
		self.assertTrue(scope.can_read_message(self.message_a.name, self.actor_b))

	def test_batches_keep_all_eligible_rows_without_a_global_cap(self):
		frappe.set_user(self.actor_a)
		# Batch-size reduction is a pagination-control double, never authorization.
		with patch.object(scope, "BATCH_SIZE", 1):
			self.assertEqual(
				[
					row.name
					for row in scope.rows(
						"WhatsApp Message",
						[["name", "in", [self.message_a.name, self.message_b.name]]],
						["name"],
					)
				],
				sorted([self.message_a.name, self.message_b.name]),
			)
			self.assertIn(
				self.message_a.name, [row.name for row in get_whatsapp_messages("CRM Deal", self.deal.name)]
			)

	def test_infrastructure_failure_is_not_treated_as_permission_denial(self):
		# Fault injection only: authority is not doubled in the other native cases.
		with patch("crm.api.conversations._authorize", side_effect=RuntimeError("fictional outage")):
			with self.assertRaises(RuntimeError):
				scope.can_read_message(self.message_a.name, self.actor_a)

	def test_helper_is_not_a_whitelisted_identifier_oracle(self):
		self.assertNotIn(scope.can_read_message, frappe.whitelisted)
		self.assertNotIn(scope.message_query, frappe.whitelisted)

	def test_native_count_uses_same_account_scope_as_document_read(self):
		frappe.set_user(self.actor_a)
		rows = frappe.get_list(
			"WhatsApp Message",
			filters={"name": ["in", [self.message_a.name, self.message_b.name]]},
			fields=["count(name) as amount"],
		)
		self.assertEqual(rows[0].amount, 1)

	def test_generic_client_get_cannot_bypass_account_boundary(self):
		from frappe.client import get

		frappe.set_user(self.actor_a)
		self.assertEqual(get("WhatsApp Message", self.message_a.name)["name"], self.message_a.name)
		with self.assertRaises(frappe.PermissionError):
			get("WhatsApp Message", self.message_b.name)

	def test_strict_peer_grammar_matches_native_sql_for_legacy_malformed_rows(self):
		for malformed in (self.peer + "\n", "１２３", "١٢٣", "+" + self.peer, "123 456"):
			with self.subTest(grammar="invalid"):
				frappe.set_user("Administrator")
				# Existing malformed legacy evidence must remain invisible, not be normalized.
				self.message_a.db_set("from", malformed, update_modified=False)
				self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
				frappe.set_user(self.actor_a)
				self.assertEqual(
					frappe.get_list("WhatsApp Message", filters={"name": self.message_a.name}), []
				)
				self.assertFalse(
					has_permission("WhatsApp Message", "read", doc=self.message_a.name, print_logs=False)
				)

	def test_historical_private_peer_and_address_alias_sql_parity(self):
		frappe.get_doc(
			{"doctype": "Books Chat Log", "chat_id": "wa:" + self.peer, "kind": "fictional privacy evidence"}
		).insert()
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
		frappe.set_user(self.actor_a)
		self.assertEqual(frappe.get_list("WhatsApp Message", filters={"name": self.message_a.name}), [])
		other = self.make_message("a", "Still public", peer=self.peer + "1")
		self.assertTrue(scope.can_read_message(other.name, self.actor_a))
		frappe.set_user(self.actor_a)
		self.assertEqual(
			[row.name for row in frappe.get_list("WhatsApp Message", filters={"name": other.name})],
			[other.name],
		)

	def make_linked_lead(self, *, denied=False):
		frappe.set_user("Administrator")
		lead = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Linked" + self.key,
				"lead_owner": "Administrator" if denied else self.actor_a,
			}
		).insert()
		self.deal.reload()
		self.deal.lead = lead.name
		self.deal.save()
		return lead

	def test_linked_lead_messages_need_both_current_parent_scopes(self):
		lead = self.make_linked_lead()
		message = self.make_message("a", "LEAD-VISIBLE-" + self.key, doctype="CRM Lead", name=lead.name)
		frappe.set_user(self.actor_a)
		self.assertIn(message.name, [row.name for row in get_whatsapp_messages("CRM Deal", self.deal.name)])

	def test_denied_linked_lead_does_not_lend_history_to_readable_deal(self):
		lead = self.make_linked_lead(denied=True)
		message = self.make_message("a", "LEAD-SECRET-" + self.key, doctype="CRM Lead", name=lead.name)
		self.assertFalse(
			has_permission("CRM Lead", "read", doc=lead.name, user=self.actor_a, print_logs=False)
		)
		frappe.set_user(self.actor_a)
		rows = get_whatsapp_messages("CRM Deal", self.deal.name)
		self.assertNotIn(message.name, frappe.as_json(rows))
		self.assertNotIn(message.message, frappe.as_json(rows))
		self.assertIn(self.message_a.name, [row.name for row in rows])

	def test_masked_parent_lead_link_does_not_expand_history(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		lead = self.make_linked_lead()
		message = self.make_message("a", "MASKED-LEAD-SECRET-" + self.key, doctype="CRM Lead", name=lead.name)
		make_property_setter("CRM Deal", "lead", "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Deal")
		frappe.set_user(self.actor_a)
		self.assertFalse(scope.readable_field("CRM Deal", "lead"))
		rows = get_whatsapp_messages("CRM Deal", self.deal.name)
		self.assertNotIn(message.name, frappe.as_json(rows))
		self.assertNotIn(message.message, frappe.as_json(rows))

	def test_parent_name_mask_preserves_safe_admitted_peer_fallback(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		from crm.api.whatsapp import get_from_name

		lead = self.make_linked_lead()
		message = self.make_message("a", "Visible text", doctype="CRM Lead", name=lead.name)
		for field in ("first_name", "last_name"):
			make_property_setter("CRM Lead", field, "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Lead")
		frappe.set_user(self.actor_a)
		self.assertEqual(get_from_name(message), self.peer)
		self.assertNotIn(lead.first_name, frappe.as_json(get_whatsapp_messages("CRM Lead", lead.name)))

	def test_notification_generic_client_get_rechecks_revocation(self):
		from frappe.client import get

		name = self.notice()
		frappe.set_user(self.actor_a)
		self.assertEqual(get("CRM Notification", name)["name"], name)
		self.revoke_account()
		frappe.set_user(self.actor_a)
		with self.assertRaises(frappe.PermissionError):
			get("CRM Notification", name)

	def test_notification_callback_retains_user_room_inside_task_context(self):
		previous = getattr(frappe.local, "task_id", None)
		frappe.local.task_id = "fictional-task"
		try:
			publish_notification(self.notice())
		finally:
			frappe.local.task_id = previous
		call = self.realtime.call_args
		self.assertEqual(call.args, ("crm_notification",))
		self.assertEqual(call.kwargs, {"user": self.actor_a, "room": "user:" + self.actor_a})

	def test_masked_peer_field_is_not_disclosed_by_realtime(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		make_property_setter("WhatsApp Message", "from", "mask", 1, "Check")
		frappe.clear_cache(doctype="WhatsApp Message")
		self.assertFalse(scope.readable_field("WhatsApp Message", "from", self.actor_a))
		self.assertTrue(scope.readable_field("WhatsApp Message", "from", "Administrator"))
		scope.publish_message(self.message_a.name)
		self.assertFalse(
			any(call.kwargs.get("user") == self.actor_a for call in self.realtime.call_args_list)
		)

	def test_masked_body_is_not_returned_by_thread_projection(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		make_property_setter("WhatsApp Message", "message", "mask", 1, "Check")
		frappe.clear_cache(doctype="WhatsApp Message")
		frappe.set_user(self.actor_a)
		self.assertFalse(scope.readable_field("WhatsApp Message", "message"))
		rows = get_whatsapp_messages("CRM Deal", self.deal.name)
		self.assertIn(self.message_a.name, [row.name for row in rows])
		self.assertNotIn(self.message_a.message, frappe.as_json(rows))

	def test_higher_level_body_is_not_returned_by_thread_projection(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		make_property_setter("WhatsApp Message", "message", "permlevel", 1, "Int")
		frappe.clear_cache(doctype="WhatsApp Message")
		frappe.set_user(self.actor_a)
		self.assertFalse(scope.readable_field("WhatsApp Message", "message"))
		rows = get_whatsapp_messages("CRM Deal", self.deal.name)
		self.assertIn(self.message_a.name, [row.name for row in rows])
		self.assertNotIn(self.message_a.message, frappe.as_json(rows))

	def test_masked_parent_contact_table_cannot_reconstruct_sender_label(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		from crm.api.whatsapp import get_from_name

		contact = frappe.get_doc({"doctype": "Contact", "first_name": "PRIVATE-SENDER-" + self.key}).insert()
		self.deal.reload()
		self.deal.append("contacts", {"contact": contact.name, "is_primary": 1})
		self.deal.save()
		frappe.set_user(self.actor_a)
		self.assertEqual(get_from_name(self.message_a), contact.full_name)
		frappe.set_user("Administrator")
		make_property_setter("CRM Deal", "contacts", "mask", 1, "Check")
		make_property_setter("CRM Deal", "lead_name", "mask", 1, "Check")
		frappe.clear_cache(doctype="CRM Deal")
		frappe.set_user(self.actor_a)
		self.assertEqual(get_from_name(self.message_a), self.peer)
		self.assertNotIn(contact.full_name, frappe.as_json(get_whatsapp_messages("CRM Deal", self.deal.name)))

	def test_private_address_alias_has_same_native_sql_denial(self):
		frappe.get_doc(
			{
				"doctype": "Asistente Canal",
				"channel": "WhatsApp",
				"external_id": self.peer + "1",
				"address": "wa:" + self.peer,
				"enabled": 0,
				"user": self.actor_a,
				"role": "Staff",
			}
		).insert()
		self.assertFalse(scope.can_read_message(self.message_a.name, self.actor_a))
		frappe.set_user(self.actor_a)
		self.assertEqual(frappe.get_list("WhatsApp Message", filters={"name": self.message_a.name}), [])

	def test_legacy_notification_body_copy_cannot_bypass_current_source_field_mask(self):
		from frappe.client import get
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		name = self.notice()
		# Preserve an old-format fixture row; production never rewrites historical copies.
		frappe.db.set_value("CRM Notification", name, "message", self.message_a.message)
		frappe.set_user(self.actor_a)
		self.assertEqual(get("CRM Notification", name)["message"], self.message_a.message)
		frappe.set_user("Administrator")
		make_property_setter("WhatsApp Message", "message", "mask", 1, "Check")
		frappe.clear_cache(doctype="WhatsApp Message")
		frappe.set_user(self.actor_a)
		self.assertNotIn(name, [row["name"] for row in get_notifications()])
		self.assertEqual(frappe.get_list("CRM Notification", filters={"name": name}), [])
		with self.assertRaises(frappe.PermissionError):
			get("CRM Notification", name)

	def attach_sender_contact(self):
		frappe.set_user("Administrator")
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "LINKED-SECRET-" + self.key,
				"phone_nos": [{"phone": "+12025550199", "is_primary_mobile_no": 1}],
			}
		).insert()
		contact.reload()
		self.deal.reload()
		self.deal.append(
			"contacts",
			{
				"contact": contact.name,
				"full_name": contact.full_name,
				"mobile_no": contact.mobile_no,
				"is_primary": 1,
			},
		)
		self.deal.save()
		self.assertTrue(self.deal.contacts[0].full_name)
		self.assertFalse(
			self.deal.lead_name,
			"Fixture must not confuse independently readable parent copies with derived Contact labels",
		)
		return contact

	def test_denied_linked_contact_cannot_leak_through_whatsapp_sender_label(self):
		from crm.api.whatsapp import get_from_name

		contact = self.attach_sender_contact()
		# The old UI used lead_name only when there was no contact relationship.
		# An independently stored copy must not undo a withheld Contact label.
		self.deal.lead_name = contact.full_name
		self.deal.save()
		self.deal.reload()
		self.assertEqual(self.deal.lead_name, contact.full_name)
		allowed = frappe.get_doc({"doctype": "Contact", "first_name": "Other scope " + self.key}).insert()
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.actor_a,
				"allow": "Contact",
				"for_value": allowed.name,
				"apply_to_all_doctypes": 0,
				"applicable_for": "Contact",
			}
		).insert()
		frappe.clear_cache(user=self.actor_a)
		frappe.set_user(self.actor_a)
		self.assertFalse(has_permission("Contact", "read", doc=contact.name, print_logs=False))
		self.assertEqual(frappe.get_list("Contact", filters={"name": contact.name}), [])
		self.assertEqual(get_from_name(self.message_a), self.peer)
		serialized = frappe.as_json(get_whatsapp_messages("CRM Deal", self.deal.name))
		for value in (contact.name, contact.full_name, contact.mobile_no):
			self.assertNotIn(value, serialized)

	def test_masked_linked_contact_fields_cannot_return_via_stored_child_copy(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		from crm.api.whatsapp import get_from_name

		contact = self.attach_sender_contact()
		frappe.set_user(self.actor_a)
		self.assertEqual(get_from_name(self.message_a), contact.full_name)
		frappe.set_user("Administrator")
		for field in ("full_name", "mobile_no"):
			make_property_setter("Contact", field, "mask", 1, "Check")
		frappe.clear_cache(doctype="Contact")
		frappe.set_user(self.actor_a)
		self.assertEqual(get_from_name(self.message_a), self.peer)
		serialized = frappe.as_json(get_whatsapp_messages("CRM Deal", self.deal.name))
		self.assertNotIn(contact.full_name, serialized)
		self.assertNotIn(contact.mobile_no, serialized)

	def test_direct_label_helper_does_not_restore_masked_original_peer(self):
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		from crm.api.whatsapp import get_from_name

		orphan = self.make_message("a", "Orphan body", doctype=None)
		make_property_setter("WhatsApp Message", "from", "mask", 1, "Check")
		frappe.clear_cache(doctype="WhatsApp Message")
		frappe.set_user(self.actor_a)
		self.assertEqual(orphan.get("from"), self.peer)
		self.assertEqual(get_from_name(orphan), "")

	def test_notification_sql_scope_does_not_enumerate_notification_ids(self):
		from crm.fcrm.doctype.crm_notification.crm_notification import get_permission_query_conditions

		frappe.set_user(self.actor_a)
		# Read-only query spy; every authority decision still uses native records.
		with patch.object(scope, "rows", wraps=scope.rows) as batches:
			condition = get_permission_query_conditions(self.actor_a)
		self.assertTrue(condition)
		self.assertNotIn("CRM Notification", [call.args[0] for call in batches.call_args_list])
		self.assertIn(self.notice(), [row["name"] for row in get_notifications()])

	def check_hidden_reference_projection(self, property_name, value, property_type):
		from frappe.client import get
		from frappe.custom.doctype.property_setter.property_setter import make_property_setter

		from crm.api.whatsapp import get_from_name

		lead = self.make_linked_lead()
		message = self.make_message("a", "Visible reference-masked body", doctype="CRM Lead", name=lead.name)
		notification = self.notice(message)
		self.assertTrue(notification)
		frappe.set_user(self.actor_a)
		self.assertEqual(get_from_name(message), lead.first_name)
		self.assertIn(notification, [row["name"] for row in get_notifications()])
		frappe.set_user("Administrator")
		for field in ("reference_doctype", "reference_name"):
			make_property_setter("WhatsApp Message", field, property_name, value, property_type)
		frappe.clear_cache(doctype="WhatsApp Message")
		frappe.set_user(self.actor_a)
		self.assertFalse(scope.readable_reference_fields())
		self.assertTrue(scope.can_read_message(message.name))
		self.assertEqual(get_from_name(message), self.peer)
		rows = get_whatsapp_messages("CRM Lead", lead.name)
		self.assertIn(message.name, [row.name for row in rows])
		serialized = frappe.as_json(rows)
		self.assertNotIn(lead.first_name, serialized)
		self.assertNotIn(lead.name, serialized)
		self.assertNotIn(notification, [row["name"] for row in get_notifications()])
		self.assertEqual(frappe.get_list("CRM Notification", filters={"name": notification}), [])
		with self.assertRaises(frappe.PermissionError):
			get("CRM Notification", notification)
		# A subsequent event must not disclose the same hidden edge either.
		self.realtime.reset_mock()
		scope.publish_message(message.name)
		publish_notification(notification)
		self.assertFalse(
			any(call.kwargs.get("user") == self.actor_a for call in self.realtime.call_args_list)
		)

	def test_masked_source_reference_edge_cannot_be_copied_into_label_or_notification(self):
		self.check_hidden_reference_projection("mask", 1, "Check")

	def test_higher_level_source_reference_edge_cannot_be_copied_into_label_or_notification(self):
		self.check_hidden_reference_projection("permlevel", 1, "Int")

	def register_transcript_projection(self):
		from frappe.utils.password import set_encrypted_password

		from crm.api.outbox_bridge import project_transcript

		frappe.set_user("Administrator")
		# A normal outgoing controller insert uses the account's native Demo
		# transport; only its fictional credential is needed before that transport.
		set_encrypted_password("WhatsApp Account", self.accounts["a"].name, "fictional-unused", "token")
		row = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Outgoing",
				"to": self.peer,
				"whatsapp_account": self.accounts["a"].name,
				"message": "Fictional projected reply",
				"content_type": "text",
				"reference_doctype": "CRM Deal",
				"reference_name": self.deal.name,
			}
		).insert()
		self.assertTrue(row.is_demo)
		frappe.db.after_commit = CallbackManager()
		self.realtime.reset_mock()
		# Exercise the production projection entry point. Outbox acceptance is
		# covered in test_outbox_bridge; recipient authority stays fully native.
		project_transcript(
			frappe._dict(
				name="fictional-projection-" + self.key,
				transcript_message=row.name,
				state="Accepted",
				provider_message_id="wamid.projected." + self.key,
			)
		)
		self.assertFalse(self.realtime.called)
		row.reload()
		self.assertEqual((row.status, row.message_id), ("Success", "wamid.projected." + self.key))
		return row

	def projected_recipients(self):
		# Drain the registered callback without committing this test's fixture.
		frappe.db.after_commit.run()
		calls = [call for call in self.realtime.call_args_list if call.args[0] == "whatsapp_message"]
		self.assertTrue(calls)
		for call in calls:
			self.assertEqual(call.kwargs["room"], "user:" + call.kwargs["user"])
			self.assertNotIn("doctype", call.kwargs)
			self.assertNotIn("docname", call.kwargs)
			self.assertEqual(call.args[1]["phone"], self.peer)
		return {call.kwargs["user"] for call in calls}

	def test_transcript_projection_uses_current_account_recipients_after_commit(self):
		self.register_transcript_projection()
		users = self.projected_recipients()
		self.assertIn(self.actor_a, users)
		self.assertNotIn(self.actor_b, users)
		self.assertNotIn(self.outsider, users)

	def test_transcript_projection_rechecks_account_revocation_before_dispatch(self):
		self.register_transcript_projection()
		self.revoke_account()
		users = self.projected_recipients()
		self.assertNotIn(self.actor_a, users)
		self.assertNotIn(self.actor_b, users)

	def test_transcript_projection_rechecks_parent_revocation_before_dispatch(self):
		self.register_transcript_projection()
		self.restrict_pipeline()
		users = self.projected_recipients()
		self.assertNotIn(self.actor_a, users)
		self.assertNotIn(self.actor_b, users)

	def test_transcript_projection_reloads_message_binding_before_dispatch(self):
		row = self.register_transcript_projection()
		# A stored binding correction between registration and delivery must not
		# retain the old account's recipients through captured presentation data.
		row.db_set("whatsapp_account", self.accounts["b"].name, update_modified=False)
		users = self.projected_recipients()
		self.assertNotIn(self.actor_a, users)
		self.assertIn(self.actor_b, users)
