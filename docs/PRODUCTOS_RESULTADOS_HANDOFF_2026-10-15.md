# Productos and Resultados in the Muelle shell — handoff (2026-10-15)

For the next session that polishes the Muelle shell's **Productos** (`/crm/productos`) and
**Resultados** (`/crm/resultados`). Marco's standing direction (2026-10-14): Mercado keeps its
own screens as they are; **all new work goes into the shell** (polish, improvements, new
features). Iterate with targeted local checks and the lab; **run CI once at the end** in one
batch (`land --train …`), not per change.

## 1. Where things stand (all landed)

| Repo | Mainline sha | What landed |
|---|---|---|
| crm `doco-dev` | `d0e6d5595` | Resultados board (22 cards, charts, periods, Personalizar); Productos list + product page redesign |
| doco `develop` | `32685bf16` | `doco.workspaces.products`: catalog facets, filters, record fields, `set_photo` |
| mercado `main` | `71d60d8` | No redirect of `/mercado/resultados` to the shell; one Resultados card provider per board widget |
| taller `main` | `37165fac8` | Reparaciones card honours Ayer / Mes anterior / date range |

Lanes `shell-resultados2-20261014`, `shell-productos2-20261014`,
`shell-resultados-taller-20261014` are landed and closed.

### Resultados (done; small follow-ups only)
- Board: Hoy, Ayer, Semana, Mes, Mes anterior, Fechas (`periodo=rango&desde=&hasta=`);
  comparison segmented control; company/shop dropdowns; «Personalizar» hides cards per device
  (`localStorage muelle:resultados:hidden`).
- Cards come from the `muelle_resultados_cards` hook (crm composes, `crm/api/resultados.py`
  `CARD_ORDER`); Mercado provides 21 (`mercado/resultados_cards.py`), Taller one. Card payload
  contract is in the module docstring of `mercado/resultados_cards.py` (value, prev, delta_pct,
  `invert`, facts, spark, `size` wide/full, `chart` trend|progress|bars|columns|heatmap, drill,
  attention; bar rows may carry `filter` to narrow the board).
- UI: `frontend/src/pages/Resultados.vue`, `components/resultados/ResultadosCard.vue`,
  `ResultadosChart.vue` (inline SVG, no chart library), `composables/useResultados.js`
  (`packRows` fills rows of four with no holes). Lens: `pages/ResultadosDocumentos.vue`
  (grouped by day).
- Follow-ups: see Spanish in a browser (Administrator is English); phone check of the charts;
  Mercado's own board still has «Personalizar» with server-saved layout — the shell's is per device.

### Productos (current state)
- List `pages/Productos.vue` (1470 lines): queues (Todos, Sin precio, Precio por revisar, Faltan,
  Bajo mínimo + Inventario health views), Lista/Tarjetas views, group/stock/photo filters with
  counts in the URL (`grupo`, `existencias`, `foto`), bulk «Pedir conteo a…», Escáner hand-offs
  that return to the row. Components: `components/productos/CatalogItem.vue`,
  `CatalogFilters.vue`, `ProductThumb.vue`, `CountDialog.vue`, `EditDialog.vue`,
  `PriceDialog.vue`, `RequestDialog.vue`; logic in `composables/useProductos.js`.
- Product page `pages/Producto.vue` (1773 lines): hero (photo, group path, kind badge, actions,
  «Print label» → `/mercado/etiquetas?codes=`), price table with validity/age/status, stock by
  store with bins and Count/Move/Assign, movements, price changes, side cards (cost & margin
  server-gated, description, barcodes, details, open purchases, recent sales).
- Backend `doco/workspaces/products.py` (2080 lines, service `doco.workspaces.products`):
  `bootstrap`, `queue` (Todos excludes templates: `has_variants = 0`, ordered `modified desc`),
  `catalog_facets`, `counts`, `health`, `record` (`_stock`, `_prices`, `_ledger` 20 rows,
  `_purchases`/`_sales` 10 rows, `_actions`, `_cost` gated by `_cost_visible`,
  `_price_history` from `Mercado Price Change Log` when present), `save_item`, `set_photo`,
  `change_price`, `request_options`/`request_change`, `count_options`/`request_count(s)`/`ask_count`.
  Tests: `doco/workspaces/test_products.py`, `test_products_catalog.py`, `test_products_inventory.py`.
