"""Actual local HTTP/SQL boundary behavior using synthetic unit fixtures only."""

import contextlib
import io
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

from contract import ContractError, checksum, matches
from run import Client, execute
from sql_probe import SQLProbe
from test_contract import fixture


class Handler(BaseHTTPRequestHandler):
	def log_message(self, *args):
		pass

	def do_POST(self):
		self.server.seen.append(
			(
				self.path,
				self.headers.get("Cookie"),
				self.headers.get("X-Frappe-CSRF-Token"),
				json.loads(self.rfile.read(int(self.headers["Content-Length"]))),
			)
		)
		status, body, redirect = self.server.reply
		self.send_response(status)
		if self.server.response_mode == "short_length":
			self.send_header("Content-Length", str(len(body) + 50))
		elif self.server.response_mode == "broken_chunk":
			self.send_header("Transfer-Encoding", "chunked")
		if redirect:
			self.send_header("Location", redirect)
		self.end_headers()
		if self.server.response_mode == "broken_chunk":
			self.wfile.write(b'20\r\n{"message":"private')
			self.close_connection = True
			return
		self.wfile.write(body)


class HTTPTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.server = HTTPServer(("127.0.0.1", 0), Handler)
		cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
		cls.thread.start()

	@classmethod
	def tearDownClass(cls):
		cls.server.shutdown()
		cls.server.server_close()
		cls.thread.join()

	def setUp(self):
		manifest, bindings, _ = fixture()
		self.server.seen = []
		self.server.response_mode = "normal"
		self.server.reply = (200, b'{"message":"seller@example.invalid"}', None)
		env = {**manifest["environment"], "base_url": f"http://127.0.0.1:{self.server.server_port}"}
		with patch.dict(
			os.environ,
			{"CRM_PERF_SELLER_SID": "unit-secret-session", "CRM_PERF_SELLER_CSRF": "unit-secret-csrf"},
		):
			self.client = Client(env, bindings["actors"]["seller"])

	def test_real_request_authenticates_declared_actor_and_preserves_credentials_only_on_wire(self):
		result = self.client.authenticate()
		self.assertTrue(result["matched"])
		self.assertEqual(
			self.server.seen[0],
			("/api/method/frappe.auth.get_logged_user", "sid=unit-secret-session", "unit-secret-csrf", {}),
		)
		self.assertNotIn("secret", json.dumps(result))
		self.server.reply = (200, b'{"message":"Administrator"}', None)
		self.assertFalse(self.client.authenticate()["matched"])

	def test_real_http_error_and_redirect_remain_errors_without_response_body_or_follow(self):
		for code in (403, 500, 302):
			self.server.seen.clear()
			self.server.reply = (
				code,
				b"secret-provider-token SELECT password",
				"/steal" if code == 302 else None,
			)
			body, result = self.client.call("frappe.client.get", {"doctype": "CRM Deal", "name": "fictional"})
			self.assertIsNone(body)
			self.assertEqual(result["status"], code)
			self.assertEqual(result["error"], "http_error")
			self.assertEqual(len(self.server.seen), 1)
			self.assertNotIn("secret", json.dumps(result))

	def test_creation_open_thread_and_arbitrary_method_rejected_before_network(self):
		for method in (
			"crm.api.conversation_threads.open_thread",
			"taller.repair.repair_orders.create_and_link_repair_order",
			"frappe.client.insert",
		):
			with self.assertRaises(ContractError):
				self.client.call(method, {})
		self.assertEqual(self.server.seen, [])

	def test_actual_truncated_content_length_and_chunked_body_are_timed_transport_failures(self):
		for mode in ("short_length", "broken_chunk"):
			with self.subTest(mode=mode):
				self.server.response_mode = mode
				body, result = self.client.call(
					"frappe.client.get", {"doctype": "CRM Deal", "name": "fictional"}
				)
				self.assertIsNone(body)
				self.assertEqual(result["status"], 200)
				self.assertEqual(result["error"], "transport_error")
				self.assertGreater(result["elapsed_ms"], 0)
				self.assertNotIn("private", json.dumps(result))

	def test_projection_denial_or_missing_field_cannot_be_empty_success(self):
		self.assertFalse(matches({"message": []}, [{"path": ["message", 0, "name"], "digest": "a" * 64}]))
		self.server.reply = (200, b'{"exception":"sensitive failure"}', None)
		_, result = self.client.call("frappe.client.get", {})
		self.assertEqual(result["error"], "application_error")
		self.assertNotIn("sensitive", json.dumps(result))

	def test_actual_runner_keeps_failed_actor_and_response_checks_in_private_evidence(self):
		manifest, bindings, attestation = fixture()
		manifest["environment"]["base_url"] = self.client.environment["base_url"]
		attestation["base_url"] = self.client.environment["base_url"]
		manifest["environment"]["attestation_digest"] = checksum(attestation)
		env = {}
		for actor in bindings["actors"].values():
			env[actor["session_env"]] = "unit-secret-session"
			env[actor["csrf_env"]] = "unit-secret-csrf"
		with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, env):
			output = Path(directory) / "evidence"
			self.assertEqual(execute(manifest, bindings, attestation, output), 1)
			rows = [json.loads(line) for line in (output / "samples.ndjson").read_text().splitlines()]
			auth = [row for row in rows if row["kind"] == "auth"]
			self.assertEqual(sum(row["matched"] for row in auth), 1)
			self.assertEqual(len(auth), 4)
			warm = [
				row for row in rows if row.get("scenario") == "seller_deal_detail" and row["phase"] == "warm"
			]
			self.assertEqual(len(warm), 100)
			self.assertTrue(all(not row["ok"] for row in warm))
			for file in output.iterdir():
				self.assertNotIn("unit-secret", file.read_text())
				self.assertNotIn("@example.invalid", file.read_text())
			with self.assertRaises(ContractError):
				execute(manifest, bindings, attestation, output)


