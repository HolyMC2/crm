"""Más places: what other apps offer outside the SPA (`muelle_more_places`), checked and bounded."""

# ci: shell-apis
from unittest import TestCase, skipIf
from unittest.mock import patch

try:
	import frappe

	from crm.api import shell

	HAS_FRAPPE = True
except ImportError:
	HAS_FRAPPE = False


def _place(**overrides):
	return {
		"key": "asistencia",
		"label": "Asistencia",
		"icon": "lucide-clock",
		"href": "/desk/asistencia",
		**overrides,
	}


@skipIf(not HAS_FRAPPE, "Frappe integration dependency is not installed")
class TestMorePlaces(TestCase):
	def collect(self, *answers):
		providers = {f"app.place_{index}": answer for index, answer in enumerate(answers)}

		def attr(path):
			answer = providers[path]
			if isinstance(answer, Exception):

				def fail():
					raise answer

				return fail
			return lambda: answer

		with (
			patch.object(frappe, "get_hooks", return_value=list(providers)),
			patch.object(frappe, "get_attr", side_effect=attr),
		):
			return shell.more_places()

	def test_a_place_passes_through_as_key_label_icon_href(self):
		self.assertEqual(self.collect(_place()), [_place()])

	def test_a_provider_that_declines_or_fails_costs_only_its_place(self):
		places = self.collect(None, RuntimeError("boom"), _place(key="otra", href="/taller/x"))
		self.assertEqual([place["key"] for place in places], ["otra"])

	def test_only_this_sites_desk_and_apps_are_reachable(self):
		for href in (
			"https://evil.test/x",
			"//evil.test/x",
			"/crm/hoy",
			"/desk//x",
			"/desk/a\\b",
			"",
			"javascript:x",
		):
			self.assertEqual(self.collect(_place(href=href)), [], href)
		self.assertEqual(len(self.collect(_place(href="/app/asistencia"))), 1)

	def test_a_place_never_shadows_a_module_or_another_place(self):
		places = self.collect(_place(key="equipo"), _place(), _place(label="Otra vez"))
		self.assertEqual([place["label"] for place in places], ["Asistencia"])

	def test_an_unknown_icon_reads_as_a_link_out(self):
		(place,) = self.collect(_place(icon="fa fa-clock"))
		self.assertEqual(place["icon"], "lucide-external-link")

	def test_the_list_is_bounded(self):
		places = self.collect(*(_place(key=f"p{index}") for index in range(10)))
		self.assertEqual(len(places), shell.MORE_PLACE_LIMIT)
