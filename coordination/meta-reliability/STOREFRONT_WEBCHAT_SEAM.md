# Storefront customer chat integration seam

Read-only inventory, 2026-09-10 UTC. Storefront checkout: `main` at `c6a4f80`,
clean. No storefront/backend edits, builds, deployments or external calls made.
Follows [the agreed chat surfaces](../../docs/CRM_CHAT_SURFACES_2026-09-10.md).

## Existing entry points and boundaries

| Responsibility | Existing file / verified behavior |
| --- | --- |
| Single floating entry | `src/layouts/Base.astro:268` renders the `.wa-fab` anchor; `branding.whatsapp_fab` controls visibility. It currently opens `wa.me`, with `/contacto` fallback. |
| Mobile space | `src/styles/sections.css:245` and `:324`: FAB above `--botnav-h` + safe area, hidden on mobile PDP where the buy bar owns that space. Old `.mobile-cta` markup is CSS-hidden. `BottomNav.vue`/`MoreSheet.vue` also offer contextual WhatsApp links. |
| Reusable panel behavior | `src/composables/useModalDialog.ts`: focus trap, Escape, focus restoration, shared scroll lock, cleanup on `astro:before-swap`. `BottomNav.vue` demonstrates `transition:persist` + `astro:page-load`. |
| Styling / channel fallback | `src/lib/theme.ts`, external `/theme.css`, CSS variables `--brand`, `--font-ui`, `--rc`, `--rb`; `WhatsAppCTA.vue`, `WaButton.astro`, `waTarget()` already implement the WhatsApp/contact choice. |
| Tenant routing | `src/middleware.ts` resolves normalized Host using `src/lib/manifest.ts`; `locals.tenant` carries `site`, server-only `cellBaseUrl`, exact `profile`, entitlement and branding. Boat's manifest validates the host. `locals.publicOrigin` comes from `lib/origin.ts`. |
| BFF transport | `src/lib/cellcall.ts`: finite timeout, honest 502/504, no browser stack/raw response leakage. `src/pages/api/lead.ts` demonstrates server-injected profile and bounded fields. Cell calls are **guest calls**, without a Frappe staff credential. `STOREFRONT_SECRET` authenticates the Boat manifest call only. |
| Existing authenticated customer | `src/lib/account.ts` uses `sf_session`, HttpOnly/Secure/SameSite=Lax/host-only, cell-validated on every account call. This is an OTP customer session, gated to shop entitlement; it is not an anonymous chat identity. |
| Cache / network | `lib/cachepolicy.ts` defaults unknown API paths to private no-store; middleware prevents cookie-setting responses from becoming public. `src/pages/sw.js.ts:62` bypasses all `/api/` traffic. CSP `connect-src 'self'` already fits a same-origin chat BFF. |

There is **no authenticated anonymous visitor session** to reuse. `muelle_vid`
(`lib/experiment.ts`) and `muelle_sid` (`lib/track.ts`) are client-writable,
consent-gated analytics identifiers; neither can authorize a transcript. The
Storefront Profile has `enabled`, `company`, `landing_whatsapp` and commerce
settings, but no native conversation account, chat enable flag or exact WhatsApp
phone-ID mapping. A displayed phone number is not channel identity.

There is no application JSON CSRF helper. Installed Astro has `checkOrigin=true`
by default, but `node_modules/astro/dist/core/app/origin-check.js` checks form-like
content types, not JSON. New cookie-authenticated chat writes therefore need an
explicit Origin/CSRF rule against the resolved public origin. Reuse the existing
host/IP `API_LIMITS` and `lib/ratelimit.ts`; add session/account bounds cell-side.
The deliberate dev-cell override maps all hosts to one tenant: it is unsuitable
as evidence of production host isolation.

## Minimum file plan, after root defines the Webchat contract

1. Add `src/lib/customerChat.ts` for server-only visitor cookie/capability handling,
   exact profile injection, explicit Origin/CSRF validation and bounded JSON input.
   Use `cellcall.ts` transport budgets, never its public catalog cache. Create an
   opaque cell-issued visitor capability only when help is opened; keep it out of
   SSR HTML, JavaScript storage, URLs and analytics. Optional OTP account association
   requires explicit verified authorization, with no phone/name/person merge.
2. Add fixed BFF routes `src/pages/api/chat/session.ts` and
   `src/pages/api/chat/messages.ts` for bootstrap/resume, paginated own history and
   idempotent customer messages. Target methods are finite and root-owned; browser
   input cannot select a tenant, profile, staff actor or arbitrary conversation.
   Register these paths in `src/middleware.ts` rate limits. Default disabled on
   missing cell capability; do not reuse the shop-only accounts gate for landing help.
3. Add `src/components/CustomerChat.vue` and
   `src/composables/useCustomerChat.ts`. Replace the existing FAB in `Base.astro`
   when native chat is enabled; retain its existing WhatsApp/contact fallback when
   unavailable. One island owns launcher + panel, with WhatsApp offered inside it.
   Reuse the modal helper and bottom-space tokens; preserve PDP/checkout controls,
   keyboard focus, soft navigation and frozen message IDs after response loss.
   Add only the necessary public capability type in `src/lib/types.ts` and styles
   in `src/styles/sections.css`; never serialize internal account credentials.
4. Tests: `tests/api/chat.test.ts` using `tests/api/helpers.ts`,
   `tests/component/customerchat.test.ts`, and `tests/e2e/customerchat*.spec.ts`
   using the existing fixture cell. Prove host/profile/session isolation, forged
   conversation denial, CSRF/limits/no-store, response-loss dedup, reconnect,
   private/clinical exclusion, and one launcher with mobile keyboard/buy-bar/CSP.
   Commands: `npm test`, `npm run check`, `npm run build`, focused Playwright with
   unique `E2E_PORT`/`E2E_CELL_PORT` so another checkout's server is never reused.

The backend gap is explicit: core CRM currently accepts only WhatsApp, Messenger
and Instagram numeric identities. Root must add the finite Webchat account/visitor
adapter and customer-only broker over the existing Conversation/Control Event/
Outbound Intent model. Public visitors never call the staff thread broker or Doco
assistant APIs; no Asistente Canal, Books Assistant Chat/Books Chat Log, staff notes,
clinical documents, Chatwoot dependency or new workflow engine belongs in this lane.

## Concurrent work

No clinic-specific storefront source or tracked dirty files were found. Registered
brand/category sibling checkouts contain only untracked `.local/` and `node_modules`
at inspection; their source changes are already ancestors of current main. The
style-kits checkout is clean, also with no source diff ahead of main. `Base.astro`,
`middleware.ts`, `types.ts`, theme and mobile CSS remain shared, recently edited
integration points: recheck their current versions before a future patch. This
inventory makes no claim about unrelated clinical work in other repositories.
