# CRM Forms

Public lead-capture forms that turn a visitor into a CRM Lead or Deal, with an owner, a
follow-up and a record of where the visitor came from. A form is a Frappe `Web Form`
served at `/crm-form/<route>`; the CRM adds the builder, the after-submit wiring, sharing
and reporting around it.

State (2026-09-29): landed on crm `doco-dev` (4ffe7fab8, 4078d58c5, ee44bc248, 342ea1bfe),
doco_marketing `master` (d2077b74c, f47106c63, c9fd82017) and frappe_whatsapp `master`
(ba45f7dd3). On the lab, **not on prod**. See [Rolling to prod](#rolling-to-prod).

## Using it

Open **Formularios** in the CRM sidebar, next to Campañas (`/forms`, Sales Manager and
System Manager). Settings → Forms points to the same page.

### The Forms page

One card per form: status (Publicado / Borrador), route, what it creates, chips for owner,
watchers, follow-up and consent, and submissions in the last 7 / 30 days and in total, with
the last submission and the share that became deals. Each card has **Copiar enlace**,
**Código QR** and a menu (open, submissions, duplicate, publish/unpublish, delete).

Below the web forms, **Formularios de Facebook y Messenger** lists the Meta lead-ad and
Messenger lead forms that also feed the CRM, with their sync state and lead count.

A form built in Desk before this page existed shows an amber chip
(«Hecho fuera del constructor: N campos por limpiar»). It opens read-only with the fields it
cannot collect listed; **Duplicar como formulario limpio** makes a working copy and leaves the
original untouched.

### Creating a form

**Nuevo formulario** starts from a template: Contact us, Request a quote, Book a visit,
Promo sign-up (consent on) or Blank. Pick the form's language here: every text a visitor
reads is written in it, independent of the staff member's language. `{business}` in any text
is filled when the page is shown (FCRM brand name, else the default Company, else the app
name), so templates carry no shop name.

### The builder

Five tabs, with a live preview beside them (phone or desktop; on a phone, **Vista previa** in
the toolbar opens it as a sheet):

| Tab | What you set |
|---|---|
| Preguntas | Sections, columns and fields. System fields (owner, SLA, source…) sit under "More fields". Required fields you do not show need a default (hidden required fields). |
| Mensajes | Title, description, submit button, success message, redirect. |
| Cuando alguien envía | What each submission creates and who follows it up (below). |
| Compartir | Link, QR, tagged links per channel, WhatsApp, embed. |
| Envíos | The Leads/Deals this form created. |

**Publicar** saves and publishes in one step. The checklist beside it mirrors the server's
publish guard: title, route, at least one field, defaults for hidden required fields.

**Enviar una prueba** runs a real submission of the saved form, shows the record it would
create and everything the wiring did (owner, notifications, campaign, consent, tracking), then
rolls it all back. Nothing is saved, sent or queued.

### After someone submits (Cuando alguien envía)

- **Cada envío crea**: Prospecto (Lead) or Trato (Deal), and its starting status.
- **Quién da seguimiento**: your assignment rules (the panel says how many apply) or always
  the same person. The owner gets the usual assignment notification, credited to
  «Formulario X» instead of Guest.
- **Avisar también a**: people who get an in-app notification per submission or a daily
  summary.
- **Iniciar un seguimiento**: enroll every new lead in an Active campaign. Sends follow that
  campaign's rules (schedule, suppression, consent, daily cap). The panel also lists
  campaigns that fire on every new lead anyway.
- **Pedir consentimiento de WhatsApp**: an optional checkbox on the form. When ticked, the
  consent is logged with the exact text shown.
- **Confirmar por WhatsApp**: reply to the visitor with an approved template. The message
  waits in Aprobaciones for a person to send it, and only goes to visitors who ticked consent.
- **Correo**: team email per submission and a confirmation email to the visitor, only when a
  real business mailbox is the default outgoing account. Otherwise the section shows
  «Conecta el correo de tu negocio» and links to CRM Settings → Accounts.

Every submission also stores the form (`crm_web_form`), the visitor's message
(`crm_form_message`), a timeline note and the UTM tags of the link it came from.

### Sharing (Compartir)

- The hosted link, **Código QR** (PNG or SVG) and **Compartir por WhatsApp**.
- **Un enlace para cada lugar donde lo compartes**: tagged links for Instagram, Facebook,
  WhatsApp status, flyer/QR and website, so every submission records its source.
- **Envía el enlace en un chat**: ready-to-send WhatsApp and Messenger messages with a tagged
  link, in the form's language; **Guardar como respuesta rápida** makes it a canned reply in
  the inbox.
- **Llenarlo dentro de WhatsApp**: build a WhatsApp Flow from the form so customers answer
  inside the chat (see below).
- Embed snippet and allowed domains for your own website.

### Submissions (Envíos)

Stats plus the list of Leads/Deals the form created (status, owner, source, converted deal).
Opening one keeps a way back: the record shows «Volver a los envíos del formulario».

## WhatsApp, inbox and email

These sections appear only when doco_marketing is installed.

**WhatsApp Flow.** Build turns the saved form into a WhatsApp Flow locally; fields WhatsApp
cannot ask are listed, and a required one blocks publishing. **Publicar en WhatsApp** is a
separate, confirmed step because it registers the Flow at Meta. A form edited after the build
shows the Flow as out of date. Agents send the Flow from an open inbox conversation (it goes
through the CRM outbox, so the 24-hour window, suppression and account checks apply). A Flow
reply creates the Lead through the same mapping as the web page, but only when we really sent
that Flow to that number, and links the conversation to the new record. Needs the WhatsApp
channel in API mode.

**Inbox.** A new record is linked to the person's open WhatsApp conversations by phone (last
10 digits).