class SQLTests(unittest.TestCase):
	def test_real_sql_executes_and_query_fingerprints_omit_literals_parameters_and_results(self):
		class DB:
			def __init__(self):
				self.connection = sqlite3.connect(":memory:")

			def sql(self, query, parameters=()):
				return self.connection.execute(query, parameters).fetchall()

		db = DB()
		self.addCleanup(db.connection.close)
		manifest, _, attestation = fixture()
		probe = SQLProbe(
			db,
			b"unit-key-never-production" * 2,
			manifest=manifest,
			attestation=attestation,
			current_site=manifest["environment"]["site"],
		)
		original = db.sql
		with contextlib.redirect_stdout(io.StringIO()) as output:
			self.assertEqual(
				probe.call(lambda: db.sql("SELECT ?", ("secret-customer",))), [("secret-customer",)]
			)
			self.assertEqual(probe.call(lambda: db.sql("SELECT 'secret-token'")), [("secret-token",)])
			self.assertEqual(probe.call(lambda: db.sql("SELECT 'another-token'")), [("another-token",)])
		self.assertEqual(db.sql, original)
		evidence = probe.evidence()
		self.assertEqual(evidence["queries"], 3)
		self.assertEqual(len(evidence["shape_counts"]), 1)
		self.assertEqual(output.getvalue(), "")
		for secret in ("SELECT", "secret", "another", "unit-key"):
			self.assertNotIn(secret, json.dumps(evidence))
		with self.assertRaises(sqlite3.OperationalError):
			probe.call(lambda: db.sql("SELECT missing FROM no_table"))
		self.assertEqual(db.sql, original)
		self.assertEqual(probe.evidence()["failed_queries"], 1)
		self.assertEqual(probe.evidence()["coverage"], "local_native_call_only")

	def test_native_probe_requires_same_attested_disposable_site(self):
		manifest, _, attestation = fixture()
		with self.assertRaises(ContractError):
			SQLProbe(
				None, b"a" * 32, manifest=manifest, attestation=attestation, current_site="live.example.com"
			)


if __name__ == "__main__":
	unittest.main()
