import { ref } from 'vue'
import { errorKind } from '@/utils/contactos'
import {
  RETURN_PREFIXES,
  readDone,
  safeReturn as contractReturn,
  withReturn,
  withoutDone,
} from '@/vendor/muelle-shell/contracts'

export { withoutDone }
import {
  comprasApi,
  outcomeUnknown,
  qty,
  requestId,
} from '@/composables/useCompras'

// Productos: a product's price and stock. Native Item, Item Price, Bin and
// Stock Ledger Entry stay the records; Doco's products service owns every
// read and write, Mercado's owner path every price change and Escáner every
// count. Pure helpers live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.products'
// Translation context: short generic words stay Productos-only in the catalog.
export const CTX = 'Productos'

/** POST to the Productos service; a refusal keeps the server's message and type. */
export function productosApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export { outcomeUnknown, qty, requestId }

// Return protocol (shell §8.3): the Muelle SPAs plus Desk, where the
// Inventario lists and price hand-offs start.
const RETURN_ALLOWED = Object.freeze([...RETURN_PREFIXES, '/app/'])
export function safeReturn(value) {
  return contractReturn(value, RETURN_ALLOWED)
}

export const productosBoot = ref(null)
let bootPending
/** Productos capability, cached per page load; refresh re-reads permissions. */
export function loadProductosBoot({ refresh = false } = {}) {
  if (productosBoot.value && !refresh)
    return Promise.resolve(productosBoot.value)
  if (bootPending) return bootPending
  bootPending = productosApi('bootstrap')
    .then((data) => (productosBoot.value = data || { enabled: false }))
    .catch((error) => {
      productosBoot.value = {
        enabled: false,
        failed: true,
        reason: error?.messages?.join(' ') || '',
      }
      return productosBoot.value
    })
    .finally(() => (bootPending = null))
  return bootPending
}

export const VIEWS = Object.freeze([
  { value: 'todos', label: 'All products', icon: 'package' },
  { value: 'sin-precio', label: 'No price', icon: 'tag' },
  { value: 'precio-revisar', label: 'Price to review', icon: 'alert-triangle' },
  { value: 'faltan', label: 'Out of stock', icon: 'alert-octagon' },
  { value: 'bajo-minimo', label: 'Below minimum', icon: 'trending-down' },
  // «Inventario»: where the stock is wrong, and who fixes it.
  { value: 'sin-cajon', label: 'No bin', icon: 'inbox', inventory: true },
  { value: 'sin-contar', label: 'Not counted', icon: 'clock', inventory: true },
  {
    value: 'negativo',
    label: 'Negative stock',
    icon: 'minus-circle',
    inventory: true,
  },
  {
    value: 'por-revisar',
    label: 'Differences to review',
    icon: 'git-pull-request',
    inventory: true,
  },
  {
    value: 'conteos-abiertos',
    label: 'Open counts',
    icon: 'clipboard',
    inventory: true,
  },
])
export const INVENTORY_VIEWS = Object.freeze(
  VIEWS.filter((v) => v.inventory).map((v) => v.value),
)
/** Lists over (product, store) rows: select, count, file, move. */
export const STOCK_VIEWS = Object.freeze([
  'sin-cajon',
  'sin-contar',
  'negativo',
])
export function isInventoryView(value) {
  return INVENTORY_VIEWS.includes(value)
}
export function viewLabel(value) {
  return tr(
    VIEWS.find((v) => v.value === value)?.label || 'All products',
    null,
    CTX,
  )
}
export function normalizeView(value) {
  return VIEWS.some((v) => v.value === value) ? value : 'todos'
}

/** The product record, remembering the list it was opened from; a template
 * opened from a search keeps that search for its variants («vq»). */
export function productRoute(row, list, search = '') {
  const query = list ? { list } : {}
  if (row.variants && search) query.vq = search
  return { name: 'Producto', params: { item: row.name }, query }
}