**Email readiness** is the mail guard's own decision: the check builds, without saving it, the
exact email a real send would queue and runs doco's platform-mail policy on it. On doco prod
today the default outgoing account is the platform account, so it reports not ready
(`platform_account_only`) until a business mailbox is made the default outgoing account.

## How it is built

| Piece | Where |
|---|---|
| Forms page, builder | `frontend/src/pages/Forms.vue`, `pages/FormBuilder.vue`, `components/Forms/*` |
| Channel sections | `frontend/src/components/Forms/channels/*` |
| API | `crm/api/form.py` (thin, manager-gated) |
| Templates, settings, wiring, stats, test run, QR | `crm/forms/` |
| Public page | `crm/www/crm_form.{py,html}` |
| Channel backend | doco_marketing `api/form_channels.py`, `services/form_channels/*`, doctype `Form Channel Settings` |
| WhatsApp Flow builder | frappe_whatsapp `flow_builder.py` |

Decisions worth knowing:

- **Per-form settings are one JSON field on the Web Form** (`crm_form_settings`), like
  `crm_hidden_defaults`: same lifecycle as the form, copied on duplicate, read by the public
  page in one fetch; partial saves keep keys that were not sent. Tradeoff: no per-key filtering
  in Desk. Channel settings live in doco_marketing's `Form Channel Settings`, since that app
  owns them.
- **Wiring reuses the owning apps' actions**: the owner field and its ToDo notification,
  `campaign_engine.enroll`, the consent ledger (`consent.log_consent`), touchpoints and the
  existing `utm_*` fields. Side effects never block the visitor's submission; failures are
  logged.
- **No automatic Lead→Deal conversion for guests.** The conversion service checks permissions;
  a form that should start a sale creates a Deal directly.
- **QR is rendered server-side** with pyqrcode (already a Frappe dependency); the browser only
  converts SVG to PNG.
- **Desk-made forms are never rewritten**: they go read-only with a clean-copy path, and system
  fields stay available under "More fields", so existing forms keep working.
- **The test submission is a savepoint rollback** that also drops queued after-commit and
  realtime work.

Contracts other code depends on (keep them stable):
`crm.forms.wiring.request_consent`, `request_utm`, `submitting_form`; the `frappe.form_dict`
keys `crm_consent` and `crm_utm`; `crm_web_form` on CRM Lead/Deal;
`crm_form_settings.consent_enabled` and `consent_text`.

## Related

- WhatsApp template variables (name, repair order, device, amounts, links) are resolved by one
  contract shared by API sends and the manual wa.me box:
  frappe_whatsapp `docs/template-variables.md`.
- Campaigns and 1:1 cadences: doco_marketing `docs/wiki/03-chatflows-y-cadencias.md` (§8,
  including per-step template variables and the rule that only Meta-APPROVED templates can be
  activated).

## Rolling to prod

- crm `doco-dev` at or after 342ea1bfe, doco_marketing `master` at or after c9fd82017,
  frappe_whatsapp `master` at or after ba45f7dd3 (ship frappe_whatsapp with or before the
  others, together with the click-to-chat channel and template-variable work).
- `migrate`: Web Form field `crm_form_settings`; CRM Lead/Deal `crm_web_form` and
  `crm_form_message`; CRM Notification type "Form"; patch
  `crm.patches.v1_0.add_crm_form_wiring_fields`; doctype `Form Channel Settings`.
- New daily scheduler job `crm.forms.wiring.send_daily_digests`.
- Compile translations (`bench compile-po-to-mo`, which prod-refresh and the image build do)
  and rebuild the CRM frontend.
- After the roll, the Desk-made «Reparacion» form on doco shows as "made outside the builder";
  duplicate it as a clean form if it is still wanted.
- Publishing a WhatsApp Flow and connecting a business mailbox are separate, deliberate steps.
