"""Run real authenticated read RPC bundles against a pre-attested disposable site."""

import argparse
import json
import os
import socket
import sys
import time
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from contract import (
	BUNDLES,
	ContractError,
	canonical,
	checksum,
	matches,
	read_json,
	require,
	validate_attestation,
	validate_bindings,
	validate_manifest,
)

MAX_BODY = 8_000_000


class NoRedirect(HTTPRedirectHandler):
	def redirect_request(self, req, fp, code, msg, headers, newurl):
		return None


class Client:
	def __init__(self, environment, actor):
		self.environment = environment
		self.actor = actor
		self.opener = build_opener(ProxyHandler({}), NoRedirect())
		self.headers = {"Content-Type": "application/json", "Host": environment["site"]}
		for field, header, prefix in (
			("session_env", "Cookie", "sid="),
			("csrf_env", "X-Frappe-CSRF-Token", ""),
		):
			value = os.environ.get(actor[field], "")
			require(
				bool(value)
				and len(value) <= 512
				and all(32 < ord(c) < 127 and c not in ";\r\n" for c in value),
				"missing_or_invalid_credentials",
			)
			self.headers[header] = prefix + value

	def call(self, method, params):
		# The sole extra method is a read-only authentication proof. No arbitrary
		# caller method, redirect, proxy or URL can redirect session credentials.
		require(
			method == "frappe.auth.get_logged_user" or any(method in bundle for bundle in BUNDLES.values()),
			"rpc_not_allowed",
		)
		request = Request(
			self.environment["base_url"].rstrip("/") + "/api/method/" + method,
			data=canonical(params),
			headers=self.headers,
			method="POST",
		)
		start = time.perf_counter()
		code, size, error, body = 0, 0, None, None
		try:
			with self.opener.open(request, timeout=self.environment["timeout_seconds"]) as response:
				code = response.status
				raw = response.read(MAX_BODY + 1)
				size = len(raw)
				if size > MAX_BODY:
					error = "response_limit"
				elif response.getheader("Content-Length") is not None and size != int(
					response.getheader("Content-Length")
				):
					# read(amount) may return a short body without IncompleteRead.
					# A syntactically valid partial JSON object is still interrupted.
					error = "transport_error"
				else:
					body = json.loads(raw)
					if not isinstance(body, dict) or "exc" in body or "exception" in body:
						error = "application_error"
		except HTTPError as exc:
			code, error = exc.code, "http_error"
			exc.close()
		except TimeoutError:
			error = "timeout"
		except URLError as exc:
			error = "timeout" if isinstance(exc.reason, TimeoutError | socket.timeout) else "transport_error"
		except HTTPException:
			error = "transport_error"
		except (ValueError, UnicodeError):
			error = "invalid_response"
		except OSError:
			error = "transport_error"
		return body, {
			"status": code,
			"elapsed_ms": (time.perf_counter() - start) * 1000,
			"bytes": size,
			"error": error,
		}

	def authenticate(self):
		body, result = self.call("frappe.auth.get_logged_user", {})
		result["matched"] = (
			not result["error"] and isinstance(body, dict) and body.get("message") == self.actor["user"]
		)
		return result


def execute(manifest, bindings, attestation, output):
	validate_manifest(manifest)
	validate_bindings(bindings, manifest)
	validate_attestation(attestation, manifest)
	output = Path(output)
	require(not output.exists() and not output.is_symlink(), "output_exists")
	output.mkdir(mode=0o700, parents=False)
	# Do not export bindings (actors, credentials, fixture parameters or expected
	# content). The manifest contains aliases and source/data checksums only.
	(output / "manifest.json").write_bytes(canonical(manifest) + b"\n")
	failed = False
	deadline = time.perf_counter() + manifest["environment"]["max_seconds"]
	with (output / "samples.ndjson").open("x") as evidence:

		def record(row):
			row["manifest_digest"] = checksum(manifest)
			evidence.write(canonical(row).decode() + "\n")
			evidence.flush()

		clients = {}
		for alias, actor in bindings["actors"].items():
			require(time.perf_counter() < deadline, "run_budget_exhausted")
			client = Client(manifest["environment"], actor)
			result = client.authenticate()
			record({"kind": "auth", "role": alias, **result})
			if result["matched"]:
				clients[alias] = client
			else:
				failed = True
		for alias, scenario in manifest["scenarios"].items():
			if scenario["role"] not in clients:
				continue  # Missing samples remain a validator failure, never fast zeros.
			client, cases = clients[scenario["role"]], bindings["scenarios"][alias]
			for phase, count in (("warmup", 5), ("warm", 100)):
				for index in range(count):
					require(time.perf_counter() < deadline, "run_budget_exhausted")
					case_index = index % len(cases)
					steps, started = [], time.perf_counter()
					for method, call in zip(BUNDLES[scenario["bundle"]], cases[case_index], strict=True):
						require(time.perf_counter() < deadline, "run_budget_exhausted")
						body, result = client.call(method, call["params"])
						result["matched"] = result["error"] is None and matches(body, call["checks"])
						steps.append(result)
					ok = all(step["matched"] for step in steps)
					failed |= not ok
					record(
						{
							"kind": "sample",
							"scenario": alias,
							"phase": phase,
							"index": index,
							"case_index": case_index,
							"elapsed_ms": (time.perf_counter() - started) * 1000,
							"ok": ok,
							"steps": steps,
						}
					)
	(output / "completion.json").write_bytes(
		canonical(
			{
				"manifest_digest": checksum(manifest),
				"complete": True,
				"http_errors": failed,
				"sql_coverage": False,
				"browser_coverage": False,
			}
		)
		+ b"\n"
	)
	return int(failed)


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	for name in ("manifest", "bindings", "attestation", "output"):
		parser.add_argument("--" + name, required=True)
	args = parser.parse_args()
	try:
		return execute(
			read_json(args.manifest), read_json(args.bindings), read_json(args.attestation), args.output
		)
	except (ContractError, ValueError, TypeError, KeyError, OSError):
		print("NOT_READY: configuration, environment or evidence validation failed", file=sys.stderr)
		return 2


if __name__ == "__main__":
	raise SystemExit(main())