- crm tests: `frontend/tests/unit/productos*.test.js` (five files, incl. `productosSpanish.test.js`
  which checks every Productos string has an es row).

## 2. Comparison with Mercado (verified in the browser 2026-10-15 on doco-mirror)

**Productos is ahead:** correct stock across stores (Mercado's panel only reads the sidebar
shop: on IPN000001 Mercado says «Sin existencias», Productos shows 34 in Escuinapa); open
purchases and recent sales; «Pedir» into Compras prefilled; change requests to a manager; bulk
count requests with assignee; stock-health queues; negative-stock explainer; per-store
Count/Move/Assign bin.

**At parity:** search (name, code, exact barcode), stock/photo/group filters with counts, price
table per list, cost & margin, description, barcodes, price history.

**Mercado still has, Productos lacks** (Mercado reference files in parentheses, under
`mercado/frontend/src/`):
1. «Armar pack» / pack images / PDF catalogue / price message (`views/CatalogueView.vue:185-193,334-342`,
   `components/SelectionBar.vue`, `views/ExportPackView.vue`, `components/export/*`).
2. Photo gallery: several photos, set principal, rotate/flip/crop, delete; social renders
   (`components/detail/ItemPhotoGallery.vue`, `ItemHeroCarousel.vue`, `ItemShareSection.vue`,
   `components/PhotoEditModal.vue`).
3. «Escanear» on the list, key S (`@docomexico/scanner-kit` `openScanner`, `CatalogueView.vue:331-332`).
4. In-place label printing (`views/LabelSheetView.vue`, `components/PrintLabelModal.vue`, `components/etiquetas/*`).
5. Every price list on the list card + «Precios que se muestran» toggle (`components/TierPrices.vue`, `FilterRail.vue:158-179`).
6. Serials/IMEI and batches with expiry on the item (`components/detail/ItemSerialsCard.vue`, `ItemBatchesCard.vue`).
7. «Más datos»: supplier, UOM conversions, reorder table, lead time, weight, shelf life, EOL (`components/detail/ItemLogisticsCard.vue`).
8. Bins with quantity per bin and a warehouse picker (`components/detail/ItemBinsCard.vue`).
9. Offline catalogue (IndexedDB) — leave in Mercado for now.
10. Price grid, Showroom, Tareas de catálogo — leave in Mercado for now.

**Neither does well:** variants. doco-mirror has 9,552 enabled items, **250 templates and 4,452
variants** (e.g. IPN000109 «Silicone Case» has 1,011 variants). Productos' list hides templates
and returns variants flat (search «silicone» → 1,056 rows); opening a template shows «Stocked · 0 ·
No price» and «Pedir cambio de precio» with no explanation. Mercado at least says «Este artículo
es una plantilla».

**Server APIs Mercado already exposes** (reuse them from the shell when Mercado is installed,
guarded like `mercado.services.productos_link.productos_available`, instead of re-implementing):
- `mercado.api.exports`: `build_collage`, `build_collage_pack`, `build_pdf`, `share_message`,
  `build_item_share`, `build_item_photos_pack`, `build_combined`, `build_pricelist`.
- `mercado.api.photos`: `list_photos`, `set_principal`, `rotate_photo`, `replace_photo`, `delete_photo`.
- `mercado.api.labels`: `list_label_options`, `resolve_label_items`, `render_item_label`,
  `render_label_batch`, `list_label_units`.
Check each one's permission model before calling it from crm (shop scope, roles).

## 3. Batches

### Batch 1 — fixes and polish (do first)
1. **Variants.**
   - A template's page lists its variants (attributes, stock, price, photo) with filters by
     attribute, and explains why price/stock live on the variants.
   - Search and the list group variants under their template, with a «N variantes» chip;
     opening the chip shows the variant grid.
   - Reach templates from the list (today `queue` filters `has_variants = 0`).
2. **Default order.** «newest changes first» opens on test data («Sin Cambios», «Editor Test»).
   Prefer in-stock / recently sold first. Change the heading while a search is active.
3. **Product page length.** Show 5 movements and 5 sales with «Ver todos», and make each
   movement's document clickable (`_ledger` returns 20, `_sales` 10).
4. **Live refresh.**
   - The list's `LIVE_DOCTYPES` (`Productos.vue` ~649) has no `Item` / `Item Price`, so a price
     edited in Desk does not refresh the list.
   - `Producto.vue` has no live watch at all.
