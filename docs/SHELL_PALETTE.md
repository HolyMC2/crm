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
| Reportes | the reports the worker may run, as Desk lists them (the reach's `reports`); the report view of a list the term names («Factura de venta · Vista de reporte», two at most) | Desk, this tab, subtitled «Desk» |
| Desk | the Desk workspaces, pages («Desk · Página») and dashboards («Desk · Tablero») the worker sees (the reach's `workspaces`, `pages`, `dashboards`), minus the ones a shell module already is; then the forms only Desk opens (the reach's `desk_types`): a single's form (Books Assistant Settings, Stock Settings), a tree («Desk · Árbol») and a virtual type's list (RQ Job) | Desk, this tab, subtitled «Desk» |
| Recientes | the last eight rows chosen with a stable target | as chosen |

Shell places always sort above Listas, Reportes and Desk. A Desk row (`desk`, an `/app/…` URL)
exists only where the shell has no page: never a Desk link for a module or a curated list.

## What the awesomebar reaches, and where the palette has it

| Awesomebar source | Palette |
| --- | --- |
| A single's form (`frappe.boot.single_types`) | Desk group, `desk_types` kind `single` |
| «X List» | Listas, on the generic floor; a virtual type's list as a Desk row |
| «X Tree» | Desk group, `desk_types` kind `tree` |
| «X Report» (Report Builder view) | Reportes, for the types the term names |
| «New X» | «Crear X» in Acciones; «nuevo almacén», «new warehouse» or «crear almacén» lists it first |
| «Report X» (`allowed_reports`) | Reportes |
| «Open X» (`page_info`) | Desk group, `pages` |
| «Open X Workspace» | Desk group, `workspaces` |
| «X Dashboard» (`dashboards`) | Desk group, `dashboards` |
| Recent routes | Recientes: the rows chosen in the palette, not every page visited |
| «Search for X» (global search) | the record providers (Registros): contacts, deals, products, documents, Clínica, Inmobiliaria, Manual. A record of any other type is found from its list |
| Fuzzy match (letters in order) | the match rule below: every word in any order, initials, one slip |

Not carried over: «Find X in Y», tags (`#` is the documents scope here), the calculator and
Desk's own commands.

## Match (the reach rows)

Listas, Reportes and the Desk group rank their rows by how closely the name answers the term
(`reachRanked` in `utils/paletteReach.js`), because the palette draws five rows per provider:

1. the label or the English name **is** the term («employee» → Employee, before the 25 types
   that mention it);
2. one of them **starts with** it («books assi»);
3. **every word starts a word** of them, in any order («settings books», «sal inv»), or the term
   is the **initials** of the whole name («bas», «si»);
4. every word is **somewhere** in them (the shell's rule, `matchTokens`).

At the same step the shortest name the term was found in comes first. When nothing answers as
typed, a row **one slip away** does: a letter missing, extra, wrong, or two swapped, in a word of
four letters or more («boks asistant» → Books Assistant Settings, «slaes invoice»). The term
needs one word of six letters or more to hold on to, and a slip is never in the first letter or
the last one typed: «maria» stays a name, not «Marca».

## Rank (E7b)

Every row carries a rank (`PALETTE_RANK` in `shellPalette.js`): a shell place or a record matching
the term is 0 (the default), a hand-written action specific to it («Nuevo trato», «Escanear
documento», a theme) 1, generic fan-out 2 («Nuevo contacto «term»», «Buscar «term» en Escáner»,
a readable DocType's «Crear X»). `orderPaletteSections` keeps the group order above, lists the
surest rows of a group first («Nuevo trato» before «Nuevo contacto «trato»»), and moves a group
whose best row is generic after Ir a: «ventas» lists Ventas, Ventas › Tratos and Ventas ›
Prospectos before «Crear Pronóstico de ventas». The Listas provider offers at most three
«Crear X» rows per query and only where the term starts a word of the label or the DocType name
(the list matches a term inside a word, so the list row still shows).

A list, report or Desk row the term **names** (`named`: the term is its name, or four letters or
more of its start) is what the worker asked for, so the generic group also moves after its group:
«books assistant settings» ↵ opens the form, and «stock ledger» lists Inventario › Movimientos,
the Stock Ledger Entry list and the Stock Ledger report before «Nuevo contacto «stock ledger»».
A row that only mentions the term («assistant»), or a start shorter than four letters («ana»),
stays below the worker's own free text.

## Speed: what a keystroke costs

The Desk awesomebar answers from lists in its boot and asks the server at most once per keystroke;
the palette follows it.

- **Local providers** (`local: true`: actions, Ir a, the assistant, Listas, Reportes, Desk) answer
  from memory on every keystroke, with no pause. Listas, Reportes and Desk filter the **palette
  reach** (`frontend/src/utils/paletteReach.js`): one `crm.api.shell.palette_reach` read when the
  palette opens, kept five minutes, every row's words folded once. They match by the rule above,
  the reports named by the term before the ones only about its DocType.
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

- `crm.api.shell.palette_reach()`: `{reports, workspaces, lists, desk_types, pages, dashboards}`,
  the sets below in full, for the palette to filter as the worker types.
- `desk_types`: the readable DocTypes only Desk opens, one read of tabDocType: `kind` `single`
  (`/app/<slug>`), `tree` (`/app/<slug>/view/tree`) or `list` (a virtual type, `/app/<slug>`).
- `pages`: frappe's allowed pages for the user (`frappe.boot.page_info`), minus blocked modules,
  untitled pages and the ones no row can open (`DESK_PAGES_SKIPPED`: print, dashboard-view,
  setup-wizard); `/app/<name>`.
- `dashboards`: the dashboards Desk boots with (one chart or card the user may see), minus
  blocked modules; `/app/dashboard-view/<name>`.
- `crm.api.documentos.doctypes(search)`: readable, non-child, non-single, non-virtual DocTypes
  whose module is not blocked, ≤60, with `create` (the floor's `/nuevo` works for any of them)
  and `report` (the worker may open its report view).
  Both read them through `listable_doctypes()`: one read of tabDocType, never a meta per name.
  The Documentos hub still searches through `doctypes`.
- `crm.api.shell.reports(search)`: frappe's own allowed-report set for the user (roles, Custom
  Role, `disabled = 0`, Report permission), minus blocked modules and reports whose `ref_doctype`
  the user cannot read; `href` is the awesomebar's route (`/app/query-report/<name>`, or
  `/app/<doctype-slug>/view/report/<name>` for a Report Builder report). ≤20 rows.
- `crm.api.shell.workspaces(search)`: the Desk sidebar's pages for the user (public by role plus
  their private ones), minus hidden, Link/URL and blocked-module pages; `/app/<slug>` or
  `/app/private/<slug>`. ≤40 rows.
- All but `lists` are cached per user for five minutes under a key that carries `scope_hash`, so
  a role or permission change invalidates them at once (`forget_desk_reach` for tests).
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

Tests: `frontend/tests/unit/shellPalette.test.js`, `deskPalette.test.js`, `paletteReach.test.js`
(the match rule), `muelleShell.test.js` (doors), `crm/tests/test_shell_palette.py`.
