# Offer share link: online, tokenized customer view of a CRM Offer

Status: spec, lane `offer-share-link-20261005` (2026-10-05).
Reference: Odoo's `/my/orders/<id>?access_token=<uuid>` quotation page (amount header, validity banner,
lines, totals, terms, "print", contact card, communication history, accept/sign).

## Goal

A seller issues a CRM Offer and sends the customer a link. The customer opens it without logging in,
reads exactly the issued terms, and can **accept**, **reject** or **send a message**. The seller sees
"viewed", the decision and the messages on the deal, and the next action (create the ERP quotation,
revise, follow up) is obvious in the CRM SPA. No Desk hand-off.

The page renders the CRM Offer, not the ERPNext Quotation: the offer is CRM's owning record, has the
Draft → Issued → Accepted/Rejected/Expired lifecycle and an immutable `issued_snapshot`. ERP stays
optional (`crm/offers/service.py` must keep working without erpnext installed).

## Behaviour

### Link lifecycle
- A link exists only for an offer whose status is **Issued** (or later, for read-only display).
- Seller action "Compartir enlace / Share link" on an issued offer (OfferWorkspace.vue) creates the
  token if missing and returns the URL; copy-to-clipboard plus send via the existing guarded document
  send bridge if one fits (see commit 50b1198b4 "document sends through the guarded outbox bridge");
  otherwise copy + `wa.me`/`mailto` prefill is acceptable.
- "Revocar enlace / Revoke link" rotates the token (old URL → generic not-found page).
- Token: ≥ 32 bytes from `secrets`, URL-safe. Store **sha256(token)** in an indexed field for lookup and
  the token itself in a Password field so the seller can copy it again. Never log the token.
  Lookup with constant-time compare of the hash. Unknown/garbage token → the same generic 404 page,
  never a traceback, never a hint whether the offer exists.
- One token per revision. When the offer was revised, the old link shows a banner
  "Esta oferta fue reemplazada por una versión más reciente" with a link to the newest revision's page
  **only if** that revision is Issued and has a token; otherwise "Contáctenos" (message box).
- Expired (effective_status == "Expired", i.e. past `valid_until`): page still renders read-only with
  an expiry banner like Odoo ("¡Esta oferta ya venció! Contáctenos para recibir una nueva cotización")
  and the message box stays usable. Accept/Reject hidden and refused server-side.
- Accepted / Rejected: read-only, banner showing the decision and date; messages still allowed.

### Page (`www` route, short path e.g. `/o/<token>`)
- Renders **only `issued_snapshot`** (the terms the customer was given), never live draft fields.
  Content: seller company name/logo (from settings/Company, no hardcoded names), offer title + revision,
  status chip, valid-until, customer display name from the deal's organization/contact (name only; no
  phone/email/address unless already in the snapshot), lines (description, qty, rate, discount, amount),
  total / net total in the snapshot currency with `currency_precision`, terms (plain text, autoescaped,
  newlines preserved), seller contact card (issuer's full name only; no email/phone unless a CRM setting
  explicitly exposes it), "Imprimir / Print" button (print stylesheet, `window.print()`).
- Large total in the header like Odoo.
- Responsive (phone first: most customers open it from WhatsApp), works without JS for reading.
- Language: render with the site/company default language through `frappe._()`; all strings
  translatable, add es-MX translations in the app's locale files the repo already uses. No hardcoded
  locale, currency, site or company.
- Generic OG/meta tags (no amounts, names or titles in unfurls), `noindex, nofollow`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Communication history: messages exchanged through this page (customer and seller replies), oldest
  first, author shown as "Usted"/"You" vs the seller's name.

### Customer actions (guest POST endpoints, `allow_guest=True`, methods=["POST"])
All take the token, re-resolve it server-side, and enforce:
- **Accept**: required typed full name (signature-by-name), optional note, plus the `terms_hash`/snapshot
  digest the page was rendered with; refuse if it no longer matches (terms changed) with a clear
  message and a reload action. Calls the existing decision path (`record_decision` semantics, same
  state guards: only a current, unexpired Issued offer) but as a guest-safe internal function — do not
  run it as Administrator via `set_user`; write `decision_by` = the issuer or leave the system user,
  and put who/when/IP/user-agent/name typed/note in `decision_evidence`. Add channel **"Online"** to
  `CHANNELS` and the `decision_channel` Select options (with a patch only if needed for existing rows;
  Select options come from the JSON).
- **Reject**: optional reason, same guards.
- **Message**: text ≤ 2000 chars, stored as a Comment (or the repo's existing activity/communication
  record type if the deal timeline uses one; pick the one the deal activity feed already shows) on the
  **CRM Deal** with a reference to the offer, and notify the deal owner / issuer through the repo's
  existing notification mechanism (CRM Notification) so it shows in the SPA.
- Idempotency: repeating the same accept/reject returns the current state, no duplicate timeline entries.
- Rate limit per token **and** per IP, atomic and fail-closed (`frappe.cache().incrby` + `expire`, deny on
  cache error), e.g. 10 writes / 10 min per token, 30 / 10 min per IP; reads (page views) more generous.
- CSRF: Frappe guest POSTs need the csrf token from the rendered page; make sure the page provides it
  (Frappe exposes `frappe.csrf_token` in web pages) and the endpoints work for a real guest session.
- Audit: every guest write leaves a timeline entry on the deal (accepted online / rejected online /
  customer message) so the seller sees it.

### View tracking
- Record `first_viewed_at`, `last_viewed_at`, `view_count` on the offer (throttled: count at most once
  per 30 min per IP, no write on every refresh), skip when the viewer is a logged-in system user
  (seller previewing). First view adds a timeline entry "El cliente abrió la oferta".

### Seller side (CRM SPA, `frontend/src/components/Offers/OfferWorkspace.vue` + `crm/api/offers.py`)
- Issued offer card: Share link (copy), Revoke, open preview, chips "Visto 3 veces · última hace 2 h",
  "Aceptada en línea por <typed name> · fecha".
- After online acceptance: the existing next action (create ERP quotation) is the primary button on the
  card when ERP is available; otherwise the deal's next stage action.
- Seller can reply to customer messages from the offer card; replies appear on the customer page.
- Whitelisted seller endpoints check permission on the deal/offer exactly like the existing
  `crm/api/offers.py` functions (`_load(name, write=True)` path).

## Security contract (standing checklist for guest endpoints)
1. Capability token is random (not derived from the name), stored hashed; tamper/garbage → generic 404.
2. Rate limits atomic and fail-closed.
3. **Frozen exposure contract**: the page context / any guest JSON is built by one function from an
   explicit allowlist; an exact-key test locks it so adding a field can't leak PII or internal fields
   (`erp_*`, `request_*`, `decision_evidence`, deal internals, emails/phones).
4. Jinja autoescape everywhere, never `| safe` on customer/seller text; XSS test with `<script>` in
   title/terms/line description/message.
5. Generic OG tags.
6. Guest writes: state guard, idempotency, audit entry, terms-hash binding.
7. Draft offers never reachable by link, even if a token row exists.

## Tests (Frappe `FrappeTestCase`, in `crm/tests/` or next to `crm/offers/`)
Token create/rotate/lookup, 404 on garbage/revoked/draft, exposure exact keys, expiry banner and
refusal, revised-offer banner, accept happy path + terms-hash mismatch + double accept idempotent,
reject, message creates deal timeline entry + notification, rate limit trips and fails closed when cache
raises, XSS escaped, view throttling, seller endpoints permission-checked, works with erpnext absent
(`erp_available()` False path).
