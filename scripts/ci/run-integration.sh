#!/usr/bin/env bash
# Never accepts an existing site/bench: all test state belongs to this project.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${CRM_CI_IMAGE:?Set CRM_CI_IMAGE to a trusted multi-app Muelle image}"
[[ "$CRM_CI_IMAGE" =~ ^ghcr.io/holymc2/doco-bench@sha256:[a-f0-9]{64}$ ]]
export CRM_CI_RESULTS_DIR="$PWD/.ci-results"
mkdir -p "$CRM_CI_RESULTS_DIR"
# Container UID can differ from the runner. Only synthetic CI artifacts go here.
chmod 0777 "$CRM_CI_RESULTS_DIR"
git rev-parse HEAD > "$CRM_CI_RESULTS_DIR/candidate-sha.txt"
if [ "${CRM_CI_MODE:-tests}" = migration ]; then
  git -C .ci-base/crm rev-parse HEAD > "$CRM_CI_RESULTS_DIR/base-sha.txt"
  ! cmp -s "$CRM_CI_RESULTS_DIR/candidate-sha.txt" "$CRM_CI_RESULTS_DIR/base-sha.txt"
fi
project="crm-ci-${GITHUB_RUN_ID:-local}-$$"
compose=(docker compose -p "$project" -f scripts/ci/integration-compose.yml)
cleanup() {
  task_rc=$?
  trap - EXIT
  if ! "${compose[@]}" down --volumes --remove-orphans; then
    task_rc=1
  fi
  exit "$task_rc"
}
trap cleanup EXIT
"${compose[@]}" run --rm tests 2>&1 | tee "$CRM_CI_RESULTS_DIR/native.log"
