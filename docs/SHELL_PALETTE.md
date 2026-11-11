# The shell palette: what it reaches

Ctrl/⌘K opens one dialog («Buscar o ir a…»); Ctrl/⌘G the same dialog in records mode («Buscar
registros…»). Every row comes from one provider registry, `frontend/src/utils/shellPalette.js`
`createShellProviders`, on the contract in `vendor/muelle-shell/contracts/palette.ts`. This note
says what the palette reaches since Shell E7 (2026-10-24, SPEC DE9: «the palette reaches what Desk
reaches»).

## Groups, in display order

| Group | What | Where it opens |
| --- | --- | --- |
| Acciones | «Nuevo contacto», «Crear <tipo>» (`tipos`, where the worker may create), «Buscar «X» en <lista>», the calculator's result, theme, shortcuts, «Preguntar a Muelle: «…»» for a question | the shell |
| Registros | Contactos (seven sources), Ventas deals, Documentos by number or party (`crm.api.documentos.search`), Clínica, Inmobiliaria, Manual; then a record of any other type (`otros`, Frappe's global search) and, after `#`, the documents that carry a tag | the shell (a worker without Documentos gets the Desk form) |
| Ir a | modules, Contactos/Ventas/Documentos places, sibling apps, and «Pregúntale a Muelle» (a door word, the empty palette, a bare `?`) | the shell |
| Listas | every DocType the worker reads and that has no curated list, by Spanish label or English name (the reach's `lists`), on the generic floor `/documentos/tipo/<DocType>` | the shell |
| Reportes | the reports the worker may run, as Desk lists them (the reach's `reports`); the report view of a list the term names («Factura de venta · Vista de reporte», two at most) | Desk, this tab, subtitled «Desk» |
| Desk | the Desk workspaces, pages («Desk · Página») and dashboards («Desk · Tablero») the worker sees (the reach's `workspaces`, `pages`, `dashboards`), minus the ones a shell module already is; then the forms only Desk opens (the reach's `desk_types`): a single's form (Books Assistant Settings, Stock Settings), a tree («Desk · Árbol») and a virtual type's list (RQ Job) | Desk, this tab, subtitled «Desk» |
| Recientes | the last eight rows chosen with a stable target, and the record pages opened in the shell since | as chosen |

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
| A last word that narrows («sales invoice report») | the same: «… report/reporte», «… list/lista», «… tree/árbol», «… dashboard/tablero» |
| «Find X in Y» | «juan en clientes», «juan in customer» → «Buscar «juan» en Clientes», first row; opens the list on that search (`?q=`): Contactos and Productos on their own pages, a curated list on its own («juan en facturas»), any other readable type on the generic floor (`buscar_en`) |
| «Find X in <this list>» | on a list page, «Buscar «X» en <esta lista>» among the generic actions |
| «Search for X» (global search) | the record providers, then `otros`: `crm.api.shell.search_records` reads Frappe's global search index for the types in Global Search Settings, minus the ones a provider above already searches |
| `#tag` | after `#`: the documents of the tags the term names (`crm.api.shell.tagged`); the tags come with the reach, so a site without tags asks nothing |
| Calculator («=» or a sum) | «1250*1.16 = 1,450», first row, ↵ copies it; «1250 + 16%» adds the percentage |
| Recent pages | Recientes: the rows chosen in the palette and the record pages opened in the shell (`utils/visited.js`) |
| Fuzzy match (letters in order) | the match rule below: every word in any order, initials, abbreviations, one slip |
| Lists in the page boot | the reach, kept in this browser between visits (below) |

Not carried over: «Generate Random Password», «Toggle Full Width» and Desk's own page commands.

## Match (the reach rows)

Listas, Reportes and the Desk group rank their rows by how closely the name answers the term
(`reachRanked` in `utils/paletteReach.js`), because the palette draws five rows per provider:

1. the label or the English name **is** the term («employee» → Employee, before the 25 types
   that mention it);
2. one of them **starts with** it («books assi»);
3. **every word starts a word** of them, in any order («settings books», «sal inv»), or the term
   is the **initials** of the whole name («bas», «si»);
4. every word is **somewhere** in them (the shell's rule, `matchTokens`).

At the same step the shortest name the term was found in comes first. A plural finds its
singular («clientes» → Cliente, «almacenes», «invoices»). Then:

5. the term **abbreviates** the whole name, word by word: each piece is the start of its word or
   its consonants in order, half of them at least, and only small words (de, of, the) are left
   out: «slsinv» and «sinv» → Sales Invoice, «pymtent» → Payment Entry, «factven» → Factura de
   venta, «basset» → Books Assistant Settings. Four letters at least. The awesomebar matches any
   letters in order; held to whole names and whole words, «maria» and «carlos» find nothing,
   though a four-letter nickname can spell two words («paty» → Party Type);
6. when nothing answers, a row **one slip away** does: a letter missing, extra, wrong, or two
   swapped, in a word of four letters or more («boks asistant» → Books Assistant Settings,
   «slaes invoice»). The term needs one word of six letters or more to hold on to, and a slip is
   never in the first letter or the last one typed: «maria» stays a name, not «Marca».

A row found by 5 or 6 never counts as named (below): it stays under the worker's own free text.

A curated list is a place («Documentos › Facturas»), matched by the shell's rule on its title
and keywords. Where that rule misses and this one finds its type («slsinv», «si», «slaes
invoice», «factura de venta»), the Listas provider adds the place row, so it is never missing
and never listed twice.

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

- **Local providers** (`local: true`: actions, Ir a, the assistant, the calculator, Listas,
  Reportes, Desk) answer from memory on every keystroke, with no pause. Listas, Reportes and Desk
  filter the **palette reach** (`frontend/src/utils/paletteReach.js`): one
  `crm.api.shell.palette_reach` read, kept five minutes, every row's words folded once. They match
  by the rule above, the reports named by the term before the ones only about its DocType.
- **The reach is kept in the browser** (localStorage `muelle:palette-reach:<site, worker>`: names
  of lists, reports, pages and tags, no record data). The awesomebar has its lists in the page
  boot; the palette answers from the kept copy on the first keystroke of the next visit and reads
  a new one in the background when the copy is older than five minutes. A browser that keeps
  none reads it in idle time after the first route, with the palette's module. Only that very
  first read can leave Listas, Reportes and Desk empty for a moment.
- **Record providers** (Contactos, Ventas, Productos, Documentos, Clínica, Inmobiliaria, Manual,
  `otros`, and tags after `#`) ask the server once the typing pauses for `PALETTE_DEBOUNCE_MS`
  (150 ms), from the second letter (`asksServer`; `otros` from the third, the index's word size). While one asks, its rows of the last query stay if the text still matches their
  title or line, so the list narrows instead of blinking; «Nada coincide» waits for every answer.
- **Productos ranks on the device**, as Taller ranks its parts. `utils/productIndex.js` keeps the
  worker's products (code, name, group, brand and barcodes of every enabled product they read, in
  the server's default order; `doco.workspaces.products.palette_index`) in IndexedDB
  `muelle-palette`, per site and worker, cleared at sign-out. `findProducts` takes the first
  `PRODUCT_POOL` (200) products the text may mean in that order and ranks them with
  `utils/itemRank.js`, the port of doco's `rank()` and `term_patterns()` that Taller and Mercado
  also carry: the same rows `products.palette` answers. The provider's `instant` puts them on
  screen on the keystroke (`instantRows`, `statesToShow`); its `search` then sends those codes
  (`names`) with the list's `stamp`, and the server answers their price and stock, each product
  read again under the worker's permissions, plus the serial or batch lookup. No price or stock
  is kept on the device beyond a minute in memory.
  - The list is current while its `stamp` equals the one every `palette` answer carries (the
    count, last change and codes of the products the worker reads). On another stamp the server
    ignores `names` and searches itself, so a stale list never hides a new product, and the
    device reads the list again (at most every 30 s). A list an hour old is read again for its
    order (on hand, last sold).
  - No list on the device (the first seconds of a new browser, a read that failed, a catalogue
    past doco's `PALETTE_INDEX_CAP` of 30,000 products): the server searches, as before.
- The palette's module loads in idle time after the first route (`warmAfterFirstRoute`), so the
  first ⌘K opens at once; a phone or a slow line loads it on the first open.

On doco-mirror (System Manager, 2026-11-06) the Listas search alone took 0.8–1.4 s warm and
10.5 s cold per keystroke (a `get_meta` per readable DocType, about a thousand), and the list
moved for 1.2–2.1 s after the last key while «factura» fired 48 requests.

Products, on doco-mirror (9,556 products, 2026-11-11, three runs each, median). Asked of the
server: typing «pantalla sm a05» at 80 ms a key, the first product row came 1,950 ms after the
text had two letters and the final rows 417 ms after the last key; at 200 ms a key, 5,558 ms and
1,589 ms on a busy lab. Ranked on the device (nine texts, 80 and 200 ms a key): the rows are on
screen 5–19 ms after the key (44 ms on the first key of the first open) and their price and stock
279–451 ms after the last key; a text typed again within a minute shows them at once. The list is
108 KB on the wire, read in 181 ms. For 68 real queries the device and `products.palette` find
the same products in the same order.

Every pause still sends one request per record provider (about five; «pantalla iphone 11» at
200 ms a key sent 101), and the server works on each although the palette drops the superseded
answers. A gate of one request per provider at a time was measured by replay on the lab (final
answers 0.31–0.42 s after the last key against 0.43–0.66 s) and left out: a request that hangs
then holds back that provider's next search.

## Prefixes (scopes)

`>` actions · `@` people and companies · `#` documents and lists · `%` Taller refacciones ·
`?` the assistant. A prefix reaches only the providers that declare its scope (`providersFor`); the
assistant provider declares `scopes: ['assistant']`, so `?qué vendí ayer` asks that question and
nothing else answers. Unprefixed text reaches every provider.

## Server side

- `crm.api.shell.palette_reach()`: `{reports, workspaces, lists, desk_types, pages, dashboards,
  tags}`, the sets below in full, for the palette to filter as the worker types.
- `tags`: the tag names Desk offers after `#` (`get_tags_list_for_awesomebar`).
- `crm.api.shell.tagged(tag)`: the documents that carry a tag, read again under the worker's
  permissions, eight at most.
- `crm.api.shell.search_records(q)`: Frappe's `__global_search` index, every word of three letters
  or more as a required prefix, for the types in Global Search Settings the worker reads, minus
  `SEARCHED_ELSEWHERE` and the curated Documentos types (another provider already finds those).
  Each row is read again under the worker's permissions, eight at most.
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

A record page opened in the shell (a contact, a deal, a document, a product) joins them, as the
awesomebar's recent pages: the shell notes its path in the tab's sessionStorage
(`utils/visited.js`), and the palette turns the paths into the same references when it opens
(`recentWithVisits`). The page on screen is left out until the worker moves on.

## The assistant's doors

Desktop: one rail item «Pregúntale a Muelle» after the modules (sparkle, ⌘J). Phone: the same
sparkle beside search in the AppBar, and the Más row. Everywhere: ⌘J, the palette (question or
place), the Sugerencia lines, record tools, Compras Surtido. All of them show or act only when
`shell_api.status` says yes; the boot asks it once (`assistantDoor.js`). No floating bubble
(`shell-program/design/ASSISTANT.md`).

Tests: `frontend/tests/unit/shellPalette.test.js`, `deskPalette.test.js`, `paletteReach.test.js`
(the match rule and the kept copy), `paletteCalc.test.js`, `visited.test.js`,
`muelleShell.test.js` (doors), `crm/tests/test_shell_palette.py`.