/** «12 variants», or «3 of 12 variants» while a search narrows them. */
export function variantsLabel(variants) {
  if (!variants) return ''
  const count = Number(variants.count) || 0
  const matching = variants.matching
  if (matching !== null && matching !== undefined && matching < count)
    return tr('{0} of {1} variants', [matching, count], CTX)
  return count === 1
    ? tr('1 variant', null, CTX)
    : tr('{0} variants', [count], CTX)
}

/** The rows a section shows: the first `limit` until «See all» opens it. */
export function visibleRows(rows, open, limit = 5) {
  const list = rows || []
  return open ? list : list.slice(0, limit)
}

/** Where a document of a movement or sale opens: the shell's own page for
 * purchases, the Desk form for everything else. */
export function documentLink(doctype, name) {
  if (!doctype || !name) return null
  if (doctype === 'Purchase Order')
    return { to: { name: 'CompraOrden', params: { name } } }
  if (doctype === 'Material Request')
    return { to: { name: 'CompraSolicitud', params: { name } } }
  const slug = String(doctype).trim().toLowerCase().replace(/\s+/g, '-')
  return { href: `/app/${slug}/${encodeURIComponent(name)}` }
}

// The whole history in Desk, past the rows the page carries: the item's
// stock ledger and its sales, from the start of the books.
const HISTORY_FROM = '2000-01-01'
export function ledgerReportUrl(item) {
  return `/app/query-report/Stock Ledger?item_code=${encodeURIComponent(item)}&from_date=${HISTORY_FROM}`
}
export function salesReportUrl(item) {
  return `/app/query-report/Item-wise Sales Register?item_code=${encodeURIComponent(item)}&from_date=${HISTORY_FROM}`
}

/** «5 Pza · 2 stores» from the row's stock in the chosen stores. */
export function stockLabel(row) {
  const stock = row.stock || {}
  const unit = row.uom ? ` ${row.uom}` : ''
  if (row.warehouse)
    return tr('{0} on hand in {1} · minimum {2}', [
      qty(row.actual_qty) + unit,
      row.warehouse,
      qty(row.reorder_level),
    ])
  if (!stock.stores) return row.stock_item === false ? '' : tr('No stock')
  return stock.stores > 1
    ? tr('{0} in {1} stores', [qty(stock.qty) + unit, stock.stores])
    : qty(stock.qty) + unit
}

export function money(value, currency) {
  if (value === null || value === undefined) return ''
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'MXN',
    }).format(Number(value))
  } catch {
    return `${qty(value)} ${currency || ''}`.trim()
  }
}

