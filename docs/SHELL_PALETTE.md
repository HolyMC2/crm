# The shell palette: what it reaches

Ctrl/⌘K opens one dialog («Buscar o ir a…»); Ctrl/⌘G the same dialog in records mode («Buscar
registros…»). Every row comes from one provider registry, `frontend/src/utils/shellPalette.js`
`createShellProviders`, on the contract in `vendor/muelle-shell/contracts/palette.ts`. This note
says what the palette reaches since Shell E7 (2026-10-24, SPEC DE9: «the palette reaches what Desk
reaches»).

## Groups, in display order

| Group | What | Where it opens |
| --- | --- | --- |
| Acciones | «Nuevo contacto», «Crear <tipo>» (`tipos`, where the worker may create), theme, shortcuts, «Preguntar a Muelle: «…»» for a question | the shell |
| Registros | Contactos (seven sources), Ventas deals, Documentos by number or party (`crm.api.documentos.search`), Clínica, Inmobiliaria, Manual | the shell |
| Ir a | modules, Contactos/Ventas/Documentos places, sibling apps, and «Pregúntale a Muelle» (a door word, the empty palette, a bare `?`) | the shell |
| Listas | every DocType the worker reads and that has no curated list, by Spanish label or English name (the reach's `lists`), on the generic floor `/documentos/tipo/<DocType>` | the shell |
| Reportes | the reports the worker may run, as Desk lists them (the reach's `reports`) | Desk, this tab, subtitled «Desk» |
| Desk | the Desk workspaces the worker sees (the reach's `workspaces`), minus the ones a shell module already is | Desk, this tab, subtitled «Desk» |
| Recientes | the last eight rows chosen with a stable target | as chosen |

Shell places always sort above Listas, Reportes and Desk. A Desk row (`desk`, an `/app/…` URL)
exists only where the shell has no page: never a Desk link for a module or a curated list.

## Rank (E7b)

Every row carries a rank (`PALETTE_RANK` in `shellPalette.js`): a shell place or a record matching
the term is 0 (the default), a hand-written action specific to it («Nuevo trato», «Escanear
documento», a theme) 1, generic fan-out 2 («Nuevo contacto «term»», «Buscar «term» en Escáner»,
a readable DocType's «Crear X»). `orderPaletteSections` keeps the group order above and the order
inside a group, and moves a group whose best row is generic after Ir a: «ventas» lists Ventas,
Ventas › Tratos and Ventas › Prospectos before «Crear Pronóstico de ventas», and «stock ledger»
lists Inventario › Movimientos before «Nuevo contacto «stock ledger»». The Listas provider offers
at most three «Crear X» rows per query and only where the term starts a word of the label or the
DocType name (the list matches a term inside a word, so the list row still shows).

## Speed: what a keystroke costs

The Desk awesomebar answers from lists in its boot and asks the server at most once per keystroke;
the palette follows it.

- **Local providers** (`local: true`: actions, Ir a, the assistant, Listas, Reportes, Desk) answer
  from memory on every keystroke, with no pause. Listas, Reportes and Desk filter the **palette
  reach** (`frontend/src/utils/paletteReach.js`): one `crm.api.shell.palette_reach` read when the
  palette opens, kept five minutes, every row's words folded once. They match by the shell's rule
  (every word, any order, accents aside), the reports named by the term before the ones only about
  its DocType.
- **Record providers** (Contactos, Ventas, Productos, Documentos, Clínica, Inmobiliaria, Manual)
  ask the server once the typing pauses for `PALETTE_DEBOUNCE_MS` (150 ms), from the second letter
  (`asksServer`). While one asks, its rows of the last query stay if the text still matches their
  title or line, so the list narrows instead of blinking; «Nada coincide» waits for every answer.
- The palette's module loads in idle time after the first route (`warmAfterFirstRoute`), so the
  first ⌘K opens at once; a phone or a slow line loads it on the first open.

On doco-mirror (System Manager, 2026-11-06) the Listas search alone took 0.8–1.4 s warm and
10.5 s cold per keystroke (a `get_meta` per readable DocType, about a thousand), and the list
moved for 1.2–2.1 s after the last key while «factura» fired 48 requests.

## Prefixes (scopes)

`>` actions · `@` people and companies · `#` documents and lists · `%` Taller refacciones ·
`?` the assistant. A prefix reaches only the providers that declare its scope (`providersFor`); the
assistant provider declares `scopes: ['assistant']`, so `?qué vendí ayer` asks that question and
nothing else answers. Unprefixed text reaches every provider.

## Server side

- `crm.api.shell.palette_reach()`: `{reports, workspaces, lists}`, the three sets below in full,
  for the palette to filter as the worker types.
- `crm.api.documentos.doctypes(search)`: readable, non-child, non-single, non-virtual DocTypes
  whose module is not blocked, ≤60, with `create` (the floor's `/nuevo` works for any of them).
  Both read them through `listable_doctypes()`: one read of tabDocType, never a meta per name.
  The Documentos hub still searches through `doctypes`.
- `crm.api.shell.reports(search)`: frappe's own allowed-report set for the user (roles, Custom
  Role, `disabled = 0`, Report permission), minus blocked modules and reports whose `ref_doctype`
  the user cannot read; `href` is the awesomebar's route (`/app/query-report/<name>`, or
  `/app/<doctype-slug>/view/report/<name>` for a Report Builder report). ≤20 rows.
- `crm.api.shell.workspaces(search)`: the Desk sidebar's pages for the user (public by role plus
  their private ones), minus hidden, Link/URL and blocked-module pages; `/app/<slug>` or
  `/app/private/<slug>`. ≤40 rows.
- Both are cached per user for five minutes under a key that carries `scope_hash`, so a role or
  permission change invalidates them at once (`forget_desk_reach` for tests).
- `crm.api.shell.resolve_documents(records)`: titles for recent Documentos records, under the same
  read check as `resolve_recent`.

## Recientes

The browser stores references only: `{source, name}` for Contactos and deals, `{doctype, name}` for
Documentos (both resolved by the server on every open, so revoked access shows nothing), and the
label of a place, list, report or workspace (no personal data). Action rows and sibling apps are
never remembered.

## The assistant's doors

Desktop: one rail item «Pregúntale a Muelle» after the modules (sparkle, ⌘J). Phone: the same
sparkle beside search in the AppBar, and the Más row. Everywhere: ⌘J, the palette (question or
place), the Sugerencia lines, record tools, Compras Surtido. All of them show or act only when
`shell_api.status` says yes; the boot asks it once (`assistantDoor.js`). No floating bubble
(`shell-program/design/ASSISTANT.md`).

Tests: `frontend/tests/unit/shellPalette.test.js`, `deskPalette.test.js`, `muelleShell.test.js`
(doors), `crm/tests/test_shell_palette.py`.
