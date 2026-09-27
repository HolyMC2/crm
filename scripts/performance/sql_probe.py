"""Count a real local native call, never remote HTTP. Not an application hook.

Use only in a single-thread disposable bench command, outside fixture test mode.
The framework Recorder records raw SQL/parameters; this narrower diagnostic
deliberately retains only keyed query-shape fingerprints and aggregate timings.
"""

import hashlib
import hmac
import re
import threading
import time

from contract import require, validate_attestation, validate_manifest

LITERALS = re.compile(r"'(?:''|\\.|[^'\\])*'|\"(?:\"\"|\\.|[^\"\\])*\"|\b\d+(?:\.\d+)?\b")
COMMENTS = re.compile(r"/\*.*?\*/|--[^\n]*|#[^\n]*", re.DOTALL)


class SQLProbe:
	def __init__(self, database, key, *, manifest, attestation, current_site):
		validate_manifest(manifest)
		validate_attestation(attestation, manifest)
		require(
			current_site == manifest["environment"]["site"] and isinstance(key, bytes) and len(key) >= 32,
			"sql_probe_not_configured",
		)
		require(threading.current_thread() is threading.main_thread(), "sql_probe_not_single_thread")
		self.database, self.key = database, key
		self.count, self.elapsed_ms, self.failures = 0, 0.0, 0
		self.shapes = {}

	def call(self, function, *args, **kwargs):
		original = self.database.sql
		had_local = "sql" in vars(self.database)
		local = vars(self.database).get("sql")

		def measured(query, *query_args, **query_kwargs):
			# Never stringify arbitrary objects or inspect query arguments/results.
			shape = "unknown"
			if isinstance(query, str):
				normalized = " ".join(LITERALS.sub("?", COMMENTS.sub("", query)).split()).lower()
				shape = hmac.new(self.key, normalized.encode(), hashlib.sha256).hexdigest()
			start = time.perf_counter()
			self.count += 1
			self.shapes[shape] = self.shapes.get(shape, 0) + 1
			try:
				return original(query, *query_args, **query_kwargs)
			except BaseException:
				self.failures += 1
				raise
			finally:
				self.elapsed_ms += (time.perf_counter() - start) * 1000

		self.database.sql = measured
		try:
			return function(*args, **kwargs)
		finally:
			if had_local:
				self.database.sql = local
			else:
				del self.database.sql

	def evidence(self):
		return {
			"coverage": "local_native_call_only",
			"queries": self.count,
			"sql_ms": self.elapsed_ms,
			"failed_queries": self.failures,
			"shape_counts": dict(self.shapes),
		}
