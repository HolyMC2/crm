# Documentos: the engine and its profile API

Shell SPEC §6 (Wave D). One engine opens any document list and record the worker can read:

| Route                               | Page                        | What                                                                                                                         |
| ----------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/documentos` (and `/inventario`)   | `pages/DocumentosHub.vue`   | groups Ventas, Compras, Pagos, Inventario with counts; «Todos los tipos» searches every readable doctype                     |
| `/documentos/:slug`                 | `pages/DocumentosList.vue`  | a curated list (registry entry + profile)                                                                                    |
| `/documentos/:slug/:name`           | `pages/DocumentoRecord.vue` | one record                                                                                                                   |
| `/documentos/tipo/:doctype[/:name]` | same pages                  | the **generic floor**: any readable doctype, profile derived from its meta                                                   |
| `/inventario/:slug[/:name]`         | same pages                  | entries whose `base` is `/inventario` (the bar lights Inventario)                                                            |
| `…/nuevo`                           | `pages/DocumentoNuevo.vue`  | a new draft: blank, prefilled from the query (`?customer=…`), a mapper (`?origen=&desde=&con=`), `?duplicar=`, `?modificar=` |

Lists and records render through `pages/DocumentosSplit.vue`: below 1024px one page at a time; at
≥1024 list left, record right (master-detail). The list's state lives in the URL query, so it is kept
on every record link; keys j/k/Enter (list), e (edit a draft), Esc (close the record), c (new).

Server: `crm/api/documentos.py`: reads `rows`, `counts`, `hub`, `search`, `doctypes`, `record`,
`connections`, `timeline`; editing `form`, `draft`, `save`, `act` (submit, cancel, delete); tools
`comment`, `assign`, `people`, `print_formats`; mappers on the `MAKERS` allowlist. Frappe permissions only, plus `User.block_modules`; the module is on in the
boot when the worker reads at least one of its doctypes (`get_capabilities`).

Budgets (DD12): nothing here is imported statically from the router, `main.js` or `MuelleShell`.
`registry.js` is the one small module others may import lazily (Avisos, the kardex, the palette) to
resolve a link with `documentRoute`; it carries no profile code. Profiles load lazily.

## Where a link goes: `documentRoute`

```js
const { documentRoute } = await import('@/documentos/registry')
router.push(
  documentRoute('Sales Invoice', 'ACC-SINV-2026-00012', {
    boot: shellBoot.value,
  }),
)
// → /documentos/facturas/ACC-SINV-2026-00012
documentRoute('Payment Entry', name, { hint: { payment_type: 'Receive' } }) // → /documentos/cobros/…
documentRoute('Purchase Order', name) // → /compras/orden/… (its recordRoute)
documentRoute('Item', code) // → /productos/…
documentRoute('Journal Entry', name) // → /documentos/tipo/Journal%20Entry/… (the floor)
```

It returns `null` when the boot says the worker cannot read the doctype here. Never link to `/app/…`
from the shell (§1.5); the only Desk door is «Abrir en escritorio» in the tools sheet at ≥1024px.

## Adding a curated document: three places

1. **Registry entry** in `registry.js` `PROFILES` (static, tiny):

   | key                     | meaning                                                                                                                            |
   | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
   | `doctype`               | the Frappe doctype                                                                                                                 |
   | `slug`                  | Spanish URL segment (`facturas`); unique per `base`                                                                                |
   | `group`                 | hub group: `ventas`, `compras`, `pagos`, `inventario`                                                                              |
   | `label`, `icon`, `hint` | hub row and list title (`lucide-*` icon, one-line hint in worker words)                                                            |
   | `attention`             | optional: the hub's word for the count that asks for action («vencidas»); the server counts it with `ATTENTION` in `documentos.py` |
   | `base`                  | optional: `/inventario` for Inventario's lists (default `/documentos`)                                                             |
   | `match`, `filters`      | optional: one doctype, several lists (Payment Entry: `cobros` matches `{ payment_type: 'Receive' }` and lists with `filters`)      |
   | `recordRoute(name)`     | optional: hand the record to a richer existing page (`{ path }`)                                                                   |

2. **Server display** in `documentos.py` `DISPLAY[doctype]` (and the doctype in
   `DOCUMENTOS_DOCTYPES` / `INVENTARIO_DOCTYPES` so the module gate counts it): which fields are the
   `title` (party or name, in preference order; never the ID), `amount`, `currency`, `date`, `due`,
   `outstanding`, and the `party` (`(doctype or field naming it, field with the name)`). Without an
   entry the floor guesses from the meta (title field, `grand_total`, `posting_date`…).

3. **Profile file** `profiles/<doctype_snake>.js`, default export, and one line in
   `profiles/index.js` `CURATED` (`'Payment Entry:cobros'` keys a slug when one doctype has several
   lists). The loader merges `{ ...genericProfile, ...registryEntry, ...yourProfile }`, so a profile
   overrides only what it knows.

## Profile keys

| key                     | type                                                                                    | used by                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `fields`                | `string[]`                                                                              | extra list columns the row needs (`row.fields.<name>`); only permlevel-0 real fields are returned          |
| `chips`                 | `{ value, label, filters }[]`                                                           | the one chip row; `value: ''` is «Todas/Todos» with `filters: null`. Filters are Frappe filter triples     |
| `defaultChip`           | `string`                                                                                | chip on when the URL names none (kept out of the URL)                                                      |
| `filterFields`          | `{ fieldname, label, options: [{ value, label }] }[]`                                   | the «Filtros» sheet                                                                                        |
| `sorts`                 | `{ value, label }[]`                                                                    | sort sheet; `value` is `field asc` or `field desc`; `''` = the date field, newest first                    |
| `sections`              | `string[]`                                                                              | record sections in order: `items`, `totals`, `datos`, `conexiones`, `actividad`, `archivos`                |
| `owedLabel`             | `string`                                                                                | totals' label for the outstanding amount («Por cobrar», «Por pagar»)                                       |
| `row(row, { doctype })` | → `{ title, subtitle, subtitleTone?, meta, metaTone?, status, tone, avatar? \| icon? }` | one list row (`ui/ListRow`)                                                                                |
| `header(record)`        | → `{ title, kind, number, status, tone, amount, date, due }`                            | the record's app bar and hero                                                                              |
| `nextStep(record)`      | → `null` or a step (below)                                                              | the one filled «siguiente paso» (DD4)                                                                      |
| `editFields`            | `string[]` or `null`                                                                    | fields of the edit sheet and `/nuevo`, in order; `null`: the required and list fields the worker may write |

`row` input (from `rows`): `{ name, title, status, docstatus, amount, currency, date, due,
outstanding, modified, fields }`. Dates are ISO strings; format them with `utils/display.js`
(`formatDate`, `formatDue`, `formatMoney`, `statusLabel`, `statusTone`, `kindLabel`). Never show
`row.name` as the title (`titleOf(row, doctype)` from `_generic.js` falls back to the kind).

`record` input (from `record`): `{ doctype, name, label, submittable, header, items, taxes, totals,
fields, actions, activity, connections, modified, doc }`. `actions[key] = { allowed, reason }` for
`edit submit cancel amend delete duplicate comment assign attach share print email`; a refused action
carries the sentence that explains it.

### The next step

```js
nextStep(record) {
  const h = record.header
  if (h.docstatus === 0) return { label: 'Confirmar', submit: true }
  if (Number(h.outstanding) > 0) return { label: 'Registrar cobro', icon: 'lucide-hand-coins', make: 'payment' }
  return null
}
```

A step is one of: `{ submit: true }` (confirm the draft), `{ make: '<key>' }` (an ERPNext mapper on
the server allowlist `MAKERS` in `documentos.py`: the new draft opens prefilled), or `{ to: route }`.
Only offer a step whose action the record allows; the engine hides it otherwise. `draftStep(record)`
from `_generic.js` is «Confirmar» for any submittable draft. To add a mapper, add one line to `MAKERS`
(`(source doctype, key) → (dotted path, target doctype)`; only `@frappe.whitelist()` ERPNext
functions, a server test checks it) and, for a new key, its target in `form.js` `MAKE_TARGETS`.

## Tools, editing and components

- **Tools sheet** («⋯» on every record, `components/documentos/ToolsSheet.vue`; rules in `tools.js`
  `toolsFor`): Asignar, Comentar, Adjuntar, Compartir (the PDF where the phone shares files), Imprimir
  o PDF (format picker), «Avísame…» (D5's `AvisameSheet.vue`, when on the branch), «Todos los ajustes»
  and «Pregúntale a Muelle sobre esta ficha» (D6), Duplicar, Copiar enlace, Cancelar (confirmed),
  Modificar (cancelled), Eliminar (not confirmed), «Abrir en escritorio» (≥1024 only). A tool the
  worker cannot use now stays with the server's reason under it.
- **Editing**: `EditSheet.vue` (a draft), `DocumentoNuevo.vue` (a new one), both on `EditForm.vue`:
  one control per field type from D6's `components/ajustes/AjustesControl.vue` (44px, es-MX), then
  `ItemsEditor.vue` (search by name, code or barcode; a scanner gun types into the search; the camera
  scans with the browser's BarcodeDetector where it exists; quantity stepper; price optional, else the
  price list on save). Rows travel as `{ _idx, …changes }` (kept) or `{ item_code, … }` (new).
- `ConfirmSheet.vue` asks before Confirmar, Cancelar and Eliminar (`tools.js` `confirmCopy`).

## Complete example: Facturas (`profiles/sales_invoice.js`)

```js
import {
  formatDate,
  formatDue,
  formatMoney,
  statusLabel,
  statusTone,
} from '@/utils/display'
import { docStatus, titleOf } from './_generic'

