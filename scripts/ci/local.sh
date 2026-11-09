#!/usr/bin/env bash
# crm's CI on this workstation: the jobs of the GitHub workflows, on a clean clone of HEAD.
# devflow's land gate for crm runs it (repos.toml [repos.crm] ci_local); docs/CI.md «Local gate».
#
#   scripts/ci/local.sh [--fast | --native]
#
#   (default)  fast tier, then the native tier when changed_scope.py says the change needs it
#   --fast     fast tier only
#   --native   fast tier, then every native job whatever the scope says
#
# Fast tier, ~4 min: the Changed scope classification, the native runner self-tests, Undefined names
# (ruff), Frontend (yarn install --frozen-lockfile, ESLint, Oxlint, Production Build with its verify
# scripts, Unit Tests & Coverage), Pre-commit Checks (--all-files) and Semgrep Rules (diff-aware
# against the base).
# Native tier, ~30 min, its jobs side by side, each on its own disposable Docker stack through
# scripts/ci/run-integration.sh: Tests (fresh install, CRM_CI_IMAGE), Upgrade base -> candidate
# (CRM_CI_IMAGE) and Shell APIs (SHELL_CI_IMAGE, only when the scope names shell modules).
#
# The base is $DEVFLOW_CI_BASE (devflow sets it to the merge base with doco-dev), else the merge
# base with origin/doco-dev. Committed code only: uncommitted changes are not in the clone.
# Logs stay in .ci-local/<sha>-<pid>/ (gitignored); the clones are removed when the run ends.
set -uo pipefail

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
want=auto
case "${1:-}" in
	"") ;;
	--fast) want=never ;;
	--native) want=always ;;
	*) usage ;;
esac

repo=$(git rev-parse --show-toplevel) || exit 2
cd "$repo"
sha=$(git rev-parse HEAD)
base=${DEVFLOW_CI_BASE:-$(git merge-base origin/doco-dev HEAD)} || { echo "local ci: no merge base with origin/doco-dev" >&2; exit 2; }
base=$(git rev-parse --verify "$base^{commit}") || exit 2
common=$(git rev-parse --path-format=absolute --git-common-dir)
tools=${DEVFLOW_TOOLS:-$HOME/.local/share/devflow}
# The value of the repository variable CRM_CI_IMAGE that server-tests.yml and migration-test.yml
# read: the image the migration contract audited (docs/CI.md «Audited migration metadata»).
crm_image=${CRM_CI_IMAGE:-ghcr.io/holymc2/doco-bench@sha256:6ae759948de11c60f9950d2d3c8aef40026309d915e1fc63d8ae181e9d00f675}
# Pins come from the commit under test, not the working tree.
shell_image=$(git show "$sha:.github/workflows/server-tests.yml" | sed -n 's/^ *SHELL_CI_IMAGE: *\(ghcr\.io[^ ]*\).*/\1/p' | head -1)
companion_sha=$(git show "$sha:.github/actions/setup-native-environment/action.yml" |
	sed -n '/repository: HolyMC2\/frappe_whatsapp/{n;s/^ *ref: *\([0-9a-f]\{40\}\).*/\1/p}' | head -1)
ruff_pin=$(git show "$sha:.github/workflows/server-tests.yml" | grep -o 'ruff==[0-9.]*' | head -1)
for v in shell_image companion_sha ruff_pin; do
	[ -n "${!v}" ] || { echo "local ci: could not read $v from the workflow files; the script and the workflows drifted apart" >&2; exit 2; }
done

work="$repo/.ci-local"
run="$work/${sha:0:12}-$$"
logs="$run/logs"
mkdir -p "$logs"
find "$work" -mindepth 1 -maxdepth 1 -type d -mtime +2 -exec rm -rf {} + 2>/dev/null
failed=()
native_pids=()

cleanup() {
	trap - EXIT INT TERM
	# Each native job's run-integration.sh takes its Docker stack down on the way out.
	[ "${#native_pids[@]}" -gt 0 ] && kill -TERM "${native_pids[@]}" 2>/dev/null
	wait 2>/dev/null
	rm -rf "$run/trees" "$run"/venv.*
}
trap cleanup EXIT
trap 'exit 143' INT TERM

