# Mobile design references for the Muelle shell

Why this exists: the Agenda became the best screen in the shell after its worker was shown Google
Calendar screenshots. Concrete references guide better than adjectives. This page gives the same
kind of guide for record pages, task lists and contact lists. Read it before you change a shell
screen, and add references here when you find good ones.

How to use it: copy **structure and hierarchy**, not branding. Keep the shell's tokens (frappe-ui
`ink-*`, `surface-*`, `outline-*`, the `--c-*` aliases in `components/contactos/contactos.css`),
Inter, and es-MX copy. Check every change at **412px and at 300px wide**. Android's text scaling
zooms the whole page, so a 412px phone at 135% behaves like a 305px viewport. Check it in
Playwright, both themes.

## The references

| Screen | Reference | What to take from it |
|---|---|---|
| Record page (phone) | [Google Contacts, contact page](refs/google-contacts-record.jpg) (M3 Expressive, 2025) | Top bar: back on the left, **edit as a pencil icon** on the right. Big name, centred, wraps by words. **One row of equal pill buttons with the label under each** (Call, Message, Video, Email). An action that does not apply stays in place, greyed. Then cards: the phone with its own inline actions, «Recent activity», settings. No «Contact info» label over the phone. |
| Record page (desktop) | [HubSpot contact record](refs/hubspot-record.jpg) ([case study](https://product.hubspot.com/blog/rethinking-hubspots-record-design-with-usability-in-mind)) | Identity on the left: photo, name, one line of role, email with copy. **Six round icon buttons with labels underneath** (Note, Email, Call, Log, Task, Meet). «About this contact» uses label above value. Related records sit in collapsible sections with a count, «Deals (2)», and «+ Add». An overdue task gets a red ring on its checkbox, not a red row. |
| Record page (desktop) | [Pipedrive person](refs/pipedrive-person.jpg) ([help](https://support.pipedrive.com/en/article/detail-view)) | The summary lists only the fields that hold data (label tag, email, phone, organization) with an icon each. Empty fields do not show. Sections are collapsible, with edit and «…» on the section heading. History is a filterable timeline. |
| Task list | [Google Tasks](refs/google-tasks-dark.jpg) ([redesign](https://www.androidpolice.com/google-tasks-redesign-live-android/)) | One card per list. Each row has a round checkbox, then the title, then a star. Sort and «…» sit on the card heading. **Done items fold into a «Completed (2)» card at the bottom.** Lists are tabs at the top, and the starred view is the first tab. A single FAB for «new». |
| Contact list | [Google Contacts list](refs/google-contacts-list.jpg), [Highlights](refs/google-contacts-highlights.jpg) | A pill search field at the top. The scope selector («All contacts ▾») and filter as icons on one row. Rows are a coloured initial avatar plus the name, large type, one line. Letter headers. Favourites and recents come first. A single FAB. |

## Patterns that recur (apply them unless the screen has a reason not to)

Record page
1. The name owns the header. Never put a button beside it on a phone. It wraps between words
   (`overflow-wrap: break-word`, `text-wrap: balance`), never letter by letter.
2. Editing the record is an icon in the top bar (`Button icon="edit-2"` with a `label`. frappe-ui
   makes the label the aria-label). Section-level edits stay on the section heading.
3. Use one filled button for the record's next step (our follow-up). The quick actions are **equal
   tonal pills with a label below**, laid out in one row (`flex: 1 1 64px`). Order: call, message
   or email, schedule, booking.
4. Do not repeat what the header already says. Show the kind of record once, under the name. Show
   the same name once. Show the source label only when the record has more than one source.
5. Show only fields with data in the summary. Put «Sin dato» in the full «Datos» editor, not on
   the page.
6. Related records are collapsible sections with a count and «Añadir». Each linked record says
   what kind it is («Persona», «Cliente»), so two records with the same name still read as two.
7. KPI tiles use a sentence-case label over a large value. No all-caps or tracked labels. Use
   colour only when the number needs action: red for an amount owed, amber for something waiting.

Lists
8. Rows are one or two lines: the name, then one useful secondary line (phone, company, due
   date). A status chip goes on the right only when it changes what the worker does.
9. Filters sit above the list as chips or a scope selector. Search is one field. Create is one
   button: the FAB on phones, «Nuevo» in the header on desktop.
10. Done or cancelled items fold into a collapsed section at the bottom with a count, as
    «Completed (2)» does in Tasks. They are not a tab that replaces the open work.
11. Overdue is a mark on the item (a red ring, or red due text), never a whole red row.

Everywhere
12. Touch targets are at least 44px. The label sits next to or under every icon, except in the top
    bar, where the icon carries an aria-label.
13. Use sentence case everywhere. No eyebrows, no «A · B · C» meta strings where a second line
    reads better, and no «→» on links.
14. Inside a section, use flat rows divided by a line. Use cards only for things the worker acts on
    as a unit: a task, a linked record, a KPI.

## Componentes

The shared phone primitives live in `frontend/src/components/ui/` (import from `@/components/ui`)
and the display helpers in `frontend/src/utils/display.js`. See them live at `/crm/_ui` (dev and
lab only; `?sheet=1`, `?filtros=1`, `?buscar=1` open the sheets). Build screens from these; if one
lacks a feature, ask the Shell S1 owner instead of making a private copy.

| Component | Use it for | Do | Don't |
|---|---|---|---|
| `AppBar` | The one phone top bar of a page with `meta.ownPhoneHeader`, or of a record. | `back` (a route: up to the list) on records and sub-pages. `context` names the module above the title («Cobranza»). `scopes` + `v-model:scope` turn the title into the list picker (a sheet). At most 3 icons in `#actions`; the bell comes by itself. `#summary` for what must stay in sight. | Don't add a «← Volver a …» row or an in-page H1 under it. Don't put text buttons or a create button in the bar (create is the `Fab`). Don't truncate titles yourself; it wraps to 2 lines and moves to its own row when the icons leave too little room. A drill-down record whose bar is the shell's (`meta.listParent`) passes `:stack="false"`: arrow and name stay on one row and the name ends in «…» (M3 small bar). |
| `PageHeader` | A heading block inside a page (desktop, or a section page without a list title in the bar). | Title on its own row; one subtitle; actions under the title on a phone. | Don't put the title and buttons in one flex row. Don't use it on phone list pages: their title is in the `AppBar`. |
| `BottomSheet` | Bounded tasks: a form, a picker, a confirm, filters. | `v-model:open`, a `title`, the actions in `#actions` (stacked, full width, primary last). `#header` for a fixed chip or search; `#footer` for a fixed composer. `dismissible: false` for unsaved input. `flush` for full-width rows. | Don't hand-roll a `<Teleport>` sheet, don't use a centred `Dialog` on a phone, and don't open a sheet from a sheet. Back must close it; don't fight its history entry. |
| `Segmented` | Two or three views of the same items («Lista · Semana · Mes»). | Short one-line labels; a `label` for screen readers. | Don't use it for filters (chips) or for done/cancelled (fold them into «Completados (n)» at the bottom). Measured at 305px: a fourth option, or a long label such as «Personalizado», hyphenates over three lines. Use `FilterChips` or a scope sheet instead; a long choice can be «Otro…», which opens its own sheet. |
| `FilterChips` | One row of filters above a list. | Counts on chips; `multiple` when filters combine; the rest in `#filters` with `filtersCount`. | Don't stack selects above a list. Don't let chips wrap to a second row (the row scrolls). Don't repeat the chips as a summary strip. |
| `ListRow` | Every list row. | `avatar` (a name → coloured initials) for people and companies, `icon` for documents; `subtitle` is one useful line; `meta` is time or amount. `subtitle-tone="danger"` marks overdue. A `StatusChip` in `#trailing` only when it changes the action. | Don't use the ID as title or subtitle (`displayName`). Don't add a «›» or an «Abrir» link: the row is the link (`to`) or button (`@click`). Don't make overdue rows red. |
| `EmptyState` | An empty, loading, denied or error pane. | Say what is missing and offer the next action (`action`, `@action`). | Don't leave a blank pane or a lone «Sin resultados». |
| `Fab` | The one create action of a list. | Extended (icon and label) at the bottom end; the page container is `relative`. A list under a Fab ends with `pb-24`, so its last row clears the Fab and the bottom bar. | Don't also put «Nuevo …» in the header or the empty state on a phone. Records use one filled button, not a FAB. Don't let the last row sit under the Fab. |
| `KpiTile` + `KpiGrid` | Numbers a worker acts on. | Sentence-case label over the value; `to` makes the whole tile the link; `tone` only when the number asks for action. `KpiGrid` makes them 2-up, 1-up at 305px. | No all-caps labels, no «Ver registros →» link inside, no 5-across grids. |
| `StatusChip` | A stored status in es-MX. | Pass the raw `status` (and `kind`: `call`, `campaign`, `task` when the word depends on it). | Don't print raw `status` values («Completed», «No Answer»). Don't put a chip on every row. |

`utils/display.js`:

- `displayName(doc, doctype)` names a record from its name fields and never returns an ID
  (`looksLikeId`) or an email. `kindLabel(doctype)` gives the kind word («Trato», «Orden de
  compra»). `personName(emailOrUser, people)` gives a person's name instead of an email.
- `formatDate` («hoy», «ayer», «24 oct», «17 oct 2025»), `formatDateTime` («hoy 12:11»),
  `relativeTime` («hace 17 min», «en 3 días»), `formatDue` (`{ label, overdue }`). Date-only server
  values are local days, never UTC midnight. Never show ISO dates or seconds.
- `unitLabel` / `formatQty`: «Nos» and «Unit» read «pza/pzas». `formatMoney` («$1,400.00», «USD
  12.00», «—» when unknown), `formatMoneyCompact` («$69.8 mil»).
- `statusLabel(status, kind)` and `statusTone` are the es-MX status map.

## Applied so far

- 2026-10-17 · Contacto (`pages/Contacto.vue`): pencil in the top bar, the name gets the whole row,
  the follow-up is the filled button, call/email/schedule/booking are tonal pills, «Cuenta de
  cliente con el mismo nombre» replaces a repeated name, relations name each end's kind, and the
  KPI labels are sentence case (`ContactOverviewTab.vue`), «Datos» lists only fields with data
  (one «Mostrar N campos sin dato» toggle).
- Still to do on Contacto: fold Seguimientos «Hechos/Cancelados» into a collapsed «Completados
  (n)»; grey out an action that does not apply instead of hiding it.

Sources were checked 2026-10-17. Screenshots belong to their owners and are kept here as internal
design references only.