/** Server messages may carry a link; the page shows text and its own actions. */
export function plain(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain, actionable recovery for a failed call. */
export function problemOf(error) {
  const kind = errorKind(error)
  const detail = plain(
    error?.messages?.join(' ') || error?.message || tr('Something went wrong.'),
  )
  if (outcomeUnknown(error))
    return {
      kind: 'offline',
      title: tr('We do not know if it was saved'),
      detail,
      action: tr('Check result'),
    }
  if (kind === 'conflict')
    return {
      kind,
      title: tr('Someone else changed this product'),
      detail,
      action: tr('Refresh and compare'),
    }
  if (kind === 'permission')
    return {
      kind,
      title: tr('Not allowed', null, CTX),
      detail,
      action: tr('Ask for the change'),
    }
  return { kind: 'error', title: tr('Could not finish'), detail, action: null }
}

/** How big a price change is, and whether it needs an explicit OK. */
export function priceCheck(row, value) {
  const next = Number(value)
  const old =
    row.rate === null || row.rate === undefined ? null : Number(row.rate)
  const valid = Number.isFinite(next) && next > 0
  const changed = valid && (old === null || Math.abs(next - old) > 1e-9)
  const percent =
    changed && old ? Math.round((Math.abs(next - old) / old) * 1000) / 10 : 0
  const large =
    changed && old !== null && percent >= Number(row.warning_percent || 0)
  return {
    valid,
    changed,
    first: old === null,
    percent,
    large: Boolean(large && row.warning_percent),
    needsAck: Boolean(
      changed && (row.requires_ack || (large && row.warning_percent)),
    ),
  }
}

/** The lists the worker changed, against the revision each one was reviewed at. */
export function pricePayload(rows, drafts, acknowledged = {}) {
  const prices = {}
  const expected = {}
  const ack = []
  for (const row of rows) {
    if (!row.can_write) continue
    const value = drafts[row.price_list]
    if (value === '' || value === null || value === undefined) continue
    const check = priceCheck(row, value)
    if (!check.valid || !check.changed) continue
    prices[row.price_list] = Number(value)
    expected[row.price_list] = row.revision || null
    if (check.needsAck && acknowledged[row.price_list]) ack.push(row.price_list)
  }
  return { prices, expected, acknowledged: ack }
}

/** Lists that still need the worker's OK before saving. */
export function missingAcks(rows, drafts, acknowledged = {}) {
  return rows
    .filter((row) => row.can_write)
    .filter((row) => {
      const value = drafts[row.price_list]
      if (value === '' || value === null || value === undefined) return false
      return priceCheck(row, value).needsAck && !acknowledged[row.price_list]
    })
    .map((row) => row.price_list)
}

const EDIT_FIELDS = [
  'item_name',
  'item_group',
  'brand',
  'description',
  'disabled',
]
/** Only what the worker changed; barcodes travel as the whole visible list. */
export function editPayload(original, form) {
  const data = {}
  for (const field of EDIT_FIELDS) {
    const before =
      field === 'disabled'
        ? Number(original[field] || 0)
        : original[field] || ''
    const after =
      field === 'disabled'
        ? Number(form[field] || 0)
        : (form[field] || '').trim()
    if (before !== after) data[field] = after
  }
  const codes = (list) =>
    (list || [])
      .map((row) => ({
        barcode: String(row.barcode || '').trim(),
        barcode_type: row.barcode_type || '',
      }))
      .filter((row) => row.barcode)
  if (
    JSON.stringify(codes(original.barcodes)) !==
    JSON.stringify(codes(form.barcodes))
  )
    data.barcodes = codes(form.barcodes)
  return data
}

function editValue(record, field) {
  if (field === 'disabled') return Number(record?.[field] || 0) ? 1 : 0
  return String(record?.[field] || '').trim()
}
function barcodeRows(list) {
  return (list || [])
    .map((row) => ({
      barcode: String(row.barcode || '').trim(),
      barcode_type: row.barcode_type || '',
    }))
    .filter((row) => row.barcode)
}

/** «Actualizar y comparar»: the newer version is the base and only the
 *  worker's own edits (against the version they opened) go on top of it.
 *  Barcodes merge by code, so a row someone else added is never dropped.
 *  `changes` lists what someone else changed; `conflict` marks a field both
 *  changed, kept as the worker's until they choose theirs. */
export function rebaseEdit(before, form, latest) {
  const next = {}
  const changes = []
  for (const field of EDIT_FIELDS) {
    const mine = editValue(form, field) !== editValue(before, field)
    const theirs = editValue(latest, field) !== editValue(before, field)
    const value = mine ? form[field] : latest[field]
    next[field] =
      field === 'disabled' ? Boolean(Number(value || 0)) : value || ''
    if (theirs)
      changes.push({
        field,
        current: editValue(latest, field),
        mine: mine ? editValue(form, field) : null,
        conflict: mine && editValue(form, field) !== editValue(latest, field),
      })
  }
  const old = barcodeRows(before.barcodes)
  const wanted = barcodeRows(form.barcodes)
  const now = barcodeRows(latest.barcodes)
  const oldCodes = new Map(old.map((row) => [row.barcode, row]))
  const wantedCodes = new Map(wanted.map((row) => [row.barcode, row]))
  const removed = new Set(
    old.filter((r) => !wantedCodes.has(r.barcode)).map((r) => r.barcode),
  )
  const merged = now
    .filter((row) => !removed.has(row.barcode))
    .map((row) => {
      const own = wantedCodes.get(row.barcode)
      const was = oldCodes.get(row.barcode)
      return own && was && own.barcode_type !== was.barcode_type
        ? { ...row, barcode_type: own.barcode_type }
        : { ...row }
    })
  for (const row of wanted)
    if (
      !oldCodes.has(row.barcode) &&
      !merged.some((r) => r.barcode === row.barcode)
    )
      merged.push({ ...row })
  next.barcodes = merged
  if (JSON.stringify(old) !== JSON.stringify(now))
    changes.push({
      field: 'barcodes',
      current: now.map((row) => row.barcode).join(', '),
      mine: null,
      conflict: false,
    })
  return { form: next, changes }
}

/** The unit a price link asks for (`uom=`, e.g. from a «Caja» line). Prices
 *  here change per stock unit only, so another unit never auto-opens them. */
export function priceUnit(query, item) {
  const stock = item?.stock_uom || ''
  const requested =
    typeof query?.uom === 'string' ? query.uom.trim().slice(0, 140) : ''
  return {
    requested,
    stock,
    mismatch: Boolean(requested && stock && requested !== stock),
  }
}

/** `done=Purchase Order:<name>` from a hand-off we started (Compras). */
export function parseDone(value) {
  if (typeof value !== 'string') return null
  const index = value.indexOf(':')
  if (index < 1) return null
  const doctype = value.slice(0, index)
  const name = value.slice(index + 1)
  return ['Purchase Order', 'Material Request'].includes(doctype) && name
    ? { doctype, name }
    : null
}

export function recordPath(item) {
  return `/crm/productos/${encodeURIComponent(item)}`
}

/** «Pedir»: a new purchase in Compras with this product, store and quantity,
 *  and the way back to this product. */
export function purchaseRoute(item, { warehouse, qty: amount } = {}) {
  const query = {
    item,
    return_to: recordPath(item),
    return_label: 'Productos',
  }
  if (warehouse) query.warehouse = warehouse
  if (Number(amount) > 0) query.qty = String(Number(amount))
  return { name: 'CompraNueva', query }
}

/** Escáner's product page (cajón, mover, contar), with the way back: this
 *  product by default, or `back` (a list position). `warehouse` and `action`
 *  are routing hints; Escáner re-checks everything. */
export function scannerItemUrl(item, { back, warehouse, action } = {}) {
  const hints = new URLSearchParams()
  if (warehouse) hints.set('warehouse', warehouse)
  if (action) hints.set('accion', action)
  const href = `/scan/item/${encodeURIComponent(item)}${String(hints) ? `?${hints}` : ''}`
  return withReturn(href, back || { to: recordPath(item), label: 'Productos' })
}

/** Escáner's mover with the product, the cajón it leaves and its store. */
export function scannerMoveUrl({ item, from, warehouse }, back) {
  const query = new URLSearchParams()
  if (item) query.set('item', item)
  if (from) query.set('from', from)
  if (warehouse) query.set('warehouse', warehouse)
  return withReturn(
    `/scan/bins/move${String(query) ? `?${query}` : ''}`,
    back || { to: recordPath(item), label: 'Productos' },
  )
}

/** Escáner's review of a count task, on the row with the difference. */
export function conteoReviewUrl({ task, warehouse, row }, back) {
  const query = new URLSearchParams()
  if (warehouse) query.set('wh', warehouse)
  if (row) query.set('row', row)
  return withReturn(
    `/scan/conteo/revision/${encodeURIComponent(task)}${String(query) ? `?${query}` : ''}`,
    back || { to: '/crm/productos?vista=por-revisar', label: 'Productos' },
  )
}

/** ERPNext owns stock documents: a draft reconciliation opens in Desk. */
export function deskReconciliationUrl(name) {
  return name
    ? `/app/stock-reconciliation/${encodeURIComponent(name)}`
    : '/app/stock-reconciliation/new'
}

// ── Inventario lists: URL state, selection and the way back ────────────────

export const DAY_CHOICES = Object.freeze([30, 60, 90, 180, 365])
export const DEFAULT_DAYS = 90
export function normalizeDays(value) {
  const days = Number(value)
  return DAY_CHOICES.includes(days) ? days : DEFAULT_DAYS
}

/** The list's state from its URL: view, store, filters, selection, focus. */
export function listState(query = {}) {
  const text = (key) => (typeof query[key] === 'string' ? query[key] : '')
  const store = text('tienda')
  return {
    view: normalizeView(query.vista),
    store,
    search: text('q'),
    days: normalizeDays(query.dias),
    group: text('grupo'),
    brand: text('marca'),
    stock: catalogChoice(query.existencias),
    photo: catalogChoice(query.foto),
    selected: decodeSelection(text('sel'), store),
    focus: decodeKey(text('fila'), store),
  }
}

// A row key is `item|warehouse`; with a store chosen only the item travels.
function encodeKey(key, store) {
  return store && key.endsWith(`|${store}`)
    ? key.slice(0, -(store.length + 1))
    : key
}
function decodeKey(value, store) {
  if (!value) return ''
  return value.includes('|') || !store ? value : `${value}|${store}`
}
export function encodeSelection(keys, store) {
  return keys.map((key) => encodeKey(key, store)).join('~')
}
export function decodeSelection(value, store) {
  if (!value) return []
  return [
    ...new Set(
      value
        .split('~')
        .filter(Boolean)
        .map((part) => decodeKey(part, store)),
    ),
  ].slice(0, 100)
}
/** Selections longer than this stay in the tab (sessionStorage), not the URL. */
export const SELECTION_URL_MAX = 1500

/** The Muelle path of a route's fullPath (router base `/crm`). */
export function shellPath(fullPath) {
  const path = String(fullPath || '/productos')
  return path.startsWith('/crm/')
    ? path
    : `/crm${path.startsWith('/') ? '' : '/'}${path}`
}

/** This list, focused on `row` and without a consumed `done`: where Escáner
 *  and the record come back to. */
export function listReturn(fullPath, row, store = '') {
  const url = new URL(shellPath(fullPath), 'https://muelle.invalid')
  url.searchParams.delete('done')
  if (row?.key) url.searchParams.set('fila', encodeKey(row.key, store))
  return { to: url.pathname + url.search, label: 'Productos' }
}

/** The scroll position key of a list: its state without focus or done. */
export function scrollKey(fullPath) {
  const url = new URL(shellPath(fullPath), 'https://muelle.invalid')
  for (const key of ['fila', 'done', 'sel']) url.searchParams.delete(key)
  return `muelle:productos:scroll:${url.pathname}${url.search}`
}

/** Selected rows grouped by store: one count request per store. */
export function selectionGroups(rows) {
  const groups = new Map()
  for (const row of rows) {
    if (!row?.warehouse) continue
    const group = groups.get(row.warehouse) || {
      warehouse: row.warehouse,
      label: row.warehouse_label || row.warehouse,
      items: [],
    }
    if (!group.items.some((item) => item.name === row.name))
      group.items.push({ name: row.name, title: row.title || row.name })
    groups.set(row.warehouse, group)
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length)
}

/** Rows a count can be asked for: products in a store. */
export function selectable(row) {
  return Boolean(
    row && ['stock', 'conteo'].includes(row.kind) && row.name && row.warehouse,
  )
}

// What came back from Escáner (`done=<doctype>:<name>`), said plainly.
const DONE_TEXT = {
  Item: 'Product {0} updated.',
  'Taller Item Ubicacion': 'Bin assigned ({0}).',
  'Taller Bin Movement': 'Move saved ({0}).',
  'Mercado Cycle Count Task':
    'Count sent ({0}). The stock changes after the review.',
  'Scan Count': 'Count saved ({0}).',
  'Stock Reconciliation': 'Stock adjustment {0} saved.',
  'Purchase Receipt': 'Receipt {0} saved.',
  'Scan Task': 'Task {0} done.',
}
/** `{doctype, name, text}` of a hand-off that finished, or null. */
export function escanerDone(value) {
  if (typeof value !== 'string') return null
  const done = readDone(new URLSearchParams({ done: value }))
  if (!done) return null
  const text = DONE_TEXT[done.doctype]
  return {
    ...done,
    text: text
      ? tr(text, [done.name])
      : tr('{0} {1} saved.', [done.doctype, done.name]),
  }
}

/** «hace 3 días» style age of a date (YYYY-MM-DD…) against `today`. */
export function daysSince(value, today) {
  if (!value || !today) return null
  const start = Date.parse(String(value).slice(0, 10))
  const end = Date.parse(String(today).slice(0, 10))
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.round((end - start) / 86400000)
}

const SOURCE_TEXT = {
  conteo: 'cycle count',
  cajon: 'bin count',
  ajuste: 'stock adjustment',
}
/** «Counted 12 days ago (bin count)» / «Never counted». */
export function lastCountedLabel(last, today) {
  if (!last?.date) return tr('Never counted')
  const days = daysSince(last.date, today)
  const how = tr(SOURCE_TEXT[last.source] || last.source || '')
  if (days === 0) return tr('Counted today ({0})', [how])
  return tr('Counted {0} days ago ({1})', [days, how])
}

/** «Count asked of Ana · 2026-10-14» for the first open request on a row. */
export function requestedLabel(requested) {
  const first = (requested || [])[0]
  if (!first) return ''
  const more = requested.length > 1 ? ` (+${requested.length - 1})` : ''
  return (
    tr('Count asked of {0} · {1}', [
      first.assigned_to_name || first.assigned_to,
      first.assigned_date || '',
    ]) + more
  )
}

/** The header chips: share of stock without a bin / a recent count, and the
 *  other queues' sizes. */
export function healthChips(summary) {
  const views = summary?.views || {}
  const chips = []
  const pct = (view) =>
    views[view]?.pct !== undefined && views[view]?.pct !== null
      ? `${Number(views[view].pct).toLocaleString(undefined, { maximumFractionDigits: 1 })} %`
      : ''
  if (views['sin-cajon'])
    chips.push({
      view: 'sin-cajon',
      text: tr('{0} without a bin', [pct('sin-cajon')]),
    })
  if (views['sin-contar'])
    chips.push({
      view: 'sin-contar',
      text: tr('{0} not counted in {1} days', [
        pct('sin-contar'),
        summary.days,
      ]),
    })
  for (const [view, text] of [
    ['negativo', '{0} negative'],
    ['por-revisar', '{0} to review'],
    ['conteos-abiertos', '{0} open counts'],
  ])
    if (views[view])
      chips.push({
        view,
        text: tr(text, [
          `${views[view].count.toLocaleString()}${views[view].more ? '+' : ''}`,
        ]),
      })
  return chips
}

/** The row's actions: Escáner flows (with the way back to this row), the
 *  review that already exists, or a dialog of this page. */
export function rowActions(row, { back, caps = {} } = {}) {
  const scanner = Boolean(caps.scanner)
  const actions = []
  if (row.kind === 'stock') {
    const cajon = row.cajones?.[0]
    if (row.can_request_count)
      actions.push({ key: 'count', label: tr('Ask for a count of…') })
    else actions.push({ key: 'ask', label: tr('Ask the manager for a count') })
    if (scanner && !row.cajones?.length && row.actual_qty > 0)
      actions.push({
        key: 'assign',
        label: tr('Assign bin'),
        href: scannerItemUrl(row.name, {
          back,
          warehouse: row.warehouse,
          action: 'asignar',
        }),
      })
    if (scanner && cajon)
      actions.push({
        key: 'move',
        label: tr('Move'),
        href: scannerMoveUrl(
          { item: row.name, from: cajon.ubicacion, warehouse: row.warehouse },
          back,
        ),
      })
    if (scanner)
      actions.push({
        key: 'count-now',
        label: tr('Count now'),
        href: scannerItemUrl(row.name, {
          back,
          warehouse: row.warehouse,
          action: 'contar',
        }),
      })
  } else if (row.kind === 'conteo') {
    if (row.can_review && scanner)
      actions.push({
        key: 'review',
        label: tr('Review difference'),
        href: conteoReviewUrl(
          { task: row.task, warehouse: row.warehouse, row: row.row },
          back,
        ),
      })
    else
      actions.push({
        key: 'review',
        label: tr('Review difference'),
        disabled: true,
        reason: tr(
          'Differences are reviewed by whoever manages counts in {0}; the reviewer cannot be the counter.',
          [row.warehouse_label || row.warehouse],
        ),
      })
  } else if (row.kind === 'reconciliation') {
    actions.push({
      key: 'desk',
      label: tr('Open in Desk'),
      href: deskReconciliationUrl(row.name),
      external: true,
    })
  } else if (row.kind === 'task') {
    if (scanner)
      actions.push({
        key: 'open-task',
        label: tr('See in Escáner'),
        href: conteoReviewUrl(
          { task: row.task, warehouse: row.warehouse },
          back,
        ),
      })
    if (row.can_manage) actions.push({ key: 'reassign', label: tr('Reassign') })
  }
  return actions
}

/** Where «Back» goes: an allowed return_to, the list it came from, or Productos. */
export function backTarget(query) {
  const external = safeReturn(query?.return_to)
  if (external) return { href: external }
  const list = typeof query?.list === 'string' ? query.list : ''
  if (list.startsWith('/productos')) return { to: list }
  return { to: { name: 'Productos' } }
}

/** A Desk form opened this product to change a price: tell it the price is
 *  saved (same message Mercado sends), only to a same-origin Desk opener. */
export function notifyPriceOpener(query, user, item, win = window) {
  const token = query?.context
  if (
    typeof token !== 'string' ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(token) ||
    query.site !== win.location.host ||
    !user ||
    query.user !== user
  )
    return false
  try {
    const opener = win.opener
    if (
      !opener ||
      opener.closed ||
      opener.location.origin !== win.location.origin
    )
      return false
    if (!/^\/(?:app|doco)(?:\/|$)/.test(opener.location.pathname)) return false
    opener.postMessage(
      {
        type: 'mercado:price-return',
        token,
        item_code: item,
        site: win.location.host,
        user,
      },
      win.location.origin,
    )
    return true
  } catch {
    return false
  }
}

export const ACTIONS = Object.freeze(['precio', 'editar', 'conteo'])
export function requestedAction(query) {
  return ACTIONS.includes(query?.accion) ? query.accion : null
}

// ── catálogo: filters, layout, tiles and badges ──────────────────────────

/** «con» / «sin» for the existencias and foto filters; anything else is «all». */
export const CATALOG_CHOICES = Object.freeze(['con', 'sin'])
export function catalogChoice(value) {
  return CATALOG_CHOICES.includes(value) ? value : ''
}

/** The «Todos» filters for the service, from the list state. */
export function catalogArgs(state) {
  return {
    group: state?.group || '',
    stock: state?.stock || '',
    photo: state?.photo || '',
  }
}

/** The active catálogo filters as removable chips (`query`: what clears it). */
export function activeFilters(state) {
  const chips = []
  if (state?.group)
    chips.push({ key: 'grupo', label: state.group, query: { grupo: '' } })
  if (state?.stock)
    chips.push({
      key: 'existencias',
      label: state.stock === 'con' ? tr('With stock') : tr('Without stock'),
      query: { existencias: '' },
    })
  if (state?.photo)
    chips.push({
      key: 'foto',
      label: state.photo === 'con' ? tr('With photo') : tr('Without photo'),
      query: { foto: '' },
    })
  return chips
}

/** «Lista» (dense rows) or «Tarjetas» (a card grid), remembered per browser user. */
export const LAYOUTS = Object.freeze(['lista', 'tarjetas'])
export function layoutKey(user) {
  return `muelle:productos:layout:${user || ''}`
}
export function loadLayout(user, storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(layoutKey(user))
    return LAYOUTS.includes(value) ? value : 'lista'
  } catch {
    return 'lista'
  }
}
export function saveLayout(user, value, storage = globalThis.localStorage) {
  if (!LAYOUTS.includes(value)) return
  try {
    storage?.setItem(layoutKey(user), value)
  } catch {
    /* convenience only */
  }
}

