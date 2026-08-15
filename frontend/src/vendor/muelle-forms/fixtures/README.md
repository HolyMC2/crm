# muelle-forms/1 conformance fixture pack — SOURCE OF TRUTH

Consumed by:
- `@muelle/form-core` tests (workspace, reads this dir directly or via `MUELLE_FORMS_FIXTURES`)
- `doco/forms/test_forms_core.py` (python parity: DSL semantics + canonical bytes)
- crm + storefront (vendored copies via `boat/scripts/sync-forms-contract.sh`; CI runs `--check` as the drift gate)

Packs (logic runner — vitest/pytest):
- `render/` — descriptor + draft docs → expected field state (pins DSL + resolution semantics on BOTH languages)
- `interaction/` — normalizer/formatter cases (phone, money, dates)
- `payload/` — draft → exact canonical bytes (pins serialization cross-language; regenerate with the builder ONLY when the contract intentionally changes, and say so in the commit)
- `compat/` — unknown keys/widgets must degrade, never throw

Browser pack (Playwright — a11y/theme/viewport) lives with each surface's e2e harness, not here; see 03-WIDGETS.

`descriptor.intake.json` is the shared toy descriptor (hash is a dummy — fixture descriptors are hand-authored, not compiler output).
