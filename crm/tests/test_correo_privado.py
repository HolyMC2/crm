"""Personal mailboxes: only their owner reads their mail (crm.permissions.correo).

bench --site <site> run-tests --module crm.tests.test_correo_privado
"""

import unittest
from unittest.mock import patch

import frappe

from crm.api import correo, correo_buzones
from crm.permissions import correo as privado

OWNER = "correo-dueno@example.invalid"
OTHER = "correo-otro@example.invalid"
STAFF = "correo-staff@example.invalid"
SENDER = "proveedor-correo@example.invalid"
PERSONAL_BOX = "Correo Personal Test"
SHARED_BOX = "Correo Compartido Test"


class CorreoPrivadoTests(unittest.TestCase):
	def setUp(self):
		patch.object(frappe.db, "commit").start()
		self.addCleanup(patch.stopall)
		frappe.db.savepoint("correo_privado")
		self.addCleanup(lambda: frappe.db.rollback(save_point="correo_privado"))
		self.addCleanup(privado.clear_cache)
		self.addCleanup(frappe.set_user, frappe.session.user)
		frappe.set_user("Administrator")
		privado.clear_cache()
		self._user(OWNER, "System Manager")
		self._user(OTHER, "System Manager")
		self._user(STAFF, "Sales User")
		self._account(SHARED_BOX, "shared-box@example.invalid", privado.SHARED)
		self._account(PERSONAL_BOX, "personal-box@example.invalid", privado.PERSONAL, OWNER)
		if not frappe.db.exists("Contact", {"email_id": SENDER}):
			frappe.get_doc(
				{
					"doctype": "Contact",
					"first_name": "Proveedor Correo",
					"email_ids": [{"email_id": SENDER, "is_primary": 1}],
				}
			).insert(ignore_permissions=True)

	def _user(self, email, role):
		if frappe.db.exists("User", email):
			return
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"roles": [{"role": role}],
			}
		).insert(ignore_permissions=True)

	def _account(self, name, email, scope, owner=None):
		frappe.get_doc(
			{
				"doctype": "Email Account",
				"email_account_name": name,
				"email_id": email,
				"enable_incoming": 0,
				"enable_outgoing": 0,
				"default_outgoing": 1 if scope == privado.PERSONAL else 0,
				"create_contact": 1,
				"crm_alcance": scope,
				"crm_dueno": owner,
			}
		).insert(ignore_permissions=True)

	def _mail(self, account, subject):
		return frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_medium": "Email",
				"communication_type": "Communication",
				"sent_or_received": "Received",
				"email_account": account,
				"sender": SENDER,
				"recipients": "someone@example.invalid",
				"subject": subject,
				"content": "Hola",
			}
		).insert(ignore_permissions=True)

	def _listed(self, user, name):
		frappe.set_user(user)
		try:
			return bool(frappe.get_list("Communication", filters={"name": name}, pluck="name"))
		finally:
			frappe.set_user("Administrator")

	# ------------------------------------------------------------------ reading

	def test_only_the_owner_lists_and_opens_personal_mail(self):
		mail = self._mail(PERSONAL_BOX, "Estado de cuenta personal")
		self.assertTrue(self._listed(OWNER, mail.name))
		self.assertFalse(self._listed(OTHER, mail.name), "another System Manager must not list it")
		self.assertTrue(frappe.has_permission("Communication", "read", mail, user=OWNER))
		self.assertFalse(frappe.has_permission("Communication", "read", mail, user=OTHER))
		frappe.set_user(OTHER)
		with self.assertRaises(frappe.PermissionError):
			correo.mensaje(mail.name)

	def test_shared_mail_keeps_frappes_rule(self):
		mail = self._mail(SHARED_BOX, "Cotización")
		self.assertTrue(self._listed(OWNER, mail.name))
		self.assertTrue(self._listed(OTHER, mail.name))

	def test_the_personal_account_is_hidden_from_other_settings_lists(self):
		frappe.set_user(OTHER)
		names = frappe.get_list("Email Account", pluck="name")
		self.assertIn(SHARED_BOX, names)
		self.assertNotIn(PERSONAL_BOX, names)
		frappe.set_user(OWNER)
		self.assertIn(PERSONAL_BOX, frappe.get_list("Email Account", pluck="name"))

	# ------------------------------------------------------------------ records

	def test_personal_mail_never_links_itself_to_records(self):
		personal = self._mail(PERSONAL_BOX, "Factura personal")
		shared = self._mail(SHARED_BOX, "Factura compartida")
		self.assertEqual(personal.timeline_links, [])
		self.assertTrue(
			any(link.link_doctype == "Contact" for link in shared.timeline_links),
			"Frappe still links shared mail to the sender's contact",
		)
		personal.reload()
		personal.save(ignore_permissions=True)  # Frappe re-links contacts on every save
		self.assertEqual(personal.timeline_links, [])

	def test_linking_personal_mail_to_a_record_is_refused_with_the_way_out(self):
		mail = self._mail(PERSONAL_BOX, "Factura personal")
		contact = frappe.db.get_value("Contact", {"email_id": SENDER})
		frappe.set_user(OWNER)
		with self.assertRaises(frappe.PermissionError) as caught:
			correo.vincular(mail.name, "Contact", contact)
		self.assertIn("shared mailbox", str(caught.exception))

	# ------------------------------------------------------------------ the mailbox

	def test_a_personal_mailbox_is_nobodys_default_and_creates_nothing(self):
		doc = frappe.get_doc("Email Account", PERSONAL_BOX)
		self.assertEqual((doc.default_outgoing, doc.create_contact), (0, 0))
		self.assertEqual(privado.readers(PERSONAL_BOX), [OWNER])

	def test_who_reads_it_shared_with_people_then_personal(self):
		frappe.set_user(OWNER)
		out = correo_buzones.save_audience(SHARED_BOX, privado.SHARED, [STAFF])
		self.assertEqual([r["user"] for r in out["readers"]], [STAFF])
		frappe.set_user("Administrator")
		mail = self._mail(SHARED_BOX, "Para el equipo")
		self.assertTrue(self._listed(STAFF, mail.name), "the chosen person reads the shared mailbox")

		frappe.set_user(OWNER)
		out = correo_buzones.save_audience(SHARED_BOX, privado.PERSONAL)
		self.assertEqual(out["scope"], privado.PERSONAL)
		self.assertEqual(out["owner"]["user"], OWNER)
		self.assertEqual(privado.readers(SHARED_BOX), [OWNER])
		self.assertFalse(self._listed(STAFF, mail.name))
		self.assertFalse(self._listed(OTHER, mail.name))

	def test_only_the_owner_changes_a_personal_mailbox(self):
		frappe.set_user(OTHER)
		with self.assertRaises(frappe.PermissionError):
			correo_buzones.save_audience(PERSONAL_BOX, privado.SHARED, [OTHER])
		frappe.set_user(STAFF)
		with self.assertRaises(frappe.PermissionError):
			correo_buzones.save_audience(SHARED_BOX, privado.SHARED, [STAFF])


if __name__ == "__main__":
	unittest.main()
