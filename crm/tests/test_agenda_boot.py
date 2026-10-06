"""The Agenda entry gate boots neutral for /crm/agenda and the retired /crm/calendar only."""

from unittest import TestCase

from crm.agenda_routes import is_agenda_path


class TestAgendaPaths(TestCase):
	def test_agenda_and_retired_calendar_paths(self):
		for path in ("/crm/agenda", "/crm/agenda/", "/crm/agenda?view=week&date=2026-10-05", "/crm/calendar"):
			with self.subTest(path=path):
				self.assertTrue(is_agenda_path(path))

	def test_rejects_sales_nested_and_external_paths(self):
		for path in (
			"/crm",
			"/crm/deals",
			"/crm/agenda/extra",
			"/crm/calendar/view",
			"//evil.invalid/crm/agenda",
			"https://evil.invalid/crm/agenda",
			"/crm\\agenda",
			None,
		):
			with self.subTest(path=path):
				self.assertFalse(is_agenda_path(path))
