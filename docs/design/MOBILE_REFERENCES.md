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