clone() {  # clone <dir> <rev>: a checkout of rev sharing this repo's objects
	git clone --quiet --shared --no-checkout "$common" "$1" && git -C "$1" checkout --quiet --detach "$2"
}

show_failure() {  # show_failure <log>
	echo "  --- last lines of $1"
	sed 's/\x1b\[[0-9;]*m//g' "$1" | tail -n 60 | sed 's/^/  | /'
}

step() {  # step <name> <command...>: run in the fast tree, log to logs/<name>.log
	local name=$1 t0=$SECONDS rc
	shift
	(cd "$fast" && "$@") > "$logs/$name.log" 2>&1
	rc=$?
	if [ "$rc" -eq 0 ]; then
		printf '  ok    %-20s %4ss\n' "$name" "$((SECONDS - t0))"
	else
		printf '  FAIL  %-20s %4ss rc=%s\n' "$name" "$((SECONDS - t0))" "$rc"
		show_failure "$logs/$name.log"
		failed+=("$name")
	fi
	return "$rc"
}

ci_step() {  # ci_step <workflow> <step name> [packages...]: the step's run script, via devflow's ci_step.py
	# A plain venv with the packages the job installs: ruff's `python -m ruff` cannot find its binary
	# in uv run's layered environment.
	local workflow=$1 name=$2 venv
	shift 2
	venv=$(mktemp -d "$run/venv.XXXXXX") || return 2
	uv venv --quiet --python 3.14 "$venv" && uv pip install --quiet --python "$venv/bin/python" pyyaml "$@" || return 2
	PATH="$venv/bin:$PATH" VIRTUAL_ENV="$venv" PYTHONDONTWRITEBYTECODE=1 \
		"$venv/bin/python" "$tools/ci_step.py" ".github/workflows/$workflow" "$name"
}

echo "local ci: crm ${sha:0:12} against base ${base:0:12} (logs $logs)"
fast="$run/trees/fast"
clone "$fast" "$sha" || exit 2

# Changed scope (server-tests.yml and migration-test.yml, job `changes`)
step changed-scope python3 scripts/ci/changed_scope.py --base "$base" --github-output "$run/scope.out"
server=$(sed -n 's/^server=//p' "$run/scope.out" 2>/dev/null)
shell=$(sed -n 's/^shell=//p' "$run/scope.out" 2>/dev/null)
modules=$(sed -n 's/^modules=//p' "$run/scope.out" 2>/dev/null)
echo "  scope: $(sed -n 's/^reason=//p' "$run/scope.out" 2>/dev/null)"

# setup-native-environment's first step: the native runner's own tests
step ci-selftest python3 -m unittest discover -s scripts/ci -p 'test_*.py'
# server-tests.yml «Undefined names (ruff)»
step undefined-names ci_step server-tests.yml "Check for undefined names" "$ruff_pin"
# frontend-tests.yml: Lint, Production Build; linters.yml installs the same dependencies for pre-commit
step yarn-install ci_step frontend-tests.yml "Install dependencies"
# linters.yml «Pre-commit Checks»: pre-commit/action runs every hook on every file. Before the build,
# which rewrites frontend/auto-imports.d.ts.
step pre-commit uvx --quiet --from pre-commit==4.3.0 pre-commit run --show-diff-on-failure --color=never --all-files
step eslint ci_step frontend-tests.yml "ESLint"
step oxlint ci_step frontend-tests.yml "Oxlint"
step build ci_step frontend-tests.yml "Build frontend"
# frontend-tests.yml «Unit Tests & Coverage», .github/actions/frontend-tests «Run tests (with coverage)»
step unit-tests bash -c 'cd frontend && yarn test:coverage'
# linters.yml «Semgrep Rules»; a dispatch's base is the merge base, as here
semgrep_run() { SEMGREP_BASELINE_REF="$base" ci_step linters.yml "Run Semgrep rules" semgrep; }
step semgrep-rules ci_step linters.yml "Download Semgrep rules"
step semgrep semgrep_run
rm -rf "$fast"

