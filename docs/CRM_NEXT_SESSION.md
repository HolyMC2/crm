# Next session: Meta reliability and native CRM automation

Paste the following request into the next session. The source integration record is [CRM_INTEGRATION_HANDOFF_2026-09-09.md](CRM_INTEGRATION_HANDOFF_2026-09-09.md). Start from the shared branches listed there, not the retired audit worktrees.

```text
Continue the CRM/Meta hardening work from the merged shared sources in ~/muelle-host.

Read ~/muelle-host/AGENTS.md, relevant app instructions, and:
- crm/docs/CRM_INTEGRATION_HANDOFF_2026-09-09.md
- crm/docs/CRM_META_COVERAGE_AUDIT_2026-09-09.md
- crm/docs/CRM_COMPLETION_PLAN_2026-09-09.md
- crm/docs/CRM_POWERHOUSE_REQUIREMENTS.md
- clinica/docs/CRM_VERTICAL_INTEGRATION.md

Codex owns architecture, business logic, integration and final quality. Use Claude Fable for bounded implementation when available; if its account limit persists, record that and use available builders. Give each builder explicit file ownership. Escalate only consequential identity/consent, schema/rollback, external-effect or compatibility decisions. Preserve other sessions' work.

Implement in this priority order, completing a tested/reviewable slice before the next:

P0 / META-00: WhatsApp webhook authenticity. The last production audit found configured_secrets() == 0, so signature checking was skipped. Reverify current configuration read-only. Implement and test raw-body authentication and exact app/account routing: valid signatures accepted, missing/tampered signatures rejected before writes, foreign accounts denied. Prepare a concrete controlled configuration/rollout plan. Inventory the second app attached to the WABA; do not assume it is unwanted.

P1 / META-01 + ACQ-04: Durable inbound receipts and full-batch processing. Iterate every entry/change/message/status. Authenticate and validate account scope before receipt creation; uniquely deduplicate events; commit receipt before remote enrichment/action; retain recoverable failures. Remove transaction-wide commit/rollback from nested ingest helpers. Prove replay, reordered/duplicate batches, failed enrichment, restart and no loss of earlier transaction work.

P1 / META-02/03: Close actual acquisition gaps. App-level Page mention is already enabled, but Doco's Page omits mention. Build a capability/subscription manifest, then prepare a scoped repair preserving existing subscriptions. Prove allowed real-world event delivery separately from configuration. Fix Lead Ads replay, displayed toggles versus actual handlers, and form-specific contact purpose; a submitted phone number is not blanket all-channel marketing permission. Route eligible sources into the existing CRM Inquiry service; keep requester/referrer/additional buyer distinct. Keep manual capture working where Meta cannot expose content.

P1 / META-04 + AUTO-01: Durable human/bot ownership. Consume Messenger/Instagram handover and WhatsApp Business App echoes/coexistence where supported. Actual human takeover/reply invalidates queued bot actions. Historical replay must not trigger bots. No auto-enable during upgrades.

P2 / META-05 + AUTO-03/04: Correct receipt folding, monotonic statuses, account/template quality alerts and explicit Unknown outcomes. Complete native intent/outbox/occurrence identity, version-pinned flows and bounded actions before autonomous sending. Unknown must be reconciled, never blindly retried.

P2 / META-06: Implement advanced events only for a defined business workflow. Audit legacy user subscriptions and unused fields before cleanup. n8n and AI remain optional adapters; do not build another universal workflow engine.

Clínica can work in parallel on the merged read-only provider contract. Keep clinical content outside CRM/marketing. Coordinate shared API changes; Clínica owns patient/guardian/payer relationships, appointments and reminders. Do not merge people by phone/name. Dental stays demo-only and inpatient unavailable until separately proven.

Validation: use isolated checkouts and fictional lab fixtures with external transports blocked. Run relevant SQL/concurrency/permission and desktop/mobile tests. Any schema migration must use the guarded Muelle wrapper, retain full logs, and inspect orphan deletion. Inquiry rollback must retain its permission/controller bundle and consistent hooks across workers. Record exact commits, checks and unresolved gates; never treat enabled subscriptions as working features.

The current request authorizes implementation and local verification. Do not send customer messages, alter production subscriptions/configuration, push source, or deploy without authorization covering those effects. Prepare changes and evidence first. End each completed package with focused commits and fast-forward integration into the agreed shared branches, preserving unrelated edits.
```