5. **Spanish in the browser** for both Productos and Resultados: use a Spanish user, or set the
   language for the test user.
6. **Phone pass** on the product page and the Resultados charts.

### Batch 2 — selling
1. «Armar pack» from the filtered list and from a selection (images, PDF, message), via
   `mercado.api.exports`.
2. Photo gallery on the product page: several photos, principal, rotate, delete, share renders,
   via `mercado.api.photos` and `exports.build_item_share`. «Agregar foto» (`set_photo`) has only
   a doco test; exercise it on a disposable site, not the mirror.
3. «Escanear» on the list (key S) with scanner-kit; one exact hit opens the product.

### Batch 3 — depth
1. Label printing in place (sizes, units), via `mercado.api.labels`.
2. Serials/IMEI and batches with expiry cards.
3. «Más datos» (supplier, UOM conversions, reorder, lead time, weight, shelf life).
4. Every price list on cards, with a per-list visibility toggle.
5. Bins with quantity per bin.

## 4. How to work here (lessons from this round)

- **Lanes:** `lane new <slug> crm doco` (both repos in one lane). A slug that was ever enrolled in
  the active release (`all-lanes-20261007`) cannot be reused; pick a new one.
- **Formatting:** run `pre-commit` before committing. CI's «Pre-commit Checks» failed the first
  train because prettier (crm) and ruff format plus RUF003 (doco) had not run:
  `uvx --quiet --from pre-commit==4.3.0 pre-commit run --from-ref origin/<mainline> --to-ref HEAD`
  in each worktree.
- **Builds:** symlink `ln -s ~/muelle-host/crm/frontend/node_modules frontend/node_modules`, then
  `heavy -- npm run build`. crm build output is untracked; the build enforces the budget
  (`scripts/verify-bundle-budget.mjs`, entry JS ≤180 KB gz, CSS ≤60 KB gz).
  - Current figures: JS 172.8 KB, CSS **56.4 KB**. There is little CSS room left: reuse existing
    utilities, prefer `FeatherIcon` or already-used `lucide-*` classes, and use inline styles
    for one-off sizes.
  - Revert the regenerated `frontend/auto-imports.d.ts` before committing.
- **Mercado builds** track `mercado/public/frontend` in git (rebuild and commit assets with SPA changes).
- **Vue gotcha:** `<component :is="'button'">` resolves to frappe-ui's globally registered
  `Button` (renders a grey 28 px pill). Use `<a>` or `<div>` for clickable rows.
- **Translations:** strings are `__('English')`. The es rows live in `crm/crm/locale/es.po`
  (Mercado `mercado/locale/es.po`, Taller `taller/locale/es.po`). Add them in one commit per
  lane and check with `msgfmt -c`. The same msgid in two lanes conflicts (the «no duplicate
  translations» hook): use a `msgctxt` (Productos uses `CTX = 'Productos'`, Resultados
  `CTX = 'Resultados'`).
- **Lab:**
  - `lab push <slug>` goes live at the next 5-minute window plus about 4 minutes of
    build/migrate; `lab status` shows the queue and the last publish.
  - Log in for Playwright:
    `cd ~/muelle-host/muelle && docker compose exec -T backend bash -lc 'cd /home/frappe/frappe-bench && BROWSER=echo bench --site doco-mirror.lab.xoloitzcuintles.com browse --user Administrator'`,
    then open `https://doco-mirror.lab.xoloitzcuintles.com/app?sid=<sid>`.
  - Playwright MCP runs in container `playwright-mcp`; save with a bare filename and
    `docker cp playwright-mcp:/home/node/<file>.png <dest>`.
- **Lab data worth knowing:**
  - Sales exist mainly Mar–Sep 2026; use `/crm/resultados?periodo=rango&desde=2026-08-01&hasta=2026-08-31`.
  - Example items: IPN000001 (stocked, 2 photos, 2 barcodes, cost), ABIBMEX000130 (service),
    IPN004776 (stocked, sold out), IPN000109 (template with 1,011 variants).
- **Landing:** one train at the end: `land --train <slug> [<slug>…]`, started in the background.
  - Doco boards a shared train station: if another lane in the station is red, yours is left
    out; land it again after the station clears.
  - Then `lane done <slug>`.
