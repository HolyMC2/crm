# Customer conversation workspace — 2026-09-10

The CRM Inbox now opens one native customer conversation workspace. The optional previous linked-record workspace remains available and existing deal deep links retain their destination. The same account/thread/history/control/reply chain is available in the native Desk page `customer-conversations`.

The broker authorizes the exact current account, shop and source CRM document before exposing content. It excludes private staff assistant identities, unsupported/clinical source documents and unauthorized attachments. Opening a historical customer thread explicitly creates Human/Off control; it does not create or merge people, grant consent or start a bot. Core-only installations return an honest empty channel list.

Human ownership, requests, transfers, pause/close/reopen and finite target selection use the existing generation-checked control service. WhatsApp plain-text replies use the durable outbox. A lost response retains the same request ID, body and generation for reconciliation. Unknown sends have no resend/cancel actions. Actor changes clear local transcript/draft state; customer content is rendered as text.

## Verification

- Full frontend: **502 tests across 50 files passed**. [Raw output](p5-crm-frontend-tests.log).
- Production Vite build and PWA validation passed; 180 JavaScript/CSS assets precached. [Raw output](p5-crm-frontend-build.log). Existing bundle-size notices remain visible in the raw log.
- Focused broker: 15 actual eight-app SQL cases and 3 actual Frappe+CRM cases passed. Focused component/Desk contracts: 44 tests passed. SQL fixtures roll back and final external transports are denied.
- Chromium component smoke at 375px: no horizontal overflow, no image nodes from malicious message HTML, no console errors; two lost-response reconciliation calls retained one UUID; Unknown displayed zero mutation buttons.
- Actual authenticated Desk-page RPC browser proof and guarded Page migration are the next verification gate; component checks do not claim that deployment is complete.

No production deployment, customer message, remote push or subscription mutation occurred. This page consumes the core manual outbox and verified receipt/delivery packages. Native automation remains code-gated off until remaining producer enforcement is complete. Storefront chat still needs its dedicated visitor protocol; the inventory is in [STOREFRONT_WEBCHAT_SEAM.md](STOREFRONT_WEBCHAT_SEAM.md).

## Assembled-source and native Desk follow-up

Actual authenticated browser verification on both isolated sites is recorded in [DESK_BROWSER_ACCEPTANCE.md](DESK_BROWSER_ACCEPTANCE.md). Eight-app search/account/history/ownership/reply/lost-response replay/cancel/release and core-only empty capability passed. The saved Account Health continuation now consumes exact authorized provider/account options once; unavailable or malformed options never open a different account. Nine focused Desk tests and ESLint passed after this correction.

The preserved Doco auth-mail commit `81a7cc2` is now deliberately included in the overlay. **159 tests passed** across core ownership/outbox/thread/activity/delivery and Doco auth-mail/mailguard ([full output](p5-assembled-core-doco-tests.log)). These checks ran against committed CRM behavior before subsequent Webchat runtime edits.

New native Page migrations passed on both sites ([eight-app raw log](p5-workspace-meta-migrate.log), [core-only raw log](p5-workspace-core-migrate.log)); all non-progress output was inspected, no orphan DocType marker, zero Deleted DocTypes, Page registered FCRM/Yes, and all isolation holds preserved. Same-time Mercado Number Card/Dashboard Chart deletion is the explicit delete-and-recreate converge in `mercado/desk.py`; Escáner Workspace is the existing orphan-workspace cleanup. These are distinct from DocType preservation.
