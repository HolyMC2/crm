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
bench --site crm-integration.localhost set-config mute_emails true
for app in payments erpnext frappe_whatsapp crm doco scanner_kit posawesome doco_meta_catalog doco_marketing taller; do
  bench --site crm-integration.localhost install-app "$app"
done
bench --site crm-integration.localhost set-config allow_tests true
# CRM's fixture records are USD; no live FX service belongs in native CI.
bench --site crm-integration.localhost execute frappe.db.set_single_value --args '["FCRM Settings", "currency", "USD"]'
bench --site crm-integration.localhost execute frappe.defaults.set_global_default --args '["currency", "USD"]'
bench --site crm-integration.localhost run-tests --app crm
