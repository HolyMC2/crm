# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from crm.api import form as F
from crm.forms import settings as form_settings
from crm.forms import wiring


def make_user(email, role="Sales User"):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"roles": [{"role": role}],
			}
		).insert(ignore_permissions=True)
	return email


def submit(form_name, values, utm=None, consent=False):
	"""Insert the target record the way the public page's accept() call does."""
	doc_type = frappe.db.get_value("Web Form", form_name, "doc_type")
	frappe.flags.in_web_form = True
	frappe.form_dict["web_form"] = form_name
	frappe.form_dict["crm_utm"] = frappe.as_json(utm or {})
	frappe.form_dict["crm_consent"] = 1 if consent else 0
	try:
		return frappe.get_doc({"doctype": doc_type, **values}).insert(ignore_permissions=True)
	finally:
		frappe.flags.in_web_form = False
		for key in ("web_form", "crm_utm", "crm_consent"):
			frappe.form_dict.pop(key, None)


class TestFormWiring(IntegrationTestCase):
	# the custom fields come from crm.install.add_web_form_custom_fields (after_migrate)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.flags.in_web_form = False
		for key in ("web_form", "crm_utm", "crm_consent"):
			frappe.form_dict.pop(key, None)
		frappe.db.rollback()

	# ---- templates ----

	def test_templates_listed_with_fields(self):
		templates = F.get_form_templates()
		keys = [t["key"] for t in templates]
		self.assertEqual(keys, ["contact", "quote", "visit", "promo"])
		self.assertTrue(all(t["fields"] for t in templates))

	def test_create_from_template_prefills_and_makes_route_unique(self):
		first = F.create_form(template="contact", title="Contact test", route="wf-contact-test")
		second = F.create_form(template="contact", title="Contact test", route="wf-contact-test")
		self.assertNotEqual(first["route"], second["route"])
		self.assertTrue(second["route"].startswith("wf-contact-test-"))

		cfg = F.get_form_config(first["name"])
		visible = [f["fieldname"] for f in cfg["fields"] if f["fieldtype"] not in F.LAYOUT_BREAKS]
		self.assertIn("first_name", visible)
		self.assertIn("mobile_no", visible)
		self.assertIn("crm_form_message", visible)
		self.assertEqual(cfg["settings"]["template"], "contact")
		self.assertTrue(cfg["settings"]["language"])
		self.assertIn("{business}", cfg["description"])

	def test_promo_template_turns_on_consent(self):
		cfg = F.get_form_config(F.create_form(template="promo", route="wf-promo-test")["name"])
		self.assertTrue(cfg["settings"]["consent_enabled"])
		self.assertTrue(cfg["settings"]["consent_text"])

	def test_blank_form_seeds_contact_layout(self):
		cfg = F.get_form_config(F.create_form(document_type="CRM Deal", route="wf-blank-deal")["name"])
		self.assertEqual(cfg["document_type"], "CRM Deal")
		self.assertTrue(cfg["fields"])

	def test_duplicate_copies_everything_as_draft(self):
		name = F.create_form(template="quote", route="wf-dup-src")["name"]
		F.set_published(name, 1)
		copy = F.duplicate_form(name)
		src, dup = F.get_form_config(name), F.get_form_config(copy["name"])
		self.assertEqual(dup["published"], 0)
		self.assertNotEqual(dup["route"], src["route"])
		self.assertEqual([f["fieldname"] for f in dup["fields"]], [f["fieldname"] for f in src["fields"]])
		self.assertEqual(dup["settings"]["template"], "quote")

	# ---- settings ----

	def test_settings_reject_inactive_assignee(self):
		inactive = make_user("wf-inactive@example.com")
		frappe.db.set_value("User", inactive, "enabled", 0)
		with self.assertRaises(frappe.ValidationError):
			form_settings.clean({"assign_mode": "user", "assign_to": inactive}, "CRM Lead")

	def test_settings_require_assignee_in_user_mode(self):
		with self.assertRaises(frappe.ValidationError):
			form_settings.clean({"assign_mode": "user"}, "CRM Lead")

	def test_settings_drop_unknown_keys_and_keep_existing(self):
		out = form_settings.clean({"bogus": 1, "notify_mode": "digest"}, "CRM Lead", {"template": "visit"})
		self.assertNotIn("bogus", out)
		self.assertEqual(out["template"], "visit")
		self.assertEqual(out["notify_mode"], "digest")

	def test_publish_needs_a_field(self):
		name = F.create_form(document_type="CRM Lead", route="wf-empty")["name"]
		cfg = F.get_form_config(name)
		with self.assertRaises(frappe.ValidationError):
			F.save_form(
				name,
				{
					**cfg,
					"fields": [f for f in cfg["fields"] if f["fieldtype"] in F.LAYOUT_BREAKS],
					"published": 1,
				},
			)

	# ---- submission wiring ----

	def test_submission_links_form_assigns_and_leaves_a_note(self):
		agent = make_user("wf-agent@example.com")
		name = F.create_form(template="contact", route="wf-wired")["name"]
		cfg = F.get_form_config(name)
		F.save_form(name, {**cfg, "settings": {"assign_mode": "user", "assign_to": agent}})

		lead = submit(
			name,
			{"first_name": "Ana", "mobile_no": "5550000001", "crm_form_message": "Need a repair"},
			utm={"utm_source": "instagram", "utm_medium": "social", "bogus": "x"},
		)
		self.assertEqual(lead.crm_web_form, name)
		self.assertEqual(lead.source, "Web Form")
		self.assertEqual(lead.lead_owner, agent)
		if lead.meta.has_field("utm_source"):
			self.assertEqual(lead.utm_source, "instagram")
		note = frappe.get_all(
			"Comment",
			filters={"reference_doctype": "CRM Lead", "reference_name": lead.name, "comment_type": "Info"},
			pluck="content",
		)
		self.assertTrue(any("Need a repair" in (c or "") for c in note))
		# the assignee is told, credited to the form rather than to "Guest"
		todo = frappe.get_all(
			"ToDo", filters={"reference_name": lead.name, "allocated_to": agent}, pluck="name"
		)
		self.assertTrue(todo)

	def test_watchers_get_an_in_app_notification(self):
		watcher = make_user("wf-watcher@example.com")
		name = F.create_form(template="contact", route="wf-watch")["name"]
		cfg = F.get_form_config(name)
		F.save_form(name, {**cfg, "settings": {"notify_users": [watcher]}})
		lead = submit(name, {"first_name": "Leo", "mobile_no": "5550000002", "crm_form_message": "Hi"})
		rows = frappe.get_all(
			"CRM Notification",
			filters={"to_user": watcher, "type": "Form", "notification_type_doc": lead.name},
			pluck="name",
		)
		self.assertTrue(rows)

	def test_digest_mode_skips_instant_notification(self):
		watcher = make_user("wf-digest@example.com")
		name = F.create_form(template="contact", route="wf-digest")["name"]
		cfg = F.get_form_config(name)
		F.save_form(name, {**cfg, "settings": {"notify_users": [watcher], "notify_mode": "digest"}})
		lead = submit(name, {"first_name": "Max", "mobile_no": "5550000003", "crm_form_message": "Hi"})
		self.assertFalse(
			frappe.db.exists("CRM Notification", {"to_user": watcher, "notification_type_doc": lead.name})
		)

	def test_spoofed_form_for_other_doctype_is_ignored(self):
		deal_form = F.create_form(document_type="CRM Deal", route="wf-spoof")["name"]
		frappe.flags.in_web_form = True
		frappe.form_dict["web_form"] = deal_form
		lead = frappe.get_doc({"doctype": "CRM Lead", "first_name": "Zed"}).insert(ignore_permissions=True)
		self.assertFalse(lead.get("crm_web_form"))

	def test_utm_is_sanitized(self):
		frappe.form_dict["crm_utm"] = frappe.as_json({"utm_source": "x" * 400, "evil": "1", "utm_term": 5})
		utm = wiring.request_utm()
		self.assertEqual(len(utm["utm_source"]), wiring.MAX_UTM_LENGTH)
		self.assertNotIn("evil", utm)
		self.assertNotIn("utm_term", utm)
		frappe.form_dict["crm_utm"] = "not json"
		self.assertEqual(wiring.request_utm(), {})

	# ---- test submission ----

	def test_test_submission_reports_and_rolls_back(self):
		agent = make_user("wf-tester@example.com")
		name = F.create_form(template="contact", route="wf-test-run")["name"]
		cfg = F.get_form_config(name)
		F.save_form(name, {**cfg, "settings": {"assign_mode": "user", "assign_to": agent}})
		before = frappe.db.count("CRM Lead")
		report = F.run_test_submission(
			name, {"first_name": "Tess", "mobile_no": "5550000004", "crm_form_message": "Test"}
		)
		self.assertTrue(report["ok"], report)
		self.assertTrue(report["rolled_back"])
		self.assertEqual(report["record"]["owner"], agent)
		self.assertEqual(report["assignment"]["how"], "form")
		self.assertTrue(report["comment"])
		self.assertEqual(frappe.db.count("CRM Lead"), before)
		self.assertFalse(frappe.db.exists("CRM Lead", report["record"]["name"]))
		# the form itself survives the rollback
		self.assertTrue(frappe.db.exists("Web Form", name))

	def test_test_submission_reports_missing_required(self):
		name = F.create_form(template="contact", route="wf-test-missing")["name"]
		report = F.run_test_submission(name, {"first_name": "No phone"})
		self.assertFalse(report["ok"])
		self.assertTrue(report["error"])

	# ---- stats, submissions, share ----

	def test_stats_and_submissions_follow_the_form(self):
		name = F.create_form(template="contact", route="wf-stats")["name"]
		submit(name, {"first_name": "One", "mobile_no": "5550000005", "crm_form_message": "a"})
		submit(name, {"first_name": "Two", "mobile_no": "5550000006", "crm_form_message": "b"})
		row = next(f for f in F.list_forms() if f["name"] == name)
		self.assertEqual(row["stats"]["total"], 2)
		self.assertEqual(row["stats"]["last_7_days"], 2)
		self.assertTrue(row["stats"]["last_submission"])
		subs = F.get_form_submissions(name)
		self.assertEqual([r["title"] for r in subs["rows"]], ["Two", "One"])

	def test_qr_only_for_the_forms_own_link(self):
		name = F.create_form(template="contact", route="wf-qr")["name"]
		svg = F.get_form_qr(name, "https://example.com/crm-form/wf-qr?utm_source=flyer")
		self.assertIn("<svg", svg)
		with self.assertRaises(frappe.ValidationError):
			F.get_form_qr(name, "https://evil.example/phish")
		with self.assertRaises(frappe.ValidationError):
			F.get_form_qr(name, "javascript:alert(1)//crm-form/wf-qr")

	# ---- doco_marketing follow-up (only when the addon is installed) ----

	def test_campaign_enrollment_through_the_engine(self):
		if not form_settings.marketing_installed():
			self.skipTest("doco_marketing not installed")
		campaign = frappe.get_doc(
			{
				"doctype": "CRM Campaign",
				"title": "WF test follow-up",
				"type": "whatsapp",
				"status": "Active",
				"enrollment_trigger": "manual",
				"steps": [{"step_type": "wait", "wait_hours": 720}],
			}
		).insert(ignore_permissions=True)
		name = F.create_form(template="promo", route="wf-campaign")["name"]
		cfg = F.get_form_config(name)
		F.save_form(name, {**cfg, "settings": {"campaign": campaign.name}})
		lead = submit(
			name,
			{"first_name": "Cam", "mobile_no": "5550000007"},
			utm={"utm_source": "flyer", "utm_medium": "print"},
			consent=True,
		)
		self.assertTrue(
			frappe.db.exists("CRM Campaign Enrollment", {"campaign": campaign.name, "lead": lead.name})
		)
		touch = frappe.get_all(
			"CRM Touchpoint",
			filters={"reference_name": lead.name, "event": "form_submit"},
			fields=["utm_source", "channel"],
		)
		self.assertEqual(touch[0].utm_source, "flyer")
		self.assertTrue(
			frappe.db.exists(
				"Marketing Consent Log", {"source_form": "crm-form:wf-campaign", "action": "Grant"}
			)
		)
		# no send is queued by enrollment itself
		self.assertFalse(frappe.db.exists("Marketing Send Log", {"campaign": campaign.name}))

	# ---- forms made outside the builder (Desk) ----

	def test_desk_made_form_is_flagged_and_duplicates_clean(self):
		desk = frappe.get_doc(
			{
				"doctype": "Web Form",
				"title": "WF desk made",
				"route": "wf-desk-made",
				"doc_type": "CRM Deal",
				"module": "FCRM",
				"is_standard": 0,
				"web_form_fields": [
					{"fieldname": "first_name", "fieldtype": "Data", "label": "First Name"},
					{
						"fieldname": "contacts",
						"fieldtype": "Table",
						"label": "Contacts",
						"options": "CRM Contacts",
					},
					{
						"fieldname": "status",
						"fieldtype": "Link",
						"label": "Status",
						"options": "CRM Deal Status",
					},
				],
			}
		).insert(ignore_permissions=True)
		cfg = F.get_form_config(desk.name)
		self.assertEqual(set(cfg["incompatible_fields"]), {"Contacts", "Status"})
		row = next(f for f in F.list_forms() if f["name"] == desk.name)
		self.assertEqual(row["incompatible_fields"], 2)

		copy = F.get_form_config(F.duplicate_form(desk.name)["name"])
		self.assertEqual(copy["incompatible_fields"], [])
		self.assertEqual(
			[f["fieldname"] for f in copy["fields"] if f["fieldtype"] not in F.LAYOUT_BREAKS], ["first_name"]
		)
		self.assertIn("status", {h["fieldname"] for h in copy["hidden_fields"]})
		# the original stays exactly as it was
		self.assertEqual(len(frappe.get_doc("Web Form", desk.name).web_form_fields), 3)

	def test_consent_text_defaults_to_the_forms_language(self):
		name = F.create_form(template="contact", route="wf-consent-lang")["name"]
		cfg = F.get_form_config(name)
		F.save_form(name, {**cfg, "settings": {"language": "es", "consent_enabled": 1, "consent_text": ""}})
		es = F.get_form_config(name)
		self.assertEqual(
			es["settings"]["consent_text"],
			frappe._("Yes, send me offers and news from {business} on WhatsApp.", lang="es"),
		)
		self.assertEqual(es["default_consent_text"], es["settings"]["consent_text"])
		# a promo form created in Spanish starts with the Spanish opt-in text
		promo = F.get_form_config(F.create_form(template="promo", route="wf-promo-es", language="es")["name"])
		self.assertEqual(promo["settings"]["consent_text"], es["settings"]["consent_text"])
