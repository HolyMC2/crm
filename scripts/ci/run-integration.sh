#!/usr/bin/env bash
# Never accepts an existing site/bench: all test state belongs to this project.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${CRM_CI_IMAGE:?Set CRM_CI_IMAGE to a trusted multi-app Muelle image}"
project="crm-ci-${GITHUB_RUN_ID:-local}-$$"
compose=(docker compose -p "$project" -f scripts/ci/integration-compose.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans; }
trap cleanup EXIT
"${compose[@]}" run --rm tests
