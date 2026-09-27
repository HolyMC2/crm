"""Pure fixture planning/guard tests. These do not exercise native controllers."""

import copy
import hashlib
import json
import os
import tempfile
import unittest
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from contract import ContractError, checksum
from seed_native import (
	REQUIRED_APPS,
	atomic_json,
	private_file,
	provision_guard,
	resume_name,
	verify_fields,
	verify_preflight,
)
from seed_plan import (
	ACTORS,
	PROFILES,
	SIZES,
	STAGES,
	activity_schedule,
	deal_recipe,
	expected_visible,
	label,
	repair_parent,
)


class TestSeed(unittest.TestCase):
	def setUp(self):
		self.temp = tempfile.TemporaryDirectory()
		self.addCleanup(self.temp.cleanup)
		self.root = Path(self.temp.name)
		self.site = "crm-perf-123456789abc.localhost"
		self.receipt = {
			"version": 1,
			"site": self.site,
			"created_at": datetime.now(timezone.utc).isoformat(),
			"anchor_date": datetime.now(timezone.utc).date().isoformat(),
			"database": {"name": "crm_perf_123456789abc", "host": "crm-perf-123456789abc-db", "port": 3306},
			"redis": {
				key: f"redis://crm-perf-123456789abc-redis:6379/{i}"
				for i, key in enumerate(("redis_cache", "redis_queue", "redis_socketio"))
			},
			"image": "sha256:" + "a" * 64,
			"topology_digest": "b" * 64,
			"network_internal": True,
			"workers_disabled": True,
			"scheduler_disabled": True,
			"outbound_disabled": True,
			"sources": {},
		}
		for app in REQUIRED_APPS:
			directory = self.root / "unit_fixture_sources" / app
			directory.mkdir(parents=True)
			# Synthetic files test the hashing guard only. They are never
			# imported or installed as application/dependency substitutes.
			body = b"# synthetic guard-only unit fixture\n"
			(directory / "hooks.py").write_bytes(body)
			self.receipt["sources"][app] = {
				"commit": "c" * 40,
				"root": str(directory),
				"files": {"hooks.py": hashlib.sha256(body).hexdigest()},
			}
		self.sites = self.root / "sites"
		(self.sites / self.site).mkdir(parents=True)
		self.config = {
			"db_name": self.receipt["database"]["name"],
			"db_host": self.receipt["database"]["host"],
			"db_port": 3306,
			**self.receipt["redis"],
			"mute_emails": True,
			"pause_scheduler": True,
		}
		self.write_config()

	def write_config(self):
		(self.sites / self.site / "site_config.json").write_text(json.dumps(self.config))

	def test_exact_counts_all_roles_stages_and_hot_histories(self):
		rows = list(activity_schedule("full"))
		self.assertEqual(len(rows), 50000)
		self.assertEqual(
			Counter(kind for kind, _, _ in rows),
			{"task": 25000, "comment": 15000, "note": 5000, "call": 5000},
		)
		self.assertEqual(len({(kind, index) for kind, index, _ in rows}), 50000)
		histories = Counter(parent for _, _, parent in rows)
		for parent in (0, 12, 14, 15):
			self.assertEqual(histories[parent], 5000)
			self.assertEqual(
				{kind for kind, _, record in rows if record == parent}, {"task", "comment", "note", "call"}
			)
		self.assertEqual((histories[1], histories[2]), (50, 500))
		self.assertLess(max(histories), 10000)
		preflight = [deal_recipe(i, "preflight") for i in range(96)]
		self.assertEqual({row["actor"] for row in preflight}, set(ACTORS))
		self.assertEqual({row["stage"] for row in preflight}, {key for key, _, _ in STAGES})
		self.assertTrue(any(not row["owner"] for row in preflight))
		repair_parents = [repair_parent(i, "preflight") for i in range(SIZES["preflight"]["repairs"])]
		self.assertEqual(len(repair_parents), 6)
		self.assertEqual(
			{preflight[i]["stage"] for i in repair_parents},
			{"open", "ongoing", "hold", "won", "lost", "history"},
		)
		self.assertTrue(all(preflight[i]["actor"] == "counter" for i in repair_parents))
		self.assertEqual(len({label(self.site, "deal", i) for i in range(10000)}), 10000)

	def test_expected_scope_is_not_learned_from_endpoint(self):
		own, other_branch, private, unassigned = (deal_recipe(i, "preflight") for i in (0, 6, 11, 95))
		self.assertTrue(expected_visible("seller_00", own))
		self.assertFalse(expected_visible("seller_00", other_branch))
		self.assertFalse(expected_visible("manager_b", private))
		self.assertTrue(expected_visible("broad_manager", private))
		self.assertTrue(expected_visible("counter", unassigned))
		self.assertFalse(expected_visible("manager_a", unassigned))

	def test_guard_accepts_only_matching_fresh_disposable_config(self):
		self.assertEqual(provision_guard(self.receipt, self.sites), self.sites)
		mutations = [
			("site", "ventas.example.com"),
			("workers_disabled", False),
			("scheduler_disabled", False),
			("outbound_disabled", False),
			("created_at", (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()),
			("created_at", (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()),
		]
		for key, value in mutations:
			with self.subTest(key=key, value=value):
				changed = {**self.receipt, key: value}
				with self.assertRaises(ContractError):
					provision_guard(changed, self.sites)
		self.config["db_name"] = "some_other_database"
		self.write_config()
		with self.assertRaisesRegex(ContractError, "seed_config_database"):
			provision_guard(self.receipt, self.sites)

	def test_guard_refuses_changed_unlisted_source_and_remote_redis(self):
		source = Path(self.receipt["sources"]["crm"]["root"])
		(source / "unexpected.py").write_text("# added after provenance receipt\n")
		with self.assertRaisesRegex(ContractError, "seed_source_changed"):
			provision_guard(self.receipt, self.sites)
		changed = copy.deepcopy(self.receipt)
		changed["redis"]["redis_queue"] = "redis://production.example.com:6379"
		with self.assertRaisesRegex(ContractError, "seed_redis"):
			provision_guard(changed, self.sites)

	def test_journal_is_private_atomic_and_does_not_adopt_abandoned_temp(self):
		journal = self.root / "journal.json"
		atomic_json(journal, {"records": {"a": "native-id"}})
		self.assertEqual(journal.stat().st_mode & 0o777, 0o600)
		self.assertEqual(private_file(journal), journal)
		atomic_json(journal, {"records": {"a": "native-id", "b": "native-id-2"}})
		self.assertEqual(json.loads(journal.read_text())["records"]["b"], "native-id-2")
		journal.with_name("journal.json.new").write_text("interrupted")
		with self.assertRaises(FileExistsError):
			atomic_json(journal, {"records": {}})
		self.assertEqual(len(json.loads(journal.read_text())["records"]), 2)
		os.chmod(journal, 0o644)
		with self.assertRaisesRegex(ContractError, "seed_private_file"):
			private_file(journal)

	def test_resume_adopts_only_one_exact_native_identity_and_full_fields(self):
		# Crash after a DB commit but before the filesystem journal: one row
		# is recoverable. A vanished committed row or duplicate is not a retry.
		self.assertEqual(resume_name(None, ["native-1"]), "native-1")
		self.assertIsNone(resume_name(None, []))
		for recorded, matches in ((None, ["a", "b"]), ({"name": "a"}, []), ({"name": "a"}, ["b"])):
			with self.assertRaises(ContractError):
				resume_name(recorded, matches)
		fields = {"status": "Open", "probability": 0, "contacts": [{"contact": "contact-a"}]}
		verify_fields({**fields, "modified": "native timestamp"}, fields)
		with self.assertRaisesRegex(ContractError, "seed_record_drift"):
			verify_fields({**fields, "probability": 25}, fields)
		with self.assertRaisesRegex(ContractError, "seed_child_drift"):
			verify_fields({**fields, "contacts": []}, fields)

	def test_full_requires_complete_distinct_native_preflight_same_sources(self):
		proof = {
			"scale": "preflight",
			"site": "crm-perf-abcdef012345.localhost",
			"native_controllers": True,
			"sources_digest": checksum(self.receipt["sources"]),
			"counts": SIZES["preflight"],
			"scopes": {profile: {} for profile in PROFILES},
		}
		verify_preflight(proof, self.receipt)
		for key, value in (
			("site", self.site),
			("native_controllers", False),
			("counts", {"deals": 1}),
			("scopes", {}),
			("sources_digest", "f" * 64),
		):
			with self.subTest(key=key), self.assertRaises(ContractError):
				verify_preflight({**proof, key: value}, self.receipt)


if __name__ == "__main__":
	unittest.main()