/** Two letters for a product without a photo: the first two words' initials,
 *  or the first two characters of a single word. */
export function initials(title) {
  const words = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (!words.length) return '?'
  const pick =
    words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  return pick.toUpperCase()
}

// Whole class strings (Tailwind keeps only what it can read in the source).
export const TILE_TONES = Object.freeze([
  'bg-surface-blue-2 text-ink-blue-8',
  'bg-surface-green-2 text-ink-green-8',
  'bg-surface-amber-2 text-ink-amber-8',
  'bg-surface-violet-2 text-ink-violet-8',
  'bg-surface-gray-3 text-ink-gray-8',
])
/** A steady tone per product group (or code): the same group, the same colour. */
export function tileTone(key) {
  let hash = 0
  for (const char of String(key || ''))
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  return TILE_TONES[Math.abs(hash) % TILE_TONES.length]
}

/** The stock of a list row in words: «Agotado», «12 en stock», «Servicio,
 *  sin inventario»; null when the worker cannot read stock. */
export function stockBadge(row) {
  if (row?.stock_item === false)
    return { kind: 'service', text: tr('Service, no stock'), theme: 'gray' }
  const amount = row?.warehouse ? row.actual_qty : row?.stock?.qty
  if (
    amount === undefined ||
    amount === null ||
    (!row?.warehouse && !row?.stock)
  )
    return null
  const value = Number(amount)
  if (value < 0)
    return {
      kind: 'negative',
      text: tr('{0} in stock', [qty(value)]),
      theme: 'red',
    }
  if (value === 0) return { kind: 'out', text: tr('Sold out'), theme: 'red' }
  return {
    kind: 'in',
    text: tr('{0} in stock', [qty(value)]),
    theme: 'green',
  }
}

