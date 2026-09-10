# Shared CRM/Meta/vertical source handoff

The verified feature work is committed and fast-forward integrated locally. Start subsequent work from these shared branches. [Paste-ready next-session request](CRM_NEXT_SESSION.md) orders the remaining Meta work by priority; [Meta audit](CRM_META_COVERAGE_AUDIT_2026-09-09.md), [completion plan](CRM_COMPLETION_PLAN_2026-09-09.md), and [requirements](CRM_POWERHOUSE_REQUIREMENTS.md) contain the full contracts.

## Shared bases

| Repository / active source path | Canonical branch | Feature commit(s) |
| --- | --- | --- |
| `/home/holymc2/muelle-host/crm` | `doco-dev` | `2594be96d` Forms/linked-record permissions; `42205b72b` native inquiries, standalone shell and optional workspaces. Subsequent docs commits contain this handoff/evidence. |
| `/home/holymc2/muelle-host/doco_marketing` | `master` | `586fb88` delivery hardening; `73c4ae0` social inquiry/health adapter; `202d8f1` audit evidence. Includes prior canonical insights and badge fixes. |
| `/home/holymc2/muelle-host/doco` | `develop` | `0e1534b` provider discovery, based on current `f9de945` develop history. |
| `/home/holymc2/muelle-host/clinica` | `main` | `e2d2190` read-only clinic workspace capabilities and wiring-contract link. |
| `/home/holymc2/muelle-host/taller` | `main` | `d7b3e100` read-only repair workspace capabilities. |

CRM and marketing canonical branches are checked out in pre-existing release-coordination worktrees. Their active `~/muelle-host` checkouts remain on the existing `fix/social-editorial-quality` branches, fast-forwarded to the integrated source. Those branches were not switched or removed because other sessions use the layout. Both canonical and active refs contain the feature commits. Inspect current refs before starting; use a new bounded worktree/branch from the canonical branch when concurrent work would overlap.

All integration operations used `git merge --ff-only`. No rebase, shared-history rewrite, remote push, force update or merge commit was introduced. [Fast-forward receipts](../coordination/integration-20260909/crm-fast-forward-record-20260909.json) record the source integration before the final CRM documentation commit.

## Validation

- Integrated marketing, including newer canonical insights/badge fixes: **281 tests passed**. [Log](../coordination/integration-20260909/crm-integration-marketing-tests-20260909.log).
- Doco + Clínica + Taller providers and CRM capability/permission boundaries: **26 tests passed**, read-only DB and no customer fixtures. [Log](../coordination/integration-20260909/crm-provider-integration-tests-20260909.log).
- Earlier unchanged CRM source acceptance: **57 core/Forms DB tests, 470 frontend tests, four real database-concurrency checks, full desktop/mobile browser journey and production build with 178 verified JS/CSS assets**. [Audit](../coordination/inquiries/FINAL_AUDIT.md). Marketing's earlier 201/46 suites are subsumed by the combined 281-test integration run; do not add them as independent coverage counts.
- Whitespace, source fingerprint and local link checks accompany the integration. The earlier migration/browser receipts remain historical evidence; they do not certify a production deployment or the whole vertical matrix.

## Clínica and other session boundaries

Clínica can build on the shared Doco discovery contract and its `clinica:clinic` contribution. The integration currently exposes permission-safe workspace/release state only. `context`/`execute`, health provisioning, verified patient/guardian/payer links and agenda writes remain next work. Keep clinical data in Clínica; do not infer identity or consent from phone matches. Dental stays demo-only; inpatient unavailable.

Other sessions' active edits were preserved byte-for-byte, including modes/deletions: **14 Doco paths** for AliExpress/media and **185 Taller paths** for attachments/generated assets. These remain intentionally dirty and were not staged, committed, stashed or deleted. [Preservation proof](../coordination/integration-20260909/unrelated-work-preserved.json). Later concurrent edits may change those counts; they are not cleanup targets.

The five task-owned build worktrees (`crm-standalone`, `marketing-bots`, `doco-crm`, `clinica-crm`, `taller-crm`, dated 20260909) are retired after their commits/evidence reach the shared branches. Their task-only branches may be deleted once Git confirms they are merged. Pre-existing release, canonical and other sessions' worktrees stay intact. Historical logs/scripts retain their original staging paths; restage/adapt them deliberately rather than assuming retired directories exist.

## Operational state and next priorities

This is source integration, not a production release. No remote was pushed, Meta subscription/configuration changed, customer message sent, production deployment performed or new migration run during integration. Local Python sources are bind-mounted, so source availability does not prove every running process/cache or built asset is refreshed.

Only the dedicated `crm-inquiry-test-20260909.lab.xoloitzcuintles.com` site received the new inquiry schema in the prior acceptance run. It remains in maintenance with its scheduler paused and email muted; temporary browser servers/password file were removed. Other sites need the matching guarded migration and coordinated cache/asset/process verification before advertising the inquiry UI. Rollback must retain the inquiry permission/controller bundle or restore a compatible unavailable site; old hooks with new inquiry role metadata are unsafe.

Next session order: **META-00 authenticity → META-01 durable/full-batch ingest → META-02/03 real acquisition coverage → META-04 human ownership → META-05 delivery/account health → META-06 justified advanced subscriptions**. The observed WhatsApp signature gap is first. Reverify production facts read-only and prepare tested changes before any separately authorized production rollout. Fable hit its account limit in the acquisition wave; use it when available and retain Codex ownership of integration/quality.
