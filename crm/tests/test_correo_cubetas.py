"""The mail queue shows the assistant's sorting (doco's correo agent) for mail the worker reads.

bench --site <site> run-tests --module crm.tests.test_correo_cubetas
"""

import unittest
from unittest.mock import patch

import frappe

from crm.api import correo

BOX = "Correo Cubetas Test"


@unittest.skipUnless("doco" in frappe.get_installed_apps(), "the correo agent is doco's")
class CorreoCubetasTests(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("DocType", "Correo Triaje"):
			self.skipTest("this site's doco predates the correo agent")
		patch.object(frappe.db, "commit").start()
		self.addCleanup(patch.stopall)
		frappe.db.savepoint("correo_cubetas")
		self.addCleanup(lambda: frappe.db.rollback(save_point="correo_cubetas"))
		self.addCleanup(frappe.set_user, frappe.session.user)
		frappe.set_user("Administrator")
		if not frappe.db.exists("Email Account", BOX):
			frappe.get_doc(
				{
					"doctype": "Email Account",
					"email_account_name": BOX,
					"email_id": "cubetas-test@tienda-demo.mx",
					"enable_incoming": 0,
					"enable_outgoing": 0,
				}
			).insert(ignore_permissions=True)

	def _sorted(self, subject, bucket, **extra):
		comm = frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_medium": "Email",
				"communication_type": "Communication",
				"sent_or_received": "Received",
				"email_account": BOX,
				"sender": "alguien@tienda-demo.mx",
				"subject": subject,
				"content": "Hola",
			}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "Correo Triaje",
				"communication": comm.name,
				"email_account": BOX,
				"recibido": comm.communication_date,
				"bucket": bucket,
				"resumen": f"Resumen de {subject}",
				**extra,
			}
		).insert(ignore_permissions=True)
		return comm.name

	def test_rows_carry_the_sorting_and_the_buckets_are_counted(self):
		bill = self._sorted(
			"Recibo Telcel", "action", accion="Pagar Telcel", monto=899, moneda="MXN", vence="2026-11-28"
		)
		promo = self._sorted("Ofertas", "noise")
		out = correo.bandeja(cuenta=BOX)
		self.assertEqual(out["conteos"]["cubetas"], {"action": 1, "noise": 1})
		rows = {r["name"]: r for r in out["filas"]}
		self.assertEqual(rows[bill]["triaje"]["cubeta"], "action")
		self.assertEqual(rows[bill]["triaje"]["accion"], "Pagar Telcel")
		self.assertEqual(
			(rows[bill]["triaje"]["monto"], rows[bill]["triaje"]["vence"]), (899.0, "2026-11-28")
		)
		self.assertEqual(rows[promo]["triaje"]["cubeta"], "noise")

	def test_one_bucket_shows_only_its_mail_unfolded(self):
		bill = self._sorted("Recibo Telcel", "action")
		self._sorted("Ofertas", "noise")
		out = correo.bandeja(cuenta=BOX, cubeta="action")
		self.assertEqual([r["name"] for r in out["filas"]], [bill])
		self.assertEqual(out["categorias"], [], "a bucket is a plain list, like a search")

	def test_a_money_alert_is_not_folded_with_the_system_alerts(self):
		def alert(subject, sender):
			comm = frappe.get_doc(
				{
					"doctype": "Communication",
					"communication_medium": "Email",
					"communication_type": "Communication",
					"sent_or_received": "Received",
					"email_account": BOX,
					"sender": sender,
					"subject": subject,
					"content": "Aviso automático",
				}
			).insert(ignore_permissions=True)
			return comm.name

		charge = alert("Cargo a tu tarjeta", "no-reply@banco-demo.mx")
		frappe.get_doc(
			{
				"doctype": "Correo Triaje",
				"communication": charge,
				"email_account": BOX,
				"bucket": "money",
				"resumen": "Cargo de $1,249",
			}
		).insert(ignore_permissions=True)
		login = alert("Alerta de seguridad", "no-reply@cuentas-demo.mx")
		out = correo.bandeja(cuenta=BOX)
		names = [r["name"] for r in out["filas"]]
		self.assertIn(charge, names, "a sorted money mail stays in the list")
		self.assertNotIn(login, names, "an unsorted alert still folds")

	def test_mail_without_a_sorting_has_none(self):
		comm = frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_medium": "Email",
				"communication_type": "Communication",
				"sent_or_received": "Received",
				"email_account": BOX,
				"sender": "otra@tienda-demo.mx",
				"subject": "Sin ordenar",
				"content": "Hola",
			}
		).insert(ignore_permissions=True)
		rows = {r["name"]: r for r in correo.bandeja(cuenta=BOX)["filas"]}
		self.assertIsNone(rows[comm.name]["triaje"])


if __name__ == "__main__":
	unittest.main()