/** «hoy», «ayer», «hace 6 días», «hace 3 meses» and how fresh that is. */
export function relativeAge(value, today) {
  const days = daysSince(value, today)
  if (days === null) return { text: '', tone: 'never', days: null }
  const tone =
    days <= 7 ? 'fresh' : days <= 30 ? 'recent' : days <= 90 ? 'old' : 'stale'
  let text
  if (days <= 0) text = tr('today')
  else if (days === 1) text = tr('yesterday')
  else if (days < 31) text = tr('{0} days ago', [days])
  else if (days < 365) {
    const months = Math.max(1, Math.round(days / 30))
    text = months === 1 ? tr('a month ago') : tr('{0} months ago', [months])
  } else {
    const years = Math.max(1, Math.round(days / 365))
    text = years === 1 ? tr('a year ago') : tr('{0} years ago', [years])
  }
  return { text, tone, days }
}
export const AGE_CLASS = Object.freeze({
  fresh: 'text-ink-green-7',
  recent: 'text-ink-gray-7',
  old: 'text-ink-amber-7',
  stale: 'text-ink-red-7',
  never: 'text-ink-gray-5',
})

/** A price list row's status chip. */
export function priceStatus(row) {
  const status =
    row?.status ||
    (row?.rate === null || row?.rate === undefined ? 'sin-precio' : 'vigente')
  return (
    {
      'sin-precio': { text: tr('No price', null, CTX), theme: 'gray' },
      'por-revisar': {
        text: tr('Price to review', null, CTX),
        theme: 'orange',
      },
      vence: { text: tr('Ends soon'), theme: 'orange' },
      vigente: { text: tr('Current'), theme: 'green' },
    }[status] || { text: status, theme: 'gray' }
  )
}

/** What kind of product it is: service, plain stock, by serial or by batch. */
export function productKind(item) {
  if (!item) return null
  if (!Number(item.is_stock_item))
    return { kind: 'service', text: tr('Service, no stock') }
  if (Number(item.has_serial_no))
    return { kind: 'serial', text: tr('Stocked, by serial number') }
  if (Number(item.has_batch_no))
    return { kind: 'batch', text: tr('Stocked, by batch') }
  return { kind: 'stock', text: tr('Stocked') }
}

/** «Todos» filtered by a group, from the product page's group path. */
export function groupRoute(group) {
  return { name: 'Productos', query: group ? { grupo: group } : {} }
}