const OWED = [
  'Unpaid',
  'Partly Paid',
  'Overdue',
  'Unpaid and Discounted',
  'Partly Paid and Discounted',
  'Overdue and Discounted',
]

export default {
  fields: ['is_return', 'customer'],
  chips: [
    {
      value: 'por-cobrar',
      label: 'Por cobrar',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', OWED],
      ],
    },
    {
      value: 'vencidas',
      label: 'Vencidas',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', ['Overdue', 'Overdue and Discounted']],
      ],
    },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    { value: 'pagadas', label: 'Pagadas', filters: [['status', '=', 'Paid']] },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'por-cobrar',
  owedLabel: 'Por cobrar',
  filterFields: [
    {
      fieldname: 'is_return',
      label: 'Tipo',
      options: [
        { value: '0', label: 'Ventas' },
        { value: '1', label: 'Devoluciones' },
      ],
    },
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'due_date asc', label: 'Vencen primero' },
    { value: 'outstanding_amount desc', label: 'Deben más' },
  ],
  row(row) {
    const status = docStatus(row)
    const owed = OWED.includes(status) && Number(row.outstanding) > 0
    const due = owed && row.due ? formatDue(row.due) : null
    return {
      title: titleOf(row, 'Sales Invoice'), // «Ana López», never ACC-SINV-…
      subtitle: due
        ? due.label
        : [statusLabel(status), formatDate(row.date)]
            .filter(Boolean)
            .join(' · '),
      subtitleTone: due?.overdue ? 'danger' : '',
      meta: formatMoney(row.amount, row.currency || 'MXN'),
      status,
      tone: statusTone(status),
      avatar: titleOf(row, 'Sales Invoice'),
    }
  },
}
```

The registry entry (`slug: 'facturas'`, `group: 'ventas'`, `attention: 'vencidas'`), the server
`DISPLAY['Sales Invoice']` (`title: customer_name`, `amount: grand_total`, `due: due_date`,
`outstanding: outstanding_amount`) and the `CURATED` line complete it.

## Checks for a new profile

- `tests/unit/documentos.test.js`: add the slug to the route test and one `row()` case (title is
  the party, never the ID; Spanish status).
- Shots at 412 and 305 (dark, light) and 1440, one realistic chain from the list to the next
  document and back with the filters kept (SPEC §6.3).
- `npm run build` runs `verify-bundle-budget.mjs`; `/crm/documentos/*` has its own budget line.