if [ "${#failed[@]}" -gt 0 ]; then
	echo "local ci: RED, ${#failed[@]} fast check(s) failed: ${failed[*]} (the native tier did not run)"
	exit 1
fi

case "$want" in
	never) server=false; shell=false ;;
	always) server=true; shell=true ;;
esac
if [ "$server" != true ] && [ "$shell" != true ]; then
	echo "local ci: green (fast tier; the change needs no native job)"
	exit 0
fi

# The native tier: setup-native-environment's image and companion, then run-integration.sh per job.
for image in "$crm_image" "$shell_image"; do
	docker image inspect "$image" >/dev/null 2>&1 || docker pull -q "$image" >/dev/null || {
		echo "local ci: cannot pull $image (docker login ghcr.io with a read:packages token)" >&2; exit 1; }
done
companion_src=${CRM_CI_COMPANION_SRC:-$HOME/muelle-host/frappe_whatsapp}
git -C "$companion_src" cat-file -e "$companion_sha^{commit}" 2>/dev/null \
	|| companion_src=https://github.com/HolyMC2/frappe_whatsapp.git

declare -A job_name job_start
native() {  # native <job> <image> <mode> [modules]: a clean tree, then CI's runner in it, in the background
	local job=$1 image=$2 mode=$3 mods=${4:-} tree="$run/trees/$1"
	{
		clone "$tree" "$sha" &&
			git clone --quiet --no-checkout "$companion_src" "$tree/.ci-companions/frappe_whatsapp" &&
			git -C "$tree/.ci-companions/frappe_whatsapp" checkout --quiet --detach "$companion_sha" &&
			if [ "$mode" = migration ]; then clone "$tree/.ci-base/crm" "$base"; fi &&
			cd "$tree" &&
			CRM_CI_IMAGE=$image CRM_CI_MODE=$mode CRM_CI_MODULES=$mods GITHUB_RUN_ID="local-$job" \
				exec scripts/ci/run-integration.sh
	} > "$logs/$job.log" 2>&1 &
	native_pids+=($!)
	job_name[$!]=$job
	job_start[$!]=$SECONDS
}

if [ "$server" = true ]; then
	native tests "$crm_image" tests                 # server-tests.yml «Tests (supported Frappe 16 image)»
	native migration "$crm_image" migration         # migration-test.yml «Upgrade base branch -> PR»
fi
if [ "$shell" = true ]; then
	native shell-apis "$shell_image" shell "$modules"   # server-tests.yml «Shell APIs (ERPNext + doco image)»
fi
echo "  native: ${#native_pids[@]} job(s) side by side: ${job_name[*]}"
left=("${native_pids[@]}")
while [ "${#left[@]}" -gt 0 ]; do
	wait -n -p pid "${left[@]}"
	rc=$?
	mapfile -t left < <(printf '%s\n' "${left[@]}" | grep -vx "$pid")
	job=${job_name[$pid]}
	log="$logs/$job.log"
	summary=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | awk '
		/^Ran [0-9]+ tests? in/ { tests += $2; runs++ }
		/^FAILED/ { failed++ }
		END { if (runs) printf "%d tests in %d run(s)%s", tests, runs, failed ? ", " failed " FAILED" : "" }')
	if [ "$rc" -eq 0 ]; then
		printf '  ok    %-20s %4ss %s\n' "$job" "$((SECONDS - job_start[$pid]))" "$summary"
	else
		printf '  FAIL  %-20s %4ss rc=%s %s\n' "$job" "$((SECONDS - job_start[$pid]))" "$rc" "$summary"
		sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -E '^(FAIL|ERROR): ' | sort -u | head -n 40 | sed 's/^/  | /'
		show_failure "$log"
		failed+=("$job")
	fi
done
native_pids=()

if [ "${#failed[@]}" -gt 0 ]; then
	echo "local ci: RED, native job(s) failed: ${failed[*]}"
	exit 1
fi
echo "local ci: green (fast tier and native jobs)"
