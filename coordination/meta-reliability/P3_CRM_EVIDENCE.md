# P3 native Inquiry source evidence

The optional provider adapter can capture immutable account-scoped source evidence
through the internal `capture_source_inquiry(..., capture_context=...)` service.
Generic RPC cannot supply or replace this evidence. CRM still runs without the
marketing app installed. Manual captures and existing contextless receipts keep
their original identity and replay behavior.

Evidence binds the provider/account/source and original form respondent. A source
replay preserves the first policy snapshot; a changed account or a contextless
legacy receipt requires an explicit mapping review. Public social authors remain
referrers. A form capture starts with exactly its original requester. Adding people
does not transfer the original form purpose. No Lead, consent grant or outbound
message is created by source capture.

The native detail API projects finite `source_evidence` for authorized readers.
Raw receipt identifiers, hashes and capture actors remain restricted. Generic
document responses respect the evidence field's read level; generic writes cannot
forge evidence, and ordinary staff triage preserves the snapshot.

## Verification, 2026-09-10 UTC

- Additive schema commit `48087ed5e` was fast-forwarded locally before migration.
- Target: `crm-inquiry-test-20260909.lab.xoloitzcuintles.com`, installed apps exactly
  Frappe 16.31.0 and CRM. The marketing app is absent.
- Guarded `muelle/scripts/migrate.sh` succeeded, 2 mapped apps, 0 orphan DocTypes.
  Full original migration output is retained in `p3-crm-migration.log`.
- Inspected all non-progress migration output: `after_migrate` reached, no traceback
  or `Orphaned DocType(s) found:` marker. Database Deleted Document rows for DocType:
  0. Maintenance, pause_scheduler and mute_emails remained 1; scheduler disabled.
- `crm.tests.test_inquiries`: **42 SQL-backed tests passed**, including exact
  snapshots, added-person isolation, account mismatch, legacy collision, generic
  forgery, permissions, cross-actor replay and unique-index race recovery preserving
  earlier transaction work. Output: `p3-crm-regressions.log`.
- The existing isolated runner blocked Requests and SMTP, mocked DB commit, and
  rolled back fixtures. These tests do not prove production/provider delivery.
- Source Python compilation and source/config/Markdown whitespace checks passed.
  Raw migration logs retain their exact original terminal frames and blank lines.

Frontend and full provider-to-CRM pipeline acceptance are tracked separately. No
production mutation, provider subscription change, customer send or remote push
was performed for this slice.
