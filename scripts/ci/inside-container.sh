#!/usr/bin/env bash
set -euo pipefail
# This container has only disposable volumes, on an internal network.
rm -rf apps/crm/crm
cp -a /candidate/crm apps/crm/crm
bench set-config -g db_host database
bench set-config -g redis_cache redis://redis:6379/0
bench set-config -g redis_queue redis://redis:6379/1
bench set-config -g redis_socketio redis://redis:6379/2
bench new-site crm-integration.localhost --db-root-password integration-only --admin-password integration-only --no-mariadb-socket
for app in erpnext frappe_whatsapp crm doco scanner_kit posawesome taller; do
  bench --site crm-integration.localhost install-app "$app"
done
bench --site crm-integration.localhost set-config allow_tests true
bench --site crm-integration.localhost run-tests --app crm
