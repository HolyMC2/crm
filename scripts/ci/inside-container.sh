#!/usr/bin/env bash
set -euo pipefail
# This container has only disposable volumes, on an internal network.
site=crm-integration.localhost
mode="${CRM_CI_MODE:-tests}"
case "$mode" in
  tests) source_root=/candidate ;;
  migration) source_root=/candidate/.ci-base/crm ;;
  *) echo "Unknown CRM CI mode: $mode" >&2; exit 2 ;;
esac

copy_crm() {
  test -f "$1/pyproject.toml" && test -f "$1/crm/hooks.py"
  env/bin/python /candidate/scripts/ci/check-environment.py "$1/pyproject.toml"
  rm -rf apps/crm/crm
  cp -a "$1/crm" apps/crm/crm
  cp "$1/pyproject.toml" apps/crm/pyproject.toml
}
copy_crm "$source_root"
# Companion apps are checked out at pinned commits by the shared workflow action.
shopt -s nullglob
for companion in /candidate/.ci-companions/*/; do
  app="$(basename "$companion")"
  test -d "apps/$app/$app" && test -d "$companion$app"
  rm -rf "apps/$app/$app"
  cp -a "$companion$app" "apps/$app/$app"
  echo "companion overlay: $app"
done
shopt -u nullglob
bench set-config -g db_host database
bench set-config -g redis_cache redis://redis:6379/0
bench set-config -g redis_queue redis://redis:6379/1
bench set-config -g redis_socketio redis://redis:6379/2
bench new-site "$site" --db-root-password integration-only --admin-password integration-only --no-mariadb-socket
bench --site "$site" set-config mute_emails true
for app in payments erpnext frappe_whatsapp crm doco scanner_kit posawesome doco_meta_catalog doco_marketing taller; do
  bench --site "$site" install-app "$app"
done
# CRM's fixture records are USD; no live FX service belongs in native CI.
bench --site "$site" execute frappe.db.set_single_value --args '["FCRM Settings", "currency", "USD"]'
bench --site "$site" execute frappe.defaults.set_global_default --args '["currency", "USD"]'

if [ "$mode" = migration ]; then
  # The helper exists only in the disposable app copy, never in shipped CRM.
  cp /candidate/scripts/ci/migration-probe.py apps/crm/crm/_ci_migration.py
  bench --site "$site" execute crm._ci_migration.seed
  cp "sites/$site/private/crm-ci-migration.json" /results/migration-baseline.json
  copy_crm /candidate
  cp /candidate/scripts/ci/migration-probe.py apps/crm/crm/_ci_migration.py
  bench --site "$site" execute crm._ci_migration.guard
  bench --site "$site" migrate 2>&1 | tee /results/migrate.log
  bench --site "$site" execute crm._ci_migration.verify
  rm apps/crm/crm/_ci_migration.py
fi

bench --site "$site" set-config allow_tests true
if [ "${CRM_CI_COVERAGE:-false}" = true ]; then
  env/bin/python -m pip install --no-index --no-deps --require-hashes \
    --find-links /candidate/.ci-tools -r /candidate/scripts/ci/coverage-requirements.txt
  bench --site "$site" run-tests --app crm --coverage
  test -s sites/coverage.xml
  cp sites/coverage.xml /results/coverage.xml
else
  bench --site "$site" run-tests --app crm
fi
