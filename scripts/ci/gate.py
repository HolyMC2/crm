"""Gate job verdict: one always-run required check per workflow (SHELL-D10, Shell SPEC §6.4 A6).

`python3 scripts/ci/gate.py <job>=<result>[:<needed>[:advisory]] ...`

<result> is the job's `needs.<job>.result` (success, failure, cancelled, skipped).
<needed> is true, false or empty. A job with no <needed> part, or with `true`, or with an empty one
(the changes job failed, so nothing is known), must be `success`. A job whose <needed> is `false`
was path-skipped and passes as `skipped` (or `success`). Everything else fails the gate.
An `advisory` job is reported but never fails the gate (the Shell APIs job until its image is
newer than the doco fixes its tests need; docs/CI.md).
"""

import sys


def verdict(specs):
	"""Returns (ok, lines)."""
	ok, lines = True, []
	if not specs:
		return False, ["no jobs given"]
	for spec in specs:
		job, _, rest = spec.partition("=")
		result, has_needed, needed = rest.partition(":")
		needed, _, mode = needed.partition(":")
		required = not has_needed or needed != "false"
		if required:
			good = result == "success"
			why = "required" if not has_needed or needed == "true" else "required (scope unknown)"
		else:
			good = result in ("skipped", "success")
			why = "not needed by this change"
		if mode == "advisory":
			mark, why = "ok  " if good else "warn", f"{why}; advisory, not gating"
		else:
			ok = ok and good
			mark = "ok  " if good else "FAIL"
		lines.append(f"{mark} {job}: {result or 'missing'} ({why})")
	return ok, lines


def main(argv):
	ok, lines = verdict(argv)
	print("\n".join(lines))
	return 0 if ok else 1


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
