# Composer commands: send documents, `/` palette, templates, field memory

Lane `crm-composer-commands-20260928` (repos: `crm`, `doco_marketing`). Requested 2026-09-28:
send Cotización / Orden de venta / Orden de reparación / Adeudo on email, WhatsApp (WABA) and the
other chat channels; `/` commands with a preview at the start of the message and autocomplete;
saved templates with shortcuts that are fast to call; autofill, autosuggestion and memory for
field values.

## Worker chain

1. The operator is in a deal conversation (Activities → WhatsApp / Messenger / Email composer).
2. Types `/` at the start of the message. A palette opens above the box and lists commands,
   templates and quick replies. Filtering happens as they type (`/cot`, `/ped`, `/ord`, `/ade`,
   `/<shortcut>`). ↑/↓ move, Enter or Tab picks, Esc closes. The right side shows a preview
   of the highlighted item: the document summary with the caption that will go out, or the
   rendered template text.
3. Document command → **Enviar documento** dialog, with the document preselected (the newest open
   one), the channel preselected (the composer's channel) and the recipient autofilled. The
   caption is prefilled from the document-kind template and editable. The preview shows what
   the customer receives. Enter sends.
4. Template or quick reply → rendered text drops into the composer with record variables filled
   in. Holes that could not be filled stay visible as `{{hole}}` and are suggested from memory.
5. Anything typed in a memory-backed field (recipient, subject, caption, template holes) is
   remembered and offered next time. The ranking prefers this contact, then this user, then
   frequency and recency.
6. «Guardar como plantilla» from the composer turns the current text into a template with a
   shortcut.

## Backend contract (doco_marketing, module `doco_marketing.api.composer`)

All endpoints: `validate_access(reference_doctype, reference_name)` from `crm.api.whatsapp`
(read for reads, write for sends). Documents are only listed or sent when they belong to the
deal (`crm_deal` field, or the RO's `crm_deal`). Strings go through `_()`. Money goes through
`fmt_money` with the document currency. No site, locale or currency hardcodes.

### `get_command_catalog(reference_doctype, reference_name, channel="whatsapp")` GET

```json
{
  "channel": "whatsapp",
  "channels": [{"value": "whatsapp", "label": "WhatsApp", "available": true, "reason": "",
                "window_open": true, "recipients": ["5215512345678"]},
               {"value": "email", "label": "Email", "available": true, "recipients": ["a@b.mx"]},
               {"value": "messenger", "label": "Messenger", "available": false, "reason": "…"}],
  "commands": [
    {"key": "cotizacion", "aliases": ["cot", "quote", "quotation"], "label": "Enviar cotización",
     "kind": "document", "doctype": "Quotation", "available": true, "reason": "", "count": 2},
    {"key": "pedido", "aliases": ["ped", "orden-venta", "so"], "kind": "document", "doctype": "Sales Order", …},
    {"key": "reparacion", "aliases": ["ord", "ro", "orden"], "kind": "document", "doctype": "Repair Order", …},
    {"key": "adeudo", "aliases": ["ade", "saldo", "deuda", "debe"], "kind": "document", "doctype": "Adeudo", …},
    {"key": "plantilla", "aliases": ["tpl", "template"], "kind": "templates", …},
    {"key": "guardar", "aliases": ["save"], "kind": "save_template", …}
  ],
  "documents": {
    "Quotation":   [{"name": "SAL-QTN-0001", "title": "…", "date": "2026-09-20", "status": "Open",
                     "grand_total": 1200.0, "currency": "MXN", "total_label": "$1,200.00"}],
    "Sales Order": [ … same shape … ],
    "Repair Order":[{"name": "RO-0001", "title": "iPhone 12 · Pantalla", "status": "En reparación",
                     "balance_due": 500.0, "currency": "MXN", "total_label": "$500.00"}],
    "Adeudo":      [{"name": "adeudo", "title": "Saldo pendiente", "outstanding": 850.0, "currency": "MXN",
                     "total_label": "$850.00", "invoices": [{"name": "…", "outstanding": 850.0,
                     "due_date": "…", "outstanding_label": "$850.00"}]}]
  },
  "templates": [{"id": "CR-0001", "kind": "reply", "title": "Horario", "shortcut": "horario",
                 "channel": "Any", "document_type": "", "body": "…"},
                {"id": "welcome_msg", "kind": "whatsapp", "title": "welcome_msg", "shortcut": "",
                 "body": "…"}]
}
```

`available: false` carries `reason` (for example, no quotations on this deal, or taller not
installed). Leads get the templates and the channels. Document lists stay empty unless the
lead is linked to documents.

### `preview_document_message(reference_doctype, reference_name, doctype, docname, channel)` GET

`{caption, subject, attachment: {kind: "pdf"|"link"|"none", label}, link_url|null,
recipients: [...], window_open: bool, warnings: [str]}`. The caption comes from the Canned
Reply whose `document_type` matches, or a built-in `_()` default, with variables filled. A
closed WhatsApp 24 h window adds a warning. Email gets a subject.

### `send_document(reference_doctype, reference_name, doctype, docname, channel, to=None, caption=None, subject=None)` POST

- Write-access checked, rate-limited (same limiter as `sales_docs.send_quotation_whatsapp`,
  failing closed).
- Quotation → `doco.docoutils.deal_quotes.deal_quotation_pdf`. Sales Order and Sales Invoice →
  the same public-but-unguessable PDF posture (token in the file name, previous generated PDFs
  for the doc deleted first), using the doctype's default print format. Repair Order → the
  ticket print format from `taller.api.settings.get_repair_order_print_format("ticket")` plus
  the public tracker URL (`taller.services.public_track.track_url`) when available. Adeudo →
  text statement. When `mercadopago_connector` is installed and an invoice is in the site
  currency MXN, it adds a pay link per invoice (reusing `inbox.create_payment_link` rules).
- The recipient must belong to the deal: the WhatsApp number via `sales_docs._to_belongs_to_deal`;
  email must be one of the deal's or its contacts' emails.
- WhatsApp: document message with the caption. Outside the 24 h window it refuses with a clear
  message. Email: one mail with the PDF attached, the caption as the body and the subject.
  Messenger and other channels: the caption plus the public PDF link (no binary).
- Goes through `doco_marketing.services.inbox.send.send_message` so touchpoints and realtime fire.
- Returns `{sent: [names], channel, file_url|null}`.

### Templates

- Canned Reply gains `shortcut` (Data, lowercase slug, unique among enabled rows) and
  `document_type` (Select: blank / Quotation / Sales Order / Repair Order / Adeudo), and its
  `channel` options gain Email.
- `render_template(template, reference_doctype, reference_name, kind="reply")` GET →
  `{text, holes: [{key, label, value|null}]}`. Variables: `{{cliente}}`, `{{nombre}}`,
  `{{empresa}}`, `{{trato}}`, `{{vendedor}}`, `{{fecha}}`, `{{total}}`, `{{documento}}`,
  `{{link}}`, `{{saldo}}`. Unknown or unresolved variables stay visible and are listed as holes.
  Meta templates use `crm.api.whatsapp.get_template_preview`.
- `save_template(title, body, channel="Any", shortcut=None, document_type=None, name=None)`
  POST creates or updates a Canned Reply (Sales User and above), validates the shortcut slug and
  its uniqueness, and returns the row.

### Field memory (new DocType `Composer Field Memory`)

Fields: `user`, `scope` (Data, for example `email.to`, `email.subject`, `caption.Quotation`,
`hole.<template>.<key>`), `context` (Data, the contact or deal the value was used with, optional),
`value` (Small Text), `uses` (Int), `last_used` (Datetime). Owner-only permission (if_owner).

- `remember_values(entries)` POST: a list of `{scope, value, context}`. Upserts, bumps `uses`
  and `last_used`, and keeps at most 50 rows per user and scope.
- `suggest_values(scope, prefix="", context=None, limit=8)` GET: this user's values, ranked.

## Frontend (crm)

- `src/composables/slashCommands.js`: parse a leading `/token`, build items from the catalog +
  quick replies, filter and rank, and handle keyboard navigation (pure functions, unit-tested).
- `src/composables/fieldMemory.js` + `src/components/Composer/MemoryInput.vue`: suggestions
  dropdown and remember on send.
- `src/components/Composer/SlashCommandMenu.vue`: palette with a preview pane.
- `src/components/Composer/SendDocumentDialog.vue`: document, channel, recipient, caption,
  preview, send.
- `src/components/Composer/SaveTemplateDialog.vue`.
- Wired into `Activities/WhatsAppBox.vue` (keeps `/cat`), `Activities/MessengerBox.vue`, and the
  email composer (`EmailEditor.vue`, a `/` at the start of an empty body, or its toolbar button).
  Everything is gated on `addonAvailable`. Without the addon the composers behave as before.

## Checklist

- [x] Backend endpoints + DocType changes + tests (doco_marketing c514f7e, 23 tests OK on doco-mirror)
- [x] Frontend palette, send dialog, memory, template dialog + unit tests (crm 685f5ff90, 40 tests; full suite 1045 OK; build OK)
- [x] Integration review against this contract (shapes, gating, security)
- [ ] Lab: `lab push` + migrate DONE; catalog smoke OK; live browser check in a deal conversation (WhatsApp, email, Messenger)
- [ ] Land both repos
