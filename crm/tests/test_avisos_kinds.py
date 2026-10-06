"""Avisos grouping and gate paths without a bench."""

from unittest import TestCase

from crm.avisos import kinds
from crm.avisos_routes import is_avisos_path


def row(**values):
	base = {"source": "native", "name": "N1", "type": "Alert", "title": "", "doctype": None, "docname": None}
	base.update(values)
	return base


class TestAvisosKinds(TestCase):
	def test_categories(self):
		self.assertEqual(kinds.category(row(type="Mention")), "direct")
		self.assertEqual(kinds.category(row(type="Assignment", doctype="ToDo", docname="T")), "direct")
		self.assertEqual(kinds.category(row(source="crm", type="Task")), "direct")
		self.assertEqual(kinds.category(row(source="crm", type="WhatsApp")), "messages")
		self.assertEqual(kinds.category(row(source="crm", type="Form")), "messages")
		self.assertEqual(kinds.category(row(doctype="Sales Order", docname="SO-1")), "alerts")
		self.assertEqual(kinds.category(row(link="/app/scan-task")), "alerts")
		self.assertEqual(kinds.category(row()), "system")
		self.assertEqual(kinds.category(row(type="Energy Point")), "system")

	def test_repeating_system_alerts_fold_into_one_group(self):
		first = row(title="651 every-tick job(s) run without failure logging")
		second = row(name="N2", title="12 every-tick job(s) run without failure logging")
		self.assertEqual(kinds.group_key(first), kinds.group_key(second))
		drift = row(title="💱 Valor de trato desfasado en 38 tratos — Centro: 20, Norte: 18. Revisar: D-1")
		drift2 = row(name="N3", title="💱 Valor de trato desfasado en 451 tratos — Centro: 400. Revisar: D-9")
		self.assertEqual(kinds.group_key(drift), kinds.group_key(drift2))
		self.assertNotEqual(kinds.group_key(first), kinds.group_key(drift))

	def test_alerts_group_per_record_and_kind(self):
		a = row(title="POS sale did not post: SINV-1", doctype="POS Ledger", docname="L1")
		b = row(name="N2", title="POS sale did not post: SINV-1", doctype="POS Ledger", docname="L1")
		c = row(name="N3", title="POS sale did not post: SINV-2", doctype="POS Ledger", docname="L2")
		self.assertEqual(kinds.group_key(a), kinds.group_key(b))
		self.assertNotEqual(kinds.group_key(a), kinds.group_key(c))
		self.assertEqual(kinds.kind_key(a), kinds.kind_key(c))

	def test_direct_without_record_stays_alone(self):
		a = row(type="Mention", name="M1")
		b = row(type="Mention", name="M2")
		self.assertNotEqual(kinds.group_key(a), kinds.group_key(b))

	def test_whatsapp_groups_per_conversation(self):
		a = row(source="crm", type="WhatsApp", doctype="CRM Deal", docname="D1", name="C1")
		b = row(source="crm", type="WhatsApp", doctype="CRM Deal", docname="D1", name="C2")
		c = row(source="crm", type="WhatsApp", doctype="CRM Deal", docname="D2", name="C3")
		self.assertEqual(kinds.group_key(a), kinds.group_key(b))
		self.assertNotEqual(kinds.group_key(a), kinds.group_key(c))

	def test_separator_in_record_name_cannot_forge_a_category(self):
		key = kinds.group_key(row(doctype="ToDo", docname="x|direct", title="t"))
		self.assertEqual(kinds.key_category(key), "alerts")
		self.assertIsNone(kinds.key_category("evil|native|Alert"))

	def test_prefs_normalize_and_never_hide_direct(self):
		prefs = kinds.normalize_prefs(
			{
				"categories": {"direct": "off", "system": "badge", "bogus": "badge", "alerts": "loud"},
				"muted": ["direct|native|Mention||", "system|native|Alert||x", "system|native|Alert||x", 5],
			}
		)
		self.assertEqual(prefs["categories"]["direct"], "quiet")
		self.assertEqual(prefs["categories"]["system"], "badge")
		self.assertEqual(prefs["categories"]["alerts"], "badge")
		self.assertNotIn("bogus", prefs["categories"])
		self.assertEqual(prefs["muted"], ["system|native|Alert||x"])
		self.assertEqual(kinds.normalize_prefs(None)["categories"], kinds.DEFAULT_MODES)

	def test_visibility(self):
		prefs = kinds.normalize_prefs({"muted": ["alerts|native|Alert|SO|x"]})
		self.assertEqual(kinds.visibility("alerts", "alerts|native|Alert|SO|x", prefs), "off")
		self.assertEqual(kinds.visibility("system", "system|native|Alert||y", prefs), "quiet")
		self.assertEqual(kinds.visibility("direct", "direct|native|Mention||", prefs), "badge")

	def test_plain_text_never_keeps_markup(self):
		self.assertEqual(kinds.plain("<b>Hola</b> &amp; <script>x</script>adiós"), "Hola & x adiós")
		self.assertEqual(kinds.plain("abcdef", limit=4), "abc…")

	def test_kind_label(self):
		self.assertEqual(kinds.kind_label("system|native|Alert||# every-tick"), "# every-tick")
		self.assertEqual(kinds.kind_label("messages|crm|WhatsApp|CRM Deal|"), "WhatsApp · CRM Deal")


class TestAvisosPaths(TestCase):
	def test_avisos_and_legacy_notifications_are_neutral(self):
		for path in ("/crm/avisos", "/crm/avisos?view=history", "/crm/notifications", "/crm/avisos/"):
			with self.subTest(path=path):
				self.assertTrue(is_avisos_path(path))

	def test_other_paths_are_not(self):
		for path in (
			"/crm",
			"/crm/avisos/extra",
			"/crm/avisos-x",
			"//evil.invalid/crm/avisos",
			"https://evil.invalid/crm/avisos",
			"/crm/avisos\\evil",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_avisos_path(path))
